"""
FOS Secure Account Provisioning CLI
Allows administrators to securely provision Admin or Field Agent accounts.
Links Supabase Auth identities to Profile and Agent database models.

Usage:
    python scripts/provision_account.py --email agent1@fos-system.internal --password "SecurePass123!" --name "Marcus Vance" --role agent --code AGT-101 --territory "Koramangala Zone"
"""

import argparse
import asyncio
import os
import sys
import uuid
import httpx
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from app.db.session import async_session_factory
from app.models.profile import Profile
from app.models.agent import Agent


async def provision_user(
    email: str,
    password: str,
    name: str,
    role: str,
    agent_code: str = None,
    territory: str = None,
    phone: str = None,
):
    clean_email = email.strip().lower()
    clean_role = role.strip().lower()

    if clean_role not in ("admin", "agent"):
        print(f"Error: Role must be 'admin' or 'agent', got '{role}'", file=sys.stderr)
        return False

    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or getattr(
        settings, "SUPABASE_SERVICE_ROLE_KEY", None
    )
    supabase_url = settings.SUPABASE_URL.rstrip("/") if settings.SUPABASE_URL else None

    supabase_user_id = None

    # Step 1: Provision in Supabase Auth via Admin API if service key available
    if service_role_key and supabase_url and "placeholder" not in supabase_url:
        admin_auth_url = f"{supabase_url}/auth/v1/admin/users"
        headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "email": clean_email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {
                "full_name": name,
                "role": clean_role,
            },
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(admin_auth_url, headers=headers, json=payload)
                if res.status_code in (200, 201):
                    data = res.json()
                    supabase_user_id = uuid.UUID(data.get("id"))
                    print(f"Created user in Supabase Auth (User ID: {supabase_user_id})")
                elif res.status_code == 422 and "already been registered" in res.text:
                    print("User already registered in Supabase Auth. Syncing database profile...")
                else:
                    print(f"Supabase Auth admin creation returned status {res.status_code}: {res.text}")
        except Exception as exc:
            print(f"Notice: Supabase admin API call skipped/failed ({exc}). Creating database profile directly.")

    # Step 2: Provision Profile and Agent in PostgreSQL database
    async with async_session_factory() as db:
        # Check if profile already exists
        stmt = (
            select(Profile)
            .options(joinedload(Profile.agent))
            .where(func.lower(Profile.email) == clean_email)
        )
        res = await db.execute(stmt)
        existing_profile = res.unique().scalars().first()

        if existing_profile:
            profile = existing_profile
            profile.full_name = name
            profile.role = clean_role
            if phone:
                profile.phone = phone
            print(f"Updated existing database profile for {clean_email}")
        else:
            profile_id = supabase_user_id or uuid.uuid4()
            profile = Profile(
                id=profile_id,
                full_name=name,
                email=clean_email,
                role=clean_role,
                phone=phone,
            )
            db.add(profile)
            await db.flush()
            print(f"Created new Profile record (ID: {profile.id}) with role: {clean_role}")

        # If agent, link or update Agent record
        if clean_role == "agent":
            code = agent_code or f"AGT-{uuid.uuid4().hex[:4].upper()}"
            if profile.agent:
                profile.agent.agent_code = code
                if territory:
                    profile.agent.territory = territory
                print(f"Updated linked Agent record (Code: {code})")
            else:
                agent = Agent(
                    id=uuid.uuid4(),
                    profile_id=profile.id,
                    agent_code=code,
                    status="active",
                    territory=territory or "Bengaluru Central",
                )
                db.add(agent)
                print(f"Linked new Agent record (Code: {code}, Territory: {agent.territory})")

        await db.commit()
        print(f"Successfully provisioned account '{clean_email}' with role '{clean_role}'!")
        return True


def main():
    parser = argparse.ArgumentParser(description="Provision FOS Enterprise user account.")
    parser.add_argument("--email", required=True, help="User email address")
    parser.add_argument("--password", required=True, help="User account password")
    parser.add_argument("--name", required=True, help="Full name of user")
    parser.add_argument("--role", required=True, choices=["admin", "agent"], help="User role")
    parser.add_argument("--code", help="Agent employee code (e.g. AGT-101)")
    parser.add_argument("--territory", help="Assigned territory for field agent")
    parser.add_argument("--phone", help="Contact phone number")

    args = parser.parse_args()

    asyncio.run(
        provision_user(
            email=args.email,
            password=args.password,
            name=args.name,
            role=args.role,
            agent_code=args.code,
            territory=args.territory,
            phone=args.phone,
        )
    )


if __name__ == "__main__":
    main()
