from app.schemas.agent import AgentResponse, AgentListResponse
from app.schemas.customer import CustomerResponse, CustomerListResponse
from app.schemas.auth import (
    UserProfileResponse,
    AdminProvisionRequest,
    AgentLocationUpdateRequest,
)
from app.schemas.visit import (
    VisitResponse,
    VisitListResponse,
    VisitStatusUpdateRequest,
    AgentStats,
    AgentDashboardResponse,
    AgentDutyUpdateRequest,
)
from app.schemas.dashboard import (
    DashboardSummaryResponse,
    KpiSummary,
    DashboardActiveAgent,
    DashboardRecentAssignment,
    DashboardUpcomingVisit,
    WeeklyRunRateDay,
)

__all__ = [
    "AgentResponse",
    "AgentListResponse",
    "CustomerResponse",
    "CustomerListResponse",
    "UserProfileResponse",
    "AdminProvisionRequest",
    "AgentLocationUpdateRequest",
    "VisitResponse",
    "VisitListResponse",
    "VisitStatusUpdateRequest",
    "AgentStats",
    "AgentDashboardResponse",
    "AgentDutyUpdateRequest",
    "DashboardSummaryResponse",
    "KpiSummary",
    "DashboardActiveAgent",
    "DashboardRecentAssignment",
    "DashboardUpcomingVisit",
    "WeeklyRunRateDay",
]
