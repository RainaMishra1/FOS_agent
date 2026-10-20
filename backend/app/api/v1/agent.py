import uuid
from datetime import date, datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.agent import Agent
from app.models.profile import Profile
from app.models.visit import Visit
from app.models.agent_location import AgentLocation
from geoalchemy2.elements import WKTElement
from app.schemas.agent import AgentResponse
from app.schemas.auth import AgentLocationUpdateRequest
from app.schemas.visit import (
    VisitResponse,
    VisitListResponse,
    VisitStatusUpdateRequest,
    AgentDashboardResponse,
    AgentStats,
    AgentDutyUpdateRequest,
)
from app.core.auth import require_agent
from app.api.v1.visits import _to_visit_response, VALID_VISIT_STATUSES
from app.api.v1.agents import _to_agent_response

router = APIRouter(prefix="/agent", tags=["Field Agent Operations"])


@router.get("/me", response_model=AgentResponse)
async def get_my_agent_profile(
    current_user: Profile = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> AgentResponse:
    """
    Retrieve operational details for the authenticated field agent.
    Determines agent identity from verified JWT token subject.
    """
    agent = current_user.agent
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No operational agent profile linked to this account.",
        )

    # Compute assigned and completed tasks
    assigned_tasks = (
        await db.scalar(select(func.count(Visit.id)).where(Visit.agent_id == agent.id)) or 0
    )
    completed_visits = (
        await db.scalar(
            select(func.count(Visit.id)).where(
                Visit.agent_id == agent.id, Visit.status == "completed"
            )
        )
        or 0
    )

    return _to_agent_response(agent, assigned_tasks, completed_visits)


@router.get("/dashboard", response_model=AgentDashboardResponse)
async def get_agent_dashboard(
    as_of_date: Optional[date] = Query(None, description="Operational reference date, defaults to today"),
    current_user: Profile = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> AgentDashboardResponse:
    """
    Retrieve personalized operational control dashboard for the authenticated field agent.
    Computes today's progress, upcoming visits, recent history, and next active appointment.
    Guarantees strict data isolation: only visits assigned to the authenticated agent are returned.
    """
    agent = current_user.agent
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No operational agent profile linked to this account.",
        )

    ref_date = as_of_date or datetime.now(timezone.utc).date()

    # 1. Fetch Today's Visits for this agent
    today_query = (
        select(Visit)
        .options(joinedload(Visit.customer))
        .where(Visit.agent_id == agent.id, Visit.scheduled_date == ref_date)
        .order_by(Visit.order_index.asc(), Visit.scheduled_time.asc())
    )
    today_res = await db.execute(today_query)
    today_raw = today_res.unique().scalars().all()
    today_visits = [_to_visit_response(v) for v in today_raw]

    # 2. Compute today's statistics
    today_total = len(today_visits)
    today_completed = sum(1 for v in today_visits if v.status == "completed")
    today_remaining = sum(1 for v in today_visits if v.status in ("pending", "in_progress", "delayed"))
    completion_pct = round((today_completed / today_total) * 100, 1) if today_total > 0 else 0.0

    # Determine next appointment
    next_visit = next((v for v in today_visits if v.status in ("in_progress", "pending", "delayed")), None)

    # 3. Fetch Upcoming Visits (future dates)
    upcoming_query = (
        select(Visit)
        .options(joinedload(Visit.customer))
        .where(Visit.agent_id == agent.id, Visit.scheduled_date > ref_date, Visit.status != "completed")
        .order_by(Visit.scheduled_date.asc(), Visit.order_index.asc())
        .limit(10)
    )
    upcoming_res = await db.execute(upcoming_query)
    upcoming_raw = upcoming_res.unique().scalars().all()
    upcoming_visits = [_to_visit_response(v) for v in upcoming_raw]

    # 4. Fetch Recent Visit History (completed visits)
    history_query = (
        select(Visit)
        .options(joinedload(Visit.customer))
        .where(Visit.agent_id == agent.id, Visit.status == "completed")
        .order_by(Visit.completed_time.desc().nullslast(), Visit.scheduled_date.desc())
        .limit(10)
    )
    history_res = await db.execute(history_query)
    history_raw = history_res.unique().scalars().all()
    recent_history = [_to_visit_response(v) for v in history_raw]

    # Agent Response
    assigned_tasks = await db.scalar(select(func.count(Visit.id)).where(Visit.agent_id == agent.id)) or 0
    total_completed = await db.scalar(
        select(func.count(Visit.id)).where(Visit.agent_id == agent.id, Visit.status == "completed")
    ) or 0
    agent_info = _to_agent_response(agent, assigned_tasks, total_completed)

    stats = AgentStats(
        today_total=today_total,
        today_completed=today_completed,
        today_remaining=today_remaining,
        completion_percentage=completion_pct,
        next_visit=next_visit,
    )

    return AgentDashboardResponse(
        agent=agent_info,
        stats=stats,
        today_visits=today_visits,
        upcoming_visits=upcoming_visits,
        recent_history=recent_history,
        as_of_date=ref_date,
    )


@router.get("/visits", response_model=VisitListResponse)
async def list_agent_visits(
    visit_date: Optional[date] = Query(None, description="Filter by scheduled date"),
    status: Optional[str] = Query(None, description="Filter by status (pending, in_progress, completed, delayed)"),
    search: Optional[str] = Query(None, description="Search by customer name, address, or purpose"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: Profile = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> VisitListResponse:
    """
    List scheduled visits assigned strictly to the authenticated agent.
    Never exposes other agents' schedules.
    """
    agent = current_user.agent
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent profile not found.")

    query = (
        select(Visit)
        .options(joinedload(Visit.customer))
        .where(Visit.agent_id == agent.id)
    )
    count_query = select(func.count(Visit.id)).where(Visit.agent_id == agent.id)

    if visit_date:
        query = query.where(Visit.scheduled_date == visit_date)
        count_query = count_query.where(Visit.scheduled_date == visit_date)

    if status:
        query = query.where(Visit.status == status)
        count_query = count_query.where(Visit.status == status)

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        from app.models.customer import Customer
        query = query.join(Visit.customer).where(
            or_(
                func.lower(Customer.name).like(term),
                func.lower(Customer.address).like(term),
                func.lower(Visit.purpose).like(term),
                func.lower(Visit.visit_code).like(term),
            )
        )
        count_query = count_query.join(Visit.customer).where(
            or_(
                func.lower(Customer.name).like(term),
                func.lower(Customer.address).like(term),
                func.lower(Visit.purpose).like(term),
                func.lower(Visit.visit_code).like(term),
            )
        )

    query = query.order_by(Visit.scheduled_date.asc(), Visit.order_index.asc()).offset(skip).limit(limit)

    total = await db.scalar(count_query) or 0
    res = await db.execute(query)
    items = res.unique().scalars().all()

    return VisitListResponse(
        total=total,
        items=[_to_visit_response(v) for v in items],
    )


@router.get("/visits/{visit_id}", response_model=VisitResponse)
async def get_agent_visit(
    visit_id: str,
    current_user: Profile = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> VisitResponse:
    """
    Retrieve details for a specific visit assigned to the authenticated field agent.
    Returns 404 if not found, or 403 Forbidden if the visit belongs to a different agent.
    Supports either visit UUID or visit_code (e.g. VST-101).
    """
    agent = current_user.agent
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent profile not found.")

    try:
        visit_uuid = uuid.UUID(visit_id)
        query = select(Visit).options(joinedload(Visit.customer)).where(Visit.id == visit_uuid)
    except (ValueError, AttributeError):
        query = select(Visit).options(joinedload(Visit.customer)).where(Visit.visit_code == visit_id)

    res = await db.execute(query)
    visit = res.unique().scalars().first()

    if not visit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visit with ID '{visit_id}' not found.",
        )

    # Strict isolation: agent cannot view another agent's assigned visit
    if visit.agent_id != agent.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Cannot view another field agent's assigned visit.",
        )

    return _to_visit_response(visit)


@router.get("/visit-history", response_model=VisitListResponse)
async def get_agent_visit_history(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    search: Optional[str] = Query(None, description="Search completed visits"),
    current_user: Profile = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> VisitListResponse:
    """
    Retrieve historical completed visits for the authenticated field agent.
    """
    agent = current_user.agent
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent profile not found.")

    query = (
        select(Visit)
        .options(joinedload(Visit.customer))
        .where(Visit.agent_id == agent.id, Visit.status == "completed")
    )
    count_query = select(func.count(Visit.id)).where(Visit.agent_id == agent.id, Visit.status == "completed")

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        from app.models.customer import Customer
        query = query.join(Visit.customer).where(
            or_(
                func.lower(Customer.name).like(term),
                func.lower(Customer.address).like(term),
                func.lower(Visit.completion_notes).like(term),
            )
        )
        count_query = count_query.join(Visit.customer).where(
            or_(
                func.lower(Customer.name).like(term),
                func.lower(Customer.address).like(term),
                func.lower(Visit.completion_notes).like(term),
            )
        )

    query = (
        query.order_by(Visit.completed_time.desc().nullslast(), Visit.scheduled_date.desc())
        .offset(skip)
        .limit(limit)
    )

    total = await db.scalar(count_query) or 0
    res = await db.execute(query)
    items = res.unique().scalars().all()

    return VisitListResponse(
        total=total,
        items=[_to_visit_response(v) for v in items],
    )


@router.patch("/visits/{visit_id}/status", response_model=VisitResponse)
async def update_agent_visit_status(
    visit_id: str,
    payload: VisitStatusUpdateRequest,
    current_user: Profile = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> VisitResponse:
    """
    Update visit status for an appointment assigned to the authenticated agent.
    Validates state transitions (pending -> in_progress -> completed).
    Records completion notes and server timestamps.
    Supports either visit UUID or visit_code (e.g. VST-101).
    """
    agent = current_user.agent
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent profile not found.")

    if payload.status not in VALID_VISIT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{payload.status}'. Permitted statuses: {', '.join(sorted(VALID_VISIT_STATUSES))}.",
        )

    try:
        visit_uuid = uuid.UUID(visit_id)
        query = select(Visit).options(joinedload(Visit.customer)).where(Visit.id == visit_uuid)
    except (ValueError, AttributeError):
        query = select(Visit).options(joinedload(Visit.customer)).where(Visit.visit_code == visit_id)

    res = await db.execute(query)
    visit = res.unique().scalars().first()

    if not visit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visit with ID '{visit_id}' not found.",
        )

    if visit.agent_id != agent.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Cannot update status for another agent's assigned visit.",
        )

    # Transition validation
    if visit.status == "completed" and payload.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid status transition: A completed visit cannot be reopened.",
        )

    visit.status = payload.status
    if payload.geofence_verified is not None:
        # Only allow geofence verification if agent has verified GPS coordinates (never manual)
        if payload.geofence_verified:
            visit.geofence_verified = bool(agent.location_source == "gps")
        else:
            visit.geofence_verified = False
    if payload.completion_notes is not None:
        visit.completion_notes = payload.completion_notes

    if payload.status == "in_progress" and not visit.check_in_time:
        visit.check_in_time = func.now()
    elif payload.status == "completed" and not visit.completed_time:
        visit.completed_time = func.now()

    await db.commit()
    await db.refresh(visit)

    return _to_visit_response(visit)


@router.patch("/duty", response_model=AgentResponse)
async def update_agent_duty_status(
    payload: AgentDutyUpdateRequest,
    current_user: Profile = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> AgentResponse:
    """
    Toggle on-duty / off-duty / break availability for the authenticated field agent.
    """
    agent = current_user.agent
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent profile not found.")

    valid_duties = {"active", "off_duty", "break", "busy"}
    if payload.status not in valid_duties:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid duty status '{payload.status}'. Must be one of: {', '.join(sorted(valid_duties))}.",
        )

    agent.status = payload.status
    await db.commit()
    await db.refresh(agent)

    return _to_agent_response(agent)


@router.patch("/me/location", response_model=AgentResponse)
async def update_agent_live_location(
    payload: AgentLocationUpdateRequest,
    current_user: Profile = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> AgentResponse:
    """
    Update coordinates and battery status for the authenticated field agent.
    Differentiates verified 'gps' vs 'manual' entry.
    Ensures manual entries never masquerade as GPS readings by enforcing gps_accuracy=None.
    """
    agent = current_user.agent
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Field agent operational record not linked to this profile.",
        )

    # Determine location source and verified accuracy
    loc_source = payload.location_source if payload.location_source in ("gps", "manual") else "gps"
    verified_accuracy = payload.gps_accuracy if loc_source == "gps" else None

    agent.current_latitude = payload.latitude
    agent.current_longitude = payload.longitude
    agent.location_source = loc_source
    if payload.battery_level is not None:
        agent.battery_level = payload.battery_level
    agent.last_location_update = func.now()
    agent.current_location = WKTElement(f"POINT({payload.longitude} {payload.latitude})", srid=4326)

    # Log separate location record breadcrumb
    loc_log = AgentLocation(
        agent_id=agent.id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        location=WKTElement(f"POINT({payload.longitude} {payload.latitude})", srid=4326),
        gps_accuracy=verified_accuracy,
        battery_level=payload.battery_level,
    )
    db.add(loc_log)

    await db.commit()
    await db.refresh(agent)

    return _to_agent_response(agent)
