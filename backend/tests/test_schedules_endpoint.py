"""Tests for task 3.10's `schedules.py` portion: coarse-gate replacement.

Spec: rbac-access-model "Module Access Boundaries" -- "DIRECTOR accesses
assigned academic management read-only" ("MUST deny any create, update, or
delete action"), "Backend Authorization Enforcement" -- "Missing permission
denies protected route" and "Frontend visibility is insufficient".

`get_current_secretaria_or_above`/`get_current_active_admin` on every
schedules.py write endpoint are replaced by `require_permission(...)`.
`list_assignments`/`list_exceptions`/`list_schedule_patterns`/
`get_schedule_pattern` previously had NO authentication dependency at all
(a real pre-existing gap, not a design choice) -- this closes it with
`get_current_user`, matching the established read-endpoint convention in
`employees.py` (authentication only, no fine-grained permission gate for
reads; only writes are permission-gated).

Route-wiring is verified structurally (inspecting `route.dependant`,
reusing `test_rbac_access_model.py`'s `_route_permission_codes` pattern)
since FastAPI resolves `Depends(...)` before the endpoint body runs -- a
mocked-`AsyncSession` call to the endpoint function directly cannot prove
the dependency is actually wired into the route. Gate allow/deny behavior
is verified directly against `require_permission(...)`, same convention as
`test_employees_endpoint.py`.
"""

import inspect

import pytest
from fastapi import HTTPException

from app.api import deps
from app.api.deps import require_permission
from app.api.v1.endpoints import schedules as schedules_endpoint
from types import SimpleNamespace


router = schedules_endpoint.router


def _route(path: str, method: str):
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
        if "codes" in nonlocals:
            codes.update(nonlocals["codes"])
    return codes


# ==================== Reads: authentication gap closed ====================
# All four previously had zero auth dependency at all -- any anonymous
# request could list/read schedule patterns, assignments, and exceptions.


@pytest.mark.parametrize(
    ("path", "method"),
    [
        ("/patterns", "GET"),
        ("/patterns/{pattern_id}", "GET"),
        ("/assignments", "GET"),
        ("/exceptions", "GET"),
    ],
)
def test_read_endpoints_now_require_authentication(path, method):
    route = _route(path, method)
    assert deps.get_current_user in _dependency_calls(route)


# ==================== Writes: coarse gate replaced ====================
# The deprecated `get_current_secretaria_or_above`/`get_current_active_admin`
# gates must no longer appear on any write route; each is replaced by a
# `require_permission(...)` dependency carrying the matching permission code.


@pytest.mark.parametrize(
    ("path", "method", "expected_code"),
    [
        ("/patterns", "POST", "schedules.create"),
        ("/patterns/{pattern_id}", "PATCH", "schedules.update"),
        ("/patterns/{pattern_id}", "DELETE", "schedules.delete"),
        ("/assignments", "POST", "schedules.create"),
        ("/assignments/bulk", "POST", "schedules.create"),
        ("/assignments/{assignment_id}", "DELETE", "schedules.delete"),
        ("/exceptions", "POST", "schedules.create"),
        ("/exceptions/{exception_id}", "PATCH", "schedules.update"),
        ("/exceptions/{exception_id}", "DELETE", "schedules.delete"),
    ],
)
def test_write_endpoints_use_require_permission_not_coarse_gate(path, method, expected_code):
    route = _route(path, method)
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
async def test_schedules_create_gate_denies_coordinador_without_grant():
    # COORDINADOR's only currently-granted schedules permission is
    # `schedules.view` (read-only, per the corrected role matrix) -- no
    # `schedules.create` grant.
    gate = require_permission("schedules.create")
    actor = _user("COORDINADOR", ["schedules.view"])

    with pytest.raises(HTTPException) as exc_info:
        await gate(actor)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_schedules_create_gate_denies_director_without_grant():
    # DIRECTOR is read-only per spec ("MUST deny any create, update, or
    # delete action") -- must not pass the write gate even without an
    # explicit `schedules.create` grant.
    gate = require_permission("schedules.create")
    actor = _user("DIRECTOR", ["schedules.view"])

    with pytest.raises(HTTPException) as exc_info:
        await gate(actor)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_schedules_view_gate_allows_coordinador_and_director():
    gate = require_permission("schedules.view")
    for role_name in ("COORDINADOR", "DIRECTOR"):
        actor = _user(role_name, ["schedules.view"])
        assert await gate(actor) is actor


@pytest.mark.asyncio
async def test_schedules_create_gate_allows_actor_with_explicit_grant():
    # Once an admin explicitly grants `schedules.create` to a role (the
    # staged-rollout population step design.md documents), that role's
    # actors pass the gate -- proves the gate is permission-driven, not a
    # role-name allowlist.
    gate = require_permission("schedules.create")
    actor = _user("SECRETARIA", ["schedules.view", "schedules.create"])

    assert await gate(actor) is actor
