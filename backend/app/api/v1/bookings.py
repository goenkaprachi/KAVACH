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
from app.schemas.booking import (
    BookingCreateRequest,
    BookingResponse,
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
async def reschedule_booking(
    booking_id: uuid.UUID,
    req: RescheduleBookingRequest,
    current_user: Optional[User] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Booking).where(Booking.id == booking_id).options(
        selectinload(Booking.invitees),
        selectinload(Booking.event_type).selectinload(EventType.owner),
    )
    res = await db.execute(stmt)
    old_booking = res.scalar_one_or_none()

    if not old_booking or old_booking.status != "confirmed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking is not active")

    if current_user and (current_user.id == old_booking.employee_id or current_user.role == "admin"):
        actor = "employee"
    elif req.cancellation_token:
        inv = next((i for i in old_booking.invitees if i.cancellation_token == req.cancellation_token), None)
        if not inv:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid token")
        actor = "invitee"
    else:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication or token required")

    event_type = old_booking.event_type
    employee = event_type.owner

    # Cancel old booking with reason
    clean_reason = req.reason.strip() if req.reason and req.reason.strip() else None
    old_booking.status = "cancelled"
    old_booking.cancellation_reason = f"Rescheduled: {clean_reason}" if clean_reason else "Rescheduled to a new time"
    old_booking.cancelled_by = actor

    # Verify new slot
    new_slot_start_utc = req.new_start_time.astimezone(timezone.utc)
    new_slot_end_utc = new_slot_start_utc + timedelta(minutes=event_type.duration_minutes)

    meeting_details = await meeting_hub.create_for_booking(
        booking_id=str(uuid.uuid4()),
        title=event_type.title,
        start_time=new_slot_start_utc,
        duration_minutes=event_type.duration_minutes,
        requested_provider=event_type.location_type,
        location_detail=event_type.location_detail,
    )

    new_booking = Booking(
        event_type_id=event_type.id,
        employee_id=employee.id,
        start_time=new_slot_start_utc,
        end_time=new_slot_end_utc,
        status="confirmed",
        meeting_provider=meeting_details.provider,
        meeting_join_url=meeting_details.join_url,
        meeting_host_url=meeting_details.host_url,
        external_meeting_ref=meeting_details.external_ref,
        rescheduled_from_id=old_booking.id,
    )
    db.add(new_booking)
    await db.flush()

    # Re-associate invitees
    new_invitees = []
    for old_inv in old_booking.invitees:
        new_inv = Invitee(
            booking_id=new_booking.id,
            name=old_inv.name,
            email=old_inv.email,
            timezone=old_inv.timezone,
            custom_answers=old_inv.custom_answers,
        )
        db.add(new_inv)
        new_invitees.append(new_inv)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="New slot is conflicting or occupied.")

    # Dispatch reschedule notification email
    if new_invitees:
        try:
            await email_service.send_reschedule_notification(
                old_booking=old_booking,
                new_booking=new_booking,
                invitee=new_invitees[0],
                event_type=event_type,
                employee=employee,
                reason=clean_reason,
                rescheduled_by="Host" if actor == "employee" else "Invitee",
            )
        except Exception:
            pass

    return build_booking_response(
        b=new_booking,
        invitees=new_invitees,
        event_type_title=event_type.title,
        event_type_slug=event_type.slug,
        employee_name=employee.name,
        employee_username=employee.username,
    )
