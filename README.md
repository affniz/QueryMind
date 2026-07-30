# QueryMind

A FastAPI backend that lets you upload CSVs and ask plain-English questions about your data. QueryMind uses a large language model to convert natural language into SQL, executes the query safely against your data, and returns a plain-English answer — no SQL knowledge required.

## How it works

1. Register and log in to get a JWT token
2. Upload one or more CSV files via the API
3. Optionally define (or auto-detect) relationships between datasets
4. Ask a question in plain English — QueryMind generates SQL, validates it for safety, executes it against your data using a read-only connection, and returns a plain-English answer alongside the generated SQL

## Tech stack

- **FastAPI** — API framework
- **PostgreSQL** — data storage (with dynamic table creation per dataset)
- **SQLAlchemy 2.0** — ORM and query execution
- **psycopg** — PostgreSQL driver (used for high-speed bulk COPY ingestion)
- **Groq (LLaMA 3.3 70B)** — LLM for Text-to-SQL and answer generation
- **sqlparse** — SQL safety validation (allowlist + statement-type enforcement)
- **Redis** — response caching (24-hour TTL per user/dataset/question)
- **Alembic** — database migrations (including automated role provisioning)
- **Pandas** — CSV parsing
- **Pydantic** — request/response validation
- **python-jose** — JWT token creation and verification
- **passlib + bcrypt** — password hashing
- **pytest + testcontainers** — testing against a real PostgreSQL instance
- **GitHub Actions** — CI pipeline

## Security

QueryMind applies two independent layers of protection against SQL injection attacks, including AI-driven prompt injection:

1. **SQL Guard (`sqlparse`)** — Before any query reaches the database, it is parsed and validated:
   - Only `SELECT` statements are permitted; `DROP`, `DELETE`, `INSERT`, `UPDATE`, etc. are blocked
   - Multi-statement attacks (e.g. `SELECT ...; DROP TABLE ...`) are rejected
   - All referenced tables are extracted from the AST and checked against an allowlist of the user's own datasets — system tables such as `users` are inaccessible

2. **Read-only database connection** — All LLM-generated queries execute through a dedicated `readonly_user` PostgreSQL role provisioned automatically via Alembic migration. Even if a query somehow bypassed the guard, the database role itself has no write permissions and no access to system tables.

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
READONLY_DATABASE_URL=postgresql+psycopg://readonly_user:readonly_password@localhost/your_db_name
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=your_db_name
GROQ_API_KEY=your_groq_api_key_here
REDIS_URL=redis://redis:6379
SECRET_KEY=your_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

> **Note:** `DATABASE_URL` uses `localhost` for local development. When running via Docker, both URLs are built automatically by `docker-compose.yml` — you do not need to change them.

### Run

```bash
alembic upgrade head
uvicorn app.main:app --reload
```

The `alembic upgrade head` step automatically provisions the `readonly_user` role in PostgreSQL.

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
READONLY_DB_USER=readonly_user
READONLY_DB_PASSWORD=readonly_password
GROQ_API_KEY=your_groq_api_key_here
SECRET_KEY=your_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

> **Note:** No `DATABASE_URL` needed here — Docker Compose builds both the main and read-only URLs automatically from the variables above.

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
| `POST` | `/datasets/{id}/ask` | ✅ | Ask a plain-English question (supports cross-table JOIN queries) |

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

### Upload CSVs and define relationships

```bash
# Upload employees
curl -X POST "http://localhost:8000/datasets/upload" \
  -H "Authorization: Bearer <your_token>" \
  -F "file=@employees.csv"
# → dataset id=1, table=u1_ds1_employees

# Upload departments
curl -X POST "http://localhost:8000/datasets/upload" \
  -H "Authorization: Bearer <your_token>" \
  -F "file=@departments.csv"
# → dataset id=2, table=u1_ds2_departments

# Define the relationship
curl -X POST "http://localhost:8000/datasets/relationships/" \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "source_dataset_id": 1,
    "source_column": "department_id",
    "target_dataset_id": 2,
    "target_column": "id"
  }'
```

### Ask a single-table question

```bash
curl -X POST "http://localhost:8000/datasets/1/ask" \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{"question": "who earns the most?"}'
```

```json
{
  "question": "who earns the most?",
  "sql_query": "SELECT name FROM u1_ds1_employees ORDER BY salary DESC LIMIT 1",
  "answer": "Diana earns the most with a salary of 95000.",
  "row_count": 1
}
```

### Ask a cross-table JOIN question

```bash
curl -X POST "http://localhost:8000/datasets/1/ask" \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{"question": "what is the average salary per department?"}'
```

```json
{
  "question": "what is the average salary per department?",
  "sql_query": "SELECT d.name AS department_name, AVG(e.salary) AS average_salary FROM u1_ds1_employees e JOIN u1_ds2_departments d ON e.department_id = d.id GROUP BY d.name ORDER BY average_salary DESC",
  "answer": "The average salaries per department are Product with 95000, Engineering with 87500, and Marketing with 72500.",
  "row_count": 3
}
```

## Error handling

| Scenario | Status |
|---|---|
| Invalid file type | `400 Bad Request` |
| Empty or malformed CSV | `400 Bad Request` |
| Question irrelevant to dataset | `400 Bad Request` |
| Generated SQL fails safety validation | `400 Bad Request` |
| Generated SQL fails to execute | `400 Bad Request` |
| Invalid dataset ID | `404 Not Found` |
| Accessing another user's dataset | `404 Not Found` |
| Missing or invalid token | `401 Unauthorized` |
| LLM returns empty response | `502 Bad Gateway` |

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
- SQL injection blocking — `DROP TABLE` attacks rejected
- Prompt injection blocking — unauthorized table access rejected

## CI/CD

A GitHub Actions workflow runs the full test suite automatically on every push and pull request to `main`. The workflow:

1. Spins up an `ubuntu-latest` runner (Docker pre-installed)
2. Installs all dependencies
3. Runs `pytest` against a testcontainers-managed PostgreSQL instance

## Version history

- **v1** — Initial prototype. Single-user, single-table CSV upload with plain-English question answering via Groq LLaMA 3.3. No authentication, no persistence layer.

- **v2** ✅ — JWT authentication and per-user dataset isolation. Each user's data is stored in namespaced PostgreSQL tables and inaccessible to other accounts.

- **v3** ✅ — Multi-table support. Users can upload multiple CSVs, define foreign-key relationships between them, and ask questions that require cross-table JOINs. Relationships can also be auto-detected by matching column names.

- **v3.1** ✅ — Security hardening and performance. SQL injection protection via `sqlparse` (SELECT-only allowlist, table allowlist). Read-only PostgreSQL role provisioned automatically via Alembic migration. High-speed CSV ingestion using PostgreSQL `COPY` protocol (~30× faster than row-by-row INSERT). Specific exception handling with structured logging throughout.

- **v4** — Async endpoints for improved throughput under concurrent load.
