"""Field agent lead generation inside the agent's own territory."""
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from geoalchemy2 import Geography
GEOGRAPHY = Geography(geometry_type="GEOMETRY", srid=4326)  # WGS84; casts without an SRID fail in PostGIS
from geoalchemy2.elements import WKTElement
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.leads import lead_query, to_lead_response
from app.api.v1.territories import territory_rows, to_territory_response
from app.config import settings
from app.core.auth import require_agent
from app.db.session import get_db
from app.models.agent_location import AgentLocation
from app.models.customer import Customer
from app.models.lead import Lead
from app.models.profile import Profile
from app.models.territory import Territory
from app.schemas.territory import (
    AgentLeadCreateRequest,
    LeadReviewListResponse,
    LeadReviewResponse,
    TerritoryListResponse,
)
from app.services.territory_rules import haversine_m

router = APIRouter(prefix="/agent", tags=["Field Agent Leads"])


def _point(latitude: float, longitude: float):
    return func.ST_SetSRID(func.ST_MakePoint(longitude, latitude), 4326)


def _digits(phone: str) -> str:
    return re.sub(r"\D", "", phone or "")[-10:]


@router.get("/territories", response_model=TerritoryListResponse)
async def my_territories(
    current_user: Profile = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> TerritoryListResponse:
    rows = await territory_rows(db, Territory.agent_id == current_user.agent.id)
    return TerritoryListResponse(items=[to_territory_response(r) for r in rows])


@router.get("/leads", response_model=LeadReviewListResponse)
async def my_leads(
    verification_status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user: Profile = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> LeadReviewListResponse:
    agent_id = current_user.agent.id
    conditions = [Lead.created_by_agent_id == agent_id]
    if verification_status and verification_status != "all":
        conditions.append(Lead.verification_status == verification_status)
    total = await db.scalar(select(func.count(Lead.id)).where(*conditions)) or 0
    pending = await db.scalar(
        select(func.count(Lead.id)).where(Lead.created_by_agent_id == agent_id, Lead.verification_status == "pending")
    ) or 0
    leads = (await db.execute(
        lead_query().where(*conditions).order_by(Lead.submitted_at.desc().nullslast()).limit(limit)
    )).unique().scalars().all()
    return LeadReviewListResponse(total=total, pending=pending, items=[to_lead_response(l) for l in leads])


@router.post("/leads", response_model=LeadReviewResponse, status_code=status.HTTP_201_CREATED)
async def create_lead(
    payload: AgentLeadCreateRequest,
    current_user: Profile = Depends(require_agent),
    db: AsyncSession = Depends(get_db),
) -> LeadReviewResponse:
    """Submit a lead for admin verification.

    Accepted only when all of these hold, checked on the server:
      1. no location rule: agents may create leads from anywhere; their latest GPS is recorded;
      2. the lead location is the customer's address (or the agent's GPS if it can't be found);
      3. leads outside the agent's own region are allowed; they are stored without
         a region so admins can spot them (the app warns the agent).
    """
    agent = current_user.agent

    latest = await db.scalar(
        select(AgentLocation).where(AgentLocation.agent_id == agent.id)
        .order_by(AgentLocation.recorded_at.desc()).limit(1)
    )
    # Agents may create leads from anywhere. The agent's latest GPS (if any) is only
    # recorded with the lead, together with its distance, so admins can review it.
    distance = (
        haversine_m(latest.latitude, latest.longitude, payload.latitude, payload.longitude)
        if latest and latest.latitude is not None and latest.longitude is not None
        else None
    )

    lead_pt = _point(payload.latitude, payload.longitude)
    # The lead's region, if its location is inside one of the agent's regions (else none: "outside region").
    territory = await db.scalar(
        select(Territory).where(
            Territory.agent_id == agent.id,
            Territory.is_active.is_(True),
            func.ST_Covers(Territory.boundary, lead_pt),
        ).limit(1)
    )
    # Leads outside the agent's region are allowed; they are saved without a region
    # (territory_id empty) so the admin can see that when approving.

    phone_digits = _digits(payload.phone)
    if phone_digits:
        duplicate = await db.scalar(
            select(Lead.id).join(Customer, Customer.id == Lead.customer_id).where(
                Lead.created_by_agent_id == agent.id,
                Lead.verification_status == "pending",
                func.right(func.regexp_replace(Customer.phone, r"\D", "", "g"), 10) == phone_digits,
            ).limit(1)
        )
        if duplicate:
            raise HTTPException(status_code=409, detail="You already have a lead with this phone number waiting for verification.")

    customer = Customer(
        name=payload.customer_name.strip(),
        company=payload.company.strip() if payload.company else None,
        phone=payload.phone.strip(),
        email=payload.email.strip().lower() if payload.email else None,
        address=payload.address.strip(),
        city=payload.city.strip(),
        latitude=payload.latitude,
        longitude=payload.longitude,
        location=WKTElement(f"POINT({payload.longitude} {payload.latitude})", srid=4326),
    )
    db.add(customer)
    await db.flush()
    lead = Lead(
        lead_code=f"LEAD-{uuid.uuid4().hex[:8].upper()}",
        customer_id=customer.id,
        assigned_agent_id=None,
        priority=payload.priority,
        assignment_status="pending",
        notes=payload.notes.strip() if payload.notes else None,
        source="agent",
        verification_status="pending",
        created_by_agent_id=agent.id,
        territory_id=territory.id if territory else None,
        captured_latitude=latest.latitude if latest else None,
        captured_longitude=latest.longitude if latest else None,
        captured_accuracy_meters=latest.gps_accuracy if latest else None,
        captured_distance_meters=round(distance, 1) if distance is not None else None,
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(lead)
    await db.commit()
    return to_lead_response((await db.execute(lead_query().where(Lead.id == lead.id))).unique().scalars().one())
