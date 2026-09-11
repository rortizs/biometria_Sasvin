"""Tests for the rest of task 3.10: `departments.py`, `positions.py`,
`locations.py` coarse-gate replacement.

Spec: rbac-access-model "Module Access Boundaries" -- "DIRECTOR accesses
assigned academic management read-only" ("MUST deny any create, update, or
delete action"), "Backend Authorization Enforcement" -- "Missing permission
denies protected route" and "Frontend visibility is insufficient".

`get_current_secretaria_or_above`/`get_current_active_admin` on every write
endpoint of these three modules are replaced by `require_permission(...)`,
same convention as `test_schedules_endpoint.py`. `list_departments`/
`get_department`/`list_positions`/`get_position`/`list_locations`/
`get_location` previously had NO authentication dependency at all (a real
pre-existing gap, matching the one already closed in `schedules.py`) --
this closes it with `get_current_user`.

Route-wiring is verified structurally (inspecting `route.dependant`) since
FastAPI resolves `Depends(...)` before the endpoint body runs. Gate
allow/deny behavior is verified directly against `require_permission(...)`.
"""

import inspect
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api import deps
from app.api.deps import require_permission
from app.api.v1.endpoints import departments as departments_endpoint
from app.api.v1.endpoints import positions as positions_endpoint
from app.api.v1.endpoints import locations as locations_endpoint


MODULES = {
    "departments": departments_endpoint.router,
    "positions": positions_endpoint.router,
    "locations": locations_endpoint.router,
}


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


# ==================== Reads: authentication gap closed ====================
# `list_*`/`get_*` previously had zero auth dependency at all -- any
# anonymous request could list/read departments, positions, and locations.


@pytest.mark.parametrize(
    ("module", "path", "method"),
    [
        ("departments", "/", "GET"),
        ("departments", "/{department_id}", "GET"),
        ("positions", "/", "GET"),
        ("positions", "/{position_id}", "GET"),
        ("locations", "/", "GET"),
        ("locations", "/{location_id}", "GET"),
    ],
)
def test_read_endpoints_now_require_authentication(module, path, method):
    route = _route(MODULES[module], path, method)
    assert deps.get_current_user in _dependency_calls(route)


# ==================== Writes: coarse gate replaced ====================
# The deprecated `get_current_secretaria_or_above`/`get_current_active_admin`
# gates must no longer appear on any write route; each is replaced by a
# `require_permission(...)` dependency carrying the matching permission code.


@pytest.mark.parametrize(
    ("module", "path", "method", "expected_code"),
    [
        ("departments", "/", "POST", "departments.create"),
        ("departments", "/{department_id}", "PATCH", "departments.update"),
        ("departments", "/{department_id}", "DELETE", "departments.delete"),
        ("positions", "/", "POST", "positions.create"),
        ("positions", "/{position_id}", "PATCH", "positions.update"),
        ("positions", "/{position_id}", "DELETE", "positions.delete"),
        ("locations", "/", "POST", "locations.create"),
        ("locations", "/{location_id}", "PATCH", "locations.update"),
        ("locations", "/{location_id}", "DELETE", "locations.delete"),
    ],
)
def test_write_endpoints_use_require_permission_not_coarse_gate(
    module, path, method, expected_code
):
    route = _route(MODULES[module], path, method)
    calls = _dependency_calls(route)
    assert deps.get_current_secretaria_or_above not in calls
    assert deps.get_current_active_admin not in calls
    assert _route_permission_codes(route) == {expected_code}


# ==================== Gate allow/deny (executed directly) ====================
# FastAPI resolves Depends(require_permission(...)) before the endpoint body
# runs, so the gate itself must be exercised directly to prove the
# allow/deny decision, not just that the dependency object is wired in.


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
@pytest.mark.parametrize("module", ["departments", "positions", "locations"])
async def test_create_gate_denies_coordinador_without_grant(module):
    # COORDINADOR is read-only on these modules per the corrected role
    # matrix -- no `<module>.create` grant.
    gate = require_permission(f"{module}.create")
    actor = _user("COORDINADOR", [f"{module}.view"])

    with pytest.raises(HTTPException) as exc_info:
        await gate(actor)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("module", ["departments", "positions", "locations"])
async def test_create_gate_denies_director_without_grant(module):
    # DIRECTOR is read-only per spec ("MUST deny any create, update, or
    # delete action") -- must not pass the write gate even without an
    # explicit `<module>.create` grant.
    gate = require_permission(f"{module}.create")
    actor = _user("DIRECTOR", [f"{module}.view"])

    with pytest.raises(HTTPException) as exc_info:
        await gate(actor)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("module", ["departments", "positions", "locations"])
async def test_create_gate_denies_secretaria_without_grant(module):
    # SECRETARIA's write scope is catedrático employees only (D6) -- these
    # three modules are not in SECRETARIA's write scope per the spec's
    # "Module Access Boundaries" scenarios.
    gate = require_permission(f"{module}.create")
    actor = _user("SECRETARIA", [f"{module}.view"])

    with pytest.raises(HTTPException) as exc_info:
        await gate(actor)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("module", ["departments", "positions", "locations"])
async def test_view_gate_allows_coordinador_and_director(module):
    gate = require_permission(f"{module}.view")
    for role_name in ("COORDINADOR", "DIRECTOR"):
        actor = _user(role_name, [f"{module}.view"])
        assert await gate(actor) is actor


@pytest.mark.asyncio
@pytest.mark.parametrize("module", ["departments", "positions", "locations"])
async def test_create_gate_allows_actor_with_explicit_grant(module):
    # Once an admin explicitly grants `<module>.create` to a role (the
    # staged-rollout population step design.md documents), that role's
    # actors pass the gate -- proves the gate is permission-driven, not a
    # role-name allowlist.
    gate = require_permission(f"{module}.create")
    actor = _user("ADMIN", [f"{module}.view", f"{module}.create"])

    assert await gate(actor) is actor
