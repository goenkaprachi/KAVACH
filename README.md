# Kavach Connect — Meeting Scheduling & Availability Management Platform

Kavach Connect is a full-stack meeting scheduling platform purpose-built for **Kavach Infra Solutions LLP** (Hyperbuild Live Industry Project). It features organization-wide admin oversight, employee self-service scheduling, timezone-resilient slot computation, zero double-booking database guarantees via PostgreSQL exclusion constraints, and a zero-configuration video conferencing fallback hub (Jitsi Meet).

---

## Key Highlights

- **Organization & Role Model**:
  - **Admin**: Provisions employee accounts via secure email invites, retains org-wide visibility across every employee's templates and bookings, and manages conferencing integrations.
  - **Employee**: Creates custom bookable event templates (15/30/45/60 min), manages weekly recurring availability and date-specific overrides, and tracks scheduled consultations.
  - **Invitee**: Selects slots in their local timezone and books seamlessly without requiring an account.
- **Core Availability Engine**:
  - Automatically translates host availability against invitee timezones with DST resilience.
  - Enforces buffer times (before/after), minimum notice windows, and daily booking limits.
- **Guaranteed Anti-Double-Booking**:
  - Backed by PostgreSQL `btree_gist` exclusion constraints:
    `EXCLUDE USING gist (employee_id WITH =, tstzrange(start_time, end_time) WITH &&) WHERE (status = 'confirmed')`
  - Re-evaluates live availability within atomic transactions to prevent race-condition overbooking.
- **Meeting Provider Hub**:
  - **Jitsi Meet Default**: Zero credentials required, always-on fallback that generates secure, unguessable meeting rooms.
  - Pluggable support for Zoho Meeting, Zoom, Microsoft Teams, and Whereby.
  - Confirmed bookings never ship without a working join link.

---

## Tech Stack

- **Backend**: Python 3.12, FastAPI (ASGI async), SQLAlchemy 2.0 Async (`asyncpg`), Alembic, Pydantic v2, Passlib (Bcrypt), Python-Jose (JWT).
- **Database**: Aiven for PostgreSQL (managed, SSL-enforced, `btree_gist` extension).
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, TanStack Query v5, Zustand, Lucide React, date-fns.
- **Testing**: pytest, pytest-asyncio.

---

## Directory Structure

```
kavach/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # FastAPI routers (auth, admin, event types, availability, bookings, system)
│   │   ├── core/            # Config, database async engine, security (JWT, Bcrypt, Fernet)
│   │   ├── models/          # SQLAlchemy 2.0 ORM models matching PRD schema
│   │   ├── schemas/         # Pydantic v2 request/response validation
│   │   ├── services/        # AvailabilityEngine, MeetingProviderHub, EmailService
│   │   ├── scripts/         # create_first_admin seed script
│   │   └── main.py          # FastAPI application entry point with CORS and middleware
│   ├── alembic/             # Database migrations with exclusion constraints
│   ├── tests/               # Pytest suite (availability engine, meeting hub, security, RBAC)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/      # Navbar, status badges, modals
│   │   ├── lib/             # Axios instance (auto JWT refresh), Zustand store, utils
│   │   ├── modules/         # AdminEmployees, AdminBookings, AdminIntegrations, EventTypes, Availability, Bookings
│   │   ├── pages/           # LoginPage, AcceptInvitePage, DashboardPage, PublicBookingPage, BookingSuccessPage
│   │   └── App.tsx          # Router with role-based guards
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml       # Redis service for async background queues
└── README.md
```

---

## Quickstart Guide

### 1. Database Setup (Aiven for PostgreSQL)
1. Create or access your PostgreSQL service on [Aiven Console](https://console.aiven.io/).
2. Copy your **Service URI**.
3. Create `backend/.env`:
   ```bash
   cp backend/.env.example backend/.env
   ```
4. Set your `DATABASE_URL` in `backend/.env`:
   ```env
   DATABASE_URL=postgresql+asyncpg://avnadmin:<PASSWORD>@<HOST>:<PORT>/defaultdb?ssl=require
   ```

### 2. Backend Setup
Configure your environment variables in `backend/.env` (including `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `JWT_SECRET`, and `ENCRYPTION_KEY`). Then activate the virtual environment and run database migrations:
```powershell
# In Kavach/backend:
.\.venv\Scripts\activate

# Run Alembic migrations (creates schema and provisions initial admin from ADMIN_EMAIL / ADMIN_PASSWORD):
alembic upgrade head

# Start FastAPI dev server:
uvicorn app.main:app --reload --port 8000
```
API Documentation and interactive Swagger UI are available at: `http://localhost:8000/docs`.

### 3. Frontend Setup
```powershell
# In Kavach/frontend:
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## Administrator Account & Security
- **No hardcoded default credentials or secrets** exist in the repository.
- **Initial Admin**: Provisioned automatically during Alembic migration `004_create_admin_account` using your configured `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables (passwords stored hashed with bcrypt).
- **Manual Admin Script**: You can also provision or reset an administrator account via CLI:
  ```powershell
  python -m app.scripts.create_first_admin <email> <password>
  ```
- **JWT & Encryption**: `JWT_SECRET` and `ENCRYPTION_KEY` must be supplied via environment variables; the backend validates their presence at startup.

---

## Running Test Suite
Execute the automated test suite covering the availability engine, meeting hub fallbacks, RBAC controls, and security:
```powershell
# In Kavach/backend:
.\.venv\Scripts\pytest.exe
```
All tests should pass:
```
tests\test_availability_engine.py ....   [28%]
tests\test_availability_slots.py .       [35%]
tests\test_meeting_hub.py ...            [57%]
tests\test_rbac.py ...                   [78%]
tests\test_security.py ...               [100%]
============================== 14 passed in 4.2s ==============================
```
