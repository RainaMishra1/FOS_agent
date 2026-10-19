import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class AgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    agent_code: Optional[str] = None
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    status: str
    territory: Optional[str] = None
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None
    battery_level: Optional[int] = None
    last_location_update: Optional[datetime] = None
    assigned_tasks: int = 0
    completed_visits: int = 0
    created_at: datetime


class AgentListResponse(BaseModel):
    total: int
    skip: int
    limit: int
    items: List[AgentResponse]
