from typing import AsyncGenerator
import ssl
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import settings

db_url = settings.DATABASE_POOLED_URL or settings.DATABASE_URL

if not db_url or "sqlite" in db_url.lower() or not db_url.startswith("postgresql"):
    raise RuntimeError(
        "DATABASE_URL is missing or is not a PostgreSQL connection string. "
        "The application requires PostgreSQL and presupposes Alembic migrations have already run. "
        "SQLite fallback is disabled."
    )

connect_args = {}
if settings.DATABASE_SSL_CA_PATH:
    ssl_context = ssl.create_default_context(cafile=settings.DATABASE_SSL_CA_PATH)
    connect_args["ssl"] = ssl_context

engine = create_async_engine(
    db_url,
    echo=False,
    future=True,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args=connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
