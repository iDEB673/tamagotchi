"""add last_petted_at to pets

Revision ID: 63bb7268885b
Revises: 5f9a9d66ec5c
Create Date: 2026-10-20 17:20:27.550418

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '63bb7268885b'
down_revision: Union[str, Sequence[str], None] = '5f9a9d66ec5c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'pets',
        sa.Column('last_petted_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('pets', 'last_petted_at')
