import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException
from app.models.rate_limit import BookingRateLimit
from app.services.rate_limiter import BookingRateLimiter, get_client_ip


@pytest.mark.asyncio
async def test_booking_email_rate_limit_enforced():
    """Verify that booking attempts are capped at 5 per hour per email address (HTTP 429)."""
    now = datetime.now(timezone.utc)
    mock_db = AsyncMock()

    # Create mock record with 5 requests already within the hour
    mock_record = MagicMock(spec=BookingRateLimit)
    mock_record.key = "booking:email:user@example.com"
    mock_record.count = 5
    mock_record.window_start = now - timedelta(minutes=10)
    mock_record.last_request_at = now - timedelta(minutes=1)

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_record
    mock_db.execute.return_value = mock_result

    with pytest.raises(HTTPException) as exc_info:
        await BookingRateLimiter.check_booking_email_limit(
            db=mock_db,
            email="user@example.com",
        )

    assert exc_info.value.status_code == 429
    assert "too many booking attempts" in exc_info.value.detail.lower()
    assert "Retry-After" in exc_info.value.headers


@pytest.mark.asyncio
async def test_verification_email_rate_limit_enforced():
    """Verify that verification emails are capped at 10 per hour per email address (HTTP 429)."""
    now = datetime.now(timezone.utc)
    mock_db = AsyncMock()

    mock_record = MagicMock(spec=BookingRateLimit)
    mock_record.key = "verify:email:spammer@example.com"
    mock_record.count = 10
    mock_record.window_start = now - timedelta(minutes=5)
    mock_record.last_request_at = now - timedelta(minutes=1)

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_record
    mock_db.execute.return_value = mock_result

    with pytest.raises(HTTPException) as exc_info:
        await BookingRateLimiter.check_verification_email_limit(
            db=mock_db,
            email="spammer@example.com",
        )

    assert exc_info.value.status_code == 429
    assert "too many verification emails" in exc_info.value.detail.lower()
    assert "Retry-After" in exc_info.value.headers


@pytest.mark.asyncio
async def test_ip_backstop_rate_limit_enforced():
    """Verify that IP requests are capped at 200 per hour (HTTP 429)."""
    now = datetime.now(timezone.utc)
    mock_db = AsyncMock()

    mock_record = MagicMock(spec=BookingRateLimit)
    mock_record.key = "ip:198.51.100.42"
    mock_record.count = 200
    mock_record.window_start = now - timedelta(minutes=30)
    mock_record.last_request_at = now - timedelta(minutes=1)

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_record
    mock_db.execute.return_value = mock_result

    with pytest.raises(HTTPException) as exc_info:
        await BookingRateLimiter.check_ip_limit(
            db=mock_db,
            client_ip="198.51.100.42",
        )

    assert exc_info.value.status_code == 429
    assert "too many requests from this ip address" in exc_info.value.detail.lower()
    assert "Retry-After" in exc_info.value.headers



@pytest.mark.asyncio
async def test_rate_limit_window_expiration_resets():
    """Verify that after 1 hour has elapsed, the window and counter reset to 1."""
    now = datetime.now(timezone.utc)
    mock_db = AsyncMock()

    # Record from 65 minutes ago (window expired)
    mock_record = MagicMock(spec=BookingRateLimit)
    mock_record.key = "booking:email:user@example.com"
    mock_record.count = 5
    mock_record.window_start = now - timedelta(minutes=65)
    mock_record.last_request_at = now - timedelta(minutes=65)

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_record
    mock_db.execute.return_value = mock_result

    # Should succeed without raising HTTPException
    await BookingRateLimiter.check_booking_email_limit(
        db=mock_db,
        email="user@example.com",
    )

    assert mock_record.count == 1
    assert mock_record.window_start >= now - timedelta(seconds=5)


@pytest.mark.asyncio
async def test_first_request_creates_record():
    """Verify that the first request for a key inserts a new rate limit record."""
    mock_db = AsyncMock()

    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result

    await BookingRateLimiter.check_ip_limit(
        db=mock_db,
        client_ip="203.0.113.1",
    )

    assert mock_db.add.called
    assert mock_db.commit.called


def test_get_client_ip_variants():
    """Verify client IP extraction from various headers and fallbacks."""
    # 1. No request
    assert get_client_ip(None) == "127.0.0.1"

    # 2. X-Forwarded-For header
    mock_req_xff = MagicMock()
    mock_req_xff.headers = {"x-forwarded-for": "203.0.113.195, 10.0.0.1"}
    assert get_client_ip(mock_req_xff) == "203.0.113.195"

    # 3. X-Real-IP header
    mock_req_xri = MagicMock()
    mock_req_xri.headers = {"x-real-ip": "198.51.100.7"}
    assert get_client_ip(mock_req_xri) == "198.51.100.7"

    # 4. Client host
    mock_req_client = MagicMock()
    mock_req_client.headers = {}
    mock_req_client.client.host = "192.168.1.50"
    assert get_client_ip(mock_req_client) == "192.168.1.50"
