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
from app.services.territory_rules import GpsReading, RuleViolation, check_lead_gps

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
      1. the agent's latest location is live device GPS, fresh and accurate;
      2. the lead location is within the geofence radius of that GPS point;
      3. both the lead location and the agent's GPS point are inside one of
         the agent's own territories (PostGIS polygon test).
    """
    agent = current_user.agent

    territories_count = await db.scalar(
        select(func.count(Territory.id)).where(Territory.agent_id == agent.id, Territory.is_active.is_(True))
    ) or 0
    if territories_count == 0:
        raise HTTPException(status_code=403, detail="You don't have an assigned territory yet. Ask your admin to assign one.")

    latest = await db.scalar(
        select(AgentLocation).where(AgentLocation.agent_id == agent.id)
        .order_by(AgentLocation.recorded_at.desc()).limit(1)
    )
    reading = (
        GpsReading(latest.latitude, latest.longitude, latest.gps_accuracy, latest.recorded_at) if latest else None
    )
    try:
        distance = check_lead_gps(
            reading,
            payload.latitude,
            payload.longitude,
            max_accuracy_m=settings.MAX_ACCEPTABLE_GPS_ACCURACY_METERS,
            max_age_seconds=settings.LOCATION_STALE_THRESHOLD_SECONDS,
            max_distance_m=settings.GEOFENCE_RADIUS_METERS,
        )
    except RuleViolation as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    lead_pt = _point(payload.latitude, payload.longitude)
    gps_pt = _point(latest.latitude, latest.longitude)
    territory = await db.scalar(
        select(Territory).where(
            Territory.agent_id == agent.id,
            Territory.is_active.is_(True),
            func.ST_Covers(Territory.boundary, lead_pt),
            func.ST_Covers(Territory.boundary, gps_pt),
        ).limit(1)
    )
    if territory is None:
        nearest = (await db.execute(
            select(
                Territory.name,
                func.ST_Distance(cast(Territory.boundary, GEOGRAPHY), cast(lead_pt, GEOGRAPHY)),
                Territory.definition_type,
                Territory.radius_meters,
                Territory.start_label,
                Territory.end_label,
            )
            .where(Territory.agent_id == agent.id, Territory.is_active.is_(True))
            .order_by(func.ST_Distance(cast(Territory.boundary, GEOGRAPHY), cast(lead_pt, GEOGRAPHY)))
            .limit(1)
        )).first()
        where = ""
        if nearest:
            name, edge_m, kind, radius, start_label, end_label = nearest
            if kind == "radius" and radius:
                where = f" {name} covers {radius / 1000:g} km around {start_label}."
            elif kind == "box" and radius:
                where = f" {name} covers the area from {start_label} to {end_label} (plus {radius / 1000:g} km)."
            if edge_m:
                where += f" The lead is {edge_m:.0f}m outside it."
        raise HTTPException(
            status_code=403,
            detail="Leads can only be created inside your assigned territory, and you must be inside it too." + where,
        )

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
        territory_id=territory.id,
        captured_latitude=latest.latitude,
        captured_longitude=latest.longitude,
        captured_accuracy_meters=latest.gps_accuracy,
        captured_distance_meters=round(distance, 1),
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(lead)
    await db.commit()
    return to_lead_response((await db.execute(lead_query().where(Lead.id == lead.id))).unique().scalars().one())
