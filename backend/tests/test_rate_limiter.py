import pytest
import pytest_asyncio
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.models.base import Base
from app.models.rate_limit import LoginRateLimit
from app.services.rate_limiter import LoginRateLimiter


@pytest_asyncio.fixture
async def async_db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync_conn: Base.metadata.create_all(sync_conn, tables=[LoginRateLimit.__table__]))
    
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with session_factory() as session:
        yield session
    
    await engine.dispose()


@pytest.mark.asyncio
async def test_first_eight_failed_attempts_return_401(async_db):
    email = "test@company.com"
    ip = "192.168.1.50"

    for attempt in range(1, 9):
        with pytest.raises(HTTPException) as exc_info:
            await LoginRateLimiter.record_failed_attempt(async_db, email, ip)
        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == "Incorrect email or password"

    acc_rec = await LoginRateLimiter.get_record(async_db, LoginRateLimiter.get_account_key(email))
    assert acc_rec is not None
    assert acc_rec.failed_attempts == 8
    assert acc_rec.locked_until is None


@pytest.mark.asyncio
async def test_ninth_failed_attempt_warns_one_attempt_remaining(async_db):
    email = "warning_test@company.com"
    ip = "192.168.1.51"

    # 1 to 8 attempts
    for _ in range(8):
        with pytest.raises(HTTPException):
            await LoginRateLimiter.record_failed_attempt(async_db, email, ip)

    # 9th attempt
    with pytest.raises(HTTPException) as exc_info:
        await LoginRateLimiter.record_failed_attempt(async_db, email, ip)
    
    assert exc_info.value.status_code == 401
    assert "Warning: 1 attempt remaining" in exc_info.value.detail
    assert "temporarily locked" in exc_info.value.detail

    acc_rec = await LoginRateLimiter.get_record(async_db, LoginRateLimiter.get_account_key(email))
    assert acc_rec.failed_attempts == 9
    assert acc_rec.locked_until is None


@pytest.mark.asyncio
async def test_tenth_failed_attempt_locks_and_returns_429(async_db):
    email = "lockout_test@company.com"
    ip = "192.168.1.52"

    for _ in range(9):
        with pytest.raises(HTTPException):
            await LoginRateLimiter.record_failed_attempt(async_db, email, ip)

    # 10th attempt: locks account for 15 minutes and returns 429
    with pytest.raises(HTTPException) as exc_info:
        await LoginRateLimiter.record_failed_attempt(async_db, email, ip)

    assert exc_info.value.status_code == 429
    assert "temporarily locked" in exc_info.value.detail
    assert "15 minutes" in exc_info.value.detail
    assert exc_info.value.headers.get("Retry-After") == "900"

    acc_rec = await LoginRateLimiter.get_record(async_db, LoginRateLimiter.get_account_key(email))
    assert acc_rec.failed_attempts == 10
    assert acc_rec.locked_until is not None
    assert LoginRateLimiter._ensure_utc(acc_rec.locked_until) > datetime.now(timezone.utc)


@pytest.mark.asyncio
async def test_check_rate_limit_blocks_during_lockout(async_db):
    email = "blocked_check@company.com"
    ip = "192.168.1.53"

    for _ in range(10):
        with pytest.raises(HTTPException):
            await LoginRateLimiter.record_failed_attempt(async_db, email, ip)

    # Subsequent check should immediately raise 429 before checking credentials
    with pytest.raises(HTTPException) as exc_info:
        await LoginRateLimiter.check_rate_limit(async_db, email, ip)

    assert exc_info.value.status_code == 429
    assert "temporarily locked" in exc_info.value.detail


@pytest.mark.asyncio
async def test_successful_login_resets_counters(async_db):
    email = "reset_test@company.com"
    ip = "192.168.1.54"

    # Make 5 failed attempts
    for _ in range(5):
        with pytest.raises(HTTPException):
            await LoginRateLimiter.record_failed_attempt(async_db, email, ip)

    acc_rec = await LoginRateLimiter.get_record(async_db, LoginRateLimiter.get_account_key(email))
    assert acc_rec.failed_attempts == 5

    # Reset on successful login
    await LoginRateLimiter.reset_rate_limit(async_db, email, ip)

    acc_rec = await LoginRateLimiter.get_record(async_db, LoginRateLimiter.get_account_key(email))
    ip_rec = await LoginRateLimiter.get_record(async_db, LoginRateLimiter.get_ip_key(ip))
    assert acc_rec.failed_attempts == 0
    assert acc_rec.locked_until is None
    assert ip_rec.failed_attempts == 0
    assert ip_rec.locked_until is None


@pytest.mark.asyncio
async def test_ip_based_lockout_across_different_emails(async_db):
    shared_ip = "10.0.0.99"

    # 9 attempts with 9 different non-existent emails from the same IP
    for i in range(1, 9):
        with pytest.raises(HTTPException) as exc_info:
            await LoginRateLimiter.record_failed_attempt(async_db, f"user_{i}@domain.com", shared_ip)
        assert exc_info.value.status_code == 401

    # 9th attempt from this IP -> warning
    with pytest.raises(HTTPException) as exc_info:
        await LoginRateLimiter.record_failed_attempt(async_db, "user_9@domain.com", shared_ip)
    assert exc_info.value.status_code == 401
    assert "Warning: 1 attempt remaining" in exc_info.value.detail

    # 10th attempt from this IP -> locks IP and returns 429
    with pytest.raises(HTTPException) as exc_info:
        await LoginRateLimiter.record_failed_attempt(async_db, "user_10@domain.com", shared_ip)
    assert exc_info.value.status_code == 429
    assert "temporarily locked" in exc_info.value.detail

    # Any new email from this IP is blocked
    with pytest.raises(HTTPException) as exc_info:
        await LoginRateLimiter.check_rate_limit(async_db, "user_11@domain.com", shared_ip)
    assert exc_info.value.status_code == 429


@pytest.mark.asyncio
async def test_window_expiration_resets_counter(async_db):
    email = "window_test@company.com"
    ip = "192.168.1.60"

    # First failed attempt 20 minutes ago
    with pytest.raises(HTTPException):
        await LoginRateLimiter.record_failed_attempt(async_db, email, ip)

    acc_rec = await LoginRateLimiter.get_record(async_db, LoginRateLimiter.get_account_key(email))
    # Artificially age the first_failed_at to 20 minutes ago
    acc_rec.first_failed_at = datetime.now(timezone.utc) - timedelta(minutes=20)
    acc_rec.failed_attempts = 5
    await async_db.commit()

    # Next attempt should notice the 15-minute window expired and reset counter to 1
    with pytest.raises(HTTPException):
        await LoginRateLimiter.record_failed_attempt(async_db, email, ip)

    acc_rec = await LoginRateLimiter.get_record(async_db, LoginRateLimiter.get_account_key(email))
    assert acc_rec.failed_attempts == 1


@pytest.mark.asyncio
async def test_expired_lockout_clears_on_check(async_db):
    email = "expired_lock@company.com"
    ip = "192.168.1.70"

    # Lock it out in the past
    acc_key = LoginRateLimiter.get_account_key(email)
    record = LoginRateLimit(
        key=acc_key,
        failed_attempts=10,
        locked_until=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    async_db.add(record)
    await async_db.commit()

    # Check should not raise 429 and should clear lockout
    await LoginRateLimiter.check_rate_limit(async_db, email, ip)

    cleared = await LoginRateLimiter.get_record(async_db, acc_key)
    assert cleared.locked_until is None
    assert cleared.failed_attempts == 0
