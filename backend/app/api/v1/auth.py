import uuid
import urllib.parse
from datetime import datetime, time, timezone, timedelta
from typing import Optional, Tuple
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
    encrypt_data,
    decrypt_data,
)
from app.models.user import User
from app.models.availability import AvailabilitySchedule, AvailabilityRule
from app.models.integration import MeetingProviderConfig
from app.schemas.auth import (
    Token,
    TokenRefreshRequest,
    LoginRequest,
    AcceptInviteRequest,
    UserProfileResponse,
    UpdateProfileRequest,
    ChangePasswordRequest,
    ConnectGoogleRequest,
    GoogleAuthorizeUrlResponse,
    GoogleCallbackRequest,
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


def to_profile_response(user: User) -> UserProfileResponse:
    item = UserProfileResponse.model_validate(user)
    item.google_connected = bool(user.google_email)
    return item


@router.get("/me", response_model=UserProfileResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return to_profile_response(current_user)


@router.patch("/me", response_model=UserProfileResponse)
async def update_me(
    req: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if req.name is not None:
        current_user.name = req.name
    if req.phone is not None:
        current_user.phone = req.phone
    if req.job_title is not None:
        current_user.job_title = req.job_title
    if req.department is not None:
        current_user.department = req.department
    if req.office_location is not None:
        current_user.office_location = req.office_location
    if req.employee_code is not None:
        current_user.employee_code = req.employee_code
    if req.bio is not None:
        current_user.bio = req.bio
    if req.timezone is not None:
        current_user.timezone = req.timezone
    if req.avatar_url is not None:
        current_user.avatar_url = req.avatar_url
    if req.google_meet_url is not None:
        current_user.google_meet_url = req.google_meet_url.strip() if req.google_meet_url.strip() else None

    await db.commit()
    await db.refresh(current_user)
    return to_profile_response(current_user)


@router.post("/me/change-password")
async def change_password(
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.password_hash or not verify_password(req.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is not correct",
        )
    current_user.password_hash = get_password_hash(req.new_password)
    await db.commit()
    return {"message": "Password changed successfully"}


async def get_google_credentials(db: AsyncSession) -> Tuple[Optional[str], Optional[str]]:
    # 1. From settings / .env
    client_id = settings.GOOGLE_CLIENT_ID
    client_secret = settings.GOOGLE_CLIENT_SECRET
    if client_id and client_secret:
        return client_id.strip(), client_secret.strip()

    # 2. From MeetingProviderConfig (configured via Admin Integrations)
    stmt = select(MeetingProviderConfig).where(MeetingProviderConfig.provider == "google_meet")
    res = await db.execute(stmt)
    cfg = res.scalar_one_or_none()
    if cfg and cfg.credentials_encrypted:
        cid = cfg.credentials_encrypted.get("client_id")
        csec = cfg.credentials_encrypted.get("client_secret")
        if cid and csec:
            try:
                dec_cid = decrypt_data(cid)
                dec_csec = decrypt_data(csec)
                if dec_cid and dec_csec:
                    return dec_cid.strip(), dec_csec.strip()
            except Exception:
                pass
    return None, None


@router.get("/google/authorize-url", response_model=GoogleAuthorizeUrlResponse)
async def get_google_authorize_url(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generates the Google OAuth 2.0 authorization URL for connecting a Google account."""
    client_id, client_secret = await get_google_credentials(db)
    redirect_uri = settings.GOOGLE_REDIRECT_URI

    if not client_id or not client_secret:
        return GoogleAuthorizeUrlResponse(
            configured=False,
            redirect_uri=redirect_uri,
            message="Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env or Admin -> Integrations.",
        )

    # Encode user_id and nonce in a signed state token
    state_payload = {
        "user_id": str(current_user.id),
        "nonce": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    state = create_access_token(state_payload, expires_delta=timedelta(minutes=15))

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile https://www.googleapis.com/auth/calendar.events",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"

    return GoogleAuthorizeUrlResponse(
        configured=True,
        auth_url=auth_url,
        client_id=client_id,
        redirect_uri=redirect_uri,
    )


@router.post("/google/callback", response_model=UserProfileResponse)
async def google_callback(
    req: GoogleCallbackRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Exchanges Google authorization code for tokens and links the Google account."""
    client_id, client_secret = await get_google_credentials(db)
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google OAuth credentials are not configured in system settings.",
        )

    # Validate state
    if req.state:
        decoded = decode_token(req.state)
        if not decoded or decoded.get("user_id") != str(current_user.id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired OAuth state token.",
            )

    redirect_uri = req.redirect_uri or settings.GOOGLE_REDIRECT_URI

    token_url = "https://oauth2.googleapis.com/token"
    token_payload = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": req.code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        token_resp = await client.post(token_url, data=token_payload)
        if token_resp.status_code != 200:
            err_text = token_resp.text
            try:
                err_json = token_resp.json()
                err_text = err_json.get("error_description") or err_json.get("error") or err_text
            except Exception:
                pass
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Google token exchange failed: {err_text}",
            )
        tokens = token_resp.json()
        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")
        expires_in = tokens.get("expires_in", 3600)
        scopes = tokens.get("scope", "")

        # Fetch verified user profile
        userinfo_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to retrieve Google profile identity.",
            )
        g_profile = userinfo_resp.json()
        google_email = g_profile.get("email")

    if not google_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google profile did not contain an email address.",
        )

    current_user.google_email = google_email.lower().strip()
    current_user.google_connected_at = datetime.now(timezone.utc)
    current_user.google_access_token_encrypted = encrypt_data(access_token) if access_token else None
    if refresh_token:
        current_user.google_refresh_token_encrypted = encrypt_data(refresh_token)
    current_user.google_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    current_user.google_scopes = scopes

    await db.commit()
    await db.refresh(current_user)
    return to_profile_response(current_user)


@router.post("/me/google/connect", response_model=UserProfileResponse)
async def connect_google(
    req: ConnectGoogleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Direct connect fallback (for testing/development environments)."""
    current_user.google_email = req.google_email.lower().strip()
    current_user.google_connected_at = datetime.now(timezone.utc)
    if req.google_meet_url is not None:
        current_user.google_meet_url = req.google_meet_url.strip() if req.google_meet_url.strip() else None
    await db.commit()
    await db.refresh(current_user)
    return to_profile_response(current_user)


@router.delete("/me/google/disconnect", response_model=UserProfileResponse)
async def disconnect_google(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.google_email = None
    current_user.google_connected_at = None
    current_user.google_access_token_encrypted = None
    current_user.google_refresh_token_encrypted = None
    current_user.google_token_expires_at = None
    current_user.google_scopes = None
    current_user.google_meet_url = None
    await db.commit()
    await db.refresh(current_user)
    return to_profile_response(current_user)
