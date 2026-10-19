import uuid
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.agent import Agent
    from app.models.assignment import Assignment


class Lead(Base, TimestampMixin):
    """
    Lead / Demand Request entity.
    Tracks customer requirements, priority weighting, and assignment dispatch status.
    """
    __tablename__ = "leads"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    lead_code: Mapped[Optional[str]] = mapped_column(
        String(50),
        unique=True,
        index=True,
        nullable=True,
        comment="Human-readable lead identifier e.g. LEAD-8850",
    )
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assigned_agent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    priority: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="medium",
        index=True,
        comment="Priority level: high, medium, low",
    )
    assignment_status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="pending",
        index=True,
        comment="Task assignment status: pending, assigned, active, completed, delayed",
    )
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer", back_populates="leads")
    assigned_agent: Mapped[Optional["Agent"]] = relationship("Agent", back_populates="leads")
    assignments: Mapped[List["Assignment"]] = relationship(
        "Assignment",
        back_populates="lead",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Lead {self.lead_code or self.id} ({self.priority}/{self.assignment_status})>"
