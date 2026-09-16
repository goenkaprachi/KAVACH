import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.availability import AvailabilitySchedule, AvailabilityRule, AvailabilityOverride
from app.schemas.availability import (
    AvailabilityScheduleCreate,
    AvailabilityScheduleUpdate,
    AvailabilityScheduleResponse,
    AvailabilityOverrideCreate,
    AvailabilityOverrideResponse,
)
from app.api.deps import require_employee

router = APIRouter(prefix="/availability/schedules", tags=["Availability"])


@router.get("", response_model=List[AvailabilityScheduleResponse])
async def list_schedules(
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AvailabilitySchedule).where(
        AvailabilitySchedule.user_id == current_user.id
    ).options(
        selectinload(AvailabilitySchedule.rules),
        selectinload(AvailabilitySchedule.overrides),
    ).order_by(AvailabilitySchedule.created_at.asc())
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("", response_model=AvailabilityScheduleResponse)
async def create_schedule(
    req: AvailabilityScheduleCreate,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    schedule = AvailabilitySchedule(
        user_id=current_user.id,
        name=req.name,
        is_default=req.is_default
    )
    db.add(schedule)
    await db.flush()

    for r in req.rules:
        rule = AvailabilityRule(
            schedule_id=schedule.id,
            day_of_week=r.day_of_week,
            start_time=r.start_time,
            end_time=r.end_time
        )
        db.add(rule)

    await db.commit()
    await db.refresh(schedule)

    stmt = select(AvailabilitySchedule).where(AvailabilitySchedule.id == schedule.id).options(
        selectinload(AvailabilitySchedule.rules),
        selectinload(AvailabilitySchedule.overrides)
    )
    res = await db.execute(stmt)
    return res.scalar_one()


@router.patch("/{schedule_id}", response_model=AvailabilityScheduleResponse)
async def update_schedule(
    schedule_id: uuid.UUID,
    req: AvailabilityScheduleUpdate,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AvailabilitySchedule).where(
        AvailabilitySchedule.id == schedule_id,
        AvailabilitySchedule.user_id == current_user.id
    ).options(
        selectinload(AvailabilitySchedule.rules),
        selectinload(AvailabilitySchedule.overrides)
    )
    res = await db.execute(stmt)
    schedule = res.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    if req.name is not None:
        schedule.name = req.name
    if req.is_default is not None:
        schedule.is_default = req.is_default

    if req.rules is not None:
        # Replace rules
        for r in list(schedule.rules):
            await db.delete(r)
        await db.flush()

        for r_in in req.rules:
            new_rule = AvailabilityRule(
                schedule_id=schedule.id,
                day_of_week=r_in.day_of_week,
                start_time=r_in.start_time,
                end_time=r_in.end_time
            )
            db.add(new_rule)

    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.post("/{schedule_id}/overrides", response_model=AvailabilityOverrideResponse)
async def add_date_override(
    schedule_id: uuid.UUID,
    req: AvailabilityOverrideCreate,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AvailabilitySchedule).where(
        AvailabilitySchedule.id == schedule_id,
        AvailabilitySchedule.user_id == current_user.id
    )
    res = await db.execute(stmt)
    schedule = res.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    # Check if override for this date exists; update or insert
    ov_stmt = select(AvailabilityOverride).where(
        AvailabilityOverride.schedule_id == schedule_id,
        AvailabilityOverride.override_date == req.override_date
    )
    ov_res = await db.execute(ov_stmt)
    override = ov_res.scalar_one_or_none()

    if override:
        override.is_unavailable = req.is_unavailable
        override.start_time = req.start_time
        override.end_time = req.end_time
    else:
        override = AvailabilityOverride(
            schedule_id=schedule_id,
            override_date=req.override_date,
            is_unavailable=req.is_unavailable,
            start_time=req.start_time,
            end_time=req.end_time
        )
        db.add(override)

    await db.commit()
    await db.refresh(override)
    return override


@router.delete("/{schedule_id}/overrides/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_date_override(
    schedule_id: uuid.UUID,
    override_id: uuid.UUID,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AvailabilityOverride).join(AvailabilitySchedule).where(
        AvailabilityOverride.id == override_id,
        AvailabilitySchedule.id == schedule_id,
        AvailabilitySchedule.user_id == current_user.id
    )
    res = await db.execute(stmt)
    override = res.scalar_one_or_none()
    if not override:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Override not found")

    await db.delete(override)
    await db.commit()
    return None
