import uuid
from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

HEX_COLOR = r"^#[0-9A-Fa-f]{6}$"


# ------------------------------------------------------------------ territories
class TerritoryCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    agent_id: uuid.UUID
    color: str = Field("#2E5A44", pattern=HEX_COLOR)
    # Outline as [latitude, longitude] points in drawing order.
    points: List[List[float]] = Field(..., min_length=3, max_length=500)


class TerritoryUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    agent_id: Optional[uuid.UUID] = None
    color: Optional[str] = Field(None, pattern=HEX_COLOR)
    points: Optional[List[List[float]]] = Field(None, min_length=3, max_length=500)


class TerritoryResponse(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    agent_id: uuid.UUID
    agent_name: Optional[str] = None
    agent_code: Optional[str] = None
    area_sq_km: Optional[float] = None
    # Outline as [latitude, longitude] points (closing point omitted).
    points: List[List[float]]
    lead_count: int = 0
    created_at: datetime


class TerritoryListResponse(BaseModel):
    items: List[TerritoryResponse]


# ------------------------------------------------------------------ agent leads
class AgentLeadCreateRequest(BaseModel):
    customer_name: str = Field(..., min_length=1, max_length=255)
    phone: str = Field(..., min_length=6, max_length=50)
    email: Optional[str] = Field(None, max_length=255)
    company: Optional[str] = Field(None, max_length=255)
    address: str = Field(..., min_length=5, max_length=500)
    city: str = Field(..., min_length=1, max_length=100)
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    priority: Literal["high", "medium", "low"] = "medium"
    notes: Optional[str] = Field(None, max_length=2000)


class LeadReviewResponse(BaseModel):
    id: uuid.UUID
    lead_code: Optional[str] = None
    source: str
    verification_status: str
    assignment_status: str
    priority: str
    notes: Optional[str] = None
    customer_id: uuid.UUID
    customer_name: str
    company: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: str
    city: str
    latitude: float
    longitude: float
    created_by_agent_id: Optional[uuid.UUID] = None
    created_by_agent_name: Optional[str] = None
    created_by_agent_code: Optional[str] = None
    assigned_agent_id: Optional[uuid.UUID] = None
    territory_id: Optional[uuid.UUID] = None
    territory_name: Optional[str] = None
    captured_latitude: Optional[float] = None
    captured_longitude: Optional[float] = None
    captured_accuracy_meters: Optional[float] = None
    captured_distance_meters: Optional[float] = None
    submitted_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    created_at: datetime


class LeadReviewListResponse(BaseModel):
    total: int
    pending: int
    items: List[LeadReviewResponse]


class LeadApproveRequest(BaseModel):
    schedule_visit: bool = False
    scheduled_date: Optional[date] = None
    scheduled_time: Optional[str] = Field(None, max_length=50)
    priority: Optional[Literal["high", "medium", "low"]] = None


class LeadRejectRequest(BaseModel):
    reason: str = Field(..., min_length=3, max_length=1000)
