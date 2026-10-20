import uuid
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, or_
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2.elements import WKTElement
import httpx
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.models.agent import Agent
from app.models.profile import Profile
from app.models.visit import Visit
from app.models.agent_location import AgentLocation
from app.schemas.agent import AgentCreateRequest, AgentInvitationResponse, AgentListResponse, AgentResponse
from app.schemas.auth import AgentLocationUpdateRequest
from app.core.auth import require_admin, require_agent
from app.config import settings

router = APIRouter(prefix="/agents", tags=["Agents"])
logger = logging.getLogger("fos.agents")


@router.post("/{agent_id}/invite", response_model=AgentInvitationResponse)
async def invite_agent_account(
    agent_id: uuid.UUID,
    current_admin: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AgentInvitationResponse:
    """Invite/link an Auth account for an existing Agent without changing its identity or location."""
    result = await db.execute(
        select(Agent)
        .options(joinedload(Agent.profile))
        .where(Agent.id == agent_id)
    )
    agent = result.unique().scalars().first()
    if not agent or not agent.profile:
        raise HTTPException(status_code=404, detail="Agent record not found.")
    profile = agent.profile
    if profile.role != "agent":
        raise HTTPException(status_code=409, detail="Agent Profile has an invalid role.")
    if profile.auth_user_id:
        return AgentInvitationResponse(
            agent_id=agent.id, linked=True, invitation_sent=False,
            detail="This Agent already has a linked Supabase Auth account.",
        )
    if not profile.email:
        raise HTTPException(status_code=409, detail="Agent Profile has no invitation email.")
    service_key = settings.SUPABASE_SERVICE_ROLE_KEY
    if not service_key or not settings.SUPABASE_URL or "placeholder" in settings.SUPABASE_URL:
        raise HTTPException(
            status_code=503,
            detail="Server-side Supabase invitation is not configured. Contact the system operator.",
        )

    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    email = profile.email.strip().lower()
    invited = False
    auth_user = None
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            # Reuse an existing Supabase account with the exact, admin-managed email.
            for page in range(1, 21):
                response = await client.get(
                    f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/admin/users",
                    params={"page": page, "per_page": 1000},
                    headers=headers,
                )
                if response.status_code != 200:
                    logger.error("Supabase admin user lookup failed with status %s", response.status_code)
                    raise HTTPException(status_code=502, detail="Unable to verify Supabase account for invitation.")
                payload = response.json()
                users = payload.get("users", []) if isinstance(payload, dict) else []
                auth_user = next(
                    (user for user in users if str(user.get("email", "")).strip().lower() == email),
                    None,
                )
                if auth_user or len(users) < 1000:
                    break

            if not auth_user:
                response = await client.post(
                    f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/invite",
                    headers=headers,
                    json={"email": email, "data": {"full_name": profile.full_name}},
                )
                if response.status_code not in (200, 201):
                    logger.error("Supabase agent invitation failed with status %s", response.status_code)
                    raise HTTPException(status_code=502, detail="Supabase could not send the agent invitation.")
                invite_payload = response.json()
                auth_user = invite_payload.get("user", invite_payload)
                invited = True
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        logger.error("Supabase agent invitation request failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="Unable to complete the Supabase agent invitation.")

    try:
        auth_user_id = uuid.UUID(str(auth_user.get("id")))
    except (AttributeError, TypeError, ValueError):
        raise HTTPException(status_code=502, detail="Supabase returned an invalid account identifier.")
    auth_email = str(auth_user.get("email", "")).strip().lower()
    if auth_email != email:
        raise HTTPException(status_code=409, detail="Supabase account email does not match the Agent Profile.")

    other_profile = await db.scalar(
        select(Profile).where(Profile.auth_user_id == auth_user_id, Profile.id != profile.id)
    )
    if other_profile:
        raise HTTPException(status_code=409, detail="This Supabase account is already linked to another FOS Profile.")
    profile.auth_user_id = auth_user_id
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Supabase account is already linked to another FOS Profile.")
    return AgentInvitationResponse(
        agent_id=agent.id,
        linked=True,
        invitation_sent=invited,
        detail="Invitation sent and account linked." if invited else "Existing Supabase account linked.",
    )


def _to_agent_response(
    agent: Agent,
    assigned_tasks: int = 0,
    completed_visits: int = 0,
) -> AgentResponse:
    return AgentResponse(
        id=agent.id,
        auth_linked=bool(agent.profile and agent.profile.auth_user_id),
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

    auth_profile = await db.scalar(
        select(Profile)
        .options(joinedload(Profile.agent))
        .where(or_(Profile.auth_user_id == payload.auth_user_id, Profile.id == payload.auth_user_id))
    )
    if existing_profile and auth_profile and existing_profile.id != auth_profile.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The invited Auth account and work email resolve to different FOS profiles.",
        )
    if auth_profile and auth_profile.email and auth_profile.email.lower() != clean_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The Supabase Auth user ID does not match the invited work email.",
        )

    if auth_profile:
        if auth_profile.role != "agent" or auth_profile.agent:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The Supabase Auth user already has a FOS role or agent record.",
            )
        profile = auth_profile
        profile.full_name = payload.name.strip()
        profile.email = clean_email
        profile.auth_user_id = payload.auth_user_id
        if payload.phone:
            profile.phone = payload.phone.strip()
    elif existing_profile:
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
        profile.auth_user_id = payload.auth_user_id
        if payload.phone:
            profile.phone = payload.phone.strip()
    else:
        profile = Profile(
            id=uuid.uuid4(),
            auth_user_id=payload.auth_user_id,
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
    current_user: Profile = Depends(require_admin),
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
