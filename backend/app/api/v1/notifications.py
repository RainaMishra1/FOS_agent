"""Admin notifications: an agent checked in to a visit (in progress) or completed it."""

from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.auth import require_admin
from app.db.session import get_db
from app.models.agent import Agent
from app.models.profile import Profile
from app.models.visit import Visit
from app.services.admin_events import VisitRecord, visit_events

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class AdminNotification(BaseModel):
    id: str
    kind: str  # "started" | "completed"
    at: datetime
    visit_id: str
    visit_code: Optional[str] = None
    agent_name: str
    agent_code: Optional[str] = None
    customer_name: str
    geofence_verified: bool


class AdminNotificationList(BaseModel):
    items: List[AdminNotification]
    server_time: datetime


@router.get("", response_model=AdminNotificationList)
async def list_admin_notifications(
    days: int = Query(7, ge=1, le=30, description="How far back to look"),
    limit: int = Query(40, ge=1, le=200),
    current_admin: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    rows = (
        await db.execute(
            select(Visit)
            .options(joinedload(Visit.agent).joinedload(Agent.profile), joinedload(Visit.customer))
            .where(or_(Visit.check_in_time >= since, Visit.completed_time >= since))
            .order_by(Visit.updated_at.desc())
            .limit(limit * 2)
        )
    ).unique().scalars().all()

    records = [
        VisitRecord(
            visit_id=str(visit.id),
            visit_code=visit.visit_code,
            agent_name=(visit.agent.profile.full_name if visit.agent and visit.agent.profile else None) or (visit.agent.agent_code if visit.agent else None) or "Agent",
            agent_code=visit.agent.agent_code if visit.agent else None,
            customer_name=visit.customer.name if visit.customer else "Customer",
            check_in_time=visit.check_in_time,
            completed_time=visit.completed_time,
            geofence_verified=bool(visit.geofence_verified),
        )
        for visit in rows
    ]
    return AdminNotificationList(items=visit_events(records, since, limit), server_time=now)
