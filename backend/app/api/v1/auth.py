import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.profile import Profile
from app.models.agent import Agent
from app.schemas.auth import UserProfileResponse, AdminProvisionRequest
from app.core.auth import get_current_profile, require_admin

router = APIRouter(prefix="/auth", tags=["Authentication & Profiles"])


@router.get("/me", response_model=UserProfileResponse)
async def get_my_profile(
    profile: Profile = Depends(get_current_profile),
) -> UserProfileResponse:
    """
    Retrieve the verified Profile and operational details for the authenticated user.
    Accessible by any verified user with an active profile.
    """
    agent = profile.agent
    return UserProfileResponse(
        id=profile.id,
        full_name=profile.full_name,
        email=profile.email,
        role=profile.role,
        phone=profile.phone,
        avatar_url=profile.avatar_url,
        agent_id=agent.id if agent else None,
        agent_code=agent.agent_code if agent else None,
        agent_status=agent.status if agent else None,
        territory=agent.territory if agent else None,
    )


@router.post("/bootstrap-first-admin", response_model=UserProfileResponse)
async def bootstrap_first_admin(
    payload: AdminProvisionRequest,
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """
    Securely provisions the very first Administrator account in FOS.
    Security policy:
      - This endpoint is automatically disabled as soon as any admin exists in the database.
      - Once an admin exists, subsequent admins can ONLY be provisioned by an authenticated admin.
    """
    # Check if any admin already exists in the system
    admin_count = await db.scalar(
        select(func.count(Profile.id)).where(Profile.role == "admin")
    )
    if admin_count and admin_count > 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bootstrap disabled: An administrator already exists. Subsequent administrators must be invited by an active admin.",
        )

    # Check if profile already exists for this UUID
    existing_profile = await db.scalar(
        select(Profile).where(Profile.id == payload.user_id)
    )

    if existing_profile:
        existing_profile.role = "admin"
        existing_profile.full_name = payload.full_name
        existing_profile.email = payload.email
        if payload.phone:
            existing_profile.phone = payload.phone
        await db.commit()
        await db.refresh(existing_profile)
        profile = existing_profile
    else:
        profile = Profile(
            id=payload.user_id,
            full_name=payload.full_name,
            email=payload.email,
            role="admin",
            phone=payload.phone,
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)

    return UserProfileResponse(
        id=profile.id,
        full_name=profile.full_name,
        email=profile.email,
        role=profile.role,
        phone=profile.phone,
        avatar_url=profile.avatar_url,
    )


@router.post("/provision-admin", response_model=UserProfileResponse)
async def provision_admin_by_admin(
    payload: AdminProvisionRequest,
    current_admin: Profile = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """
    Administrative endpoint to provision or promote another user to Administrator.
    Strictly restricted to existing verified administrators.
    """
    existing_profile = await db.scalar(
        select(Profile).where(Profile.id == payload.user_id)
    )

    if existing_profile:
        existing_profile.role = "admin"
        existing_profile.full_name = payload.full_name
        existing_profile.email = payload.email
        if payload.phone:
            existing_profile.phone = payload.phone
        await db.commit()
        await db.refresh(existing_profile)
        profile = existing_profile
    else:
        profile = Profile(
            id=payload.user_id,
            full_name=payload.full_name,
            email=payload.email,
            role="admin",
            phone=payload.phone,
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)

    return UserProfileResponse(
        id=profile.id,
        full_name=profile.full_name,
        email=profile.email,
        role=profile.role,
        phone=profile.phone,
        avatar_url=profile.avatar_url,
    )
