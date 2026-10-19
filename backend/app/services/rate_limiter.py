import math
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.rate_limit import LoginRateLimit


class LoginRateLimiter:
    """Database-backed rate limiter for authentication attempts.
    Enforces a maximum of 10 failed login attempts per account and per IP within 15 minutes.
    Locks the account/IP for 15 minutes after 10 failed attempts (returning HTTP 429).
    Warns the user on the 9th failed attempt (1 attempt remaining).
    Maintains identical behavior and messages whether or not an account exists.
    Resets failed counters upon a successful authentication.
    """

    MAX_FAILED_ATTEMPTS: int = 10
    WARNING_ATTEMPT: int = 9
    WINDOW_MINUTES: int = 15
    LOCKOUT_MINUTES: int = 15

    @staticmethod
    def _ensure_utc(dt: Optional[datetime]) -> Optional[datetime]:
        if dt is None:
            return None
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    @classmethod
    def normalize_identifier(cls, identifier: str) -> str:
        return (identifier or "").lower().strip()

    @classmethod
    def get_account_key(cls, identifier: str) -> str:
        return f"account:{cls.normalize_identifier(identifier)}"

    @classmethod
    def get_ip_key(cls, ip: str) -> str:
        clean_ip = (ip or "127.0.0.1").strip()
        return f"ip:{clean_ip}"

    @classmethod
    async def get_record(cls, db: AsyncSession, key: str) -> Optional[LoginRateLimit]:
        stmt = select(LoginRateLimit).where(LoginRateLimit.key == key)
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    @classmethod
    async def check_rate_limit(cls, db: AsyncSession, identifier: str, client_ip: str) -> None:
        """Checks if either the account or client IP is currently locked out.
        If locked, raises HTTP 429 with clear remaining time.
        If a previous lockout period has expired, resets the counter.
        """
        now = datetime.now(timezone.utc)
        account_key = cls.get_account_key(identifier)
        ip_key = cls.get_ip_key(client_ip)

        for key in (account_key, ip_key):
            record = await cls.get_record(db, key)
            if record and record.locked_until:
                locked_until = cls._ensure_utc(record.locked_until)
                if locked_until > now:
                    remaining_seconds = max(1, int((locked_until - now).total_seconds()))
                    remaining_minutes = max(1, math.ceil(remaining_seconds / 60))
                    min_text = f"{remaining_minutes} minute" if remaining_minutes == 1 else f"{remaining_minutes} minutes"
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=f"Account is temporarily locked due to too many failed login attempts. Please try again in {min_text}.",
                        headers={"Retry-After": str(remaining_seconds)},
                    )
                else:
                    # Lockout expired, reset the state
                    record.locked_until = None
                    record.failed_attempts = 0
                    record.first_failed_at = None
                    record.last_failed_at = None
                    await db.commit()

    @classmethod
    async def record_failed_attempt(cls, db: AsyncSession, identifier: str, client_ip: str) -> None:
        """Records a failed authentication attempt across both account and client IP keys.
        Manages sliding window of 15 minutes and increments counters.
        Raises HTTP 429 when attempt count reaches 10 (locks for 15 minutes).
        Raises HTTP 401 with warning on the 9th failed attempt.
        Raises standard HTTP 401 on attempts 1 through 8.
        """
        now = datetime.now(timezone.utc)
        account_key = cls.get_account_key(identifier)
        ip_key = cls.get_ip_key(client_ip)

        keys = [account_key, ip_key]
        attempt_counts = []

        for key in keys:
            stmt = select(LoginRateLimit).where(LoginRateLimit.key == key)
            res = await db.execute(stmt)
            record = res.scalar_one_or_none()

            if not record:
                record = LoginRateLimit(
                    key=key,
                    failed_attempts=1,
                    first_failed_at=now,
                    last_failed_at=now,
                )
                db.add(record)
                attempt_counts.append(1)
            else:
                first_failed_at = cls._ensure_utc(record.first_failed_at)
                # Check if the 15-minute window from the first failure has elapsed
                if first_failed_at and (now - first_failed_at).total_seconds() > cls.WINDOW_MINUTES * 60:
                    record.failed_attempts = 1
                    record.first_failed_at = now
                    record.last_failed_at = now
                    record.locked_until = None
                else:
                    record.failed_attempts += 1
                    record.last_failed_at = now
                    if not record.first_failed_at:
                        record.first_failed_at = now

                attempt_counts.append(record.failed_attempts)

                if record.failed_attempts >= cls.MAX_FAILED_ATTEMPTS:
                    record.locked_until = now + timedelta(minutes=cls.LOCKOUT_MINUTES)

        await db.commit()

        max_attempts = max(attempt_counts) if attempt_counts else 1

        if max_attempts >= cls.MAX_FAILED_ATTEMPTS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Account is temporarily locked due to too many failed login attempts. Please try again in 15 minutes.",
                headers={"Retry-After": str(cls.LOCKOUT_MINUTES * 60)},
            )
        elif max_attempts == cls.WARNING_ATTEMPT:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password. Warning: 1 attempt remaining before your account is temporarily locked.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

    @classmethod
    async def reset_rate_limit(cls, db: AsyncSession, identifier: str, client_ip: str) -> None:
        """Resets the rate limit counters upon successful authentication."""
        account_key = cls.get_account_key(identifier)
        ip_key = cls.get_ip_key(client_ip)

        for key in (account_key, ip_key):
            stmt = select(LoginRateLimit).where(LoginRateLimit.key == key)
            res = await db.execute(stmt)
            record = res.scalar_one_or_none()
            if record:
                record.failed_attempts = 0
                record.first_failed_at = None
                record.last_failed_at = None
                record.locked_until = None

        await db.commit()
