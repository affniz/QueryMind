import io
import re
import sqlalchemy as sa
from sqlalchemy import MetaData
import pandas as pd

DTYPE_MAP = {
    "int64":          sa.BigInteger,
    "float64":        sa.Float,
    "bool":           sa.Boolean,
    "datetime64[ns]": sa.DateTime,
    "object":         sa.Text,
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

    with engine.begin() as conn:
        conn.execute(sa.text(
            f'GRANT SELECT ON TABLE "{table_name}" TO readonly_user'
        ))


def insert_into_dynamic_table(engine: sa.Engine, table_name: str, df: pd.DataFrame) -> None:
    metadata = MetaData()
    metadata.reflect(bind=engine, only=[table_name])

    safe_columns = {col: sanitize_column_name(col) for col in df.columns}
    target_cols = list(safe_columns.values())

    buffer = io.StringIO()
    df_safe = df.rename(columns=safe_columns)
    df_safe.to_csv(buffer, index=False, header=False, na_rep="")
    buffer.seek(0)

    raw_conn = engine.raw_connection()
    try:
        cursor = raw_conn.cursor()
        col_list = ", ".join(f'"{c}"' for c in target_cols)
        with cursor.copy(
            f"""COPY "{table_name}" ({col_list}) FROM STDIN WITH (FORMAT csv, NULL '')"""
        ) as copy:
            while True:
                chunk = buffer.read(65536)
                if not chunk:
                    break
                copy.write(chunk.encode("utf-8"))
        raw_conn.commit()
    finally:
        raw_conn.close()


def drop_dynamic_table(engine: sa.Engine, table_name: str) -> None:
    with engine.begin() as conn:
        conn.execute(sa.text(f'DROP TABLE IF EXISTS "{table_name}"'))