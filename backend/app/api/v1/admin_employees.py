import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.config import settings
from app.models.user import User
from app.models.booking import Booking
from app.models.availability import AvailabilitySchedule
from app.models.event_type import EventType
from app.schemas.user import EmployeeCreateRequest, EmployeeUpdateRequest, EmployeeResponse
from app.api.deps import require_admin
from app.services.email_service import email_service

router = APIRouter(prefix="/admin/employees", tags=["Admin Employees"])


@router.post("", response_model=EmployeeResponse)
async def create_employee(
    req: EmployeeCreateRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    email = req.email.lower().strip()
    # Check if user with this email exists
    stmt = select(User).where(User.email == email)
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An employee with this email already exists.",
        )

    # Resolve username
    base_username = req.username or email.split("@")[0]
    base_username = "".join(c for c in base_username.lower() if c.isalnum() or c in ("-", "_"))
    username = base_username

    idx = 1
    while True:
        check_stmt = select(User).where(User.username == username)
        check_res = await db.execute(check_stmt)
        if not check_res.scalar_one_or_none():
            break
        username = f"{base_username}{idx}"
        idx += 1

    invite_token = uuid.uuid4()
    new_employee = User(
        name=req.name,
        email=email,
        username=username,
        role=req.role if req.role in ("employee", "admin") else "employee",
        status="pending",
        timezone=req.timezone or "Asia/Kolkata",
        invited_by=current_admin.id,
        invite_token=invite_token,
    )
    db.add(new_employee)
    await db.commit()
    await db.refresh(new_employee)

    # Dispatch invite email
    invite_url = f"{settings.FRONTEND_BASE_URL}/accept-invite?token={invite_token}"
    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #2563eb;">Welcome to Kavach Connect</h2>
        <p>Hi {new_employee.name},</p>
        <p>You have been invited by {current_admin.name} to join Kavach Connect as an {new_employee.role}.</p>
        <p>Please click the button below to choose your password and activate your scheduling account:</p>
        <p style="text-align: center; margin: 30px 0;">
            <a href="{invite_url}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Accept Invitation & Set Password
            </a>
        </p>
        <p style="color: #64748b; font-size: 13px;">Or copy and paste this URL into your browser:<br/>{invite_url}</p>
    </div>
    """
    await email_service.send_email(
        recipient_email=new_employee.email,
        subject="You're invited to join Kavach Connect",
        html_body=html_body,
    )

    resp = EmployeeResponse.model_validate(new_employee)
    resp.booking_count = 0
    resp.has_availability = False
    return resp


@router.get("", response_model=List[EmployeeResponse])
async def list_employees(
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).order_by(User.created_at.desc())
    res = await db.execute(stmt)
    users = list(res.scalars().all())

    result: List[EmployeeResponse] = []
    for u in users:
        # Count bookings
        b_stmt = select(func.count(Booking.id)).where(Booking.employee_id == u.id)
        b_res = await db.execute(b_stmt)
        b_count = b_res.scalar() or 0

        # Check availability setup
        s_stmt = select(func.count(AvailabilitySchedule.id)).where(AvailabilitySchedule.user_id == u.id)
        s_res = await db.execute(s_stmt)
        has_avail = (s_res.scalar() or 0) > 0

        emp_resp = EmployeeResponse.model_validate(u)
        emp_resp.booking_count = b_count
        emp_resp.has_availability = has_avail
        result.append(emp_resp)

    return result


@router.get("/{employee_id}")
async def get_employee_detail(
    employee_id: uuid.UUID,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).where(User.id == employee_id).options(
        selectinload(User.event_types),
        selectinload(User.availability_schedules).selectinload(AvailabilitySchedule.rules),
    )
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    # Recent bookings
    b_stmt = select(Booking).where(Booking.employee_id == employee_id).order_by(Booking.start_time.desc()).limit(20)
    b_res = await db.execute(b_stmt)
    bookings = list(b_res.scalars().all())

    return {
        "employee": EmployeeResponse.model_validate(user),
        "event_types": user.event_types,
        "schedules": user.availability_schedules,
        "recent_bookings": bookings,
    }


@router.patch("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: uuid.UUID,
    req: EmployeeUpdateRequest,
    current_admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).where(User.id == employee_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")

    if req.name is not None:
        user.name = req.name
    if req.role is not None and req.role in ("employee", "admin"):
        user.role = req.role
    if req.status is not None and req.status in ("pending", "active", "deactivated"):
        user.status = req.status
    if req.timezone is not None:
        user.timezone = req.timezone

    await db.commit()
    await db.refresh(user)

    resp = EmployeeResponse.model_validate(user)
    return resp
