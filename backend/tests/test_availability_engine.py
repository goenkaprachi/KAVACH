import uuid
from datetime import date, time, datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import pytest

from app.models.availability import AvailabilitySchedule, AvailabilityRule, AvailabilityOverride
from app.services.availability_engine import AvailabilityEngine, python_weekday_to_schedule_dow


def test_weekday_mapping():
    # Monday: Python=0 -> Schedule schema=1
    assert python_weekday_to_schedule_dow(0) == 1
    # Friday: Python=4 -> Schedule schema=5
    assert python_weekday_to_schedule_dow(4) == 5
    # Sunday: Python=6 -> Schedule schema=0
    assert python_weekday_to_schedule_dow(6) == 0


def test_working_ranges_weekly_rules():
    schedule = AvailabilitySchedule(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        name="Standard Hours"
    )
    # Mon-Fri 09:00 - 17:00
    schedule.rules = [
        AvailabilityRule(
            id=uuid.uuid4(),
            schedule_id=schedule.id,
            day_of_week=dow,
            start_time=time(9, 0),
            end_time=time(17, 0)
        )
        for dow in range(1, 6)
    ]
    schedule.overrides = []

    tz = ZoneInfo("Asia/Kolkata")
    # A known Monday: 2026-09-14
    monday = date(2026, 9, 14)
    ranges = AvailabilityEngine._get_working_ranges_for_date(schedule, monday, tz)
    
    assert len(ranges) == 1
    start_utc, end_utc = ranges[0]
    
    # 09:00 IST is 03:30 UTC
    assert start_utc.hour == 3 and start_utc.minute == 30
    # 17:00 IST is 11:30 UTC
    assert end_utc.hour == 11 and end_utc.minute == 30

    # A Sunday: 2026-09-20 -> should have no working ranges
    sunday = date(2026, 9, 20)
    sun_ranges = AvailabilityEngine._get_working_ranges_for_date(schedule, sunday, tz)
    assert len(sun_ranges) == 0


def test_date_override_replaces_weekly_rule():
    schedule = AvailabilitySchedule(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        name="Standard Hours"
    )
    # Monday 09:00 - 17:00
    schedule.rules = [
        AvailabilityRule(
            id=uuid.uuid4(),
            schedule_id=schedule.id,
            day_of_week=1,
            start_time=time(9, 0),
            end_time=time(17, 0)
        )
    ]
    # Mark specific Monday as unavailable (holiday)
    test_monday = date(2026, 9, 14)
    schedule.overrides = [
        AvailabilityOverride(
            id=uuid.uuid4(),
            schedule_id=schedule.id,
            override_date=test_monday,
            is_unavailable=True
        )
    ]

    tz = ZoneInfo("Asia/Kolkata")
    ranges = AvailabilityEngine._get_working_ranges_for_date(schedule, test_monday, tz)
    # Override takes precedence -> 0 ranges
    assert len(ranges) == 0


def test_date_override_with_custom_hours():
    schedule = AvailabilitySchedule(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        name="Standard Hours"
    )
    schedule.rules = []
    # Sunday special working hours 10:00 - 14:00
    special_sunday = date(2026, 9, 20)
    schedule.overrides = [
        AvailabilityOverride(
            id=uuid.uuid4(),
            schedule_id=schedule.id,
            override_date=special_sunday,
            is_unavailable=False,
            start_time=time(10, 0),
            end_time=time(14, 0)
        )
    ]

    tz = ZoneInfo("UTC")
    ranges = AvailabilityEngine._get_working_ranges_for_date(schedule, special_sunday, tz)
    assert len(ranges) == 1
    start_utc, end_utc = ranges[0]
    assert start_utc.hour == 10 and end_utc.hour == 14
