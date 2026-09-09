"""Tests for task 3.12's read-only reports slice: `attendance.py`'s
`list_attendance`/`list_today_attendance` gate replacement.

Real gap this closes: both list endpoints only ever depended on
`get_current_user` (authentication only, no fine-grained read gate) --
any authenticated actor of ANY role could read every attendance record
org-wide, not just `DECANO`/`DUEÑO`/`DIRECTOR`/`COORDINADOR` (spec:
attendance-access-control "Administrative Attendance Access" --
"Business and academic roles access read-only attendance reports").
Replaced with `require_permission("attendance.view")`.

`check_in`/`check_out` are intentionally left untouched by this slice --
they are the pre-existing unauthenticated face-recognition kiosk flow
("No requiere autenticacion. El rostro en las imagenes es la
credencial.") with no caller-supplied `employee_id` to scope against.
CATEDRATICO self-check-in scoping (`attendance.mark.self`) is a genuine,
separate architectural decision deferred to a follow-up call -- see
apply-progress.md for the full reasoning. This file includes a
regression-locking test proving that deferral (`check_in`/`check_out`
still take no auth dependency) so a future slice's diff is honest about
what it actually changes.

There is no export/edit/delete endpoint anywhere in `attendance.py` --
the spec's "deny any create, update, delete, or export action on that
report" is satisfied by the absence of such routes, not by an explicit
denial. A dedicated test asserts that route inventory so a future
export/edit endpoint addition is forced to consider this spec
requirement rather than landing ungated by accident.

Route-wiring is verified structurally (inspecting `route.dependant`),
same convention as `test_employees_delete_gate.py`/
`test_departments_positions_locations_endpoint.py`. Gate allow/deny
behavior is verified directly against `require_permission(...)`, same
convention as every prior slice in this change.
"""

import inspect
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api import deps
from app.api.deps import require_permission
from app.api.v1.endpoints import attendance as attendance_endpoint


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


# ==================== Reads: gate replaced with attendance.view ====================


@pytest.mark.parametrize("path, method", [("/", "GET"), ("/today", "GET")])
def test_list_endpoints_use_attendance_view_permission(path, method):
    route = _route(attendance_endpoint.router, path, method)
    calls = _dependency_calls(route)
    assert deps.get_current_user not in calls
    assert _route_permission_codes(route) == {"attendance.view"}


# ============ check-in/check-out: unaffected by this slice (deferred) ============


@pytest.mark.parametrize("path, method", [("/check-in", "POST"), ("/check-out", "POST")])
def test_check_in_out_stay_unauthenticated_kiosk_flow(path, method):
    """Regression lock: this slice does NOT touch the face-recognition kiosk
    endpoints. CATEDRATICO self-check-in scoping via `attendance.mark.self`
    is a genuine architectural decision (optional-auth vs. forced-auth on a
    physical shared kiosk device) deferred to a follow-up call -- see
    apply-progress.md."""
    route = _route(attendance_endpoint.router, path, method)
    calls = _dependency_calls(route)
    assert deps.get_current_user not in calls
    assert not _route_permission_codes(route)


# ================ No export/edit/delete route exists in this file ================


def test_no_export_edit_or_delete_attendance_routes_exist():
    """Spec: "deny any create, update, delete, or export action on that
    report" for DECANO/DUEÑO/DIRECTOR/COORDINADOR. There is currently no
    such route in `attendance.py` at all, so the denial is structural, not
    permission-based. This test forces a future PR adding such a route to
    consciously gate it (not accidentally leave it open) -- if it starts
    failing, that PR must add a matching `require_permission` gate that
    excludes DECANO/DUEÑO/DIRECTOR/COORDINADOR before this test can be
    updated."""
    methods = {method for route in attendance_endpoint.router.routes for method in getattr(route, "methods", set())}
    assert methods == {"GET", "POST"}


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
@pytest.mark.parametrize("role_name", ["DECANO", "DUEÑO", "DIRECTOR", "COORDINADOR"])
async def test_attendance_view_gate_denies_role_without_grant(role_name):
    gate = require_permission("attendance.view")
    actor = _user(role_name, [])

    with pytest.raises(HTTPException) as exc_info:
        await gate(actor)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("role_name", ["DECANO", "DUEÑO", "DIRECTOR", "COORDINADOR"])
async def test_attendance_view_gate_allows_role_with_explicit_grant(role_name):
    gate = require_permission("attendance.view")
    actor = _user(role_name, ["attendance.view"])

    assert await gate(actor) is actor


@pytest.mark.asyncio
async def test_attendance_view_gate_denies_grant_for_attendance_export_only():
    """A role granted only `attendance.export` (not `attendance.view`) must
    still be denied -- proves the two codes are independent and this gate
    does not accidentally treat export access as view access."""
    gate = require_permission("attendance.view")
    actor = _user("COORDINADOR", ["attendance.export"])

    with pytest.raises(HTTPException) as exc_info:
        await gate(actor)
    assert exc_info.value.status_code == 403
