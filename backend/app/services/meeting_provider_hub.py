import logging
import uuid
from datetime import timedelta
from typing import Optional, Protocol, Dict, Any, Tuple
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


class ZohoMeetingProvider:
    name = "zoho_meeting"

    def is_configured(self) -> bool:
        return True

    async def _resolve_meeting_credentials(
        self,
        host_user: Optional[Any],
        db: Optional[Any],
    ) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """Resolves (access_token, zsoid, zuid) for Zoho Meeting API."""
        import httpx
        from app.services.zoho_calendar_service import zoho_calendar_service

        access_token = None
        zsoid = None
        zuid = None

        if host_user and (getattr(host_user, "zoho_access_token_encrypted", None) or getattr(host_user, "zoho_refresh_token_encrypted", None)):
            access_token = await zoho_calendar_service.get_valid_access_token(host_user, db)
            zsoid = getattr(host_user, "zoho_meeting_zsoid", None)
            zuid = getattr(host_user, "zoho_meeting_zuid", None)

        # If zsoid or zuid not yet cached, query user.json
        if access_token and (not zsoid or not zuid):
            try:
                meeting_base = settings.zoho_meeting_api_base
                user_url = f"{meeting_base}/api/v2/user.json"
                headers = {"Authorization": f"Zoho-oauthtoken {access_token}"}
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(user_url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    user_details = data.get("userDetails", {})
                    zsoid = str(user_details.get("zsoid") or "")
                    zuid = str(user_details.get("zuid") or "")
                    if host_user and zsoid and zuid:
                        host_user.zoho_meeting_zsoid = zsoid
                        host_user.zoho_meeting_zuid = zuid
                        if db:
                            try:
                                await db.commit()
                            except Exception:
                                pass
            except Exception as e:
                logger.warning(f"Could not resolve Zoho Meeting user details: {e}")

        return access_token, zsoid, zuid

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
        # 1. Explicit Zoho meeting link in location_detail
        if location_detail and ("meeting.zoho." in location_detail or "meet.zoho." in location_detail):
            cleaned = location_detail.strip()
            if not cleaned.startswith("http"):
                cleaned = f"https://{cleaned}"
            return MeetingDetails(
                provider="zoho_meeting",
                join_url=cleaned,
                host_url=cleaned,
                external_ref=cleaned.split("/")[-1].split("?")[0],
            )

        # 2. Host's permanent personal Zoho meeting link if configured
        if host_user and getattr(host_user, "zoho_meet_url", None):
            meet_url = host_user.zoho_meet_url.strip()
            if meet_url:
                if not meet_url.startswith("http"):
                    meet_url = f"https://{meet_url}"
                return MeetingDetails(
                    provider="zoho_meeting",
                    join_url=meet_url,
                    host_url=meet_url,
                    external_ref=meet_url.split("/")[-1].split("?")[0],
                )

        # 3. Dynamic Zoho Meeting via Zoho Meeting v2 API
        access_token, zsoid, zuid = await self._resolve_meeting_credentials(host_user, db)
        if access_token and zsoid:
            try:
                import httpx
                meeting_base = settings.zoho_meeting_api_base
                create_url = f"{meeting_base}/api/v2/{zsoid}/sessions.json"
                tz_name = getattr(host_user, "timezone", "UTC") or "UTC"

                # Zoho startTime format: "Jun 19, 2026 07:00 PM"
                start_formatted = start_time.strftime("%b %d, %Y %I:%M %p")
                session_payload: Dict[str, Any] = {
                    "session": {
                        "topic": title,
                        "agenda": f"Scheduled via Kavach Connect.\nBooking Reference: {booking_id}",
                        "startTime": start_formatted,
                        "duration": duration_minutes * 60 * 1000,
                        "timezone": tz_name,
                    }
                }
                if zuid and str(zuid).isdigit():
                    session_payload["session"]["presenter"] = int(zuid)
                if attendee_email:
                    session_payload["session"]["participants"] = [{"email": attendee_email.strip()}]

                headers = {
                    "Authorization": f"Zoho-oauthtoken {access_token}",
                    "Content-Type": "application/json;charset=UTF-8",
                }
                async with httpx.AsyncClient(timeout=15.0) as client:
                    res = await client.post(create_url, headers=headers, json=session_payload)

                if res.status_code in (200, 201):
                    data = res.json()
                    session_data = data.get("session") or data
                    join_url = session_data.get("joinLink") or session_data.get("join_url") or session_data.get("meetingUrl")
                    meeting_key = str(session_data.get("meetingKey") or session_data.get("meetingId") or session_data.get("sessionKey") or "")
                    if join_url:
                        logger.info(f"Successfully generated dynamic Zoho Meeting link: {join_url}")
                        return MeetingDetails(
                            provider="zoho_meeting",
                            join_url=join_url,
                            host_url=session_data.get("hostLink") or session_data.get("startUrl") or join_url,
                            external_ref=meeting_key or None,
                        )
                logger.warning(f"Zoho Meeting API returned status {res.status_code}: {res.text}")
            except Exception as e:
                logger.warning(f"Exception during Zoho Meeting API call: {e}")

        # 4. Zero-Broken-Link Fallback:
        # Fall back to secure Jitsi Meet room so attendee & host have a working video conference.
        logger.info(
            f"Zoho Meeting requested for booking {booking_id}, but host has no permanent Meet link "
            f"or active Zoho OAuth. Falling back to secure Jitsi Meet room to prevent broken link."
        )
        clean_title = "".join(c for c in title if c.isalnum())[:16] or "Meeting"
        room_name = f"kavach-zoho-{clean_title.lower()}-{uuid.uuid4().hex[:10]}"
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
        if not external_ref:
            return
        access_token, zsoid, _ = await self._resolve_meeting_credentials(host_user, db)
        if access_token and zsoid:
            try:
                import httpx
                meeting_base = settings.zoho_meeting_api_base
                delete_url = f"{meeting_base}/api/v2/{zsoid}/sessions/{external_ref}.json"
                headers = {"Authorization": f"Zoho-oauthtoken {access_token}"}
                async with httpx.AsyncClient(timeout=10.0) as client:
                    await client.delete(delete_url, headers=headers)
                    logger.info(f"Cancelled Zoho Meeting {external_ref}")
            except Exception as exc:
                logger.warning(f"Failed to cancel Zoho Meeting {external_ref}: {exc}")



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
            "zoho_meeting": ZohoMeetingProvider(),
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

        if requested_provider == "zoho_meeting":
            try:
                return await self.providers["zoho_meeting"].create_meeting(
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
                    f"Zoho Meeting provider failed for booking {booking_id}: {exc}. "
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
