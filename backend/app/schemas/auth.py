import uuid
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict, Field


class UserProfileResponse(BaseModel):
    """Authenticated user profile response with operational agent details if applicable."""
    id: uuid.UUID
    full_name: str
    email: Optional[str] = None
    role: str
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    # Embedded agent details when user is a field agent
    agent_id: Optional[uuid.UUID] = None
    agent_code: Optional[str] = None
    agent_status: Optional[str] = None
    territory: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AdminProvisionRequest(BaseModel):
    """Payload to securely provision or promote an initial admin user."""
    user_id: uuid.UUID
    full_name: str
    email: str
    phone: Optional[str] = None
    bootstrap_secret: Optional[str] = None



class AgentLocationUpdateRequest(BaseModel):
    """Payload for field agent location & telemetry reporting."""
    latitude: float = Field(..., ge=-90.0, le=90.0, description="Latitude between -90 and 90")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="Longitude between -180 and 180")
    gps_accuracy: Optional[float] = Field(None, ge=0.0, description="GPS accuracy in meters")
    battery_level: Optional[int] = Field(None, ge=0, le=100, description="Battery percentage (0-100)")
    location_source: Literal["gps", "manual"] = Field("gps", description="Provenance of coordinates: 'gps' or 'manual'")
