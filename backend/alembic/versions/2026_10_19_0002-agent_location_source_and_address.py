"""add address and location_source to agents table

Revision ID: 0002_agent_loc
Revises: 0001_core_models
Create Date: 2026-10-19 21:50:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002_agent_loc'
down_revision: Union[str, None] = '0001_core_models'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('agents', sa.Column('address', sa.String(length=500), nullable=True))
    op.add_column('agents', sa.Column('location_source', sa.String(length=50), nullable=False, server_default='unknown'))


def downgrade() -> None:
    op.drop_column('agents', 'location_source')
    op.drop_column('agents', 'address')
