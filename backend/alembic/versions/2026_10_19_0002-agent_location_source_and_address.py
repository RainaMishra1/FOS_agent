"""add address and location_source to agents table

Revision ID: 0002_agent_loc
Revises: 2026_10_19_0001
Create Date: 2026-10-19 21:50:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002_agent_loc'
down_revision: Union[str, None] = '2026_10_19_0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing_columns = {
        column['name']
        for column in sa.inspect(bind).get_columns('agents', schema='public')
    }
    if 'address' not in existing_columns:
        op.add_column('agents', sa.Column('address', sa.String(length=500), nullable=True), schema='public')
    if 'location_source' not in existing_columns:
        op.add_column(
            'agents',
            sa.Column('location_source', sa.String(length=50), nullable=False, server_default='unknown'),
            schema='public',
        )


def downgrade() -> None:
    op.drop_column('agents', 'location_source')
    op.drop_column('agents', 'address')
