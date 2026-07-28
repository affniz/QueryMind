from tests.utils import upload_csv_helper

def test_create_relationship(client, auth_headers):
    orders = upload_csv_helper(client, auth_headers, b"customer_id,product\n1,laptop\n2,phone", "orders.csv")
    customers = upload_csv_helper(client, auth_headers, b"id,name\n1,Alice\n2,Bob", "customers.csv")

    res = client.post("/datasets/relationships/", json={
        "source_dataset_id": orders["id"],
        "source_column": "customer_id",
        "target_dataset_id": customers["id"],
        "target_column": "id"
    }, headers=auth_headers)

    assert res.status_code == 201
    data = res.json()
    assert data["source_column"] == "customer_id"
    assert data["target_column"] == "id"
    assert "id" in data

def test_create_relationship_invalid_column(client, auth_headers):
    orders = upload_csv_helper(client, auth_headers, b"customer_id,product\n1,laptop", "orders.csv")
    customers = upload_csv_helper(client, auth_headers, b"id,name\n1,Alice", "customers.csv")

    res = client.post("/datasets/relationships/", json={
        "source_dataset_id": orders["id"],
        "source_column": "nonexistent_col",
        "target_dataset_id": customers["id"],
        "target_column": "id"
    }, headers=auth_headers)

    assert res.status_code == 400

def test_create_relationship_wrong_user(client, auth_headers, second_auth_headers):
    orders = upload_csv_helper(client, auth_headers, b"customer_id,product\n1,laptop", "orders.csv")
    customers = upload_csv_helper(client, second_auth_headers, b"id,name\n1,Alice", "customers.csv")

    res = client.post("/datasets/relationships/", json={
        "source_dataset_id": orders["id"],
        "source_column": "customer_id",
        "target_dataset_id": customers["id"],
        "target_column": "id"
    }, headers=auth_headers)

    assert res.status_code == 404

def test_list_relationships(client, auth_headers):
    orders = upload_csv_helper(client, auth_headers, b"customer_id,product\n1,laptop", "orders.csv")
    customers = upload_csv_helper(client, auth_headers, b"id,name\n1,Alice", "customers.csv")

    client.post("/datasets/relationships/", json={
        "source_dataset_id": orders["id"],
        "source_column": "customer_id",
        "target_dataset_id": customers["id"],
        "target_column": "id"
    }, headers=auth_headers)

    res = client.get("/datasets/relationships/", headers=auth_headers)
    assert res.status_code == 200
    assert len(res.json()) >= 1

def test_delete_relationship(client, auth_headers):
    orders = upload_csv_helper(client, auth_headers, b"customer_id,product\n1,laptop", "orders.csv")
    customers = upload_csv_helper(client, auth_headers, b"id,name\n1,Alice", "customers.csv")

    create_res = client.post("/datasets/relationships/", json={
        "source_dataset_id": orders["id"],
        "source_column": "customer_id",
        "target_dataset_id": customers["id"],
        "target_column": "id"
    }, headers=auth_headers)
    rel_id = create_res.json()["id"]

    del_res = client.delete(f"/datasets/relationships/{rel_id}", headers=auth_headers)
    assert del_res.status_code == 200

    list_res = client.get("/datasets/relationships/", headers=auth_headers)
    assert all(r["id"] != rel_id for r in list_res.json())

def test_delete_dataset_cascades_relationships(client, auth_headers):
    orders = upload_csv_helper(client, auth_headers, b"customer_id,product\n1,laptop", "orders.csv")
    customers = upload_csv_helper(client, auth_headers, b"id,name\n1,Alice", "customers.csv")

    client.post("/datasets/relationships/", json={
        "source_dataset_id": orders["id"],
        "source_column": "customer_id",
        "target_dataset_id": customers["id"],
        "target_column": "id"
    }, headers=auth_headers)

    client.delete(f"/datasets/{orders['id']}", headers=auth_headers)

    res = client.get("/datasets/relationships/", headers=auth_headers)
    assert all(r["source_dataset_id"] != orders["id"] for r in res.json())

def test_auto_detect_relationships(client, auth_headers):
    upload_csv_helper(client, auth_headers, b"customer_id,product\n1,laptop", "orders.csv")
    upload_csv_helper(client, auth_headers, b"id,name\n1,Alice", "customers.csv")

    res = client.post("/datasets/relationships/auto-detect", headers=auth_headers)
    assert res.status_code == 200
    suggestions = res.json()
    high = [s for s in suggestions if s["confidence"] == "high"]
    assert len(high) >= 1
    assert high[0]["source_column"] == "customer_id"
    assert high[0]["target_column"] == "id"

def test_auto_detect_no_matches(client):
    client.post("/auth/register", json={"email": "fresh@example.com", "password": "password"})
    res = client.post("/auth/login", data={"username": "fresh@example.com", "password": "password"})
    fresh_headers = {"Authorization": f"Bearer {res.json()['access_token']}"}

    upload_csv_helper(client, fresh_headers, b"foo,bar\n1,2", "tableA.csv")
    upload_csv_helper(client, fresh_headers, b"baz,qux\n3,4", "tableB.csv")

    res = client.post("/datasets/relationships/auto-detect", headers=fresh_headers)
    assert res.status_code == 200
    high = [s for s in res.json() if s["confidence"] == "high"]
    assert len(high) == 0
