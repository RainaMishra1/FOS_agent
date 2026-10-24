import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import Float, Integer, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.agent import Agent


class AgentLocation(Base):
    """
    Time-series location log for field agents.
    Tracks breadcrumb coordinates, accuracy, battery, and recorded timestamp.
    """
    __tablename__ = "agent_locations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    location = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=True,
        comment="PostGIS point for spatial indexing",
    )
    gps_accuracy: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        comment="GPS accuracy radius in meters (policy threshold configured by backend)",
    )
    battery_level: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # Relationships
    agent: Mapped["Agent"] = relationship("Agent", back_populates="location_logs")

    def __repr__(self) -> str:
        return f"<AgentLocation {self.agent_id} ({self.latitude}, {self.longitude}) at {self.recorded_at}>"
