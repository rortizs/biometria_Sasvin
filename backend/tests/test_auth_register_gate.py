"""Tests for the security-critical fix to `POST /auth/register`'s actor gate.

Real gap this closes: `register()` (`backend/app/api/v1/endpoints/auth.py`)
was still gated by `Depends(get_current_active_admin)`, whose deploy-safe
fallback allowlist is `{ADMIN, DEV, DECANO, DUEÑO}` (`deps.py`,
`deploy_safe_admin_roles`). `users.py`'s CRUD routes were already migrated to
`require_permission("users.manage")` in Phase 2 (task 2.2), but `/auth/register`
was never revisited. `users.manage` is granted only to `ADMIN`/`DEV` via the
unfiltered `202606101200` cross-join -- DECANO/DUEÑO never get a
`role_permissions` row for it -- so this endpoint let DECANO/DUEÑO create
arbitrary non-technical-role users, contradicting the "Business Top Role
Boundaries" spec requirement ("MUST NOT... perform any operational write
action").

Fix: swap `get_current_active_admin` for `require_permission("users.manage")`,
reusing the exact permission code `users.py`'s `update_user`/`create`/
`delete` routes already use (verified via `rg`, not invented). `ensure_can_assign_role`
inside the endpoint body is unchanged -- it already prevents any actor
(including a legitimate `users.manage` holder) from minting `ADMIN`/`DEV`/
`ADMINISTRATIVO`, covered by the pre-existing `test_auth_register_denies_*`
tests in `test_rbac_access_model.py`, which call `register()` directly and so
never exercised the route-level DI gate this file tests.

Route-wiring is verified structurally (inspecting `route.dependant`), same
convention as `test_employees_delete_gate.py`/`test_settings_faces_endpoint.py`
(FastAPI resolves `Depends(...)` before the endpoint body runs). Gate
allow/deny behavior is verified directly against `require_permission(...)`.
"""

import inspect
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api import deps
from app.api.deps import require_permission
from app.api.v1.endpoints import auth as auth_endpoint


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


# ==================== Route wiring: coarse gate replaced ====================


def test_register_uses_require_permission_not_admin_gate():
    route = _route(auth_endpoint.router, "/register", "POST")
    calls = _dependency_calls(route)
    assert deps.get_current_active_admin not in calls
    assert _route_permission_codes(route) == {"users.manage"}


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
async def test_register_gate_denies_business_top_role_without_grant(role_name):
    # BUG this closes: `get_current_active_admin`'s deploy-safe allowlist
    # included DECANO/DUEÑO, granting them permanent user-creation access
    # via /auth/register despite the "Business Top Role Boundaries" spec
    # denying them any operational write action. Neither role has a seeded
    # `role_permissions` row for `users.manage`, so `require_permission`
    # denies them by construction.
    gate = require_permission("users.manage")
    actor = _user(role_name, [])

    with pytest.raises(HTTPException) as exc_info:
        await gate(actor)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("role_name", ["ADMIN", "DEV"])
async def test_register_gate_allows_actor_with_explicit_grant(role_name):
    gate = require_permission("users.manage")
    actor = _user(role_name, ["users.manage"])

    assert await gate(actor) is actor
