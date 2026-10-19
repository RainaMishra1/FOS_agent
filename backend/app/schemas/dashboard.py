import uuid
from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class KpiSummary(BaseModel):
    total_field_agents: int
    agents_currently_active: int
    total_customers: int
    total_leads: int
    visits_scheduled_today: int
    visits_completed_today: int
    completed_percentage: float
    pending_assignments: int
    active_change: str = "+0 today"
    pending_change: str = "Queue active"


class DashboardRecentAssignment(BaseModel):
    id: uuid.UUID
    assignment_code: Optional[str] = None
    customer_name: str
    address: Optional[str] = None
    agent_name: str
    scheduled_time: str
    scheduled_date: date
    priority: str
    status: str

    model_config = ConfigDict(from_attributes=True)


class DashboardActiveAgent(BaseModel):
    id: uuid.UUID
    agent_code: Optional[str] = None
    name: str
    initials: str
    status: str
    territory: Optional[str] = None
    completed_visits: int = 0
    assigned_tasks: int = 0
    battery_level: Optional[int] = None
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None
    last_location_update: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class DashboardUpcomingVisit(BaseModel):
    id: uuid.UUID
    visit_code: Optional[str] = None
    customer_name: str
    agent_name: str
    address: Optional[str] = None
    scheduled_time: str
    scheduled_date: date
    status: str
    geofence_verified: bool = False

    model_config = ConfigDict(from_attributes=True)


class WeeklyRunRateDay(BaseModel):
    day: str
    date: date
    scheduled: int
    completed: int
    rate: float


class DashboardSummaryResponse(BaseModel):
    kpi: KpiSummary
    active_agents: List[DashboardActiveAgent]
    recent_assignments: List[DashboardRecentAssignment]
    today_visits: List[DashboardUpcomingVisit]
    weekly_activity: List[WeeklyRunRateDay]
    as_of_date: date
    avg_geofence_accuracy_meters: Optional[float] = None
