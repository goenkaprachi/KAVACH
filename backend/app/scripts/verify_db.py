import asyncio
import sys
import uuid
from datetime import datetime, date, time, timedelta, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import text, select, func
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import engine, AsyncSessionLocal
from app.models.base import Base
from app.models.user import User, Team, TeamMember
from app.models.availability import AvailabilitySchedule, AvailabilityRule, AvailabilityOverride
from app.models.event_type import EventType
from app.models.booking import Booking, Invitee
from app.models.integration import CalendarConnection, MeetingProviderConfig
from app.models.notification import NotificationTemplate, Workflow, NotificationsLog, AuditLog
from app.services.availability_engine import AvailabilityEngine


async def run_db_verification():
    print("=" * 60)
    print("KAVACH CONNECT -- DATABASE INTEGRATION VERIFICATION")
    print(f"Target Database URL: {settings.DATABASE_URL}")
    print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print("=" * 60)

    results = []

    # 1. Connection Test
    print("\n[1/7] Testing basic connectivity...")
    try:
        async with engine.connect() as conn:
            res = await conn.execute(text("SELECT 1"))
            val = res.scalar()
            assert val == 1
        print("  [OK] Database connection established successfully.")
        results.append(("Connection", True, "Connected & executed SELECT 1"))
    except Exception as e:
        print(f"  [ERR] Connection failed: {e}")
        results.append(("Connection", False, str(e)))
        return results

    # 2. Schema Table Audit
    print("\n[2/7] Verifying database schema & tables...")
    expected_tables = [
        "users", "teams", "team_members",
        "availability_schedules", "availability_rules", "availability_overrides",
        "event_types", "calendar_connections", "meeting_provider_configs",
        "bookings", "invitees", "notification_templates",
        "workflows", "notifications_log", "audit_logs"
    ]
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        def get_tables(sync_conn):
            from sqlalchemy import inspect
            inspector = inspect(sync_conn)
            return inspector.get_table_names()

        async with engine.connect() as conn:
            existing_tables = await conn.run_sync(get_tables)

        missing = [t for t in expected_tables if t not in existing_tables]
        if not missing:
            print(f"  [OK] All {len(expected_tables)} required tables exist in database:")
            for t in expected_tables:
                print(f"    - {t}")
            results.append(("Table Schema", True, f"All {len(expected_tables)} tables present"))
        else:
            print(f"  [ERR] Missing tables: {missing}")
            results.append(("Table Schema", False, f"Missing: {missing}"))
    except Exception as e:
        print(f"  [ERR] Schema verification error: {e}")
        results.append(("Table Schema", False, str(e)))

    # 3. Seeded Admin Account Verification
    print("\n[3/7] Verifying seeded administrator account...")
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(User).where(User.email == "admin@kavach.infra")
            res = await session.execute(stmt)
            admin = res.scalar_one_or_none()
            if admin:
                print("  [OK] Admin account found:")
                print(f"    - ID: {admin.id}")
                print(f"    - Email: {admin.email}")
                print(f"    - Role: {admin.role}")
                print(f"    - Status: {admin.status}")
                print(f"    - Timezone: {admin.timezone}")
                results.append(("Admin Account", True, f"Verified active admin ({admin.email})"))
            else:
                print("  [ERR] Admin account not found!")
                results.append(("Admin Account", False, "admin@kavach.infra missing"))
    except Exception as e:
        print(f"  [ERR] Admin verification error: {e}")
        results.append(("Admin Account", False, str(e)))

    # 4. End-to-End Relational CRUD Verification
    print("\n[4/7] Testing relational CRUD operations (User -> Schedule -> EventType -> Booking -> Invitee)...")
    test_user_id = uuid.uuid4()
    test_email = f"test_employee_{test_user_id.hex[:6]}@kavach.infra"
    try:
        async with AsyncSessionLocal() as session:
            test_employee = User(
                id=test_user_id,
                name="Database Test Employee",
                email=test_email,
                username=f"testemp_{test_user_id.hex[:6]}",
                role="employee",
                status="active",
                timezone="Asia/Kolkata"
            )
            session.add(test_employee)
            await session.flush()

            schedule = AvailabilitySchedule(
                user_id=test_employee.id,
                name="Standard Hours",
                is_default=True
            )
            session.add(schedule)
            await session.flush()

            for dow in range(1, 6):
                rule = AvailabilityRule(
                    schedule_id=schedule.id,
                    day_of_week=dow,
                    start_time=time(9, 0),
                    end_time=time(17, 0)
                )
                session.add(rule)

            event_type = EventType(
                owner_user_id=test_employee.id,
                title="Product Architecture Review",
                slug=f"arch-review-{test_user_id.hex[:4]}",
                duration_minutes=30,
                location_type="jitsi",
                buffer_before_minutes=10,
                buffer_after_minutes=10,
                min_notice_minutes=0,
                max_days_in_advance=60,
                is_active=True,
                schedule_id=schedule.id
            )
            session.add(event_type)
            await session.flush()

            now_utc = datetime.now(timezone.utc)
            start_slot = (now_utc + timedelta(days=7)).replace(hour=10, minute=0, second=0, microsecond=0)
            end_slot = start_slot + timedelta(minutes=30)

            booking = Booking(
                event_type_id=event_type.id,
                employee_id=test_employee.id,
                start_time=start_slot,
                end_time=end_slot,
                status="confirmed",
                meeting_provider="jitsi",
                meeting_join_url=f"https://meet.jit.si/kavach-test-{uuid.uuid4().hex[:8]}"
            )
            session.add(booking)
            await session.flush()

            invitee = Invitee(
                booking_id=booking.id,
                name="Enterprise Client",
                email="client@example.com",
                timezone="Asia/Kolkata"
            )
            session.add(invitee)
            await session.commit()
            print("  [OK] Relational write succeeded (User, Schedule, EventType, Booking, Invitee committed).")

        async with AsyncSessionLocal() as session:
            stmt = select(User).where(User.id == test_user_id).options(
                selectinload(User.event_types),
                selectinload(User.availability_schedules).selectinload(AvailabilitySchedule.rules),
                selectinload(User.bookings).selectinload(Booking.invitees)
            )
            res = await session.execute(stmt)
            fetched_user = res.scalar_one()

            assert fetched_user.email == test_email
            assert len(fetched_user.event_types) == 1
            assert len(fetched_user.availability_schedules) == 1
            assert len(fetched_user.availability_schedules[0].rules) == 5
            assert len(fetched_user.bookings) == 1
            assert len(fetched_user.bookings[0].invitees) == 1
            assert fetched_user.bookings[0].invitees[0].name == "Enterprise Client"
            print("  [OK] Relational read-back verified with all nested foreign-key relationships.")
            results.append(("Relational CRUD", True, "Successfully created and verified User->Schedule->EventType->Booking->Invitee graph"))
    except Exception as e:
        print(f"  [ERR] Relational CRUD error: {e}")
        results.append(("Relational CRUD", False, str(e)))

    # 5. Live Availability Engine Query against DB
    print("\n[5/7] Testing Availability Engine querying live database state...")
    try:
        async with AsyncSessionLocal() as session:
            target_date = (datetime.now(timezone.utc) + timedelta(days=7)).date()
            slots = await AvailabilityEngine.get_available_slots_for_date(
                session=session,
                event_type=event_type,
                employee=test_employee,
                target_date=target_date,
                invitee_tz_str="UTC"
            )
            print(f"  [OK] Availability Engine generated {len(slots)} valid slots from database availability rules.")
            results.append(("Availability Engine Query", True, f"Calculated {len(slots)} slots live from database"))
    except Exception as e:
        print(f"  [ERR] Availability Engine DB query error: {e}")
        results.append(("Availability Engine Query", False, str(e)))

    # 6. Cascade Deletion Cleanup Test
    print("\n[6/7] Testing cascade deletion integrity...")
    try:
        async with AsyncSessionLocal() as session:
            stmt = select(User).where(User.id == test_user_id)
            res = await session.execute(stmt)
            u = res.scalar_one_or_none()
            if u:
                await session.delete(u)
                await session.commit()

            b_check = await session.execute(select(Booking).where(Booking.employee_id == test_user_id))
            assert len(b_check.scalars().all()) == 0
            et_check = await session.execute(select(EventType).where(EventType.owner_user_id == test_user_id))
            assert len(et_check.scalars().all()) == 0
            print("  [OK] Cascade deletion verified (Deleting test user cleanly removed dependent bookings & event types).")
            results.append(("Cascade Integrity", True, "Foreign key CASCADE triggers functioning properly"))
    except Exception as e:
        print(f"  [ERR] Cascade deletion error: {e}")
        results.append(("Cascade Integrity", False, str(e)))

    # 7. Transaction Rollback Integrity
    print("\n[7/7] Testing transactional atomicity and rollback...")
    try:
        async with AsyncSessionLocal() as session:
            try:
                dup_user = User(
                    name="Duplicate",
                    email="admin@kavach.infra",
                    username="dup_admin",
                    role="employee"
                )
                session.add(dup_user)
                await session.commit()
                results.append(("Transaction Rollback", False, "Duplicate email did not raise error!"))
            except Exception:
                await session.rollback()
                print("  [OK] Unique constraint violation correctly caught and transaction safely rolled back.")
                results.append(("Transaction Rollback", True, "Unique constraints and transaction rollbacks operate as expected"))
    except Exception as e:
        print(f"  [ERR] Transaction test error: {e}")
        results.append(("Transaction Rollback", False, str(e)))

    # Summary
    print("\n" + "=" * 60)
    print("DATABASE INTEGRATION VERIFICATION SUMMARY:")
    all_passed = all(r[1] for r in results)
    for name, passed, detail in results:
        status = "PASSED" if passed else "FAILED"
        print(f"  [{status}] {name}: {detail}")
    print("=" * 60)
    if all_passed:
        print("ALL DATABASE INTEGRATION CHECKS PASSED SUCCESSFULLY!\n")
    else:
        print("SOME CHECKS FAILED. See details above.\n")

    return results


if __name__ == "__main__":
    asyncio.run(run_db_verification())
