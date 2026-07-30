import io
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from testcontainers.postgres import PostgresContainer
from app.main import app
from app.database import Base, get_db, get_readonly_db


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

    with engine.begin() as conn:
        conn.execute(text("""
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'readonly_user') THEN
                CREATE ROLE readonly_user WITH LOGIN PASSWORD 'readonly_password';
              END IF;
            END
            $$;
        """))
        conn.execute(text("GRANT USAGE ON SCHEMA public TO readonly_user;"))
        conn.execute(text("GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;"))
        conn.execute(text("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly_user;"))

    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(scope="session")
def readonly_engine(postgres):
    url = postgres.get_connection_url().replace(
        "postgresql+psycopg2://",
        "postgresql+psycopg://",
        1,
    )
    url = url.replace("test:test@", "readonly_user:readonly_password@")
    engine = create_engine(url)
    yield engine
    engine.dispose()


@pytest.fixture
def client(db_engine, readonly_engine):
    TestingSession = sessionmaker(bind=db_engine, autocommit=False, autoflush=False)
    ReadOnlyTestingSession = sessionmaker(bind=readonly_engine, autocommit=False, autoflush=False)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    def override_get_readonly_db():
        db = ReadOnlyTestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_readonly_db] = override_get_readonly_db
    with patch("app.routers.datasets.engine", db_engine):
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


@pytest.fixture
def second_auth_headers(client):
    client.post("/auth/register", json={"email": "other@example.com", "password": "otherpassword"})
    response = client.post("/auth/login", data={"username": "other@example.com", "password": "otherpassword"})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
