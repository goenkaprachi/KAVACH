import uuid
import logging
from datetime import time, date, datetime, timezone
from zoneinfo import ZoneInfo
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.availability import AvailabilitySchedule, AvailabilityRule, AvailabilityOverride
from app.models.booking import Booking
from app.models.notification import AuditLog
from app.schemas.availability import (
    AvailabilityScheduleCreate,
    AvailabilityScheduleUpdate,
    AvailabilityScheduleResponse,
    AvailabilityOverrideCreate,
    AvailabilityOverrideResponse,
    OutOfOfficeBookingPreviewItem,
    OutOfOfficePreviewResponse,
    MarkOutOfOfficeRequest,
    MarkOutOfOfficeResponse,
)
from app.api.deps import require_employee
from app.services.email_service import email_service
from app.services.meeting_provider_hub import meeting_hub

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/availability", tags=["Availability"])


# ---------------------------------------------------------------------------
# Availability Schedules & Overrides
# ---------------------------------------------------------------------------

@router.get("/schedules", response_model=List[AvailabilityScheduleResponse])
async def list_schedules(
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(AvailabilitySchedule)
        .where(AvailabilitySchedule.user_id == current_user.id)
        .options(
            selectinload(AvailabilitySchedule.rules),
            selectinload(AvailabilitySchedule.overrides),
        )
        .order_by(AvailabilitySchedule.created_at.asc())
    )
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("/schedules", response_model=AvailabilityScheduleResponse)
async def create_schedule(
    req: AvailabilityScheduleCreate,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    schedule = AvailabilitySchedule(
        user_id=current_user.id,
        name=req.name,
        is_default=req.is_default,
    )
    db.add(schedule)
    await db.flush()

    for r in req.rules:
        rule = AvailabilityRule(
            schedule_id=schedule.id,
            day_of_week=r.day_of_week,
            start_time=r.start_time,
            end_time=r.end_time,
        )
        db.add(rule)

    await db.commit()
    await db.refresh(schedule)

    stmt = (
        select(AvailabilitySchedule)
        .where(AvailabilitySchedule.id == schedule.id)
        .options(
            selectinload(AvailabilitySchedule.rules),
            selectinload(AvailabilitySchedule.overrides),
        )
    )
    res = await db.execute(stmt)
    return res.scalar_one()


@router.patch("/schedules/{schedule_id}", response_model=AvailabilityScheduleResponse)
async def update_schedule(
    schedule_id: uuid.UUID,
    req: AvailabilityScheduleUpdate,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(AvailabilitySchedule)
        .where(
            AvailabilitySchedule.id == schedule_id,
            AvailabilitySchedule.user_id == current_user.id,
        )
        .options(
            selectinload(AvailabilitySchedule.rules),
            selectinload(AvailabilitySchedule.overrides),
        )
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
                end_time=r_in.end_time,
            )
            db.add(new_rule)

    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.post("/schedules/{schedule_id}/overrides", response_model=AvailabilityOverrideResponse)
async def add_date_override(
    schedule_id: uuid.UUID,
    req: AvailabilityOverrideCreate,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(AvailabilitySchedule).where(
        AvailabilitySchedule.id == schedule_id,
        AvailabilitySchedule.user_id == current_user.id,
    )
    res = await db.execute(stmt)
    schedule = res.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    # Check if override for this date exists; update or insert
    ov_stmt = select(AvailabilityOverride).where(
        AvailabilityOverride.schedule_id == schedule_id,
        AvailabilityOverride.override_date == req.override_date,
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
            end_time=req.end_time,
        )
        db.add(override)

    await db.commit()
    await db.refresh(override)
    return override


@router.delete("/schedules/{schedule_id}/overrides/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_date_override(
    schedule_id: uuid.UUID,
    override_id: uuid.UUID,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(AvailabilityOverride)
        .join(AvailabilitySchedule)
        .where(
            AvailabilityOverride.id == override_id,
            AvailabilitySchedule.id == schedule_id,
            AvailabilitySchedule.user_id == current_user.id,
        )
    )
    res = await db.execute(stmt)
    override = res.scalar_one_or_none()
    if not override:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Override not found")

    await db.delete(override)
    await db.commit()
    return None


# ---------------------------------------------------------------------------
# Out of Office / Leave Management (Auto-Cancel Meetings & Reschedule Links)
# ---------------------------------------------------------------------------

@router.get("/out-of-office/preview", response_model=OutOfOfficePreviewResponse)
async def preview_out_of_office(
    date: date = Query(..., description="The date to check for confirmed bookings in employee timezone"),
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Previews how many confirmed meetings will be affected/cancelled if the employee marks this date as out of office.
    Calculates boundaries using the employee's configured timezone.
    """
    try:
        emp_tz = ZoneInfo(current_user.timezone or "Asia/Kolkata")
    except Exception:
        emp_tz = ZoneInfo("Asia/Kolkata")

    day_start_local = datetime.combine(date, time.min, tzinfo=emp_tz)
    day_end_local = datetime.combine(date, time.max, tzinfo=emp_tz)
    day_start_utc = day_start_local.astimezone(timezone.utc)
    day_end_utc = day_end_local.astimezone(timezone.utc)

    stmt = (
        select(Booking)
        .where(
            Booking.employee_id == current_user.id,
            Booking.status == "confirmed",
            Booking.start_time < day_end_utc,
            Booking.end_time > day_start_utc,
        )
        .options(
            selectinload(Booking.invitees),
            selectinload(Booking.event_type),
        )
        .order_by(Booking.start_time.asc())
    )
    res = await db.execute(stmt)
    bookings = list(res.scalars().all())

    preview_items = []
    for b in bookings:
        title = b.title or (b.event_type.title if b.event_type else "Meeting")
        preview_items.append(
            OutOfOfficeBookingPreviewItem(
                id=b.id,
                title=title,
                start_time=b.start_time,
                end_time=b.end_time,
                meeting_provider=b.meeting_provider,
                invitee_names=[inv.name for inv in b.invitees],
                invitee_emails=[inv.email for inv in b.invitees],
            )
        )

    return OutOfOfficePreviewResponse(
        date=date,
        bookings_count=len(preview_items),
        bookings=preview_items,
    )


@router.post("/out-of-office", response_model=MarkOutOfOfficeResponse)
async def mark_out_of_office(
    req: MarkOutOfOfficeRequest,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Marks a full day as Out of Office:
    1. Creates/updates an AvailabilityOverride (is_unavailable=True) on employee schedule(s) to block all future bookings.
    2. Automatically cancels all confirmed bookings scheduled for that day in the employee's timezone.
    3. Deletes associated Zoho Calendar events and cancels Zoho Meeting sessions.
    4. Dispatches an out-of-office cancellation email to each invitee containing the host's optional custom message
       and a self-service reschedule link (with token) so they can choose a new slot without logging in.
    5. Writes an audit log entry for each cancelled booking.
    """
    try:
        emp_tz = ZoneInfo(current_user.timezone or "Asia/Kolkata")
    except Exception:
        emp_tz = ZoneInfo("Asia/Kolkata")

    day_start_local = datetime.combine(req.date, time.min, tzinfo=emp_tz)
    day_end_local = datetime.combine(req.date, time.max, tzinfo=emp_tz)
    day_start_utc = day_start_local.astimezone(timezone.utc)
    day_end_utc = day_end_local.astimezone(timezone.utc)

    # 1. Block date with an unavailable override
    sched_stmt = select(AvailabilitySchedule).where(AvailabilitySchedule.user_id == current_user.id)
    if req.schedule_id:
        sched_stmt = sched_stmt.where(AvailabilitySchedule.id == req.schedule_id)
    sched_res = await db.execute(sched_stmt)
    schedules = list(sched_res.scalars().all())

    if not schedules:
        sched = AvailabilitySchedule(
            user_id=current_user.id,
            name="Working Hours",
            is_default=True,
        )
        db.add(sched)
        await db.flush()
        schedules = [sched]

    override_ids = []
    for sched in schedules:
        ov_stmt = select(AvailabilityOverride).where(
            AvailabilityOverride.schedule_id == sched.id,
            AvailabilityOverride.override_date == req.date,
        )
        ov_res = await db.execute(ov_stmt)
        ov = ov_res.scalar_one_or_none()
        if ov:
            ov.is_unavailable = True
            ov.start_time = None
            ov.end_time = None
            override_ids.append(ov.id)
        else:
            ov = AvailabilityOverride(
                id=uuid.uuid4(),
                schedule_id=sched.id,
                override_date=req.date,
                is_unavailable=True,
                start_time=None,
                end_time=None,
            )
            db.add(ov)
            await db.flush()
            override_ids.append(ov.id)

    # 2. Query confirmed bookings for that day
    booking_stmt = (
        select(Booking)
        .where(
            Booking.employee_id == current_user.id,
            Booking.status == "confirmed",
            Booking.start_time < day_end_utc,
            Booking.end_time > day_start_utc,
        )
        .options(
            selectinload(Booking.invitees),
            selectinload(Booking.event_type),
            selectinload(Booking.employee),
        )
    )
    b_res = await db.execute(booking_stmt)
    bookings_to_cancel = list(b_res.scalars().all())

    cancelled_ids = []
    custom_msg = req.custom_message.strip() if req.custom_message and req.custom_message.strip() else None
    reason_str = f"Employee out of office: {custom_msg}" if custom_msg else "Employee out of office for the day"

    for b in bookings_to_cancel:
        b.status = "cancelled"
        b.cancellation_reason = reason_str
        b.cancelled_by = "employee"
        cancelled_ids.append(b.id)

        # Audit log
        db.add(
            AuditLog(
                actor_user_id=current_user.id,
                action="booking.cancelled_out_of_office",
                entity_type="booking",
                entity_id=b.id,
                metadata_={
                    "leave_date": req.date.isoformat(),
                    "custom_message": custom_msg,
                    "cancelled_by": "employee",
                    "actor_name": current_user.name,
                },
            )
        )

        # Sync deletion with Zoho Calendar
        if b.external_calendar_event_id:
            try:
                from app.services.zoho_calendar_service import zoho_calendar_service
                await zoho_calendar_service.delete_calendar_event(
                    user=current_user,
                    event_id=b.external_calendar_event_id,
                    db=db,
                )
            except Exception as ce:
                logger.warning(f"Error deleting Zoho calendar event for booking {b.id}: {ce}")

        # Sync cancellation with Zoho Meeting
        if b.meeting_provider == "zoho_meeting" and b.external_meeting_ref:
            try:
                await meeting_hub.providers["zoho_meeting"].cancel_meeting(
                    external_ref=b.external_meeting_ref,
                    host_user=current_user,
                    db=db,
                )
            except Exception as me:
                logger.warning(f"Error cancelling Zoho meeting for booking {b.id}: {me}")

        # Send personalized email to each invitee with reschedule link and custom message
        for inv in b.invitees:
            try:
                await email_service.send_out_of_office_cancellation(
                    booking=b,
                    invitee=inv,
                    event_type=b.event_type,
                    employee=current_user,
                    custom_message=custom_msg,
                    db=db,
                )
            except Exception as ee:
                logger.warning(f"Error sending out-of-office email to invitee {inv.email}: {ee}")

    await db.commit()

    return MarkOutOfOfficeResponse(
        date=req.date,
        cancelled_bookings_count=len(cancelled_ids),
        cancelled_booking_ids=cancelled_ids,
        message=f"Successfully marked {req.date} as Out of Office. {len(cancelled_ids)} booking(s) automatically cancelled and invitees notified with reschedule links.",
        override_ids=override_ids,
    )


@router.delete("/out-of-office", status_code=status.HTTP_200_OK)
async def remove_out_of_office(
    date: date = Query(..., description="The date to remove out-of-office unavailable overrides for"),
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """
    Removes out-of-office unavailable overrides for a date if the employee wants to restore normal availability.
    """
    stmt = (
        select(AvailabilityOverride)
        .join(AvailabilitySchedule)
        .where(
            AvailabilitySchedule.user_id == current_user.id,
            AvailabilityOverride.override_date == date,
            AvailabilityOverride.is_unavailable == True,
        )
    )
    res = await db.execute(stmt)
    overrides = list(res.scalars().all())
    for ov in overrides:
        await db.delete(ov)
    await db.commit()
    return {"message": f"Out of office status for {date} removed successfully."}
