import uuid
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.event_type import EventType
from app.schemas.event_type import (
    EventTypeCreate,
    EventTypeUpdate,
    EventTypeResponse,
    EventTypePublicResponse,
)
from app.schemas.booking import SlotResponse
from app.api.deps import require_employee
from app.services.availability_engine import AvailabilityEngine

router = APIRouter(prefix="/event-types", tags=["Event Types"])


@router.get("", response_model=List[EventTypeResponse])
async def list_my_event_types(
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(EventType).where(
        EventType.owner_user_id == current_user.id
    ).order_by(EventType.created_at.desc())
    res = await db.execute(stmt)
    return list(res.scalars().all())


@router.post("", response_model=EventTypeResponse)
async def create_event_type(
    req: EventTypeCreate,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    slug = req.slug.lower().strip()
    # Check if slug exists for this user
    check_stmt = select(EventType).where(
        EventType.owner_user_id == current_user.id,
        EventType.slug == slug
    )
    res = await db.execute(check_stmt)
    if res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An event type with this slug already exists for your account.",
        )

    event_type = EventType(
        owner_user_id=current_user.id,
        slug=slug,
        title=req.title,
        description=req.description,
        duration_minutes=req.duration_minutes,
        location_type=req.location_type,
        location_detail=req.location_detail,
        booking_type=req.booking_type,
        buffer_before_minutes=req.buffer_before_minutes,
        buffer_after_minutes=req.buffer_after_minutes,
        min_notice_minutes=req.min_notice_minutes,
        max_days_in_advance=req.max_days_in_advance,
        max_bookings_per_day=req.max_bookings_per_day,
        group_capacity=req.group_capacity,
        custom_questions=req.custom_questions,
        is_active=req.is_active,
        schedule_id=req.schedule_id,
    )
    db.add(event_type)
    await db.commit()
    await db.refresh(event_type)
    return event_type


@router.patch("/{event_type_id}", response_model=EventTypeResponse)
async def update_event_type(
    event_type_id: uuid.UUID,
    req: EventTypeUpdate,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(EventType).where(
        EventType.id == event_type_id,
        EventType.owner_user_id == current_user.id
    )
    res = await db.execute(stmt)
    event_type = res.scalar_one_or_none()
    if not event_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event type not found")

    update_data = req.model_dump(exclude_unset=True)
    if "slug" in update_data:
        new_slug = update_data["slug"].lower().strip()
        if new_slug != event_type.slug:
            check_stmt = select(EventType).where(
                EventType.owner_user_id == current_user.id,
                EventType.slug == new_slug
            )
            check_res = await db.execute(check_stmt)
            if check_res.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="An event type with this slug already exists for your account.",
                )
            event_type.slug = new_slug

    for field, value in update_data.items():
        if field != "slug":
            setattr(event_type, field, value)

    await db.commit()
    await db.refresh(event_type)
    return event_type


@router.delete("/{event_type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event_type(
    event_type_id: uuid.UUID,
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(EventType).where(
        EventType.id == event_type_id,
        EventType.owner_user_id == current_user.id
    )
    res = await db.execute(stmt)
    event_type = res.scalar_one_or_none()
    if not event_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event type not found")

    await db.delete(event_type)
    await db.commit()
    return None


# --- Public Booking Endpoints ---

@router.get("/{username}/{slug}/public", response_model=EventTypePublicResponse)
async def get_public_event_type(
    username: str,
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    user_stmt = select(User).where(User.username == username.lower().strip())
    user_res = await db.execute(user_stmt)
    user = user_res.scalar_one_or_none()
    if not user or user.status != "active":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Host not found or inactive")

    et_stmt = select(EventType).where(
        EventType.owner_user_id == user.id,
        EventType.slug == slug.lower().strip(),
        EventType.is_active == True
    )
    et_res = await db.execute(et_stmt)
    event_type = et_res.scalar_one_or_none()
    if not event_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event type not found or inactive")

    return EventTypePublicResponse(
        id=event_type.id,
        title=event_type.title,
        slug=event_type.slug,
        description=event_type.description,
        duration_minutes=event_type.duration_minutes,
        location_type=event_type.location_type,
        location_detail=event_type.location_detail,
        custom_questions=event_type.custom_questions,
        owner_name=user.name,
        owner_username=user.username,
        owner_avatar_url=user.avatar_url,
        owner_timezone=user.timezone,
    )


@router.get("/{username}/{slug}/slots", response_model=List[SlotResponse])
async def get_slots(
    username: str,
    slug: str,
    date_str: str = Query(..., alias="date", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    tz: str = Query("UTC"),
    db: AsyncSession = Depends(get_db),
):
    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid date format. Use YYYY-MM-DD.")

    user_stmt = select(User).where(User.username == username.lower().strip())
    user_res = await db.execute(user_stmt)
    user = user_res.scalar_one_or_none()
    if not user or user.status != "active":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Host not found or inactive")

    et_stmt = select(EventType).where(
        EventType.owner_user_id == user.id,
        EventType.slug == slug.lower().strip(),
        EventType.is_active == True
    )
    et_res = await db.execute(et_stmt)
    event_type = et_res.scalar_one_or_none()
    if not event_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event type not found or inactive")

    slots = await AvailabilityEngine.get_available_slots_for_date(
        session=db,
        event_type=event_type,
        employee=user,
        target_date=target_date,
        invitee_tz_str=tz,
    )
    return slots
