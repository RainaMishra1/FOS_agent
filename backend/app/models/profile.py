import uuid
from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.agent import Agent
    from app.models.assignment import Assignment


class Profile(Base, TimestampMixin):
    """
    Application Profile linked to Supabase Auth by auth_user_id.
    Passwords are managed by Supabase and never stored here.
    """
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        comment="Stable application profile identifier",
    )
    auth_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        unique=True,
        nullable=True,
        index=True,
        comment="Linked Supabase Auth user; null until the account is provisioned",
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True, nullable=True)
    role: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="agent",
        comment="User role: 'admin' or 'agent'",
    )
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Relationships
    agent: Mapped[Optional["Agent"]] = relationship(
        "Agent",
        back_populates="profile",
        uselist=False,
        cascade="all, delete-orphan",
    )
    assignments_created: Mapped[List["Assignment"]] = relationship(
        "Assignment",
        back_populates="assigned_by",
    )

    def __repr__(self) -> str:
        return f"<Profile {self.full_name} ({self.role})>"
