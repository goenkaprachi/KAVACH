import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import encrypt_data, decrypt_data
from app.models.user import User

logger = logging.getLogger(__name__)


class GoogleCalendarService:
    """
    Handles two-way Google Calendar synchronization and real-time FreeBusy queries.
    Seamlessly verifies and refreshes OAuth access tokens.
    """

    async def get_valid_access_token(
        self,
        user: User,
        db: Optional[AsyncSession] = None,
    ) -> Optional[str]:
        """
        Retrieves a valid decrypted access token for the host user, auto-refreshing if expired.
        """
        if not user.google_access_token_encrypted and not user.google_refresh_token_encrypted:
            return None

        access_token: Optional[str] = None
        if user.google_access_token_encrypted:
            try:
                access_token = decrypt_data(user.google_access_token_encrypted)
            except Exception as e:
                logger.warning(f"Failed to decrypt google_access_token for user {user.id}: {e}")

        # Check token expiry
        expires_at = getattr(user, "google_token_expires_at", None)
        is_expired = False
        if expires_at:
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) >= expires_at - timedelta(seconds=60):
                is_expired = True

        # Refresh if needed
        refresh_token_enc = getattr(user, "google_refresh_token_encrypted", None)
        if (is_expired or not access_token) and refresh_token_enc and db:
            try:
                from app.api.v1.auth import get_google_credentials
                client_id, client_secret = await get_google_credentials(db)
                refresh_token = decrypt_data(refresh_token_enc)

                if client_id and client_secret and refresh_token:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        resp = await client.post(
                            "https://oauth2.googleapis.com/token",
                            data={
                                "client_id": client_id,
                                "client_secret": client_secret,
                                "refresh_token": refresh_token,
                                "grant_type": "refresh_token",
                            },
                        )
                        if resp.status_code == 200:
                            tok_data = resp.json()
                            access_token = tok_data.get("access_token")
                            new_exp = tok_data.get("expires_in", 3600)
                            user.google_access_token_encrypted = encrypt_data(access_token)
                            user.google_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=new_exp)
                            await db.commit()
                            logger.info(f"Refreshed Google OAuth token for user {user.id}")
            except Exception as e:
                logger.warning(f"Exception while refreshing Google OAuth token for user {user.id}: {e}")

        return access_token

    async def get_freebusy_intervals(
        self,
        user: User,
        time_min_utc: datetime,
        time_max_utc: datetime,
        db: Optional[AsyncSession] = None,
    ) -> List[Tuple[datetime, datetime]]:
        """
        Queries Google Calendar FreeBusy API for busy intervals on the user's primary calendar.
        Returns a list of (start_utc, end_utc) tuples representing busy times.
        """
        access_token = await self.get_valid_access_token(user, db)
        if not access_token:
            return []

        # Google FreeBusy requires RFC3339 format
        min_iso = time_min_utc.isoformat()
        if not min_iso.endswith("Z") and not ("+" in min_iso or "-" in min_iso[10:]):
            min_iso += "Z"
        max_iso = time_max_utc.isoformat()
        if not max_iso.endswith("Z") and not ("+" in max_iso or "-" in max_iso[10:]):
            max_iso += "Z"

        payload = {
            "timeMin": min_iso,
            "timeMax": max_iso,
            "items": [{"id": "primary"}],
        }

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(
                    "https://www.googleapis.com/calendar/v3/freeBusy",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )

            if res.status_code == 200:
                data = res.json()
                calendars = data.get("calendars", {})
                primary_cal = calendars.get("primary", {})
                busy_list = primary_cal.get("busy", [])

                intervals: List[Tuple[datetime, datetime]] = []
                for b in busy_list:
                    raw_start = b.get("start")
                    raw_end = b.get("end")
                    if raw_start and raw_end:
                        try:
                            start_dt = datetime.fromisoformat(raw_start.replace("Z", "+00:00")).astimezone(timezone.utc)
                            end_dt = datetime.fromisoformat(raw_end.replace("Z", "+00:00")).astimezone(timezone.utc)
                            if start_dt < end_dt:
                                intervals.append((start_dt, end_dt))
                        except Exception as parse_err:
                            logger.warning(f"Error parsing FreeBusy interval: {parse_err}")
                return intervals
            else:
                logger.warning(f"Google FreeBusy query failed with HTTP {res.status_code}: {res.text}")
        except Exception as e:
            logger.warning(f"Exception querying Google FreeBusy for user {user.id}: {e}")

        return []

    async def create_calendar_event(
        self,
        user: User,
        title: str,
        start_time: datetime,
        end_time: datetime,
        description: str,
        location: Optional[str] = None,
        attendee_email: Optional[str] = None,
        db: Optional[AsyncSession] = None,
    ) -> Optional[str]:
        """
        Creates an event on the user's primary Google Calendar.
        Returns the created Google Calendar event ID, or None if failed.
        """
        access_token = await self.get_valid_access_token(user, db)
        if not access_token:
            return None

        tz_name = getattr(user, "timezone", "UTC") or "UTC"
        start_iso = start_time.isoformat() if hasattr(start_time, "isoformat") else str(start_time)
        end_iso = end_time.isoformat() if hasattr(end_time, "isoformat") else str(end_time)

        payload: Dict[str, Any] = {
            "summary": title,
            "description": description,
            "start": {"dateTime": start_iso, "timeZone": tz_name},
            "end": {"dateTime": end_iso, "timeZone": tz_name},
        }
        if location:
            payload["location"] = location
        if attendee_email:
            payload["attendees"] = [{"email": attendee_email}]

        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                res = await client.post(
                    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
            if res.status_code in (200, 201):
                event_id = res.json().get("id")
                logger.info(f"Successfully synced event {event_id} to Google Calendar for host {user.id}")
                return event_id
            logger.warning(f"Google Calendar create event failed HTTP {res.status_code}: {res.text}")
        except Exception as e:
            logger.warning(f"Exception creating Google Calendar event: {e}")

        return None

    async def delete_calendar_event(
        self,
        user: User,
        event_id: str,
        db: Optional[AsyncSession] = None,
    ) -> bool:
        """
        Deletes an event from the user's primary Google Calendar.
        Returns True if deleted or already gone (404/410).
        """
        if not event_id:
            return True

        access_token = await self.get_valid_access_token(user, db)
        if not access_token:
            return False

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.delete(
                    f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{event_id}",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
            if res.status_code in (200, 204, 404, 410):
                logger.info(f"Successfully removed Google Calendar event {event_id}")
                return True
            logger.warning(f"Google Calendar delete event failed HTTP {res.status_code}: {res.text}")
        except Exception as e:
            logger.warning(f"Exception deleting Google Calendar event {event_id}: {e}")

        return False

    async def patch_calendar_event(
        self,
        user: User,
        event_id: str,
        start_time: datetime,
        end_time: datetime,
        db: Optional[AsyncSession] = None,
    ) -> bool:
        """
        Updates start and end times of an existing Google Calendar event.
        """
        if not event_id:
            return False

        access_token = await self.get_valid_access_token(user, db)
        if not access_token:
            return False

        tz_name = getattr(user, "timezone", "UTC") or "UTC"
        start_iso = start_time.isoformat() if hasattr(start_time, "isoformat") else str(start_time)
        end_iso = end_time.isoformat() if hasattr(end_time, "isoformat") else str(end_time)

        payload = {
            "start": {"dateTime": start_iso, "timeZone": tz_name},
            "end": {"dateTime": end_iso, "timeZone": tz_name},
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.patch(
                    f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{event_id}",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
            if res.status_code in (200, 204):
                logger.info(f"Successfully patched Google Calendar event {event_id}")
                return True
            logger.warning(f"Google Calendar patch event failed HTTP {res.status_code}: {res.text}")
        except Exception as e:
            logger.warning(f"Exception patching Google Calendar event {event_id}: {e}")

        return False


google_calendar_service = GoogleCalendarService()
