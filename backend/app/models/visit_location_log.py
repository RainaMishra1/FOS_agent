import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from sqlalchemy import String, Float, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geometry

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.visit import Visit


class VisitLocationLog(Base):
    """
    Audit log of location verification events during field visits.
    Records coordinates, geofence accuracy, distance from site, and event type.
    """
    __tablename__ = "visit_location_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    visit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("visits.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        index=True,
        comment="Event type: check_in, completion, geofence_verified, in_transit",
    )
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    location = mapped_column(
        Geometry(geometry_type="POINT", srid=4326, spatial_index=True),
        nullable=True,
        comment="PostGIS spatial point of the verification event",
    )
    accuracy_meters: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    distance_to_customer_meters: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        comment="Distance from agent to customer site at event time (policy < 100m)",
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    # Relationships
    visit: Mapped["Visit"] = relationship("Visit", back_populates="location_logs")

    def __repr__(self) -> str:
        return f"<VisitLocationLog {self.event_type} for Visit {self.visit_id} at {self.recorded_at}>"
