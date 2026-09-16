from typing import AsyncGenerator
import ssl
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import settings

db_url = settings.DATABASE_POOLED_URL or settings.DATABASE_URL

if db_url.startswith("sqlite"):
    engine = create_async_engine(
        db_url,
        echo=False,
        future=True,
        connect_args={"check_same_thread": False},
    )
else:
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
