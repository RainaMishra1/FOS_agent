import ssl
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from app.config import settings

connect_args = {
    "timeout": 10,
    "command_timeout": 10,
}

# Supabase and cloud PostgreSQL require SSL. Enable SSL if connecting to a remote host and not already specified.
db_url = settings.DATABASE_URL
if "localhost" not in db_url and "127.0.0.1" not in db_url:
    if "ssl=" not in db_url and "sslmode=" not in db_url:
        ssl_ctx = ssl.create_default_context()
        # In development/debug, permit TLS encryption without failing on Windows self-signed root certificate chains
        if settings.ENVIRONMENT.lower() == "development" or settings.DEBUG:
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = ssl.CERT_NONE
        connect_args["ssl"] = ssl_ctx

# Configure SQLAlchemy 2.x Async Engine with appropriate PostgreSQL async driver (asyncpg)
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    future=True,
    pool_pre_ping=True,
    connect_args=connect_args,
)



# Async Session Factory
async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that provides an asynchronous database session per request.
    Ensures safe commit, rollback, and cleanup of the session.
    """
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
