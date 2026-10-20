import uuid
from datetime import date, datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, case
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
    Optimized with single-pass GROUP BY aggregations for high-speed cross-network performance.
    """
    ref_date = as_of_date or datetime.now(timezone.utc).date()

    try:
        # 1. Single-round-trip consolidated KPI query (avoids session concurrency deadlocks)
        kpi_query = select(
            select(func.count(Agent.id)).scalar_subquery().label("total_agents"),
            select(func.count(Agent.id)).where(Agent.status == "active").scalar_subquery().label("active_agents"),
            select(func.count(Customer.id)).scalar_subquery().label("total_customers"),
            select(func.count(Lead.id)).scalar_subquery().label("total_leads"),
            select(func.count(Visit.id)).where(Visit.scheduled_date == ref_date).scalar_subquery().label("visits_scheduled"),
            select(func.count(Visit.id)).where(Visit.scheduled_date == ref_date, Visit.status == "completed").scalar_subquery().label("visits_completed"),
            select(func.count(Assignment.id)).where(Assignment.status.in_(["assigned", "pending"])).scalar_subquery().label("pending_assignments"),
        )
        kpi_res = await db.execute(kpi_query)
        kpi_row = kpi_res.first()

        total_agents = (kpi_row[0] if kpi_row else 0) or 0
        active_agents_count = (kpi_row[1] if kpi_row else 0) or 0
        total_customers = (kpi_row[2] if kpi_row else 0) or 0
        total_leads = (kpi_row[3] if kpi_row else 0) or 0
        visits_scheduled_today = (kpi_row[4] if kpi_row else 0) or 0
        visits_completed_today = (kpi_row[5] if kpi_row else 0) or 0
        pending_assignments = (kpi_row[6] if kpi_row else 0) or 0

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

        # 2. Active Agents Snapshot (Batch aggregated)
        agents_query = (
            select(Agent)
            .options(joinedload(Agent.profile))
            .order_by(Agent.last_location_update.desc().nullslast(), Agent.created_at.desc())
            .limit(10)
        )
        agents_res = await db.execute(agents_query)
        raw_agents = agents_res.unique().scalars().all()
        agent_ids = [agt.id for agt in raw_agents]

        agent_stats_map = {}
        if agent_ids:
            agt_stats_q = (
                select(
                    Visit.agent_id,
                    func.count(Visit.id).label("total"),
                    func.count(case((Visit.status == "completed", 1))).label("completed"),
                )
                .where(Visit.scheduled_date == ref_date, Visit.agent_id.in_(agent_ids))
                .group_by(Visit.agent_id)
            )
            agt_stats_res = await db.execute(agt_stats_q)
            for row in agt_stats_res.fetchall():
                agent_stats_map[row[0]] = (row[1], row[2])

        active_agents: List[DashboardActiveAgent] = []
        for agt in raw_agents:
            agent_visits_today, agent_completed_today = agent_stats_map.get(agt.id, (0, 0))
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

        # 5. Weekly Run Rate (Single aggregated GROUP BY query instead of 14 queries)
        start_date = ref_date - timedelta(days=6)
        weekly_stats_query = (
            select(
                Visit.scheduled_date,
                func.count(Visit.id).label("scheduled"),
                func.count(case((Visit.status == "completed", 1))).label("completed"),
            )
            .where(Visit.scheduled_date >= start_date, Visit.scheduled_date <= ref_date)
            .group_by(Visit.scheduled_date)
        )
        stats_res = await db.execute(weekly_stats_query)
        stats_map = {row[0]: (row[1], row[2]) for row in stats_res.fetchall()}

        weekly_activity: List[WeeklyRunRateDay] = []
        for day_offset in range(7):
            target_d = start_date + timedelta(days=day_offset)
            sched, comp = stats_map.get(target_d, (0, 0))
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
    except Exception as exc:
        import logging
        logging.getLogger("fos.dashboard").warning(f"Database query error in get_dashboard_summary: {exc}")
        # Return initial zero-state response for resilient operation
        weekly_activity = []
        start_date = ref_date - timedelta(days=6)
        for day_offset in range(7):
            target_d = start_date + timedelta(days=day_offset)
            day_label = "Today" if target_d == ref_date else target_d.strftime("%a")
            weekly_activity.append(
                WeeklyRunRateDay(
                    day=day_label,
                    date=target_d,
                    scheduled=0,
                    completed=0,
                    rate=0.0,
                )
            )
        return DashboardSummaryResponse(
            kpi=KpiSummary(
                total_field_agents=0,
                agents_currently_active=0,
                total_customers=0,
                total_leads=0,
                visits_scheduled_today=0,
                visits_completed_today=0,
                completed_percentage=0.0,
                pending_assignments=0,
                active_change="0 active",
                pending_change="0 in queue",
            ),
            active_agents=[],
            recent_assignments=[],
            today_visits=[],
            weekly_activity=weekly_activity,
            as_of_date=ref_date,
            avg_geofence_accuracy_meters=None,
        )
