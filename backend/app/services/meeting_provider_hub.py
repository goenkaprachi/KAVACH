import logging
import uuid
from datetime import timedelta
from typing import Optional, Protocol, Dict, Any
from dataclasses import dataclass
from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class MeetingDetails:
    provider: str
    join_url: str
    host_url: Optional[str] = None
    external_ref: Optional[str] = None


class MeetingProvider(Protocol):
    name: str

    def is_configured(self) -> bool:
        ...

    async def create_meeting(self, booking_id: str, title: str, start_time: Any, duration_minutes: int) -> MeetingDetails:
        ...

    async def cancel_meeting(self, external_ref: str) -> None:
        ...


class JitsiMeetProvider:
    name = "jitsi"

    def __init__(self, base_url: str = settings.JITSI_BASE_URL):
        self.base_url = base_url.rstrip("/")

    def is_configured(self) -> bool:
        return True

    async def create_meeting(self, booking_id: str, title: str, start_time: Any, duration_minutes: int) -> MeetingDetails:
        # Generate an unguessable, human-readable room name with uuid
        clean_title = "".join(c for c in title if c.isalnum())[:16] or "Meeting"
        room_name = f"kavach-{clean_title}-{uuid.uuid4().hex[:12]}"
        join_url = f"{self.base_url}/{room_name}"
        return MeetingDetails(
            provider="jitsi",
            join_url=join_url,
            host_url=join_url,
            external_ref=room_name
        )

    async def cancel_meeting(self, external_ref: str) -> None:
        # Jitsi rooms are ephemeral; no API cancellation needed
        logger.info(f"Cancelled Jitsi meeting room {external_ref}")


class GoogleMeetProvider:
    name = "google_meet"

    def is_configured(self) -> bool:
        return True

    async def _create_calendar_event_meet(
        self,
        booking_id: str,
        title: str,
        start_time: Any,
        duration_minutes: int,
        host_user: Any,
        db: Optional[Any] = None,
        attendee_email: Optional[str] = None,
    ) -> Optional[MeetingDetails]:
        """Creates a verified Google Meet conference via Google Calendar API if OAuth is connected."""
        import httpx
        from datetime import datetime, timezone, timedelta
        from app.core.security import decrypt_data, encrypt_data

        if not getattr(host_user, "google_access_token_encrypted", None):
            return None

        access_token = None
        try:
            access_token = decrypt_data(host_user.google_access_token_encrypted)
        except Exception as e:
            logger.warning(f"Failed to decrypt google_access_token: {e}")

        # Check token expiry
        expires_at = getattr(host_user, "google_token_expires_at", None)
        is_expired = False
        if expires_at:
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) >= expires_at - timedelta(seconds=60):
                is_expired = True

        # Refresh if expired and refresh token available
        refresh_token_enc = getattr(host_user, "google_refresh_token_encrypted", None)
        if (is_expired or not access_token) and refresh_token_enc and db:
            try:
                from app.api.v1.auth import get_google_credentials
                client_id, client_secret = await get_google_credentials(db)
                refresh_token = decrypt_data(refresh_token_enc)
                if client_id and client_secret and refresh_token:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        r = await client.post(
                            "https://oauth2.googleapis.com/token",
                            data={
                                "client_id": client_id,
                                "client_secret": client_secret,
                                "refresh_token": refresh_token,
                                "grant_type": "refresh_token",
                            },
                        )
                        if r.status_code == 200:
                            tok_data = r.json()
                            access_token = tok_data.get("access_token")
                            new_exp = tok_data.get("expires_in", 3600)
                            host_user.google_access_token_encrypted = encrypt_data(access_token)
                            host_user.google_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=new_exp)
                            await db.commit()
                            logger.info(f"Refreshed Google OAuth token for host {host_user.id}")
            except Exception as e:
                logger.warning(f"Failed to refresh Google OAuth token: {e}")

        if not access_token:
            return None

        end_time = start_time + timedelta(minutes=duration_minutes)
        tz_name = getattr(host_user, "timezone", "UTC") or "UTC"
        start_iso = start_time.isoformat() if hasattr(start_time, "isoformat") else str(start_time)
        end_iso = end_time.isoformat() if hasattr(end_time, "isoformat") else str(end_time)

        req_id = f"kavach-{str(booking_id).replace('-', '')[:20]}"
        event_payload: dict[str, Any] = {
            "summary": title,
            "description": f"Scheduled via Kavach Connect.\nBooking Reference: {booking_id}",
            "location": "Google Meet",
            "start": {"dateTime": start_iso, "timeZone": tz_name},
            "end": {"dateTime": end_iso, "timeZone": tz_name},
            "conferenceData": {
                "createRequest": {
                    "requestId": req_id,
                    "conferenceSolutionKey": {"type": "hangoutsMeet"},
                }
            },
        }
        if attendee_email:
            event_payload["attendees"] = [{"email": attendee_email}]

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(
                    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json",
                    },
                    json=event_payload,
                )
            if res.status_code in (200, 201):
                event_data = res.json()
                join_url = event_data.get("hangoutLink")
                if not join_url:
                    for ep in event_data.get("conferenceData", {}).get("entryPoints", []):
                        if ep.get("entryPointType") == "video":
                            join_url = ep.get("uri")
                            break
                if join_url:
                    logger.info(f"Successfully generated dynamic Google Meet link via Calendar API: {join_url}")
                    return MeetingDetails(
                        provider="google_meet",
                        join_url=join_url,
                        host_url=join_url,
                        external_ref=event_data.get("id"),
                    )
            logger.warning(f"Google Calendar API returned status {res.status_code}: {res.text}")
        except Exception as e:
            logger.warning(f"Exception during Google Calendar API call: {e}")

        return None

    async def create_meeting(
        self,
        booking_id: str,
        title: str,
        start_time: Any,
        duration_minutes: int,
        host_user: Optional[Any] = None,
        location_detail: Optional[str] = None,
        db: Optional[Any] = None,
        attendee_email: Optional[str] = None,
    ) -> MeetingDetails:
        # 1. Explicit Meet link in location_detail
        if location_detail and "meet.google.com/" in location_detail:
            cleaned = location_detail.strip()
            if not cleaned.startswith("http"):
                cleaned = f"https://{cleaned}"
            code = cleaned.split("meet.google.com/")[-1].split("?")[0]
            return MeetingDetails(
                provider="google_meet",
                join_url=cleaned,
                host_url=cleaned,
                external_ref=code,
            )

        # 2. Dynamic Google Meet room via Google Calendar API if OAuth connected
        if host_user and getattr(host_user, "google_access_token_encrypted", None):
            cal_details = await self._create_calendar_event_meet(
                booking_id, title, start_time, duration_minutes, host_user, db, attendee_email=attendee_email
            )
            if cal_details:
                return cal_details

        # 3. Host's permanent Google Meet link (google_meet_url) - Zero Cloud Setup needed!
        if host_user and getattr(host_user, "google_meet_url", None):
            meet_url = host_user.google_meet_url.strip()
            if meet_url:
                if not meet_url.startswith("http"):
                    meet_url = f"https://{meet_url}"
                code = meet_url.split("meet.google.com/")[-1].split("?")[0] if "meet.google.com/" in meet_url else None
                logger.info(f"Using host's permanent Google Meet URL: {meet_url}")
                return MeetingDetails(
                    provider="google_meet",
                    join_url=meet_url,
                    host_url=meet_url,
                    external_ref=code,
                )

        # 4. Zero-Broken-Link Fallback:
        # NEVER generate arbitrary random codes like p1-p2-p3 which Google rejects.
        # Fall back to Jitsi Meet so attendee & host have a working video conference.
        logger.info(
            f"Google Meet requested for booking {booking_id}, but host has no permanent Meet link "
            f"or active Google OAuth. Falling back to secure Jitsi Meet room to prevent broken link."
        )
        clean_title = "".join(c for c in title if c.isalnum())[:16] or "Meeting"
        room_name = f"kavach-meet-{clean_title.lower()}-{uuid.uuid4().hex[:10]}"
        join_url = f"{settings.JITSI_BASE_URL.rstrip('/')}/{room_name}"
        return MeetingDetails(
            provider="jitsi",
            join_url=join_url,
            host_url=join_url,
            external_ref=room_name,
        )

    async def cancel_meeting(
        self, external_ref: str, host_user: Optional[Any] = None, db: Optional[Any] = None
    ) -> None:
        if external_ref and host_user and getattr(host_user, "google_access_token_encrypted", None):
            try:
                import httpx
                from app.core.security import decrypt_data
                token = decrypt_data(host_user.google_access_token_encrypted)
                if token:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        await client.delete(
                            f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{external_ref}",
                            headers={"Authorization": f"Bearer {token}"},
                        )
                        logger.info(f"Cancelled Google Calendar event {external_ref}")
            except Exception as exc:
                logger.warning(f"Failed to cancel Google Calendar event {external_ref}: {exc}")


class WherebyMeetingProvider:
    """
    Creates a real Whereby room via the Whereby REST API using the org-wide
    API key configured by an admin in Admin > Integrations. Unlike Jitsi,
    this provider needs a DB lookup for credentials, so it's invoked
    directly by the hub rather than living in the static providers map.
    """
    name = "whereby"

    @staticmethod
    async def get_api_key(db: Any) -> Optional[str]:
        from sqlalchemy import select
        from cryptography.fernet import InvalidToken
        from app.models.integration import MeetingProviderConfig
        from app.core.security import decrypt_data

        stmt = select(MeetingProviderConfig).where(
            MeetingProviderConfig.provider == "whereby",
            MeetingProviderConfig.is_enabled == True,
        )
        res = await db.execute(stmt)
        cfg = res.scalar_one_or_none()
        if not cfg or not cfg.credentials_encrypted or not cfg.credentials_encrypted.get("api_key"):
            return None
        try:
            return decrypt_data(cfg.credentials_encrypted["api_key"])
        except InvalidToken as exc:
            raise RuntimeError(
                "Stored Whereby API key could not be decrypted - the encryption key "
                "(ENCRYPTION_KEY) has likely changed since it was last saved. Ask an "
                "admin to re-enter the Whereby API key in Admin > Integrations."
            ) from exc

    async def create_meeting(
        self, booking_id: str, title: str, start_time: Any, duration_minutes: int, api_key: str
    ) -> MeetingDetails:
        import httpx

        end_time = start_time + timedelta(minutes=duration_minutes)
        clean_title = "".join(c for c in title if c.isalnum())[:16].lower()
        # NOTE: no leading slash - Whereby rejects a roomNamePrefix starting
        # with "/" (it auto-prefixes the final room name with one itself).
        room_name_prefix = f"kavach-{clean_title or 'meeting'}-"

        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=8.0)) as client:
            resp = await client.post(
                "https://api.whereby.dev/v1/meetings",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "isLocked": False,
                    "roomNamePrefix": room_name_prefix,
                    "endDate": end_time.isoformat(),
                    "fields": ["hostRoomUrl"],
                },
            )

        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Whereby API error {resp.status_code}: {resp.text}")

        data = resp.json()
        room_url = data.get("roomUrl")
        if not room_url:
            raise RuntimeError(f"Whereby API response missing roomUrl: {data}")

        return MeetingDetails(
            provider="whereby",
            join_url=room_url,
            host_url=data.get("hostRoomUrl") or room_url,
            external_ref=data.get("meetingId"),
        )

    async def cancel_meeting(self, external_ref: str, api_key: Optional[str] = None) -> None:
        if not external_ref or not api_key:
            return
        import httpx

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.delete(
                    f"https://api.whereby.dev/v1/meetings/{external_ref}",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
        except Exception as exc:
            logger.warning(f"Failed to cancel Whereby meeting {external_ref}: {exc}")


class CustomLocationProvider:
    name = "custom"

    def is_configured(self) -> bool:
        return True

    async def create_meeting(self, booking_id: str, title: str, start_time: Any, duration_minutes: int, custom_detail: str = "") -> MeetingDetails:
        return MeetingDetails(
            provider="custom",
            join_url=custom_detail or "Custom location specified in invitation",
            external_ref=None
        )

    async def cancel_meeting(self, external_ref: str) -> None:
        pass


class MeetingProviderHub:
    """
    Central hub for meeting video providers.
    Ensures zero-setup determinism: if requested provider is unavailable or fails,
    automatically falls back to Jitsi Meet so a confirmed booking is NEVER left without a join link.
    """

    def __init__(self):
        self.providers: Dict[str, Any] = {
            "jitsi": JitsiMeetProvider(),
            "google_meet": GoogleMeetProvider(),
            "phone": CustomLocationProvider(),
            "in_person": CustomLocationProvider(),
            "custom": CustomLocationProvider(),
        }
        self.whereby_provider = WherebyMeetingProvider()

    def register_provider(self, name: str, provider: MeetingProvider):
        self.providers[name] = provider

    async def create_for_booking(
        self,
        booking_id: str,
        title: str,
        start_time: Any,
        duration_minutes: int,
        requested_provider: str,
        location_detail: Optional[str] = None,
        host_user: Optional[Any] = None,
        db: Optional[Any] = None,
        attendee_email: Optional[str] = None,
    ) -> MeetingDetails:
        provider = self.providers.get(requested_provider)

        if requested_provider in ("phone", "in_person", "custom"):
            return MeetingDetails(
                provider=requested_provider,
                join_url=location_detail or f"Meeting via {requested_provider.replace('_', ' ').title()}",
                external_ref=None
            )

        if requested_provider == "whereby" and db is not None:
            try:
                api_key = await self.whereby_provider.get_api_key(db)
                if api_key:
                    return await self.whereby_provider.create_meeting(
                        booking_id, title, start_time, duration_minutes, api_key
                    )
                logger.info(
                    f"Whereby requested for booking {booking_id} but not configured/enabled by an admin. "
                    f"Falling back to Jitsi Meet safety net."
                )
            except Exception as exc:
                logger.warning(
                    f"Whereby provider failed for booking {booking_id}: "
                    f"{type(exc).__name__}: {exc!r}. Falling back to Jitsi Meet safety net."
                )

        if requested_provider == "google_meet":
            try:
                return await self.providers["google_meet"].create_meeting(
                    booking_id=booking_id,
                    title=title,
                    start_time=start_time,
                    duration_minutes=duration_minutes,
                    host_user=host_user,
                    location_detail=location_detail,
                    db=db,
                    attendee_email=attendee_email,
                )
            except Exception as exc:
                logger.warning(
                    f"Google Meet provider failed for booking {booking_id}: {exc}. "
                    f"Falling back to Jitsi Meet safety net."
                )
                return await self.providers["jitsi"].create_meeting(booking_id, title, start_time, duration_minutes)

        if provider and provider.is_configured():
            try:
                return await provider.create_meeting(booking_id, title, start_time, duration_minutes)
            except Exception as exc:
                logger.warning(
                    f"Provider '{requested_provider}' failed for booking {booking_id}: {exc}. "
                    f"Falling back to Jitsi Meet safety net."
                )

        # Fallback to Jitsi Meet default
        logger.info(f"Using default Jitsi Meet provider for booking {booking_id}")
        return await self.providers["jitsi"].create_meeting(booking_id, title, start_time, duration_minutes)


# Global singleton instance
meeting_hub = MeetingProviderHub()
