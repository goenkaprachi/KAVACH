import logging
import uuid
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

    def register_provider(self, name: str, provider: MeetingProvider):
        self.providers[name] = provider

    async def create_for_booking(
        self,
        booking_id: str,
        title: str,
        start_time: Any,
        duration_minutes: int,
        requested_provider: str,
        location_detail: Optional[str] = None
    ) -> MeetingDetails:
        provider = self.providers.get(requested_provider)

        if requested_provider in ("phone", "in_person", "custom"):
            return MeetingDetails(
                provider=requested_provider,
                join_url=location_detail or f"Meeting via {requested_provider.replace('_', ' ').title()}",
                external_ref=None
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
