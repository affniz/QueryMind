import re
import sqlalchemy as sa
from sqlalchemy import MetaData
import pandas as pd

DTYPE_MAP = {
    "int64":        sa.BigInteger,
    "float64":      sa.Float,
    "bool":         sa.Boolean,
    "datetime64[ns]": sa.DateTime,
    "object":       sa.Text,
}

def map_dtype(pandas_dtype: str) -> sa.types.TypeEngine:
    return DTYPE_MAP.get(str(pandas_dtype), sa.Text)()

def sanitize_column_name(name: str) -> str:
    name = name.strip().lower()
    name = re.sub(r"[\s\-]+", "_", name)
    name = re.sub(r"[^a-z0-9_]", "", name)
    if name and name[0].isdigit():
        name = f"_{name}"
    return name or "_col"

def generate_table_name(user_id: int, dataset_id: int, filename: str) -> str:
    base = filename.rsplit(".", 1)[0]
    sanitized = sanitize_column_name(base)
    return f"u{user_id}_ds{dataset_id}_{sanitized}"

def create_dynamic_table(engine: sa.Engine, table_name: str, df: pd.DataFrame) -> None:
    metadata = MetaData()
    columns = [
        sa.Column("_record_id", sa.BigInteger, primary_key=True, autoincrement=True)
    ]
    for col_name in df.columns:
        safe_name = sanitize_column_name(col_name)
        col_type = map_dtype(df[col_name].dtype)
        columns.append(sa.Column(safe_name, col_type, nullable=True))
    table = sa.Table(table_name, metadata, *columns)
    metadata.create_all(engine)

def insert_into_dynamic_table(engine: sa.Engine, table_name: str, df: pd.DataFrame) -> None:
    metadata = MetaData()
    metadata.reflect(bind=engine, only=[table_name])
    table = metadata.tables[table_name]
    safe_columns = {col: sanitize_column_name(col) for col in df.columns}
    rows = []
    for _, row in df.iterrows():
        rows.append({safe_columns[col]: row[col] for col in df.columns})
    if rows:
        with engine.begin() as conn:
            conn.execute(table.insert(), rows)

def drop_dynamic_table(engine: sa.Engine, table_name: str) -> None:
    quoted = sa.quoted_name(table_name, quote=True)
    with engine.begin() as conn:
        conn.execute(sa.text(f'DROP TABLE IF EXISTS "{quoted}"'))