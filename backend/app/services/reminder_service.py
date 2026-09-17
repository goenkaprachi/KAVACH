import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional

from sqlalchemy import select, and_, not_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.booking import Booking, Invitee
from app.models.event_type import EventType
from app.models.user import User
from app.models.notification import Workflow, NotificationTemplate, NotificationsLog
from app.services.email_service import EmailService, email_service
from app.schemas.workflow import RunWorkflowsResult

logger = logging.getLogger("kavach_connect.reminder_service")


class ReminderService:

    @staticmethod
    def _format_time_offset(minutes: int) -> str:
        if minutes >= 1440:
            days = minutes // 1440
            return f"in {days} day{'s' if days > 1 else ''}"
        elif minutes >= 60:
            hours = minutes // 60
            return f"in {hours} hour{'s' if hours > 1 else ''}"
        else:
            return f"in {minutes} minutes"

    @staticmethod
    async def process_due_reminders(db: AsyncSession) -> RunWorkflowsResult:
        """
        Scans confirmed bookings and matches them against active workflows.
        Guarantees idempotency via notifications_log.
        """
        now = datetime.now(timezone.utc)
        result = RunWorkflowsResult(processed_count=0, sent_count=0, failed_count=0, details=[])

        # 1. Load all active workflows
        wf_stmt = select(Workflow).where(Workflow.is_active == True)
        wf_res = await db.execute(wf_stmt)
        active_workflows = wf_res.scalars().all()

        if not active_workflows:
            logger.debug("No active workflows configured.")
            return result

        # 2. Iterate through workflows
        for wf in active_workflows:
            try:
                # Query confirmed bookings
                # If workflow is scoped to a specific event_type_id, filter by it
                booking_query = (
                    select(Booking)
                    .options(selectinload(Booking.invitees), selectinload(Booking.employee))
                    .where(Booking.status == "confirmed")
                )
                if wf.event_type_id:
                    booking_query = booking_query.where(Booking.event_type_id == wf.event_type_id)

                if wf.trigger_type == "before_event":
                    # Booking must be in the future
                    # Target trigger is (start_time - offset_minutes)
                    # We check if target trigger is reached (now >= target)
                    # and booking hasn't started yet (booking.start_time > now)
                    target_time = now + timedelta(minutes=wf.offset_minutes)
                    # Tolerance window: look for bookings where start_time <= now + offset + buffer
                    # and start_time >= now + offset - buffer
                    tolerance_minutes = max(30, wf.offset_minutes // 4)
                    booking_query = booking_query.where(
                        and_(
                            Booking.start_time > now,
                            Booking.start_time <= target_time + timedelta(minutes=15),
                            Booking.start_time >= now + timedelta(minutes=wf.offset_minutes - tolerance_minutes),
                        )
                    )
                elif wf.trigger_type == "after_event":
                    # Booking must have finished
                    target_time = now - timedelta(minutes=wf.offset_minutes)
                    booking_query = booking_query.where(
                        and_(
                            Booking.end_time < now,
                            Booking.end_time >= target_time - timedelta(hours=6),
                            Booking.end_time <= target_time + timedelta(minutes=30),
                        )
                    )
                else:
                    # other triggers (e.g. on_creation) handled at booking time
                    continue

                b_res = await db.execute(booking_query)
                eligible_bookings = b_res.scalars().all()

                for booking in eligible_bookings:
                    result.processed_count += 1

                    # 3. Check if notification was already sent for this booking and workflow
                    log_stmt = select(NotificationsLog).where(
                        and_(
                            NotificationsLog.booking_id == booking.id,
                            NotificationsLog.workflow_id == wf.id,
                            NotificationsLog.status == "sent",
                        )
                    )
                    log_res = await db.execute(log_stmt)
                    if log_res.scalar_one_or_none():
                        # Already sent, skip
                        continue

                    # 4. Resolve template and recipients
                    employee = booking.employee
                    if not employee:
                        continue

                    event_title = booking.title or "Meeting"
                    time_until_str = ReminderService._format_time_offset(wf.offset_minutes)

                    # Determine template type
                    if wf.trigger_type == "after_event":
                        template_type = "post_meeting_followup_attendee"
                    else:
                        if wf.action_type == "email_host":
                            template_type = "meeting_reminder_15m_host"
                        elif wf.offset_minutes <= 120:
                            template_type = "meeting_reminder_1h_attendee"
                        else:
                            template_type = "meeting_reminder_24h_attendee"

                    recipients = []
                    if wf.action_type in ("email_attendee", "email", "email_both"):
                        for inv in (booking.invitees or []):
                            recipients.append({
                                "email": inv.email,
                                "name": inv.name,
                                "role": "attendee",
                            })

                    if wf.action_type in ("email_host", "email_both"):
                        recipients.append({
                            "email": employee.email,
                            "name": employee.name,
                            "role": "host",
                        })

                    # Dispatch to recipients
                    for recip in recipients:
                        try:
                            if wf.trigger_type == "after_event":
                                await EmailService.send_meeting_followup(
                                    booking=booking,
                                    recipient_email=recip["email"],
                                    recipient_name=recip["name"],
                                    event_title=event_title,
                                    employee=employee,
                                    template_type=template_type,
                                    db=db,
                                )
                            else:
                                await EmailService.send_meeting_reminder(
                                    booking=booking,
                                    recipient_email=recip["email"],
                                    recipient_name=recip["name"],
                                    recipient_role=recip["role"],
                                    event_title=event_title,
                                    employee=employee,
                                    time_until_str=time_until_str,
                                    template_type=template_type,
                                    db=db,
                                )

                            # Record in notifications log
                            log_entry = NotificationsLog(
                                booking_id=booking.id,
                                workflow_id=wf.id,
                                channel="email",
                                status="sent",
                                sent_at=datetime.now(timezone.utc),
                            )
                            db.add(log_entry)
                            await db.commit()

                            result.sent_count += 1
                            result.details.append(
                                f"Sent workflow '{wf.name}' to {recip['email']} for booking {booking.id}"
                            )
                            logger.info(f"Dispatched reminder '{wf.name}' to {recip['email']}")
                        except Exception as send_err:
                            logger.error(f"Error sending reminder to {recip['email']}: {send_err}")
                            result.failed_count += 1
                            result.details.append(
                                f"Failed sending to {recip['email']}: {str(send_err)}"
                            )
                            # Record failed attempt
                            log_entry = NotificationsLog(
                                booking_id=booking.id,
                                workflow_id=wf.id,
                                channel="email",
                                status="failed",
                                sent_at=None,
                            )
                            db.add(log_entry)
                            await db.commit()

            except Exception as wf_err:
                logger.error(f"Error processing workflow {wf.id} ({wf.name}): {wf_err}")

        return result

    @staticmethod
    async def send_test_workflow(
        workflow: Workflow,
        recipient_email: str,
        current_user: User,
        db: AsyncSession,
    ) -> None:
        """Sends a mock/preview test email for a workflow to verify copy and rendering."""
        # Find any recent booking or construct mock context
        stmt = (
            select(Booking)
            .options(selectinload(Booking.invitees), selectinload(Booking.employee))
            .where(Booking.employee_id == current_user.id)
            .order_by(Booking.start_time.desc())
            .limit(1)
        )
        res = await db.execute(stmt)
        sample_booking = res.scalar_one_or_none()

        time_until_str = ReminderService._format_time_offset(workflow.offset_minutes)

        if workflow.trigger_type == "after_event":
            template_type = "post_meeting_followup_attendee"
        elif workflow.action_type == "email_host":
            template_type = "meeting_reminder_15m_host"
        elif workflow.offset_minutes <= 120:
            template_type = "meeting_reminder_1h_attendee"
        else:
            template_type = "meeting_reminder_24h_attendee"

        if sample_booking:
            await EmailService.send_meeting_reminder(
                booking=sample_booking,
                recipient_email=recipient_email,
                recipient_name=current_user.name,
                recipient_role="attendee" if workflow.action_type != "email_host" else "host",
                event_title=sample_booking.title or "Meeting",
                employee=current_user,
                time_until_str=time_until_str,
                template_type=template_type,
                db=db,
            )
        else:
            # Synthetic context test
            ctx = {
                "event_title": "Product Consultation Demo",
                "attendee_name": "Valued Client",
                "attendee_email": recipient_email,
                "host_name": current_user.name,
                "host_email": current_user.email,
                "start_time": (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%A, %B %d, %Y at %I:%M %p UTC"),
                "end_time": (datetime.now(timezone.utc) + timedelta(days=1, minutes=30)).strftime("%A, %B %d, %Y at %I:%M %p UTC"),
                "meeting_url": "https://meet.google.com/test-sample-room",
                "time_until": time_until_str,
                "cancellation_token": "demo-token-123",
            }
            subj, body = await EmailService.get_rendered_template(template_type, ctx, db)
            await email_service.send_email(
                recipient_email=recipient_email,
                subject=f"[PREVIEW] {subj}",
                html_body=body,
            )


reminder_service = ReminderService()
