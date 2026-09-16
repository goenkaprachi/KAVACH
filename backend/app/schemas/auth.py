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
    created_at: datetime

    class Config:
        from_attributes = True


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    timezone: Optional[str] = None
    avatar_url: Optional[str] = None
