import pytest
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import HTTPException
from app.models.booking import Booking, Invitee
from app.models.event_type import EventType
from app.models.user import User
from app.models.verification import BookingEmailVerification
from app.schemas.booking import (
    CancelBookingRequest,
    RescheduleBookingRequest,
    SendVerificationCodeRequest,
    VerifyCodeRequest,
)
from app.api.v1.bookings import (
    cancel_booking,
    reschedule_booking,
    send_booking_verification_code,
    verify_booking_code,
    get_booking_by_manage_token,
    cancel_booking_via_token,
    reschedule_booking_via_token,
)


def create_mock_booking(booking_id=None, cancellation_token=None, status="confirmed"):
    b_id = booking_id or uuid.uuid4()
    c_token = cancellation_token or uuid.uuid4()

    mock_invitee = MagicMock(spec=Invitee)
    mock_invitee.id = uuid.uuid4()
    mock_invitee.name = "John Doe"
    mock_invitee.email = "john@example.com"
    mock_invitee.cancellation_token = c_token
    mock_invitee.timezone = "UTC"
    mock_invitee.custom_answers = {}

    mock_employee = MagicMock(spec=User)
    mock_employee.id = uuid.uuid4()
    mock_employee.name = "Host Jane"
    mock_employee.email = "jane@kavach.com"
    mock_employee.username = "jane"

    mock_booking = MagicMock(spec=Booking)
    mock_booking.id = b_id
    mock_booking.booking_reference = "KC-123456"
    mock_booking.title = "Consultation"
    mock_booking.status = status
    mock_booking.employee_id = mock_employee.id
    mock_booking.employee = mock_employee
    mock_booking.invitees = [mock_invitee]
    mock_booking.event_type = None
    mock_booking.event_type_id = None
    mock_booking.external_meeting_ref = None
    mock_booking.meeting_provider = "jitsi"
    mock_booking.meeting_join_url = "https://meet.jit.si/test"
    mock_booking.meeting_host_url = None
    mock_booking.cancellation_reason = None
    mock_booking.cancelled_by = None
    mock_booking.rescheduled_from_id = None
    mock_booking.is_rescheduled = False
    mock_booking.meeting_outcome = None
    mock_booking.meeting_notes = None
    mock_booking.followup_required = False
    mock_booking.followup_date = None
    mock_booking.followup_notes = None
    mock_booking.followup_status = "pending"
    mock_booking.followup_priority = "medium"
    mock_booking.outcome_updated_at = None
    mock_booking.start_time = datetime.now(timezone.utc) + timedelta(days=2)
    mock_booking.end_time = datetime.now(timezone.utc) + timedelta(days=2, minutes=30)
    mock_booking.created_at = datetime.now(timezone.utc)
    mock_booking.updated_at = datetime.now(timezone.utc)

    mock_invitee.booking = mock_booking
    return mock_booking, mock_invitee, mock_employee


@pytest.mark.asyncio
async def test_double_cancellation_rejected():
    """Verify that cancelling an already-cancelled booking returns HTTP 400."""
    mock_booking, mock_invitee, _ = create_mock_booking(status="cancelled")

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_booking
    mock_db.execute.return_value = mock_result

    req = CancelBookingRequest(reason="Changed mind", cancellation_token=mock_invitee.cancellation_token)

    with pytest.raises(HTTPException) as exc_info:
        await cancel_booking(
            booking_id=mock_booking.id,
            req=req,
            current_user=None,
            db=mock_db,
        )

    assert exc_info.value.status_code == 400
    assert "already been cancelled" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_cancel_via_token_no_login_success():
    """Verify that an invitee can cancel a confirmed booking using their cancellation token without login."""
    mock_booking, mock_invitee, _ = create_mock_booking(status="confirmed")

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_booking
    mock_db.execute.return_value = mock_result

    req = CancelBookingRequest(reason="Schedule conflict", cancellation_token=mock_invitee.cancellation_token)

    with patch("app.api.v1.bookings.email_service.send_cancellation_notification", new_callable=AsyncMock):
        res = await cancel_booking(
            booking_id=mock_booking.id,
            req=req,
            current_user=None,
            db=mock_db,
        )

    assert mock_booking.status == "cancelled"
    assert mock_booking.cancelled_by == "invitee"
    assert mock_booking.cancellation_reason == "Schedule conflict"


@pytest.mark.asyncio
async def test_reschedule_cancelled_booking_rejected():
    """Verify that attempting to reschedule an already-cancelled booking returns HTTP 400."""
    mock_booking, mock_invitee, _ = create_mock_booking(status="cancelled")

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_booking
    mock_db.execute.return_value = mock_result

    req = RescheduleBookingRequest(
        new_start_time=datetime.now(timezone.utc) + timedelta(days=3),
        cancellation_token=mock_invitee.cancellation_token,
    )

    with pytest.raises(HTTPException) as exc_info:
        await reschedule_booking(
            booking_id=mock_booking.id,
            req=req,
            current_user=None,
            db=mock_db,
        )

    assert exc_info.value.status_code == 400
    assert "cannot reschedule a cancelled booking" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_reschedule_past_time_rejected():
    """Verify that attempting to reschedule to a past time is rejected with HTTP 422."""
    mock_booking, mock_invitee, _ = create_mock_booking(status="confirmed")

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_booking
    mock_db.execute.return_value = mock_result

    req = RescheduleBookingRequest(
        new_start_time=datetime.now(timezone.utc) - timedelta(hours=2),
        cancellation_token=mock_invitee.cancellation_token,
    )

    with pytest.raises(HTTPException) as exc_info:
        await reschedule_booking(
            booking_id=mock_booking.id,
            req=req,
            current_user=None,
            db=mock_db,
        )

    assert exc_info.value.status_code == 422
    assert "past" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_email_verification_flow():
    """Verify email verification code generation, saving, and validation."""
    mock_db = AsyncMock()

    # 1. Send verification code
    req_send = SendVerificationCodeRequest(email="invitee@test.com")
    with patch("app.api.v1.bookings.email_service.send_verification_email", new_callable=AsyncMock) as mock_send_email:
        res_send = await send_booking_verification_code(req=req_send, db=mock_db)
        assert res_send["email"] == "invitee@test.com"
        assert mock_send_email.called

    # 2. Verify code - invalid code raises 400
    mock_result_empty = MagicMock()
    mock_result_empty.scalars.return_value.first.return_value = None
    mock_db.execute.return_value = mock_result_empty

    req_verify_bad = VerifyCodeRequest(email="invitee@test.com", code="000000")
    with pytest.raises(HTTPException) as exc_info:
        await verify_booking_code(req=req_verify_bad, db=mock_db)
    assert exc_info.value.status_code == 400

    # 3. Verify code - valid code succeeds
    mock_record = MagicMock(spec=BookingEmailVerification)
    mock_record.token = uuid.uuid4()
    mock_record.verified_at = None

    mock_result_valid = MagicMock()
    mock_result_valid.scalars.return_value.first.return_value = mock_record
    mock_db.execute.return_value = mock_result_valid

    req_verify_good = VerifyCodeRequest(email="invitee@test.com", code="123456")
    res_verify = await verify_booking_code(req=req_verify_good, db=mock_db)

    assert res_verify.verified is True
    assert res_verify.token == mock_record.token
    assert mock_record.verified_at is not None


@pytest.mark.asyncio
async def test_get_booking_by_manage_token():
    """Verify token-based retrieval of booking for public management view."""
    mock_booking, mock_invitee, mock_employee = create_mock_booking(status="confirmed")
    token = mock_invitee.cancellation_token

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_invitee
    mock_db.execute.return_value = mock_result

    res = await get_booking_by_manage_token(token=token, db=mock_db)

    assert res.id == mock_booking.id
    assert res.booking_reference == mock_booking.booking_reference
    assert res.invitee_name == mock_invitee.name
    assert res.invitee_email == mock_invitee.email
    assert res.employee_name == mock_employee.name
    assert res.status == "confirmed"
