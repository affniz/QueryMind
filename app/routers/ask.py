import asyncio
import hashlib
import json
import logging
import re
from typing import Any, AsyncGenerator, Optional

import redis as redis_lib
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from groq import Groq
from sqlalchemy import select, text
from sqlalchemy.orm import Session, selectinload

from app.auth import get_current_user
from app.database import get_db, get_readonly_db
from app.models import Dataset, Folder, Relationship, User, ChatSession, ChatMessage
from app.rate_limiter import check_rate_limit
from app.schemas import AskRequest
from app.sql_guard import validate_sql, UnsafeSQLError
from ..cache import cache
from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter()
client = Groq(api_key=settings.GROQ_API_KEY)

# Maximum number of past conversation turns to include in the LLM prompt.
# Each turn is one user question + one assistant answer = 2 messages.
_MAX_HISTORY_TURNS = 3


def clean_sql(sql: str) -> str:
    # Strip <think>...</think> blocks emitted by reasoning/thinking models
    sql = re.sub(r"<think>.*?</think>", "", sql, flags=re.DOTALL)
    sql = sql.strip()
    # Strip markdown backtick fences (most common LLM output format)
    if sql.startswith("```"):
        sql = sql.split("\n", 1)[-1]  # drop first line (e.g. ```sql)
    if sql.endswith("```"):
        sql = sql.rsplit("```", 1)[0]
    # Strip triple-quote fences
    if sql.startswith("'''"):
        sql = sql.split("\n", 1)[-1]
    if sql.endswith("'''"):
        sql = sql.rsplit("'''", 1)[0]
    return sql.rstrip(";").strip()


def build_schema_prompt(
    target_dataset: Optional[Dataset],
    all_datasets: list[Dataset],
    relationships: list[Relationship],
    folder_name: Optional[str] = None,
) -> str:
    """Build the system prompt for SQL generation.

    When target_dataset is None (folder-scoped mode), the prompt instructs
    the LLM to treat all tables as equally queryable with free JOINs.
    When target_dataset is provided (dataset-scoped mode), the existing
    behaviour is preserved.
    """
    try:
        tables_str = ""
        for ds in all_datasets:
            cols = "\n".join(f"    - {col} ({dtype})" for col, dtype in ds.columns.items())
            tables_str += f"\nTable: {ds.table_name}  (from file: {ds.name})\n{cols}\n"

        if relationships:
            rels_str = "\nRelationships (foreign keys):\n"
            for rel in relationships:
                src = rel.source_dataset
                tgt = rel.target_dataset
                if src is None or tgt is None:
                    logger.warning(
                        "Skipping orphaned relationship id=%s (source_dataset_id=%s, target_dataset_id=%s)",
                        rel.id,
                        rel.source_dataset_id,
                        rel.target_dataset_id,
                    )
                    continue
                rels_str += f"  - {src.table_name}.{rel.source_column} → {tgt.table_name}.{rel.target_column}\n"
        else:
            rels_str = "\nNo relationships defined between tables.\n"

        if target_dataset is not None:
            # Dataset-scoped: hint at the primary table but allow JOINs
            scope_instruction = (
                f"The user is asking about the table '{target_dataset.table_name}' "
                f"(from file: '{target_dataset.name}'), but you may JOIN with other tables if the question requires it."
            )
        else:
            # Folder-scoped: all tables are equally available
            ctx = f" in the '{folder_name}' folder" if folder_name else ""
            scope_instruction = (
                f"The user is asking about data{ctx}. "
                "You have full access to ALL the tables listed above. "
                "Use any of them and JOIN freely as needed to answer the question. "
                "Do not assume one table is more important than another."
            )

        return f"""You are a PostgreSQL expert. The user has the following tables:{tables_str}{rels_str}
    {scope_instruction}
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
    except Exception as e:
        logger.error("Error building schema prompt: %s", e)
        raise


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


async def _generate_sql(
    schema_prompt: str,
    question: str,
    history: list,
    error_context: str | None = None,
    previous_sql: str | None = None,
) -> str:
    """Call the LLM to generate SQL.

    On a retry attempt (error_context is set), the previous failed SQL and the
    exact error message are injected so the LLM can self-correct without
    restarting from scratch.
    """
    messages: list[dict] = [{"role": "system", "content": schema_prompt}]

    # Inject past conversation turns (capped to _MAX_HISTORY_TURNS)
    max_history_messages = _MAX_HISTORY_TURNS * 2
    for entry in history[-max_history_messages:]:
        role = "user" if entry.role == "user" else "assistant"
        messages.append({"role": role, "content": entry.content})

    if error_context and previous_sql:
        # Retry path: give the LLM the broken query + error so it can fix it
        messages.append({
            "role": "user",
            "content": (
                f"{question}\n\n"
                f"Your previous SQL query was:\n{previous_sql}\n\n"
                f"It failed with this error:\n{error_context}\n\n"
                "Please return a corrected SQL query only, with no explanation."
            ),
        })
    else:
        messages.append({"role": "user", "content": question})

    response = await asyncio.to_thread(
        client.chat.completions.create,
        model=settings.GROQ_MODEL,
        temperature=0,
        messages=messages,
    )
    raw = response.choices[0].message.content
    if raw is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="LLM returned an empty response for SQL generation.",
        )
    return raw.strip()



@router.post("/{dataset_id}/ask")
async def ask_question(
    dataset_id: int,
    request: AskRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    readonly_db: Session = Depends(get_readonly_db),
    _: None = Depends(check_rate_limit),
):
    """Ask a plain-English question about a dataset.

    Returns a Server-Sent Events (SSE) stream with the following events:
    - event: sql      — the generated SQL query (emitted before execution)
    - event: token    — individual answer tokens streamed in real-time
    - event: done     — JSON payload with results + row_count
    - event: error    — error detail string if answer generation fails mid-stream
    """
    # --- Cache lookup ---
    # Include a hash of the history so that the same question asked in a
    # different conversational context does not return a stale cached answer.
    history_hash = hashlib.md5(
        json.dumps([h.model_dump() for h in request.history], sort_keys=True).encode()
    ).hexdigest()[:8]
    cache_key = f"query:{current_user.id}:{dataset_id}:{request.question.strip().lower()}:{history_hash}"

    try:
        cached = cache.get(cache_key)
        if cached:
            cached_data = json.loads(cached)

            async def _stream_cached() -> AsyncGenerator[str, None]:
                yield f"event: sql\ndata: {json.dumps(cached_data['sql_query'])}\n\n"
                for word in cached_data["answer"].split(" "):
                    yield f"event: token\ndata: {json.dumps(word + ' ')}\n\n"
                    await asyncio.sleep(0)
                done_payload = {
                    "row_count": cached_data["row_count"],
                    "results": [
                        {k: v for k, v in row.items() if k != "_record_id"}
                        for row in cached_data["results"]
                    ],
                    "cached": True,
                }
                yield f"event: done\ndata: {json.dumps(done_payload)}\n\n"

            return StreamingResponse(_stream_cached(), media_type="text/event-stream")
    except (redis_lib.RedisError, json.JSONDecodeError) as e:
        logger.warning("Cache read failed: %s", e)

    # --- Fetch dataset + relationships ---
    dataset = db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
    ).scalar_one_or_none()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset with id {dataset_id} not found",
        )

    all_datasets = db.execute(
        select(Dataset).where(Dataset.user_id == current_user.id)
    ).scalars().all()

    # Scope the LLM context to only the datasets in the same folder.
    if request.folder_dataset_ids is not None:
        allowed_folder_ids = set(request.folder_dataset_ids) | {dataset_id}
        all_datasets = [ds for ds in all_datasets if ds.id in allowed_folder_ids]

    owned_ids = [ds.id for ds in all_datasets]
    relationships = db.execute(
        select(Relationship)
        .options(
            selectinload(Relationship.source_dataset),
            selectinload(Relationship.target_dataset),
        )
        .where(
            Relationship.source_dataset_id.in_(owned_ids),
            Relationship.target_dataset_id.in_(owned_ids),
        )
    ).scalars().all()

    try:
        schema_prompt = build_schema_prompt(dataset, all_datasets, relationships)
    except Exception as e:
        logger.error("Failed to build schema prompt: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred while building the query context. Please try again.",
        )
    allowed_tables = {ds.table_name.lower() for ds in all_datasets}

    # --- SQL generation with retry loop ---
    sql_query: str | None = None
    results: list[dict[str, Any]] | None = None
    last_error: str | None = None
    previous_sql: str | None = None

    for attempt in range(settings.MAX_SQL_RETRIES):
        try:
            raw_sql = await _generate_sql(
                schema_prompt,
                request.question,
                request.history,
                error_context=last_error,
                previous_sql=previous_sql,
            )

            if raw_sql.strip() == "IRRELEVANT":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Your question does not appear to be relevant to this dataset. "
                        f"Please visit /datasets/{dataset_id} to see the dataset."
                    ),
                )

            candidate_sql = clean_sql(raw_sql)
            previous_sql = candidate_sql
            logger.info("Attempt %d — generated SQL: %s", attempt + 1, candidate_sql)

            try:
                candidate_sql = validate_sql(candidate_sql, allowed_tables)
            except UnsafeSQLError as e:
                last_error = f"SQL safety validation failed: {e}"
                logger.warning("Attempt %d — unsafe SQL (%s): %s", attempt + 1, e, candidate_sql)
                continue

            # Wrap in a hard LIMIT to guard against unbounded LLM-generated queries
            safe_query = f"SELECT * FROM ({candidate_sql}) AS _safe_query LIMIT 100"
            raw_results = readonly_db.execute(text(safe_query)).mappings().all()
            results = jsonable_encoder([dict(row) for row in raw_results])
            sql_query = candidate_sql
            break  # success

        except HTTPException:
            raise
        except Exception as e:
            last_error = str(e)
            logger.warning("Attempt %d — SQL execution failed: %s", attempt + 1, e)
            try:
                readonly_db.rollback()
            except Exception:
                pass

    if sql_query is None or results is None:
        logger.error(
            "All %d SQL generation attempts failed. Last error: %s",
            settings.MAX_SQL_RETRIES,
            last_error,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not generate a valid SQL query after multiple attempts. Please rephrase your question.",
        )

    # --- Streaming answer generation ---
    async def _event_stream() -> AsyncGenerator[str, None]:
        yield f"event: sql\ndata: {json.dumps(sql_query)}\n\n"

        accumulated_answer: list[str] = []
        try:
            stream = await asyncio.to_thread(
                client.chat.completions.create,
                model=settings.GROQ_MODEL,
                messages=[
                    {"role": "user", "content": build_answer_prompt(request.question, sql_query, results)},
                ],
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    accumulated_answer.append(delta)
                    yield f"event: token\ndata: {json.dumps(delta)}\n\n"
        except Exception as e:
            logger.error("Streaming answer generation failed: %s", e, exc_info=True)
            yield f"event: error\ndata: {json.dumps(str(e))}\n\n"
            return

        full_answer = "".join(accumulated_answer)
        done_payload = {"row_count": len(results), "results": results, "cached": False}
        yield f"event: done\ndata: {json.dumps(done_payload)}\n\n"

        if request.session_id is not None:
            try:
                session = db.execute(
                    select(ChatSession).where(
                        ChatSession.id == request.session_id,
                        ChatSession.user_id == current_user.id,
                    )
                ).scalar_one_or_none()
                if session:
                    db.add(ChatMessage(session_id=session.id, role="user", content=request.question))
                    db.add(ChatMessage(session_id=session.id, role="assistant", content=full_answer, sql=sql_query, results=results))
                    from sqlalchemy import func as sqlfunc
                    session.updated_at = sqlfunc.now()
                    db.commit()
            except Exception as e:
                logger.warning("Failed to persist chat messages to session %s: %s", request.session_id, e)

        try:
            cache_payload = {
                "question": request.question,
                "sql_query": sql_query,
                "answer": full_answer,
                "row_count": len(results),
                "results": results,
            }
            cache.set(cache_key, json.dumps(jsonable_encoder(cache_payload)), ex=86400)
        except Exception as e:
            logger.warning("Redis cache write failed: %s", e)

    return StreamingResponse(_event_stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Folder-scoped ask endpoint
# ---------------------------------------------------------------------------

@router.post("/folder/{folder_id}/ask")
async def ask_folder(
    folder_id: int,
    request: AskRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    readonly_db: Session = Depends(get_readonly_db),
    _: None = Depends(check_rate_limit),
):
    """Ask a plain-English question across ALL datasets in a folder.

    The LLM sees every table in the folder and may JOIN freely.
    Returns the same SSE stream as the dataset ask endpoint.
    """
    # Verify folder ownership
    folder = db.execute(
        select(Folder).where(Folder.id == folder_id, Folder.user_id == current_user.id)
    ).scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Folder not found.")

    # Load all datasets in the folder
    all_datasets = db.execute(
        select(Dataset).where(Dataset.folder_id == folder_id, Dataset.user_id == current_user.id)
    ).scalars().all()

    if not all_datasets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This folder has no datasets. Please upload a CSV first.",
        )

    owned_ids = [ds.id for ds in all_datasets]
    relationships = db.execute(
        select(Relationship)
        .options(
            selectinload(Relationship.source_dataset),
            selectinload(Relationship.target_dataset),
        )
        .where(
            Relationship.source_dataset_id.in_(owned_ids),
            Relationship.target_dataset_id.in_(owned_ids),
        )
    ).scalars().all()

    try:
        # target_dataset=None → folder-scoped prompt
        schema_prompt = build_schema_prompt(None, all_datasets, relationships, folder_name=folder.name)
    except Exception as e:
        logger.error("Failed to build folder schema prompt: %s", e, exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Error building query context.")

    allowed_tables = {ds.table_name.lower() for ds in all_datasets}
    cache_key = (
        f"folder_query:{current_user.id}:{folder_id}:{request.question.strip().lower()}:"
        + hashlib.md5(json.dumps([h.model_dump() for h in request.history], sort_keys=True).encode()).hexdigest()[:8]
    )

    # Cache hit
    try:
        cached = cache.get(cache_key)
        if cached:
            cached_data = json.loads(cached)
            async def _stream_cached_folder() -> AsyncGenerator[str, None]:
                yield f"event: sql\ndata: {json.dumps(cached_data['sql_query'])}\n\n"
                for word in cached_data["answer"].split(" "):
                    yield f"event: token\ndata: {json.dumps(word + ' ')}\n\n"
                    await asyncio.sleep(0)
                yield f"event: done\ndata: {json.dumps({'row_count': cached_data['row_count'], 'results': cached_data['results'], 'cached': True})}\n\n"
            return StreamingResponse(_stream_cached_folder(), media_type="text/event-stream")
    except (redis_lib.RedisError, json.JSONDecodeError) as e:
        logger.warning("Folder cache read failed: %s", e)

    # SQL generation with retry
    sql_query: str | None = None
    results: list[dict[str, Any]] | None = None
    last_error: str | None = None
    previous_sql: str | None = None

    for attempt in range(settings.MAX_SQL_RETRIES):
        try:
            raw_sql = await _generate_sql(
                schema_prompt, request.question, request.history,
                error_context=last_error, previous_sql=previous_sql,
            )
            if raw_sql.strip() == "IRRELEVANT":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Your question does not appear to be relevant to this folder's data.",
                )
            candidate_sql = clean_sql(raw_sql)
            previous_sql = candidate_sql
            logger.info("Folder attempt %d — generated SQL: %s", attempt + 1, candidate_sql)
            try:
                candidate_sql = validate_sql(candidate_sql, allowed_tables)
            except UnsafeSQLError as e:
                last_error = f"SQL safety validation failed: {e}"
                continue
            safe_query = f"SELECT * FROM ({candidate_sql}) AS _safe_query LIMIT 100"
            raw_results = readonly_db.execute(text(safe_query)).mappings().all()
            results = jsonable_encoder([dict(row) for row in raw_results])
            sql_query = candidate_sql
            break
        except HTTPException:
            raise
        except Exception as e:
            last_error = str(e)
            logger.warning("Folder attempt %d — SQL execution failed: %s", attempt + 1, e)
            try:
                readonly_db.rollback()
            except Exception:
                pass

    if sql_query is None or results is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not generate a valid SQL query after multiple attempts. Please rephrase your question.",
        )

    async def _folder_event_stream() -> AsyncGenerator[str, None]:
        yield f"event: sql\ndata: {json.dumps(sql_query)}\n\n"

        accumulated_answer: list[str] = []
        try:
            stream = await asyncio.to_thread(
                client.chat.completions.create,
                model=settings.GROQ_MODEL,
                messages=[{"role": "user", "content": build_answer_prompt(request.question, sql_query, results)}],
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    accumulated_answer.append(delta)
                    yield f"event: token\ndata: {json.dumps(delta)}\n\n"
        except Exception as e:
            logger.error("Folder streaming answer failed: %s", e, exc_info=True)
            yield f"event: error\ndata: {json.dumps(str(e))}\n\n"
            return

        full_answer = "".join(accumulated_answer)
        yield f"event: done\ndata: {json.dumps({'row_count': len(results), 'results': results, 'cached': False})}\n\n"

        # Persist to session
        if request.session_id is not None:
            try:
                session = db.execute(
                    select(ChatSession).where(
                        ChatSession.id == request.session_id,
                        ChatSession.user_id == current_user.id,
                    )
                ).scalar_one_or_none()
                if session:
                    db.add(ChatMessage(session_id=session.id, role="user", content=request.question))
                    db.add(ChatMessage(session_id=session.id, role="assistant", content=full_answer, sql=sql_query, results=results))
                    from sqlalchemy import func as sqlfunc
                    session.updated_at = sqlfunc.now()
                    db.commit()
            except Exception as e:
                logger.warning("Failed to persist folder chat messages: %s", e)

        try:
            cache.set(cache_key, json.dumps(jsonable_encoder({
                "question": request.question, "sql_query": sql_query,
                "answer": full_answer, "row_count": len(results), "results": results,
            })), ex=86400)
        except Exception as e:
            logger.warning("Folder cache write failed: %s", e)

    return StreamingResponse(_folder_event_stream(), media_type="text/event-stream")

async def ask_question(
    dataset_id: int,
    request: AskRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    readonly_db: Session = Depends(get_readonly_db),
    _: None = Depends(check_rate_limit),
):
    """Ask a plain-English question about a dataset.

    Returns a Server-Sent Events (SSE) stream with the following events:
    - event: sql      — the generated SQL query (emitted before execution)
    - event: token    — individual answer tokens streamed in real-time
    - event: done     — JSON payload with results + row_count
    - event: error    — error detail string if answer generation fails mid-stream
    """
    # --- Cache lookup ---
    # Include a hash of the history so that the same question asked in a
    # different conversational context does not return a stale cached answer.
    history_hash = hashlib.md5(
        json.dumps([h.model_dump() for h in request.history], sort_keys=True).encode()
    ).hexdigest()[:8]
    cache_key = f"query:{current_user.id}:{dataset_id}:{request.question.strip().lower()}:{history_hash}"

    try:
        cached = cache.get(cache_key)
        if cached:
            cached_data = json.loads(cached)

            async def _stream_cached() -> AsyncGenerator[str, None]:
                yield f"event: sql\ndata: {json.dumps(cached_data['sql_query'])}\n\n"
                for word in cached_data["answer"].split(" "):
                    yield f"event: token\ndata: {json.dumps(word + ' ')}\n\n"
                    await asyncio.sleep(0)
                done_payload = {
                    "row_count": cached_data["row_count"],
                    "results": cached_data["results"],
                    "cached": True,
                }
                yield f"event: done\ndata: {json.dumps(done_payload)}\n\n"

            return StreamingResponse(_stream_cached(), media_type="text/event-stream")
    except (redis_lib.RedisError, json.JSONDecodeError) as e:
        logger.warning("Cache read failed: %s", e)

    # --- Fetch dataset + relationships ---
    dataset = db.execute(
        select(Dataset).where(Dataset.id == dataset_id, Dataset.user_id == current_user.id)
    ).scalar_one_or_none()
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset with id {dataset_id} not found",
        )

    all_datasets = db.execute(
        select(Dataset).where(Dataset.user_id == current_user.id)
    ).scalars().all()

    # Scope the LLM context to only the datasets in the same folder.
    # If the frontend sends folder_dataset_ids, restrict to those IDs only
    # (always keeping the target dataset itself). This prevents the AI from
    # seeing or querying tables that belong to a different folder.
    if request.folder_dataset_ids is not None:
        allowed_folder_ids = set(request.folder_dataset_ids) | {dataset_id}
        all_datasets = [ds for ds in all_datasets if ds.id in allowed_folder_ids]

    owned_ids = [ds.id for ds in all_datasets]
    relationships = db.execute(
        select(Relationship)
        .options(
            selectinload(Relationship.source_dataset),
            selectinload(Relationship.target_dataset),
        )
        .where(
            Relationship.source_dataset_id.in_(owned_ids),
            Relationship.target_dataset_id.in_(owned_ids),
        )
    ).scalars().all()

    try:
        schema_prompt = build_schema_prompt(dataset, all_datasets, relationships)
    except Exception as e:
        logger.error("Failed to build schema prompt: %s", e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An internal error occurred while building the query context. Please try again.",
        )
    allowed_tables = {ds.table_name.lower() for ds in all_datasets}

    # --- SQL generation with retry loop ---
    print(f"DEBUG: allowed_tables={allowed_tables}")
    print(f"DEBUG: schema_prompt={schema_prompt}")
    sql_query: str | None = None
    results: list[dict[str, Any]] | None = None
    last_error: str | None = None
    previous_sql: str | None = None

    for attempt in range(settings.MAX_SQL_RETRIES):
        try:
            raw_sql = await _generate_sql(
                schema_prompt,
                request.question,
                request.history,
                error_context=last_error,
                previous_sql=previous_sql,
            )

            if raw_sql.strip() == "IRRELEVANT":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Your question does not appear to be relevant to this dataset. "
                        f"Please visit /datasets/{dataset_id} to see the dataset."
                    ),
                )

            candidate_sql = clean_sql(raw_sql)
            previous_sql = candidate_sql
            logger.info("Attempt %d — generated SQL: %s", attempt + 1, candidate_sql)

            try:
                candidate_sql = validate_sql(candidate_sql, allowed_tables)
            except UnsafeSQLError as e:
                last_error = f"SQL safety validation failed: {e}"
                logger.warning("Attempt %d — unsafe SQL (%s): %s", attempt + 1, e, candidate_sql)
                continue

            # Wrap in a hard LIMIT to guard against unbounded LLM-generated queries
            safe_query = f"SELECT * FROM ({candidate_sql}) AS _safe_query LIMIT 100"
            raw_results = readonly_db.execute(text(safe_query)).mappings().all()
            results = jsonable_encoder([
                {k: v for k, v in dict(row).items() if k != "_record_id"}
                for row in raw_results
            ])
            sql_query = candidate_sql
            break  # success

        except HTTPException:
            raise
        except Exception as e:
            last_error = str(e)
            logger.warning("Attempt %d — SQL execution failed: %s", attempt + 1, e)
            # PostgreSQL aborts the session after any error. Roll back so the next
            # retry attempt starts with a clean transaction.
            try:
                readonly_db.rollback()
            except Exception:
                pass

    if sql_query is None or results is None:
        logger.error(
            "All %d SQL generation attempts failed. Last error: %s",
            settings.MAX_SQL_RETRIES,
            last_error,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not generate a valid SQL query after multiple attempts. Please rephrase your question.",
        )

    # --- Streaming answer generation ---
    async def _event_stream() -> AsyncGenerator[str, None]:
        # 1. Emit the SQL immediately so the frontend can show it before the answer arrives
        yield f"event: sql\ndata: {json.dumps(sql_query)}\n\n"

        # 2. Stream the answer tokens
        accumulated_answer: list[str] = []
        try:
            stream = await asyncio.to_thread(
                client.chat.completions.create,
                model=settings.GROQ_MODEL,
                messages=[
                    {"role": "user", "content": build_answer_prompt(request.question, sql_query, results)},
                ],
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    accumulated_answer.append(delta)
                    yield f"event: token\ndata: {json.dumps(delta)}\n\n"
        except Exception as e:
            logger.error("Streaming answer generation failed: %s", e, exc_info=True)
            yield f"event: error\ndata: {json.dumps(str(e))}\n\n"
            return

        full_answer = "".join(accumulated_answer)

        # 3. Emit the done event with the full results payload
        done_payload = {"row_count": len(results), "results": results, "cached": False}
        yield f"event: done\ndata: {json.dumps(done_payload)}\n\n"

        # 4. Persist messages to the chat session (if a session_id was provided)
        if request.session_id is not None:
            try:
                session = db.execute(
                    select(ChatSession).where(
                        ChatSession.id == request.session_id,
                        ChatSession.user_id == current_user.id,
                    )
                ).scalar_one_or_none()
                if session:
                    db.add(ChatMessage(
                        session_id=session.id,
                        role="user",
                        content=request.question,
                    ))
                    db.add(ChatMessage(
                        session_id=session.id,
                        role="assistant",
                        content=full_answer,
                        sql=sql_query,
                        results=results,
                    ))
                    # Bump updated_at so the sessions list re-sorts correctly
                    from sqlalchemy import func as sqlfunc
                    session.updated_at = sqlfunc.now()
                    db.commit()
            except Exception as e:
                logger.warning("Failed to persist chat messages to session %s: %s", request.session_id, e)

        # 5. Cache the completed response for 24 hours
        try:
            cache_payload = {
                "question": request.question,
                "sql_query": sql_query,
                "answer": full_answer,
                "row_count": len(results),
                "results": results,
            }
            cache.set(cache_key, json.dumps(jsonable_encoder(cache_payload)), ex=86400)
        except Exception as e:
            logger.warning("Redis cache write failed: %s", e)

    return StreamingResponse(_event_stream(), media_type="text/event-stream")