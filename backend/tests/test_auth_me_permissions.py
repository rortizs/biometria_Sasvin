"""Tests for task 4.3a: expose the current user's permission codes via
`/auth/me`, so the frontend can build permission-aware guards/UI instead of
role-name string matching (see apply-progress.md's Task 4.3 evidence for why
this was previously blocked -- neither the JWT nor `/auth/me` exposed
permission codes, only `role`).

Spec: unblocks frontend task 4.3's `data.permission`-keyed route guards.

`permission_codes_for_user()` (`app/api/deps.py`) is computed from the
already-eager-loaded `user.user_roles -> role -> permissions` relationship
(the same eager-load `get_current_user()` already performs) -- no
additional DB query. It deliberately mirrors `has_permission()`'s exact
DB-backed grant-matching loop (same canonical-role filter) WITHOUT
`has_permission()`'s bootstrap-ADMIN short-circuit, relying instead on this
codebase's migration convention of granting every new permission code to
the `ADMIN`/`DEV` roles via `role_permissions` (see
`202606101200_canonical_rbac_roles.py`'s cross-join and its mirrored
`202606161200`/`202606181200`/`202606191200` follow-ups) -- so the DB-backed
set already IS the full permission catalog for bootstrap ADMIN/DEV when
migrations follow that convention. Mocked-`AsyncSession`-free unit tests
(this helper takes no `db` argument), matching this project's established
`_user`/`_assignment` `SimpleNamespace` pattern (see
`test_employees_endpoint.py`).
"""

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.deps import permission_codes_for_user
from app.api.v1.endpoints import auth as auth_endpoint
from app.models.user import UserRole


def _user(email: str, role: str | UserRole, **overrides) -> SimpleNamespace:
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=overrides.pop("id", uuid4()),
        email=email,
        role=role,
        employee_id=overrides.pop("employee_id", None),
        user_roles=overrides.pop("user_roles", []),
        is_active=overrides.pop("is_active", True),
        must_change_password=overrides.pop("must_change_password", False),
        full_name=overrides.pop("full_name", "Test User"),
        created_at=overrides.pop("created_at", now),
        updated_at=overrides.pop("updated_at", now),
        **overrides,
    )


def _assignment(role_name: str, permission_codes: list[str], is_active: bool = True) -> SimpleNamespace:
    permissions = [SimpleNamespace(code=code) for code in permission_codes]
    role = SimpleNamespace(name=role_name, permissions=permissions, is_active=is_active)
    return SimpleNamespace(role=role)


def test_permission_codes_for_user_returns_granted_codes_for_role_with_grants():
    user = _user(
        "coordinador@example.com",
        UserRole.COORDINADOR,
        user_roles=[
            _assignment(
                "COORDINADOR",
                ["employees.view", "attendance.view", "user_scopes.manage"],
            )
        ],
    )

    codes = permission_codes_for_user(user)

    assert codes == ["attendance.view", "employees.view", "user_scopes.manage"]


def test_permission_codes_for_user_deduplicates_across_multiple_role_assignments():
    user = _user(
        "multi@example.com",
        UserRole.COORDINADOR,
        user_roles=[
            _assignment("COORDINADOR", ["employees.view", "attendance.view"]),
            _assignment("COORDINADOR", ["attendance.view", "schedules.create"]),
        ],
    )

    codes = permission_codes_for_user(user)

    assert codes == ["attendance.view", "employees.view", "schedules.create"]


def test_permission_codes_for_user_returns_empty_list_for_role_with_no_grants():
    user = _user(
        "estudiante@example.com",
        UserRole.ESTUDIANTE,
        user_roles=[_assignment("ESTUDIANTE", [])],
    )

    codes = permission_codes_for_user(user)

    assert codes == []


def test_permission_codes_for_user_returns_empty_list_when_no_role_assignments_exist():
    # A user whose `role` column has a value but no `user_roles` row at all
    # (e.g. never backfilled) -- has_permission()'s loop also finds nothing
    # to iterate, so this must be empty too, not an error.
    user = _user("orphan@example.com", UserRole.COORDINADOR, user_roles=[])

    codes = permission_codes_for_user(user)

    assert codes == []


def test_permission_codes_for_user_ignores_permissions_from_inactive_role_assignment():
    # Mirrors has_permission()'s own filter exactly: `_canonical_roles_for_user`
    # skips inactive-role assignments when building the user's canonical
    # roles set. Here the user's primary `role` column (ESTUDIANTE) is
    # deliberately different from the inactive assignment's role
    # (COORDINADOR) so the assignment's canonical form has no other way to
    # land in the allowed `roles` set -- proving the inactive assignment's
    # permissions are excluded specifically because it is inactive, not
    # incidentally excluded for an unrelated reason.
    user = _user(
        "deactivated-role@example.com",
        UserRole.ESTUDIANTE,
        user_roles=[
            _assignment("COORDINADOR", ["attendance.view"], is_active=False),
        ],
    )

    codes = permission_codes_for_user(user)

    assert codes == []


def test_permission_codes_for_user_bootstrap_admin_returns_full_db_backed_grant_set():
    # Bootstrap ADMIN (identified by `bootstrap_admin_email`, task 1
    # convention) -- `has_permission()` bypasses ALL role_permissions
    # checks for this actor (`is_bootstrap_admin(user) -> return True`
    # unconditionally). `permission_codes_for_user()` does NOT special-case
    # this with a synthetic "all" sentinel; it relies on the migration
    # convention that every permission code is also explicitly granted to
    # the `ADMIN` role via `role_permissions`, so the DB-backed set already
    # equals the full catalog for this actor when migrations follow that
    # convention (documented in the function's own docstring as a known,
    # non-silent gap if a future migration ever breaks that convention).
    user = _user(
        "admin@sistemaslab.dev",  # matches Settings.bootstrap_admin_email default
        UserRole.ADMIN,
        user_roles=[
            _assignment(
                "ADMIN",
                ["employees.view", "employees.delete", "user_scopes.manage", "roles.manage"],
            )
        ],
    )

    codes = permission_codes_for_user(user)

    assert codes == ["employees.delete", "employees.view", "roles.manage", "user_scopes.manage"]


def test_permission_codes_for_user_dev_returns_db_backed_grant_set():
    # DEV (technical RBAC admin, task 2 convention) -- has_permission() has
    # NO bootstrap-style short-circuit for DEV; DEV's access is entirely
    # DB-backed via role_permissions (confirmed by reading
    # `has_permission()`/`is_bootstrap_admin()` in `app/api/deps.py` --
    # only the bootstrap-email actor gets the unconditional bypass). So
    # DEV's permission list here is exactly what has_permission() would
    # actually grant -- no convention-reliance caveat needed for DEV.
    user = _user(
        "dev@example.com",
        UserRole.DEV,
        user_roles=[_assignment("DEV", ["roles.manage", "permissions.view"])],
    )

    codes = permission_codes_for_user(user)

    assert codes == ["permissions.view", "roles.manage"]


class TestAuthMeEndpointExposesPermissions:
    """Endpoint-level: `/auth/me` (`get_current_user_info`) returns the new
    `permissions` field, sourced from `permission_codes_for_user()` with no
    additional `db` access (the endpoint function itself takes no `db`
    parameter -- confirmed by reading `auth.py` -- so this proves the
    eager-loaded relationship is genuinely sufficient, not just asserted)."""

    @pytest.mark.asyncio
    async def test_me_response_includes_permissions_for_role_with_grants(self):
        user = _user(
            "secretaria@example.com",
            UserRole.SECRETARIA,
            user_roles=[_assignment("SECRETARIA", ["employees.manage.catedratico"])],
        )

        response = await auth_endpoint.get_current_user_info(user)

        assert response.permissions == ["employees.manage.catedratico"]
        assert response.role == UserRole.SECRETARIA

    @pytest.mark.asyncio
    async def test_me_response_includes_empty_permissions_for_role_with_no_grants(self):
        user = _user(
            "estudiante@example.com",
            UserRole.ESTUDIANTE,
            user_roles=[_assignment("ESTUDIANTE", [])],
        )

        response = await auth_endpoint.get_current_user_info(user)

        assert response.permissions == []

    @pytest.mark.asyncio
    async def test_me_response_includes_full_grant_set_for_bootstrap_admin(self):
        user = _user(
            "admin@sistemaslab.dev",
            UserRole.ADMIN,
            user_roles=[_assignment("ADMIN", ["employees.view", "roles.manage"])],
        )

        response = await auth_endpoint.get_current_user_info(user)

        assert response.permissions == ["employees.view", "roles.manage"]
