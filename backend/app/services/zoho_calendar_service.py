import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import encrypt_data, decrypt_data
from app.models.user import User

logger = logging.getLogger(__name__)


class ZohoCalendarService:
    """
    Handles two-way Zoho Calendar synchronization and real-time FreeBusy queries.
    Seamlessly verifies and refreshes OAuth access tokens against the configured Zoho Data Centre.
    """

    @property
    def accounts_url(self) -> str:
        return settings.zoho_accounts_url

    @property
    def calendar_api_base(self) -> str:
        return settings.zoho_calendar_api_base

    async def get_valid_access_token(
        self,
        user: User,
        db: Optional[AsyncSession] = None,
    ) -> Optional[str]:
        """
        Retrieves a valid decrypted access token for the host user, auto-refreshing if expired.
        """
        if not getattr(user, "zoho_access_token_encrypted", None) and not getattr(user, "zoho_refresh_token_encrypted", None):
            return None

        access_token: Optional[str] = None
        if user.zoho_access_token_encrypted:
            try:
                access_token = decrypt_data(user.zoho_access_token_encrypted)
            except Exception as e:
                logger.warning(f"Failed to decrypt zoho_access_token for user {user.id}: {e}")

        # Check token expiry
        expires_at = getattr(user, "zoho_token_expires_at", None)
        is_expired = False
        if expires_at:
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) >= expires_at - timedelta(seconds=60):
                is_expired = True

        # Refresh if needed
        refresh_token_enc = getattr(user, "zoho_refresh_token_encrypted", None)
        if (is_expired or not access_token) and refresh_token_enc and db:
            try:
                from app.api.v1.auth import get_zoho_credentials
                client_id, client_secret = await get_zoho_credentials(db)
                refresh_token = decrypt_data(refresh_token_enc)

                if client_id and client_secret and refresh_token:
                    token_url = f"{self.accounts_url}/oauth/v2/token"
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        resp = await client.post(
                            token_url,
                            data={
                                "client_id": client_id,
                                "client_secret": client_secret,
                                "refresh_token": refresh_token,
                                "grant_type": "refresh_token",
                            },
                        )
                        if resp.status_code == 200:
                            tok_data = resp.json()
                            if "access_token" in tok_data:
                                access_token = tok_data.get("access_token")
                                new_exp = tok_data.get("expires_in", 3600)
                                user.zoho_access_token_encrypted = encrypt_data(access_token)
                                user.zoho_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=new_exp)
                                await db.commit()
                                logger.info(f"Refreshed Zoho OAuth token for user {user.id}")
            except Exception as e:
                logger.warning(f"Exception while refreshing Zoho OAuth token for user {user.id}: {e}")

        return access_token

    async def get_or_fetch_calendar_id(
        self,
        user: User,
        access_token: str,
        db: Optional[AsyncSession] = None,
    ) -> str:
        """
        Retrieves user's primary Zoho Calendar UID.
        If not yet stored in user.zoho_calendar_id, queries the Zoho Calendar API.
        """
        if getattr(user, "zoho_calendar_id", None):
            return user.zoho_calendar_id

        try:
            url = f"{self.calendar_api_base}/api/v1/calendars?category=own"
            headers = {
                "Authorization": f"Zoho-oauthtoken {access_token}",
                "Content-Type": "application/json",
            }
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(url, headers=headers)
            if res.status_code == 200:
                data = res.json()
                calendars = data.get("calendars", [])
                primary_uid = None
                for cal in calendars:
                    if cal.get("is_default") or cal.get("isdefault"):
                        primary_uid = cal.get("uid") or cal.get("id")
                        break
                if not primary_uid and calendars:
                    primary_uid = calendars[0].get("uid") or calendars[0].get("id")

                if primary_uid:
                    user.zoho_calendar_id = primary_uid
                    if db:
                        try:
                            await db.commit()
                        except Exception:
                            pass
                    return primary_uid
        except Exception as e:
            logger.warning(f"Could not fetch calendars for Zoho user {user.id}: {e}")

        return "primary"

    async def get_freebusy_intervals(
        self,
        user: User,
        time_min_utc: datetime,
        time_max_utc: datetime,
        db: Optional[AsyncSession] = None,
    ) -> List[Tuple[datetime, datetime]]:
        """
        Queries Zoho Calendar FreeBusy API for busy intervals on the user's calendar.
        Returns a list of (start_utc, end_utc) tuples representing busy times.
        """
        access_token = await self.get_valid_access_token(user, db)
        if not access_token:
            return []

        uemail = getattr(user, "zoho_email", None) or getattr(user, "email", None)
        if not uemail:
            return []

        # Zoho format: yyyyMMdd'T'HHmmss
        sdate_str = time_min_utc.strftime("%Y%m%dT%H%M%S")
        edate_str = time_max_utc.strftime("%Y%m%dT%H%M%S")

        url = f"{self.calendar_api_base}/api/v1/calendars/freebusy"
        params = {
            "uemail": uemail.strip(),
            "sdate": sdate_str,
            "edate": edate_str,
            "ftype": "timebased",
        }
        headers = {
            "Authorization": f"Zoho-oauthtoken {access_token}",
        }

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(url, params=params, headers=headers)

            if res.status_code == 200:
                data = res.json()
                intervals: List[Tuple[datetime, datetime]] = []

                # Format is date-keyed dict: {"20261028": [{"allday": null}, ["09:00-10:00", "14:30-15:30"]]}
                if isinstance(data, dict):
                    for date_str, content in data.items():
                        if not (len(date_str) == 8 and date_str.isdigit()):
                            continue
                        try:
                            d_year = int(date_str[:4])
                            d_month = int(date_str[4:6])
                            d_day = int(date_str[6:8])
                        except ValueError:
                            continue

                        if isinstance(content, list):
                            # Check all day flag in first element
                            if len(content) > 0 and isinstance(content[0], dict) and content[0].get("allday"):
                                full_start = datetime(d_year, d_month, d_day, 0, 0, 0, tzinfo=timezone.utc)
                                full_end = datetime(d_year, d_month, d_day, 23, 59, 59, tzinfo=timezone.utc)
                                intervals.append((full_start, full_end))
                                continue

                            # Check busy time intervals list (usually element index 1)
                            busy_slots: List[str] = []
                            for elem in content:
                                if isinstance(elem, list):
                                    busy_slots.extend(elem)

                            for slot_range in busy_slots:
                                if isinstance(slot_range, str) and "-" in slot_range:
                                    parts = slot_range.split("-")
                                    if len(parts) == 2:
                                        try:
                                            sh, sm = map(int, parts[0].strip().split(":"))
                                            eh, em = map(int, parts[1].strip().split(":"))
                                            start_dt = datetime(d_year, d_month, d_day, sh, sm, 0, tzinfo=timezone.utc)
                                            end_dt = datetime(d_year, d_month, d_day, eh, em, 0, tzinfo=timezone.utc)
                                            if end_dt <= start_dt:
                                                end_dt += timedelta(days=1)
                                            intervals.append((start_dt, end_dt))
                                        except Exception as slot_err:
                                            logger.debug(f"Could not parse Zoho slot '{slot_range}': {slot_err}")

                return intervals
            else:
                logger.warning(f"Zoho FreeBusy query failed with HTTP {res.status_code}: {res.text}")
        except Exception as e:
            logger.warning(f"Exception querying Zoho FreeBusy for user {user.id}: {e}")

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
        Creates an event on the user's Zoho Calendar.
        Returns the created Zoho Calendar event UID, or None if failed.
        """
        access_token = await self.get_valid_access_token(user, db)
        if not access_token:
            return None

        calendar_uid = await self.get_or_fetch_calendar_id(user, access_token, db)
        tz_name = getattr(user, "timezone", "UTC") or "UTC"

        # Format: yyyyMMdd'T'HHmmss'Z' (UTC)
        start_utc = start_time.astimezone(timezone.utc) if start_time.tzinfo else start_time.replace(tzinfo=timezone.utc)
        end_utc = end_time.astimezone(timezone.utc) if end_time.tzinfo else end_time.replace(tzinfo=timezone.utc)
        start_str = start_utc.strftime("%Y%m%dT%H%M%SZ")
        end_str = end_utc.strftime("%Y%m%dT%H%M%SZ")

        event_dict: Dict[str, Any] = {
            "title": title,
            "description": description,
            "dateandtime": {
                "start": start_str,
                "end": end_str,
                "timezone": tz_name,
            },
            "isallday": False,
        }
        if location:
            event_dict["location"] = location
        if attendee_email:
            event_dict["attendees"] = [{"email": attendee_email}]

        url = f"{self.calendar_api_base}/api/v1/calendars/{calendar_uid}/events"
        params = {"eventdata": json.dumps(event_dict)}
        headers = {
            "Authorization": f"Zoho-oauthtoken {access_token}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                res = await client.post(url, params=params, headers=headers)
            if res.status_code in (200, 201):
                data = res.json()
                event_uid = None
                if isinstance(data, dict):
                    events_list = data.get("events")
                    if isinstance(events_list, list) and events_list:
                        event_uid = events_list[0].get("uid") or events_list[0].get("id")
                    if not event_uid:
                        event_uid = data.get("uid") or data.get("id")
                if event_uid:
                    logger.info(f"Successfully created Zoho Calendar event {event_uid} for host {user.id}")
                    return str(event_uid)
            logger.warning(f"Zoho Calendar create event failed HTTP {res.status_code}: {res.text}")
        except Exception as e:
            logger.warning(f"Exception creating Zoho Calendar event: {e}")

        return None

    async def update_calendar_event(
        self,
        user: User,
        event_id: str,
        start_time: datetime,
        end_time: datetime,
        title: Optional[str] = None,
        description: Optional[str] = None,
        location: Optional[str] = None,
        db: Optional[AsyncSession] = None,
    ) -> bool:
        """
        Updates start and end times of an existing Zoho Calendar event.
        """
        if not event_id:
            return False

        access_token = await self.get_valid_access_token(user, db)
        if not access_token:
            return False

        calendar_uid = await self.get_or_fetch_calendar_id(user, access_token, db)
        tz_name = getattr(user, "timezone", "UTC") or "UTC"

        start_utc = start_time.astimezone(timezone.utc) if start_time.tzinfo else start_time.replace(tzinfo=timezone.utc)
        end_utc = end_time.astimezone(timezone.utc) if end_time.tzinfo else end_time.replace(tzinfo=timezone.utc)
        start_str = start_utc.strftime("%Y%m%dT%H%M%SZ")
        end_str = end_utc.strftime("%Y%m%dT%H%M%SZ")

        event_dict: Dict[str, Any] = {
            "dateandtime": {
                "start": start_str,
                "end": end_str,
                "timezone": tz_name,
            },
            "isallday": False,
        }
        if title:
            event_dict["title"] = title
        if description:
            event_dict["description"] = description
        if location:
            event_dict["location"] = location

        url = f"{self.calendar_api_base}/api/v1/calendars/{calendar_uid}/events/{event_id}"
        params = {"eventdata": json.dumps(event_dict)}
        headers = {
            "Authorization": f"Zoho-oauthtoken {access_token}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.put(url, params=params, headers=headers)
            if res.status_code in (200, 204):
                logger.info(f"Successfully updated Zoho Calendar event {event_id}")
                return True
            logger.warning(f"Zoho Calendar update event failed HTTP {res.status_code}: {res.text}")
        except Exception as e:
            logger.warning(f"Exception updating Zoho Calendar event {event_id}: {e}")

        return False

    async def delete_calendar_event(
        self,
        user: User,
        event_id: str,
        db: Optional[AsyncSession] = None,
    ) -> bool:
        """
        Deletes an event from the user's Zoho Calendar.
        Returns True if deleted or already gone (404/410).
        """
        if not event_id:
            return True

        access_token = await self.get_valid_access_token(user, db)
        if not access_token:
            return False

        calendar_uid = await self.get_or_fetch_calendar_id(user, access_token, db)
        url = f"{self.calendar_api_base}/api/v1/calendars/{calendar_uid}/events/{event_id}"
        headers = {"Authorization": f"Zoho-oauthtoken {access_token}"}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.delete(url, headers=headers)
            if res.status_code in (200, 204, 404, 410):
                logger.info(f"Successfully removed Zoho Calendar event {event_id}")
                return True
            logger.warning(f"Zoho Calendar delete event failed HTTP {res.status_code}: {res.text}")
        except Exception as e:
            logger.warning(f"Exception deleting Zoho Calendar event {event_id}: {e}")

        return False


zoho_calendar_service = ZohoCalendarService()
