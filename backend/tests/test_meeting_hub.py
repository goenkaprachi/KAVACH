import pytest
import uuid
from datetime import datetime, timezone
from app.services.meeting_provider_hub import MeetingProviderHub, JitsiMeetProvider, CustomLocationProvider


@pytest.mark.asyncio
async def test_jitsi_provider_generates_valid_url():
    provider = JitsiMeetProvider(base_url="https://meet.jit.si")
    booking_id = str(uuid.uuid4())
    start_time = datetime.now(timezone.utc)
    
    details = await provider.create_meeting(
        booking_id=booking_id,
        title="Consultation Call",
        start_time=start_time,
        duration_minutes=30
    )
    
    assert details.provider == "jitsi"
    assert "meet.jit.si" in details.join_url
    assert "kavach" in details.join_url.lower()
    assert details.external_ref is not None


@pytest.mark.asyncio
async def test_meeting_hub_fallback_to_jitsi():
    hub = MeetingProviderHub()
    booking_id = str(uuid.uuid4())
    start_time = datetime.now(timezone.utc)

    # Request an unconfigured provider (e.g. "zoom" or nonexistent "super_meet")
    details = await hub.create_for_booking(
        booking_id=booking_id,
        title="Strategy Sync",
        start_time=start_time,
        duration_minutes=45,
        requested_provider="zoom"
    )

    # Must safely fall back to Jitsi so a confirmed booking is NEVER without a join link
    assert details.provider == "jitsi"
    assert "meet.jit.si" in details.join_url


@pytest.mark.asyncio
async def test_custom_location_handling():
    hub = MeetingProviderHub()
    booking_id = str(uuid.uuid4())
    start_time = datetime.now(timezone.utc)

    details = await hub.create_for_booking(
        booking_id=booking_id,
        title="In-Person Office Sync",
        start_time=start_time,
        duration_minutes=60,
        requested_provider="in_person",
        location_detail="Kavach Infra Solutions, Pune HQ, Conference Room A"
    )

    assert details.provider == "in_person"
    assert "Pune HQ" in details.join_url


@pytest.mark.asyncio
async def test_google_meet_with_host_personal_url():
    hub = MeetingProviderHub()
    booking_id = str(uuid.uuid4())
    start_time = datetime.now(timezone.utc)

    class MockUser:
        google_meet_url = "https://meet.google.com/abc-defg-hij"
        google_access_token_encrypted = None

    details = await hub.create_for_booking(
        booking_id=booking_id,
        title="Client Demo",
        start_time=start_time,
        duration_minutes=30,
        requested_provider="google_meet",
        host_user=MockUser(),
    )

    assert details.provider == "google_meet"
    assert details.join_url == "https://meet.google.com/abc-defg-hij"
    assert details.external_ref == "abc-defg-hij"


@pytest.mark.asyncio
async def test_google_meet_without_config_falls_back_safely():
    hub = MeetingProviderHub()
    booking_id = str(uuid.uuid4())
    start_time = datetime.now(timezone.utc)

    class MockUserWithoutMeet:
        google_meet_url = None
        google_access_token_encrypted = None

    details = await hub.create_for_booking(
        booking_id=booking_id,
        title="Client Demo",
        start_time=start_time,
        duration_minutes=30,
        requested_provider="google_meet",
        host_user=MockUserWithoutMeet(),
    )

    # Must NOT generate fake broken random meet code like p1-p2-p3
    # Instead safely falls back to working Jitsi room
    assert details.provider == "jitsi"
    assert "meet.jit.si" in details.join_url
    assert "meet.google.com" not in details.join_url
