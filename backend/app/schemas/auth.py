import uuid
from typing import Optional
from pydantic import BaseModel, ConfigDict


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
    latitude: float
    longitude: float
    gps_accuracy: Optional[float] = None
    battery_level: Optional[int] = None
