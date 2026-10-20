import os
import uuid
import logging
from typing import Optional
import httpx
from sqlalchemy import select, func
from dotenv import load_dotenv

from app.db.session import AsyncSessionLocal
from app.models.profile import Profile
from app.config import settings, BACKEND_DIR

logger = logging.getLogger("fos.bootstrap")


async def ensure_admin_account(
    email: str = "rishabmishra075@gmail.com",
    password: str = "Rishabh@2007",
    full_name: str = "Rishabh Mishra",
) -> Optional[uuid.UUID]:
    """
    Guarantees that the specified Admin account exists in both:
    1. Supabase Auth (with email_confirm=True and updated password)
    2. Application database `profiles` table (with role='admin' and linked auth_user_id)
    """
    load_dotenv(BACKEND_DIR / ".env", override=True)
    service_key = settings.SUPABASE_SERVICE_ROLE_KEY or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    supabase_url = settings.SUPABASE_URL or os.environ.get("SUPABASE_URL")

    if not service_key or not supabase_url or "placeholder" in supabase_url:
        logger.warning("[Bootstrap] Supabase service role key or URL not configured. Skipping admin ensure.")
        return None

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }

    normalized_email = email.strip().lower()
    auth_user_id: Optional[uuid.UUID] = None

    try:
        # 1. Check if user already exists in Supabase Auth
        async with httpx.AsyncClient(timeout=15.0) as client:
            list_res = await client.get(
                f"{supabase_url.rstrip('/')}/auth/v1/admin/users",
                headers=headers,
                params={"per_page": 100},
            )

            existing_user = None
            if list_res.status_code == 200:
                users = list_res.json().get("users", [])
                for u in users:
                    u_email = (u.get("email") or "").strip().lower()
                    if u_email == normalized_email:
                        existing_user = u
                        break

            if existing_user:
                auth_user_id = uuid.UUID(str(existing_user["id"]))
                logger.info(f"[Bootstrap] Found existing Supabase Auth user: {auth_user_id} ({normalized_email})")
                # Update password, confirm email, and user_metadata
                update_res = await client.put(
                    f"{supabase_url.rstrip('/')}/auth/v1/admin/users/{auth_user_id}",
                    headers=headers,
                    json={
                        "password": password,
                        "email_confirm": True,
                        "user_metadata": {"full_name": full_name},
                    },
                )
                if update_res.status_code in (200, 204):
                    logger.info(f"[Bootstrap] Successfully updated password & confirmed email for {normalized_email}")
                else:
                    logger.warning(f"[Bootstrap] Failed to update user in Supabase: {update_res.status_code} {update_res.text}")
            else:
                # Create user in Supabase Auth with auto-confirmed email
                create_res = await client.post(
                    f"{supabase_url.rstrip('/')}/auth/v1/admin/users",
                    headers=headers,
                    json={
                        "email": normalized_email,
                        "password": password,
                        "email_confirm": True,
                        "user_metadata": {"full_name": full_name},
                    },
                )
                if create_res.status_code in (200, 201):
                    created_data = create_res.json()
                    user_obj = created_data.get("user", created_data)
                    auth_user_id = uuid.UUID(str(user_obj["id"]))
                    logger.info(f"[Bootstrap] Created new Supabase Auth user: {auth_user_id} ({normalized_email})")
                else:
                    logger.error(f"[Bootstrap] Failed to create Supabase user: {create_res.status_code} {create_res.text}")
                    return None

        # 2. Check and link/create database profile
        if auth_user_id:
            async with AsyncSessionLocal() as session:
                profile = await session.scalar(
                    select(Profile).where(func.lower(Profile.email) == normalized_email)
                )

                if profile:
                    profile.auth_user_id = auth_user_id
                    profile.role = "admin"
                    profile.full_name = full_name
                    logger.info(f"[Bootstrap] Linked existing profile ({profile.id}) to auth_user_id {auth_user_id} as admin")
                else:
                    profile = Profile(
                        id=uuid.uuid4(),
                        auth_user_id=auth_user_id,
                        email=normalized_email,
                        full_name=full_name,
                        role="admin",
                    )
                    session.add(profile)
                    logger.info(f"[Bootstrap] Created new database admin Profile ({profile.id}) for {normalized_email}")

                await session.commit()
                logger.info(f"[Bootstrap] Admin account ready: {normalized_email} with role 'admin'!")

        return auth_user_id
    except Exception as exc:
        logger.error(f"[Bootstrap] Error ensuring admin account: {exc}", exc_info=True)
        return None


async def bootstrap_initial_admins():
    """Ensure both email variations are provisioned as admin."""
    # The primary email from the user's login form:
    await ensure_admin_account("rishabmishra075@gmail.com", "Rishabh@2007", "Rishabh Mishra")
    # Also handle the variant with 'h' if applicable:
    await ensure_admin_account("rishabhmishra075@gmail.com", "Rishabh@2007", "Rishabh Mishra")
