import asyncio
import os
import sys
from datetime import time
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.user import User
from app.models.availability import AvailabilitySchedule, AvailabilityRule


async def setup_aiven_admin(email: str, password: str, name: str = "Admin", username: str = ""):
    target_email = email.lower().strip()
    target_username = (username or target_email.split("@")[0]).lower().strip()

    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.email == target_email))
        admin = res.scalar_one_or_none()
        if not admin:
            admin = User(
                name=name,
                email=target_email,
                username=target_username,
                password_hash=get_password_hash(password),
                role="admin",
                status="active",
                timezone="Asia/Kolkata",
            )
            db.add(admin)
            await db.flush()
        else:
            admin.name = name
            admin.username = target_username
            admin.role = "admin"
            admin.status = "active"
            admin.password_hash = get_password_hash(password)

        # Verify default schedule
        sched_res = await db.execute(select(AvailabilitySchedule).where(AvailabilitySchedule.user_id == admin.id))
        sched = sched_res.scalar_one_or_none()
        if not sched:
            sched = AvailabilitySchedule(
                user_id=admin.id,
                name="Working Hours",
                is_default=True,
            )
            db.add(sched)
            await db.flush()
            for dow in range(1, 6):
                rule = AvailabilityRule(
                    schedule_id=sched.id,
                    day_of_week=dow,
                    start_time=time(9, 0),
                    end_time=time(17, 0),
                )
                db.add(rule)

        await db.commit()
        print(f"Admin verified & configured successfully: {target_email}")


if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("ADMIN_EMAIL", "").strip()
    password = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("ADMIN_PASSWORD", "").strip()

    if not email or not password:
        print("Error: Administrator email and password must be provided.")
        print("Usage: python -m app.scripts.setup_aiven_admin <email> <password>")
        print("   Or: set ADMIN_EMAIL and ADMIN_PASSWORD environment variables.")
        sys.exit(1)

    asyncio.run(setup_aiven_admin(email=email, password=password))
