import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_, or_, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

from app.core.database import get_db
from app.models.user import User
from app.models.event_type import EventType
from app.models.booking import Booking, Invitee
from app.models.notification import AuditLog
from app.schemas.booking import (
    BookingCreateRequest,
    InternalBookingCreateRequest,
    BookingResponse,
    BookingAuditLogItem,
    InviteeResponse,
    CancelBookingRequest,
    RescheduleBookingRequest,
    UpdateBookingOutcomeRequest,
    UpdateFollowupStatusRequest,
    UpdateInviteeRequest,
)
from app.api.deps import get_current_user, require_employee
from app.services.availability_engine import AvailabilityEngine
from app.services.meeting_provider_hub import meeting_hub
from app.services.email_service import email_service

router = APIRouter(prefix="/bookings", tags=["Bookings"])


def build_booking_response(
    b: Booking,
    invitees: Optional[List[Invitee]] = None,
    event_type_title: Optional[str] = None,
    event_type_slug: Optional[str] = None,
    employee_name: Optional[str] = None,
    employee_username: Optional[str] = None,
    employee_email: Optional[str] = None,
) -> BookingResponse:
    inv_list: List[InviteeResponse] = []
    if invitees is not None:
        for i in invitees:
            inv_list.append(InviteeResponse(
                id=i.id,
                name=i.name,
                email=i.email,
                timezone=i.timezone,
                custom_answers=i.custom_answers or {},
                cancellation_token=i.cancellation_token,
            ))

    if b.event_type_id is not None:
        display_title = "Meeting with Kavach"
        meeting_title = "Meeting with Kavach"
    else:
        display_title = getattr(b, "title", None) or event_type_title or "Internal Meeting"
        meeting_title = getattr(b, "title", None)

    emp_email = employee_email or (b.employee.email if getattr(b, "employee", None) else None)

    return BookingResponse(
        id=b.id,
        booking_reference=b.booking_reference,
        event_type_id=b.event_type_id,
        title=meeting_title,
        employee_id=b.employee_id,
        start_time=b.start_time,
        end_time=b.end_time,
        status=b.status,
        meeting_provider=b.meeting_provider,
        meeting_join_url=b.meeting_join_url,
        meeting_host_url=b.meeting_host_url,
        external_meeting_ref=b.external_meeting_ref,
        cancellation_reason=b.cancellation_reason,
        cancelled_by=b.cancelled_by,
        rescheduled_from_id=b.rescheduled_from_id,
        is_rescheduled=getattr(b, "is_rescheduled", False) or (b.rescheduled_from_id is not None),
        meeting_outcome=getattr(b, "meeting_outcome", None),
        meeting_notes=getattr(b, "meeting_notes", None),
        followup_required=bool(getattr(b, "followup_required", False)),
        followup_date=getattr(b, "followup_date", None),
        followup_notes=getattr(b, "followup_notes", None),
        followup_status=getattr(b, "followup_status", "pending") or "pending",
        followup_priority=getattr(b, "followup_priority", "medium") or "medium",
        outcome_updated_at=getattr(b, "outcome_updated_at", None),
        created_at=b.created_at,
        updated_at=b.updated_at,
        event_type_title=display_title,
        event_type_slug=event_type_slug,
        employee_name=employee_name or (b.employee.name if getattr(b, "employee", None) else None),
        employee_username=employee_username or (b.employee.username if getattr(b, "employee", None) else None),
        employee_email=emp_email,
        invitees=inv_list,
    )


@router.post("", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
async def create_booking(
    req: BookingCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    # 1. Load Event Type and Host Employee
    et_stmt = select(EventType).where(
        EventType.id == req.event_type_id,
        EventType.is_active == True
    ).options(selectinload(EventType.owner))
    et_res = await db.execute(et_stmt)
    event_type = et_res.scalar_one_or_none()

    if not event_type or not event_type.owner or event_type.owner.status != "active":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event type or host is unavailable")

    employee = event_type.owner

    # 1b. Enforce any admin-configured required intake fields. Name and Email
    # are core fields collected via invitee_name/invitee_email, not
    # custom_answers, so they're excluded here (mirrors the frontend's
    # answerFields filter in PublicBookingPage.tsx).
    core_labels = {"name", "email", "email id"}
    custom_answers = req.custom_answers or {}
    for question in event_type.custom_questions or []:
        if not isinstance(question, dict) or not question.get("required"):
            continue
        label = question.get("label") or question.get("name") or ""
        if label.strip().lower() in core_labels:
            continue
        if label and not str(custom_answers.get(label, "")).strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f'"{label}" is required to schedule this meeting.',
            )

    slot_start_utc = req.start_time.astimezone(timezone.utc)
    slot_end_utc = slot_start_utc + timedelta(minutes=event_type.duration_minutes)

    # 2. Scheduling Limits & Advance Notice Checks
    now_utc = datetime.now(timezone.utc)
    if event_type.min_notice_minutes and event_type.min_notice_minutes > 0:
        min_notice_threshold = now_utc + timedelta(minutes=event_type.min_notice_minutes)
        if slot_start_utc < min_notice_threshold:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"This meeting requires at least {event_type.min_notice_minutes} minutes advance notice.",
            )

    if event_type.max_days_in_advance and event_type.max_days_in_advance > 0:
        max_advance_threshold = now_utc + timedelta(days=event_type.max_days_in_advance)
        if slot_start_utc > max_advance_threshold:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Bookings cannot be scheduled more than {event_type.max_days_in_advance} days in advance.",
            )

    try:
        inv_tz = ZoneInfo(req.invitee_timezone)
    except Exception:
        inv_tz = ZoneInfo("UTC")

    target_date = req.start_time.astimezone(inv_tz).date()

    if event_type.max_bookings_per_day and event_type.max_bookings_per_day > 0:
        try:
            emp_tz = ZoneInfo(employee.timezone)
        except Exception:
            emp_tz = ZoneInfo("Asia/Kolkata")
        booking_count = await AvailabilityEngine._count_employee_bookings_on_date(
            session=db,
            employee_id=employee.id,
            target_date=target_date,
            emp_tz=emp_tz,
            event_type_id=event_type.id,
        )
        if booking_count >= event_type.max_bookings_per_day:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Daily booking limit of {event_type.max_bookings_per_day} meeting(s) reached for this event on the selected date.",
            )

    # 2b. Availability Engine pre-check
    available_slots = await AvailabilityEngine.get_available_slots_for_date(
        session=db,
        event_type=event_type,
        employee=employee,
        target_date=target_date,
        invitee_tz_str=req.invitee_timezone,
    )

    is_slot_available = any(
        abs((datetime.fromisoformat(s["start_time"]).astimezone(timezone.utc) - slot_start_utc).total_seconds()) < 60
        for s in available_slots
    )

    if not is_slot_available:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The selected time slot is no longer available. Please select another time.",
        )

    # 2c. Team Distribution Assignment
    b_type = event_type.booking_type or "one_on_one"
    if b_type == "round_robin":
        host_pool = await AvailabilityEngine._resolve_host_pool(db, event_type, employee)
        candidate_hosts = []
        for cand in host_pool:
            cand_slots = await AvailabilityEngine._get_single_host_available_slots(
                session=db,
                event_type=event_type,
                employee=cand,
                target_date=target_date,
                invitee_tz_str=req.invitee_timezone,
            )
            cand_is_free = any(
                abs((datetime.fromisoformat(s["start_time"]).astimezone(timezone.utc) - slot_start_utc).total_seconds()) < 60
                for s in cand_slots
            )
            if cand_is_free:
                candidate_hosts.append(cand)

        if not candidate_hosts:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="No available team members found for the selected time slot.",
            )

        # Load balance: pick candidate host with fewest confirmed bookings
        min_bookings = float("inf")
        selected_host = candidate_hosts[0]
        for cand in candidate_hosts:
            cnt_stmt = select(func.count(Booking.id)).where(Booking.employee_id == cand.id, Booking.status == "confirmed")
            cnt = (await db.execute(cnt_stmt)).scalar() or 0
            if cnt < min_bookings:
                min_bookings = cnt
                selected_host = cand

        employee = selected_host

    elif b_type == "group":
        group_cap = event_type.group_capacity or 10
        grp_cnt_stmt = select(func.count(Booking.id)).where(
            Booking.event_type_id == event_type.id,
            Booking.status == "confirmed",
            Booking.start_time == slot_start_utc,
        )
        existing_grp_count = (await db.execute(grp_cnt_stmt)).scalar() or 0
        if existing_grp_count >= group_cap:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"This group session has reached its maximum capacity of {group_cap} attendees.",
            )

    # 3. Meeting Provider Hub - Resolve requested provider from attendee choice or event type
    requested_provider = req.location_choice or event_type.location_type
    location_detail = event_type.location_detail

    if requested_provider == "attendee_choice":
        if event_type.allowed_locations and len(event_type.allowed_locations) > 0:
            requested_provider = event_type.allowed_locations[0].get("type", "google_meet")
        else:
            requested_provider = "google_meet"

    if event_type.allowed_locations:
        for loc in event_type.allowed_locations:
            if loc.get("type") == requested_provider and loc.get("detail"):
                location_detail = loc.get("detail")
                break

    if requested_provider == "phone":
        answers = req.custom_answers or {}
        phone_val = (
            answers.get("Contact No.")
            or answers.get("Contact no.")
            or answers.get("contact no")
            or answers.get("Phone")
            or answers.get("phone")
            or ""
        )
        if phone_val:
            location_detail = f"Host will call Attendee at {phone_val}" if not location_detail else f"{location_detail} ({phone_val})"

    booking_id = uuid.uuid4()
    meeting_details = await meeting_hub.create_for_booking(
        booking_id=str(booking_id),
        title="Meeting with Kavach",
        start_time=slot_start_utc,
        duration_minutes=event_type.duration_minutes,
        requested_provider=requested_provider,
        location_detail=location_detail,
        host_user=employee,
        db=db,
        attendee_email=req.invitee_email.lower().strip(),
    )

    # Two-Way Google Calendar Sync: If non-Meet booking and host has Google Calendar connected
    if not meeting_details.external_ref and (employee.google_access_token_encrypted or employee.google_refresh_token_encrypted):
        try:
            from app.services.google_calendar_service import google_calendar_service
            cal_desc = f"Scheduled via Kavach Connect.\nInvitee: {req.invitee_name} ({req.invitee_email})\nProvider: {requested_provider}"
            g_cal_id = await google_calendar_service.create_calendar_event(
                user=employee,
                title="Meeting with Kavach",
                start_time=slot_start_utc,
                end_time=slot_end_utc,
                description=cal_desc,
                location=location_detail or requested_provider,
                attendee_email=req.invitee_email.lower().strip(),
                db=db,
            )
            if g_cal_id:
                meeting_details.external_ref = g_cal_id
        except Exception as g_sync_err:
            logger.warning(f"Could not sync booking to Google Calendar: {g_sync_err}")

    # 4. Insert Booking & Invitee in atomic transaction
    new_booking = Booking(
        id=booking_id,
        event_type_id=event_type.id,
        title="Meeting with Kavach",
        employee_id=employee.id,
        start_time=slot_start_utc,
        end_time=slot_end_utc,
        status="confirmed",
        meeting_provider=meeting_details.provider,
        meeting_join_url=meeting_details.join_url,
        meeting_host_url=meeting_details.host_url,
        external_meeting_ref=meeting_details.external_ref,
    )
    db.add(new_booking)
    await db.flush()

    invitee = Invitee(
        booking_id=new_booking.id,
        name=req.invitee_name,
        email=req.invitee_email.lower().strip(),
        timezone=req.invitee_timezone,
        custom_answers=req.custom_answers,
    )
    db.add(invitee)

    # Record creation audit log
    create_log = AuditLog(
        actor_user_id=None,
        action="booking.created",
        entity_type="booking",
        entity_id=new_booking.id,
        metadata_={
            "actor_type": "invitee",
            "actor_name": req.invitee_name,
            "invitee_email": req.invitee_email.lower().strip(),
            "invitee_timezone": req.invitee_timezone,
            "event_type_title": "Meeting with Kavach",
            "meeting_provider": meeting_details.provider,
            "start_time": slot_start_utc.isoformat(),
            "end_time": slot_end_utc.isoformat(),
        },
    )
    db.add(create_log)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This slot was just booked by someone else. Please select another time.",
        )

    # 5. Dispatch confirmation email asynchronously
    try:
        await email_service.send_booking_confirmation(
            booking=new_booking,
            invitee=invitee,
            event_type=event_type,
            employee=employee,
        )
    except Exception:
        pass

    # 5b. Dispatch confirmation SMS/WhatsApp if invitee provided a phone number
    try:
        from app.services.sms_service import send_booking_confirmation_sms, send_host_new_booking_sms
        invitee_phone = (req.custom_answers or {}).get("Contact No.") or (req.custom_answers or {}).get("Phone") or ""
        if invitee_phone:
            _start_str = new_booking.start_time.strftime("%d %b %Y, %I:%M %p UTC")
            asyncio.create_task(asyncio.to_thread(
                send_booking_confirmation_sms,
                to_phone=invitee_phone,
                invitee_name=req.invitee_name,
                event_title=event_type.title,
                host_name=employee.name,
                start_time_str=_start_str,
                meeting_url=new_booking.meeting_join_url or "",
                cancellation_token=new_booking.cancellation_token or "",
                channel="sms",
            ))
        host_phone = getattr(employee, "phone", None) or ""
        if host_phone:
            _start_str = new_booking.start_time.strftime("%d %b %Y, %I:%M %p UTC")
            asyncio.create_task(asyncio.to_thread(
                send_host_new_booking_sms,
                to_phone=host_phone,
                host_name=employee.name,
                invitee_name=req.invitee_name,
                invitee_email=req.invitee_email,
                event_title=event_type.title,
                start_time_str=_start_str,
                channel="sms",
            ))
    except Exception as sms_err:
        logger.debug("SMS notification skipped: %s", sms_err)

    # 6. Dispatch Webhooks asynchronously
    try:
        from app.services.webhook_service import webhook_service
        wh_payload = {
            "booking_id": str(new_booking.id),
            "booking_reference": new_booking.booking_reference,
            "title": new_booking.title,
            "start_time": new_booking.start_time.isoformat(),
            "end_time": new_booking.end_time.isoformat(),
            "status": new_booking.status,
            "meeting_provider": new_booking.meeting_provider,
            "meeting_join_url": new_booking.meeting_join_url,
            "host": {
                "id": str(employee.id),
                "name": employee.name,
                "email": employee.email,
                "username": employee.username,
            },
            "invitee": {
                "name": req.invitee_name,
                "email": req.invitee_email,
                "timezone": req.invitee_timezone,
                "answers": req.custom_answers or {},
            },
        }
        await webhook_service.dispatch_event(
            user_id=employee.id,
            event="booking.created",
            payload=wh_payload,
            db=db,
        )
    except Exception as wh_err:
        logger.warning(f"Failed to dispatch booking.created webhook: {wh_err}")

    return build_booking_response(
        b=new_booking,
        invitees=[invitee],
        event_type_title=event_type.title,
        event_type_slug=event_type.slug,
        employee_name=employee.name,
        employee_username=employee.username,
        employee_email=employee.email,
    )


@router.post("/internal", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
async def create_internal_meeting(
    req: InternalBookingCreateRequest,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    slot_start_utc = req.start_time.astimezone(timezone.utc)
    slot_end_utc = slot_start_utc + timedelta(minutes=req.duration_minutes)

    # 1. Fetch colleague records
    colleagues = []
    if req.colleague_ids:
        c_stmt = select(User).where(User.id.in_(req.colleague_ids))
        c_res = await db.execute(c_stmt)
        colleagues = c_res.scalars().all()

    # 2. Determine provider and generate meeting link
    provider = req.meeting_provider
    if provider == "google_meet" and req.location_detail and "meet.google.com" in req.location_detail:
        if not current_user.google_meet_url:
            current_user.google_meet_url = req.location_detail.strip()

    first_att_email = colleagues[0].email if colleagues else (req.guest_emails[0].lower().strip() if req.guest_emails else None)
    meeting_details = await meeting_hub.create_for_booking(
        booking_id=str(uuid.uuid4()),
        title=req.title,
        start_time=slot_start_utc,
        duration_minutes=req.duration_minutes,
        requested_provider=provider,
        location_detail=req.location_detail,
        host_user=current_user,
        db=db,
        attendee_email=first_att_email,
    )

    # 3. Create booking
    booking = Booking(
        title=req.title,
        employee_id=current_user.id,
        event_type_id=None,
        start_time=slot_start_utc,
        end_time=slot_end_utc,
        status="confirmed",
        meeting_provider=meeting_details.provider,
        meeting_join_url=meeting_details.join_url,
        meeting_host_url=meeting_details.host_url,
        external_meeting_ref=meeting_details.external_ref,
    )
    db.add(booking)
    await db.flush()

    # 4. Add Invitees
    invitees_list: List[Invitee] = []
    for col in colleagues:
        inv = Invitee(
            booking_id=booking.id,
            name=col.name,
            email=col.email,
            timezone=col.timezone or "UTC",
            custom_answers={"Role": "Internal Colleague", "Department": col.department or ""},
        )
        db.add(inv)
        invitees_list.append(inv)

    for g_email in req.guest_emails:
        clean_email = str(g_email).strip().lower()
        if not clean_email or any(i.email == clean_email for i in invitees_list):
            continue
        inv = Invitee(
            booking_id=booking.id,
            name=clean_email.split("@")[0].replace(".", " ").title(),
            email=clean_email,
            timezone=current_user.timezone or "UTC",
            custom_answers={"Role": "External Guest"},
        )
        db.add(inv)
        invitees_list.append(inv)

    await db.flush()

    # 5. Audit Log
    db.add(AuditLog(
        actor_user_id=current_user.id,
        action="booking.created",
        entity_type="booking",
        entity_id=booking.id,
        metadata_={
            "actor_type": "internal_host",
            "actor_name": current_user.name,
            "title": req.title,
            "colleagues_count": len(colleagues),
            "guests_count": len(req.guest_emails),
            "notes": req.notes,
        }
    ))

    await db.commit()
    await db.refresh(booking)

    # 6. Dispatch email invites
    for inv in invitees_list:
        try:
            await email_service.send_internal_meeting_invite(
                booking=booking,
                attendee_name=inv.name,
                attendee_email=inv.email,
                employee=current_user,
                notes=req.notes,
                db=db,
            )
        except Exception as exc:
            pass

    return build_booking_response(
        b=booking,
        invitees=invitees_list,
        event_type_title=req.title,
        employee_name=current_user.name,
        employee_username=current_user.username,
        employee_email=current_user.email,
    )


@router.get("", response_model=List[BookingResponse])
async def list_my_bookings(
    status: Optional[str] = None,
    upcoming: Optional[bool] = None,
    limit: int = Query(default=50, le=200),
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Booking).distinct().outerjoin(Booking.invitees).where(
        or_(
            Booking.employee_id == current_user.id,
            Invitee.email == current_user.email,
        )
    ).options(
        selectinload(Booking.invitees),
        selectinload(Booking.event_type),
        selectinload(Booking.employee),
    )

    if status:
        if status == "rescheduled":
            stmt = stmt.where(or_(Booking.is_rescheduled == True, Booking.rescheduled_from_id.isnot(None)))
        elif status == "confirmed":
            stmt = stmt.where(Booking.status == "confirmed", Booking.is_rescheduled == False, Booking.rescheduled_from_id.is_(None))
        else:
            stmt = stmt.where(Booking.status == status)

    now_utc = datetime.now(timezone.utc)
    if upcoming is True:
        stmt = stmt.where(Booking.start_time >= now_utc).order_by(Booking.start_time.asc())
    elif upcoming is False:
        stmt = stmt.where(Booking.start_time < now_utc).order_by(Booking.start_time.desc())
    else:
        stmt = stmt.order_by(Booking.start_time.desc())

    stmt = stmt.limit(limit)
    res = await db.execute(stmt)
    bookings = res.scalars().all()

    result = []
    for b in bookings:
        result.append(build_booking_response(
            b=b,
            invitees=list(b.invitees) if hasattr(b, "invitees") else [],
            event_type_title=b.event_type.title if b.event_type else None,
            event_type_slug=b.event_type.slug if b.event_type else None,
            employee_name=b.employee.name if b.employee else None,
            employee_username=b.employee.username if b.employee else None,
        ))

    return result


@router.patch("/{booking_id}/cancel", response_model=BookingResponse)
async def cancel_booking(
    booking_id: uuid.UUID,
    req: CancelBookingRequest,
    current_user: Optional[User] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Booking).where(Booking.id == booking_id).options(
        selectinload(Booking.invitees),
        selectinload(Booking.event_type),
        selectinload(Booking.employee),
    )
    res = await db.execute(stmt)
    booking = res.scalar_one_or_none()

    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    cancelled_by = None
    if current_user and (current_user.id == booking.employee_id or current_user.role == "admin"):
        cancelled_by = "employee"
    elif req.cancellation_token:
        inv = next((i for i in booking.invitees if i.cancellation_token == req.cancellation_token), None)
        if not inv:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid cancellation token")
        cancelled_by = "invitee"
    else:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication or cancellation token required")

    booking.status = "cancelled"
    booking.cancellation_reason = req.reason
    booking.cancelled_by = cancelled_by

    # Record cancellation audit log
    cancel_log = AuditLog(
        actor_user_id=current_user.id if current_user else None,
        action="booking.cancelled",
        entity_type="booking",
        entity_id=booking.id,
        metadata_={
            "actor_type": cancelled_by or "user",
            "actor_name": current_user.name if current_user else (booking.invitees[0].name if booking.invitees else "Invitee"),
            "reason": req.reason or "No reason provided",
            "cancelled_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    db.add(cancel_log)

    # Two-way sync: Remove from host's Google Calendar if present
    if booking.external_meeting_ref and booking.employee:
        try:
            from app.services.google_calendar_service import google_calendar_service
            await google_calendar_service.delete_calendar_event(
                user=booking.employee,
                event_id=booking.external_meeting_ref,
                db=db,
            )
        except Exception as g_del_err:
            logger.warning(f"Failed to delete Google Calendar event {booking.external_meeting_ref}: {g_del_err}")

    # Keep references before commit
    saved_invitees = list(booking.invitees)
    event_title = booking.event_type.title if booking.event_type else None
    event_slug = booking.event_type.slug if booking.event_type else None
    employee_name = booking.employee.name if booking.employee else None
    employee_username = booking.employee.username if booking.employee else None

    await db.commit()

    # Dispatch cancellation email notifications
    for inv in saved_invitees:
        try:
            await email_service.send_cancellation_notification(
                booking=booking,
                invitee=inv,
                event_type=booking.event_type,
                employee=booking.employee,
                reason=req.reason,
                cancelled_by=cancelled_by or "Host",
                db=db,
            )
        except Exception:
            pass

    # Dispatch Webhooks for cancellation
    try:
        from app.services.webhook_service import webhook_service
        wh_payload = {
            "booking_id": str(booking.id),
            "booking_reference": booking.booking_reference,
            "status": "cancelled",
            "cancellation_reason": req.reason,
            "cancelled_by": cancelled_by,
            "host_id": str(booking.employee_id),
        }
        await webhook_service.dispatch_event(
            user_id=booking.employee_id,
            event="booking.cancelled",
            payload=wh_payload,
            db=db,
        )
    except Exception as wh_err:
        logger.warning(f"Failed to dispatch booking.cancelled webhook: {wh_err}")

    # Dispatch cancellation SMS to invitees
    try:
        from app.services.sms_service import send_booking_cancellation_sms
        for inv in saved_invitees:
            phone = getattr(inv, "phone", None) or ""
            if phone:
                _start_str = booking.start_time.strftime("%d %b %Y, %I:%M %p UTC")
                asyncio.create_task(asyncio.to_thread(
                    send_booking_cancellation_sms,
                    to_phone=phone,
                    invitee_name=inv.name or "",
                    event_title=event_title or "",
                    host_name=employee_name or "",
                    start_time_str=_start_str,
                    channel="sms",
                ))
    except Exception as sms_err:
        logger.debug("SMS cancellation notification skipped: %s", sms_err)

    return build_booking_response(
        b=booking,
        invitees=saved_invitees,
        event_type_title=event_title,
        event_type_slug=event_slug,
        employee_name=employee_name,
        employee_username=employee_username,
    )


@router.patch("/{booking_id}/reschedule", response_model=BookingResponse)
@router.post("/{booking_id}/reschedule", response_model=BookingResponse)
async def reschedule_booking(
    booking_id: uuid.UUID,
    req: RescheduleBookingRequest,
    current_user: Optional[User] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Booking).where(Booking.id == booking_id).options(
        selectinload(Booking.invitees),
        selectinload(Booking.event_type).selectinload(EventType.owner),
        selectinload(Booking.employee),
    )
    res = await db.execute(stmt)
    old_booking = res.scalar_one_or_none()

    if not old_booking or old_booking.status != "confirmed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking is not active")

    if current_user and (current_user.id == old_booking.employee_id or current_user.role == "admin"):
        actor = "employee"
        actor_name = current_user.name
    elif req.cancellation_token:
        inv = next((i for i in old_booking.invitees if i.cancellation_token == req.cancellation_token), None)
        if not inv:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid token")
        actor = "invitee"
        actor_name = inv.name
    else:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication or token required")

    event_type = old_booking.event_type
    employee = event_type.owner if event_type else old_booking.employee

    old_start_utc = old_booking.start_time
    old_end_utc = old_booking.end_time
    clean_reason = req.reason.strip() if req.reason and req.reason.strip() else None

    # Calculate new slot times
    duration = event_type.duration_minutes if event_type else int((old_end_utc - old_start_utc).total_seconds() / 60)
    new_slot_start_utc = req.new_start_time.astimezone(timezone.utc)
    new_slot_end_utc = new_slot_start_utc + timedelta(minutes=duration)

    att_email = old_booking.invitees[0].email if old_booking.invitees else None
    meeting_title = "Meeting with Kavach" if (old_booking.event_type_id is not None or event_type is not None) else (old_booking.title or "Rescheduled Meeting")
    meeting_details = await meeting_hub.create_for_booking(
        booking_id=str(old_booking.id),
        title=meeting_title,
        start_time=new_slot_start_utc,
        duration_minutes=duration,
        requested_provider=event_type.location_type if event_type else old_booking.meeting_provider,
        location_detail=event_type.location_detail if event_type else None,
        host_user=employee,
        db=db,
        attendee_email=att_email,
    )

    # Maintain single record for the meeting: update old_booking in-place
    if old_booking.event_type_id is not None or event_type is not None:
        old_booking.title = "Meeting with Kavach"
    old_booking.start_time = new_slot_start_utc
    old_booking.end_time = new_slot_end_utc
    old_booking.status = "confirmed"
    old_booking.is_rescheduled = True
    old_booking.meeting_provider = meeting_details.provider
    old_booking.meeting_join_url = meeting_details.join_url
    old_booking.meeting_host_url = meeting_details.host_url
    old_booking.external_meeting_ref = meeting_details.external_ref
    old_booking.cancellation_reason = None
    old_booking.cancelled_by = None

    # Insert audit log for rescheduling
    reschedule_log = AuditLog(
        actor_user_id=current_user.id if current_user else None,
        action="booking.rescheduled",
        entity_type="booking",
        entity_id=old_booking.id,
        metadata_={
            "actor_type": actor,
            "actor_name": actor_name,
            "reason": clean_reason or "Rescheduled to a new time",
            "previous_start_time": old_start_utc.isoformat(),
            "previous_end_time": old_end_utc.isoformat(),
            "new_start_time": new_slot_start_utc.isoformat(),
            "new_end_time": new_slot_end_utc.isoformat(),
        },
    )
    db.add(reschedule_log)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="New slot is conflicting or occupied.")

    # Dispatch reschedule notification email
    if old_booking.invitees:
        try:
            class SnapshotBooking:
                start_time = old_start_utc
                end_time = old_end_utc
            await email_service.send_reschedule_notification(
                old_booking=SnapshotBooking(),
                new_booking=old_booking,
                invitee=old_booking.invitees[0],
                event_type=event_type,
                employee=employee,
                reason=clean_reason,
                rescheduled_by="Host" if actor == "employee" else "Invitee",
            )
        except Exception:
            pass

    return build_booking_response(
        b=old_booking,
        invitees=list(old_booking.invitees) if hasattr(old_booking, "invitees") else [],
        event_type_title=event_type.title if event_type else None,
        event_type_slug=event_type.slug if event_type else None,
        employee_name=employee.name if employee else None,
        employee_username=employee.username if employee else None,
    )


@router.get("/{booking_id}/logs", response_model=List[BookingAuditLogItem])
async def get_booking_audit_logs(
    booking_id: uuid.UUID,
    cancellation_token: Optional[uuid.UUID] = Query(default=None),
    current_user: Optional[User] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Booking).where(Booking.id == booking_id).options(
        selectinload(Booking.invitees),
        selectinload(Booking.event_type),
        selectinload(Booking.employee),
    )
    res = await db.execute(stmt)
    booking = res.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    # Authorization check
    is_allowed = False
    if current_user:
        if current_user.role == "admin" or current_user.id == booking.employee_id:
            is_allowed = True
    if not is_allowed and cancellation_token:
        if any(i.cancellation_token == cancellation_token for i in booking.invitees):
            is_allowed = True

    if not is_allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    # Query audit logs
    log_stmt = select(AuditLog).where(
        AuditLog.entity_type == "booking",
        AuditLog.entity_id == booking_id
    ).order_by(AuditLog.created_at.asc())
    log_res = await db.execute(log_stmt)
    raw_logs = log_res.scalars().all()

    items: List[BookingAuditLogItem] = []
    has_create = False
    has_cancel = False

    for l in raw_logs:
        meta = l.metadata_ or {}
        actor_type = meta.get("actor_type") or meta.get("rescheduled_by") or "system"
        actor_name = meta.get("actor_name")

        if l.action == "booking.created":
            has_create = True
            desc = f"Meeting booked by {actor_name or 'attendee'}"
            if meta.get("event_type_title"):
                desc += f" under {meta.get('event_type_title')}"
        elif l.action == "booking.rescheduled":
            reason = meta.get("reason")
            desc = "Meeting rescheduled to a new time"
            if reason:
                desc += f": {reason}"
        elif l.action == "booking.cancelled":
            has_cancel = True
            reason = meta.get("reason")
            desc = f"Meeting cancelled by {actor_type}"
            if reason:
                desc += f". Reason: {reason}"
        else:
            desc = l.action.replace(".", " ").title()

        items.append(
            BookingAuditLogItem(
                id=l.id,
                action=l.action,
                actor_type=actor_type,
                actor_name=actor_name,
                description=desc,
                metadata=meta,
                created_at=l.created_at,
            )
        )

    # If no creation log in table (for bookings prior to audit logging), synthesize initial log
    if not has_create:
        invitee_name = booking.invitees[0].name if booking.invitees else "Attendee"
        event_title = booking.event_type.title if booking.event_type else "Meeting"
        items.insert(
            0,
            BookingAuditLogItem(
                id=uuid.uuid4(),
                action="booking.created",
                actor_type="invitee",
                actor_name=invitee_name,
                description=f"Meeting scheduled under {event_title}",
                metadata={"start_time": booking.start_time.isoformat()},
                created_at=booking.created_at,
            )
        )

    # If booking is cancelled but no cancellation log exists, synthesize
    if booking.status == "cancelled" and not has_cancel:
        items.append(
            BookingAuditLogItem(
                id=uuid.uuid4(),
                action="booking.cancelled",
                actor_type=booking.cancelled_by or "system",
                actor_name=booking.cancelled_by or "Unknown",
                description=f"Meeting cancelled. Reason: {booking.cancellation_reason or 'No reason provided'}",
                metadata={"reason": booking.cancellation_reason},
                created_at=booking.updated_at or booking.created_at,
            )
        )

    return items


@router.patch("/{booking_id}/outcome", response_model=BookingResponse)
async def update_booking_outcome(
    booking_id: uuid.UUID,
    req: UpdateBookingOutcomeRequest,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """Updates meeting outcome status, free-text meeting notes, and follow-up reminder configurations."""
    stmt = (
        select(Booking)
        .where(Booking.id == booking_id)
        .options(
            selectinload(Booking.event_type),
            selectinload(Booking.employee),
            selectinload(Booking.invitees),
        )
    )
    res = await db.execute(stmt)
    booking = res.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    if booking.employee_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the meeting host or an administrator can update meeting outcomes.",
        )

    booking.meeting_outcome = req.meeting_outcome
    booking.meeting_notes = req.meeting_notes
    booking.followup_required = req.followup_required
    booking.followup_date = req.followup_date
    booking.followup_notes = req.followup_notes
    booking.followup_priority = req.followup_priority or "medium"
    booking.followup_status = req.followup_status or "pending"
    booking.outcome_updated_at = datetime.now(timezone.utc)

    # Log audit entry
    log_entry = AuditLog(
        actor_user_id=current_user.id,
        action="booking.outcome_updated",
        entity_type="booking",
        entity_id=booking.id,
        metadata_={
            "outcome": req.meeting_outcome,
            "followup_required": req.followup_required,
            "followup_date": req.followup_date.isoformat() if req.followup_date else None,
            "followup_priority": req.followup_priority,
            "actor_name": current_user.name,
            "actor_type": "employee",
        },
    )
    db.add(log_entry)

    await db.commit()
    await db.refresh(booking)
    return build_booking_response(
        booking,
        invitees=booking.invitees,
        event_type_title=booking.event_type.title if booking.event_type else None,
        event_type_slug=booking.event_type.slug if booking.event_type else None,
        employee_name=booking.employee.name if booking.employee else None,
        employee_username=booking.employee.username if booking.employee else None,
    )


@router.patch("/{booking_id}/followup-status", response_model=BookingResponse)
async def update_followup_status(
    booking_id: uuid.UUID,
    req: UpdateFollowupStatusRequest,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """Quickly toggles or updates the follow-up reminder status (e.g. pending, completed, dismissed)."""
    stmt = (
        select(Booking)
        .where(Booking.id == booking_id)
        .options(
            selectinload(Booking.event_type),
            selectinload(Booking.employee),
            selectinload(Booking.invitees),
        )
    )
    res = await db.execute(stmt)
    booking = res.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    if booking.employee_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the meeting host or an administrator can update follow-up status.",
        )

    booking.followup_status = req.followup_status
    booking.updated_at = datetime.now(timezone.utc)

    log_entry = AuditLog(
        actor_user_id=current_user.id,
        action="booking.followup_status_updated",
        entity_type="booking",
        entity_id=booking.id,
        metadata_={
            "followup_status": req.followup_status,
            "actor_name": current_user.name,
            "actor_type": "employee",
        },
    )
    db.add(log_entry)

    await db.commit()
    await db.refresh(booking)
    return build_booking_response(
        booking,
        invitees=booking.invitees,
        event_type_title=booking.event_type.title if booking.event_type else None,
        event_type_slug=booking.event_type.slug if booking.event_type else None,
        employee_name=booking.employee.name if booking.employee else None,
        employee_username=booking.employee.username if booking.employee else None,
    )


@router.get("/reminders/list", response_model=List[BookingResponse])
async def list_reminders(
    status_filter: str = Query("all", alias="status"),
    timeframe: str = Query("all"),
    priority: Optional[str] = None,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    """Returns meetings where a follow-up reminder is required, with status & timeframe filters."""
    query = (
        select(Booking)
        .where(
            Booking.followup_required == True,
            or_(
                Booking.employee_id == current_user.id,
                # If admin, can optionally view all reminders
                Booking.employee_id == current_user.id if current_user.role != "admin" else True,
            ),
        )
        .options(
            selectinload(Booking.event_type),
            selectinload(Booking.employee),
            selectinload(Booking.invitees),
        )
    )

    if status_filter == "pending":
        query = query.where(Booking.followup_status.in_(["pending", "in_progress"]))
    elif status_filter == "completed":
        query = query.where(Booking.followup_status == "completed")

    now = datetime.now(timezone.utc)
    if timeframe == "overdue":
        query = query.where(
            and_(
                Booking.followup_date != None,
                Booking.followup_date < now,
                Booking.followup_status.in_(["pending", "in_progress"]),
            )
        )
    elif timeframe == "today":
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)
        query = query.where(
            and_(
                Booking.followup_date >= today_start,
                Booking.followup_date < today_end,
            )
        )
    elif timeframe == "upcoming":
        query = query.where(
            and_(
                Booking.followup_date != None,
                Booking.followup_date >= now,
            )
        )

    if priority:
        query = query.where(Booking.followup_priority == priority)

    query = query.order_by(Booking.followup_date.asc().nullslast(), Booking.updated_at.desc())

    res = await db.execute(query)
    bookings = res.scalars().all()

    return [
        build_booking_response(
            b,
            invitees=b.invitees,
            event_type_title=b.event_type.title if b.event_type else None,
            event_type_slug=b.event_type.slug if b.event_type else None,
            employee_name=b.employee.name if b.employee else None,
            employee_username=b.employee.username if b.employee else None,
        )
        for b in bookings
    ]


@router.patch("/{booking_id}/attendee", response_model=BookingResponse)
async def update_booking_attendee(
    booking_id: uuid.UUID,
    req: UpdateInviteeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update attendee details (name, email, phone, company, timezone, notes) for a meeting.
    Allowed for the host employee or admin.
    """
    stmt = (
        select(Booking)
        .where(Booking.id == booking_id)
        .options(
            selectinload(Booking.event_type),
            selectinload(Booking.employee),
            selectinload(Booking.invitees),
        )
    )
    res = await db.execute(stmt)
    b = res.scalar_one_or_none()

    if not b:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found.")

    # Authorization: only host or admin can update attendee details
    if current_user.role != "admin" and b.employee_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to edit attendee details for this meeting.")

    # Find target invitee
    target_invitee: Optional[Invitee] = None
    if req.invitee_id:
        for inv in b.invitees:
            if inv.id == req.invitee_id:
                target_invitee = inv
                break
        if not target_invitee:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Specified attendee not found on this booking.")
    elif b.invitees:
        target_invitee = b.invitees[0]
    else:
        # Create an invitee record if none existed
        from app.models.base import generate_uuid
        target_invitee = Invitee(
            id=generate_uuid(),
            booking_id=b.id,
            name=req.name or "Attendee",
            email=str(req.email) if req.email else "attendee@example.com",
            timezone=req.timezone or "UTC",
            custom_answers={},
            cancellation_token=generate_uuid(),
        )
        db.add(target_invitee)
        b.invitees.append(target_invitee)

    # Track changes for audit logging
    changes: dict = {}

    if req.name is not None and req.name.strip():
        new_name = req.name.strip()
        if target_invitee.name != new_name:
            changes["name"] = {"from": target_invitee.name, "to": new_name}
            target_invitee.name = new_name

    if req.email is not None and str(req.email).strip():
        new_email = str(req.email).strip().lower()
        if target_invitee.email != new_email:
            changes["email"] = {"from": target_invitee.email, "to": new_email}
            target_invitee.email = new_email

    if req.timezone is not None and req.timezone.strip():
        new_tz = req.timezone.strip()
        if target_invitee.timezone != new_tz:
            changes["timezone"] = {"from": target_invitee.timezone, "to": new_tz}
            target_invitee.timezone = new_tz

    # Update custom answers (phone, company, notes)
    answers = dict(target_invitee.custom_answers or {})
    if req.phone is not None:
        answers["phone"] = req.phone.strip()
        answers["Contact Number"] = req.phone.strip()
        changes["phone"] = req.phone.strip()

    if req.company is not None:
        answers["Company name"] = req.company.strip()
        answers["company"] = req.company.strip()
        changes["company"] = req.company.strip()

    if req.notes is not None:
        answers["notes"] = req.notes.strip()
        answers["Attendee Notes"] = req.notes.strip()
        changes["notes"] = req.notes.strip()

    if req.custom_answers:
        answers.update(req.custom_answers)

    target_invitee.custom_answers = answers
    from app.models.base import utc_now
    b.updated_at = utc_now()

    # Audit log
    audit_desc = f"Attendee details updated by {current_user.name}: {target_invitee.name} ({target_invitee.email})"
    audit_entry = AuditLog(
        actor_user_id=current_user.id,
        action="attendee.updated",
        entity_type="booking",
        entity_id=b.id,
        metadata_={"description": audit_desc, "actor_name": current_user.name, **changes},
    )
    db.add(audit_entry)

    await db.commit()
    await db.refresh(b)
    await db.refresh(target_invitee)

    return build_booking_response(
        b,
        invitees=b.invitees,
        event_type_title=b.event_type.title if b.event_type else None,
        event_type_slug=b.event_type.slug if b.event_type else None,
        employee_name=b.employee.name if b.employee else None,
        employee_username=b.employee.username if b.employee else None,
    )


@router.get("/{booking_id}/logs", response_model=List[BookingAuditLogItem])
async def get_booking_logs(
    booking_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns the change log / audit trail for a booking."""
    stmt = (
        select(AuditLog)
        .where(AuditLog.entity_id == booking_id)
        .order_by(AuditLog.created_at.desc())
    )
    res = await db.execute(stmt)
    logs = res.scalars().all()
    items: List[BookingAuditLogItem] = []
    for l in logs:
        m = l.metadata_ or {}
        items.append(
            BookingAuditLogItem(
                id=l.id,
                action=l.action,
                actor_type="user",
                actor_name=m.get("actor_name") or "User",
                description=m.get("description") or l.action,
                metadata=m,
                created_at=l.created_at,
            )
        )
    return items


@router.delete("/{booking_id}")
async def delete_booking(
    booking_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a booking with cascading cleanup."""
    stmt = select(Booking).where(Booking.id == booking_id)
    res = await db.execute(stmt)
    booking = res.scalar_one_or_none()

    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    if current_user.role != "admin" and booking.employee_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this meeting"
        )

    from sqlalchemy import update, delete
    from app.models.booking import Invitee
    from app.models.notification import NotificationsLog, AuditLog

    # 1. Unlink any rescheduled references
    await db.execute(
        update(Booking).where(Booking.rescheduled_from_id == booking_id).values(rescheduled_from_id=None)
    )

    # 2. Explicitly remove invitees & notification logs to guarantee clean cascade
    await db.execute(delete(Invitee).where(Invitee.booking_id == booking_id))
    await db.execute(delete(NotificationsLog).where(NotificationsLog.booking_id == booking_id))
    await db.execute(
        delete(AuditLog).where(
            AuditLog.entity_type == "booking",
            AuditLog.entity_id == booking_id
        )
    )

    # 3. Delete booking
    await db.delete(booking)
    await db.commit()

    return {"status": "deleted", "message": "Meeting deleted permanently", "id": str(booking_id)}
