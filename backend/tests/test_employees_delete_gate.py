"""Tests for task 3.9b: `employees.py` `delete_employee` coarse-gate
replacement.

Real gap flagged (not fixed) by task 3.11: `delete_employee` was the only
remaining write action in `employees.py` still using
`get_current_active_admin` after task 3.9 replaced `create_employee`/
`update_employee`'s gate with `require_permission("employees.manage.catedratico")`.
`get_current_active_admin`'s deploy-safe fallback allowlist is
`{ADMIN, DEV, DECANO, DUEÑO}` (spec: rbac-access-model "Business Top Role
Boundaries" -- "DECANO and DUEÑO cannot perform operational write actions"),
so DECANO/DUEÑO could still delete employees. This closes it with
`require_permission("employees.delete")`, reusing the pre-existing
`employees.delete` permission code seeded by the legacy migration
`9f8e7d6c5b4a` and already granted to ADMIN/DEV via `202606101200`'s
unfiltered cross-join (that migration ran after `9f8e7d6c5b4a`, so it
covers every code seeded there, including `employees.delete` -- no new
migration needed, same reasoning as `settings.update` in task 3.11).

`list_employees`/`get_employee` are intentionally left untouched -- they
only ever required `get_current_user` (authentication only, no
fine-grained read gate), same convention as `schedules.py`'s reads
(`test_schedules_endpoint.py`). Neither ever used `get_current_active_admin`.

Route-wiring is verified structurally (inspecting `route.dependant`) since
FastAPI resolves `Depends(...)` before the endpoint body runs. Gate
allow/deny behavior is verified directly against `require_permission(...)`,
same convention as `test_settings_faces_endpoint.py`.
"""

import inspect
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api import deps
from app.api.deps import require_permission
from app.api.v1.endpoints import employees as employees_endpoint


def _route(router, path: str, method: str):
    return next(
        r for r in router.routes if getattr(r, "path", None) == path and method in r.methods
    )


def _dependency_calls(route) -> set:
    return {dependency.call for dependency in route.dependant.dependencies}


def _route_permission_codes(route) -> set[str]:
    codes: set[str] = set()
    for dependency in route.dependant.dependencies:
        nonlocals = inspect.getclosurevars(dependency.call).nonlocals
        if "code" in nonlocals:
            codes.add(nonlocals["code"])
    return codes


# ==================== Reads: unaffected by this slice ====================


def test_list_employees_stays_authentication_only():
    route = _route(employees_endpoint.router, "/", "GET")
    calls = _dependency_calls(route)
    assert deps.get_current_user in calls
    assert deps.get_current_active_admin not in calls
    assert not _route_permission_codes(route)


def test_get_employee_stays_authentication_only():
    route = _route(employees_endpoint.router, "/{employee_id}", "GET")
    calls = _dependency_calls(route)
    assert deps.get_current_user in calls
    assert deps.get_current_active_admin not in calls
    assert not _route_permission_codes(route)


# ============ create/update: task 3.9's gate must not regress ============


@pytest.mark.parametrize("path, method", [("/", "POST"), ("/{employee_id}", "PATCH")])
def test_create_update_employee_keep_manage_catedratico_gate(path, method):
    route = _route(employees_endpoint.router, path, method)
    calls = _dependency_calls(route)
    assert deps.get_current_active_admin not in calls
    assert _route_permission_codes(route) == {"employees.manage.catedratico"}


# ==================== Write: coarse gate replaced ====================


def test_delete_employee_uses_require_permission_not_admin_gate():
    route = _route(employees_endpoint.router, "/{employee_id}", "DELETE")
    calls = _dependency_calls(route)
    assert deps.get_current_active_admin not in calls
    assert _route_permission_codes(route) == {"employees.delete"}


# ==================== Gate allow/deny (executed directly) ====================


def _assignment(role_name: str, permission_codes: list[str]) -> SimpleNamespace:
    permissions = [SimpleNamespace(code=code) for code in permission_codes]
    role = SimpleNamespace(name=role_name, permissions=permissions, is_active=True)
    return SimpleNamespace(role=role)


def _user(role_name: str, permission_codes: list[str]) -> SimpleNamespace:
    return SimpleNamespace(
        email=f"{role_name.lower()}@example.com",
        user_roles=[_assignment(role_name, permission_codes)],
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("role_name", ["DECANO", "DUEÑO"])
async def test_delete_employee_gate_denies_business_top_role_without_grant(role_name):
    # BUG this closes: `get_current_active_admin`'s deploy-safe allowlist
    # included DECANO/DUEÑO, granting them permanent employee-delete access.
    # Neither role has a seeded `role_permissions` row for `employees.delete`,
    # so `require_permission` denies them by construction.
    gate = require_permission("employees.delete")
    actor = _user(role_name, [])

    with pytest.raises(HTTPException) as exc_info:
        await gate(actor)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_delete_employee_gate_allows_actor_with_explicit_grant():
    gate = require_permission("employees.delete")
    actor = _user("ADMIN", ["employees.delete"])

    assert await gate(actor) is actor
