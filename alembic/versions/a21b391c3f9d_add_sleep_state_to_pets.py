"""add sleep state to pets

Revision ID: a21b391c3f9d
Revises: 63bb7268885b
Create Date: 2026-10-20 22:15:18.690212

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a21b391c3f9d'
down_revision: Union[str, Sequence[str], None] = '63bb7268885b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'pets',
        sa.Column('sleep_until', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'pets',
        sa.Column('sleep_started_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'pets',
        sa.Column('sleep_gain', sa.Float(), nullable=True),
    )
    op.add_column(
        'pets',
        sa.Column('night_sleep_start', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'pets',
        sa.Column('night_sleep_wake', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('pets', 'night_sleep_wake')
    op.drop_column('pets', 'night_sleep_start')
    op.drop_column('pets', 'sleep_gain')
    op.drop_column('pets', 'sleep_started_at')
    op.drop_column('pets', 'sleep_until')
