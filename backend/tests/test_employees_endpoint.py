"""Tests for task 3.9: employees.py write gates.

Spec: rbac-access-model "SECRETARIA creates/edits catedrático employees
only", "SECRETARIA cannot manage non-teaching employees".

`get_current_secretaria_or_above` on `create_employee`/`update_employee` is
replaced by `require_permission("employees.manage.catedratico")` +
`require_teacher_position`. Mocked-`AsyncSession` unit tests, matching this
project's established `_mock_db`/`_db_result` pattern (see
`test_user_scopes_endpoint.py`).
"""

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.deps import require_permission
from app.api.v1.endpoints import employees as employees_endpoint
from app.models.user import UserRole
from app.schemas.employee import EmployeeCreate, EmployeeUpdate


def _user(email: str, role: str | UserRole, **overrides) -> SimpleNamespace:
    return SimpleNamespace(
        id=overrides.pop("id", uuid4()),
        email=email,
        role=role,
        employee_id=overrides.pop("employee_id", None),
        user_roles=overrides.pop("user_roles", []),
        **overrides,
    )


def _assignment(role_name: str, permission_codes: list[str]) -> SimpleNamespace:
    permissions = [SimpleNamespace(code=code) for code in permission_codes]
    role = SimpleNamespace(name=role_name, permissions=permissions, is_active=True)
    return SimpleNamespace(role=role)


def _authorized_secretaria() -> SimpleNamespace:
    return _user(
        "secretaria@example.com",
        UserRole.SECRETARIA,
        user_roles=[_assignment("SECRETARIA", ["employees.manage.catedratico"])],
    )


def _unauthorized_administrativo() -> SimpleNamespace:
    # Proves the old coarse-gate role (`ADMINISTRATIVO`, which
    # `get_current_secretaria_or_above` used to grant a free pass to) no
    # longer passes `require_permission("employees.manage.catedratico")`
    # without an explicit grant.
    return _user(
        "administrativo@example.com",
        UserRole.ADMINISTRATIVO,
        user_roles=[_assignment("ADMINISTRATIVO", ["employees.view"])],
    )


def _position(canonical_role: str | None) -> SimpleNamespace:
    return SimpleNamespace(id=uuid4(), canonical_role=canonical_role)


def _employee(position_id, department_id=None, location_id=None) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        employee_code="EMP-001",
        first_name="Maria",
        last_name="Lopez",
        email="mlopez@example.com",
        phone=None,
        hire_date=None,
        is_active=True,
        created_at=None,
        face_embeddings=[],
        department_id=department_id,
        position_id=position_id,
        location_id=location_id,
    )


def _db_result(value=None) -> MagicMock:
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


async def _fake_refresh(obj) -> None:
    # Mimics what a real `db.refresh()` would populate from DB-side
    # defaults after `db.add()` + `db.commit()` on a freshly constructed
    # (not-yet-persisted) `Employee()` -- the mocked `AsyncSession` never
    # touches a real engine, so nothing sets these otherwise.
    if getattr(obj, "id", None) is None:
        obj.id = uuid4()
    if getattr(obj, "is_active", None) is None:
        obj.is_active = True
    if getattr(obj, "created_at", None) is None:
        obj.created_at = datetime(2026, 1, 1)
    if not hasattr(obj, "face_embeddings") or obj.face_embeddings is None:
        obj.face_embeddings = []


def _mock_db(*results) -> AsyncMock:
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=list(results))
    db.commit = AsyncMock()
    db.refresh = AsyncMock(side_effect=_fake_refresh)
    db.add = MagicMock()
    return db


# Spec: "Only authorized actor manages catedrático employees". FastAPI
# resolves Depends(require_permission(...)) before the endpoint body runs,
# so the gate itself must be exercised directly (same convention as
# test_user_scopes_endpoint.py).


@pytest.mark.asyncio
async def test_require_permission_denies_actor_without_employees_manage_catedratico():
    gate = require_permission("employees.manage.catedratico")

    with pytest.raises(HTTPException) as exc_info:
        await gate(_unauthorized_administrativo())
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_require_permission_allows_actor_with_employees_manage_catedratico():
    gate = require_permission("employees.manage.catedratico")
    actor = _authorized_secretaria()

    assert await gate(actor) is actor


# create_employee: within scope (catedrático) is allowed; outside scope
# (non-teaching position, or no position at all) is denied.


@pytest.mark.asyncio
async def test_create_employee_allows_catedratico_target_position():
    actor = _authorized_secretaria()
    position = _position(UserRole.CATEDRATICO.value)
    payload = EmployeeCreate(
        employee_code="EMP-100",
        first_name="Ana",
        last_name="Diaz",
        email="ana@example.com",
        position_id=position.id,
    )
    db = _mock_db(
        _db_result(value=None),  # employee_code uniqueness check
        _db_result(value=position),  # position lookup
    )

    result = await employees_endpoint.create_employee(db, actor, payload)

    assert result.employee_code == "EMP-100"
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_create_employee_denies_non_teaching_target_position():
    actor = _authorized_secretaria()
    position = _position("COORDINADOR")
    payload = EmployeeCreate(
        employee_code="EMP-101",
        first_name="Ana",
        last_name="Diaz",
        email="ana@example.com",
        position_id=position.id,
    )
    db = _mock_db(
        _db_result(value=None),
        _db_result(value=position),
    )

    with pytest.raises(HTTPException) as exc_info:
        await employees_endpoint.create_employee(db, actor, payload)
    assert exc_info.value.status_code == 403
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_create_employee_denies_when_no_position_provided():
    actor = _authorized_secretaria()
    payload = EmployeeCreate(
        employee_code="EMP-102",
        first_name="Ana",
        last_name="Diaz",
        email="ana@example.com",
    )
    db = _mock_db(_db_result(value=None))

    with pytest.raises(HTTPException) as exc_info:
        await employees_endpoint.create_employee(db, actor, payload)
    assert exc_info.value.status_code == 403


# update_employee: same within/outside-scope split, both when the update
# payload changes `position_id` and when it relies on the employee's
# already-persisted position.


@pytest.mark.asyncio
async def test_update_employee_allows_when_new_position_is_catedratico():
    actor = _authorized_secretaria()
    employee = _employee(position_id=uuid4())
    new_position = _position(UserRole.CATEDRATICO.value)
    payload = EmployeeUpdate(position_id=new_position.id)
    db = _mock_db(
        _db_result(value=employee),  # employee lookup
        _db_result(value=new_position),  # new position lookup
    )

    result = await employees_endpoint.update_employee(db, actor, employee.id, payload)

    assert result.position_id == new_position.id
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_employee_denies_when_existing_position_not_catedratico():
    actor = _authorized_secretaria()
    existing_position_id = uuid4()
    employee = _employee(position_id=existing_position_id)
    non_teaching_position = _position("SECRETARIA")
    payload = EmployeeUpdate(first_name="Renamed")
    db = _mock_db(
        _db_result(value=employee),
        _db_result(value=non_teaching_position),
    )

    with pytest.raises(HTTPException) as exc_info:
        await employees_endpoint.update_employee(db, actor, employee.id, payload)
    assert exc_info.value.status_code == 403
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_update_employee_denies_when_no_existing_position():
    actor = _authorized_secretaria()
    employee = _employee(position_id=None)
    payload = EmployeeUpdate(first_name="Renamed")
    db = _mock_db(_db_result(value=employee))

    with pytest.raises(HTTPException) as exc_info:
        await employees_endpoint.update_employee(db, actor, employee.id, payload)
    assert exc_info.value.status_code == 403
