"""Tests for the scope admin CRUD endpoint (task 3.8).

Spec: rbac-access-model "Organizational Scope Assignment" -- "Coordinador
scope assignment is persisted", "Secretaría scope assignment is persisted",
"Only authorized actor manages scope assignments".

Two tiers: mocked-`AsyncSession` unit tests (this project's established
`_mock_db`/`_db_result` pattern, see `test_rbac_access_model.py`) for the
`require_permission` gate and list/delete/404 shape; a real in-memory
SQLite engine (`aiosqlite`) for duplicate-assignment rejection, so the
task 3.4b partial unique indexes are exercised through the actual
endpoint's real `await db.commit()`, not a mock.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.api.deps import require_permission
from app.api.v1.endpoints import user_scopes as user_scopes_endpoint
from app.models.user import UserRole
from app.models.user_scope_assignment import UserScopeAssignment
from app.schemas.user_scope_assignment import UserScopeAssignmentCreate


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


def _db_result(value=None, values=None) -> MagicMock:
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    result.scalars.return_value.all.return_value = values or []
    return result


def _mock_db(*results) -> AsyncMock:
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=list(results))
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.delete = AsyncMock()
    db.add = MagicMock()
    return db


def _authorized_secretaria() -> SimpleNamespace:
    return _user(
        "secretaria@example.com",
        UserRole.SECRETARIA,
        user_roles=[_assignment("SECRETARIA", ["user_scopes.manage"])],
    )


def _unauthorized_coordinador() -> SimpleNamespace:
    return _user(
        "coordinador@example.com",
        UserRole.COORDINADOR,
        user_roles=[_assignment("COORDINADOR", ["dashboard.view"])],
    )


# Spec: "Only authorized actor manages scope assignments". FastAPI resolves
# Depends(require_permission(...)) before the endpoint body runs, so calling
# the endpoint function directly (as this suite's other permission-gated
# tests do) bypasses the gate -- the gate itself must be exercised directly.


@pytest.mark.asyncio
async def test_require_permission_denies_actor_without_user_scopes_manage():
    gate = require_permission("user_scopes.manage")

    with pytest.raises(HTTPException) as exc_info:
        await gate(_unauthorized_coordinador())
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_require_permission_allows_actor_with_user_scopes_manage():
    gate = require_permission("user_scopes.manage")
    actor = _authorized_secretaria()

    assert await gate(actor) is actor


# 422 validation: exactly one of department_id/location_id/director_user_id.
# Mirrors the DB CHECK constraint at the API layer (schema-level, matching
# test_attendance_schema.py's established validator-test convention).


def test_create_payload_rejects_zero_targets():
    with pytest.raises(ValidationError):
        UserScopeAssignmentCreate(user_id=uuid4())


def test_create_payload_rejects_multiple_targets():
    with pytest.raises(ValidationError):
        UserScopeAssignmentCreate(
            user_id=uuid4(), department_id=uuid4(), location_id=uuid4()
        )


def test_create_payload_rejects_all_three_targets():
    with pytest.raises(ValidationError):
        UserScopeAssignmentCreate(
            user_id=uuid4(),
            department_id=uuid4(),
            location_id=uuid4(),
            director_user_id=uuid4(),
        )


@pytest.mark.parametrize(
    "kwargs",
    [
        {"department_id": uuid4()},
        {"location_id": uuid4()},
        {"director_user_id": uuid4()},
    ],
)
def test_create_payload_accepts_exactly_one_target(kwargs):
    payload = UserScopeAssignmentCreate(user_id=uuid4(), **kwargs)
    assert sum(1 for v in (payload.department_id, payload.location_id, payload.director_user_id) if v) == 1


# List / delete against a mocked AsyncSession.


@pytest.mark.asyncio
async def test_list_user_scope_assignments_returns_rows():
    actor = _authorized_secretaria()
    row = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        department_id=uuid4(),
        location_id=None,
        director_user_id=None,
    )
    db = _mock_db(_db_result(values=[row]))

    result = await user_scopes_endpoint.list_user_scope_assignments(db, actor, None)

    assert result == [row]


@pytest.mark.asyncio
async def test_delete_user_scope_assignment_removes_existing_row():
    actor = _authorized_secretaria()
    existing = SimpleNamespace(id=uuid4())
    db = _mock_db(_db_result(value=existing))

    await user_scopes_endpoint.delete_user_scope_assignment(db, actor, existing.id)

    db.delete.assert_awaited_once_with(existing)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_user_scope_assignment_404_when_missing():
    actor = _authorized_secretaria()
    db = _mock_db(_db_result(value=None))

    with pytest.raises(HTTPException) as exc_info:
        await user_scopes_endpoint.delete_user_scope_assignment(db, actor, uuid4())
    assert exc_info.value.status_code == 404


# Real in-memory SQLite engine (aiosqlite): genuine duplicate-assignment
# rejection, exercising the task 3.4b partial unique indexes through the
# actual endpoint code path, not a mocked `db.commit()`.


async def _real_session_maker() -> tuple[async_sessionmaker, AsyncEngine]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(
            UserScopeAssignment.metadata.create_all,
            tables=[UserScopeAssignment.__table__],
        )
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False), engine


@pytest.mark.asyncio
async def test_create_user_scope_assignment_persists_a_real_row():
    session_maker, engine = await _real_session_maker()
    actor = _authorized_secretaria()
    payload = UserScopeAssignmentCreate(user_id=uuid4(), department_id=uuid4())

    async with session_maker() as session:
        created = await user_scopes_endpoint.create_user_scope_assignment(session, actor, payload)

    assert created.department_id == payload.department_id
    assert created.user_id == payload.user_id
    await engine.dispose()


@pytest.mark.asyncio
async def test_duplicate_department_assignment_is_rejected_by_real_db():
    session_maker, engine = await _real_session_maker()
    actor = _authorized_secretaria()
    payload = UserScopeAssignmentCreate(user_id=uuid4(), department_id=uuid4())

    async with session_maker() as session:
        await user_scopes_endpoint.create_user_scope_assignment(session, actor, payload)

    async with session_maker() as session:
        with pytest.raises(HTTPException) as exc_info:
            await user_scopes_endpoint.create_user_scope_assignment(session, actor, payload)
        assert exc_info.value.status_code == 409

    await engine.dispose()


@pytest.mark.asyncio
async def test_duplicate_director_assignment_for_same_secretaria_is_rejected_by_real_db():
    # Spec: "the same SECRETARIA user MAY be linked to more than one
    # DIRECTOR" -- distinct director targets must NOT collide, only an
    # exact (user_id, director_user_id) repeat must be rejected.
    session_maker, engine = await _real_session_maker()
    actor = _authorized_secretaria()
    secretaria_user_id = uuid4()
    director_id = uuid4()
    payload = UserScopeAssignmentCreate(
        user_id=secretaria_user_id, director_user_id=director_id
    )

    async with session_maker() as session:
        await user_scopes_endpoint.create_user_scope_assignment(session, actor, payload)

    async with session_maker() as session:
        with pytest.raises(HTTPException) as exc_info:
            await user_scopes_endpoint.create_user_scope_assignment(session, actor, payload)
        assert exc_info.value.status_code == 409

    async with session_maker() as session:
        other_director_payload = UserScopeAssignmentCreate(
            user_id=secretaria_user_id, director_user_id=uuid4()
        )
        second = await user_scopes_endpoint.create_user_scope_assignment(
            session, actor, other_director_payload
        )
        assert second.director_user_id == other_director_payload.director_user_id

    await engine.dispose()
