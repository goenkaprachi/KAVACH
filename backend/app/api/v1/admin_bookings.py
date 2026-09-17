import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.booking import Booking
from app.schemas.booking import BookingResponse
from app.api.deps import require_admin

router = APIRouter(prefix="/admin/bookings", tags=["Admin Bookings"])


@router.get("", response_model=List[BookingResponse])
async def list_org_bookings(
    employee_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    provider: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Booking).options(
        selectinload(Booking.invitees),
        selectinload(Booking.event_type),
        selectinload(Booking.employee),
    )

    if employee_id:
        stmt = stmt.where(Booking.employee_id == employee_id)
    if status:
        if status == "rescheduled":
            stmt = stmt.where(or_(Booking.is_rescheduled == True, Booking.rescheduled_from_id.isnot(None)))
        elif status == "confirmed":
            stmt = stmt.where(Booking.status == "confirmed", Booking.is_rescheduled == False, Booking.rescheduled_from_id.is_(None))
        else:
            stmt = stmt.where(Booking.status == status)
    if start_date:
        stmt = stmt.where(Booking.start_time >= start_date)
    if end_date:
        stmt = stmt.where(Booking.end_time <= end_date)
    if provider:
        stmt = stmt.where(Booking.meeting_provider == provider)

    stmt = stmt.order_by(Booking.start_time.desc()).limit(limit).offset(offset)
    res = await db.execute(stmt)
    bookings = res.scalars().all()

    results = []
    for b in bookings:
        item = BookingResponse.model_validate(b)
        item.is_rescheduled = bool(getattr(b, "is_rescheduled", False) or b.rescheduled_from_id is not None)
        if b.event_type:
            item.event_type_title = b.event_type.title
            item.event_type_slug = b.event_type.slug
        if b.employee:
            item.employee_name = b.employee.name
            item.employee_username = b.employee.username
        results.append(item)

    return results


@router.delete("/{booking_id}")
async def delete_booking_permanently(
    booking_id: uuid.UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Booking).where(Booking.id == booking_id)
    res = await db.execute(stmt)
    booking = res.scalar_one_or_none()

    if not booking:
        raise HTTPException(status_code=404, detail="Meeting not found")

    # Disassociate any legacy bookings that reference this booking as rescheduled_from_id
    from sqlalchemy import update, delete
    from app.models.notification import AuditLog
    await db.execute(
        update(Booking).where(Booking.rescheduled_from_id == booking_id).values(rescheduled_from_id=None)
    )

    # Delete any audit logs associated with this meeting
    await db.execute(
        delete(AuditLog).where(
            AuditLog.entity_type == "booking",
            AuditLog.entity_id == booking_id
        )
    )

    # Delete booking - cascade will clean up invitees and notifications_log
    await db.delete(booking)
    await db.commit()

    return {"status": "deleted", "message": "Meeting deleted permanently", "id": str(booking_id)}
