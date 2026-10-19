import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.profile import Profile
    from app.models.lead import Lead
    from app.models.visit import Visit
    from app.models.assignment import Assignment
    from app.models.agent_location import AgentLocation


class Agent(Base, TimestampMixin):
    """
    Field Agent operational entity linked to Profile.
    Tracks availability status, battery, territory, and current geographic coordinates.
    """
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    agent_code: Mapped[Optional[str]] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=True,
        comment="Human-readable agent identifier e.g. AGT-101",
    )
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="active",
        index=True,
        comment="Operational status: active, inactive, busy, break",
    )
    territory: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    current_latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_location = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=True,
        comment="PostGIS spatial point for agent current location",
    )
    battery_level: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_location_update: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    profile: Mapped["Profile"] = relationship("Profile", back_populates="agent")
    leads: Mapped[List["Lead"]] = relationship("Lead", back_populates="assigned_agent")
    visits: Mapped[List["Visit"]] = relationship("Visit", back_populates="agent")
    assignments: Mapped[List["Assignment"]] = relationship("Assignment", back_populates="agent")
    location_logs: Mapped[List["AgentLocation"]] = relationship(
        "AgentLocation",
        back_populates="agent",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Agent {self.agent_code or self.id} ({self.status})>"
