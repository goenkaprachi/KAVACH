import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.booking import Booking
from app.models.event_type import EventType
from app.api.v1.auth import require_employee

router = APIRouter(prefix="/analytics", tags=["Analytics & Intelligence"])


@router.get("/summary")
async def get_analytics_summary(
    timeframe: str = Query("30d", pattern=r"^(7d|30d|90d|all)$"),
    scope: str = Query("all", pattern=r"^(all|me)$"),
    current_user: User = Depends(require_employee),
    db: AsyncSession = Depends(get_db),
):
    now_utc = datetime.now(timezone.utc)

    # Determine start date
    if timeframe == "7d":
        start_date = now_utc - timedelta(days=7)
    elif timeframe == "30d":
        start_date = now_utc - timedelta(days=30)
    elif timeframe == "90d":
        start_date = now_utc - timedelta(days=90)
    else:
        start_date = None

    # Base query filters
    conditions = []
    if start_date:
        conditions.append(Booking.start_time >= start_date)

    if current_user.role != "admin" or scope == "me":
        conditions.append(Booking.employee_id == current_user.id)

    # Fetch relevant bookings
    stmt = (
        select(Booking)
        .where(*conditions)
        .options(selectinload(Booking.employee), selectinload(Booking.event_type))
        .order_by(Booking.start_time.asc())
    )
    res = await db.execute(stmt)
    bookings = list(res.scalars().all())

    total_count = len(bookings)
    confirmed_count = sum(1 for b in bookings if b.status == "confirmed")
    cancelled_count = sum(1 for b in bookings if b.status == "cancelled")

    past_bookings = [
        b for b in bookings
        if b.status == "confirmed" and (b.end_time if b.end_time.tzinfo else b.end_time.replace(tzinfo=timezone.utc)) < now_utc
    ]
    past_total = len(past_bookings)

    no_show_count = sum(1 for b in past_bookings if getattr(b, "meeting_outcome", None) == "no_show")
    completed_count = sum(
        1 for b in past_bookings
        if getattr(b, "meeting_outcome", None) in ["completed", "successful", "needs_followup"]
        or getattr(b, "meeting_outcome", None) is None
    )

    no_show_rate = round((no_show_count / past_total * 100), 1) if past_total > 0 else 0.0
    completion_rate = round(((past_total - no_show_count) / past_total * 100), 1) if past_total > 0 else 100.0

    total_minutes = 0
    for b in bookings:
        if b.status == "confirmed" and b.end_time and b.start_time:
            delta = (b.end_time - b.start_time).total_seconds() / 60
            if delta > 0:
                total_minutes += int(delta)

    # Daily booking activity
    daily_map: Dict[str, Dict[str, int]] = {}
    # If timeframe is 7d or 30d, pre-populate all dates
    days_to_prefill = 7 if timeframe == "7d" else (30 if timeframe == "30d" else 0)
    if days_to_prefill > 0:
        for i in range(days_to_prefill):
            d_str = (now_utc - timedelta(days=days_to_prefill - 1 - i)).strftime("%Y-%m-%d")
            daily_map[d_str] = {"total": 0, "confirmed": 0, "cancelled": 0}

    for b in bookings:
        d_str = b.start_time.strftime("%Y-%m-%d")
        if d_str not in daily_map:
            daily_map[d_str] = {"total": 0, "confirmed": 0, "cancelled": 0}
        daily_map[d_str]["total"] += 1
        if b.status == "confirmed":
            daily_map[d_str]["confirmed"] += 1
        elif b.status == "cancelled":
            daily_map[d_str]["cancelled"] += 1

    daily_activity = [
        {"date": d, "total": v["total"], "confirmed": v["confirmed"], "cancelled": v["cancelled"]}
        for d, v in sorted(daily_map.items())
    ]

    # Platform breakdown
    provider_counts: Dict[str, int] = {}
    for b in bookings:
        p = b.meeting_provider or "jitsi"
        provider_counts[p] = provider_counts.get(p, 0) + 1

    provider_labels = {
        "google_meet": "Google Meet",
        "phone": "Phone Call",
        "in_person": "In-Person",
        "jitsi": "Browser Video",
        "zoom": "Zoom",
        "microsoft_teams": "Microsoft Teams",
        "custom": "Custom Link",
    }
    platform_breakdown = [
        {
            "provider": p,
            "label": provider_labels.get(p, p.replace("_", " ").title()),
            "count": cnt,
            "percentage": round(cnt / total_count * 100, 1) if total_count > 0 else 0,
        }
        for p, cnt in sorted(provider_counts.items(), key=lambda x: x[1], reverse=True)
    ]

    # Day of week and Hour breakdown
    dow_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    dow_counts = {name: 0 for name in dow_names}
    hour_counts = {h: 0 for h in range(24)}

    for b in bookings:
        dow_counts[dow_names[b.start_time.weekday()]] += 1
        hour_counts[b.start_time.hour] += 1

    # Outcomes breakdown
    outcome_counts = {
        "successful": sum(1 for b in past_bookings if getattr(b, "meeting_outcome", None) in ["completed", "successful"]),
        "needs_followup": sum(1 for b in past_bookings if getattr(b, "meeting_outcome", None) == "needs_followup"),
        "no_show": no_show_count,
        "disqualified": sum(1 for b in past_bookings if getattr(b, "meeting_outcome", None) == "disqualified"),
        "unmarked": sum(1 for b in past_bookings if getattr(b, "meeting_outcome", None) is None),
    }

    # Follow-up status breakdown
    followup_counts = {
        "pending": sum(1 for b in bookings if getattr(b, "followup_required", False) and getattr(b, "followup_status", "pending") == "pending"),
        "in_progress": sum(1 for b in bookings if getattr(b, "followup_required", False) and getattr(b, "followup_status", "pending") == "in_progress"),
        "completed": sum(1 for b in bookings if getattr(b, "followup_required", False) and getattr(b, "followup_status", "pending") == "completed"),
    }

    # Host performance leaderboard (admin view or multi-user)
    host_map: Dict[str, Dict[str, Any]] = {}
    for b in bookings:
        emp = b.employee
        if not emp:
            continue
        emp_id = str(emp.id)
        if emp_id not in host_map:
            host_map[emp_id] = {
                "id": emp_id,
                "name": emp.name,
                "email": emp.email,
                "avatar_url": emp.avatar_url,
                "total_bookings": 0,
                "past_bookings": 0,
                "no_shows": 0,
            }
        host_map[emp_id]["total_bookings"] += 1
        if (b.end_time if b.end_time.tzinfo else b.end_time.replace(tzinfo=timezone.utc)) < now_utc and b.status == "confirmed":
            host_map[emp_id]["past_bookings"] += 1
            if getattr(b, "meeting_outcome", None) == "no_show":
                host_map[emp_id]["no_shows"] += 1

    hosts_list = []
    for h in host_map.values():
        p_total = h["past_bookings"]
        c_rate = round((p_total - h["no_shows"]) / p_total * 100, 1) if p_total > 0 else 100.0
        ns_rate = round(h["no_shows"] / p_total * 100, 1) if p_total > 0 else 0.0
        hosts_list.append({
            "id": h["id"],
            "name": h["name"],
            "email": h["email"],
            "avatar_url": h["avatar_url"],
            "total_bookings": h["total_bookings"],
            "completion_rate": c_rate,
            "no_show_rate": ns_rate,
        })
    hosts_list.sort(key=lambda x: x["total_bookings"], reverse=True)

    # Event types popularity
    et_map: Dict[str, Dict[str, Any]] = {}
    for b in bookings:
        et = b.event_type
        title = et.title if et else (b.title or "Custom Event")
        slug = et.slug if et else "custom"
        if title not in et_map:
            et_map[title] = {"title": title, "slug": slug, "count": 0}
        et_map[title]["count"] += 1

    event_types_list = [
        {
            "title": v["title"],
            "slug": v["slug"],
            "count": v["count"],
            "percentage": round(v["count"] / total_count * 100, 1) if total_count > 0 else 0,
        }
        for v in sorted(et_map.values(), key=lambda x: x["count"], reverse=True)
    ]

    return {
        "timeframe": timeframe,
        "summary": {
            "total_bookings": total_count,
            "confirmed_bookings": confirmed_count,
            "cancelled_bookings": cancelled_count,
            "completed_bookings": completed_count,
            "no_show_bookings": no_show_count,
            "completion_rate": completion_rate,
            "no_show_rate": no_show_rate,
            "total_meeting_minutes": total_minutes,
            "total_meeting_hours": round(total_minutes / 60, 1),
        },
        "daily_activity": daily_activity,
        "platform_breakdown": platform_breakdown,
        "day_of_week": [{"day": d, "count": dow_counts[d]} for d in dow_names],
        "hourly_distribution": [{"hour": h, "formatted": f"{h:02d}:00", "count": hour_counts[h]} for h in range(8, 21)],
        "outcomes": outcome_counts,
        "followups": followup_counts,
        "hosts": hosts_list,
        "event_types": event_types_list,
    }
