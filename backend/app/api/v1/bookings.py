import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.event_type import EventType
from app.models.booking import Booking, Invitee
from app.models.notification import AuditLog
from app.schemas.booking import (
    BookingCreateRequest,
    BookingResponse,
    BookingAuditLogItem,
    InviteeResponse,
    CancelBookingRequest,
    RescheduleBookingRequest,
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

    return BookingResponse(
        id=b.id,
        booking_reference=b.booking_reference,
        event_type_id=b.event_type_id,
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
        created_at=b.created_at,
        updated_at=b.updated_at,
        event_type_title=event_type_title,
        event_type_slug=event_type_slug,
        employee_name=employee_name,
        employee_username=employee_username,
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

    # 2. Availability Engine pre-check
    try:
        inv_tz = ZoneInfo(req.invitee_timezone)
    except Exception:
        inv_tz = ZoneInfo("UTC")

    target_date = req.start_time.astimezone(inv_tz).date()
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

    # 3. Meeting Provider Hub - Generate meeting link with zero-setup Jitsi safety net
    booking_id = uuid.uuid4()
    meeting_details = await meeting_hub.create_for_booking(
        booking_id=str(booking_id),
        title=event_type.title,
        start_time=slot_start_utc,
        duration_minutes=event_type.duration_minutes,
        requested_provider=event_type.location_type,
        location_detail=event_type.location_detail,
        db=db,
    )

    # 4. Insert Booking & Invitee in atomic transaction
    new_booking = Booking(
        id=booking_id,
        event_type_id=event_type.id,
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
            "event_type_title": event_type.title,
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

    return build_booking_response(
        b=new_booking,
        invitees=[invitee],
        event_type_title=event_type.title,
        event_type_slug=event_type.slug,
        employee_name=employee.name,
        employee_username=employee.username,
    )


@router.get("", response_model=List[BookingResponse])
async def list_my_bookings(
    status: Optional[str] = None,
    upcoming: Optional[bool] = None,
    limit: int = Query(default=50, le=200),
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Booking).where(
        Booking.employee_id == current_user.id
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

    # Keep references before commit
    saved_invitees = list(booking.invitees)
    event_title = booking.event_type.title if booking.event_type else None
    event_slug = booking.event_type.slug if booking.event_type else None
    employee_name = booking.employee.name if booking.employee else None
    employee_username = booking.employee.username if booking.employee else None

    await db.commit()

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

    meeting_details = await meeting_hub.create_for_booking(
        booking_id=str(old_booking.id),
        title=event_type.title if event_type else "Rescheduled Meeting",
        start_time=new_slot_start_utc,
        duration_minutes=duration,
        requested_provider=event_type.location_type if event_type else old_booking.meeting_provider,
        location_detail=event_type.location_detail if event_type else None,
        db=db,
    )

    # Maintain single record for the meeting: update old_booking in-place
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

