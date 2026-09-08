"""folder_scoped_chat_sessions

Revision ID: c7d2e4f1a9b3
Revises: b9e3f1a2c8d5
Create Date: 2026-09-08 22:45:00.000000

Makes chat_sessions.dataset_id nullable and adds an optional folder_id FK
so that chat sessions can be scoped to a folder instead of a single dataset.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c7d2e4f1a9b3"
down_revision: Union[str, Sequence[str], None] = "b9e3f1a2c8d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Make dataset_id nullable and add folder_id to chat_sessions."""
    # Allow dataset_id to be NULL (folder-scoped sessions have no dataset_id)
    op.alter_column("chat_sessions", "dataset_id", nullable=True)

    # Add folder_id FK column
    op.add_column(
        "chat_sessions",
        sa.Column("folder_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "chat_sessions_folder_id_fkey",
        "chat_sessions",
        "folders",
        ["folder_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    """Remove folder_id and restore dataset_id as NOT NULL."""
    op.drop_constraint("chat_sessions_folder_id_fkey", "chat_sessions", type_="foreignkey")
    op.drop_column("chat_sessions", "folder_id")
    # Note: this will fail if any rows have dataset_id = NULL
    op.alter_column("chat_sessions", "dataset_id", nullable=False)
