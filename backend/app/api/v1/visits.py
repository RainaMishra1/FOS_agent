import uuid
import asyncio
import time
import math
import re
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2.elements import WKTElement
import httpx

from app.config import settings
from app.db.session import get_db
from app.models.visit import Visit
from app.models.agent import Agent
from app.models.customer import Customer
from app.models.lead import Lead
from app.models.assignment import Assignment
from app.models.profile import Profile
from app.schemas.visit import VisitResponse, VisitListResponse, VisitStatusUpdateRequest, VisitDispatchRequest
from app.core.auth import require_authenticated, require_admin

router = APIRouter(prefix="/visits", tags=["Visits"])
_geocode_lock = asyncio.Lock()
_geocode_cache: dict[str, tuple[float, list[dict]]] = {}
_reverse_geocode_cache: dict[str, tuple[float, dict]] = {}
_last_geocode_request = 0.0


def _clean_address_part(value: Optional[str]) -> str:
    return " ".join((value or "").strip().split())


def _candidate_from_nominatim(result: dict) -> Optional[dict]:
    try:
        latitude = float(result["lat"])
        longitude = float(result["lon"])
        display_name = str(result["display_name"]).strip()
    except (KeyError, TypeError, ValueError):
        return None
    if not math.isfinite(latitude) or not math.isfinite(longitude) or not (-90 <= latitude <= 90 and -180 <= longitude <= 180) or not display_name:
        return None
    details = result.get("address") if isinstance(result.get("address"), dict) else {}
    locality = next((details.get(key) for key in ("city", "town", "village", "municipality", "suburb", "county") if details.get(key)), None)
    return {
        "latitude": latitude,
        "longitude": longitude,
        "display_name": display_name,
        "locality": locality,
        "state": details.get("state"),
        "postal_code": details.get("postcode"),
        "country": details.get("country"),
        "category": result.get("category") or result.get("class"),
        "type": result.get("type"),
        "importance": result.get("importance"),
        "place_id": result.get("place_id"),
    }


async def _nominatim_get(path: str, params: dict) -> httpx.Response:
    """Serialize public Nominatim calls and use identifiable backend headers."""
    global _last_geocode_request
    async with _geocode_lock:
        wait_seconds = 1.05 - (time.monotonic() - _last_geocode_request)
        if wait_seconds > 0:
            await asyncio.sleep(wait_seconds)
        _last_geocode_request = time.monotonic()
        async with httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=5.0)) as client:
            search_url = settings.GEOCODING_SEARCH_URL.rstrip("/")
            endpoint = search_url if path == "search" else f"{search_url.rsplit('/', 1)[0]}/{path}"
            return await client.get(
                endpoint,
                params=params,
                headers={"User-Agent": settings.GEOCODING_USER_AGENT, "Accept-Language": "en"},
            )


async def _request_nominatim(path: str, params: dict) -> list:
    try:
        response = await _nominatim_get(path, params)
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Address lookup timed out. Please try again.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Address lookup service is temporarily unreachable.") from exc
    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="Address lookup is temporarily rate-limited. Wait a moment and try again.")
    if response.status_code >= 500:
        raise HTTPException(status_code=502, detail="Address lookup provider is temporarily unavailable.")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Address lookup provider rejected the search request.")
    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Address lookup provider returned an invalid response.") from exc
    if not isinstance(data, list):
        raise HTTPException(status_code=502, detail="Address lookup provider returned an invalid response.")
    return data


@router.get("/geocode")
async def geocode_dispatch_address(
    address: str = Query(..., min_length=2, max_length=300),
    locality: str = Query(..., min_length=2, max_length=100),
    state: str = Query("", max_length=100),
    postal_code: str = Query("", max_length=20),
    country: str = Query("India", min_length=2, max_length=80),
    current_admin: Profile = Depends(require_admin),
):
    """User-triggered address lookup with bounded, deduplicated fallback queries."""
    address, locality = _clean_address_part(address), _clean_address_part(locality)
    state, postal_code, country = map(_clean_address_part, (state, postal_code, country))
    if not address or not locality:
        raise HTTPException(status_code=422, detail="Street or landmark and locality are required for address lookup.")
    key = "|".join(part.casefold() for part in (address, locality, state, postal_code, country))
    cached = _geocode_cache.get(key)
    if cached and cached[0] > time.monotonic():
        return {"candidates": cached[1], "cached": True}

    normalized_landmark = re.sub(r"\s+near\s+", ", ", address, flags=re.IGNORECASE)
    queries = [
        ", ".join(part for part in (address, locality, state, postal_code, country) if part),
        ", ".join(part for part in (normalized_landmark, locality, state, country) if part),
        ", ".join(part for part in (locality, state, postal_code, country) if part),
    ]
    unique_queries = list(dict.fromkeys(" ".join(query.split()) for query in queries))[:3]
    attempted_queries: list[str] = []
    candidates: list[dict] = []
    seen: set[str] = set()
    for query in unique_queries:
        attempted_queries.append(query)
        results = await _request_nominatim("search", {
            "q": query, "format": "jsonv2", "addressdetails": 1,
            "limit": 5, "countrycodes": "in",
        })
        valid_before = len(candidates)
        for result in results:
            if not isinstance(result, dict):
                continue
            candidate = _candidate_from_nominatim(result)
            if not candidate:
                continue
            identity = str(candidate["place_id"] or f"{candidate['latitude']:.6f},{candidate['longitude']:.6f}")
            if identity not in seen:
                seen.add(identity)
                candidates.append(candidate)
        if results and len(candidates) == valid_before:
            raise HTTPException(status_code=502, detail="Address lookup provider returned malformed location data.")
        if candidates:
            break
    _geocode_cache[key] = (time.monotonic() + 86400, candidates)
    return {"candidates": candidates, "attempted_queries": attempted_queries, "cached": False}


@router.get("/reverse-geocode")
async def reverse_geocode_dispatch_location(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    current_admin: Profile = Depends(require_admin),
):
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        raise HTTPException(status_code=422, detail="A valid map location is required.")
    key = f"{latitude:.5f},{longitude:.5f}"
    cached = _reverse_geocode_cache.get(key)
    if cached and cached[0] > time.monotonic():
        return {**cached[1], "cached": True}
    try:
        response = await _nominatim_get("reverse", {
            "lat": latitude, "lon": longitude, "format": "jsonv2", "zoom": 18,
            "addressdetails": 1,
        })
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Address lookup timed out. The selected map point is still available.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Address lookup service is temporarily unreachable. The selected map point is still available.") from exc
    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="Address lookup is temporarily rate-limited. The selected map point is still available.")
    if response.status_code >= 500:
        raise HTTPException(status_code=502, detail="Address lookup provider is temporarily unavailable. The selected map point is still available.")
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="Address lookup provider rejected the reverse lookup.")
    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Address lookup provider returned an invalid response.") from exc
    if not isinstance(data, dict) or not isinstance(data.get("display_name"), str):
        raise HTTPException(status_code=404, detail="No readable address was found for this map point.")
    location = {"display_name": data["display_name"], "address": data.get("address") or {}}
    _reverse_geocode_cache[key] = (time.monotonic() + 86400, location)
    return {**location, "cached": False}


VALID_VISIT_STATUSES = {"pending", "in_progress", "completed", "delayed"}


@router.post("/dispatch", response_model=VisitResponse, status_code=status.HTTP_201_CREATED)
async def dispatch_visit(
    payload: VisitDispatchRequest,
    current_admin: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> VisitResponse:
    """Create a customer stop, lead, assignment, and scheduled visit atomically."""
    agent = await db.get(Agent, payload.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Selected agent was not found.")
    if agent.status != "active":
        raise HTTPException(status_code=409, detail="Only active agents can receive a new dispatch.")

    clean_name = payload.customer_name.strip()
    clean_address = payload.address.strip()
    clean_city = payload.city.strip()
    if not clean_name or not clean_address or not clean_city:
        raise HTTPException(status_code=422, detail="Customer name, address, and city are required.")
    latitude, longitude = payload.latitude, payload.longitude
    if not math.isfinite(latitude) or not math.isfinite(longitude) or not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise HTTPException(status_code=422, detail="Select a valid address result or map location before dispatching.")

    try:
        customer = await db.scalar(
            select(Customer).where(
                func.lower(Customer.name) == clean_name.lower(),
                func.lower(Customer.address) == clean_address.lower(),
                func.lower(Customer.city) == clean_city.lower(),
            )
        )
        if not customer:
            customer = Customer(
                name=clean_name,
                company=payload.company.strip() if payload.company else None,
                contact_person=payload.contact_person.strip() if payload.contact_person else None,
                phone=payload.phone.strip() if payload.phone else None,
                email=payload.email.strip().lower() if payload.email else None,
                address=clean_address,
                city=clean_city,
                latitude=latitude,
                longitude=longitude,
                location=WKTElement(
                    f"POINT({longitude} {latitude})",
                    srid=4326,
                ),
            )
            db.add(customer)
            await db.flush()
        else:
            customer.latitude = latitude
            customer.longitude = longitude
            customer.location = WKTElement(f"POINT({longitude} {latitude})", srid=4326)

        lead = Lead(
            customer_id=customer.id,
            assigned_agent_id=agent.id,
            priority=payload.priority,
            assignment_status="assigned",
            notes=payload.notes.strip() if payload.notes else None,
        )
        db.add(lead)
        await db.flush()
        assignment = Assignment(
            lead_id=lead.id,
            agent_id=agent.id,
            assigned_by_id=current_admin.id,
            scheduled_date=payload.scheduled_date,
            scheduled_time=payload.scheduled_time.strip(),
            status="assigned",
            notes=payload.notes.strip() if payload.notes else None,
        )
        visit = Visit(
            customer_id=customer.id,
            agent_id=agent.id,
            scheduled_date=payload.scheduled_date,
            scheduled_time=payload.scheduled_time.strip(),
            status="pending",
            order_index=1,
            estimated_duration_minutes=45,
            purpose=payload.notes.strip() if payload.notes else None,
        )
        db.add_all([assignment, visit])
        await db.commit()
        result = await db.execute(
            select(Visit)
            .options(joinedload(Visit.customer))
            .where(Visit.id == visit.id)
        )
        persisted = result.unique().scalars().first()
        if not persisted:
            raise HTTPException(status_code=500, detail="Dispatch was saved but could not be loaded.")
        return _to_visit_response(persisted)
    except HTTPException:
        await db.rollback()
        raise
    except Exception:
        await db.rollback()
        raise


def _to_visit_response(v: Visit) -> VisitResponse:
    return VisitResponse(
        id=v.id,
        visit_code=v.visit_code,
        customer_id=v.customer_id,
        agent_id=v.agent_id,
        customer_name=v.customer.name if v.customer else None,
        customer_company=v.customer.company if v.customer else None,
        customer_contact_person=v.customer.contact_person if v.customer else None,
        customer_phone=v.customer.phone if v.customer else None,
        customer_email=v.customer.email if v.customer else None,
        customer_address=v.customer.address if v.customer else None,
        customer_city=v.customer.city if v.customer else None,
        customer_latitude=v.customer.latitude if v.customer else None,
        customer_longitude=v.customer.longitude if v.customer else None,
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
    - Validates permitted status transitions.
    """
    if payload.status not in VALID_VISIT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status '{payload.status}'. Permitted statuses: {', '.join(sorted(VALID_VISIT_STATUSES))}.",
        )

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
        # Agents cannot reopen an already completed visit
        if visit.status == "completed" and payload.status != "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid status transition: A completed visit cannot be reopened by an agent.",
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
