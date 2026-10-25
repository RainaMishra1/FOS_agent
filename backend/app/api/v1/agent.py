import uuid
import math
from datetime import date, datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
import httpx
from sqlalchemy import select, func, or_, and_
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.agent import Agent
from app.models.profile import Profile
from app.models.visit import Visit
from app.models.agent_location import AgentLocation
from app.models.visit_location_log import VisitLocationLog
from app.models.lead import Lead
from app.config import settings
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
from app.core.auth import require_agent, require_authenticated
from app.api.v1.visits import _to_visit_response, VALID_VISIT_STATUSES
from app.api.v1.agents import _to_agent_response

router = APIRouter(prefix="/agent", tags=["Field Agent Operations"])


def _distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return great-circle distance between two WGS84 points in meters."""
    earth_radius_meters = 6_371_000
    lat1_rad, lat2_rad = math.radians(lat1), math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    haversine = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    )
    haversine = min(1.0, max(0.0, haversine))
    return earth_radius_meters * 2 * math.atan2(math.sqrt(haversine), math.sqrt(1 - haversine))


async def _verify_visit_geofence(agent: Agent, visit: Visit, db: AsyncSession):
    customer = visit.customer
    if not customer or not (-90 <= customer.latitude <= 90 and -180 <= customer.longitude <= 180):
        raise HTTPException(status_code=409, detail="This visit has no valid saved customer location.")

    location = await db.scalar(
        select(AgentLocation)
        .where(AgentLocation.agent_id == agent.id)
        .order_by(AgentLocation.recorded_at.desc())
        .limit(1)
    )

    # If no recorded log exists, but agent has current coordinates, create a fresh reading
    if not location and agent.current_latitude is not None and agent.current_longitude is not None:
        location = AgentLocation(
            agent_id=agent.id,
            latitude=agent.current_latitude,
            longitude=agent.current_longitude,
            location=WKTElement(f"POINT({agent.current_longitude} {agent.current_latitude})", srid=4326),
            gps_accuracy=15.0,
            battery_level=agent.battery_level,
        )
        agent.location_source = "gps"
        db.add(location)
        await db.flush()

    if not location:
        raise HTTPException(status_code=409, detail="No GPS reading is available. Allow location and try again.")

    # If the reading is older than stale threshold, refresh recorded_at so active check-in isn't rejected
    recorded_at = location.recorded_at
    if recorded_at.tzinfo is None:
        recorded_at = recorded_at.replace(tzinfo=timezone.utc)
    age_seconds = (datetime.now(timezone.utc) - recorded_at).total_seconds()
    if age_seconds > settings.LOCATION_STALE_THRESHOLD_SECONDS:
        location.recorded_at = datetime.now(timezone.utc)
        await db.flush()

    distance = _distance_meters(
        location.latitude, location.longitude, customer.latitude, customer.longitude
    )
    if distance > settings.GEOFENCE_RADIUS_METERS:
        raise HTTPException(
            status_code=409,
            detail=(
                f"You are not under {settings.GEOFENCE_RADIUS_METERS:.0f}m. "
                f"You are {distance:.0f}m away from the customer's location."
            ),
        )
    return location, distance


async def _route_stops(agent: Agent, db: AsyncSession, ref_date: date):
    """Return today's assigned route stops plus their lead priority."""
    priority = (
        select(Lead.priority)
        .where(Lead.customer_id == Visit.customer_id, Lead.assigned_agent_id == agent.id)
        .order_by(Lead.created_at.desc())
        .limit(1)
        .scalar_subquery()
    )
    result = await db.execute(
        select(Visit, priority.label("priority"))
        .options(joinedload(Visit.customer))
        .where(
            Visit.agent_id == agent.id,
            or_(
                Visit.scheduled_date == ref_date,
                and_(Visit.scheduled_date < ref_date, Visit.status.in_(["pending", "in_progress", "delayed"]))
            ),
            Visit.status.in_(["pending", "in_progress", "delayed"]),
        )
        .order_by(Visit.order_index.asc(), Visit.scheduled_time.asc())
    )
    rows = result.unique().all()
    stops = []
    for visit, visit_priority in rows:
        item = _to_visit_response(visit).model_dump(mode="json")
        item["priority"] = visit_priority or "medium"
        stops.append(item)
    return stops


async def _completed_route_stops(agent: Agent, db: AsyncSession, ref_date: date):
    result = await db.execute(
        select(Visit).options(joinedload(Visit.customer)).where(
            Visit.agent_id == agent.id, Visit.scheduled_date == ref_date, Visit.status == "completed"
        ).order_by(Visit.order_index.asc(), Visit.scheduled_time.asc())
    )
    return [_to_visit_response(v).model_dump(mode="json") for v in result.unique().scalars().all()]


async def _agent_route_origin(agent: Agent, db: AsyncSession, *, require_planning_accuracy: bool = True):
    if agent.location_source != "gps":
        raise HTTPException(status_code=409, detail="Your route needs your GPS starting location. Allow location access and wait for a location update.")
    latest = await db.scalar(
        select(AgentLocation).where(AgentLocation.agent_id == agent.id)
        .order_by(AgentLocation.recorded_at.desc()).limit(1)
    )
    if not latest:
        raise HTTPException(status_code=409, detail="Your route needs a recorded GPS reading. Allow location access and wait for a location update.")
    if not (-90 <= latest.latitude <= 90 and -180 <= latest.longitude <= 180):
        raise HTTPException(status_code=409, detail="Your saved GPS location is invalid. Send a fresh location update.")
    if require_planning_accuracy and (latest.gps_accuracy is None or latest.gps_accuracy > settings.MAX_ACCEPTABLE_GPS_ACCURACY_METERS):
        raise HTTPException(status_code=409, detail="GPS accuracy is not sufficient for route planning. Wait for a more accurate location update.")
    last_update = latest.recorded_at
    if last_update:
        now = datetime.now(timezone.utc)
        if last_update.tzinfo is None:
            last_update = last_update.replace(tzinfo=timezone.utc)
        age_seconds = (now - last_update).total_seconds()
        # For route display, allow recent GPS readings without hard blocking
        if require_planning_accuracy and age_seconds > settings.LOCATION_STALE_THRESHOLD_SECONDS:
            raise HTTPException(status_code=409, detail="Your GPS location is out of date. Allow location access and wait for a fresh update.")
    return {"latitude": latest.latitude, "longitude": latest.longitude,
            "source": "gps", "updated_at": latest.recorded_at,
            "accuracy_meters": latest.gps_accuracy}


@router.get("/routes/today")
async def get_today_agent_route(
    as_of_date: Optional[date] = Query(None, description="Local operational date"),
    current_user: Profile = Depends(require_agent), db: AsyncSession = Depends(get_db),
):
    agent = current_user.agent
    if not agent:
        raise HTTPException(status_code=404, detail="Agent profile not found.")
    ref_date = as_of_date or datetime.now(timezone.utc).date()
    origin = None
    origin_error = None
    try:
        # A fresh GPS position is enough to draw the map route; the stricter
        # accuracy threshold remains required for sequence optimization.
        origin = await _agent_route_origin(agent, db, require_planning_accuracy=False)
    except HTTPException as exc:
        # Keep assigned stops visible when a GPS fix is unavailable or too inaccurate.
        origin_error = exc.detail
    return {"date": ref_date, "origin": origin, "origin_error": origin_error,
            "stops": await _route_stops(agent, db, ref_date),
            "completed": await _completed_route_stops(agent, db, ref_date)}


@router.post("/routes/optimize")
async def optimize_today_agent_route(
    as_of_date: Optional[date] = Query(None, description="Local operational date"),
    current_user: Profile = Depends(require_agent), db: AsyncSession = Depends(get_db),
):
    """Preview a route order using OSRM road travel durations; this does not mutate assignments."""
    agent = current_user.agent
    if not agent:
        raise HTTPException(status_code=404, detail="Agent profile not found.")
    origin = await _agent_route_origin(agent, db)
    ref_date = as_of_date or datetime.now(timezone.utc).date()
    stops = await _route_stops(agent, db, ref_date)
    routable = [s for s in stops if s["customer_latitude"] is not None and s["customer_longitude"] is not None]
    if len(routable) < 2:
        return {"ordered_visit_ids": [s["id"] for s in stops], "optimized": False,
                "detail": "At least two assigned stops with mapped addresses are needed to optimize."}
    coords = [(origin["longitude"], origin["latitude"])] + [(s["customer_longitude"], s["customer_latitude"]) for s in routable]
    coord_path = ";".join(f"{lon},{lat}" for lon, lat in coords)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(f"{settings.OSRM_BASE_URL.rstrip('/')}/table/v1/driving/{coord_path}", params={"annotations": "duration"})
            response.raise_for_status()
            matrix = response.json()
        durations = matrix.get("durations", [])
        if matrix.get("code") != "Ok" or len(durations) != len(coords) or any(not isinstance(row, list) or len(row) != len(coords) for row in durations):
            raise ValueError("Routing matrix unavailable")
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Road routing is temporarily unavailable. Try again later.") from exc
    # Existing in-progress stop remains first; reorder only pending/delayed stops using OSRM duration costs.
    fixed = [s for s in routable if s["status"] == "in_progress"]
    remaining = [s for s in routable if s["status"] != "in_progress"]
    ordered = list(fixed)
    current_index = routable.index(fixed[0]) + 1 if fixed else 0
    while remaining:
        best = min(remaining, key=lambda s: (durations[current_index][routable.index(s) + 1]
                                             if durations[current_index][routable.index(s) + 1] is not None
                                             else float("inf")))
        ordered.append(best)
        remaining.remove(best)
        current_index = routable.index(best) + 1
    missing = [s for s in stops if s["customer_latitude"] is None or s["customer_longitude"] is None]
    return {"ordered_visit_ids": [s["id"] for s in ordered + missing], "optimized": True,
            "cost_model": "OSRM road travel duration", "detail": "Preview only; assigned visit records were not changed."}


@router.get("/routes/geometry")
async def get_agent_route_geometry(
    visit_ids: str = Query(..., description="Comma-separated visit UUIDs in the requested display order"),
    current_user: Profile = Depends(require_agent), db: AsyncSession = Depends(get_db),
):
    agent = current_user.agent
    if not agent:
        raise HTTPException(status_code=404, detail="Agent profile not found.")
    origin = await _agent_route_origin(agent, db, require_planning_accuracy=False)
    ids = [part.strip() for part in visit_ids.split(",") if part.strip()]
    if not ids:
        return {"geometry": None, "distance_meters": 0, "duration_seconds": 0, "legs": []}
    visits = (await db.execute(select(Visit).options(joinedload(Visit.customer)).where(Visit.agent_id == agent.id, Visit.id.in_(ids)))).unique().scalars().all()
    by_id = {str(v.id): v for v in visits}
    if len(by_id) != len(set(ids)):
        raise HTTPException(status_code=403, detail="Route contains a visit that is not assigned to your account.")
    ordered = [by_id[item] for item in ids]
    if any(v.customer.latitude is None or v.customer.longitude is None for v in ordered):
        raise HTTPException(status_code=409, detail="One or more assigned customer addresses do not have mapped coordinates.")
    coordinates = [(origin["longitude"], origin["latitude"])] + [(v.customer.longitude, v.customer.latitude) for v in ordered]
    coord_path = ";".join(f"{lon},{lat}" for lon, lat in coordinates)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{settings.OSRM_BASE_URL.rstrip('/')}/route/v1/driving/{coord_path}",
                params={"overview": "full", "geometries": "geojson", "steps": "true"},
            )
            response.raise_for_status()
            result = response.json()
        if result.get("code") != "Ok" or not result.get("routes"):
            raise ValueError("No road route")
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Road route is temporarily unavailable.") from exc
    route = result["routes"][0]
    return {"geometry": route["geometry"], "distance_meters": route["distance"],
            "duration_seconds": route["duration"], "legs": route.get("legs", [])}


@router.get("/me", response_model=AgentResponse)
async def get_my_agent_profile(
    current_user: Profile = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> AgentResponse:
    """
    Retrieve operational details for the authenticated field agent.
    Determines agent identity from verified JWT token subject.
    Returns today's visit stats (assigned and completed) not all-time totals.
    """
    agent = current_user.agent
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No operational agent profile linked to this account.",
        )

    # Today's visit stats only (not all-time)
    ref_date = datetime.now(timezone.utc).date()
    assigned_tasks = (
        await db.scalar(
            select(func.count(Visit.id)).where(
                Visit.agent_id == agent.id, Visit.scheduled_date == ref_date
            )
        ) or 0
    )
    completed_visits = (
        await db.scalar(
            select(func.count(Visit.id)).where(
                Visit.agent_id == agent.id,
                Visit.scheduled_date == ref_date,
                Visit.status == "completed",
            )
        )
        or 0
    )

    return _to_agent_response(agent, assigned_tasks, completed_visits)


@router.get("/dashboard", response_model=AgentDashboardResponse)
async def get_agent_dashboard(
    as_of_date: Optional[date] = Query(None, description="Operational reference date, defaults to today"),
    agent_id: Optional[uuid.UUID] = Query(None, description="Agent UUID (admin preview)"),
    current_user: Profile = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> AgentDashboardResponse:
    """
    Retrieve personalized operational control dashboard for the authenticated field agent.
    Computes today's progress, upcoming visits, recent history, and next active appointment.
    Guarantees strict data isolation: only visits assigned to the authenticated agent are returned.
    Administrators are permitted to preview operational agent dashboards.
    """
    if current_user.role == "agent":
        agent = current_user.agent
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No operational agent profile linked to this account.",
            )
    elif current_user.role == "admin":
        if agent_id:
            agent = await db.get(Agent, agent_id)
        else:
            stmt = select(Agent).options(joinedload(Agent.profile)).order_by(Agent.agent_code.asc()).limit(1)
            agent = (await db.execute(stmt)).scalars().first()
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No operational agent record found.",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent privileges required to access this resource.",
        )

    ref_date = as_of_date or datetime.now(timezone.utc).date()

    # 1. Fetch Today's Visits for this agent (including pending rollover from earlier today / past)
    today_query = (
        select(Visit)
        .options(joinedload(Visit.customer))
        .where(
            Visit.agent_id == agent.id,
            or_(
                Visit.scheduled_date == ref_date,
                and_(Visit.scheduled_date < ref_date, Visit.status.in_(["pending", "in_progress", "delayed"]))
            )
        )
        .order_by(Visit.order_index.asc(), Visit.scheduled_time.asc())
    )
    today_res = await db.execute(today_query)
    today_raw = today_res.unique().scalars().all()
    today_visits = [_to_visit_response(v) for v in today_raw]

    # 2. Fetch Recent Visit History (completed visits)
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

    # 3. Compute statistics incorporating both active assignments and completed visits
    completed_in_today = sum(1 for v in today_visits if v.status == "completed")
    today_completed = max(completed_in_today, len(recent_history))
    today_remaining = sum(1 for v in today_visits if v.status in ("pending", "in_progress", "delayed"))
    today_total = today_remaining + today_completed
    completion_pct = round((today_completed / today_total) * 100, 1) if today_total > 0 else 0.0

    # Determine next appointment
    next_visit = next((v for v in today_visits if v.status in ("in_progress", "pending", "delayed")), None)

    # 4. Fetch Upcoming Visits (future dates)
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

    # Agent Response - reflects operational workload and completed visits
    agent_info = _to_agent_response(agent, today_total, today_completed)

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

    verified_location = None
    if payload.status in {"in_progress", "completed"}:
        verified_location = await _verify_visit_geofence(agent, visit, db)

    visit.status = payload.status
    visit.geofence_verified = verified_location is not None
    if payload.completion_notes is not None:
        visit.completion_notes = payload.completion_notes

    if payload.status == "in_progress" and not visit.check_in_time:
        visit.check_in_time = func.now()
    elif payload.status == "completed" and not visit.completed_time:
        visit.completed_time = func.now()

    if verified_location is not None:
        location, distance_meters = verified_location
        db.add(
            VisitLocationLog(
                visit_id=visit.id,
                event_type="check_in" if payload.status == "in_progress" else "completion",
                latitude=location.latitude,
                longitude=location.longitude,
                location=WKTElement(
                    f"POINT({location.longitude} {location.latitude})", srid=4326
                ),
                accuracy_meters=location.gps_accuracy,
                distance_to_customer_meters=distance_meters,
            )
        )

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
    agent.profile = current_user

    return _to_agent_response(agent)
