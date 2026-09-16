import logging
from datetime import datetime, date, time, timedelta, timezone
from typing import List, Optional, Tuple, Dict, Any
from zoneinfo import ZoneInfo
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.models.event_type import EventType
from app.models.availability import AvailabilitySchedule, AvailabilityRule, AvailabilityOverride
from app.models.booking import Booking

logger = logging.getLogger(__name__)


def python_weekday_to_schedule_dow(weekday: int) -> int:
    """
    Python weekday: Monday=0 ... Sunday=6
    Schedule schema: Sunday=0 ... Saturday=6
    """
    return (weekday + 1) % 7


class AvailabilityEngine:

    @staticmethod
    async def get_available_slots_for_date(
        session: AsyncSession,
        event_type: EventType,
        employee: User,
        target_date: date,
        invitee_tz_str: str,
    ) -> List[Dict[str, Any]]:
        """
        Calculates all free, bookable time slots for a specific target date
        in the invitee's requested timezone.
        """
        try:
            invitee_tz = ZoneInfo(invitee_tz_str)
        except Exception:
            invitee_tz = ZoneInfo("UTC")

        try:
            emp_tz = ZoneInfo(employee.timezone)
        except Exception:
            emp_tz = ZoneInfo("Asia/Kolkata")

        now_utc = datetime.now(timezone.utc)

        # 1. Load active schedule with rules & overrides
        schedule = await AvailabilityEngine._get_schedule_for_event(session, event_type, employee.id)
        if not schedule:
            return []

        # 2. Compute the time window in UTC for the invitee's selected date
        day_start_local = datetime.combine(target_date, time.min).replace(tzinfo=invitee_tz)
        day_end_local = datetime.combine(target_date, time.max).replace(tzinfo=invitee_tz)
        window_start_utc = day_start_local.astimezone(timezone.utc)
        window_end_utc = day_end_local.astimezone(timezone.utc)

        # 3. Determine relevant dates in employee timezone
        emp_start_date = window_start_utc.astimezone(emp_tz).date()
        emp_end_date = window_end_utc.astimezone(emp_tz).date()

        # 4. Check max bookings per day in employee timezone
        if event_type.max_bookings_per_day:
            booking_count = await AvailabilityEngine._count_employee_bookings_on_date(
                session, employee.id, target_date, emp_tz
            )
            if booking_count >= event_type.max_bookings_per_day:
                return []

        # 5. Fetch existing confirmed bookings for the employee in an expanded window
        expanded_start_utc = window_start_utc - timedelta(minutes=event_type.buffer_after_minutes + 120)
        expanded_end_utc = window_end_utc + timedelta(minutes=event_type.buffer_before_minutes + 120)

        existing_bookings = await AvailabilityEngine._get_confirmed_bookings(
            session, employee.id, expanded_start_utc, expanded_end_utc
        )

        # 6. Generate candidate slots across the employee's relevant days
        candidate_slots: List[Tuple[datetime, datetime]] = []
        current_emp_date = emp_start_date
        while current_emp_date <= emp_end_date:
            working_ranges = AvailabilityEngine._get_working_ranges_for_date(schedule, current_emp_date, emp_tz)
            for range_start_utc, range_end_utc in working_ranges:
                slot_duration = timedelta(minutes=event_type.duration_minutes)
                cur_slot_start = range_start_utc
                while cur_slot_start + slot_duration <= range_end_utc:
                    cur_slot_end = cur_slot_start + slot_duration
                    candidate_slots.append((cur_slot_start, cur_slot_end))
                    cur_slot_start += slot_duration
            current_emp_date += timedelta(days=1)

        # 7. Filter slots
        valid_slots: List[Dict[str, Any]] = []
        min_notice_threshold = now_utc + timedelta(minutes=event_type.min_notice_minutes)
        max_advance_threshold = now_utc + timedelta(days=event_type.max_days_in_advance)

        for slot_start_utc, slot_end_utc in candidate_slots:
            # Check minimum notice
            if slot_start_utc < min_notice_threshold:
                continue

            # Check max days in advance
            if slot_start_utc > max_advance_threshold:
                continue

            # Check if this slot belongs to target_date in invitee timezone
            slot_start_invitee = slot_start_utc.astimezone(invitee_tz)
            if slot_start_invitee.date() != target_date:
                continue

            # Check overlap with existing bookings (including buffers)
            is_blocked = False
            for booking in existing_bookings:
                # Normalize timezone if driver returns naive UTC
                b_raw_start = booking.start_time if booking.start_time.tzinfo else booking.start_time.replace(tzinfo=timezone.utc)
                b_raw_end = booking.end_time if booking.end_time.tzinfo else booking.end_time.replace(tzinfo=timezone.utc)
                b_start = b_raw_start - timedelta(minutes=event_type.buffer_after_minutes)
                b_end = b_raw_end + timedelta(minutes=event_type.buffer_before_minutes)
                if slot_start_utc < b_end and slot_end_utc > b_start:
                    is_blocked = True
                    break

            if is_blocked:
                continue

            slot_end_invitee = slot_end_utc.astimezone(invitee_tz)
            valid_slots.append({
                "start_time": slot_start_invitee.isoformat(),
                "end_time": slot_end_invitee.isoformat(),
                "formatted_time": slot_start_invitee.strftime("%I:%M %p"),
            })

        return valid_slots

    @staticmethod
    def _get_working_ranges_for_date(
        schedule: AvailabilitySchedule,
        calc_date: date,
        emp_tz: ZoneInfo
    ) -> List[Tuple[datetime, datetime]]:
        """
        Returns UTC time intervals for employee working hours on a given date.
        Date-specific overrides completely replace weekly recurring rules.
        """
        # Check override
        for override in schedule.overrides:
            if override.override_date == calc_date:
                if override.is_unavailable:
                    return []
                if override.start_time and override.end_time:
                    s_dt = datetime.combine(calc_date, override.start_time, tzinfo=emp_tz).astimezone(timezone.utc)
                    e_dt = datetime.combine(calc_date, override.end_time, tzinfo=emp_tz).astimezone(timezone.utc)
                    return [(s_dt, e_dt)] if s_dt < e_dt else []

        # Weekly rule
        dow = python_weekday_to_schedule_dow(calc_date.weekday())
        ranges = []
        for rule in schedule.rules:
            if rule.day_of_week == dow:
                s_dt = datetime.combine(calc_date, rule.start_time, tzinfo=emp_tz).astimezone(timezone.utc)
                e_dt = datetime.combine(calc_date, rule.end_time, tzinfo=emp_tz).astimezone(timezone.utc)
                if s_dt < e_dt:
                    ranges.append((s_dt, e_dt))
        return ranges

    @staticmethod
    async def _get_schedule_for_event(
        session: AsyncSession,
        event_type: EventType,
        employee_id: Any
    ) -> Optional[AvailabilitySchedule]:
        if event_type.schedule_id:
            stmt = select(AvailabilitySchedule).where(
                AvailabilitySchedule.id == event_type.schedule_id
            ).options(
                selectinload(AvailabilitySchedule.rules),
                selectinload(AvailabilitySchedule.overrides)
            )
            res = await session.execute(stmt)
            schedule = res.scalar_one_or_none()
            if schedule:
                return schedule

        # Default schedule for employee
        stmt = select(AvailabilitySchedule).where(
            AvailabilitySchedule.user_id == employee_id,
            AvailabilitySchedule.is_default == True
        ).options(
            selectinload(AvailabilitySchedule.rules),
            selectinload(AvailabilitySchedule.overrides)
        )
        res = await session.execute(stmt)
        return res.scalar_one_or_none()

    @staticmethod
    async def _get_confirmed_bookings(
        session: AsyncSession,
        employee_id: Any,
        start_utc: datetime,
        end_utc: datetime
    ) -> List[Booking]:
        stmt = select(Booking).where(
            Booking.employee_id == employee_id,
            Booking.status == "confirmed",
            Booking.start_time < end_utc,
            Booking.end_time > start_utc
        )
        res = await session.execute(stmt)
        return list(res.scalars().all())

    @staticmethod
    async def _count_employee_bookings_on_date(
        session: AsyncSession,
        employee_id: Any,
        target_date: date,
        emp_tz: ZoneInfo
    ) -> int:
        day_start = datetime.combine(target_date, time.min, tzinfo=emp_tz).astimezone(timezone.utc)
        day_end = datetime.combine(target_date, time.max, tzinfo=emp_tz).astimezone(timezone.utc)
        stmt = select(func.count(Booking.id)).where(
            Booking.employee_id == employee_id,
            Booking.status == "confirmed",
            Booking.start_time >= day_start,
            Booking.start_time <= day_end
        )
        res = await session.execute(stmt)
        return res.scalar() or 0
