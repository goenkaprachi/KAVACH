import asyncio
from datetime import time
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.user import User
from app.models.availability import AvailabilitySchedule, AvailabilityRule


async def setup_aiven_admin():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.email == "admin@kavach.infra"))
        admin = res.scalar_one_or_none()
        if not admin:
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
        else:
            admin.name = "Admin"
            admin.username = "admin"
            admin.role = "admin"
            admin.status = "active"
            admin.password_hash = get_password_hash("Admin123!")

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
        print("Aiven Admin verified & seeded: admin@kavach.infra / Admin123!")


if __name__ == "__main__":
    asyncio.run(setup_aiven_admin())
