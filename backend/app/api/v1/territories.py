"""Admin territory management: polygons drawn on the map, one agent each."""
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from geoalchemy2 import Geography
GEOGRAPHY = Geography(geometry_type="GEOMETRY", srid=4326)  # WGS84; casts without an SRID fail in PostGIS
from geoalchemy2.elements import WKTElement
from sqlalchemy import case, cast, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_admin
from app.db.session import get_db
from app.models.agent import Agent
from app.models.lead import Lead
from app.models.profile import Profile
from app.models.territory import Territory
from app.schemas.territory import (
    TerritoryAreaSpec,
    TerritoryCreateRequest,
    TerritoryListResponse,
    TerritoryResponse,
    TerritoryUpdateRequest,
)
from app.services.territory_rules import RuleViolation, area_ring, normalize_ring, ring_to_wkt

router = APIRouter(prefix="/territories", tags=["Territories"])

MAX_TERRITORY_AREA_SQ_KM = 5000.0


def _geojson_to_points(geojson: Optional[str]) -> list[list[float]]:
    """GeoJSON polygon -> outer ring as [latitude, longitude], closing point dropped."""
    if not geojson:
        return []
    ring = json.loads(geojson).get("coordinates", [[]])[0]
    points = [[lat, lng] for lng, lat in ring]
    if len(points) > 1 and points[0] == points[-1]:
        points.pop()
    return points


async def territory_rows(db: AsyncSession, *conditions):
    """Territories with outline, agent name/code and lead count."""
    lead_counts = (
        select(Lead.territory_id, func.count(Lead.id).label("n"))
        .where(Lead.territory_id.is_not(None))
        .group_by(Lead.territory_id)
        .subquery()
    )
    stmt = (
        select(
            Territory,
            func.ST_AsGeoJSON(Territory.boundary).label("geojson"),
            Agent.agent_code,
            Profile.full_name,
            func.coalesce(lead_counts.c.n, 0).label("lead_count"),
        )
        .join(Agent, Agent.id == Territory.agent_id)
        .outerjoin(Profile, Profile.id == Agent.profile_id)
        .outerjoin(lead_counts, lead_counts.c.territory_id == Territory.id)
        .where(Territory.is_active.is_(True), *conditions)
        .order_by(Territory.name)
    )
    return (await db.execute(stmt)).all()


def to_territory_response(row) -> TerritoryResponse:
    territory, geojson, agent_code, full_name, lead_count = row
    return TerritoryResponse(
        id=territory.id,
        name=territory.name,
        color=territory.color,
        agent_id=territory.agent_id,
        agent_name=full_name or agent_code,
        agent_code=agent_code,
        area_sq_km=round(territory.area_sq_km, 3) if territory.area_sq_km is not None else None,
        points=_geojson_to_points(geojson),
        lead_count=int(lead_count or 0),
        definition_type=territory.definition_type or "drawn",
        start_label=territory.start_label,
        start_latitude=territory.start_latitude,
        start_longitude=territory.start_longitude,
        end_label=territory.end_label,
        end_latitude=territory.end_latitude,
        end_longitude=territory.end_longitude,
        radius_meters=territory.radius_meters,
        created_at=territory.created_at,
    )


def _boundary(points=None, area: Optional[TerritoryAreaSpec] = None) -> tuple[str, list[list[float]]]:
    """(WKT, outline as [lat, lng] points) from drawn points, or built on the server from geocoded places."""
    try:
        if area is not None:
            end = (area.end.latitude, area.end.longitude) if area.end else None
            ring = area_ring((area.start.latitude, area.start.longitude), end, area.radius_meters)
        else:
            ring = normalize_ring(points)
    except RuleViolation as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return ring_to_wkt(ring), [[lat, lng] for lng, lat in ring[:-1]]


def _boundary_wkt(points=None, area: Optional[TerritoryAreaSpec] = None) -> str:
    return _boundary(points, area)[0]


def _apply_definition(territory: Territory, area: Optional[TerritoryAreaSpec]) -> None:
    """Record how the boundary was defined (address details kept for display and checks)."""
    if area is None:
        territory.definition_type = "drawn"
        territory.start_label = territory.end_label = None
        territory.start_latitude = territory.start_longitude = None
        territory.end_latitude = territory.end_longitude = None
        territory.radius_meters = None
        return
    territory.definition_type = "box" if area.end else "radius"
    territory.start_label = area.start.label.strip()
    territory.start_latitude = area.start.latitude
    territory.start_longitude = area.start.longitude
    territory.end_label = area.end.label.strip() if area.end else None
    territory.end_latitude = area.end.latitude if area.end else None
    territory.end_longitude = area.end.longitude if area.end else None
    territory.radius_meters = area.radius_meters


async def _validated_outline(db: AsyncSession, wkt: str, exclude_id: Optional[uuid.UUID] = None) -> tuple[str, float]:
    """Return (WKT, area in km²) after checking shape, size and overlaps, in ONE database round trip."""
    geom = func.ST_GeomFromText(wkt, 4326)
    # Overlap maths on a self-crossing shape can raise a PostGIS error, so it only
    # runs on a valid shape (NULL otherwise) and the friendly message below wins.
    safe_geom = case((func.ST_IsValid(geom), geom), else_=None)
    overlap = (
        select(func.concat(Territory.name, " (", func.coalesce(Profile.full_name, "another agent"), ")"))
        .join(Agent, Agent.id == Territory.agent_id)
        .outerjoin(Profile, Profile.id == Agent.profile_id)
        .where(
            Territory.is_active.is_(True),
            func.ST_Intersects(Territory.boundary, safe_geom),
            func.ST_Area(cast(func.ST_Intersection(Territory.boundary, safe_geom), GEOGRAPHY)) > 1.0,
        )
    )
    if exclude_id is not None:
        overlap = overlap.where(Territory.id != exclude_id)
    valid, reason, area_m2, clash = (await db.execute(
        select(
            func.ST_IsValid(geom),
            func.ST_IsValidReason(geom),
            func.ST_Area(cast(geom, GEOGRAPHY)),
            overlap.limit(1).scalar_subquery(),
        )
    )).one()
    if not valid:
        raise HTTPException(
            status_code=422,
            detail=f"The territory outline crosses itself ({reason}). Redraw it without crossing lines.",
        )
    area_km2 = float(area_m2 or 0) / 1_000_000
    if area_km2 <= 0:
        raise HTTPException(status_code=422, detail="The territory has no area. Draw a larger shape.")
    if area_km2 > MAX_TERRITORY_AREA_SQ_KM:
        raise HTTPException(
            status_code=422,
            detail=f"The territory is {area_km2:,.0f} km²; the maximum is {MAX_TERRITORY_AREA_SQ_KM:,.0f} km².",
        )
    if clash:
        raise HTTPException(
            status_code=409,
            detail=f"This area overlaps {clash}. Each place can belong to only one agent's territory.",
        )
    return wkt, area_km2


async def _agent_for_region(db: AsyncSession, agent_id: uuid.UUID, exclude_territory: Optional[uuid.UUID] = None):
    """(agent code, agent name) in one query; 404 if missing, 409 if they already have a region."""
    existing = select(Territory.name).where(Territory.agent_id == agent_id, Territory.is_active.is_(True))
    if exclude_territory is not None:
        existing = existing.where(Territory.id != exclude_territory)
    row = (await db.execute(
        select(Agent.agent_code, Profile.full_name, existing.limit(1).scalar_subquery())
        .outerjoin(Profile, Profile.id == Agent.profile_id)
        .where(Agent.id == agent_id)
    )).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Selected agent was not found.")
    code, name, existing_name = row
    if existing_name:
        raise HTTPException(
            status_code=409,
            detail=f"This agent already has the region \"{existing_name}\". Each agent can have only one region; edit that one instead.",
        )
    return code, name


async def _set_agent_label(db: AsyncSession, agent_id: uuid.UUID, label: Optional[str]) -> None:
    """Keep the agent's display 'territory' text in step with their one region (no extra read)."""
    await db.execute(update(Agent).where(Agent.id == agent_id).values(territory=label[:100] if label else None))


async def _require_no_region(db: AsyncSession, agent_id: uuid.UUID, exclude_id: Optional[uuid.UUID] = None) -> None:
    """Each agent has exactly one region; refuse a second one."""
    query = select(Territory.name).where(Territory.agent_id == agent_id, Territory.is_active.is_(True))
    if exclude_id is not None:
        query = query.where(Territory.id != exclude_id)
    existing = await db.scalar(query.limit(1))
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"This agent already has the region \"{existing}\". Each agent can have only one region; edit that one instead.",
        )


def _response(territory: Territory, points: list[list[float]], agent_code, agent_name, lead_count: int = 0) -> TerritoryResponse:
    """Build the API response from values already in memory (no re-read)."""
    return TerritoryResponse(
        id=territory.id,
        name=territory.name,
        color=territory.color,
        agent_id=territory.agent_id,
        agent_name=agent_name or agent_code,
        agent_code=agent_code,
        area_sq_km=round(territory.area_sq_km, 3) if territory.area_sq_km is not None else None,
        points=points,
        lead_count=lead_count,
        definition_type=territory.definition_type or "drawn",
        start_label=territory.start_label,
        start_latitude=territory.start_latitude,
        start_longitude=territory.start_longitude,
        end_label=territory.end_label,
        end_latitude=territory.end_latitude,
        end_longitude=territory.end_longitude,
        radius_meters=territory.radius_meters,
        created_at=datetime.now(timezone.utc),
    )


@router.get("", response_model=TerritoryListResponse)
async def list_territories(
    agent_id: Optional[uuid.UUID] = None,
    current_admin: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> TerritoryListResponse:
    conditions = [Territory.agent_id == agent_id] if agent_id else []
    return TerritoryListResponse(items=[to_territory_response(r) for r in await territory_rows(db, *conditions)])


@router.post("", response_model=TerritoryResponse, status_code=status.HTTP_201_CREATED)
async def create_territory(
    payload: TerritoryCreateRequest,
    current_admin: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> TerritoryResponse:
    agent_code, agent_name = await _agent_for_region(db, payload.agent_id)
    wkt, points = _boundary(payload.points, payload.area)
    wkt, area_km2 = await _validated_outline(db, wkt)
    territory = Territory(
        id=uuid.uuid4(),
        name=payload.name.strip(),
        color=payload.color,
        agent_id=payload.agent_id,
        boundary=WKTElement(wkt, srid=4326),
        area_sq_km=area_km2,
        is_active=True,
        created_by_id=current_admin.id,
    )
    _apply_definition(territory, payload.area)
    db.add(territory)
    try:
        await _set_agent_label(db, payload.agent_id, territory.name)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="This agent already has a region. Each agent can have only one.")
    return _response(territory, points, agent_code, agent_name)


@router.patch("/{territory_id}", response_model=TerritoryResponse)
async def update_territory(
    territory_id: uuid.UUID,
    payload: TerritoryUpdateRequest,
    current_admin: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> TerritoryResponse:
    territory = await db.get(Territory, territory_id)
    if not territory or not territory.is_active:
        raise HTTPException(status_code=404, detail="Territory not found.")
    previous_agent = territory.agent_id
    target_agent = payload.agent_id or territory.agent_id
    agent_code, agent_name = await _agent_for_region(db, target_agent, exclude_territory=territory.id)

    if payload.name is not None:
        territory.name = payload.name.strip()
    if payload.color is not None:
        territory.color = payload.color
    territory.agent_id = target_agent

    if payload.points is not None or payload.area is not None:
        wkt, points = _boundary(payload.points, payload.area)
        wkt, area_km2 = await _validated_outline(db, wkt, exclude_id=territory.id)
        territory.boundary = WKTElement(wkt, srid=4326)
        territory.area_sq_km = area_km2
        _apply_definition(territory, payload.area)
    else:
        points = _geojson_to_points(await db.scalar(
            select(func.ST_AsGeoJSON(Territory.boundary)).where(Territory.id == territory.id)
        ))

    if previous_agent != target_agent:
        await _set_agent_label(db, previous_agent, None)
    await _set_agent_label(db, target_agent, territory.name)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="That agent already has a region. Each agent can have only one.")
    return _response(territory, points, agent_code, agent_name)


@router.delete("/{territory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_territory(
    territory_id: uuid.UUID,
    current_admin: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a region. Existing leads keep their data; their region link is cleared."""
    territory = await db.get(Territory, territory_id)
    if not territory:
        raise HTTPException(status_code=404, detail="Territory not found.")
    agent_id = territory.agent_id
    await db.delete(territory)
    await _set_agent_label(db, agent_id, None)
    await db.commit()
