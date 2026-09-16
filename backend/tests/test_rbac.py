import uuid
import pytest
from fastapi import HTTPException
from app.models.user import User
from app.api.deps import require_admin, require_employee


@pytest.mark.asyncio
async def test_require_admin_success():
    admin = User(id=uuid.uuid4(), email="admin@kavach.infra", role="admin", status="active")
    res = await require_admin(admin)
    assert res.role == "admin"


@pytest.mark.asyncio
async def test_require_admin_forbidden_for_employee():
    employee = User(id=uuid.uuid4(), email="dev@kavach.infra", role="employee", status="active")
    with pytest.raises(HTTPException) as exc_info:
        await require_admin(employee)
    assert exc_info.value.status_code == 403
    assert "Administrative privileges required" in exc_info.value.detail


@pytest.mark.asyncio
async def test_require_employee_permits_both():
    emp = User(id=uuid.uuid4(), email="dev@kavach.infra", role="employee", status="active")
    adm = User(id=uuid.uuid4(), email="admin@kavach.infra", role="admin", status="active")
    
    res1 = await require_employee(emp)
    assert res1.role == "employee"
    
    res2 = await require_employee(adm)
    assert res2.role == "admin"
