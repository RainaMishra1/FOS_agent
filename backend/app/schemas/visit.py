import uuid
from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class VisitResponse(BaseModel):
    id: uuid.UUID
    visit_code: Optional[str] = None
    customer_id: uuid.UUID
    agent_id: uuid.UUID
    customer_name: Optional[str] = None
    customer_company: Optional[str] = None
    customer_contact_person: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    customer_address: Optional[str] = None
    customer_city: Optional[str] = None
    customer_latitude: Optional[float] = None
    customer_longitude: Optional[float] = None
    scheduled_date: date
    scheduled_time: str
    status: str
    geofence_verified: bool
    check_in_time: Optional[datetime] = None
    completed_time: Optional[datetime] = None
    completion_notes: Optional[str] = None
    order_index: int
    estimated_duration_minutes: int
    purpose: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class VisitListResponse(BaseModel):
    total: int
    items: List[VisitResponse]


class VisitStatusUpdateRequest(BaseModel):
    status: str
    geofence_verified: Optional[bool] = None
    completion_notes: Optional[str] = None


class AgentStats(BaseModel):
    today_total: int
    today_completed: int
    today_remaining: int
    completion_percentage: float
    next_visit: Optional[VisitResponse] = None


class AgentDutyUpdateRequest(BaseModel):
    status: str  # active, off_duty, break


from app.schemas.agent import AgentResponse  # noqa: E402


class AgentDashboardResponse(BaseModel):
    agent: AgentResponse
    stats: AgentStats
    today_visits: List[VisitResponse]
    upcoming_visits: List[VisitResponse]
    recent_history: List[VisitResponse]
    as_of_date: date

