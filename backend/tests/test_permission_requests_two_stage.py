"""Tests for task 3.13: `permission_requests.py` two-stage transitions.

Spec: permission-request-workflow "Stage 1 Coordinator Review", "Stage 2
Secretaría Review", "Director Notification Visibility".

`get_current_coordinador_or_above` (deprecated, design.md D10) on
`approve`/`reject` is replaced by plain `get_current_user` auth plus
runtime `has_permission(actor, "permission_requests.approve.stage1"/
".stage2")` + `assert_request_scope`/`_assert_stage2_secretaria_scope`
checks, since which permission code applies depends on the request's
*current status*, not a fixed dependency. Mocked-`AsyncSession` unit
tests, matching this project's established `_mock_db`/`_db_result`
pattern (see `test_employees_endpoint.py`, `test_user_scopes_endpoint.py`).
"""

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import permission_requests as pr_endpoint
from app.models.permission_request import PermissionRequestStatus, RejectionStage
from app.models.user import UserRole
from app.schemas.permission_request import (
    PermissionRequestApprove,
    PermissionRequestReject,
)


def _user(role_name: str, permission_codes: list[str], **overrides) -> SimpleNamespace:
    permissions = [SimpleNamespace(code=code) for code in permission_codes]
    role = SimpleNamespace(name=role_name, permissions=permissions, is_active=True)
    return SimpleNamespace(
        id=overrides.pop("id", uuid4()),
        email=overrides.pop("email", f"{role_name.lower()}@example.com"),
        role=role_name,
        employee_id=overrides.pop("employee_id", None),
        user_roles=[SimpleNamespace(role=role)],
        **overrides,
    )


def _coordinador() -> SimpleNamespace:
    return _user("COORDINADOR", ["permission_requests.approve.stage1"])


def _secretaria() -> SimpleNamespace:
    return _user("SECRETARIA", ["permission_requests.approve.stage2"])


def _catedratico() -> SimpleNamespace:
    return _user("CATEDRATICO", [])


def _director() -> SimpleNamespace:
    return _user("DIRECTOR", [])


def _employee(department_id=None, location_id=None) -> SimpleNamespace:
    return SimpleNamespace(id=uuid4(), department_id=department_id, location_id=location_id)


def _permission_request(status_value, **overrides) -> SimpleNamespace:
    return SimpleNamespace(
        id=overrides.pop("id", uuid4()),
        requested_by_user_id=overrides.pop("requested_by_user_id", uuid4()),
        employee_id=overrides.pop("employee_id", uuid4()),
        exception_type="permiso médico",
        start_date=overrides.pop("start_date", "2026-07-01"),
        end_date=overrides.pop("end_date", "2026-07-01"),
        description=None,
        status=status_value,
        coordinator_reviewed_by=None,
        coordinator_reviewed_at=None,
        coordinator_notes=None,
        director_reviewed_by=None,
        director_reviewed_at=None,
        director_notes=None,
        rejection_stage=None,
        rejection_reason=None,
        schedule_exception_id=None,
        created_at=datetime(2026, 1, 1),
        **overrides,
    )


def _scope_assignment(*, user, department_id=None, location_id=None, director_user_id=None) -> SimpleNamespace:
    return SimpleNamespace(
        user_id=user.id,
        user=user,
        department_id=department_id,
        location_id=location_id,
        director_user_id=director_user_id,
    )


def _db_result(*, scalar=None, scalars_list=None) -> MagicMock:
    result = MagicMock()
    result.scalar_one_or_none.return_value = scalar
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = scalars_list or []
    result.scalars.return_value = scalars_mock
    return result


def _mock_db(*results) -> AsyncMock:
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=list(results))
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.flush = AsyncMock()
    db.add = MagicMock()
    return db


@pytest.fixture(autouse=True)
def _patch_notify(monkeypatch):
    mock = AsyncMock()
    monkeypatch.setattr(pr_endpoint, "notify_user", mock)
    return mock


# ---------------------------------------------------------------------------
# Stage 1 -- scoped COORDINADOR
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_scoped_coordinador_approves_pending_request():
    dept_id = uuid4()
    actor = _coordinador()
    employee = _employee(department_id=dept_id)
    request = _permission_request(PermissionRequestStatus.pending, employee_id=employee.id)
    db = _mock_db(
        _db_result(scalar=request),  # _get_request_or_404
        _db_result(scalar=employee),  # _get_request_employee
        _db_result(scalars_list=[_scope_assignment(user=actor, department_id=dept_id)]),  # resolve_user_scopes
        _db_result(scalars_list=[]),  # _resolve_scope_director_ids (no director scoped)
    )

    result = await pr_endpoint.approve_permission_request(
        db, actor, request.id, PermissionRequestApprove(notes="ok")
    )

    assert result.status == PermissionRequestStatus.coordinator_approved
    assert request.coordinator_reviewed_by == actor.id
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_scoped_coordinador_rejects_pending_request_with_reason():
    dept_id = uuid4()
    actor = _coordinador()
    employee = _employee(department_id=dept_id)
    request = _permission_request(PermissionRequestStatus.pending, employee_id=employee.id)
    db = _mock_db(
        _db_result(scalar=request),
        _db_result(scalar=employee),
        _db_result(scalars_list=[_scope_assignment(user=actor, department_id=dept_id)]),
    )

    result = await pr_endpoint.reject_permission_request(
        db, actor, request.id, PermissionRequestReject(rejection_reason="no aplica")
    )

    assert result.status == PermissionRequestStatus.rejected
    assert result.rejection_stage == RejectionStage.coordinator
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_out_of_scope_coordinador_denied():
    actor = _coordinador()
    employee = _employee(department_id=uuid4())  # different department than actor's scope
    request = _permission_request(PermissionRequestStatus.pending, employee_id=employee.id)
    db = _mock_db(
        _db_result(scalar=request),
        _db_result(scalar=employee),
        _db_result(scalars_list=[_scope_assignment(user=actor, department_id=uuid4())]),
    )

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.approve_permission_request(
            db, actor, request.id, PermissionRequestApprove(notes="ok")
        )
    assert exc_info.value.status_code == 403
    assert request.status == PermissionRequestStatus.pending
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_non_coordinador_denied_stage1():
    actor = _catedratico()
    request = _permission_request(PermissionRequestStatus.pending)
    db = _mock_db(_db_result(scalar=request))

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.approve_permission_request(
            db, actor, request.id, PermissionRequestApprove(notes="ok")
        )
    assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# Stage 2 -- assigned SECRETARIA, mandatory justification
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_assigned_secretaria_approves_with_justification():
    director = _director()
    actor = _secretaria()
    employee = _employee(department_id=uuid4())
    request = _permission_request(PermissionRequestStatus.coordinator_approved, employee_id=employee.id)
    db = _mock_db(
        _db_result(scalar=request),
        _db_result(scalar=employee),
        _db_result(
            scalars_list=[_scope_assignment(user=director, department_id=employee.department_id)]
        ),  # _resolve_scope_director_ids
        _db_result(
            scalars_list=[_scope_assignment(user=actor, director_user_id=director.id)]
        ),  # resolve_user_scopes(actor)
    )

    result = await pr_endpoint.approve_permission_request(
        db, actor, request.id, PermissionRequestApprove(notes="justificación real")
    )

    assert result.status == PermissionRequestStatus.approved
    assert request.director_reviewed_by == actor.id
    assert request.director_notes == "justificación real"
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_assigned_secretaria_rejects_with_justification():
    director = _director()
    actor = _secretaria()
    employee = _employee(location_id=uuid4())
    request = _permission_request(PermissionRequestStatus.coordinator_approved, employee_id=employee.id)
    db = _mock_db(
        _db_result(scalar=request),
        _db_result(scalar=employee),
        _db_result(
            scalars_list=[_scope_assignment(user=director, location_id=employee.location_id)]
        ),
        _db_result(scalars_list=[_scope_assignment(user=actor, director_user_id=director.id)]),
    )

    result = await pr_endpoint.reject_permission_request(
        db, actor, request.id, PermissionRequestReject(rejection_reason="justificación real")
    )

    assert result.status == PermissionRequestStatus.rejected
    assert result.rejection_stage == RejectionStage.director
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_stage2_approve_without_justification_returns_422():
    director = _director()
    actor = _secretaria()
    employee = _employee(department_id=uuid4())
    request = _permission_request(PermissionRequestStatus.coordinator_approved, employee_id=employee.id)
    db = _mock_db(
        _db_result(scalar=request),
        _db_result(scalar=employee),
        _db_result(scalars_list=[_scope_assignment(user=director, department_id=employee.department_id)]),
        _db_result(scalars_list=[_scope_assignment(user=actor, director_user_id=director.id)]),
    )

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.approve_permission_request(
            db, actor, request.id, PermissionRequestApprove(notes="   ")
        )
    assert exc_info.value.status_code == 422
    assert request.status == PermissionRequestStatus.coordinator_approved
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_stage2_reject_without_justification_returns_422():
    director = _director()
    actor = _secretaria()
    employee = _employee(department_id=uuid4())
    request = _permission_request(PermissionRequestStatus.coordinator_approved, employee_id=employee.id)
    db = _mock_db(
        _db_result(scalar=request),
        _db_result(scalar=employee),
        _db_result(scalars_list=[_scope_assignment(user=director, department_id=employee.department_id)]),
        _db_result(scalars_list=[_scope_assignment(user=actor, director_user_id=director.id)]),
    )

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.reject_permission_request(
            db, actor, request.id, PermissionRequestReject(rejection_reason="")
        )
    assert exc_info.value.status_code == 422
    assert request.status == PermissionRequestStatus.coordinator_approved
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_unassigned_secretaria_denied():
    director = _director()
    other_director = _director()
    actor = _secretaria()
    employee = _employee(department_id=uuid4())
    request = _permission_request(PermissionRequestStatus.coordinator_approved, employee_id=employee.id)
    db = _mock_db(
        _db_result(scalar=request),
        _db_result(scalar=employee),
        _db_result(scalars_list=[_scope_assignment(user=director, department_id=employee.department_id)]),
        _db_result(
            scalars_list=[_scope_assignment(user=actor, director_user_id=other_director.id)]
        ),  # assigned to a *different* director
    )

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.approve_permission_request(
            db, actor, request.id, PermissionRequestApprove(notes="ok")
        )
    assert exc_info.value.status_code == 403
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_stage2_denied_when_no_director_scoped_to_request():
    actor = _secretaria()
    employee = _employee(department_id=uuid4())
    request = _permission_request(PermissionRequestStatus.coordinator_approved, employee_id=employee.id)
    db = _mock_db(
        _db_result(scalar=request),
        _db_result(scalar=employee),
        _db_result(scalars_list=[]),  # no DIRECTOR scoped to this facultad/sede
    )

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.reject_permission_request(
            db, actor, request.id, PermissionRequestReject(rejection_reason="motivo")
        )
    assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# DIRECTOR denied at any stage; stage 2 while stage 1 incomplete is denied
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_director_cannot_approve_at_stage1():
    actor = _director()
    request = _permission_request(PermissionRequestStatus.pending)
    db = _mock_db(_db_result(scalar=request))

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.approve_permission_request(
            db, actor, request.id, PermissionRequestApprove(notes="ok")
        )
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_director_cannot_reject_at_stage2():
    actor = _director()
    request = _permission_request(PermissionRequestStatus.coordinator_approved)
    db = _mock_db(_db_result(scalar=request))

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.reject_permission_request(
            db, actor, request.id, PermissionRequestReject(rejection_reason="motivo")
        )
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_stage2_action_while_still_pending_is_denied():
    actor = _secretaria()
    request = _permission_request(PermissionRequestStatus.pending)
    db = _mock_db(_db_result(scalar=request))

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.approve_permission_request(
            db, actor, request.id, PermissionRequestApprove(notes="ok")
        )
    assert exc_info.value.status_code == 403
    assert request.status == PermissionRequestStatus.pending


# ---------------------------------------------------------------------------
# Director Notification Visibility -- notified on transition to
# coordinator_approved
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_scoped_director_notified_on_coordinator_approval(_patch_notify):
    dept_id = uuid4()
    actor = _coordinador()
    director = _director()
    employee = _employee(department_id=dept_id)
    request = _permission_request(PermissionRequestStatus.pending, employee_id=employee.id)
    db = _mock_db(
        _db_result(scalar=request),
        _db_result(scalar=employee),
        _db_result(scalars_list=[_scope_assignment(user=actor, department_id=dept_id)]),
        _db_result(scalars_list=[_scope_assignment(user=director, department_id=dept_id)]),
    )

    await pr_endpoint.approve_permission_request(
        db, actor, request.id, PermissionRequestApprove(notes="ok")
    )

    notified_user_ids = {call.kwargs["user_id"] for call in _patch_notify.await_args_list}
    assert str(director.id) in notified_user_ids
