import json
import logging

import redis as redis_lib
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from groq import Groq
from sqlalchemy import select, text
from sqlalchemy.orm import Session
from typing import Any

from app.auth import get_current_user
from app.database import get_db, get_readonly_db
from app.models import Dataset, Relationship, User
from app.schemas import AskRequest, AskResponse
from app.sql_guard import validate_sql, UnsafeSQLError
from ..cache import cache
from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter()
client = Groq(api_key=settings.GROQ_API_KEY)


def clean_sql(sql: str) -> str:
    sql = sql.strip()
    if sql.startswith("'''"):
        sql = sql.split("\n", 1)[-1]
    if sql.endswith("'''"):
        sql = sql.rsplit("'''", 1)[0]
    return sql.strip()


def build_schema_prompt(target_dataset: Dataset,all_datasets: list[Dataset],relationships: list[Relationship]) -> str:
    tables_str = ""
    for ds in all_datasets:
        cols = "\n".join(f"    - {col} ({dtype})" for col, dtype in ds.columns.items())
        tables_str += f"\nTable: {ds.table_name}  (from file: {ds.name})\n{cols}\n"

    if relationships:
        rels_str = "\nRelationships (foreign keys):\n"
        for rel in relationships:
            rels_str += (
                f"  - {rel.source_dataset.table_name}.{rel.source_column}"
                f" → {rel.target_dataset.table_name}.{rel.target_column}\n"
            )
    else:
        rels_str = "\nNo relationships defined between tables.\n"

    return f"""You are a PostgreSQL expert. The user has the following tables:{tables_str}{rels_str}
    The user is asking about the table '{target_dataset.table_name}' (from file: '{target_dataset.name}'), but you may JOIN with other tables if the question requires it.
    Rules:
    - Return ONLY the raw SQL query, no explanation, no markdown, no backticks.
    - PostgreSQL syntax only.
    - When filtering text columns, use ILIKE with wildcards instead of =. For example: name ILIKE '%alice%'
    - Every expression that is not a plain column reference (computed values, casts, aggregates) MUST have an explicit AS alias, lowercase with underscores.
    - If the question is not answerable from these tables, return exactly "IRRELEVANT" with no other text.
    - Only return IRRELEVANT if the question genuinely cannot be answered; if it can be computed from existing columns, do that instead.
    - Never use OVER() on arbitrary expressions.
    - If an aggregate must be compared to row values, use a CTE or subquery.
    - Prefer ORDER BY ... LIMIT 1 instead of window functions when only the top row is requested."""


def build_answer_prompt(question: str, sql_query: str, results: list) -> str:
    return f"""You are a data analyst. A user asked the following question about their data:
    Question: {question}
    The Following SQL query was run:{sql_query}
    The query returned these results:
    {json.dumps(jsonable_encoder(results), indent=2)}
    Please provide a clear,concise plain-English answer to the user's question based on these results.
    Formatting rules
    - If the answer is a single value or short fact, respond in one plain sentence
    - If the answer involves multiple rows or a list of items, use comma separated list in a single sentence.
    - Do not use markdown - no asterisk , no bold , no headers
    - Write naturally, as if explaining to someone verbally"""


@router.post("/{dataset_id}/ask", response_model=AskResponse)
def ask_question(dataset_id: int,request: AskRequest,current_user: User = Depends(get_current_user),db: Session = Depends(get_db),readonly_db: Session = Depends(get_readonly_db)):
    key = f"query:{current_user.id}:{dataset_id}:{request.question.strip().lower()}"
    try:
        cached = cache.get(key)
        if cached:
            return json.loads(cached)
    except redis_lib.RedisError as e:
        logger.warning("Redis cache read failed: %s", e)
    except json.JSONDecodeError as e:
        logger.warning("Cache deserialization failed for key %s: %s", key, e)

    dataset = db.execute(select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == current_user.id)).scalar_one_or_none()
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,detail=f"Dataset with id {dataset_id} not found")

    all_datasets = db.execute(select(Dataset).where(Dataset.user_id == current_user.id)).scalars().all()
    owned_ids = [ds.id for ds in all_datasets]
    relationships = db.execute(
        select(Relationship).where(
            Relationship.source_dataset_id.in_(owned_ids),
            Relationship.target_dataset_id.in_(owned_ids),
        )
    ).scalars().all()

    schema_prompt = build_schema_prompt(dataset, all_datasets, relationships)
    sql_response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        temperature=0,
        messages=[
            {"role": "system", "content": schema_prompt},
            {"role": "user", "content": request.question},
        ],
    )

    raw_sql = sql_response.choices[0].message.content
    if raw_sql is None:raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,detail="LLM returned an empty response for SQL generation.",)
    raw_sql = raw_sql.strip()

    if raw_sql == "IRRELEVANT":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail=f"Your question doesn't appear to be relevant to this dataset. "
            f"Please visit /datasets/{dataset_id} to see the dataset.")

    sql_query = clean_sql(raw_sql)

    allowed_tables = {ds.table_name.lower() for ds in all_datasets}
    try:
        sql_query = validate_sql(sql_query, allowed_tables)
    except UnsafeSQLError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail=f"Generated SQL failed safety validation: {e}")

    try:
        raw_results = readonly_db.execute(text(sql_query)).mappings().all()
        results: list[dict[str, Any]] = [dict(row) for row in raw_results]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,detail=f"Generated SQL query failed to execute: {str(e)}")

    answer_response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "user", "content": build_answer_prompt(request.question, sql_query, results)},
        ],
    )

    raw_answer = answer_response.choices[0].message.content
    if raw_answer is None:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,detail="LLM returned an empty response for answer generation.")
    answer = raw_answer.strip()

    response = AskResponse(
        question=request.question,
        sql_query=sql_query,
        answer=answer,
        row_count=len(results),
    )
    try:
        cache.set(key, json.dumps(response.model_dump()), ex=86400)
    except redis_lib.RedisError as e:
        logger.warning("Redis cache write failed: %s", e)
    return response