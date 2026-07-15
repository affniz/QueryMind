# QueryMind

A FastAPI backend that lets you upload a CSV and ask plain-English questions about your data. QueryMind uses a large language model to convert natural language into SQL, executes the query against your data, and returns a plain-English answer — no SQL knowledge required.

## How it works

1. Upload a CSV file via the API
2. Ask a question in plain English
3. QueryMind generates a SQL query using an LLM, executes it against your data, and returns a plain-English answer alongside the generated SQL

## Tech stack

- **FastAPI** — API framework
- **PostgreSQL** — data storage
- **SQLAlchemy 2.0** — ORM and query execution
- **Groq (LLaMA 3.3 70B)** — LLM for Text-to-SQL and answer generation
- **Pandas** — CSV parsing
- **Pydantic** — request/response validation
- **psycopg** — PostgreSQL driver

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

### Environment variables

Create a `.env` file in the root directory:

```
DATABASE_URL=postgresql+psycopg://your_username:your_password@localhost/your_db_name
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=your_db_name
GROQ_API_KEY=your_groq_api_key_here
REDIS_URL=redis://redis:6379
```

### Run

```bash
alembic upgrade
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

### 2. Create a '.env' file in the project root

```
DATABASE_URL=postgresql+psycopg://your_username:your_password@localhost/your_db_name
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=your_db_name
GROQ_API_KEY=your_groq_api_key_here
REDIS_URL=redis://redis:6379
```

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

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/datasets/upload` | Upload a CSV file |
| `GET` | `/datasets` | List all uploaded datasets |
| `GET` | `/datasets/{id}` | Get dataset metadata |
| `DELETE` | `/datasets/{id}` | Delete a dataset and its records |
| `POST` | `/datasets/{id}/ask` | Ask a plain-English question |

## Example

### Upload a CSV

```bash
curl -X POST "http://localhost:8000/datasets/upload" \
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
  -H "Content-Type: application/json" \
  -d '{"question": "which region had the highest revenue?"}'
```

Response:

```json
{
  "question": "which region had the highest revenue?",
  "sql_query": "SELECT data->>'region' as region FROM records WHERE dataset_id=1 ORDER BY (data->>'revenue')::float DESC LIMIT 1",
  "answer": "The North region had the highest revenue with $120,000.",
  "row_count": 1
}
```

## Error handling

- Invalid file type → `HTTP_400_BAD_REQUEST`
- Empty or malformed CSV → `HTTP_400_BAD_REQUEST`
- Invalid dataset ID → `HTTP_404_NOT_FOUND`
- Question irrelevant to dataset → `HTTP_400_BAD_REQUEST`
- Generated SQL fails to execute → `HTTP_400_BAD_REQUEST`

## Planned features

- **v2** — JWT authentication, per-user dataset isolation
- **v3** — Multi-table support with foreign key inference
- **v4** — Async endpoints for improved performance
