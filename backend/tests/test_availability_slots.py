import uuid
from datetime import date, time, datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.models.user import User
from app.models.event_type import EventType
from app.models.availability import AvailabilitySchedule, AvailabilityRule, AvailabilityOverride
from app.models.booking import Booking
from app.services.availability_engine import AvailabilityEngine


@pytest.mark.asyncio
async def test_slot_generation_with_buffer_and_notice():
    emp_id = uuid.uuid4()
    employee = User(
        id=emp_id,
        name="Prachi Goenka",
        email="prachi@kavach.infra",
        username="prachi",
        timezone="Asia/Kolkata",
        status="active"
    )

    schedule = AvailabilitySchedule(
        id=uuid.uuid4(),
        user_id=emp_id,
        name="Working Hours",
        is_default=True
    )
    # Mon (1) 09:00 to 12:00 IST
    schedule.rules = [
        AvailabilityRule(
            id=uuid.uuid4(),
            schedule_id=schedule.id,
            day_of_week=1,
            start_time=time(9, 0),
            end_time=time(12, 0)
        )
    ]
    schedule.overrides = []

    # 30-minute event type, 15m buffer before, 15m buffer after, min notice 0m
    event_type = EventType(
        id=uuid.uuid4(),
        owner_user_id=emp_id,
        title="Quick Connect",
        slug="quick-connect",
        duration_minutes=30,
        buffer_before_minutes=15,
        buffer_after_minutes=15,
        min_notice_minutes=0,
        max_days_in_advance=365,
        is_active=True
    )

    # Mock an existing confirmed booking at 10:00 - 10:30 IST (04:30 - 05:00 UTC) on a future Monday
    # Find next Monday far in future to avoid min_notice window
    future_monday = date(2027, 5, 3) # A known Monday
    b_start_utc = datetime(2027, 5, 3, 4, 30, tzinfo=timezone.utc)
    b_end_utc = datetime(2027, 5, 3, 5, 0, tzinfo=timezone.utc)
    
    mock_booking = Booking(
        id=uuid.uuid4(),
        event_type_id=event_type.id,
        employee_id=emp_id,
        start_time=b_start_utc,
        end_time=b_end_utc,
        status="confirmed",
        meeting_provider="jitsi"
    )

    # Mock session
    mock_session = AsyncMock()
    # Mock _get_schedule_for_event
    AvailabilityEngine._get_schedule_for_event = AsyncMock(return_value=schedule)
    AvailabilityEngine._get_confirmed_bookings = AsyncMock(return_value=[mock_booking])

    slots = await AvailabilityEngine.get_available_slots_for_date(
        session=mock_session,
        event_type=event_type,
        employee=employee,
        target_date=future_monday,
        invitee_tz_str="Asia/Kolkata"
    )

    # In 09:00 - 12:00 IST (6 slots of 30m: 09:00, 09:30, 10:00, 10:30, 11:00, 11:30)
    # The booking is 10:00-10:30.
    # With 15m buffer before (starts at 09:45) and 15m buffer after (ends at 10:45):
    # - 09:00 - 09:30: free (ends 09:30 <= 09:45)
    # - 09:30 - 10:00: blocked (ends at 10:00 > 09:45)
    # - 10:00 - 10:30: blocked (during booking)
    # - 10:30 - 11:00: blocked (starts at 10:30 < 10:45)
    # - 11:00 - 11:30: free (starts at 11:00 >= 10:45)
    # - 11:30 - 12:00: free
    slot_times = [s["formatted_time"] for s in slots]
    assert "09:00 AM" in slot_times
    assert "09:30 AM" not in slot_times
    assert "10:00 AM" not in slot_times
    assert "10:30 AM" not in slot_times
    assert "11:00 AM" in slot_times
    assert "11:30 AM" in slot_times
