"""Read-only view of the operating settings the server is actually using (shown on the admin Profile page)."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import settings
from app.core.auth import require_admin
from app.models.profile import Profile

router = APIRouter(prefix="/settings", tags=["Settings"])


class OperatingSettings(BaseModel):
    check_in_radius_meters: float
    max_gps_accuracy_meters: float
    location_timeout_seconds: int
    routing_provider: str
    live_traffic: bool


def routing_provider() -> tuple[str, bool]:
    """Which road router is used first, and whether it gives live traffic."""
    if settings.OLA_MAPS_API_KEY:
        return "Ola Maps", True
    if settings.GOOGLE_ROUTES_API_KEY:
        return "Google Routes", True
    return "OpenStreetMap (OSRM)", False


@router.get("", response_model=OperatingSettings)
async def get_operating_settings(current_admin: Profile = Depends(require_admin)):
    provider, traffic = routing_provider()
    return OperatingSettings(
        check_in_radius_meters=settings.GEOFENCE_RADIUS_METERS,
        max_gps_accuracy_meters=settings.MAX_ACCEPTABLE_GPS_ACCURACY_METERS,
        location_timeout_seconds=settings.LOCATION_STALE_THRESHOLD_SECONDS,
        routing_provider=provider,
        live_traffic=traffic,
    )
