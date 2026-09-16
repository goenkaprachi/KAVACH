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
        return decrypt_data(cfg.credentials_encrypted["api_key"])

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
        db: Optional[Any] = None,
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
