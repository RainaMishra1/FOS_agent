import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from geoalchemy2.elements import WKTElement

from app.db.session import get_db
from app.models.customer import Customer
from app.models.profile import Profile
from app.schemas.customer import CustomerListResponse, CustomerResponse, CustomerUpdateRequest
from app.core.auth import require_admin

router = APIRouter(prefix="/customers", tags=["Customers"])


@router.get("", response_model=CustomerListResponse)
async def list_customers(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of records to return"),
    city: Optional[str] = Query(None, description="Filter by city"),
    search: Optional[str] = Query(None, description="Search by customer name, company, or address"),
    current_user: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CustomerListResponse:
    """
    List customers with pagination and optional filtering/search.
    Requires authenticated user identity.
    """
    query = select(Customer)
    count_query = select(func.count(Customer.id))

    if city:
        query = query.where(Customer.city.ilike(f"%{city}%"))
        count_query = count_query.where(Customer.city.ilike(f"%{city}%"))

    if search:
        search_filter = or_(
            Customer.name.ilike(f"%{search}%"),
            Customer.company.ilike(f"%{search}%"),
            Customer.address.ilike(f"%{search}%"),
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    total = await db.scalar(count_query) or 0
    query = query.order_by(Customer.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    customers = result.scalars().all()

    items = [
        CustomerResponse(
            id=c.id,
            customer_code=c.customer_code,
            name=c.name,
            company=c.company,
            contact_person=c.contact_person,
            email=c.email,
            phone=c.phone,
            address=c.address,
            city=c.city,
            latitude=c.latitude,
            longitude=c.longitude,
            notes=c.notes,
            created_at=c.created_at,
        )
        for c in customers
    ]

    return CustomerListResponse(
        total=total,
        skip=skip,
        limit=limit,
        items=items,
    )


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: uuid.UUID,
    current_user: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CustomerResponse:
    """Retrieve details for a single customer by UUID."""
    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")
    return CustomerResponse.model_validate(customer)


@router.patch("/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: uuid.UUID,
    payload: CustomerUpdateRequest,
    current_user: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> CustomerResponse:
    """Update customer details, verified address, or entrance coordinates."""
    customer = await db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found.")

    if payload.name is not None:
        customer.name = payload.name.strip()
    if payload.company is not None:
        customer.company = payload.company.strip()
    if payload.contact_person is not None:
        customer.contact_person = payload.contact_person.strip()
    if payload.email is not None:
        customer.email = payload.email.strip().lower()
    if payload.phone is not None:
        customer.phone = payload.phone.strip()
    if payload.address is not None:
        customer.address = payload.address.strip()
    if payload.city is not None:
        customer.city = payload.city.strip()
    if payload.latitude is not None and payload.longitude is not None:
        customer.latitude = payload.latitude
        customer.longitude = payload.longitude
        customer.location = WKTElement(f"POINT({payload.longitude} {payload.latitude})", srid=4326)
    if payload.notes is not None:
        customer.notes = payload.notes.strip()

    await db.commit()
    await db.refresh(customer)
    return CustomerResponse.model_validate(customer)

