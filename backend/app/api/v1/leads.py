"""Lead verification: agents submit leads, admins approve or reject them."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.auth import require_admin
from app.db.session import get_db
from app.models.agent import Agent
from app.models.assignment import Assignment
from app.models.lead import Lead
from app.models.profile import Profile
from app.models.visit import Visit
from app.schemas.territory import (
    LeadApproveRequest,
    LeadRejectRequest,
    LeadReviewListResponse,
    LeadReviewResponse,
)

router = APIRouter(prefix="/leads", tags=["Lead Verification"])

VERIFICATION_STATUSES = {"pending", "approved", "rejected"}


def lead_query():
    return select(Lead).options(
        joinedload(Lead.customer),
        joinedload(Lead.created_by_agent).joinedload(Agent.profile),
        joinedload(Lead.territory),
    )


def to_lead_response(lead: Lead) -> LeadReviewResponse:
    customer = lead.customer
    creator = lead.created_by_agent
    return LeadReviewResponse(
        id=lead.id,
        lead_code=lead.lead_code,
        source=lead.source,
        verification_status=lead.verification_status,
        assignment_status=lead.assignment_status,
        priority=lead.priority,
        notes=lead.notes,
        customer_id=customer.id,
        customer_name=customer.name,
        company=customer.company,
        phone=customer.phone,
        email=customer.email,
        address=customer.address,
        city=customer.city,
        latitude=customer.latitude,
        longitude=customer.longitude,
        created_by_agent_id=lead.created_by_agent_id,
        created_by_agent_name=(creator.profile.full_name if creator and creator.profile else None),
        created_by_agent_code=creator.agent_code if creator else None,
        assigned_agent_id=lead.assigned_agent_id,
        territory_id=lead.territory_id,
        territory_name=lead.territory.name if lead.territory else None,
        captured_latitude=lead.captured_latitude,
        captured_longitude=lead.captured_longitude,
        captured_accuracy_meters=lead.captured_accuracy_meters,
        captured_distance_meters=lead.captured_distance_meters,
        submitted_at=lead.submitted_at,
        reviewed_at=lead.reviewed_at,
        rejection_reason=lead.rejection_reason,
        created_at=lead.created_at,
    )


@router.get("", response_model=LeadReviewListResponse)
async def list_leads(
    verification_status: Optional[str] = Query("pending"),
    source: Optional[str] = Query("agent"),
    agent_id: Optional[uuid.UUID] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_admin: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> LeadReviewListResponse:
    """List leads for review. Defaults to agent-submitted leads awaiting verification."""
    conditions = []
    if verification_status and verification_status != "all":
        if verification_status not in VERIFICATION_STATUSES:
            raise HTTPException(status_code=422, detail="Status must be pending, approved, rejected or all.")
        conditions.append(Lead.verification_status == verification_status)
    if source and source != "all":
        conditions.append(Lead.source == source)
    if agent_id:
        conditions.append(Lead.created_by_agent_id == agent_id)

    total = await db.scalar(select(func.count(Lead.id)).where(*conditions)) or 0
    pending = await db.scalar(
        select(func.count(Lead.id)).where(Lead.verification_status == "pending", Lead.source == "agent")
    ) or 0
    leads = (await db.execute(
        lead_query().where(*conditions)
        .order_by(Lead.submitted_at.desc().nullslast(), Lead.created_at.desc())
        .offset(skip).limit(limit)
    )).unique().scalars().all()
    return LeadReviewListResponse(total=total, pending=pending, items=[to_lead_response(l) for l in leads])


async def _pending_lead(db: AsyncSession, lead_id: uuid.UUID) -> Lead:
    lead = (await db.execute(lead_query().where(Lead.id == lead_id))).unique().scalars().first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found.")
    if lead.verification_status != "pending":
        raise HTTPException(status_code=409, detail=f"This lead was already {lead.verification_status}.")
    return lead


@router.post("/{lead_id}/approve", response_model=LeadReviewResponse)
async def approve_lead(
    lead_id: uuid.UUID,
    payload: LeadApproveRequest,
    current_admin: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> LeadReviewResponse:
    """Verify a lead. It is assigned to the agent who created it, and can get a visit scheduled."""
    lead = await _pending_lead(db, lead_id)
    if not lead.created_by_agent_id:
        raise HTTPException(status_code=409, detail="The agent who created this lead no longer exists. Reject it instead.")
    if payload.schedule_visit and not payload.scheduled_date:
        raise HTTPException(status_code=422, detail="Choose a date for the visit.")

    now = datetime.now(timezone.utc)
    lead.verification_status = "approved"
    lead.assigned_agent_id = lead.created_by_agent_id
    lead.assignment_status = "assigned"
    lead.reviewed_by_id = current_admin.id
    lead.reviewed_at = now
    if payload.priority:
        lead.priority = payload.priority

    if payload.schedule_visit:
        scheduled_time = (payload.scheduled_time or "").strip() or "Anytime"
        max_order = await db.scalar(
            select(func.max(Visit.order_index)).where(
                Visit.agent_id == lead.created_by_agent_id,
                Visit.scheduled_date == payload.scheduled_date,
            )
        )
        db.add(Assignment(
            assignment_code=f"ASN-{uuid.uuid4().hex[:8].upper()}",
            lead_id=lead.id,
            agent_id=lead.created_by_agent_id,
            assigned_by_id=current_admin.id,
            scheduled_date=payload.scheduled_date,
            scheduled_time=scheduled_time,
            status="assigned",
            notes=lead.notes,
        ))
        db.add(Visit(
            visit_code=f"VST-{uuid.uuid4().hex[:8].upper()}",
            customer_id=lead.customer_id,
            agent_id=lead.created_by_agent_id,
            scheduled_date=payload.scheduled_date,
            scheduled_time=scheduled_time,
            status="pending",
            order_index=(max_order or 0) + 1,
            estimated_duration_minutes=45,
            purpose=lead.notes or "Follow-up on verified lead",
            geofence_verified=False,
        ))
    await db.commit()
    return to_lead_response((await db.execute(lead_query().where(Lead.id == lead.id))).unique().scalars().one())


@router.post("/{lead_id}/reject", response_model=LeadReviewResponse)
async def reject_lead(
    lead_id: uuid.UUID,
    payload: LeadRejectRequest,
    current_admin: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> LeadReviewResponse:
    lead = await _pending_lead(db, lead_id)
    lead.verification_status = "rejected"
    lead.assignment_status = "rejected"
    lead.rejection_reason = payload.reason.strip()
    lead.reviewed_by_id = current_admin.id
    lead.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    return to_lead_response((await db.execute(lead_query().where(Lead.id == lead.id))).unique().scalars().one())
