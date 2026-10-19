from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.customer import Customer
from app.models.profile import Profile
from app.schemas.customer import CustomerListResponse, CustomerResponse
from app.core.auth import require_authenticated

router = APIRouter(prefix="/customers", tags=["Customers"])


@router.get("", response_model=CustomerListResponse)
async def list_customers(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of records to return"),
    city: Optional[str] = Query(None, description="Filter by city"),
    search: Optional[str] = Query(None, description="Search by customer name, company, or address"),
    current_user: Profile = Depends(require_authenticated),
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
