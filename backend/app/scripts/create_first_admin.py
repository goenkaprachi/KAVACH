import asyncio
import os
import sys
from datetime import time
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.user import User
from app.models.availability import AvailabilitySchedule, AvailabilityRule


async def create_first_admin(
    email: str,
    password: str,
    name: str = "Admin",
    username: str = "",
    timezone_str: str = "Asia/Kolkata"
):
    if not email or not password:
        raise ValueError("Both email and password are required to create the administrator account.")

    target_email = email.lower().strip()
    target_username = (username or target_email.split("@")[0]).lower().strip()

    print(f"Checking if admin account exists ({target_email})...")
    async with AsyncSessionLocal() as db:
        stmt = select(User).where(User.email == target_email)
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()

        if existing:
            print(f"Admin account already exists with email: {existing.email}")
            return

        admin = User(
            name=name,
            email=target_email,
            username=target_username,
            password_hash=get_password_hash(password),
            role="admin",
            status="active",
            timezone=timezone_str
        )
        db.add(admin)
        await db.flush()

        # Create default working hours schedule
        schedule = AvailabilitySchedule(
            user_id=admin.id,
            name="Working Hours",
            is_default=True
        )
        db.add(schedule)
        await db.flush()

        # Monday(1) through Friday(5) 9am to 5pm
        for dow in range(1, 6):
            rule = AvailabilityRule(
                schedule_id=schedule.id,
                day_of_week=dow,
                start_time=time(9, 0),
                end_time=time(17, 0)
            )
            db.add(rule)

        await db.commit()
        print("\n" + "=" * 50)
        print("First Admin Account Created Successfully!")
        print(f"Email:    {target_email}")
        print(f"Username: {target_username}")
        print(f"Role:     admin")
        print("Password: [SECURELY HASHED]")
        print("=" * 50 + "\n")


if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("ADMIN_EMAIL", "").strip()
    password = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("ADMIN_PASSWORD", "").strip()

    if not email or not password:
        print("Error: Administrator email and password must be provided.")
        print("Usage: python -m app.scripts.create_first_admin <email> <password>")
        print("   Or: set ADMIN_EMAIL and ADMIN_PASSWORD environment variables.")
        sys.exit(1)

    asyncio.run(create_first_admin(email=email, password=password))
