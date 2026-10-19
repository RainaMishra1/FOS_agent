import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    customer_code: Optional[str] = None
    name: str
    company: Optional[str] = None
    contact_person: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: str
    city: str
    latitude: float
    longitude: float
    notes: Optional[str] = None
    created_at: datetime


class CustomerListResponse(BaseModel):
    total: int
    skip: int
    limit: int
    items: List[CustomerResponse]
    warning: Optional[str] = (
        "Development-only endpoint. Authentication and role-based access control will be enforced in production."
    )
