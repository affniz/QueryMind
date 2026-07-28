import io
from sqlalchemy import text
from tests.utils import upload_csv_helper

def test_upload_valid_csv(client, auth_headers):
    data = upload_csv_helper(client, auth_headers, b"name,age\nAlice,30\nBob,25", "test.csv")
    assert data["name"] == "test.csv"
    assert data["row_count"] == 2
    assert "id" in data
    assert "uploaded_at" in data
    assert "table_name" in data
    assert data["table_name"].startswith("u")  # e.g. u1_ds1_test

def test_upload_invalid_csv(client,auth_headers):
    content=b"test"
    file={"file":("test.txt",io.BytesIO(content),"text/plain")}
    response=client.post("/datasets/upload",files=file,headers=auth_headers)
    assert response.status_code==400

def test_get_dataset(client, auth_headers):
    data = upload_csv_helper(client, auth_headers, b"name,age\nAlice,30\nBob,25", "test.csv")
    dataset_id = data["id"]

    resp = client.get(f"/datasets/{dataset_id}", headers=auth_headers)
    assert resp.status_code == 200
    vals = resp.json()
    assert vals["name"] == "test.csv"
    assert vals["row_count"] == 2
    assert vals["id"] == dataset_id
    assert vals["uploaded_at"] == data["uploaded_at"]

def test_delete_dataset(client, auth_headers, db_engine):
    data = upload_csv_helper(client, auth_headers, b"name,age\nAlice,30\nBob,25", "test.csv")
    dataset_id = data["id"]
    table_name = data["table_name"]

    res = client.delete(f"/datasets/{dataset_id}", headers=auth_headers)
    assert res.status_code == 200

    del_check = client.get(f"/datasets/{dataset_id}", headers=auth_headers)
    assert del_check.status_code == 404

    # Verify the dynamic table was actually dropped from Postgres
    with db_engine.connect() as conn:
        exists = conn.execute(text(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = :t)"
        ), {"t": table_name}).scalar()
    assert exists is False
