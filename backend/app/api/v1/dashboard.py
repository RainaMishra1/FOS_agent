import uuid
from datetime import date, datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.agent import Agent
from app.models.customer import Customer
from app.models.lead import Lead
from app.models.visit import Visit
from app.models.assignment import Assignment
from app.models.profile import Profile
from app.models.visit_location_log import VisitLocationLog
from app.schemas.dashboard import (
    DashboardSummaryResponse,
    KpiSummary,
    DashboardActiveAgent,
    DashboardRecentAssignment,
    DashboardUpcomingVisit,
    WeeklyRunRateDay,
)
from app.core.auth import require_admin

router = APIRouter(prefix="/dashboard", tags=["Admin Dashboard"])


@router.get("/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    as_of_date: Optional[date] = Query(None, description="Operational reference date, defaults to today"),
    current_admin: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> DashboardSummaryResponse:
    """
    Computes real-time Operational Control Center metrics and data aggregates for administrators.
    Calculates KPI totals, on-shift agent telemetry, recent dispatches, and weekly activity.
    Strictly enforced with require_admin dependency.
    """
    ref_date = as_of_date or datetime.now(timezone.utc).date()

    # 1. KPI Counts
    total_agents = await db.scalar(select(func.count(Agent.id))) or 0
    active_agents_count = (
        await db.scalar(select(func.count(Agent.id)).where(Agent.status == "active")) or 0
    )
    total_customers = await db.scalar(select(func.count(Customer.id))) or 0
    total_leads = await db.scalar(select(func.count(Lead.id))) or 0

    visits_scheduled_today = (
        await db.scalar(select(func.count(Visit.id)).where(Visit.scheduled_date == ref_date)) or 0
    )
    visits_completed_today = (
        await db.scalar(
            select(func.count(Visit.id)).where(
                Visit.scheduled_date == ref_date,
                Visit.status == "completed",
            )
        )
        or 0
    )

    pending_assignments = (
        await db.scalar(
            select(func.count(Assignment.id)).where(
                Assignment.status.in_(["assigned", "pending"])
            )
        )
        or 0
    )

    completed_pct = (
        round((visits_completed_today / visits_scheduled_today) * 100, 1)
        if visits_scheduled_today > 0
        else 0.0
    )

    kpi = KpiSummary(
        total_field_agents=total_agents,
        agents_currently_active=active_agents_count,
        total_customers=total_customers,
        total_leads=total_leads,
        visits_scheduled_today=visits_scheduled_today,
        visits_completed_today=visits_completed_today,
        completed_percentage=completed_pct,
        pending_assignments=pending_assignments,
        active_change=f"{active_agents_count} on duty",
        pending_change=f"{pending_assignments} in queue",
    )

    # 2. Active Agents Snapshot
    agents_query = (
        select(Agent)
        .options(joinedload(Agent.profile))
        .order_by(Agent.last_location_update.desc().nullslast(), Agent.created_at.desc())
        .limit(10)
    )
    agents_res = await db.execute(agents_query)
    raw_agents = agents_res.unique().scalars().all()

    active_agents: List[DashboardActiveAgent] = []
    for agt in raw_agents:
        # Calculate today's visits for this agent
        agent_visits_today = (
            await db.scalar(
                select(func.count(Visit.id)).where(
                    Visit.agent_id == agt.id, Visit.scheduled_date == ref_date
                )
            )
            or 0
        )
        agent_completed_today = (
            await db.scalar(
                select(func.count(Visit.id)).where(
                    Visit.agent_id == agt.id,
                    Visit.scheduled_date == ref_date,
                    Visit.status == "completed",
                )
            )
            or 0
        )

        name = agt.profile.full_name if agt.profile else (agt.agent_code or "Unknown Agent")
        initials = "".join([part[0] for part in name.split() if part])[:2].upper() or "AG"

        active_agents.append(
            DashboardActiveAgent(
                id=agt.id,
                agent_code=agt.agent_code,
                name=name,
                initials=initials,
                status=agt.status,
                territory=agt.territory,
                completed_visits=agent_completed_today,
                assigned_tasks=agent_visits_today,
                battery_level=agt.battery_level,
                current_latitude=agt.current_latitude,
                current_longitude=agt.current_longitude,
                last_location_update=agt.last_location_update,
            )
        )

    # 3. Recent Assignments
    asn_query = (
        select(Assignment)
        .options(
            joinedload(Assignment.lead).joinedload(Lead.customer),
            joinedload(Assignment.agent).joinedload(Agent.profile),
        )
        .order_by(Assignment.scheduled_date.desc(), Assignment.assigned_at.desc())
        .limit(8)
    )
    asn_res = await db.execute(asn_query)
    raw_assignments = asn_res.unique().scalars().all()

    recent_assignments: List[DashboardRecentAssignment] = []
    for a in raw_assignments:
        cust_name = (
            a.lead.customer.name if (a.lead and a.lead.customer) else "Unlinked Customer"
        )
        cust_address = (
            a.lead.customer.address if (a.lead and a.lead.customer) else None
        )
        agent_name = (
            a.agent.profile.full_name
            if (a.agent and a.agent.profile)
            else (a.agent.agent_code if a.agent else "Unassigned")
        )
        priority = a.lead.priority if a.lead else "medium"

        recent_assignments.append(
            DashboardRecentAssignment(
                id=a.id,
                assignment_code=a.assignment_code,
                customer_name=cust_name,
                address=cust_address,
                agent_name=agent_name,
                scheduled_time=a.scheduled_time,
                scheduled_date=a.scheduled_date,
                priority=priority,
                status=a.status,
            )
        )

    # 4. Today's Scheduled Visits
    visit_query = (
        select(Visit)
        .options(
            joinedload(Visit.customer),
            joinedload(Visit.agent).joinedload(Agent.profile),
        )
        .where(Visit.scheduled_date == ref_date)
        .order_by(Visit.order_index.asc(), Visit.scheduled_time.asc())
        .limit(10)
    )
    visit_res = await db.execute(visit_query)
    raw_visits = visit_res.unique().scalars().all()

    today_visits: List[DashboardUpcomingVisit] = []
    for v in raw_visits:
        today_visits.append(
            DashboardUpcomingVisit(
                id=v.id,
                visit_code=v.visit_code,
                customer_name=v.customer.name if v.customer else "Customer",
                agent_name=(
                    v.agent.profile.full_name
                    if (v.agent and v.agent.profile)
                    else (v.agent.agent_code if v.agent else "Field Agent")
                ),
                address=v.customer.address if v.customer else None,
                scheduled_time=v.scheduled_time,
                scheduled_date=v.scheduled_date,
                status=v.status,
                geofence_verified=v.geofence_verified,
            )
        )

    # 5. Weekly Run Rate (Past 7 Days)
    weekly_activity: List[WeeklyRunRateDay] = []
    start_date = ref_date - timedelta(days=6)
    for day_offset in range(7):
        target_d = start_date + timedelta(days=day_offset)
        sched = (
            await db.scalar(
                select(func.count(Visit.id)).where(Visit.scheduled_date == target_d)
            )
            or 0
        )
        comp = (
            await db.scalar(
                select(func.count(Visit.id)).where(
                    Visit.scheduled_date == target_d, Visit.status == "completed"
                )
            )
            or 0
        )
        rate = round((comp / sched) * 100, 1) if sched > 0 else 0.0
        day_label = "Today" if target_d == ref_date else target_d.strftime("%a")

        weekly_activity.append(
            WeeklyRunRateDay(
                day=day_label,
                date=target_d,
                scheduled=sched,
                completed=comp,
                rate=rate,
            )
        )

    # 6. Average Geofence Accuracy
    avg_accuracy = await db.scalar(select(func.avg(VisitLocationLog.gps_accuracy)))
    if avg_accuracy is not None:
        avg_accuracy = round(float(avg_accuracy), 1)

    return DashboardSummaryResponse(
        kpi=kpi,
        active_agents=active_agents,
        recent_assignments=recent_assignments,
        today_visits=today_visits,
        weekly_activity=weekly_activity,
        as_of_date=ref_date,
        avg_geofence_accuracy_meters=avg_accuracy,
    )
