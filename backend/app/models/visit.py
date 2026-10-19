import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import String, Boolean, Integer, Date, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.agent import Agent
    from app.models.visit_location_log import VisitLocationLog


class Visit(Base, TimestampMixin):
    """
    Scheduled Field Visit entity.
    Represents an on-site customer inspection or task requiring geofenced check-in.
    """
    __tablename__ = "visits"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    visit_code: Mapped[Optional[str]] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=True,
        comment="Human-readable visit identifier e.g. VST-101",
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    scheduled_time: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="pending",
        index=True,
        comment="Visit status: pending, in_progress, completed, delayed",
    )
    geofence_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    check_in_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completion_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    estimated_duration_minutes: Mapped[int] = mapped_column(Integer, default=45, nullable=False)
    purpose: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer", back_populates="visits")
    agent: Mapped["Agent"] = relationship("Agent", back_populates="visits")
    location_logs: Mapped[List["VisitLocationLog"]] = relationship(
        "VisitLocationLog",
        back_populates="visit",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Visit {self.visit_code or self.id} ({self.status})>"
