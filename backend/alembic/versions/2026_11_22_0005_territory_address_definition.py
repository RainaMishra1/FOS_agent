"""Territories defined by address + radius or a from-to box; one region per agent.

Revision ID: 0005_territory_address
Revises: 0004_territories_leads
Create Date: 2026-11-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_territory_address"
down_revision: Union[str, None] = "0004_territories_leads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = (
    ("definition_type", sa.String(20), {"nullable": False, "server_default": "drawn"}),
    ("start_label", sa.String(500), {"nullable": True}),
    ("start_latitude", sa.Float(), {"nullable": True}),
    ("start_longitude", sa.Float(), {"nullable": True}),
    ("end_label", sa.String(500), {"nullable": True}),
    ("end_latitude", sa.Float(), {"nullable": True}),
    ("end_longitude", sa.Float(), {"nullable": True}),
    ("radius_meters", sa.Float(), {"nullable": True}),
)


def upgrade() -> None:
    for name, type_, kwargs in COLUMNS:
        op.add_column("territories", sa.Column(name, type_, **kwargs))
    # Each agent has at most one active region.
    op.create_index(
        "uq_territories_one_active_per_agent",
        "territories",
        ["agent_id"],
        unique=True,
        postgresql_where=sa.text("is_active"),
    )


def downgrade() -> None:
    op.drop_index("uq_territories_one_active_per_agent", table_name="territories")
    for name, _, _ in reversed(COLUMNS):
        op.drop_column("territories", name)
