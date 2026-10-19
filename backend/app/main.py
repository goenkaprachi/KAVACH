import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import time
from urllib.parse import parse_qsl, urlencode
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import select, text

from app.core.config import settings
from app.core.database import engine, AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.base import Base
from app.models.user import User
from app.models.availability import AvailabilitySchedule, AvailabilityRule
from app.models.notification import Workflow

# API Routers
from app.api.v1.auth import router as auth_router
from app.api.v1.admin_employees import router as admin_employees_router
from app.api.v1.admin_bookings import router as admin_bookings_router
from app.api.v1.admin_integrations import router as admin_integrations_router
from app.api.v1.integrations import router as integrations_router
from app.api.v1.event_types import router as event_types_router
from app.api.v1.availability import router as availability_router
from app.api.v1.bookings import router as bookings_router
from app.api.v1.admin_templates import router as admin_templates_router
from app.api.v1.workflows import router as workflows_router
from app.api.v1.routing_forms import router as routing_forms_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.branding import router as branding_router
from app.api.v1.system import router as system_router
from app.services.reminder_service import reminder_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("kavach_connect")


async def init_db_and_seed():
    """Presupposes PostgreSQL database and Alembic migrations already exist.
    The administrator account is created exclusively via Alembic migration or management script.
    Seeds default reminder workflows if not present.
    """
    try:
        async with AsyncSessionLocal() as db:
            # Seed default workflows if none exist and an admin exists
            wf_stmt = select(Workflow).limit(1)
            wf_res = await db.execute(wf_stmt)
            if not wf_res.scalar_one_or_none():
                admin_stmt = select(User).where(User.role == "admin").limit(1)
                admin_res = await db.execute(admin_stmt)
                admin_user = admin_res.scalar_one_or_none()
                if admin_user:
                    logger.info("Seeding default automated reminder workflows...")
                    default_workflows = [
                        Workflow(
                            owner_user_id=admin_user.id,
                            name="24-Hour Advance Email Reminder (Attendee)",
                            trigger_type="before_event",
                            offset_minutes=1440,
                            action_type="email_attendee",
                            is_active=True,
                        ),
                        Workflow(
                            owner_user_id=admin_user.id,
                            name="1-Hour Urgent Join Reminder (Attendee)",
                            trigger_type="before_event",
                            offset_minutes=60,
                            action_type="email_attendee",
                            is_active=True,
                        ),
                        Workflow(
                            owner_user_id=admin_user.id,
                            name="15-Minute Upcoming Alert (Host Employee)",
                            trigger_type="before_event",
                            offset_minutes=15,
                            action_type="email_host",
                            is_active=True,
                        ),
                        Workflow(
                            owner_user_id=admin_user.id,
                            name="Post-Meeting Follow-up (Attendee)",
                            trigger_type="after_event",
                            offset_minutes=30,
                            action_type="email_attendee",
                            is_active=True,
                        ),
                    ]
                    db.add_all(default_workflows)
                    await db.commit()
                    logger.info("Default automated workflows seeded successfully.")
    except Exception as e:
        logger.error(f"Error initializing/seeding database: {e}")


async def reminder_worker_loop():
    logger.info("Reminder background worker started.")
    while True:
        try:
            await asyncio.sleep(60)
            async with AsyncSessionLocal() as db:
                await reminder_service.process_due_reminders(db)
        except asyncio.CancelledError:
            logger.info("Reminder background worker shutting down.")
            break
        except Exception as e:
            logger.error(f"Error in reminder worker loop: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db_and_seed()
    worker_task = asyncio.create_task(reminder_worker_loop())
    yield
    # Shutdown
    worker_task.cancel()
    await asyncio.gather(worker_task, return_exceptions=True)
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
    allow_origins=settings.CORS_ORIGINS,
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
api_v1.include_router(admin_templates_router)
api_v1.include_router(workflows_router)
api_v1.include_router(routing_forms_router)
api_v1.include_router(analytics_router)
api_v1.include_router(branding_router)
api_v1.include_router(system_router)

# Direct alias for reminders
from app.api.v1.bookings import list_reminders
api_v1.add_api_route("/reminders", list_reminders, methods=["GET"], tags=["Reminders"])

app.mount(settings.API_V1_STR, api_v1)


@app.get("/")
async def root():
    return {
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "api_v1": settings.API_V1_STR
    }
