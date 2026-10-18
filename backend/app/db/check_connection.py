"""
Database connectivity and PostGIS verification script.
Can be executed directly via:
    python -m app.db.check_connection
"""

import asyncio
import re
import sys
from sqlalchemy import text
from app.config import settings
from app.db.session import engine


def _sanitize(text_val: str) -> str:
    """Masks credentials in strings."""
    sanitized = re.sub(r"://([^:]+):([^@]+)@", r"://***:***@", text_val)
    sanitized = re.sub(r"(password\s*=\s*['\"]?)[^'\"\s]+(['\"]?)", r"\1***\2", sanitized, flags=re.IGNORECASE)
    return sanitized


async def verify_database():
    print("=" * 60)
    print("FOS Agent - Database & PostGIS Verification")
    print("=" * 60)
    print(f"Environment : {settings.ENVIRONMENT}")
    print(f"Driver      : SQLAlchemy 2.x asyncpg")
    
    # Extract safe host/database info without user/password
    try:
        url_safe = _sanitize(str(settings.DATABASE_URL))
        print(f"Target      : {url_safe}")
    except Exception:
        pass

    print("-" * 60)
    print("[1/2] Testing PostgreSQL connection...")

    try:
        async with engine.connect() as conn:
            # Test basic ping
            result = await conn.execute(text("SELECT 1 AS is_alive"))
            row = result.scalar_one_or_none()
            if row == 1:
                print("  -> SUCCESS: PostgreSQL connection established.")

            # Get current database and server version
            info = await conn.execute(text("SELECT current_database(), version()"))
            db_name, version_str = info.fetchone()
            print(f"  -> Database : {db_name}")
            print(f"  -> Server   : {version_str.split(',')[0]}")

            print("-" * 60)
            print("[2/2] Checking PostGIS extension in pg_extension...")
            ext_results = await conn.execute(
                text("SELECT extname, extversion FROM pg_extension ORDER BY extname")
            )
            extensions = ext_results.fetchall()
            ext_dict = {name: ver for name, ver in extensions}

            print(f"  -> Total extensions installed: {len(extensions)}")
            for name, ver in extensions:
                marker = " [PostGIS]" if name.lower() == "postgis" else ""
                print(f"     * {name} ({ver}){marker}")

            if "postgis" in ext_dict:
                print(f"\n[OK] PostGIS is ENABLED (version: {ext_dict['postgis']}).")
                # Try getting PostGIS version details
                try:
                    gis_ver = await conn.execute(text("SELECT PostGIS_Full_Version()"))
                    gis_full = gis_ver.scalar_one_or_none()
                    if gis_full:
                        print(f"     Details: {gis_full.split()[0]}")
                except Exception:
                    pass
                print("=" * 60)
                print("Database setup verification: PASSED")
                print("=" * 60)
                return True
            else:
                print("\n[WARNING] PostgreSQL is connected, but PostGIS is NOT enabled in pg_extension.")
                print("To enable PostGIS, run: CREATE EXTENSION postgis;")
                print("=" * 60)
                return False

    except Exception as exc:
        safe_msg = _sanitize(str(exc))
        print(f"  -> ERROR: Failed to connect to database: {exc.__class__.__name__}")
        print(f"     Details: {safe_msg}")
        print("=" * 60)
        print("Database setup verification: FAILED")
        print("=" * 60)
        return False
    finally:
        await engine.dispose()


if __name__ == "__main__":
    success = asyncio.run(verify_database())
    sys.exit(0 if success else 1)
