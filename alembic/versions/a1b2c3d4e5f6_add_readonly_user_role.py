"""add_readonly_user_role

Revision ID: a1b2c3d4e5f6
Revises: 4939b7b88b58
Create Date: 2026-07-30 12:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy.engine.url import make_url
from app.config import settings

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '4939b7b88b58'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    parsed = make_url(settings.READONLY_DATABASE_URL)
    username = parsed.username
    password = parsed.password

    op.execute(f"""
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT FROM pg_catalog.pg_roles WHERE rolname = '{username}'
          ) THEN
            CREATE ROLE {username} WITH LOGIN PASSWORD '{password}';
          END IF;
        END
        $$;
    """)
    op.execute(f"GRANT USAGE ON SCHEMA public TO {username};")
    op.execute(f"GRANT SELECT ON ALL TABLES IN SCHEMA public TO {username};")
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO {username};")
    op.execute(f"REVOKE ALL ON TABLE users FROM {username};")
    op.execute(f"REVOKE ALL ON TABLE datasets FROM {username};")
    op.execute(f"REVOKE ALL ON TABLE relationships FROM {username};")
    op.execute(f"REVOKE ALL ON TABLE alembic_version FROM {username};")


def downgrade() -> None:
    parsed = make_url(settings.READONLY_DATABASE_URL)
    username = parsed.username

    op.execute(f"REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM {username};")
    op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM {username};")
    op.execute(f"REVOKE USAGE ON SCHEMA public FROM {username};")
    op.execute(f"DROP ROLE IF EXISTS {username};")
