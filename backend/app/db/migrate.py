from pathlib import Path
from sqlalchemy import text
from app.db.session import engine
from app.models.base import Base
# Import all models so that Base.metadata registers them
import app.models  # noqa: F401

INITIAL_REVISION = "2026_10_19_0001"


async def apply_migrations_async() -> dict:
    """
    Applies the core database schema safely using the application's async database connection.
    1. Creates all tables defined in Base.metadata (profiles, agents, customers, leads, visits, assignments, etc.)
    2. Initializes and stamps the alembic_version table with the initial migration revision.
    """
    async with engine.begin() as conn:
        # Create all registered tables if they do not exist (idempotent, never drops existing data)
        await conn.run_sync(Base.metadata.create_all)

        # Create alembic_version table and stamp it with the initial revision
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS alembic_version (
                    version_num VARCHAR(32) NOT NULL PRIMARY KEY
                );
                """
            )
        )
        await conn.execute(
            text(
                f"""
                INSERT INTO alembic_version (version_num)
                VALUES ('{INITIAL_REVISION}')
                ON CONFLICT (version_num) DO NOTHING;
                """
            )
        )

        # Verify tables created
        res = await conn.execute(
            text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
        )
        created_tables = [row[0] for row in res.fetchall()]

    from app.db.seed import seed_database_if_needed
    seed_result = await seed_database_if_needed()

    return {
        "status": "success",
        "stamped_revision": INITIAL_REVISION,
        "tables": created_tables,
        "table_count": len(created_tables),
        "seed_result": seed_result,
    }
