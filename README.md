# QueryMind

A FastAPI backend that lets you upload a CSV and ask plain-English questions about your data. QueryMind uses a large language model to convert natural language into SQL, executes the query against your data, and returns a plain-English answer — no SQL knowledge required.

## How it works

1. Register and log in to get a JWT token
2. Upload a CSV file via the API
3. Ask a question in plain English
4. QueryMind generates a SQL query using an LLM, executes it against your data, and returns a plain-English answer alongside the generated SQL

## Tech stack

- **FastAPI** — API framework
- **PostgreSQL** — data storage (with dynamic table creation)
- **SQLAlchemy 2.0** — ORM and query execution
- **Groq (LLaMA 3.3 70B)** — LLM for Text-to-SQL and answer generation
- **Redis** — response caching
- **Pandas** — CSV parsing
- **Pydantic** — request/response validation
- **psycopg** — PostgreSQL driver
- **python-jose** — JWT token creation and verification
- **passlib + bcrypt** — password hashing
- **pytest + testcontainers** — testing against a real PostgreSQL instance
- **GitHub Actions** — CI pipeline

## Getting started

### Prerequisites

- Python 3.10+
- PostgreSQL running locally
- Groq API key (free at console.groq.com)

### Setup

```bash
git clone https://github.com/affniz/QueryMind.git
cd QueryMind
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

For local development and running tests, also install dev dependencies:

```bash
pip install -r requirements-dev.txt
```

### Environment variables

Create a `.env` file in the root directory:

```
DATABASE_URL=postgresql+psycopg://your_username:your_password@localhost/your_db_name
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=your_db_name
GROQ_API_KEY=your_groq_api_key_here
REDIS_URL=redis://redis:6379
SECRET_KEY=your_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

> **Note:** `DATABASE_URL` uses `localhost` for local development. When running via Docker, the URL is built automatically by `docker-compose.yml` using `DB_USER`, `DB_PASSWORD`, and `DB_NAME` — you do not need to change it.

### Run

```bash
alembic upgrade head
uvicorn app.main:app --reload
```

Visit `http://127.0.0.1:8000/docs` for interactive API documentation.

## Docker Setup

### Prerequisites
- Docker
- Docker Compose

### Steps

### 1. Clone the repository
```bash
git clone https://github.com/affniz/QueryMind.git
cd QueryMind
```

### 2. Create a `.env` file in the project root

```
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=your_db_name
GROQ_API_KEY=your_groq_api_key_here
REDIS_URL=redis://redis:6379
SECRET_KEY=your_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

> **Note:** No `DATABASE_URL` needed here — Docker Compose builds it automatically from the variables above.

### 3. Build & start the containers
```bash
docker-compose up --build
```
The API will be available at http://localhost:8000
Swagger UI: http://localhost:8000/docs

### 4. Stop the app
```bash
docker-compose down
```

### 5. Reset the database (optional)
```bash
docker-compose down -v
```

## API endpoints

All `/datasets/` endpoints require an `Authorization: Bearer <token>` header.

| Method | Endpoint | Auth required | Description |
|--------|----------|:---:|-------------|
| `POST` | `/auth/register` | ❌ | Register a new user |
| `POST` | `/auth/login` | ❌ | Log in and receive a JWT token |
| `POST` | `/datasets/upload` | ✅ | Upload a CSV file |
| `GET` | `/datasets` | ✅ | List your uploaded datasets |
| `GET` | `/datasets/{id}` | ✅ | Get dataset metadata |
| `DELETE` | `/datasets/{id}` | ✅ | Delete a dataset and its records |
| `POST` | `/datasets/relationships/` | ✅ | Define a relationship between two datasets |
| `GET` | `/datasets/relationships/` | ✅ | List all defined relationships |
| `POST` | `/datasets/relationships/auto-detect` | ✅ | Auto-detect relationships between uploaded datasets |
| `DELETE`| `/datasets/relationships/{id}` | ✅ | Delete a defined relationship |
| `POST` | `/datasets/{id}/ask` | ✅ | Ask a plain-English question (supports cross-table queries via relationships) |

## Example

### Register and log in

```bash
# Register
curl -X POST "http://localhost:8000/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "yourpassword"}'

# Log in — copy the access_token from the response
curl -X POST "http://localhost:8000/auth/login" \
  -d "username=you@example.com&password=yourpassword"
```

Response:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiJ9...",
  "token_type": "bearer"
}
```

### Upload a CSV

```bash
curl -X POST "http://localhost:8000/datasets/upload" \
  -H "Authorization: Bearer <your_token>" \
  -F "file=@sales.csv"
```

Response:

```json
{
  "id": 1,
  "name": "sales.csv",
  "row_count": 10,
  "columns": {
    "region": "str",
    "product": "str",
    "revenue": "int64",
    "quantity": "int64",
    "date": "str"
  },
  "uploaded_at": "2026-07-09T10:30:00"
}
```

### Ask a question

```bash
curl -X POST "http://localhost:8000/datasets/1/ask" \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{"question": "which region had the highest revenue?"}'
```

Response:

```json
{
  "question": "which region had the highest revenue?",
  "sql_query": "SELECT region FROM u1_ds1_sales ORDER BY revenue DESC LIMIT 1",
  "answer": "The North region had the highest revenue with $120,000.",
  "row_count": 1
}
```

## Error handling

- Invalid file type → `HTTP_400_BAD_REQUEST`
- Empty or malformed CSV → `HTTP_400_BAD_REQUEST`
- Invalid dataset ID → `HTTP_404_NOT_FOUND`
- Accessing another user's dataset → `HTTP_404_NOT_FOUND`
- Question irrelevant to dataset → `HTTP_400_BAD_REQUEST`
- Generated SQL fails to execute → `HTTP_400_BAD_REQUEST`
- Missing or invalid token → `HTTP_401_UNAUTHORIZED`

## Testing

Tests use pytest and testcontainers to spin up a real throwaway PostgreSQL instance — no manual database setup required. Docker must be running.

```bash
pytest -v
```

The test suite covers:
- Root endpoint
- User registration and login
- JWT-protected route enforcement
- CSV upload (valid and invalid)
- Dataset retrieval and deletion (with cascade to relationships)
- Defining, listing, and deleting relationships
- Auto-detecting relationships across datasets
- Plain-English question answering (with mocked LLM, including multi-table JOINs)

## CI/CD

A GitHub Actions workflow runs the full test suite automatically on every push and pull request to `main`. The workflow:

1. Spins up an `ubuntu-latest` runner (Docker pre-installed)
2. Installs all dependencies
3. Runs `pytest` against a testcontainers-managed PostgreSQL instance

## Planned features

- **v2** ✅ — JWT authentication, per-user dataset isolation
- **v3** ✅ — Multi-table support with dynamic DDL and relationship inference
- **v4** — Async endpoints for improved performance
