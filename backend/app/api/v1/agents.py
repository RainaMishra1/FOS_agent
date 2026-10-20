import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2.elements import WKTElement

from app.db.session import get_db
from app.models.agent import Agent
from app.models.profile import Profile
from app.models.visit import Visit
from app.models.agent_location import AgentLocation
from app.schemas.agent import AgentCreateRequest, AgentListResponse, AgentResponse
from app.schemas.auth import AgentLocationUpdateRequest
from app.core.auth import require_admin, require_agent, require_authenticated

router = APIRouter(prefix="/agents", tags=["Agents"])


def _to_agent_response(
    agent: Agent,
    assigned_tasks: int = 0,
    completed_visits: int = 0,
) -> AgentResponse:
    return AgentResponse(
        id=agent.id,
        agent_code=agent.agent_code,
        name=agent.profile.full_name if agent.profile else (agent.agent_code or "Unknown Agent"),
        email=agent.profile.email if agent.profile else None,
        phone=agent.profile.phone if agent.profile else None,
        status=agent.status,
        territory=agent.territory,
        address=agent.address,
        location_source=getattr(agent, "location_source", "unknown") or "unknown",
        current_latitude=agent.current_latitude,
        current_longitude=agent.current_longitude,
        battery_level=agent.battery_level,
        last_location_update=agent.last_location_update,
        assigned_tasks=assigned_tasks,
        completed_visits=completed_visits,
        created_at=agent.created_at or datetime.now(timezone.utc),
    )


@router.get("", response_model=AgentListResponse)
async def list_agents(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of records to return"),
    status: Optional[str] = Query(None, description="Filter by agent status (e.g. active, busy, break)"),
    territory: Optional[str] = Query(None, description="Filter by operational territory"),
    search: Optional[str] = Query(None, description="Search by agent name, code, territory, or email"),
    current_admin: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AgentListResponse:
    """
    List field agents with pagination, search, and status filtering.
    Restricted to Administrators only. Field agents cannot view all peers.
    """
    query = select(Agent).options(joinedload(Agent.profile))
    count_query = select(func.count(Agent.id))

    if status:
        query = query.where(Agent.status == status)
        count_query = count_query.where(Agent.status == status)
    if territory:
        query = query.where(Agent.territory.ilike(f"%{territory}%"))
        count_query = count_query.where(Agent.territory.ilike(f"%{territory}%"))

    if search:
        search_term = f"%{search}%"
        search_filter = or_(
            Agent.agent_code.ilike(search_term),
            Agent.territory.ilike(search_term),
            Agent.profile.has(Profile.full_name.ilike(search_term)),
            Agent.profile.has(Profile.email.ilike(search_term)),
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    total = await db.scalar(count_query) or 0
    query = query.order_by(Agent.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    agents = result.unique().scalars().all()

    items = []
    for agent in agents:
        assigned_tasks = (
            await db.scalar(
                select(func.count(Visit.id)).where(Visit.agent_id == agent.id)
            )
            or 0
        )
        completed_visits = (
            await db.scalar(
                select(func.count(Visit.id)).where(
                    Visit.agent_id == agent.id, Visit.status == "completed"
                )
            )
            or 0
        )
        items.append(_to_agent_response(agent, assigned_tasks, completed_visits))

    return AgentListResponse(
        total=total,
        skip=skip,
        limit=limit,
        items=items,
    )


@router.post("", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    payload: AgentCreateRequest,
    current_admin: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AgentResponse:
    """
    Create and provision a new field representative in the operational database.
    Restricted to authorized Administrators only.
    Validates required fields, enforces uniqueness on employee ID (agent_code) and email,
    and cleanly connects Profile and Agent entities in a single atomic transaction.
    """
    # 1. Enforce unique employee ID (agent_code)
    clean_code = payload.agent_code.strip().upper()
    existing_agent_code = await db.scalar(
        select(Agent).where(func.upper(Agent.agent_code) == clean_code)
    )
    if existing_agent_code:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An agent with employee ID '{payload.agent_code}' already exists.",
        )

    # 2. Enforce email uniqueness and account association
    clean_email = payload.email.strip().lower()
    profile_stmt = (
        select(Profile)
        .options(joinedload(Profile.agent))
        .where(func.lower(Profile.email) == clean_email)
    )
    res = await db.execute(profile_stmt)
    existing_profile = res.unique().scalars().first()

    if existing_profile:
        if existing_profile.agent:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"An agent account with email '{payload.email}' already exists.",
            )
        if existing_profile.role != "agent":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"A user profile with email '{payload.email}' already exists with role '{existing_profile.role}'.",
            )
        profile = existing_profile
        profile.full_name = payload.name.strip()
        if payload.phone:
            profile.phone = payload.phone.strip()
    else:
        profile = Profile(
            id=uuid.uuid4(),
            full_name=payload.name.strip(),
            email=clean_email,
            role="agent",
            phone=payload.phone.strip() if payload.phone else None,
        )
        db.add(profile)
        await db.flush()

    # 3. Create Agent record
    has_coords = payload.latitude is not None and payload.longitude is not None
    location_source = "admin_provided" if has_coords else "unknown"
    point_geom = (
        WKTElement(f"POINT({payload.longitude} {payload.latitude})", srid=4326)
        if has_coords
        else None
    )

    new_agent = Agent(
        id=uuid.uuid4(),
        profile_id=profile.id,
        agent_code=clean_code,
        status=payload.status.strip().lower(),
        territory=payload.territory.strip() if payload.territory else None,
        address=payload.address.strip() if payload.address else None,
        current_latitude=payload.latitude if has_coords else None,
        current_longitude=payload.longitude if has_coords else None,
        current_location=point_geom,
        location_source=location_source,
        battery_level=100,
        last_location_update=datetime.now(timezone.utc) if has_coords else None,
    )
    db.add(new_agent)

    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to persist agent record to database: {str(exc)}",
        )

    # 4. Fetch complete agent with profile eager-loaded
    fetch_stmt = (
        select(Agent)
        .options(joinedload(Agent.profile))
        .where(Agent.id == new_agent.id)
    )
    fetch_res = await db.execute(fetch_stmt)
    persisted_agent = fetch_res.unique().scalars().first()

    return _to_agent_response(persisted_agent, assigned_tasks=0, completed_visits=0)


@router.get("/me", response_model=AgentResponse)
async def get_current_agent_profile(
    current_user: Profile = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> AgentResponse:
    """
    Retrieve operational record and current telemetry for the authenticated field agent.
    """
    if not current_user.agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Field agent operational record not linked to this profile.",
        )
    agent = current_user.agent
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


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent_by_id(
    agent_id: str,
    current_user: Profile = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> AgentResponse:
    """
    Retrieve a single agent's profile by UUID or employee code.
    - Admins can view any agent.
    - Field agents can ONLY view their own agent record.
    """
    try:
        parsed_uuid = uuid.UUID(agent_id)
        filter_expr = or_(Agent.id == parsed_uuid, func.upper(Agent.agent_code) == agent_id.upper())
    except (ValueError, AttributeError):
        filter_expr = func.upper(Agent.agent_code) == agent_id.upper()

    query = select(Agent).options(joinedload(Agent.profile)).where(filter_expr)
    result = await db.execute(query)
    agent = result.unique().scalars().first()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with identifier '{agent_id}' not found.",
        )

    # Role-based restriction: Agents cannot spy on other agents
    if current_user.role == "agent":
        if not current_user.agent or (
            str(current_user.agent.id) != str(agent.id)
            and (current_user.agent.agent_code or "").upper() != (agent.agent_code or "").upper()
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Field agents may only view their own operational data.",
            )

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


@router.patch("/me/location", response_model=AgentResponse)
async def update_my_location(
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
            detail="No field agent record found for this user.",
        )

    # Determine location source and verified accuracy
    loc_source = payload.location_source if payload.location_source in ("gps", "manual") else "gps"
    verified_accuracy = payload.gps_accuracy if loc_source == "gps" else None

    # Update agent telemetry
    agent.current_latitude = payload.latitude
    agent.current_longitude = payload.longitude
    agent.location_source = loc_source
    if payload.battery_level is not None:
        agent.battery_level = payload.battery_level
    agent.last_location_update = func.now()
    agent.current_location = WKTElement(f"POINT({payload.longitude} {payload.latitude})", srid=4326)

    # Log to AgentLocation breadcrumbs
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
