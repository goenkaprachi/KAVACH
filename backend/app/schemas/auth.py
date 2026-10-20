import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefreshRequest(BaseModel):
    refresh_token: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AcceptInviteRequest(BaseModel):
    token: uuid.UUID
    password: str = Field(min_length=8)
    name: Optional[str] = None
    username: Optional[str] = None
    timezone: Optional[str] = "Asia/Kolkata"


class UserProfileResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: str
    status: str
    timezone: str
    username: str
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    office_location: Optional[str] = None
    employee_code: Optional[str] = None
    bio: Optional[str] = None
    zoho_email: Optional[str] = None
    zoho_connected: bool = False
    zoho_connected_at: Optional[datetime] = None
    zoho_meet_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    office_location: Optional[str] = None
    employee_code: Optional[str] = None
    bio: Optional[str] = None
    timezone: Optional[str] = None
    avatar_url: Optional[str] = None
    zoho_meet_url: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class ConnectZohoRequest(BaseModel):
    zoho_email: EmailStr
    zoho_meet_url: Optional[str] = None


class ZohoAuthorizeUrlResponse(BaseModel):
    configured: bool
    auth_url: Optional[str] = None
    client_id: Optional[str] = None
    redirect_uri: Optional[str] = None
    accounts_url: Optional[str] = None
    message: Optional[str] = None


class ZohoCallbackRequest(BaseModel):
    code: str
    state: Optional[str] = None
    redirect_uri: Optional[str] = None

