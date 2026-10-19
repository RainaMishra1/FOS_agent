import time
import uuid
import logging
from typing import Dict, Any, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError, ExpiredSignatureError
import httpx
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.session import get_db
from app.models.profile import Profile
from app.models.agent import Agent

logger = logging.getLogger("fos.auth")

# HTTP Bearer scheme (auto_error=False allows custom 401 response with WWW-Authenticate)
security_scheme = HTTPBearer(auto_error=False)

# In-memory JWKS cache for asymmetric signing keys (RS256 / ES256)
_jwks_cache: Dict[str, Any] = {
    "keys": None,
    "expires_at": 0,
}


async def get_supabase_jwks() -> Optional[Dict[str, Any]]:
    """
    Fetch and cache Supabase JSON Web Key Set (.well-known/jwks.json).
    Used for modern Supabase projects configured with asymmetric signing keys (RS256/ES256).
    """
    global _jwks_cache
    now = time.time()
    if _jwks_cache["keys"] and now < _jwks_cache["expires_at"]:
        return _jwks_cache["keys"]

    if not settings.SUPABASE_URL or "placeholder" in settings.SUPABASE_URL:
        return None

    jwks_url = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            headers = {}
            if settings.SUPABASE_ANON_KEY and "placeholder" not in settings.SUPABASE_ANON_KEY:
                headers["apikey"] = settings.SUPABASE_ANON_KEY
            resp = await client.get(jwks_url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                _jwks_cache = {
                    "keys": data,
                    "expires_at": now + 3600,  # Cache for 1 hour
                }
                return data
    except Exception as exc:
        logger.warning(f"Unable to fetch Supabase JWKS from {jwks_url}: {exc}")

    return None


async def verify_supabase_token(token: str) -> Dict[str, Any]:
    """
    Verify Supabase Access Token securely.
    Supports:
      1. Asymmetric verification (RS256 / ES256) via Supabase JWKS endpoint.
      2. Symmetric verification (HS256) via project SUPABASE_JWT_SECRET.
      3. Remote validation fallback via Supabase Auth API (/auth/v1/user) when keys rotate or vary.
    """
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Inspect unverified header for algorithm and kid
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed authentication token header",
            headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
        )

    alg = unverified_header.get("alg", "HS256")
    kid = unverified_header.get("kid")

    # 2. Asymmetric token verification (RS256 / ES256)
    if alg in ("RS256", "ES256") or kid:
        jwks = await get_supabase_jwks()
        if jwks and "keys" in jwks:
            matching_key = None
            for key in jwks["keys"]:
                if key.get("kid") == kid:
                    matching_key = key
                    break
            if not matching_key and len(jwks["keys"]) == 1:
                matching_key = jwks["keys"][0]

            if matching_key:
                try:
                    payload = jwt.decode(
                        token,
                        matching_key,
                        algorithms=[alg],
                        options={"verify_aud": False},
                    )
                    return payload
                except ExpiredSignatureError:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Authentication token has expired",
                        headers={"WWW-Authenticate": 'Bearer error="invalid_token", error_description="Token expired"'},
                    )
                except JWTError as exc:
                    logger.debug(f"Asymmetric token verification failed: {exc}")

    # 3. Symmetric token verification (HS256)
    if alg == "HS256" and settings.SUPABASE_JWT_SECRET and "change_me" not in settings.SUPABASE_JWT_SECRET:
        try:
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            return payload
        except ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token has expired",
                headers={"WWW-Authenticate": 'Bearer error="invalid_token", error_description="Token expired"'},
            )
        except JWTError as exc:
            logger.debug(f"HS256 verification with SUPABASE_JWT_SECRET failed: {exc}")

    # 4. Fallback verification via Supabase Auth API (/auth/v1/user)
    if (
        settings.SUPABASE_URL
        and "placeholder" not in settings.SUPABASE_URL
        and settings.SUPABASE_ANON_KEY
        and "placeholder" not in settings.SUPABASE_ANON_KEY
    ):
        auth_user_url = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/user"
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                resp = await client.get(
                    auth_user_url,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "apikey": settings.SUPABASE_ANON_KEY,
                    },
                )
                if resp.status_code == 200:
                    user_data = resp.json()
                    # Standardize claims dictionary
                    return {
                        "sub": user_data.get("id"),
                        "email": user_data.get("email"),
                        "app_metadata": user_data.get("app_metadata", {}),
                        "user_metadata": user_data.get("user_metadata", {}),
                    }
                elif resp.status_code in (401, 403):
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid or expired Supabase authentication token",
                        headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
                    )
        except HTTPException:
            raise
        except Exception as exc:
            logger.error(f"Error validating token against Supabase Auth: {exc}")

    # If test mode or fallback HS256 with default secret
    if settings.DEBUG or settings.ENVIRONMENT == "development":
        try:
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            return payload
        except ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token has expired",
                headers={"WWW-Authenticate": 'Bearer error="invalid_token", error_description="Token expired"'},
            )
        except Exception:
            pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication token signature or configuration",
        headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
    )


async def get_current_user_claims(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> Dict[str, Any]:
    """
    FastAPI dependency extracting and verifying the Bearer access token.
    Returns verified claims dictionary containing at minimum 'sub' (User UUID).
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header with Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    claims = await verify_supabase_token(credentials.credentials)

    sub = claims.get("sub") or claims.get("id")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject identity claim",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return claims


async def get_current_profile(
    claims: Dict[str, Any] = Depends(get_current_user_claims),
    db: AsyncSession = Depends(get_db),
) -> Profile:
    """
    FastAPI dependency resolving the authenticated database Profile from verified claims.
    Eager-loads linked operational Agent record.
    Rejects users without a provisioned Profile with a 403 Forbidden.
    """
    sub = claims.get("sub") or claims.get("id")
    try:
        user_uuid = uuid.UUID(str(sub))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user UUID in token subject",
            headers={"WWW-Authenticate": "Bearer"},
        )

    stmt = select(Profile).options(joinedload(Profile.agent)).where(Profile.id == user_uuid)
    result = await db.execute(stmt)
    profile = result.unique().scalars().first()


    if not profile:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User profile not provisioned in FOS. Please contact an administrator.",
        )

    return profile


async def require_authenticated(
    profile: Profile = Depends(get_current_profile),
) -> Profile:
    """Dependency verifying that the user has an active profile with a recognized role."""
    if profile.role not in ("admin", "agent"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{profile.role}' is not authorized for application access.",
        )
    return profile


async def require_admin(
    profile: Profile = Depends(get_current_profile),
) -> Profile:
    """Dependency enforcing that the caller possesses administrative privileges ('admin')."""
    if profile.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required to perform this action.",
        )
    return profile


async def require_agent(
    profile: Profile = Depends(get_current_profile),
) -> Profile:
    """
    Dependency enforcing that the caller is an active field agent ('agent') or admin.
    Ensures the linked Agent entity is loaded and present.
    """
    if profile.role not in ("agent", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Agent privileges required to access this resource.",
        )

    if profile.role == "agent" and not profile.agent:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account profile is marked as agent but has no active field agent record.",
        )

    return profile
