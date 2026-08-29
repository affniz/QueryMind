"""add_folders_table_and_folder_id_to_datasets

Revision ID: a8f2e6d1b3c5
Revises: f3a9e1b2c7d4
Create Date: 2026-08-29 21:36:00.000000

Creates the folders table and adds an optional folder_id FK column on
datasets so that folder/dataset assignments are persisted server-side
instead of in browser localStorage.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a8f2e6d1b3c5"
down_revision: Union[str, Sequence[str], None] = "f3a9e1b2c7d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create folders table and add folder_id to datasets."""
    op.create_table(
        "folders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_folders_id"), "folders", ["id"], unique=False)

    op.add_column(
        "datasets",
        sa.Column("folder_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "datasets_folder_id_fkey",
        "datasets",
        "folders",
        ["folder_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Drop folder_id from datasets and drop folders table."""
    op.drop_constraint("datasets_folder_id_fkey", "datasets", type_="foreignkey")
    op.drop_column("datasets", "folder_id")
    op.drop_index(op.f("ix_folders_id"), table_name="folders")
    op.drop_table("folders")
