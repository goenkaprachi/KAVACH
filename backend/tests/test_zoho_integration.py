import pytest
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import httpx
from app.core.config import Settings
from app.models.user import User
from app.services.zoho_calendar_service import zoho_calendar_service
from app.services.meeting_provider_hub import ZohoMeetingProvider


def test_zoho_dc_domains_configurable():
    """Verify Zoho account and API domains are fully configurable via env and data centres."""
    # Test default (.in for Kavach)
    s_in = Settings(
        DATABASE_URL="postgresql+asyncpg://user:pwd@localhost:5432/db",
        JWT_SECRET="test-secret-at-least-32-chars-long-123456",
        ENCRYPTION_KEY="MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
        ZOHO_DC="in",
    )
    assert s_in.zoho_accounts_url == "https://accounts.zoho.in"
    assert s_in.zoho_calendar_api_base == "https://calendar.zoho.in"
    assert s_in.zoho_meeting_api_base == "https://meeting.zoho.in"

    # Test .com DC
    s_com = Settings(
        DATABASE_URL="postgresql+asyncpg://user:pwd@localhost:5432/db",
        JWT_SECRET="test-secret-at-least-32-chars-long-123456",
        ENCRYPTION_KEY="MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
        ZOHO_DC="com",
    )
    assert s_com.zoho_accounts_url == "https://accounts.zoho.com"
    assert s_com.zoho_calendar_api_base == "https://calendar.zoho.com"
    assert s_com.zoho_meeting_api_base == "https://meeting.zoho.com"

    # Test custom explicit URL override
    s_custom = Settings(
        DATABASE_URL="postgresql+asyncpg://user:pwd@localhost:5432/db",
        JWT_SECRET="test-secret-at-least-32-chars-long-123456",
        ENCRYPTION_KEY="MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=",
        ZOHO_ACCOUNTS_URL="https://custom-accounts.zoho.corp",
        ZOHO_CALENDAR_API_BASE="https://custom-cal.zoho.corp",
        ZOHO_MEETING_API_BASE="https://custom-meet.zoho.corp",
    )
    assert s_custom.zoho_accounts_url == "https://custom-accounts.zoho.corp"
    assert s_custom.zoho_calendar_api_base == "https://custom-cal.zoho.corp"
    assert s_custom.zoho_meeting_api_base == "https://custom-meet.zoho.corp"


@pytest.mark.asyncio
async def test_zoho_calendar_freebusy_parsing():
    """Verify that Zoho Calendar FreeBusy response format with busy times is accurately parsed."""
    mock_user = MagicMock(spec=User)
    mock_user.id = "user-123"
    mock_user.zoho_email = "host@kavach.in"
    mock_user.zoho_access_token_encrypted = "mock-enc-token"
    mock_user.zoho_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

    # Mock response from Zoho Calendar API: date-keyed intervals
    fake_zoho_response = {
        "20261028": [
            {"allday": None},
            ["09:00-10:00", "14:30-15:30"]
        ]
    }

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = fake_zoho_response

    with patch.object(zoho_calendar_service, "get_valid_access_token", return_value="fake_access_token"):
        with patch("httpx.AsyncClient.get", return_value=mock_resp):
            intervals = await zoho_calendar_service.get_freebusy_intervals(
                user=mock_user,
                time_min_utc=datetime(2026, 10, 28, 0, 0, 0, tzinfo=timezone.utc),
                time_max_utc=datetime(2026, 10, 28, 23, 59, 59, tzinfo=timezone.utc),
            )

    assert len(intervals) == 2
    assert intervals[0] == (
        datetime(2026, 10, 28, 9, 0, tzinfo=timezone.utc),
        datetime(2026, 10, 28, 10, 0, tzinfo=timezone.utc),
    )
    assert intervals[1] == (
        datetime(2026, 10, 28, 14, 30, tzinfo=timezone.utc),
        datetime(2026, 10, 28, 15, 30, tzinfo=timezone.utc),
    )


@pytest.mark.asyncio
async def test_zoho_calendar_create_and_delete_event():
    """Verify creating and deleting events in Zoho Calendar using eventdata parameter."""
    mock_user = MagicMock(spec=User)
    mock_user.id = "user-123"
    mock_user.timezone = "Asia/Kolkata"
    mock_user.zoho_calendar_id = "cal_uid_999"

    mock_create_resp = MagicMock()
    mock_create_resp.status_code = 201
    mock_create_resp.json.return_value = {"events": [{"uid": "z_event_123"}]}

    with patch.object(zoho_calendar_service, "get_valid_access_token", return_value="fake_access_token"):
        with patch("httpx.AsyncClient.post", return_value=mock_create_resp) as mock_post:
            event_id = await zoho_calendar_service.create_calendar_event(
                user=mock_user,
                title="Strategy Discussion",
                start_time=datetime(2026, 10, 28, 10, 0, tzinfo=timezone.utc),
                end_time=datetime(2026, 10, 28, 11, 0, tzinfo=timezone.utc),
                description="Scheduled via Kavach Connect",
                location="https://meeting.zoho.in/join?key=abc",
                attendee_email="invitee@test.com",
            )
            assert event_id == "z_event_123"
            assert mock_post.called
            # Verify eventdata was passed as query parameter
            call_kwargs = mock_post.call_args[1]
            params = call_kwargs.get("params", {})
            assert "eventdata" in params
            eventdata = json.loads(params["eventdata"])
            assert eventdata["title"] == "Strategy Discussion"
            assert eventdata["dateandtime"]["start"] == "20261028T100000Z"
            assert eventdata["dateandtime"]["end"] == "20261028T110000Z"
            assert eventdata["location"] == "https://meeting.zoho.in/join?key=abc"

    # Test Delete
    mock_del_resp = MagicMock()
    mock_del_resp.status_code = 204
    with patch.object(zoho_calendar_service, "get_valid_access_token", return_value="fake_access_token"):
        with patch("httpx.AsyncClient.delete", return_value=mock_del_resp) as mock_delete:
            deleted = await zoho_calendar_service.delete_calendar_event(
                user=mock_user,
                event_id="z_event_123",
            )
            assert deleted is True
            assert mock_delete.called


@pytest.mark.asyncio
async def test_zoho_meeting_creation():
    """Verify dynamic Zoho Meeting creation generates join link and session ref."""
    provider = ZohoMeetingProvider()
    mock_user = MagicMock(spec=User)
    mock_user.id = "user-123"
    mock_user.timezone = "Asia/Kolkata"
    mock_user.zoho_meeting_zsoid = "987654321"
    mock_user.zoho_meeting_zuid = "12345"
    mock_user.zoho_meet_url = None

    mock_resp = MagicMock()
    mock_resp.status_code = 201
    mock_resp.json.return_value = {
        "session": {
            "joinLink": "https://meeting.zoho.in/meeting/join?key=9988776655",
            "hostLink": "https://meeting.zoho.in/meeting/start?key=9988776655",
            "meetingKey": "9988776655",
        }
    }

    with patch.object(provider, "_resolve_meeting_credentials", return_value=("fake_tok", "987654321", "12345")):
        with patch("httpx.AsyncClient.post", return_value=mock_resp):
            details = await provider.create_meeting(
                booking_id="booking-abc-123",
                title="Consultation Call",
                start_time=datetime(2026, 10, 28, 14, 0, tzinfo=timezone.utc),
                duration_minutes=45,
                host_user=mock_user,
                attendee_email="client@example.com",
            )

    assert details.provider == "zoho_meeting"
    assert details.join_url == "https://meeting.zoho.in/meeting/join?key=9988776655"
    assert details.external_ref == "9988776655"
