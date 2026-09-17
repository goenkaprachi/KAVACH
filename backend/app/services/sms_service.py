"""
Phase 12 — SMS & WhatsApp Notifications via Twilio
Sends booking confirmation, reminder, and cancellation SMS/WhatsApp messages.
Falls back gracefully if Twilio SDK is not installed or credentials are missing.
"""

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


CURRENCY_SYMBOLS = {
    "INR": "Rs.",
    "USD": "$",
    "EUR": "EU",
    "GBP": "GBP",
    "SGD": "SGD",
    "AED": "AED",
}


def _get_twilio_client():
    """Lazily import and return a Twilio client; returns None if unavailable."""
    try:
        from twilio.rest import Client  # type: ignore
    except ImportError:
        logger.warning("Twilio SDK not installed. Run: pip install twilio")
        return None, None, None

    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "")
    from_number = os.getenv("TWILIO_FROM_NUMBER", "")  # e.g. +15551234567 or whatsapp:+14155238886

    if not account_sid or not auth_token or not from_number:
        logger.warning(
            "Twilio credentials not configured. Set TWILIO_ACCOUNT_SID, "
            "TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER in environment."
        )
        return None, None, None

    client = Client(account_sid, auth_token)
    return client, from_number, account_sid


def _to_whatsapp(number: str) -> str:
    """Prefix a phone number for WhatsApp channel if not already prefixed."""
    if not number.startswith("whatsapp:"):
        return f"whatsapp:{number}"
    return number


def _send_message(to: str, body: str, channel: str = "sms") -> bool:
    """
    Send an SMS or WhatsApp message.
    channel: "sms" | "whatsapp"
    Returns True on success, False on failure.
    """
    client, from_number, _ = _get_twilio_client()
    if client is None:
        return False

    try:
        if channel == "whatsapp":
            message = client.messages.create(
                from_=_to_whatsapp(from_number),
                to=_to_whatsapp(to),
                body=body,
            )
        else:
            message = client.messages.create(
                from_=from_number,
                to=to,
                body=body,
            )
        logger.info("SMS/WhatsApp sent SID=%s channel=%s to=%s", message.sid, channel, to)
        return True
    except Exception as exc:
        logger.error("Failed to send %s to %s: %s", channel, to, exc)
        return False


# ---------------------------------------------------------------------------
# Public notification helpers
# ---------------------------------------------------------------------------

def send_booking_confirmation_sms(
    to_phone: str,
    invitee_name: str,
    event_title: str,
    host_name: str,
    start_time_str: str,
    meeting_url: Optional[str] = None,
    cancellation_token: Optional[str] = None,
    channel: str = "sms",
) -> bool:
    """Send a booking confirmation SMS/WhatsApp to the invitee."""
    lines = [
        f"✅ Booking Confirmed!",
        f"Hi {invitee_name}, your meeting '{event_title}' with {host_name} is scheduled.",
        f"📅 {start_time_str}",
    ]
    if meeting_url:
        lines.append(f"🔗 Join: {meeting_url}")
    if cancellation_token:
        lines.append(f"To cancel, use code: {cancellation_token}")
    lines.append("Powered by Kavach Connect")
    return _send_message(to_phone, "\n".join(lines), channel)


def send_booking_reminder_sms(
    to_phone: str,
    invitee_name: str,
    event_title: str,
    host_name: str,
    start_time_str: str,
    minutes_until: int,
    meeting_url: Optional[str] = None,
    channel: str = "sms",
) -> bool:
    """Send a reminder SMS/WhatsApp before the meeting."""
    unit = "minute" if minutes_until < 60 else "hour"
    amount = minutes_until if minutes_until < 60 else round(minutes_until / 60)
    lines = [
        f"⏰ Reminder: Your meeting starts in {amount} {unit}{'s' if amount != 1 else ''}!",
        f"'{event_title}' with {host_name}",
        f"📅 {start_time_str}",
    ]
    if meeting_url:
        lines.append(f"🔗 Join: {meeting_url}")
    return _send_message(to_phone, "\n".join(lines), channel)


def send_booking_cancellation_sms(
    to_phone: str,
    invitee_name: str,
    event_title: str,
    host_name: str,
    start_time_str: str,
    channel: str = "sms",
) -> bool:
    """Send a cancellation notice SMS/WhatsApp to the invitee."""
    body = (
        f"❌ Meeting Cancelled\n"
        f"Hi {invitee_name}, your booking '{event_title}' with {host_name} "
        f"on {start_time_str} has been cancelled.\n"
        f"Kavach Connect"
    )
    return _send_message(to_phone, body, channel)


def send_host_new_booking_sms(
    to_phone: str,
    host_name: str,
    invitee_name: str,
    invitee_email: str,
    event_title: str,
    start_time_str: str,
    channel: str = "sms",
) -> bool:
    """Send a new-booking alert SMS/WhatsApp to the host."""
    body = (
        f"📅 New Booking!\n"
        f"Hi {host_name}, {invitee_name} ({invitee_email}) booked '{event_title}'.\n"
        f"📅 {start_time_str}\n"
        f"Kavach Connect"
    )
    return _send_message(to_phone, body, channel)
