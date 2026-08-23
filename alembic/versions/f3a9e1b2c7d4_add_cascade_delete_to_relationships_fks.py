"""add_cascade_delete_to_relationships_fks

Revision ID: f3a9e1b2c7d4
Revises: 4939b7b88b58
Create Date: 2026-08-23 16:00:00.000000

Drops the existing non-cascading foreign key constraints on the
relationships table and recreates them with ON DELETE CASCADE
so that deleting a dataset automatically removes any relationship rows
that reference it, preventing orphaned FK rows.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f3a9e1b2c7d4"
down_revision: Union[str, Sequence[str], None] = "c4bbe9a39edf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Replace non-cascading FKs with ON DELETE CASCADE variants."""
    op.drop_constraint(
        "relationships_source_dataset_id_fkey",
        "relationships",
        type_="foreignkey",
    )
    op.drop_constraint(
        "relationships_target_dataset_id_fkey",
        "relationships",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "relationships_source_dataset_id_fkey",
        "relationships",
        "datasets",
        ["source_dataset_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "relationships_target_dataset_id_fkey",
        "relationships",
        "datasets",
        ["target_dataset_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    """Revert back to non-cascading FKs."""
    op.drop_constraint(
        "relationships_source_dataset_id_fkey",
        "relationships",
        type_="foreignkey",
    )
    op.drop_constraint(
        "relationships_target_dataset_id_fkey",
        "relationships",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "relationships_source_dataset_id_fkey",
        "relationships",
        "datasets",
        ["source_dataset_id"],
        ["id"],
    )
    op.create_foreign_key(
        "relationships_target_dataset_id_fkey",
        "relationships",
        "datasets",
        ["target_dataset_id"],
        ["id"],
    )
