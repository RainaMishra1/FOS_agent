import re
import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class AgentCreateRequest(BaseModel):
    auth_user_id: uuid.UUID = Field(..., description="UUID of the previously invited Supabase Auth user")
    name: str = Field(..., min_length=2, max_length=255, description="Full name of field representative")
    email: str = Field(..., max_length=255, description="Work email address")
    phone: Optional[str] = Field(None, max_length=50, description="Contact phone number")
    agent_code: str = Field(..., min_length=2, max_length=50, description="Unique employee / agent ID e.g. AGT-102")
    status: str = Field(default="active", description="Operational status: active, inactive, busy, break")
    territory: Optional[str] = Field(None, max_length=100, description="Assigned operational territory")
    address: Optional[str] = Field(None, max_length=500, description="Base physical address or operating hub")
    latitude: Optional[float] = Field(None, ge=-90.0, le=90.0, description="Optional initial latitude (-90 to 90)")
    longitude: Optional[float] = Field(None, ge=-180.0, le=180.0, description="Optional initial longitude (-180 to 180)")

    @model_validator(mode="after")
    def validate_coordinates(self) -> "AgentCreateRequest":
        has_lat = self.latitude is not None
        has_lng = self.longitude is not None
        if (has_lat and not has_lng) or (has_lng and not has_lat):
            raise ValueError("Both latitude and longitude must be supplied together, or both omitted.")
        return self

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        clean = v.strip().lower()
        if not re.match(r"^[\w\.\+\-]+@[a-zA-Z0-9\-]+\.[a-zA-Z0-9\-\.]+$", clean):
            raise ValueError(f"Invalid email address format: '{v}'")
        return clean

    @field_validator("agent_code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        clean = v.strip().upper()
        if len(clean) < 2:
            raise ValueError("Employee ID must be at least 2 characters")
        return clean

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        clean = v.strip()
        if len(clean) < 2:
            raise ValueError("Full name must be at least 2 characters")
        return clean

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        valid_statuses = {"active", "inactive", "busy", "break"}
        clean = v.strip().lower()
        if clean not in valid_statuses:
            raise ValueError(f"Invalid status '{v}'. Must be one of: {', '.join(sorted(valid_statuses))}")
        return clean


class AgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    auth_linked: bool = False
    agent_code: Optional[str] = None
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    status: str
    territory: Optional[str] = None
    address: Optional[str] = None
    location_source: str = "unknown"
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None
    battery_level: Optional[int] = None
    last_location_update: Optional[datetime] = None
    assigned_tasks: int = 0
    completed_visits: int = 0
    created_at: Optional[datetime] = None


class AgentListResponse(BaseModel):
    total: int
    skip: int
    limit: int
    items: List[AgentResponse]


class AgentInvitationResponse(BaseModel):
    agent_id: uuid.UUID
    linked: bool
    invitation_sent: bool
    detail: str
