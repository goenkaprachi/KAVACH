import pytest
import uuid
from datetime import datetime, date, time, timedelta, timezone
from zoneinfo import ZoneInfo
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import HTTPException

from app.models.booking import Booking, Invitee
from app.models.availability import AvailabilitySchedule, AvailabilityOverride
from app.models.event_type import EventType
from app.models.user import User
from app.schemas.availability import MarkOutOfOfficeRequest
from app.schemas.booking import RescheduleBookingRequest
from app.api.v1.availability import (
    preview_out_of_office,
    mark_out_of_office,
    remove_out_of_office,
)
from app.api.v1.bookings import reschedule_booking


def create_test_employee(user_id=None, tz="Asia/Kolkata"):
    emp = MagicMock(spec=User)
    emp.id = user_id or uuid.uuid4()
    emp.name = "Priya Sharma"
    emp.email = "priya@kavach.org"
    emp.username = "priya"
    emp.role = "employee"
    emp.timezone = tz
    emp.zoho_access_token_encrypted = None
    emp.zoho_refresh_token_encrypted = None
    return emp


def create_test_booking(
    employee,
    start_time_utc: datetime,
    status="confirmed",
    attendee_name="Vikram Singh",
    attendee_email="vikram@example.com",
    external_cal_id=None,
    meeting_provider="zoho_meeting",
    external_meeting_ref="zm_session_123",
):
    b = MagicMock(spec=Booking)
    b.id = uuid.uuid4()
    b.booking_reference = "KC-123456"
    b.employee_id = employee.id
    b.employee = employee
    b.title = "Cyber Risk Advisory"
    b.status = status
    b.is_rescheduled = False
    b.rescheduled_from_id = None
    b.start_time = start_time_utc
    b.end_time = start_time_utc + timedelta(minutes=45)
    b.meeting_provider = meeting_provider
    b.meeting_join_url = f"https://meet.zoho.in/{external_meeting_ref}"
    b.meeting_host_url = f"https://meet.zoho.in/host/{external_meeting_ref}"
    b.external_meeting_ref = external_meeting_ref
    b.external_calendar_event_id = external_cal_id
    b.cancellation_reason = None
    b.cancelled_by = None
    b.event_type = None
    b.event_type_id = None
    b.meeting_outcome = None
    b.meeting_notes = None
    b.followup_required = False
    b.followup_date = None
    b.followup_notes = None
    b.followup_status = "pending"
    b.followup_priority = "medium"
    b.outcome_updated_at = None
    b.notes = None
    b.created_at = datetime.now(timezone.utc)
    b.updated_at = datetime.now(timezone.utc)

    inv = MagicMock(spec=Invitee)
    inv.id = uuid.uuid4()
    inv.name = attendee_name
    inv.email = attendee_email
    inv.cancellation_token = uuid.uuid4()
    inv.timezone = "Asia/Kolkata"
    inv.custom_answers = {}
    inv.booking = b

    b.invitees = [inv]
    return b


@pytest.mark.asyncio
async def test_preview_out_of_office_counts_bookings_in_timezone():
    """Verifies preview returns exact bookings scheduled on target date in employee timezone."""
    emp = create_test_employee(tz="Asia/Kolkata")
    leave_date = date(2026, 11, 10)

    # In Asia/Kolkata (+05:30), 2026-11-10 10:00 AM local = 2026-11-10 04:30 AM UTC
    b_on_day = create_test_booking(
        emp,
        datetime(2026, 11, 10, 4, 30, tzinfo=timezone.utc),
        status="confirmed",
    )

    mock_res = MagicMock()
    mock_res.scalars.return_value.all.return_value = [b_on_day]
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=mock_res)

    preview = await preview_out_of_office(
        date=leave_date,
        current_user=emp,
        db=mock_db,
    )

    assert preview.date == leave_date
    assert preview.bookings_count == 1
    assert len(preview.bookings) == 1
    assert preview.bookings[0].title == "Cyber Risk Advisory"
    assert preview.bookings[0].invitee_names == ["Vikram Singh"]
    assert preview.bookings[0].invitee_emails == ["vikram@example.com"]


@pytest.mark.asyncio
async def test_mark_out_of_office_cancels_bookings_and_notifies_invitees():
    """
    Verifies that marking out of office:
    1. Creates/updates unavailable AvailabilityOverride.
    2. Sets booking status to cancelled with custom message.
    3. Calls email_service.send_out_of_office_cancellation.
    4. Cleans up Zoho calendar and meeting refs.
    """
    emp = create_test_employee(tz="Asia/Kolkata")
    leave_date = date(2026, 11, 15)

    sched = MagicMock(spec=AvailabilitySchedule)
    sched.id = uuid.uuid4()
    sched.user_id = emp.id

    b1 = create_test_booking(
        emp,
        datetime(2026, 11, 15, 5, 0, tzinfo=timezone.utc),
        status="confirmed",
        external_cal_id="zoho_evt_999",
        meeting_provider="zoho_meeting",
        external_meeting_ref="zm_meet_888",
    )

    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    mock_db.flush = AsyncMock()
    mock_db.commit = AsyncMock()

    res_sched = MagicMock()
    res_sched.scalars.return_value.all.return_value = [sched]

    res_override = MagicMock()
    res_override.scalar_one_or_none.return_value = None  # No existing override

    res_bookings = MagicMock()
    res_bookings.scalars.return_value.all.return_value = [b1]

    mock_db.execute.side_effect = [res_sched, res_override, res_bookings]

    req = MarkOutOfOfficeRequest(
        date=leave_date,
        custom_message="Attending National Cyber Defense Summit in New Delhi.",
    )

    with patch("app.api.v1.availability.email_service.send_out_of_office_cancellation", new_callable=AsyncMock) as mock_send_email, \
         patch("app.api.v1.availability.meeting_hub.providers") as mock_providers, \
         patch("app.services.zoho_calendar_service.zoho_calendar_service.delete_calendar_event", new_callable=AsyncMock) as mock_del_cal:

        mock_meeting_prov = MagicMock()
        mock_meeting_prov.cancel_meeting = AsyncMock(return_value=True)
        mock_providers.__getitem__.return_value = mock_meeting_prov

        result = await mark_out_of_office(
            req=req,
            current_user=emp,
            db=mock_db,
        )

        assert result.date == leave_date
        assert result.cancelled_bookings_count == 1
        assert b1.id in result.cancelled_booking_ids

        # Assert booking was cancelled with reason & employee actor
        assert b1.status == "cancelled"
        assert "Attending National Cyber Defense Summit" in b1.cancellation_reason
        assert b1.cancelled_by == "employee"

        # Assert email was sent to invitee with custom message
        mock_send_email.assert_awaited_once()
        call_kwargs = mock_send_email.call_args.kwargs
        assert call_kwargs["booking"] == b1
        assert call_kwargs["invitee"] == b1.invitees[0]
        assert call_kwargs["custom_message"] == "Attending National Cyber Defense Summit in New Delhi."

        # Assert Zoho Calendar event deletion was called
        mock_del_cal.assert_awaited_once_with(user=emp, event_id="zoho_evt_999", db=mock_db)

        # Assert Zoho Meeting cancellation was called
        mock_meeting_prov.cancel_meeting.assert_awaited_once_with(
            external_ref="zm_meet_888", host_user=emp, db=mock_db
        )

        # Assert DB commit was called
        mock_db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_reschedule_out_of_office_cancelled_booking_via_token():
    """
    Verifies that an invitee can use their self-service reschedule link to pick a new slot
    even after their booking was cancelled due to host out of office.
    """
    emp = create_test_employee()
    cancelled_booking = create_test_booking(
        emp,
        datetime(2026, 11, 15, 6, 0, tzinfo=timezone.utc),
        status="cancelled",
    )
    cancelled_booking.cancellation_reason = "Employee out of office: Annual leave"
    cancelled_booking.cancelled_by = "employee"
    token = cancelled_booking.invitees[0].cancellation_token

    new_time_utc = datetime.now(timezone.utc) + timedelta(days=5, hours=3)

    mock_db = AsyncMock()
    mock_db.add = MagicMock()
    mock_db.commit = AsyncMock()

    # Mock query returning cancelled_booking
    mock_res_booking = MagicMock()
    mock_res_booking.scalar_one_or_none.return_value = cancelled_booking

    # Mock overlap query returning None
    mock_res_overlap = MagicMock()
    mock_res_overlap.scalar_one_or_none.return_value = None

    mock_db.execute.side_effect = [mock_res_booking, mock_res_overlap]

    req = RescheduleBookingRequest(
        new_start_time=new_time_utc,
        cancellation_token=token,
        reason="Picking a new time next week",
    )

    with patch("app.api.v1.bookings.meeting_hub.create_for_booking", new_callable=AsyncMock) as mock_create_meeting, \
         patch("app.api.v1.bookings.email_service.send_reschedule_notification", new_callable=AsyncMock) as mock_notify:

        mock_meeting_details = MagicMock()
        mock_meeting_details.provider = "zoho_meeting"
        mock_meeting_details.join_url = "https://meet.zoho.in/new-session-777"
        mock_meeting_details.host_url = "https://meet.zoho.in/host-session-777"
        mock_meeting_details.external_ref = "new-session-777"
        mock_create_meeting.return_value = mock_meeting_details

        updated_resp = await reschedule_booking(
            booking_id=cancelled_booking.id,
            req=req,
            current_user=None,
            db=mock_db,
        )

        # Booking should now be active again!
        assert cancelled_booking.status == "confirmed"
        assert cancelled_booking.is_rescheduled is True
        assert cancelled_booking.cancellation_reason is None
        assert cancelled_booking.cancelled_by is None
        assert cancelled_booking.start_time == new_time_utc


@pytest.mark.asyncio
async def test_remove_out_of_office_deletes_overrides():
    """Verifies that remove_out_of_office deletes the unavailable override records."""
    emp = create_test_employee()
    leave_date = date(2026, 11, 15)

    ov = MagicMock(spec=AvailabilityOverride)
    ov.override_date = leave_date
    ov.is_unavailable = True

    mock_db = AsyncMock()
    mock_db.delete = AsyncMock()
    mock_db.commit = AsyncMock()

    mock_res = MagicMock()
    mock_res.scalars.return_value.all.return_value = [ov]
    mock_db.execute.return_value = mock_res

    res = await remove_out_of_office(
        date=leave_date,
        current_user=emp,
        db=mock_db,
    )

    assert "removed successfully" in res["message"]
    mock_db.delete.assert_awaited_once_with(ov)
    mock_db.commit.assert_awaited_once()
