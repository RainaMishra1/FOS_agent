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
    customer_address: Optional[str] = None
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
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class VisitListResponse(BaseModel):
    total: int
    items: List[VisitResponse]


class VisitStatusUpdateRequest(BaseModel):
    status: str
    geofence_verified: Optional[bool] = None
    completion_notes: Optional[str] = None
