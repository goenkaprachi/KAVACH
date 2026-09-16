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


def generate_ics(
    summary: str,
    description: str,
    location: str,
    start_time: datetime,
    end_time: datetime,
    uid: str,
    organizer_email: str,
    attendee_email: str
) -> str:
    """Generates standard iCalendar (.ics) string for meeting invitations."""
    dt_stamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    dt_start = start_time.strftime("%Y%m%dT%H%M%SZ")
    dt_end = end_time.strftime("%Y%m%dT%H%M%SZ")

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
        f"DESCRIPTION:{description}\r\n"
        f"LOCATION:{location}\r\n"
        f"ORGANIZER;CN=Host:mailto:{organizer_email}\r\n"
        f"ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN={attendee_email}:mailto:{attendee_email}\r\n"
        "STATUS:CONFIRMED\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )
    return ics_content


class EmailService:

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
        employee: Any
    ):
        start_fmt = booking.start_time.strftime("%A, %B %d, %Y at %I:%M %p UTC")
        join_url = booking.meeting_join_url or "Link will be shared"

        ics = generate_ics(
            summary=f"{event_type.title} with {employee.name}",
            description=f"Meeting booked via Kavach Connect.\nJoin link: {join_url}",
            location=join_url,
            start_time=booking.start_time,
            end_time=booking.end_time,
            uid=str(booking.id),
            organizer_email=employee.email,
            attendee_email=invitee.email
        )

        # Invitee confirmation
        invitee_html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #2563eb;">Meeting Confirmed!</h2>
            <p>Hi {invitee.name},</p>
            <p>Your meeting <strong>{event_type.title}</strong> with <strong>{employee.name}</strong> is scheduled.</p>
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0;">
                <p><strong>Time:</strong> {start_fmt}</p>
                <p><strong>Join Meeting:</strong> <a href="{join_url}">{join_url}</a></p>
            </div>
            <p style="color: #64748b; font-size: 13px;">To cancel or reschedule, use your unique cancellation token: {invitee.cancellation_token}</p>
        </div>
        """
        await EmailService.send_email(
            recipient_email=invitee.email,
            subject=f"Confirmed: {event_type.title} with {employee.name}",
            html_body=invitee_html,
            ics_content=ics
        )

        # Host notification
        host_html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #059669;">New Booking Received</h2>
            <p>Hi {employee.name},</p>
            <p><strong>{invitee.name}</strong> ({invitee.email}) has booked <strong>{event_type.title}</strong> with you.</p>
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0;">
                <p><strong>Time:</strong> {start_fmt}</p>
                <p><strong>Join Meeting:</strong> <a href="{join_url}">{join_url}</a></p>
            </div>
        </div>
        """
        await EmailService.send_email(
            recipient_email=employee.email,
            subject=f"New Meeting: {invitee.name} booked {event_type.title}",
            html_body=host_html,
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
    ) -> None:
        """Sends reschedule notification with new time, stated reason, and updated ICS calendar file."""
        ics = EmailService.generate_ics(
            booking_id=new_booking.id,
            title=event_type.title,
            start_time=new_booking.start_time,
            end_time=new_booking.end_time,
            meeting_url=new_booking.meeting_join_url,
            host_name=employee.name,
            host_email=employee.email,
            invitee_name=invitee.name,
            invitee_email=invitee.email,
        )

        old_fmt = old_booking.start_time.strftime("%A, %B %d, %Y at %I:%M %p UTC")
        new_fmt = new_booking.start_time.strftime("%A, %B %d, %Y at %I:%M %p UTC")
        join_url = new_booking.meeting_join_url or "Online"
        reason_text = reason or "No specific reason provided."

        invitee_html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #2563eb;">Meeting Rescheduled</h2>
            <p>Hi {invitee.name},</p>
            <p>Your meeting <strong>{event_type.title}</strong> with {employee.name} has been rescheduled by the {rescheduled_by}.</p>
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0;">
                <p><strong>Reason for Rescheduling:</strong> {reason_text}</p>
                <p><strong>Original Time:</strong> <span style="text-decoration: line-through; color: #94a3b8;">{old_fmt}</span></p>
                <p><strong>New Time:</strong> <span style="color: #16a34a; font-weight: bold;">{new_fmt}</span></p>
                <p><strong>Join Meeting:</strong> <a href="{join_url}">{join_url}</a></p>
            </div>
            <p style="color: #64748b; font-size: 13px;">To cancel or modify, use your cancellation token: {invitee.cancellation_token}</p>
        </div>
        """
        await EmailService.send_email(
            recipient_email=invitee.email,
            subject=f"Rescheduled: {event_type.title} with {employee.name}",
            html_body=invitee_html,
            ics_content=ics
        )

        host_html = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #2563eb;">Meeting Rescheduled</h2>
            <p>Hi {employee.name},</p>
            <p>The meeting <strong>{event_type.title}</strong> with <strong>{invitee.name}</strong> has been rescheduled.</p>
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0;">
                <p><strong>Reason for Rescheduling:</strong> {reason_text}</p>
                <p><strong>Original Time:</strong> <span style="text-decoration: line-through; color: #94a3b8;">{old_fmt}</span></p>
                <p><strong>New Time:</strong> <span style="color: #16a34a; font-weight: bold;">{new_fmt}</span></p>
                <p><strong>Join Meeting:</strong> <a href="{join_url}">{join_url}</a></p>
            </div>
        </div>
        """
        await EmailService.send_email(
            recipient_email=employee.email,
            subject=f"Rescheduled: {event_type.title} with {invitee.name}",
            html_body=host_html,
            ics_content=ics
        )


email_service = EmailService()
