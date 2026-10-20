import uuid
import hmac
import logging
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
import httpx

from app.db.session import get_db
from app.models.profile import Profile
from app.models.agent import Agent
from app.schemas.auth import (UserProfileResponse, AdminProvisionRequest,
                              AccountRegistrationRequest, AccountRegistrationResponse)
from app.core.auth import get_current_profile, require_admin
from app.config import settings

router = APIRouter(prefix="/auth", tags=["Authentication & Profiles"])
logger = logging.getLogger("fos.auth.registration")


def _normalized_email(value: str) -> str:
    return value.strip().lower()


async def _register_account(
    payload: AccountRegistrationRequest,
    role: str,
    db: AsyncSession,
) -> AccountRegistrationResponse:
    email = _normalized_email(payload.email)
    full_name = payload.full_name.strip()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    if not full_name:
        raise HTTPException(status_code=422, detail="Full name is required.")
    configured_key = settings.ADMIN_REGISTRATION_KEY if role == "admin" else settings.AGENT_REGISTRATION_KEY
    if not configured_key:
        raise HTTPException(status_code=503, detail="Account registration is not configured. Contact your FOS system administrator.")
    if not hmac.compare_digest(payload.secret_key, configured_key):
        raise HTTPException(status_code=403, detail="The registration key is invalid.")
    if role == "admin" and settings.ENVIRONMENT.strip().lower() == "production":
        allowed = {item.lower() for item in settings.ADMIN_REGISTRATION_ALLOWLIST}
        if not allowed or email not in allowed:
            raise HTTPException(status_code=403, detail="This email is not approved for administrator registration.")
    if not settings.SUPABASE_SERVICE_ROLE_KEY or not settings.SUPABASE_URL or "placeholder" in settings.SUPABASE_URL:
        raise HTTPException(status_code=503, detail="Server-side Supabase account creation is not configured.")

    existing_profile = await db.scalar(select(Profile).where(func.lower(Profile.email) == email))
    agent = None
    if role == "admin":
        if existing_profile and existing_profile.role != "admin":
            raise HTTPException(status_code=409, detail="This email is already assigned to a different FOS role.")
        if existing_profile and existing_profile.auth_user_id:
            raise HTTPException(status_code=409, detail="A FOS account already exists for this email.")
    else:
        employee_id = (payload.employee_id or "").strip()
        if not employee_id:
            raise HTTPException(status_code=422, detail="Employee ID is required for agent registration.")
        matches = (await db.execute(
            select(Agent).where(func.lower(Agent.agent_code) == employee_id.lower())
        )).scalars().all()
        if len(matches) > 1:
            raise HTTPException(status_code=409, detail="Employee ID is ambiguous. Contact your FOS administrator.")
        agent = matches[0] if matches else None
        if agent is None:
            raise HTTPException(status_code=404, detail="Employee ID does not match an existing agent record. Contact your FOS administrator.")
        agent_profile = await db.get(Profile, agent.profile_id)
        if not agent_profile or agent_profile.role != "agent":
            raise HTTPException(status_code=409, detail="The employee record is not linked to a valid agent profile.")
        if existing_profile and existing_profile.id != agent_profile.id:
            raise HTTPException(status_code=409, detail="This email is already assigned to a different FOS profile.")
        if agent_profile.email and _normalized_email(agent_profile.email) != email:
            raise HTTPException(status_code=409, detail="Use the work email already assigned to this employee ID.")
        if agent_profile.auth_user_id:
            raise HTTPException(status_code=409, detail="This agent already has a linked account. Use login or password reset.")
        existing_profile = agent_profile

    service_key = settings.SUPABASE_SERVICE_ROLE_KEY
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    auth_user_id = None
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.post(
                f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/admin/users",
                headers=headers,
                json={
                    "email": email,
                    "password": payload.password,
                    "email_confirm": True,
                    "user_metadata": {"full_name": full_name},
                },
            )
        if response.status_code not in (200, 201):
            if response.status_code == 422:
                # If Supabase user already exists (e.g. from a prior registration attempt where db commit failed),
                # attempt to retrieve the existing user ID and proceed with profile creation/linking
                async with httpx.AsyncClient(timeout=12.0) as client:
                    list_resp = await client.get(
                        f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/admin/users",
                        headers=headers,
                        params={"per_page": 100},
                    )
                if list_resp.status_code == 200:
                    users_data = list_resp.json().get("users", [])
                    matched = next((u for u in users_data if _normalized_email(str(u.get("email", ""))) == email), None)
                    if matched:
                        auth_user_id = uuid.UUID(str(matched.get("id")))
                        # Update password and confirm email to ensure the user can log in immediately
                        async with httpx.AsyncClient(timeout=12.0) as client:
                            await client.put(
                                f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/admin/users/{auth_user_id}",
                                headers=headers,
                                json={"password": payload.password, "email_confirm": True},
                            )
                if not auth_user_id:
                    raise HTTPException(status_code=409, detail="A Supabase Auth account already exists for this email.")
            else:
                logger.error("Supabase Auth account creation failed with status %s", response.status_code)
                raise HTTPException(status_code=502, detail="Supabase could not create the account. Try again later or contact support.")
        else:
            auth_payload = response.json()
            auth_user = auth_payload.get("user", auth_payload)
            auth_user_id = uuid.UUID(str(auth_user.get("id")))
            auth_email = _normalized_email(str(auth_user.get("email", "")))
            if auth_email != email:
                raise HTTPException(status_code=502, detail="Supabase returned an account that does not match the requested email.")

        if existing_profile:
            existing_profile.auth_user_id = auth_user_id
            existing_profile.full_name = full_name
            existing_profile.email = email
        else:
            db.add(Profile(
                id=uuid.uuid4(),
                auth_user_id=auth_user_id,
                full_name=full_name,
                email=email,
                role=role,
            ))
        await db.commit()
    except HTTPException:
        await db.rollback()
        if auth_user_id:
            await _delete_auth_user(auth_user_id, headers)
        raise
    except IntegrityError:
        await db.rollback()
        if auth_user_id:
            await _delete_auth_user(auth_user_id, headers)
        raise HTTPException(status_code=409, detail="An account or profile with these details already exists.")
    except Exception as exc:
        await db.rollback()
        if auth_user_id:
            await _delete_auth_user(auth_user_id, headers)
        logger.error("Account registration failed (%s): %s", type(exc).__name__, exc)
        raise HTTPException(status_code=502, detail=f"Unable to complete account registration: {type(exc).__name__}")

    return AccountRegistrationResponse(
        message="Account created successfully! You can now sign in.",
        email=email,
        role=role,
    )


async def _delete_auth_user(user_id: uuid.UUID, headers: dict[str, str]) -> None:
    """Best-effort compensation if the database link cannot be committed."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            result = await client.delete(
                f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/admin/users/{user_id}",
                headers=headers,
            )
        if result.status_code not in (200, 204):
            logger.error("Could not remove orphaned Supabase Auth user after failed profile commit (status %s)", result.status_code)
    except httpx.HTTPError as exc:
        logger.error("Could not remove orphaned Supabase Auth user (%s)", type(exc).__name__)


@router.post("/signup/admin", response_model=AccountRegistrationResponse, status_code=201)
async def register_admin_account(payload: AccountRegistrationRequest, db: AsyncSession = Depends(get_db)):
    return await _register_account(payload, "admin", db)


@router.post("/signup/agent", response_model=AccountRegistrationResponse, status_code=201)
async def register_agent_account(payload: AccountRegistrationRequest, db: AsyncSession = Depends(get_db)):
    return await _register_account(payload, "agent", db)


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


@router.post("/bootstrap-first-admin")
async def bootstrap_first_admin():
    """Initial provisioning endpoint to bootstrap the administrator account."""
    from app.core.bootstrap_admin import bootstrap_initial_admins
    await bootstrap_initial_admins()
    return {"status": "success", "message": "Admin account ensured successfully. You can now sign in."}


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
    auth_profile = await db.scalar(
        select(Profile).where(Profile.auth_user_id == payload.user_id)
    )
    legacy_profile = await db.get(Profile, payload.user_id)
    email_profile = await db.scalar(
        select(Profile).where(func.lower(Profile.email) == payload.email.strip().lower())
    )
    matches = {item.id: item for item in (auth_profile, legacy_profile, email_profile) if item}
    if len(matches) > 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The Supabase account ID and email match different FOS profiles.",
        )

    profile = next(iter(matches.values()), None)
    if profile and profile.auth_user_id and profile.auth_user_id != payload.user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The FOS Profile is already linked to a different Supabase account.",
        )
    if not profile:
        profile = Profile(
            id=uuid.uuid4(),
            auth_user_id=payload.user_id,
            full_name=payload.full_name,
            email=payload.email.strip().lower(),
            role="admin",
            phone=payload.phone,
        )
        db.add(profile)
    else:
        profile.auth_user_id = payload.user_id
        profile.role = "admin"
        profile.full_name = payload.full_name
        profile.email = payload.email.strip().lower()
        if payload.phone:
            profile.phone = payload.phone
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
