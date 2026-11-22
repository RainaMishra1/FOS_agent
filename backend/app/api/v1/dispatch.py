"""Read-only Dispatch & Lead Allocation View data."""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.auth import require_admin
from app.db.session import get_db
from app.models.agent import Agent
from app.models.lead import Lead
from app.models.profile import Profile
from app.models.territory import Territory
from app.models.visit import Visit
from app.services.dispatch_stages import VisitSnapshot, latest_visit, lead_stage

router = APIRouter(prefix="/dispatch", tags=["Dispatch View"])


class DispatchLead(BaseModel):
    id: uuid.UUID
    lead_code: Optional[str] = None
    stage: str
    priority: str
    source: str
    customer_name: str
    company: Optional[str] = None
    address: str
    city: str
    latitude: float
    longitude: float
    assigned_agent_id: Optional[uuid.UUID] = None
    created_by_agent_id: Optional[uuid.UUID] = None
    territory_id: Optional[uuid.UUID] = None
    next_visit_date: Optional[str] = None
    created_at: datetime
    waiting_hours: Optional[float] = None  # for unassigned / awaiting verification


class DispatchAgent(BaseModel):
    id: uuid.UUID
    name: str
    agent_code: Optional[str] = None
    status: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    last_location_update: Optional[datetime] = None
    territory_id: Optional[uuid.UUID] = None
    territory_name: Optional[str] = None


class DispatchOverview(BaseModel):
    generated_at: datetime
    leads: List[DispatchLead]
    agents: List[DispatchAgent]


@router.get("/overview", response_model=DispatchOverview)
async def dispatch_overview(
    limit: int = Query(2000, ge=1, le=5000),
    current_admin: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> DispatchOverview:
    """Every lead with its location and dispatch stage, plus every agent. Changes nothing."""
    now = datetime.now(timezone.utc)

    leads = (await db.execute(
        select(Lead).options(joinedload(Lead.customer)).order_by(Lead.created_at.desc()).limit(limit)
    )).unique().scalars().all()

    # Visits belong to a customer and an agent; a lead's progress is its latest
    # visit for the same customer by the agent who owns the lead.
    customer_ids = {lead.customer_id for lead in leads}
    visits_by_pair: dict = {}
    if customer_ids:
        rows = (await db.execute(
            select(Visit.customer_id, Visit.agent_id, Visit.status, Visit.scheduled_date, Visit.completed_time)
            .where(Visit.customer_id.in_(customer_ids))
        )).all()
        for customer_id, agent_id, status, scheduled_date, completed_time in rows:
            visits_by_pair.setdefault((customer_id, agent_id), []).append(
                VisitSnapshot(status, scheduled_date, completed_time)
            )

    out_leads: list[DispatchLead] = []
    for lead in leads:
        customer = lead.customer
        if customer is None or customer.latitude is None or customer.longitude is None:
            continue
        visits = visits_by_pair.get((lead.customer_id, lead.assigned_agent_id), [])
        visit = latest_visit(visits)
        stage = lead_stage(lead.verification_status, lead.assigned_agent_id, visit)
        if stage is None:
            continue
        upcoming = sorted(v.scheduled_date for v in visits if v.status in ("pending", "delayed"))
        waiting = None
        if stage in ("unassigned", "awaiting_verification"):
            started = lead.submitted_at or lead.created_at
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            waiting = round((now - started).total_seconds() / 3600, 1)
        out_leads.append(DispatchLead(
            id=lead.id,
            lead_code=lead.lead_code,
            stage=stage,
            priority=lead.priority,
            source=lead.source,
            customer_name=customer.name,
            company=customer.company,
            address=customer.address,
            city=customer.city,
            latitude=customer.latitude,
            longitude=customer.longitude,
            assigned_agent_id=lead.assigned_agent_id,
            created_by_agent_id=lead.created_by_agent_id,
            territory_id=lead.territory_id,
            next_visit_date=upcoming[0].isoformat() if upcoming else None,
            created_at=lead.created_at,
            waiting_hours=waiting,
        ))

    territories = {
        t.agent_id: t
        for t in (await db.execute(select(Territory).where(Territory.is_active.is_(True)))).scalars().all()
    }
    agents = (await db.execute(select(Agent).options(joinedload(Agent.profile)))).unique().scalars().all()
    out_agents = [
        DispatchAgent(
            id=a.id,
            name=a.profile.full_name if a.profile else (a.agent_code or "Field Agent"),
            agent_code=a.agent_code,
            status=a.status,
            latitude=a.current_latitude,
            longitude=a.current_longitude,
            last_location_update=a.last_location_update,
            territory_id=territories[a.id].id if a.id in territories else None,
            territory_name=territories[a.id].name if a.id in territories else None,
        )
        for a in agents
    ]
    out_agents.sort(key=lambda a: a.name.lower())
    return DispatchOverview(generated_at=now, leads=out_leads, agents=out_agents)
