# QueryMind

[![CI](https://github.com/affniz/QueryMind/actions/workflows/ci.yml/badge.svg)](https://github.com/affniz/QueryMind/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Python](https://img.shields.io/badge/python-3.13-blue.svg)](https://www.python.org/)
[![Node](https://img.shields.io/badge/node-20+-green.svg)](https://nodejs.org/)

QueryMind is a full-stack application that lets you upload CSVs and ask plain-English questions about your data through a React UI. It uses a large language model to convert natural language into SQL, executes the query safely against your data, and streams the answer back in real time — no SQL knowledge required.

## How it works

1. Register and log in to get a JWT token
2. Upload one or more CSV files — each file becomes a queryable table
3. Optionally organise datasets into folders and define relationships between them
4. Ask a question in plain English — QueryMind generates SQL, validates it for safety, executes it against your data using a read-only connection, and streams a plain-English answer back in real time alongside the generated SQL

## Architecture

```mermaid
graph TD
    A["React + Vite + TypeScript<br/>(localhost:5173)"] -->|"REST / SSE (JWT)"| B["FastAPI Backend<br/>(localhost:8000)"]
    B -->|"Read/Write (SQLAlchemy)"| C[("PostgreSQL<br/>dynamic tables per dataset")]
    B -->|"Read-Only Queries<br/>(readonly_user role)"| C
    B -->|"Cache (24h TTL)"| D[("Redis")]
    B -->|"Text-to-SQL &amp; Answer Generation"| E["Groq LLM API"]

    style A fill:#61dafb,color:#000
    style B fill:#009688,color:#fff
    style C fill:#336791,color:#fff
    style D fill:#dc382d,color:#fff
    style E fill:#f97316,color:#fff
```

## Tech stack

- **React + Vite + TypeScript** — frontend UI
- **FastAPI** — API framework
- **PostgreSQL** — data storage (with dynamic table creation per dataset)
- **SQLAlchemy 2.0** — ORM and query execution
- **psycopg** — PostgreSQL driver (used for high-speed bulk COPY ingestion)
- **Groq** — LLM provider for Text-to-SQL and answer generation (model configurable via `GROQ_MODEL`)
- **sqlparse** — SQL safety validation (allowlist + statement-type enforcement)
- **Redis** — response caching (24-hour TTL per user/dataset/question)
- **Alembic** — database migrations
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
   - `WITH ... AS` CTEs are fully supported and validated

2. **Read-only database connection** — All LLM-generated queries execute through a dedicated `readonly_user` PostgreSQL role provisioned automatically via Alembic migration. Even if a query somehow bypassed the guard, the database role itself has no write permissions and no access to system tables.

## Authentication

All protected endpoints require a JWT `Bearer` token in the `Authorization` header. Tokens are issued on login and expire after `ACCESS_TOKEN_EXPIRE_MINUTES` minutes (default: 60).

**Token lifecycle:**

```mermaid
sequenceDiagram
    participant C as Client
    participant A as FastAPI
    participant D as PostgreSQL

    C->>A: POST /auth/register {email, password}
    A->>D: Store hashed password (bcrypt)
    D-->>A: User created
    A-->>C: 201 Created

    C->>A: POST /auth/login {username, password}
    A->>D: Lookup user, verify hash
    D-->>A: User record
    A-->>C: {access_token, token_type: "bearer"}

    Note over C,A: Token expires after ACCESS_TOKEN_EXPIRE_MINUTES

    C->>A: POST /datasets/upload<br/>Authorization: Bearer &lt;token&gt;
    A->>A: Validate JWT (python-jose)<br/>Extract user_id
    A-->>C: 200 OK (or 401 if invalid/expired)
```

> Tokens are signed with `SECRET_KEY` using the `ALGORITHM` (default: `HS256`). There is no refresh-token flow — users must log in again after expiry.

## Getting started

### Prerequisites

- Python 3.10+
- PostgreSQL running locally
- Redis running locally
- Groq API key (free at [console.groq.com](https://console.groq.com))

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

Create a `.env` file in the project root. For local development (no Docker):

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ Yes | — | SQLAlchemy connection string for the main (read-write) PostgreSQL connection. Use `postgresql+psycopg://user:pass@localhost/dbname` locally. |
| `READONLY_DATABASE_URL` | ✅ Yes | — | SQLAlchemy connection string for the read-only PostgreSQL role used to execute all LLM-generated queries. |
| `DB_USER` | ✅ Yes | — | PostgreSQL username (used by Docker Compose to build connection strings). |
| `DB_PASSWORD` | ✅ Yes | — | PostgreSQL password. |
| `DB_NAME` | ✅ Yes | — | PostgreSQL database name. |
| `GROQ_API_KEY` | ✅ Yes | — | API key from [console.groq.com](https://console.groq.com). |
| `GROQ_MODEL` | ✅ Yes | — | Groq model ID to use (e.g. `openai/gpt-oss-120b`, `llama-3.3-70b-versatile`). No hardcoded fallback. |
| `REDIS_URL` | ✅ Yes | — | Redis connection URL (e.g. `redis://localhost:6379`). |
| `SECRET_KEY` | ✅ Yes | — | Random secret used to sign JWT tokens. Generate with `openssl rand -hex 32`. |
| `ALGORITHM` | No | `HS256` | JWT signing algorithm. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `60` | JWT lifetime in minutes. |

**Example `.env` for local development:**

```
DATABASE_URL=postgresql+psycopg://your_username:your_password@localhost/your_db_name
READONLY_DATABASE_URL=postgresql+psycopg://readonly_user:readonly_password@localhost/your_db_name
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=your_db_name
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-120b
REDIS_URL=redis://localhost:6379
SECRET_KEY=your_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

> **Docker note:** When running via Docker, `DATABASE_URL` and `READONLY_DATABASE_URL` are built automatically by `docker-compose.yml` — you only need `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and the other variables above.

> **`GROQ_MODEL`** — any model available on your Groq account can be used here (e.g. `openai/gpt-oss-120b`, `llama-3.3-70b-versatile`, `mixtral-8x7b-32768`). There is no hardcoded fallback; this field is required.

### Run

```bash
alembic upgrade head
uvicorn app.main:app --reload
```

The `alembic upgrade head` step runs database migrations and provisions the `readonly_user` PostgreSQL role automatically.

Visit `http://127.0.0.1:8000/docs` for interactive API documentation.

## Frontend development

The frontend is a Vite dev server run separately from the backend.

### Prerequisites

- Node.js 20+

### Setup & run

```bash
cd frontend
npm install
npm run dev
```

The UI will be available at `http://localhost:5173`.

### Other commands

| Command | Description |
|---|---|
| `npm run build` | Production build (outputs to `frontend/dist/`) |
| `npm run lint` | Lint with oxlint |
| `npm run preview` | Preview the production build locally |

> The frontend communicates with the backend at `http://localhost:8000` by default. When deploying, set `CORS_ORIGINS` on the backend to the frontend's public URL.

## Docker setup

### Prerequisites

- Docker
- Docker Compose

### Steps

#### 1. Clone the repository

```bash
git clone https://github.com/affniz/QueryMind.git
cd QueryMind
```

#### 2. Create a `.env` file in the project root

```
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=your_db_name
READONLY_DB_USER=readonly_user
READONLY_DB_PASSWORD=readonly_password
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-120b
SECRET_KEY=your_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
```

> **Note:** No `DATABASE_URL` needed here — Docker Compose builds both the main and read-only URLs automatically from the variables above.

#### 3. Build & start the backend containers

```bash
docker-compose up --build
```

The API will be available at `http://localhost:8000`  
Swagger UI: `http://localhost:8000/docs`

#### 4. Start the frontend

See [Frontend development](#frontend-development) above. In a new terminal:

```bash
cd frontend
npm install
npm run dev
```

The UI will be available at `http://localhost:5173`

#### 5. Stop the app

```bash
docker-compose down
```

#### 6. Reset the database (optional)

```bash
docker-compose down -v
```

## Deploying to Render

The project ships with a [`render.yaml`](./render.yaml) Blueprint that provisions all four services — the FastAPI backend, the React frontend, a managed PostgreSQL database, and a managed Redis instance — in one click.

Once connected to GitHub, Render **auto-deploys on every push to `main`** — no manual steps needed after the initial setup.

### Steps

#### 1. Push to GitHub

Make sure your repository is on GitHub. The `.env` file is gitignored and should never be committed.

#### 2. Create a new Blueprint on Render

1. Go to [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**
2. Connect your GitHub repository
3. Render will detect `render.yaml` and show a preview of all services

#### 3. Set required secrets before deploying

These env vars are marked `sync: false` and must be entered manually in the Render UI before clicking **Apply**:

| Variable | Where to get it |
|---|---|
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) |
| `GROQ_MODEL` | Any Groq-supported model ID, e.g. `openai/gpt-oss-120b` |
| `CORS_ORIGINS` | Leave blank for now — set after the frontend URL is known |

`READONLY_DATABASE_URL` is configured after the first deploy (see below).

#### 4. Deploy

Click **Apply**. Render will:
- Provision the PostgreSQL database and Redis instance
- Build and deploy the Docker backend (runs `alembic upgrade head` + `setup_readonly.py` + uvicorn)
- Build and deploy the React frontend as a static site

#### 5. Post-deploy: set remaining env vars

Once deployed, go to your **`data-insight-api`** service → **Environment** and add:

| Variable | Value |
|---|---|
| `READONLY_DATABASE_URL` | `postgresql+psycopg://readonly_user:<READONLY_DB_PASSWORD>@<internal-host>:5432/data_insight_db` |
| `CORS_ORIGINS` | Your frontend URL, e.g. `https://data-insight-frontend.onrender.com` |

> **Tip:** Find the internal DB host in **`data-insight-db`** → **Info** → **Internal Database URL**. Find the generated `READONLY_DB_PASSWORD` in the backend service **Environment** tab.

After saving, Render will automatically redeploy the backend.

## API endpoints

All `/datasets/` endpoints require an `Authorization: Bearer <token>` header.

| Method | Endpoint | Auth | Description |
|--------|----------|:----:|-------------|
| `POST` | `/auth/register` | No | Register a new user |
| `POST` | `/auth/login` | No | Log in and receive a JWT token |
| `GET` | `/health` | No | Health check |
| `POST` | `/datasets/upload` | Yes | Upload a CSV file |
| `GET` | `/datasets` | Yes | List your datasets (paginated: `?skip=0&limit=20`) |
| `GET` | `/datasets/{id}` | Yes | Get dataset metadata |
| `GET` | `/datasets/{id}/preview` | Yes | Preview up to 100 raw rows (`?limit=10`) |
| `DELETE` | `/datasets/{id}` | Yes | Delete a dataset and its records |
| `POST` | `/datasets/relationships/` | Yes | Define a relationship between two datasets |
| `GET` | `/datasets/relationships/` | Yes | List all defined relationships |
| `POST` | `/datasets/relationships/auto-detect` | Yes | Auto-detect relationships by matching column names |
| `DELETE` | `/datasets/relationships/{id}` | Yes | Delete a defined relationship |
| `POST` | `/datasets/{id}/ask` | Yes | Ask a plain-English question (streaming SSE response) |
| `GET` | `/chats/` | Yes | List chat sessions (`?type=dataset&id=1` or `?type=folder&id=2`) |
| `POST` | `/chats/` | Yes | Create a new chat session |
| `GET` | `/chats/{session_id}` | Yes | Get a chat session with full message history |
| `PATCH` | `/chats/{session_id}` | Yes | Rename a chat session |
| `DELETE` | `/chats/{session_id}` | Yes | Delete a chat session and its messages |

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
# -> dataset id=1, table=u1_ds1_employees

# Upload departments
curl -X POST "http://localhost:8000/datasets/upload" \
  -H "Authorization: Bearer <your_token>" \
  -F "file=@departments.csv"
# -> dataset id=2, table=u1_ds2_departments

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
  "row_count": 1,
  "results": [{"name": "Diana"}]
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
  "row_count": 3,
  "results": [
    {"department_name": "Product", "average_salary": 95000},
    {"department_name": "Engineering", "average_salary": 87500},
    {"department_name": "Marketing", "average_salary": 72500}
  ]
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
- Pagination on dataset listing
- Dataset row preview via read-only connection
- Defining, listing, and deleting relationships
- Auto-detecting relationships across datasets
- Plain-English question answering (with mocked LLM, including multi-table JOINs)
- CTE (`WITH ... AS`) queries accepted by the SQL guard
- `results` field present and matching `row_count` in ask responses
- SQL injection blocking — `DROP TABLE` attacks rejected
- Prompt injection blocking — unauthorized table access rejected

## CI/CD

A GitHub Actions workflow runs the full test suite automatically on every push and pull request to `main`. The workflow:

1. Spins up an `ubuntu-latest` runner (Docker pre-installed)
2. Installs all dependencies
3. Runs `pytest` against a testcontainers-managed PostgreSQL instance

Render auto-deploys the backend and frontend on every push to `main` after the initial setup — no manual intervention required.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for branch naming conventions, commit message format, code style guidelines, and how to run the test suite locally.

## Changelog

Full version history is in [CHANGELOG.md](./CHANGELOG.md). Latest release: **v6.0.0** — chat history, data export, and resizable UI panels.

## License

[MIT](./LICENSE) © Affan Nizami
