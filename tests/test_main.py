import io
import pytest
from unittest.mock import MagicMock,patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from testcontainers.postgres import PostgresContainer
from app.main import app
from app.database import Base, get_db

@pytest.fixture(scope="session")
def postgres():
    with PostgresContainer("postgres:16") as pg:
        yield pg

@pytest.fixture(scope="session")
def db_engine(postgres):
    url = postgres.get_connection_url().replace(
        "postgresql+psycopg2://",
        "postgresql+psycopg://",
        1,
    )
    engine = create_engine(url)
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()

@pytest.fixture
def client(db_engine):
    TestingSession = sessionmaker(bind=db_engine, autocommit=False, autoflush=False)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

@pytest.fixture
def auth_headers(client):
    client.post("/auth/register", json={
        "email": "test@example.com",
        "password": "testpassword"
    })
    response = client.post("/auth/login", data={
        "username": "test@example.com",
        "password": "testpassword"
    })
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_register(client):
    response = client.post("/auth/register", json={
        "email": "new@example.com",
        "password": "password123"
    })
    assert response.status_code == 201
    assert response.json()["email"] == "new@example.com"
    assert "id" in response.json()

def test_login(client):
    client.post("/auth/register", json={
        "email": "login@example.com",
        "password": "password123"
    })
    response = client.post("/auth/login", data={
        "username": "login@example.com",
        "password": "password123"
    })
    assert response.status_code == 200
    assert "access_token" in response.json()
    assert response.json()["token_type"] == "bearer"

def test_upload_valid_csv(client,auth_headers):
    csv_content=b"name,age\nAlice,30\nBob,25"
    file={"file":("test.csv",io.BytesIO(csv_content),"text/csv")}
    response=client.post("/datasets/upload",files=file,headers=auth_headers)
    assert response.status_code==200
    data=response.json()
    assert data["name"]=="test.csv"
    assert data["row_count"]==2
    assert "id" in data
    assert "uploaded_at" in data

def test_upload_invalid_csv(client,auth_headers):
    content=b"test"
    file={"file":("test.txt",io.BytesIO(content),"text/plain")}
    response=client.post("/datasets/upload",files=file,headers=auth_headers)
    assert response.status_code==400

def test_get_dataset(client,auth_headers):
    csv_content=b"name,age\nAlice,30\nBob,25"
    file={"file":("test.csv",io.BytesIO(csv_content),"text/csv")}
    response=client.post("/datasets/upload",files=file,headers=auth_headers)
    assert response.status_code==200
    data=response.json()
    dataset_id = data["id"]
    resp=client.get(f"/datasets/{dataset_id}",headers=auth_headers)
    assert resp.status_code==200
    vals=resp.json()
    assert vals["name"]=="test.csv"
    assert vals["row_count"]==2
    assert vals["id"]==dataset_id
    assert vals["uploaded_at"] == data["uploaded_at"]

def test_delete_dataset(client,auth_headers):
    csv_content=b"name,age\nAlice,30\nBob,25"
    file={"file":("test.csv",io.BytesIO(csv_content),"text/csv")}
    response=client.post("/datasets/upload",files=file,headers=auth_headers)
    assert response.status_code==200
    data=response.json()
    dataset_id=data["id"]
    res=client.delete(f"/datasets/{dataset_id}",headers=auth_headers)
    assert res.status_code == 200
    del_check=client.get(f"/datasets/{dataset_id}",headers=auth_headers)
    assert del_check.status_code==404

def test_ask(client,auth_headers):
    csv_content = b"name,age\nAlice,30\nBob,25"
    file = {"file": ("test.csv", io.BytesIO(csv_content), "text/csv")}
    response = client.post("/datasets/upload", files=file,headers=auth_headers)
    assert response.status_code == 200
    dataset_id = response.json()["id"]

    sql_mock = MagicMock()
    sql_mock.choices[0].message.content = "SELECT data->>'name' AS name FROM records WHERE dataset_id=1"
    answer_mock = MagicMock()
    answer_mock.choices[0].message.content = "The names are Alice and Bob."

    with patch("app.routers.ask.client") as mock_client:
        mock_client.chat.completions.create.side_effect = [sql_mock, answer_mock]
        question = "What are the names in the column 'name'"
        res = client.post(f"/datasets/{dataset_id}/ask", json={"question": question},headers=auth_headers)

    assert res.status_code == 200
    ans = res.json()
    assert ans["question"] == question
    assert ans["sql_query"] == "SELECT data->>'name' AS name FROM records WHERE dataset_id=1"
    assert ans["answer"] == "The names are Alice and Bob."
    assert ans["row_count"] == 2

def test_root(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"Message": "Data Insight API is running"}