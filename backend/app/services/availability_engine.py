import logging
import uuid
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
from app.services.google_calendar_service import google_calendar_service

logger = logging.getLogger(__name__)


def python_weekday_to_schedule_dow(weekday: int) -> int:
    """
    Python weekday: Monday=0 ... Sunday=6
    Schedule schema: Sunday=0 ... Saturday=6
    """
    return (weekday + 1) % 7


class AvailabilityEngine:

    @staticmethod
    async def _resolve_host_pool(
        session: AsyncSession,
        event_type: EventType,
        primary_host: User,
    ) -> List[User]:
        """
        Resolves all participating hosts for this event type.
        Includes primary host + any assigned colleagues.
        """
        hosts = [primary_host]
        assigned_ids = event_type.assigned_user_ids or []
        valid_uuids = []
        for aid in assigned_ids:
            try:
                valid_uuids.append(uuid.UUID(str(aid)))
            except (ValueError, TypeError):
                continue

        if valid_uuids:
            stmt = select(User).where(
                User.id.in_(valid_uuids),
                User.status == "active",
            )
            res = await session.execute(stmt)
            other_hosts = list(res.scalars().all())
            existing_ids = {h.id for h in hosts}
            for oh in other_hosts:
                if oh.id not in existing_ids:
                    hosts.append(oh)
                    existing_ids.add(oh.id)

        return hosts

    @staticmethod
    async def _get_single_host_available_slots(
        session: AsyncSession,
        event_type: EventType,
        employee: User,
        target_date: date,
        invitee_tz_str: str,
    ) -> List[Dict[str, Any]]:
        """
        Calculates available slots for an individual host, accounting for:
        - Host schedule & date overrides
        - Max bookings per day
        - Symmetric buffer times
        - Existing Kavach bookings (with Group capacity logic)
        - Connected Google Calendar FreeBusy busy blocks
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
                session, employee.id, target_date, emp_tz, event_type_id=event_type.id
            )
            if booking_count >= event_type.max_bookings_per_day:
                return []

        # 5. Fetch existing confirmed bookings and Google Calendar FreeBusy intervals
        buf_before = event_type.buffer_before_minutes or 0
        buf_after = event_type.buffer_after_minutes or 0
        total_buffer = buf_before + buf_after
        expanded_start_utc = window_start_utc - timedelta(minutes=total_buffer + 120)
        expanded_end_utc = window_end_utc + timedelta(minutes=total_buffer + 120)

        existing_bookings = await AvailabilityEngine._get_confirmed_bookings(
            session, employee.id, expanded_start_utc, expanded_end_utc
        )

        google_busy_intervals: List[Tuple[datetime, datetime]] = []
        if employee.google_access_token_encrypted or employee.google_refresh_token_encrypted:
            try:
                google_busy_intervals = await google_calendar_service.get_freebusy_intervals(
                    user=employee,
                    time_min_utc=expanded_start_utc,
                    time_max_utc=expanded_end_utc,
                    db=session,
                )
            except Exception as g_err:
                logger.warning(f"Failed to fetch Google Calendar FreeBusy for host {employee.id}: {g_err}")

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
        is_group_event = (event_type.booking_type == "group")
        group_cap = event_type.group_capacity or 10

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

            is_blocked = False

            # Check Google Calendar FreeBusy conflicts
            for busy_start, busy_end in google_busy_intervals:
                b_blocked_start = busy_start - timedelta(minutes=buf_before + buf_after)
                b_blocked_end = busy_end + timedelta(minutes=buf_after + buf_before)
                if slot_start_utc < b_blocked_end and slot_end_utc > b_blocked_start:
                    is_blocked = True
                    break

            if is_blocked:
                continue

            # Check Kavach confirmed bookings
            same_event_count = 0
            for booking in existing_bookings:
                b_raw_start = booking.start_time if booking.start_time.tzinfo else booking.start_time.replace(tzinfo=timezone.utc)
                b_raw_end = booking.end_time if booking.end_time.tzinfo else booking.end_time.replace(tzinfo=timezone.utc)

                if is_group_event and booking.event_type_id == event_type.id:
                    # Overlap with same group event type: count registrations
                    if slot_start_utc < b_raw_end and slot_end_utc > b_raw_start:
                        same_event_count += 1
                else:
                    # Non-group booking or booking from other event: check strict overlap with symmetric buffers
                    b_blocked_start = b_raw_start - timedelta(minutes=buf_before + buf_after)
                    b_blocked_end = b_raw_end + timedelta(minutes=buf_after + buf_before)
                    if slot_start_utc < b_blocked_end and slot_end_utc > b_blocked_start:
                        is_blocked = True
                        break

            if is_blocked:
                continue

            if is_group_event and same_event_count >= group_cap:
                continue

            slot_end_invitee = slot_end_utc.astimezone(invitee_tz)
            slot_data: Dict[str, Any] = {
                "start_time": slot_start_invitee.isoformat(),
                "end_time": slot_end_invitee.isoformat(),
                "formatted_time": slot_start_invitee.strftime("%I:%M %p"),
                "host_id": str(employee.id),
                "host_name": employee.name,
            }
            if is_group_event:
                slot_data["remaining_capacity"] = max(0, group_cap - same_event_count)
                slot_data["total_capacity"] = group_cap

            valid_slots.append(slot_data)

        return valid_slots

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
        in the invitee's requested timezone. Supports:
        - 1-on-1 meetings
        - Group sessions with remaining capacity tracking
        - Round-Robin distribution (union of available team member slots)
        - Collective panel meetings (intersection where all team members are free)
        """
        b_type = event_type.booking_type or "one_on_one"

        if b_type == "round_robin":
            host_pool = await AvailabilityEngine._resolve_host_pool(session, event_type, employee)
            slots_by_time: Dict[str, Dict[str, Any]] = {}

            for host in host_pool:
                h_slots = await AvailabilityEngine._get_single_host_available_slots(
                    session, event_type, host, target_date, invitee_tz_str
                )
                for s in h_slots:
                    t_key = s["start_time"]
                    if t_key not in slots_by_time:
                        slots_by_time[t_key] = {
                            "start_time": s["start_time"],
                            "end_time": s["end_time"],
                            "formatted_time": s["formatted_time"],
                            "available_host_ids": [str(host.id)],
                            "available_hosts_count": 1,
                        }
                    else:
                        slots_by_time[t_key]["available_host_ids"].append(str(host.id))
                        slots_by_time[t_key]["available_hosts_count"] += 1

            return sorted(list(slots_by_time.values()), key=lambda x: x["start_time"])

        elif b_type == "collective":
            host_pool = await AvailabilityEngine._resolve_host_pool(session, event_type, employee)
            slots_by_time: Dict[str, Dict[str, Any]] = {}

            for host in host_pool:
                h_slots = await AvailabilityEngine._get_single_host_available_slots(
                    session, event_type, host, target_date, invitee_tz_str
                )
                for s in h_slots:
                    t_key = s["start_time"]
                    if t_key not in slots_by_time:
                        slots_by_time[t_key] = {
                            "start_time": s["start_time"],
                            "end_time": s["end_time"],
                            "formatted_time": s["formatted_time"],
                            "count": 1,
                        }
                    else:
                        slots_by_time[t_key]["count"] += 1

            # Only return slots where EVERY host in the collective pool is free
            required_count = len(host_pool)
            collective_slots = [s for s in slots_by_time.values() if s["count"] == required_count]
            for s in collective_slots:
                s.pop("count", None)

            return sorted(collective_slots, key=lambda x: x["start_time"])

        else:
            # 1-on-1 or Group Session
            return await AvailabilityEngine._get_single_host_available_slots(
                session, event_type, employee, target_date, invitee_tz_str
            )

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
        emp_tz: ZoneInfo,
        event_type_id: Optional[Any] = None,
    ) -> int:
        day_start = datetime.combine(target_date, time.min, tzinfo=emp_tz).astimezone(timezone.utc)
        day_end = datetime.combine(target_date, time.max, tzinfo=emp_tz).astimezone(timezone.utc)
        conditions = [
            Booking.employee_id == employee_id,
            Booking.status == "confirmed",
            Booking.start_time >= day_start,
            Booking.start_time <= day_end,
        ]
        if event_type_id is not None:
            conditions.append(Booking.event_type_id == event_type_id)
        stmt = select(func.count(Booking.id)).where(*conditions)
        res = await session.execute(stmt)
        return res.scalar() or 0
