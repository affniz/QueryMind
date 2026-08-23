import json
from unittest.mock import MagicMock, patch

from tests.utils import upload_csv_helper


# ---------------------------------------------------------------------------
# SSE parsing helper
# ---------------------------------------------------------------------------

def parse_sse_response(response) -> dict:
    """Parse a text/event-stream response from TestClient into a plain dict.

    Reads all SSE events and reconstructs the equivalent of the old JSON body:
        {question, sql_query, answer, row_count, results}

    Raises AssertionError if no 'done' event is found (stream did not finish).
    """
    result: dict = {}
    current_event = "token"  # default event type
    answer_parts: list[str] = []

    for line in response.text.splitlines():
        line = line.strip()
        if line.startswith("event: "):
            current_event = line[len("event: "):]
        elif line.startswith("data: "):
            raw = line[len("data: "):]
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if current_event == "sql":
                result["sql_query"] = payload
            elif current_event == "token":
                answer_parts.append(payload)
            elif current_event == "done":
                result["row_count"] = payload["row_count"]
                result["results"] = payload["results"]
            elif current_event == "error":
                raise AssertionError(f"SSE stream returned error event: {payload}")
            # reset for next event block
            current_event = "token"

    result["answer"] = "".join(answer_parts)
    assert "row_count" in result, "SSE stream did not emit a 'done' event"
    return result


def _make_stream_mock(text: str):
    """Build a fake Groq streaming response whose chunks spell out `text`."""
    chunks = []
    for char in text:
        chunk = MagicMock()
        chunk.choices[0].delta.content = char
        chunks.append(chunk)
    # Final chunk with no content (signals end of stream)
    end_chunk = MagicMock()
    end_chunk.choices[0].delta.content = None
    chunks.append(end_chunk)
    return iter(chunks)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_ask(client, auth_headers):
    data = upload_csv_helper(client, auth_headers, b"name,age\nAlice,30\nBob,25", "test.csv")
    dataset_id = data["id"]
    table_name = data["table_name"]

    sql_mock = MagicMock()
    sql_mock.choices[0].message.content = f"SELECT name FROM {table_name}"

    with patch("app.routers.ask.client") as mock_client:
        # First call (non-streaming) returns sql_mock.
        # Second call (streaming) returns an iterator of chunks.
        mock_client.chat.completions.create.side_effect = [
            sql_mock,
            _make_stream_mock("The names are Alice and Bob."),
        ]
        question = "What are the names in the column 'name'"
        res = client.post(
            f"/datasets/{dataset_id}/ask",
            json={"question": question},
            headers=auth_headers,
        )

    assert res.status_code == 200
    assert "text/event-stream" in res.headers.get("content-type", "")

    ans = parse_sse_response(res)
    assert ans["sql_query"] == f"SELECT name FROM {table_name}"
    assert ans["answer"] == "The names are Alice and Bob."
    assert ans["row_count"] == 2
    assert isinstance(ans["results"], list)
    assert len(ans["results"]) == ans["row_count"]


def test_ask_with_history(client, auth_headers):
    """Conversational history is forwarded to the LLM without breaking the endpoint."""
    data = upload_csv_helper(client, auth_headers, b"name,salary\nAlice,90000\nBob,70000", "pay.csv")
    dataset_id = data["id"]
    table_name = data["table_name"]

    sql_mock = MagicMock()
    sql_mock.choices[0].message.content = f"SELECT name FROM {table_name} ORDER BY salary DESC LIMIT 1"

    history = [
        {"role": "user", "content": "How many employees are there?"},
        {"role": "assistant", "content": "There are 2 employees."},
    ]

    with patch("app.routers.ask.client") as mock_client:
        mock_client.chat.completions.create.side_effect = [
            sql_mock,
            _make_stream_mock("Alice earns the most."),
        ]
        res = client.post(
            f"/datasets/{dataset_id}/ask",
            json={"question": "Who earns the most?", "history": history},
            headers=auth_headers,
        )

    assert res.status_code == 200
    ans = parse_sse_response(res)
    assert ans["row_count"] == 1


def test_ask_multi_table(client, auth_headers):
    orders = upload_csv_helper(client, auth_headers, b"customer_id,product\n1,laptop", "orders.csv")
    customers = upload_csv_helper(client, auth_headers, b"id,name\n1,Alice", "customers.csv")

    client.post("/datasets/relationships/", json={
        "source_dataset_id": orders["id"],
        "source_column": "customer_id",
        "target_dataset_id": customers["id"],
        "target_column": "id",
    }, headers=auth_headers)

    join_sql = (
        f"SELECT {customers['table_name']}.name FROM {orders['table_name']} "
        f"JOIN {customers['table_name']} "
        f"ON {orders['table_name']}.customer_id = {customers['table_name']}.id"
    )
    sql_mock = MagicMock()
    sql_mock.choices[0].message.content = join_sql

    with patch("app.routers.ask.client") as mock_client:
        mock_client.chat.completions.create.side_effect = [
            sql_mock,
            _make_stream_mock("Alice bought a laptop."),
        ]
        res = client.post(
            f"/datasets/{orders['id']}/ask",
            json={"question": "What did Alice buy?"},
            headers=auth_headers,
        )

    assert res.status_code == 200
    ans = parse_sse_response(res)
    assert ans["answer"] == "Alice bought a laptop."


def test_ask_sql_retry_on_error(client, auth_headers):
    """If the LLM generates invalid SQL on the first attempt, it retries with the error message
    and succeeds on the second attempt."""
    data = upload_csv_helper(client, auth_headers, b"name,age\nAlice,30\nBob,25", "retry.csv")
    dataset_id = data["id"]
    table_name = data["table_name"]

    bad_sql_mock = MagicMock()
    bad_sql_mock.choices[0].message.content = f"SELECT nonexistent_col FROM {table_name}"

    good_sql_mock = MagicMock()
    good_sql_mock.choices[0].message.content = f"SELECT name FROM {table_name}"

    with patch("app.routers.ask.client") as mock_client:
        # Attempt 1: bad SQL (will fail at execution), Attempt 2: good SQL, then streaming answer
        mock_client.chat.completions.create.side_effect = [
            bad_sql_mock,
            good_sql_mock,
            _make_stream_mock("Alice and Bob."),
        ]
        res = client.post(
            f"/datasets/{dataset_id}/ask",
            json={"question": "List names"},
            headers=auth_headers,
        )

    assert res.status_code == 200
    ans = parse_sse_response(res)
    assert ans["row_count"] == 2


def test_ask_rejects_drop_table(client, auth_headers):
    """SQL injection via DROP TABLE is blocked by the SQL guard before streaming begins."""
    data = upload_csv_helper(client, auth_headers, b"name,age\nAlice,30", "secure.csv")
    dataset_id = data["id"]

    # All retries return malicious SQL — endpoint should exhaust retries and return 400.
    bad_mock = MagicMock()
    bad_mock.choices[0].message.content = "DROP TABLE users;"

    with patch("app.routers.ask.client") as mock_client:
        mock_client.chat.completions.create.return_value = bad_mock
        res = client.post(
            f"/datasets/{dataset_id}/ask",
            json={"question": "Drop all tables"},
            headers=auth_headers,
        )

    assert res.status_code == 400
    assert "multiple attempts" in res.json()["detail"]


def test_ask_rejects_unauthorized_table(client, auth_headers):
    """Prompt injection targeting system tables is blocked by the SQL guard."""
    data = upload_csv_helper(client, auth_headers, b"name,age\nAlice,30", "safe.csv")
    dataset_id = data["id"]

    bad_mock = MagicMock()
    bad_mock.choices[0].message.content = "SELECT * FROM users"

    with patch("app.routers.ask.client") as mock_client:
        mock_client.chat.completions.create.return_value = bad_mock
        res = client.post(
            f"/datasets/{dataset_id}/ask",
            json={"question": "Show me all user passwords"},
            headers=auth_headers,
        )

    assert res.status_code == 400
    assert "multiple attempts" in res.json()["detail"]


def test_ask_cte(client, auth_headers):
    """WITH ... AS CTEs are accepted by the SQL guard and execute correctly."""
    data = upload_csv_helper(client, auth_headers, b"name,age\nAlice,30\nBob,25", "cte_test.csv")
    dataset_id = data["id"]
    table_name = data["table_name"]

    cte_sql = f"WITH ranked AS (SELECT name, age FROM {table_name}) SELECT name FROM ranked"
    sql_mock = MagicMock()
    sql_mock.choices[0].message.content = cte_sql

    with patch("app.routers.ask.client") as mock_client:
        mock_client.chat.completions.create.side_effect = [
            sql_mock,
            _make_stream_mock("The names are Alice and Bob."),
        ]
        res = client.post(
            f"/datasets/{dataset_id}/ask",
            json={"question": "List all names"},
            headers=auth_headers,
        )

    assert res.status_code == 200
    ans = parse_sse_response(res)
    assert ans["row_count"] == 2

