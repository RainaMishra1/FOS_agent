"""Admin territory management: polygons drawn on the map, one agent each."""
import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from geoalchemy2 import Geography
from geoalchemy2.elements import WKTElement
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_admin
from app.db.session import get_db
from app.models.agent import Agent
from app.models.lead import Lead
from app.models.profile import Profile
from app.models.territory import Territory
from app.schemas.territory import (
    TerritoryCreateRequest,
    TerritoryListResponse,
    TerritoryResponse,
    TerritoryUpdateRequest,
)
from app.services.territory_rules import RuleViolation, normalize_ring, ring_to_wkt

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
        created_at=territory.created_at,
    )


async def _validated_outline(db: AsyncSession, points, exclude_id: Optional[uuid.UUID] = None) -> tuple[str, float]:
    """Return (WKT, area in km²) after checking shape, size and overlaps."""
    try:
        wkt = ring_to_wkt(normalize_ring(points))
    except RuleViolation as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    geom = func.ST_GeomFromText(wkt, 4326)
    valid, reason, area_m2 = (await db.execute(
        select(func.ST_IsValid(geom), func.ST_IsValidReason(geom), func.ST_Area(cast(geom, Geography)))
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

    overlap_query = (
        select(Territory.name, Profile.full_name)
        .join(Agent, Agent.id == Territory.agent_id)
        .outerjoin(Profile, Profile.id == Agent.profile_id)
        .where(
            Territory.is_active.is_(True),
            func.ST_Intersects(Territory.boundary, geom),
            func.ST_Area(cast(func.ST_Intersection(Territory.boundary, geom), Geography)) > 1.0,
        )
    )
    if exclude_id is not None:
        overlap_query = overlap_query.where(Territory.id != exclude_id)
    clash = (await db.execute(overlap_query.limit(1))).first()
    if clash:
        raise HTTPException(
            status_code=409,
            detail=f"This area overlaps {clash[0]} ({clash[1] or 'another agent'}). "
                   "Each place can belong to only one agent's territory.",
        )
    return wkt, area_km2


async def _sync_agent_territory_label(db: AsyncSession, agent_id: uuid.UUID) -> None:
    """Keep the agent's display 'territory' text in step with their polygons."""
    agent = await db.get(Agent, agent_id)
    if not agent:
        return
    names = (await db.execute(
        select(Territory.name).where(Territory.agent_id == agent_id, Territory.is_active.is_(True)).order_by(Territory.name)
    )).scalars().all()
    agent.territory = ", ".join(names)[:100] if names else None


async def _require_agent(db: AsyncSession, agent_id: uuid.UUID) -> Agent:
    agent = await db.get(Agent, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Selected agent was not found.")
    return agent


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
    await _require_agent(db, payload.agent_id)
    wkt, area_km2 = await _validated_outline(db, payload.points)
    territory = Territory(
        name=payload.name.strip(),
        color=payload.color,
        agent_id=payload.agent_id,
        boundary=WKTElement(wkt, srid=4326),
        area_sq_km=area_km2,
        created_by_id=current_admin.id,
    )
    db.add(territory)
    await db.flush()
    await _sync_agent_territory_label(db, payload.agent_id)
    await db.commit()
    return to_territory_response((await territory_rows(db, Territory.id == territory.id))[0])


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
    if payload.name is not None:
        territory.name = payload.name.strip()
    if payload.color is not None:
        territory.color = payload.color
    if payload.agent_id is not None and payload.agent_id != territory.agent_id:
        await _require_agent(db, payload.agent_id)
        territory.agent_id = payload.agent_id
    if payload.points is not None:
        wkt, area_km2 = await _validated_outline(db, payload.points, exclude_id=territory.id)
        territory.boundary = WKTElement(wkt, srid=4326)
        territory.area_sq_km = area_km2
    await db.flush()
    await _sync_agent_territory_label(db, territory.agent_id)
    if previous_agent != territory.agent_id:
        await _sync_agent_territory_label(db, previous_agent)
    await db.commit()
    return to_territory_response((await territory_rows(db, Territory.id == territory.id))[0])


@router.delete("/{territory_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_territory(
    territory_id: uuid.UUID,
    current_admin: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Remove a territory. Existing leads keep their data; their territory link is cleared."""
    territory = await db.get(Territory, territory_id)
    if not territory:
        raise HTTPException(status_code=404, detail="Territory not found.")
    agent_id = territory.agent_id
    await db.delete(territory)
    await db.flush()
    await _sync_agent_territory_label(db, agent_id)
    await db.commit()
