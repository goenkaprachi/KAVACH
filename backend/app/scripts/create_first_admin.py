import asyncio
import sys
from datetime import time
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.user import User
from app.models.availability import AvailabilitySchedule, AvailabilityRule


async def create_first_admin(
    email: str = "admin@kavach.infra",
    password: str = "Admin123!",
    name: str = "Admin",
    username: str = "admin",
    timezone_str: str = "Asia/Kolkata"
):
    print(f"Checking if admin account exists ({email})...")
    async with AsyncSessionLocal() as db:
        stmt = select(User).where(User.email == email.lower().strip())
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()

        if existing:
            print(f"Admin account already exists with email: {existing.email}")
            return

        admin = User(
            name=name,
            email=email.lower().strip(),
            username=username.lower().strip(),
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
        print(f"Email:    {email}")
        print(f"Password: {password}")
        print(f"Username: {username}")
        print(f"Role:     admin")
        print("=" * 50 + "\n")


if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else "admin@kavach.infra"
    password = sys.argv[2] if len(sys.argv) > 2 else "Admin123!"
    asyncio.run(create_first_admin(email=email, password=password))
