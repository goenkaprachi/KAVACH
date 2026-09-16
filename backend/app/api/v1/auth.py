import uuid
from datetime import datetime, time, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.models.user import User
from app.models.availability import AvailabilitySchedule, AvailabilityRule
from app.schemas.auth import (
    Token,
    TokenRefreshRequest,
    LoginRequest,
    AcceptInviteRequest,
    UserProfileResponse,
    UpdateProfileRequest,
)
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    # Form_data uses username field for email
    stmt = select(User).where(User.email == form_data.username.lower().strip())
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user or not user.password_hash or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.status == "deactivated":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Please contact an administrator.",
        )

    access_token = create_access_token(data={"sub": str(user.id), "role": user.role})
    refresh_token = create_refresh_token(data={"sub": str(user.id), "role": user.role})
    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=Token)
async def refresh_token(
    payload: TokenRefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    token_data = decode_token(payload.refresh_token)
    if not token_data or token_data.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    user_id = token_data.get("sub")
    stmt = select(User).where(User.id == uuid.UUID(user_id))
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user or user.status == "deactivated":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer active",
        )

    new_access = create_access_token(data={"sub": str(user.id), "role": user.role})
    new_refresh = create_refresh_token(data={"sub": str(user.id), "role": user.role})
    return Token(access_token=new_access, refresh_token=new_refresh)


@router.post("/accept-invite", response_model=UserProfileResponse)
async def accept_invite(
    req: AcceptInviteRequest,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(User).where(User.invite_token == req.token)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired invitation token.",
        )

    if user.status == "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation has already been accepted. Please sign in.",
        )

    # Set password & active status
    user.password_hash = get_password_hash(req.password)
    user.status = "active"
    user.invite_token = None
    if req.name:
        user.name = req.name
    if req.username:
        user.username = req.username.lower().strip()
    if req.timezone:
        user.timezone = req.timezone

    # Create default 9-5 Mon-Fri schedule if none exists
    sched_stmt = select(AvailabilitySchedule).where(AvailabilitySchedule.user_id == user.id)
    sched_res = await db.execute(sched_stmt)
    existing_sched = sched_res.scalars().first()

    if not existing_sched:
        default_schedule = AvailabilitySchedule(
            user_id=user.id,
            name="Working Hours",
            is_default=True
        )
        db.add(default_schedule)
        await db.flush()

        # Monday(1) to Friday(5) 9am to 5pm
        for dow in range(1, 6):
            rule = AvailabilityRule(
                schedule_id=default_schedule.id,
                day_of_week=dow,
                start_time=time(9, 0),
                end_time=time(17, 0)
            )
            db.add(rule)

    await db.commit()
    await db.refresh(user)
    return user


@router.get("/me", response_model=UserProfileResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserProfileResponse)
async def update_me(
    req: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if req.name is not None:
        current_user.name = req.name
    if req.timezone is not None:
        current_user.timezone = req.timezone
    if req.avatar_url is not None:
        current_user.avatar_url = req.avatar_url

    await db.commit()
    await db.refresh(current_user)
    return current_user
