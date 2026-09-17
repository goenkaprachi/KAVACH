import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from datetime import datetime
from typing import Optional, Dict, Any
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_DEFAULT_TEMPLATES = {
    "booking_confirmation_attendee": {
        "name": "Booking Confirmation (Attendee)",
        "subject": "Confirmed: {event_title} with {host_name}",
        "body": """<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
    <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #0284c7; margin: 0;">Meeting Confirmed!</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Your appointment has been successfully scheduled.</p>
    </div>
    <p>Hi <strong>{attendee_name}</strong>,</p>
    <p>Your meeting <strong>{event_title}</strong> with <strong>{host_name}</strong> is confirmed.</p>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Date & Time:</strong> {start_time}</p>
        <p style="margin: 4px 0;"><strong>Organizer:</strong> {host_name} ({host_email})</p>
        <p style="margin: 4px 0;"><strong>Meeting Link:</strong> <a href="{meeting_url}" style="color: #0284c7; font-weight: bold;">{meeting_url}</a></p>
    </div>
    <p style="color: #94a3b8; font-size: 12px;">Need to make changes? You can cancel or reschedule using your reference code: <code>{cancellation_token}</code></p>
</div>"""
    },
    "booking_confirmation_host": {
        "name": "New Booking Alert (Host Employee)",
        "subject": "New Meeting: {attendee_name} booked {event_title}",
        "body": """<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
    <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #059669; margin: 0;">New Appointment Booked</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">A new meeting has been added to your schedule.</p>
    </div>
    <p>Hi <strong>{host_name}</strong>,</p>
    <p><strong>{attendee_name}</strong> ({attendee_email}) has booked <strong>{event_title}</strong> with you.</p>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Date & Time:</strong> {start_time}</p>
        <p style="margin: 4px 0;"><strong>Attendee:</strong> {attendee_name} ({attendee_email})</p>
        <p style="margin: 4px 0;"><strong>Meeting Link:</strong> <a href="{meeting_url}" style="color: #059669; font-weight: bold;">{meeting_url}</a></p>
    </div>
</div>"""
    },
    "booking_rescheduled_attendee": {
        "name": "Meeting Rescheduled (Attendee)",
        "subject": "Rescheduled: {event_title} with {host_name}",
        "body": """<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
    <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #7c3aed; margin: 0;">Meeting Rescheduled</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Your meeting has been updated to a new time.</p>
    </div>
    <p>Hi <strong>{attendee_name}</strong>,</p>
    <p>Your meeting <strong>{event_title}</strong> with <strong>{host_name}</strong> has been moved.</p>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Reason:</strong> {reason}</p>
        <p style="margin: 4px 0;"><strong>Previous Time:</strong> <span style="text-decoration: line-through; color: #94a3b8;">{old_start_time}</span></p>
        <p style="margin: 4px 0;"><strong>New Time:</strong> <span style="color: #16a34a; font-weight: bold;">{new_start_time}</span></p>
        <p style="margin: 4px 0;"><strong>Join Link:</strong> <a href="{meeting_url}" style="color: #7c3aed; font-weight: bold;">{meeting_url}</a></p>
    </div>
</div>"""
    },
    "booking_rescheduled_host": {
        "name": "Meeting Rescheduled (Host Employee)",
        "subject": "Rescheduled: {event_title} with {attendee_name}",
        "body": """<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
    <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #7c3aed; margin: 0;">Meeting Rescheduled</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Meeting time updated on your calendar.</p>
    </div>
    <p>Hi <strong>{host_name}</strong>,</p>
    <p>Your meeting <strong>{event_title}</strong> with <strong>{attendee_name}</strong> has been rescheduled.</p>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Reason:</strong> {reason}</p>
        <p style="margin: 4px 0;"><strong>Previous Time:</strong> <span style="text-decoration: line-through; color: #94a3b8;">{old_start_time}</span></p>
        <p style="margin: 4px 0;"><strong>New Time:</strong> <span style="color: #16a34a; font-weight: bold;">{new_start_time}</span></p>
        <p style="margin: 4px 0;"><strong>Join Link:</strong> <a href="{meeting_url}" style="color: #7c3aed; font-weight: bold;">{meeting_url}</a></p>
    </div>
</div>"""
    },
    "booking_cancelled_attendee": {
        "name": "Meeting Cancelled (Attendee)",
        "subject": "Cancelled: {event_title} with {host_name}",
        "body": """<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
    <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #e11d48; margin: 0;">Meeting Cancelled</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">This scheduled appointment has been cancelled.</p>
    </div>
    <p>Hi <strong>{attendee_name}</strong>,</p>
    <p>The meeting <strong>{event_title}</strong> with <strong>{host_name}</strong> scheduled for <strong>{start_time}</strong> has been cancelled.</p>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Reason:</strong> {reason}</p>
    </div>
</div>"""
    },
    "booking_cancelled_host": {
        "name": "Meeting Cancelled (Host Employee)",
        "subject": "Meeting Cancelled: {attendee_name} - {event_title}",
        "body": """<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
    <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #e11d48; margin: 0;">Meeting Cancelled</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">An appointment has been cancelled on your schedule.</p>
    </div>
    <p>Hi <strong>{host_name}</strong>,</p>
    <p>The meeting with <strong>{attendee_name}</strong> scheduled for <strong>{start_time}</strong> has been cancelled.</p>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Reason:</strong> {reason}</p>
    </div>
</div>"""
    },
    "internal_meeting_invite": {
        "name": "Internal Meeting Invitation (Colleague)",
        "subject": "Internal Meeting: {event_title} organized by {host_name}",
        "body": """<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
    <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #0284c7; margin: 0;">Internal Meeting Invitation</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">You have been invited to an internal team meeting.</p>
    </div>
    <p>Hi <strong>{attendee_name}</strong>,</p>
    <p><strong>{host_name}</strong> ({host_email}) has invited you to an internal meeting: <strong>{event_title}</strong>.</p>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Date & Time:</strong> {start_time}</p>
        <p style="margin: 4px 0;"><strong>Host:</strong> {host_name}</p>
        <p style="margin: 4px 0;"><strong>Meeting Link:</strong> <a href="{meeting_url}" style="color: #0284c7; font-weight: bold;">{meeting_url}</a></p>
        {agenda_block}
    </div>
    <p style="color: #64748b; font-size: 13px;">This meeting has been automatically added to your Kavach Connect schedule.</p>
</div>"""
    },
    "meeting_reminder_24h_attendee": {
        "name": "Meeting Reminder - 24 Hours (Attendee)",
        "subject": "Reminder: {event_title} with {host_name} tomorrow",
        "body": """<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
    <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #0284c7; margin: 0;">Meeting Reminder</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Your scheduled meeting is coming up tomorrow.</p>
    </div>
    <p>Hi <strong>{attendee_name}</strong>,</p>
    <p>This is a friendly reminder for your upcoming meeting <strong>{event_title}</strong> with <strong>{host_name}</strong>.</p>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Date & Time:</strong> {start_time}</p>
        <p style="margin: 4px 0;"><strong>Host:</strong> {host_name} ({host_email})</p>
        <p style="margin: 4px 0;"><strong>Join Link:</strong> <a href="{meeting_url}" style="color: #0284c7; font-weight: bold;">{meeting_url}</a></p>
    </div>
    <p style="color: #94a3b8; font-size: 12px;">Need to reschedule or make changes? Reference code: <code>{cancellation_token}</code></p>
</div>"""
    },
    "meeting_reminder_1h_attendee": {
        "name": "Meeting Reminder - 1 Hour (Attendee)",
        "subject": "Starting in 1 Hour: {event_title} with {host_name}",
        "body": """<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
    <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #0284c7; margin: 0;">Starting in 1 Hour!</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Your meeting begins in 60 minutes.</p>
    </div>
    <p>Hi <strong>{attendee_name}</strong>,</p>
    <p>Your meeting <strong>{event_title}</strong> with <strong>{host_name}</strong> starts in 1 hour.</p>
    <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 8px; margin: 20px 0; text-align: center;">
        <p style="margin: 4px 0 12px 0; font-weight: bold; color: #166534;">{start_time}</p>
        <a href="{meeting_url}" style="display: inline-block; background-color: #0284c7; color: #ffffff; padding: 10px 20px; font-size: 14px; font-weight: bold; text-decoration: none; border-radius: 8px;">Click Here to Join Meeting</a>
    </div>
</div>"""
    },
    "meeting_reminder_15m_host": {
        "name": "Meeting Alert - 15 Minutes (Host Employee)",
        "subject": "Upcoming in 15 mins: {event_title} with {attendee_name}",
        "body": """<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
    <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #059669; margin: 0;">Upcoming Meeting in 15 Mins</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Prepare for your next call.</p>
    </div>
    <p>Hi <strong>{host_name}</strong>,</p>
    <p>You have a meeting with <strong>{attendee_name}</strong> ({attendee_email}) starting in 15 minutes.</p>
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Meeting:</strong> {event_title}</p>
        <p style="margin: 4px 0;"><strong>Start Time:</strong> {start_time}</p>
        <p style="margin: 4px 0;"><strong>Join Link:</strong> <a href="{meeting_url}" style="color: #059669; font-weight: bold;">{meeting_url}</a></p>
    </div>
</div>"""
    },
    "post_meeting_followup_attendee": {
        "name": "Post-Meeting Follow-up (Attendee)",
        "subject": "Thank you for meeting: {event_title}",
        "body": """<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
    <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #0284c7; margin: 0;">Thank You!</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">It was great speaking with you today.</p>
    </div>
    <p>Hi <strong>{attendee_name}</strong>,</p>
    <p>Thank you for taking the time to join <strong>{event_title}</strong> with <strong>{host_name}</strong> today.</p>
    <p>If you have any questions, next steps, or need additional information, feel free to reply directly to this email.</p>
    <p style="color: #64748b; font-size: 13px; margin-top: 24px;">Best regards,<br><strong>{host_name}</strong><br>{host_email}</p>
</div>"""
    }
}


def generate_ics(
    summary: str,
    description: str,
    location: str,
    start_time: datetime,
    end_time: datetime,
    uid: str,
    organizer_email: str,
    attendee_email: str,
    join_url: Optional[str] = None,
) -> str:
    """Generates standard iCalendar (.ics) string for meeting invitations with RFC 7986 / RFC 5545 conference metadata."""
    dt_stamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    dt_start = start_time.strftime("%Y%m%dT%H%M%SZ")
    dt_end = end_time.strftime("%Y%m%dT%H%M%SZ")

    # Determine join_url if not explicitly provided
    resolved_join_url = join_url
    if not resolved_join_url and location and location.startswith("http"):
        resolved_join_url = location

    # Clean location text so calendar clients (Google, Apple, Outlook) don't treat URLs as map pins
    clean_location = location
    if resolved_join_url:
        if "meet.google.com" in resolved_join_url:
            clean_location = "Google Meet"
        elif "zoom.us" in resolved_join_url:
            clean_location = "Zoom Video Call"
        elif "meet.jit.si" in resolved_join_url or "jitsi" in resolved_join_url.lower():
            clean_location = "Jitsi Meet"
        elif "teams.microsoft.com" in resolved_join_url:
            clean_location = "Microsoft Teams"
        elif clean_location.startswith("http"):
            clean_location = "Online Video Call"

    conference_block = ""
    if resolved_join_url:
        conference_block = (
            f"URL:{resolved_join_url}\r\n"
            f"X-GOOGLE-CONFERENCE:{resolved_join_url}\r\n"
            f"CONFERENCE;VALUE=URI;FEATURE=VIDEO:{resolved_join_url}\r\n"
        )

    # Escape newlines for DESCRIPTION in ICS
    escaped_description = description.replace("\r\n", "\\n").replace("\n", "\\n")

    ics_content = (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "PRODID:-//Kavach Infra Solutions//Kavach Connect//EN\r\n"
        "METHOD:REQUEST\r\n"
        "BEGIN:VEVENT\r\n"
        f"UID:{uid}@kavachconnect.infra\r\n"
        f"DTSTAMP:{dt_stamp}\r\n"
        f"DTSTART:{dt_start}\r\n"
        f"DTEND:{dt_end}\r\n"
        f"SUMMARY:{summary}\r\n"
        f"DESCRIPTION:{escaped_description}\r\n"
        f"LOCATION:{clean_location}\r\n"
        f"{conference_block}"
        f"ORGANIZER;CN=Host:mailto:{organizer_email}\r\n"
        f"ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN={attendee_email}:mailto:{attendee_email}\r\n"
        "STATUS:CONFIRMED\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )
    return ics_content


class EmailService:

    @staticmethod
    async def get_rendered_template(template_type: str, context: Dict[str, Any], db: Optional[Any] = None) -> tuple[str, str]:
        subject = ""
        body = ""
        if db is not None:
            try:
                from sqlalchemy import select
                from app.models.notification import NotificationTemplate
                stmt = select(NotificationTemplate).where(NotificationTemplate.type == template_type)
                res = await db.execute(stmt)
                tmpl = res.scalar_one_or_none()
                if tmpl:
                    subject = tmpl.subject
                    body = tmpl.body
            except Exception as e:
                logger.warning(f"Error reading notification template {template_type}: {e}")

        if not subject or not body:
            default = SYSTEM_DEFAULT_TEMPLATES.get(template_type)
            if default:
                subject = default["subject"]
                body = default["body"]
            else:
                subject = "Meeting Notification"
                body = "<p>You have a new meeting notification.</p>"

        for k, v in context.items():
            subject = subject.replace(f"{{{k}}}", str(v if v is not None else ""))
            body = body.replace(f"{{{k}}}", str(v if v is not None else ""))

        return subject, body

    @staticmethod
    async def send_email(
        recipient_email: str,
        subject: str,
        html_body: str,
        text_body: Optional[str] = None,
        ics_content: Optional[str] = None
    ) -> bool:
        """
        Dual-provider email sender:
        1. Brevo API (if BREVO_API_KEY configured)
        2. SMTP fallback (if SMTP_HOST configured)
        3. Console log fallback (dev mode safe default)
        """
        text_body = text_body or html_body

        # 1. Try Brevo API
        if settings.BREVO_API_KEY:
            try:
                headers = {
                    "api-key": settings.BREVO_API_KEY,
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                }
                payload: Dict[str, Any] = {
                    "sender": {"email": settings.EMAIL_FROM, "name": "Kavach Connect"},
                    "to": [{"email": recipient_email}],
                    "subject": subject,
                    "htmlContent": html_body,
                    "textContent": text_body,
                }
                if ics_content:
                    import base64
                    payload["attachment"] = [{
                        "name": "invite.ics",
                        "content": base64.b64encode(ics_content.encode()).decode()
                    }]

                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post("https://api.brevo.com/v3/smtp/email", headers=headers, json=payload)
                    if resp.status_code in (200, 201):
                        logger.info(f"Email sent via Brevo to {recipient_email}")
                        return True
                    else:
                        logger.warning(f"Brevo send failed with status {resp.status_code}: {resp.text}")
            except Exception as e:
                logger.warning(f"Brevo API error: {e}, attempting SMTP fallback")

        # 2. Try SMTP fallback
        if settings.SMTP_HOST:
            try:
                msg = MIMEMultipart("mixed")
                msg["From"] = settings.EMAIL_FROM
                msg["To"] = recipient_email
                msg["Subject"] = subject

                part_html = MIMEText(html_body, "html")
                msg.attach(part_html)

                if ics_content:
                    part_ics = MIMEBase("text", "calendar", method="REQUEST", name="invite.ics")
                    part_ics.set_payload(ics_content.encode())
                    encoders.encode_base64(part_ics)
                    part_ics.add_header("Content-Disposition", 'attachment; filename="invite.ics"')
                    msg.attach(part_ics)

                with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                    server.starttls()
                    if settings.SMTP_USER and settings.SMTP_PASSWORD:
                        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                    server.send_message(msg)
                logger.info(f"Email sent via SMTP to {recipient_email}")
                return True
            except Exception as e:
                logger.warning(f"SMTP error: {e}")

        # 3. Dev Fallback: structured log
        logger.info(
            f"\n--- [DEV EMAIL DISPATCH] ---\n"
            f"To: {recipient_email}\n"
            f"Subject: {subject}\n"
            f"Content: {text_body}\n"
            f"----------------------------"
        )
        return True

    @staticmethod
    async def send_booking_confirmation(
        booking: Any,
        invitee: Any,
        event_type: Any,
        employee: Any,
        db: Optional[Any] = None,
    ):
        is_external = getattr(booking, "event_type_id", None) is not None or event_type is not None
        event_title = "Meeting with Kavach" if is_external else (getattr(booking, "title", None) or (event_type.title if event_type else "Meeting"))
        start_fmt = booking.start_time.strftime("%A, %B %d, %Y at %I:%M %p UTC")
        join_url = booking.meeting_join_url or ""
        is_gmeet = "meet.google.com" in join_url

        desc_lines = []
        if join_url.startswith("http"):
            label = "GOOGLE MEET VIDEO CALL" if is_gmeet else "VIDEO CALL"
            desc_lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            desc_lines.append(f"📹 {label}")
            desc_lines.append(f"Join link: {join_url}")
            desc_lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            desc_lines.append("")
        elif booking.meeting_provider == "phone":
            desc_lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            desc_lines.append("📞 PHONE CALL")
            desc_lines.append(f"Instructions: {join_url or 'Host will call Attendee'}")
            desc_lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            desc_lines.append("")
        elif booking.meeting_provider == "in_person":
            desc_lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            desc_lines.append("🏢 IN-PERSON MEETING")
            desc_lines.append(f"Venue / Address: {join_url or 'Office location specified by host'}")
            desc_lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            desc_lines.append("")
        desc_lines.append("Meeting booked via Kavach Connect.")
        desc_lines.append(f"Host: {employee.name} ({employee.email})")
        desc_lines.append(f"Attendee: {invitee.name} ({invitee.email})")
        full_desc = "\n".join(desc_lines)

        if is_gmeet:
            ics_loc = "Google Meet"
        elif booking.meeting_provider == "phone":
            ics_loc = "Phone Call"
        elif booking.meeting_provider == "in_person":
            ics_loc = join_url or "In-Person Meeting"
        else:
            ics_loc = join_url or "Online"

        ics_summary = "Meeting with Kavach" if is_external else f"{event_title} with {employee.name}"
        ics = generate_ics(
            summary=ics_summary,
            description=full_desc,
            location=ics_loc,
            start_time=booking.start_time,
            end_time=booking.end_time,
            uid=str(booking.id),
            organizer_email=employee.email,
            attendee_email=invitee.email,
            join_url=join_url if join_url.startswith("http") else None,
        )

        ctx = {
            "event_title": event_title,
            "attendee_name": invitee.name,
            "attendee_email": invitee.email,
            "host_name": employee.name,
            "host_email": employee.email,
            "start_time": start_fmt,
            "end_time": booking.end_time.strftime("%A, %B %d, %Y at %I:%M %p UTC"),
            "meeting_url": join_url,
            "cancellation_token": getattr(invitee, "cancellation_token", ""),
        }

        subj_a, body_a = await EmailService.get_rendered_template("booking_confirmation_attendee", ctx, db)
        await EmailService.send_email(
            recipient_email=invitee.email,
            subject=subj_a,
            html_body=body_a,
            ics_content=ics
        )

        subj_h, body_h = await EmailService.get_rendered_template("booking_confirmation_host", ctx, db)
        await EmailService.send_email(
            recipient_email=employee.email,
            subject=subj_h,
            html_body=body_h,
            ics_content=ics
        )

    @staticmethod
    async def send_reschedule_notification(
        old_booking: Any,
        new_booking: Any,
        invitee: Any,
        event_type: Any,
        employee: Any,
        reason: Optional[str] = None,
        rescheduled_by: str = "Host",
        db: Optional[Any] = None,
    ) -> None:
        is_external = getattr(new_booking, "event_type_id", None) is not None or event_type is not None
        event_title = "Meeting with Kavach" if is_external else (getattr(new_booking, "title", None) or (event_type.title if event_type else "Meeting"))
        join_url = new_booking.meeting_join_url or ""
        is_gmeet = "meet.google.com" in join_url
        old_fmt = old_booking.start_time.strftime("%A, %B %d, %Y at %I:%M %p UTC")
        new_fmt = new_booking.start_time.strftime("%A, %B %d, %Y at %I:%M %p UTC")

        desc_lines = []
        if join_url.startswith("http"):
            label = "GOOGLE MEET VIDEO CALL" if is_gmeet else "VIDEO CALL"
            desc_lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            desc_lines.append(f"📹 {label}")
            desc_lines.append(f"Join link: {join_url}")
            desc_lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            desc_lines.append("")
        elif new_booking.meeting_provider == "phone":
            desc_lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            desc_lines.append("📞 PHONE CALL")
            desc_lines.append(f"Instructions: {join_url or 'Host will call Attendee'}")
            desc_lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            desc_lines.append("")
        elif new_booking.meeting_provider == "in_person":
            desc_lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            desc_lines.append("🏢 IN-PERSON MEETING")
            desc_lines.append(f"Venue / Address: {join_url or 'Office location specified by host'}")
            desc_lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            desc_lines.append("")
        desc_lines.append("Rescheduled via Kavach Connect.")
        desc_lines.append(f"Reason: {reason or 'None'}")
        desc_lines.append(f"Host: {employee.name} ({employee.email})")
        desc_lines.append(f"Attendee: {invitee.name} ({invitee.email})")
        full_desc = "\n".join(desc_lines)

        if is_gmeet:
            ics_loc = "Google Meet"
        elif new_booking.meeting_provider == "phone":
            ics_loc = "Phone Call"
        elif new_booking.meeting_provider == "in_person":
            ics_loc = join_url or "In-Person Meeting"
        else:
            ics_loc = join_url or "Online"

        ics_summary = "Meeting with Kavach" if is_external else f"{event_title} with {employee.name}"
        ics = generate_ics(
            summary=ics_summary,
            description=full_desc,
            location=ics_loc,
            start_time=new_booking.start_time,
            end_time=new_booking.end_time,
            uid=str(new_booking.id),
            organizer_email=employee.email,
            attendee_email=invitee.email,
            join_url=join_url if join_url.startswith("http") else None,
        )

        ctx = {
            "event_title": event_title,
            "attendee_name": invitee.name,
            "attendee_email": invitee.email,
            "host_name": employee.name,
            "host_email": employee.email,
            "old_start_time": old_fmt,
            "new_start_time": new_fmt,
            "start_time": new_fmt,
            "meeting_url": join_url,
            "reason": reason or "No specific reason provided.",
            "cancellation_token": getattr(invitee, "cancellation_token", ""),
        }

        subj_a, body_a = await EmailService.get_rendered_template("booking_rescheduled_attendee", ctx, db)
        await EmailService.send_email(
            recipient_email=invitee.email,
            subject=subj_a,
            html_body=body_a,
            ics_content=ics
        )

        subj_h, body_h = await EmailService.get_rendered_template("booking_rescheduled_host", ctx, db)
        await EmailService.send_email(
            recipient_email=employee.email,
            subject=subj_h,
            html_body=body_h,
            ics_content=ics
        )

    @staticmethod
    async def send_cancellation_notification(
        booking: Any,
        invitee: Any,
        event_type: Any,
        employee: Any,
        reason: Optional[str] = None,
        cancelled_by: str = "Host",
        db: Optional[Any] = None,
    ) -> None:
        is_external = getattr(booking, "event_type_id", None) is not None or event_type is not None
        event_title = "Meeting with Kavach" if is_external else (getattr(booking, "title", None) or (event_type.title if event_type else "Meeting"))
        start_fmt = booking.start_time.strftime("%A, %B %d, %Y at %I:%M %p UTC")

        ctx = {
            "event_title": event_title,
            "attendee_name": invitee.name,
            "attendee_email": invitee.email,
            "host_name": employee.name,
            "host_email": employee.email,
            "start_time": start_fmt,
            "reason": reason or "No specific reason provided.",
            "cancelled_by": cancelled_by,
        }

        subj_a, body_a = await EmailService.get_rendered_template("booking_cancelled_attendee", ctx, db)
        await EmailService.send_email(
            recipient_email=invitee.email,
            subject=subj_a,
            html_body=body_a,
        )

        subj_h, body_h = await EmailService.get_rendered_template("booking_cancelled_host", ctx, db)
        await EmailService.send_email(
            recipient_email=employee.email,
            subject=subj_h,
            html_body=body_h,
        )

    @staticmethod
    async def send_internal_meeting_invite(
        booking: Any,
        attendee_name: str,
        attendee_email: str,
        employee: Any,
        notes: Optional[str] = None,
        db: Optional[Any] = None,
    ) -> None:
        event_title = getattr(booking, "title", None) or "Internal Team Meeting"
        start_fmt = booking.start_time.strftime("%A, %B %d, %Y at %I:%M %p UTC")
        join_url = booking.meeting_join_url or ""
        is_gmeet = "meet.google.com" in join_url

        desc_lines = []
        if join_url.startswith("http"):
            label = "GOOGLE MEET VIDEO CALL" if is_gmeet else "VIDEO CALL"
            desc_lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            desc_lines.append(f"📹 {label}")
            desc_lines.append(f"Join link: {join_url}")
            desc_lines.append("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            desc_lines.append("")
        desc_lines.append(f"Internal meeting organized by {employee.name}.")
        if notes:
            desc_lines.append(f"Agenda/Notes: {notes}")
        full_desc = "\n".join(desc_lines)

        ics = generate_ics(
            summary=f"{event_title} (Internal)",
            description=full_desc,
            location="Google Meet" if is_gmeet else (join_url or "Online"),
            start_time=booking.start_time,
            end_time=booking.end_time,
            uid=str(booking.id),
            organizer_email=employee.email,
            attendee_email=attendee_email,
            join_url=join_url if join_url.startswith("http") else None,
        )

        agenda_block = f"<p style='margin: 4px 0;'><strong>Agenda / Notes:</strong> {notes}</p>" if notes else ""

        ctx = {
            "event_title": event_title,
            "attendee_name": attendee_name,
            "attendee_email": attendee_email,
            "host_name": employee.name,
            "host_email": employee.email,
            "start_time": start_fmt,
            "end_time": booking.end_time.strftime("%A, %B %d, %Y at %I:%M %p UTC"),
            "meeting_url": join_url,
            "agenda_block": agenda_block,
        }

        subj, body = await EmailService.get_rendered_template("internal_meeting_invite", ctx, db)
        await EmailService.send_email(
            recipient_email=attendee_email,
            subject=subj,
            html_body=body,
            ics_content=ics
        )

    @staticmethod
    async def send_meeting_reminder(
        booking: Any,
        recipient_email: str,
        recipient_name: str,
        recipient_role: str,  # "attendee" | "host"
        event_title: str,
        employee: Any,
        time_until_str: str,
        template_type: str,
        db: Optional[Any] = None,
    ) -> None:
        join_url = booking.meeting_join_url or ""
        is_external = getattr(booking, "event_type_id", None) is not None
        display_title = "Meeting with Kavach" if (is_external and recipient_role == "attendee") else event_title
        invitee = booking.invitees[0] if getattr(booking, "invitees", None) and len(booking.invitees) > 0 else None

        ctx = {
            "event_title": display_title,
            "attendee_name": recipient_name if recipient_role == "attendee" else (invitee.name if invitee else "Guest"),
            "attendee_email": recipient_email if recipient_role == "attendee" else (invitee.email if invitee else ""),
            "host_name": employee.name,
            "host_email": employee.email,
            "start_time": booking.start_time.strftime("%A, %B %d, %Y at %I:%M %p UTC"),
            "end_time": booking.end_time.strftime("%A, %B %d, %Y at %I:%M %p UTC"),
            "meeting_url": join_url,
            "time_until": time_until_str,
            "cancellation_token": getattr(invitee, "cancellation_token", "") if invitee else "",
        }

        subj, body = await EmailService.get_rendered_template(template_type, ctx, db)
        await EmailService.send_email(
            recipient_email=recipient_email,
            subject=subj,
            html_body=body,
        )

    @staticmethod
    async def send_meeting_followup(
        booking: Any,
        recipient_email: str,
        recipient_name: str,
        event_title: str,
        employee: Any,
        template_type: str = "post_meeting_followup_attendee",
        db: Optional[Any] = None,
    ) -> None:
        is_external = getattr(booking, "event_type_id", None) is not None
        display_title = "Meeting with Kavach" if is_external else event_title

        ctx = {
            "event_title": display_title,
            "attendee_name": recipient_name,
            "attendee_email": recipient_email,
            "host_name": employee.name,
            "host_email": employee.email,
            "start_time": booking.start_time.strftime("%A, %B %d, %Y at %I:%M %p UTC"),
            "end_time": booking.end_time.strftime("%A, %B %d, %Y at %I:%M %p UTC"),
            "meeting_url": booking.meeting_join_url or "",
        }

        subj, body = await EmailService.get_rendered_template(template_type, ctx, db)
        await EmailService.send_email(
            recipient_email=recipient_email,
            subject=subj,
            html_body=body,
        )


email_service = EmailService()
