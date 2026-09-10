"""Tests for task 3.14: `permission_requests.py` visibility + creation.

Spec: permission-request-workflow "Permission Request Visibility",
"Permission Request Creation", "Requester Outcome Notification".

Mocked-`AsyncSession` unit tests, matching this project's established
`_mock_db`/`_db_result` pattern (see `test_permission_requests_two_stage.py`,
`test_employees_endpoint.py`).
"""

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import permission_requests as pr_endpoint
from app.core.config import get_settings
from app.models.permission_request import PermissionRequestStatus
from app.schemas.permission_request import PermissionRequestCreate

settings = get_settings()


def _user(role_name: str, permission_codes: list[str] | None = None, **overrides) -> SimpleNamespace:
    permissions = [SimpleNamespace(code=code) for code in (permission_codes or [])]
    role = SimpleNamespace(name=role_name, permissions=permissions, is_active=True)
    return SimpleNamespace(
        id=overrides.pop("id", uuid4()),
        email=overrides.pop("email", f"{role_name.lower()}@example.com"),
        role=role_name,
        employee_id=overrides.pop("employee_id", None),
        user_roles=[SimpleNamespace(role=role)],
        **overrides,
    )


def _coordinador(**overrides) -> SimpleNamespace:
    return _user("COORDINADOR", **overrides)


def _secretaria(**overrides) -> SimpleNamespace:
    return _user("SECRETARIA", **overrides)


def _director(**overrides) -> SimpleNamespace:
    return _user("DIRECTOR", **overrides)


def _catedratico(**overrides) -> SimpleNamespace:
    return _user("CATEDRATICO", **overrides)


def _decano(**overrides) -> SimpleNamespace:
    return _user("DECANO", **overrides)


def _dueno(**overrides) -> SimpleNamespace:
    return _user("DUEÑO", **overrides)


def _dev(**overrides) -> SimpleNamespace:
    return _user("DEV", **overrides)


def _bootstrap_admin(**overrides) -> SimpleNamespace:
    overrides.setdefault("email", settings.bootstrap_admin_email)
    return _user("ADMIN", **overrides)


def _employee(department_id=None, location_id=None) -> SimpleNamespace:
    return SimpleNamespace(id=uuid4(), department_id=department_id, location_id=location_id)


def _permission_request(status_value=PermissionRequestStatus.pending, **overrides) -> SimpleNamespace:
    return SimpleNamespace(
        id=overrides.pop("id", uuid4()),
        requested_by_user_id=overrides.pop("requested_by_user_id", uuid4()),
        employee_id=overrides.pop("employee_id", uuid4()),
        exception_type="permiso médico",
        start_date="2026-07-01",
        end_date="2026-07-01",
        description=None,
        status=status_value,
        coordinator_reviewed_by=None,
        coordinator_reviewed_at=None,
        coordinator_notes=None,
        director_reviewed_by=None,
        director_reviewed_at=None,
        director_notes=None,
        rejection_stage=None,
        rejection_reason=overrides.pop("rejection_reason", None),
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


# ---------------------------------------------------------------------------
# GET /permission-requests/{id} -- visibility
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_owner_views_own_request():
    actor = _catedratico()
    request = _permission_request(requested_by_user_id=actor.id)
    db = _mock_db(_db_result(scalar=request))  # _get_request_or_404

    result = await pr_endpoint.get_permission_request(db, actor, request.id)

    assert result.id == request.id


@pytest.mark.asyncio
async def test_scoped_coordinador_views_request():
    dept_id = uuid4()
    actor = _coordinador()
    employee = _employee(department_id=dept_id)
    request = _permission_request(employee_id=employee.id)
    db = _mock_db(
        _db_result(scalar=request),  # _get_request_or_404
        _db_result(scalar=employee),  # _get_request_employee
        _db_result(scalars_list=[_scope_assignment(user=actor, department_id=dept_id)]),  # resolve_user_scopes
    )

    result = await pr_endpoint.get_permission_request(db, actor, request.id)

    assert result.id == request.id


@pytest.mark.asyncio
async def test_scoped_director_views_request_read_only():
    dept_id = uuid4()
    actor = _director()
    employee = _employee(department_id=dept_id)
    request = _permission_request(employee_id=employee.id)
    db = _mock_db(
        _db_result(scalar=request),
        _db_result(scalar=employee),
        _db_result(scalars_list=[_scope_assignment(user=actor, department_id=dept_id)]),
    )

    result = await pr_endpoint.get_permission_request(db, actor, request.id)

    assert result.id == request.id


@pytest.mark.asyncio
async def test_assigned_secretaria_views_request():
    director = _director()
    actor = _secretaria()
    employee = _employee(department_id=uuid4())
    request = _permission_request(employee_id=employee.id)
    db = _mock_db(
        _db_result(scalar=request),
        _db_result(scalar=employee),  # _get_request_employee
        _db_result(
            scalars_list=[_scope_assignment(user=director, department_id=employee.department_id)]
        ),  # _resolve_scope_director_ids
        _db_result(
            scalars_list=[_scope_assignment(user=actor, director_user_id=director.id)]
        ),  # resolve_user_scopes(actor)
    )

    result = await pr_endpoint.get_permission_request(db, actor, request.id)

    assert result.id == request.id


@pytest.mark.asyncio
async def test_scoped_coordinador_denied_cross_facultad_view():
    """Task 3.15 (cross-scope denial): a `COORDINADOR` with a real
    `user_scope_assignments` row for one facultad MUST be denied detail
    visibility on a request whose employee belongs to a *different*
    facultad -- not merely an unscoped/unrelated actor. Exercises the
    same `assert_request_scope` cross-scope-mismatch path already proven
    at the stage-1 approval layer (`test_out_of_scope_coordinador_denied`
    in `test_permission_requests_two_stage.py`), but at the read/visibility
    layer, which had no dedicated cross-scope-mismatch test before this
    task -- only an unrelated-actor (no scope at all) case.
    """
    actor_dept_id = uuid4()
    request_dept_id = uuid4()  # deliberately different facultad
    actor = _coordinador()
    employee = _employee(department_id=request_dept_id)
    request = _permission_request(employee_id=employee.id)
    db = _mock_db(
        _db_result(scalar=request),  # _get_request_or_404
        _db_result(scalar=employee),  # _get_request_employee
        _db_result(
            scalars_list=[_scope_assignment(user=actor, department_id=actor_dept_id)]
        ),  # resolve_user_scopes(actor) -- scoped, but to a different facultad
    )

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.get_permission_request(db, actor, request.id)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_scoped_director_denied_cross_facultad_view():
    """Same cross-scope-mismatch proof as above, for the read-only
    `DIRECTOR` visibility path (spec "DIRECTOR accesses assigned academic
    management read-only" + "Cross-scope denial tests cover organizational
    boundaries").
    """
    actor_dept_id = uuid4()
    request_dept_id = uuid4()
    actor = _director()
    employee = _employee(department_id=request_dept_id)
    request = _permission_request(employee_id=employee.id)
    db = _mock_db(
        _db_result(scalar=request),
        _db_result(scalar=employee),
        _db_result(
            scalars_list=[_scope_assignment(user=actor, department_id=actor_dept_id)]
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.get_permission_request(db, actor, request.id)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_assigned_secretaria_denied_wrong_director_view():
    """Task 3.15 (cross-scope denial): a `SECRETARIA` assigned to
    director X MUST be denied detail visibility on a request whose
    resolved scope director is Y -- not merely an unassigned secretaría
    (no director link at all). Read-layer counterpart of
    `test_unassigned_secretaria_denied` in
    `test_permission_requests_two_stage.py`, which only proves this at
    the stage-2 approval transition.
    """
    director_x = _director()
    director_y = _director()
    actor = _secretaria()
    employee = _employee(department_id=uuid4())
    request = _permission_request(employee_id=employee.id)
    db = _mock_db(
        _db_result(scalar=request),
        _db_result(scalar=employee),  # _get_request_employee
        _db_result(
            scalars_list=[_scope_assignment(user=director_y, department_id=employee.department_id)]
        ),  # _resolve_scope_director_ids -- request's real scope director is Y
        _db_result(
            scalars_list=[_scope_assignment(user=actor, director_user_id=director_x.id)]
        ),  # resolve_user_scopes(actor) -- actor is assigned to director X, not Y
    )

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.get_permission_request(db, actor, request.id)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_unrelated_actor_cannot_view_request():
    actor = _catedratico()
    employee = _employee(department_id=uuid4())
    request = _permission_request(employee_id=employee.id)
    db = _mock_db(
        _db_result(scalar=request),
        _db_result(scalar=employee),
    )

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.get_permission_request(db, actor, request.id)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_decano_cannot_view_request_by_id():
    actor = _decano()
    request = _permission_request()
    db = _mock_db(_db_result(scalar=request))  # _get_request_or_404 only

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.get_permission_request(db, actor, request.id)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_dueno_cannot_view_request_by_id():
    actor = _dueno()
    request = _permission_request()
    db = _mock_db(_db_result(scalar=request))

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.get_permission_request(db, actor, request.id)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_dev_views_any_request():
    actor = _dev()
    request = _permission_request()
    db = _mock_db(_db_result(scalar=request))

    result = await pr_endpoint.get_permission_request(db, actor, request.id)

    assert result.id == request.id


@pytest.mark.asyncio
async def test_bootstrap_admin_views_any_request():
    actor = _bootstrap_admin()
    request = _permission_request()
    db = _mock_db(_db_result(scalar=request))

    result = await pr_endpoint.get_permission_request(db, actor, request.id)

    assert result.id == request.id


@pytest.mark.asyncio
async def test_requester_sees_final_status_and_justification():
    actor = _catedratico()
    request = _permission_request(
        status_value=PermissionRequestStatus.rejected,
        requested_by_user_id=actor.id,
        rejection_reason="motivo real",
    )
    db = _mock_db(_db_result(scalar=request))

    result = await pr_endpoint.get_permission_request(db, actor, request.id)

    assert result.status == PermissionRequestStatus.rejected
    assert result.rejection_reason == "motivo real"


# ---------------------------------------------------------------------------
# GET /permission-requests -- visibility (list form)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_decano_cannot_list_requests():
    actor = _decano()
    db = _mock_db()

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.list_permission_requests(db, actor, skip=0, limit=50)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_dueno_cannot_list_requests():
    actor = _dueno()
    db = _mock_db()

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.list_permission_requests(db, actor, skip=0, limit=50)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_scoped_coordinador_list_scopes_query_to_visible_employees():
    dept_id = uuid4()
    actor = _coordinador()
    visible_employee_id = uuid4()
    db = _mock_db(
        _db_result(scalars_list=[_scope_assignment(user=actor, department_id=dept_id)]),  # resolve_user_scopes
        _db_result(scalars_list=[visible_employee_id]),  # Employee.id lookup
        _db_result(scalars_list=[]),  # final list query
    )

    result = await pr_endpoint.list_permission_requests(db, actor, skip=0, limit=50)

    assert result == []
    db.execute.assert_awaited()


@pytest.mark.asyncio
async def test_catedratico_list_restricted_to_own_no_scope_query():
    actor = _catedratico()
    db = _mock_db(_db_result(scalars_list=[]))  # only the final owner-filtered list query

    result = await pr_endpoint.list_permission_requests(db, actor, skip=0, limit=50)

    assert result == []
    assert db.execute.await_count == 1


@pytest.mark.asyncio
async def test_dev_list_sees_all_no_scope_query():
    actor = _dev()
    db = _mock_db(_db_result(scalars_list=[]))

    result = await pr_endpoint.list_permission_requests(db, actor, skip=0, limit=50)

    assert result == []
    assert db.execute.await_count == 1


# ---------------------------------------------------------------------------
# POST /permission-requests -- creation identity boundary
# ---------------------------------------------------------------------------


def _valid_create_payload(employee_id) -> PermissionRequestCreate:
    from datetime import date, timedelta

    start = date.today() + timedelta(days=10)
    return PermissionRequestCreate(
        employee_id=employee_id,
        exception_type="permiso médico",
        start_date=start,
        end_date=start,
        start_time="08:00:00",
        end_time="12:00:00",
        description=None,
    )


@pytest.mark.asyncio
async def test_catedratico_creates_own_request():
    own_employee_id = uuid4()
    actor = _catedratico(employee_id=own_employee_id)
    db = _mock_db()

    async def _fake_refresh(obj):
        obj.id = uuid4()
        obj.hours_affected = None
        obj.created_at = datetime(2026, 1, 1)

    db.refresh = AsyncMock(side_effect=_fake_refresh)

    result = await pr_endpoint.create_permission_request(
        db, actor, _valid_create_payload(own_employee_id)
    )

    assert result.employee_id == own_employee_id
    assert result.status == PermissionRequestStatus.pending
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_actor_cannot_create_request_for_unrelated_employee():
    actor = _catedratico(employee_id=uuid4())
    other_employee_id = uuid4()
    db = _mock_db()

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.create_permission_request(
            db, actor, _valid_create_payload(other_employee_id)
        )
    assert exc_info.value.status_code == 403
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_actor_with_no_employee_identity_cannot_create_request():
    actor = _coordinador(employee_id=None)
    db = _mock_db()

    with pytest.raises(HTTPException) as exc_info:
        await pr_endpoint.create_permission_request(
            db, actor, _valid_create_payload(uuid4())
        )
    assert exc_info.value.status_code == 403
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_dev_can_create_request_for_any_employee():
    actor = _dev(employee_id=None)
    target_employee_id = uuid4()
    db = _mock_db()

    async def _fake_refresh(obj):
        obj.id = uuid4()
        obj.hours_affected = None
        obj.created_at = datetime(2026, 1, 1)

    db.refresh = AsyncMock(side_effect=_fake_refresh)

    result = await pr_endpoint.create_permission_request(
        db, actor, _valid_create_payload(target_employee_id)
    )

    assert result.employee_id == target_employee_id
    db.commit.assert_awaited_once()
