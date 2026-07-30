from unittest.mock import MagicMock, patch
from tests.utils import upload_csv_helper


def test_ask(client, auth_headers):
    data = upload_csv_helper(client, auth_headers, b"name,age\nAlice,30\nBob,25", "test.csv")
    dataset_id = data["id"]
    table_name = data["table_name"]

    sql_mock = MagicMock()
    sql_mock.choices[0].message.content = f"SELECT name FROM {table_name}"
    answer_mock = MagicMock()
    answer_mock.choices[0].message.content = "The names are Alice and Bob."

    with patch("app.routers.ask.client") as mock_client:
        mock_client.chat.completions.create.side_effect = [sql_mock, answer_mock]
        question = "What are the names in the column 'name'"
        res = client.post(f"/datasets/{dataset_id}/ask", json={"question": question}, headers=auth_headers)

    assert res.status_code == 200
    ans = res.json()
    assert ans["question"] == question
    assert ans["sql_query"] == f"SELECT name FROM {table_name}"
    assert ans["answer"] == "The names are Alice and Bob."
    assert ans["row_count"] == 2


def test_ask_multi_table(client, auth_headers):
    orders = upload_csv_helper(client, auth_headers, b"customer_id,product\n1,laptop", "orders.csv")
    customers = upload_csv_helper(client, auth_headers, b"id,name\n1,Alice", "customers.csv")

    client.post("/datasets/relationships/", json={
        "source_dataset_id": orders["id"],
        "source_column": "customer_id",
        "target_dataset_id": customers["id"],
        "target_column": "id"
    }, headers=auth_headers)

    join_sql = (
        f"SELECT {customers['table_name']}.name FROM {orders['table_name']} "
        f"JOIN {customers['table_name']} "
        f"ON {orders['table_name']}.customer_id = {customers['table_name']}.id"
    )
    sql_mock = MagicMock()
    sql_mock.choices[0].message.content = join_sql
    answer_mock = MagicMock()
    answer_mock.choices[0].message.content = "Alice bought a laptop."

    with patch("app.routers.ask.client") as mock_client:
        mock_client.chat.completions.create.side_effect = [sql_mock, answer_mock]
        res = client.post(f"/datasets/{orders['id']}/ask",
                          json={"question": "What did Alice buy?"},
                          headers=auth_headers)

    assert res.status_code == 200
    assert res.json()["answer"] == "Alice bought a laptop."


def test_ask_rejects_drop_table(client, auth_headers):
    data = upload_csv_helper(client, auth_headers, b"name,age\nAlice,30", "secure.csv")
    dataset_id = data["id"]

    sql_mock = MagicMock()
    sql_mock.choices[0].message.content = "DROP TABLE users;"

    with patch("app.routers.ask.client") as mock_client:
        mock_client.chat.completions.create.return_value = sql_mock
        res = client.post(f"/datasets/{dataset_id}/ask",
                          json={"question": "Drop all tables"},
                          headers=auth_headers)

    assert res.status_code == 400
    assert "safety validation" in res.json()["detail"]


def test_ask_rejects_unauthorized_table(client, auth_headers):
    data = upload_csv_helper(client, auth_headers, b"name,age\nAlice,30", "safe.csv")
    dataset_id = data["id"]

    sql_mock = MagicMock()
    sql_mock.choices[0].message.content = "SELECT * FROM users"

    with patch("app.routers.ask.client") as mock_client:
        mock_client.chat.completions.create.return_value = sql_mock
        res = client.post(f"/datasets/{dataset_id}/ask",
                          json={"question": "Show me all user passwords"},
                          headers=auth_headers)

    assert res.status_code == 400
    assert "unauthorized tables" in res.json()["detail"]
