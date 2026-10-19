import uuid
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.visit import Visit
from app.models.profile import Profile
from app.schemas.visit import VisitResponse, VisitListResponse, VisitStatusUpdateRequest
from app.core.auth import require_authenticated

router = APIRouter(prefix="/visits", tags=["Visits"])


def _to_visit_response(v: Visit) -> VisitResponse:
    return VisitResponse(
        id=v.id,
        visit_code=v.visit_code,
        customer_id=v.customer_id,
        agent_id=v.agent_id,
        customer_name=v.customer.name if v.customer else None,
        customer_address=v.customer.address if v.customer else None,
        scheduled_date=v.scheduled_date,
        scheduled_time=v.scheduled_time,
        status=v.status,
        geofence_verified=v.geofence_verified,
        check_in_time=v.check_in_time,
        completed_time=v.completed_time,
        completion_notes=v.completion_notes,
        order_index=v.order_index,
        estimated_duration_minutes=v.estimated_duration_minutes,
        purpose=v.purpose,
        created_at=v.created_at,
    )


@router.get("", response_model=VisitListResponse)
async def list_visits(
    agent_id: Optional[uuid.UUID] = Query(None, description="Filter visits by assigned agent"),
    visit_date: Optional[date] = Query(None, description="Filter visits by scheduled date"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status"),
    current_user: Profile = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> VisitListResponse:
    """
    List scheduled visits.
    - Admin: can query all visits, or filter by specific agent.
    - Agent: can ONLY query their own visits. Attempts to query another agent's visits are rejected.
    """
    query = select(Visit).options(joinedload(Visit.customer))
    count_query = select(func.count(Visit.id))

    # Strict Role-based Isolation:
    if current_user.role == "agent":
        if not current_user.agent:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Profile is not linked to an active agent record.",
            )
        # If agent tried to request a different agent's visits, reject
        if agent_id and agent_id != current_user.agent.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Field agents cannot access other agents' visit schedules.",
            )
        # Always force query to current agent's ID
        target_agent_id = current_user.agent.id
        query = query.where(Visit.agent_id == target_agent_id)
        count_query = count_query.where(Visit.agent_id == target_agent_id)
    elif current_user.role == "admin":
        if agent_id:
            query = query.where(Visit.agent_id == agent_id)
            count_query = count_query.where(Visit.agent_id == agent_id)
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized role.")

    if visit_date:
        query = query.where(Visit.scheduled_date == visit_date)
        count_query = count_query.where(Visit.scheduled_date == visit_date)

    if status_filter:
        query = query.where(Visit.status == status_filter)
        count_query = count_query.where(Visit.status == status_filter)

    query = query.order_by(Visit.scheduled_date.asc(), Visit.order_index.asc())
    total = await db.scalar(count_query) or 0
    result = await db.execute(query)
    visits = result.unique().scalars().all()

    return VisitListResponse(
        total=total,
        items=[_to_visit_response(v) for v in visits],
    )


@router.get("/{visit_id}", response_model=VisitResponse)
async def get_visit_by_id(
    visit_id: uuid.UUID,
    current_user: Profile = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> VisitResponse:
    """
    Retrieve details for a specific visit.
    - Admins can view any visit.
    - Field agents can ONLY view visits assigned to their own agent ID.
    """
    query = select(Visit).options(joinedload(Visit.customer)).where(Visit.id == visit_id)
    result = await db.execute(query)
    visit = result.unique().scalars().first()

    if not visit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visit with ID '{visit_id}' not found.",
        )

    # Agent isolation check
    if current_user.role == "agent":
        if not current_user.agent or current_user.agent.id != visit.agent_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Cannot view another agent's assigned visit.",
            )

    return _to_visit_response(visit)


@router.patch("/{visit_id}/status", response_model=VisitResponse)
async def update_visit_status(
    visit_id: uuid.UUID,
    payload: VisitStatusUpdateRequest,
    current_user: Profile = Depends(require_authenticated),
    db: AsyncSession = Depends(get_db),
) -> VisitResponse:
    """
    Update visit status, check-in verification, or completion notes.
    - Admins can update any visit.
    - Field agents can ONLY update their own assigned visits.
    """
    query = select(Visit).options(joinedload(Visit.customer)).where(Visit.id == visit_id)
    result = await db.execute(query)
    visit = result.unique().scalars().first()

    if not visit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Visit with ID '{visit_id}' not found.",
        )

    # Agent isolation check
    if current_user.role == "agent":
        if not current_user.agent or current_user.agent.id != visit.agent_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Cannot modify another agent's assigned visit.",
            )

    visit.status = payload.status
    if payload.geofence_verified is not None:
        visit.geofence_verified = payload.geofence_verified
    if payload.completion_notes is not None:
        visit.completion_notes = payload.completion_notes

    if payload.status == "in_progress" and not visit.check_in_time:
        visit.check_in_time = func.now()
    elif payload.status == "completed" and not visit.completed_time:
        visit.completed_time = func.now()

    await db.commit()
    await db.refresh(visit)

    return _to_visit_response(visit)
