import logging
from contextlib import asynccontextmanager
from datetime import time
from urllib.parse import parse_qsl, urlencode
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import select

from app.core.config import settings
from app.core.database import engine, AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.base import Base
from app.models.user import User
from app.models.availability import AvailabilitySchedule, AvailabilityRule

# API Routers
from app.api.v1.auth import router as auth_router
from app.api.v1.admin_employees import router as admin_employees_router
from app.api.v1.admin_bookings import router as admin_bookings_router
from app.api.v1.admin_integrations import router as admin_integrations_router
from app.api.v1.integrations import router as integrations_router
from app.api.v1.event_types import router as event_types_router
from app.api.v1.availability import router as availability_router
from app.api.v1.bookings import router as bookings_router
from app.api.v1.system import router as system_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("kavach_connect")


async def init_db_and_seed():
    """Ensures database tables are present and seeds initial admin account."""
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables verified/created successfully.")

        async with AsyncSessionLocal() as db:
            stmt = select(User).where(User.email == "admin@kavach.infra")
            res = await db.execute(stmt)
            existing_admin = res.scalar_one_or_none()

            if not existing_admin:
                logger.info("Seeding initial administrator account (admin@kavach.infra)...")
                admin = User(
                    name="Admin",
                    email="admin@kavach.infra",
                    username="admin",
                    password_hash=get_password_hash("Admin123!"),
                    role="admin",
                    status="active",
                    timezone="Asia/Kolkata",
                )
                db.add(admin)
                await db.flush()

                # Seed default working hours
                schedule = AvailabilitySchedule(
                    user_id=admin.id,
                    name="Working Hours",
                    is_default=True,
                )
                db.add(schedule)
                await db.flush()

                # Mon(1) to Fri(5) 9am to 5pm
                for dow in range(1, 6):
                    rule = AvailabilityRule(
                        schedule_id=schedule.id,
                        day_of_week=dow,
                        start_time=time(9, 0),
                        end_time=time(17, 0),
                    )
                    db.add(rule)

                await db.commit()
                logger.info("Admin account seeded successfully (admin@kavach.infra / Admin123!).")
    except Exception as e:
        logger.error(f"Error initializing/seeding database: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db_and_seed()
    yield
    # Shutdown
    await engine.dispose()


class QuerySanitizerMiddleware(BaseHTTPMiddleware):
    """
    Strips empty query string params (e.g. ?date=&tz=) before they reach Pydantic
    to prevent spurious validation errors.
    """
    async def dispatch(self, request: Request, call_next):
        query_string = request.scope.get("query_string", b"").decode("utf-8")
        if query_string:
            pairs = parse_qsl(query_string, keep_blank_values=False)
            sanitized = urlencode([(k, v) for k, v in pairs if v.strip()])
            request.scope["query_string"] = sanitized.encode("utf-8")
        return await call_next(request)


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Kavach Connect — Meeting Scheduling & Availability Management Platform API",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

# 1. CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS + [settings.FRONTEND_BASE_URL, "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. GZip (>1000 bytes)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# 3. Query Sanitizer
app.add_middleware(QuerySanitizerMiddleware)

# Include Routers under /api/v1
api_v1 = FastAPI()
api_v1.include_router(auth_router)
api_v1.include_router(admin_employees_router)
api_v1.include_router(admin_bookings_router)
api_v1.include_router(admin_integrations_router)
api_v1.include_router(integrations_router)
api_v1.include_router(event_types_router)
api_v1.include_router(availability_router)
api_v1.include_router(bookings_router)
api_v1.include_router(system_router)

app.mount(settings.API_V1_STR, api_v1)


@app.get("/")
async def root():
    return {
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "api_v1": settings.API_V1_STR
    }
