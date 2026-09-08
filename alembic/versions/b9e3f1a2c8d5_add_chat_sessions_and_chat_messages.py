"""add_chat_sessions_and_chat_messages

Revision ID: b9e3f1a2c8d5
Revises: a8f2e6d1b3c5
Create Date: 2026-09-08 22:14:00.000000

Creates chat_sessions and chat_messages tables to persist per-dataset
conversation history including SQL queries and result rows.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "b9e3f1a2c8d5"
down_revision: Union[str, Sequence[str], None] = "a8f2e6d1b3c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create chat_sessions and chat_messages tables."""
    op.create_table(
        "chat_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("dataset_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_chat_sessions_id"), "chat_sessions", ["id"], unique=False)

    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("sql", sa.Text(), nullable=True),
        sa.Column("results", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["session_id"], ["chat_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_chat_messages_id"), "chat_messages", ["id"], unique=False)


def downgrade() -> None:
    """Drop chat_messages and chat_sessions tables."""
    op.drop_index(op.f("ix_chat_messages_id"), table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_index(op.f("ix_chat_sessions_id"), table_name="chat_sessions")
    op.drop_table("chat_sessions")
