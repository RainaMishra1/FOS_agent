import uuid
from typing import TYPE_CHECKING, Optional

from geoalchemy2 import Geometry
from sqlalchemy import Boolean, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.agent import Agent
    from app.models.profile import Profile


class Territory(Base, TimestampMixin):
    """Fixed geographical area drawn by an admin and owned by exactly one agent.

    Territories never overlap, so every point on the map belongs to at most one
    agent. Agents may only create leads inside their own territories, and
    dispatch suggestions pick the agent whose territory contains the lead.
    """

    __tablename__ = "territories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="#2E5A44", server_default="#2E5A44")
    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    boundary = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326, spatial_index=True),
        nullable=False,
        comment="Territory polygon in WGS84 (longitude, latitude)",
    )
    area_sq_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_by_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True
    )

    agent: Mapped["Agent"] = relationship("Agent")
    created_by: Mapped[Optional["Profile"]] = relationship("Profile")

    def __repr__(self) -> str:
        return f"<Territory {self.name} agent={self.agent_id}>"
