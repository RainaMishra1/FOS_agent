import uuid
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
from app.schemas.agent import AgentListResponse, AgentResponse
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
        current_latitude=agent.current_latitude,
        current_longitude=agent.current_longitude,
        battery_level=agent.battery_level,
        last_location_update=agent.last_location_update,
        assigned_tasks=assigned_tasks,
        completed_visits=completed_visits,
        created_at=agent.created_at,
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
    agent_id: uuid.UUID,
    current_user: Profile = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> AgentResponse:
    """
    Retrieve a single agent's profile by ID.
    - Admins can view any agent.
    - Field agents can ONLY view their own agent record.
    """
    # Role-based restriction: Agents cannot spy on other agents
    if current_user.role == "agent":
        if not current_user.agent or current_user.agent.id != agent_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Field agents may only view their own operational data.",
            )

    query = select(Agent).options(joinedload(Agent.profile)).where(Agent.id == agent_id)
    result = await db.execute(query)
    agent = result.unique().scalars().first()

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent with ID '{agent_id}' not found.",
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
    Update live coordinates and battery status for the authenticated field agent.
    Logs telemetry breadcrumbs to agent_locations table.
    """
    agent = current_user.agent
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No field agent record found for this user.",
        )

    # Update agent telemetry
    agent.current_latitude = payload.latitude
    agent.current_longitude = payload.longitude
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
        gps_accuracy=payload.gps_accuracy,
        battery_level=payload.battery_level,
    )
    db.add(loc_log)

    await db.commit()
    await db.refresh(agent)

    return _to_agent_response(agent)
