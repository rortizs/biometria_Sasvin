"""Tests for task 3.11: `settings.py`/`faces.py` coarse-gate replacement.

Spec: rbac-access-model "Business Top Role Boundaries" -- "DECANO and DUEÑO
cannot perform operational write actions". `get_current_active_admin` (deploy
-safe fallback role set `{ADMIN, DEV, DECANO, DUEÑO}`) is replaced by
`require_permission(...)` on every write endpoint of both files, same
convention as `test_departments_positions_locations_endpoint.py`. Neither
role has any seeded `role_permissions` grant (confirmed: `DECANO`/`DUEÑO`
only ever had coarse role-name access, never a permission row), so this
replacement denies them by construction -- no explicit role-name denylist
needed.

`get_settings` (`GET /settings/`) previously had NO authentication
dependency at all (same pre-existing gap already closed for departments/
positions/locations/schedules) -- this closes it with `get_current_user`.

`verify_face` (`POST /faces/verify`) is intentionally left unauthenticated
-- it is the kiosk/check-in-flow identification endpoint consumed by
`frontend/.../attendance.service.ts#verifyFace`, documented in its own
docstring as "No requiere autenticación", and never used
`get_current_active_admin`. A dedicated test locks in that it stays
untouched.

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
from app.api.v1.endpoints import settings as settings_endpoint
from app.api.v1.endpoints import faces as faces_endpoint


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


def test_get_settings_now_requires_authentication():
    route = _route(settings_endpoint.router, "/", "GET")
    assert deps.get_current_user in _dependency_calls(route)


def test_verify_face_stays_unauthenticated():
    # Kiosk/check-in identification endpoint -- deliberately public, must
    # not gain an auth dependency as a side effect of this slice.
    route = _route(faces_endpoint.router, "/verify", "POST")
    calls = _dependency_calls(route)
    assert deps.get_current_user not in calls
    assert deps.get_current_active_admin not in calls
    assert not _route_permission_codes(route)


# ==================== Writes: coarse gate replaced ====================


@pytest.mark.parametrize(
    ("path", "method", "expected_code"),
    [
        ("/", "PUT", "settings.update"),
        ("/", "POST", "settings.update"),
    ],
)
def test_settings_write_endpoints_use_require_permission_not_admin_gate(
    path, method, expected_code
):
    route = _route(settings_endpoint.router, path, method)
    calls = _dependency_calls(route)
    assert deps.get_current_active_admin not in calls
    assert _route_permission_codes(route) == {expected_code}


@pytest.mark.parametrize(
    ("path", "method", "expected_code"),
    [
        ("/register", "POST", "faces.create"),
        ("/{employee_id}", "DELETE", "faces.delete"),
    ],
)
def test_faces_write_endpoints_use_require_permission_not_admin_gate(
    path, method, expected_code
):
    route = _route(faces_endpoint.router, path, method)
    calls = _dependency_calls(route)
    assert deps.get_current_active_admin not in calls
    assert _route_permission_codes(route) == {expected_code}


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
@pytest.mark.parametrize("code", ["settings.update", "faces.create", "faces.delete"])
@pytest.mark.parametrize("role_name", ["DECANO", "DUEÑO"])
async def test_write_gate_denies_business_top_role_without_grant(role_name, code):
    # BUG this closes: `get_current_active_admin`'s deploy-safe allowlist
    # included DECANO/DUEÑO, granting them an operational write path on
    # settings/faces. Neither role has a seeded `role_permissions` row for
    # these codes, so `require_permission` denies them by construction.
    gate = require_permission(code)
    actor = _user(role_name, [])

    with pytest.raises(HTTPException) as exc_info:
        await gate(actor)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("code", ["settings.update", "faces.create", "faces.delete"])
async def test_write_gate_allows_actor_with_explicit_grant(code):
    gate = require_permission(code)
    actor = _user("ADMIN", [code])

    assert await gate(actor) is actor
