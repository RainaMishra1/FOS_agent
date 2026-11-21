"""Territories (agent polygons) and agent-generated lead verification.

Revision ID: 0004_territories_leads
Revises: 0003_profile_auth_link
Create Date: 2026-11-22
"""
from typing import Sequence, Union

import geoalchemy2
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_territories_leads"
down_revision: Union[str, None] = "0003_profile_auth_link"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "territories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("color", sa.String(20), nullable=False, server_default="#2E5A44"),
        sa.Column("agent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "boundary",
            geoalchemy2.types.Geometry(geometry_type="POLYGON", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column("area_sq_km", sa.Float(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_territories_agent_id", "territories", ["agent_id"])
    op.execute("CREATE INDEX IF NOT EXISTS idx_territories_boundary ON territories USING GIST (boundary)")

    op.add_column("leads", sa.Column("source", sa.String(20), nullable=False, server_default="admin"))
    op.add_column("leads", sa.Column("verification_status", sa.String(20), nullable=False, server_default="approved"))
    op.add_column("leads", sa.Column("created_by_agent_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agents.id", ondelete="SET NULL"), nullable=True))
    op.add_column("leads", sa.Column("territory_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("territories.id", ondelete="SET NULL"), nullable=True))
    op.add_column("leads", sa.Column("captured_latitude", sa.Float(), nullable=True))
    op.add_column("leads", sa.Column("captured_longitude", sa.Float(), nullable=True))
    op.add_column("leads", sa.Column("captured_accuracy_meters", sa.Float(), nullable=True))
    op.add_column("leads", sa.Column("captured_distance_meters", sa.Float(), nullable=True))
    op.add_column("leads", sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("leads", sa.Column("reviewed_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True))
    op.add_column("leads", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("leads", sa.Column("rejection_reason", sa.Text(), nullable=True))
    op.create_index("ix_leads_verification_status", "leads", ["verification_status"])
    op.create_index("ix_leads_created_by_agent_id", "leads", ["created_by_agent_id"])
    op.create_index("ix_leads_territory_id", "leads", ["territory_id"])


def downgrade() -> None:
    op.drop_index("ix_leads_territory_id", table_name="leads")
    op.drop_index("ix_leads_created_by_agent_id", table_name="leads")
    op.drop_index("ix_leads_verification_status", table_name="leads")
    for column in (
        "rejection_reason", "reviewed_at", "reviewed_by_id", "submitted_at",
        "captured_distance_meters", "captured_accuracy_meters", "captured_longitude",
        "captured_latitude", "territory_id", "created_by_agent_id",
        "verification_status", "source",
    ):
        op.drop_column("leads", column)
    op.execute("DROP INDEX IF EXISTS idx_territories_boundary")
    op.drop_index("ix_territories_agent_id", table_name="territories")
    op.drop_table("territories")
