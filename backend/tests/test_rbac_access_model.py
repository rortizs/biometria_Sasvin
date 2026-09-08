from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4
import importlib.util
import inspect
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.api.deps import (
    assert_object_access,
    ensure_can_assign_role,
    has_permission,
    is_bootstrap_admin,
    get_current_active_admin,
)
from app.api import deps
from app.core.config import Settings
from app.models.user import (
    ASSIGNABLE_ROLE_VALUES,
    CANONICAL_ROLE_VALUES,
    UserRole,
    canonical_role_from_value,
)
from app.schemas.role import RoleCreate, UserRoleAssign
from app.schemas.user import UserCreate, UserUpdate, UserPasswordChange
from app.api.v1.endpoints import auth as auth_endpoint
from app.api.v1.endpoints import permissions as permissions_endpoint
from app.api.v1.endpoints import roles as roles_endpoint
from app.api.v1.endpoints import users as users_endpoint
from create_admin_user import build_bootstrap_admin_values, repair_bootstrap_admin_instance


CANONICAL_ROLES = {
    "ADMIN",
    "DEV",
    "DECANO",
    "DUEÑO",
    "DIRECTOR",
    "ADMINISTRATIVO",
    "COORDINADOR",
    "SECRETARIA",
    "CATEDRATICO",
    "ESTUDIANTE",
    "PADRES",
}


def _settings(email: str = "root@example.com") -> Settings:
    return Settings(
        bootstrap_admin_email=email,
        bootstrap_admin_full_name="Root Admin",
        bootstrap_admin_password="ChangeMe123!",
    )


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
    db.add_all = MagicMock()
    return db


def _load_canonical_migration():
    migration_path = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "202606101200_canonical_rbac_roles.py"
    )
    spec = importlib.util.spec_from_file_location("canonical_rbac_roles", migration_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _route_permission_codes(router, path: str, method: str) -> set[str]:
    route = next(r for r in router.routes if getattr(r, "path", None) == path and method in r.methods)
    codes: set[str] = set()
    for dependency in route.dependant.dependencies:
        nonlocals = inspect.getclosurevars(dependency.call).nonlocals
        if "code" in nonlocals:
            codes.add(nonlocals["code"])
        if "codes" in nonlocals:
            codes.update(nonlocals["codes"])
    return codes


def test_user_role_enum_exposes_only_canonical_values_with_legacy_aliases():
    assert set(CANONICAL_ROLE_VALUES) == CANONICAL_ROLES
    assert {role.value for role in UserRole} == CANONICAL_ROLES
    assert UserRole.admin is UserRole.ADMIN
    assert UserRole.catedratico is UserRole.CATEDRATICO


@pytest.mark.parametrize(
    ("legacy_role", "expected"),
    [
        ("admin", UserRole.ADMIN),
        ("director", UserRole.DIRECTOR),
        ("coordinador", UserRole.COORDINADOR),
        ("secretaria", UserRole.SECRETARIA),
        ("supervisor", UserRole.COORDINADOR),
        ("catedratico", UserRole.CATEDRATICO),
    ],
)
def test_known_legacy_roles_map_to_canonical_roles(legacy_role, expected):
    assert canonical_role_from_value(legacy_role) is expected


def test_legacy_coordinador_no_longer_resolves_to_administrativo():
    resolved = canonical_role_from_value("coordinador")

    assert resolved is UserRole.COORDINADOR
    assert resolved is not UserRole.ADMINISTRATIVO


def test_legacy_secretaria_no_longer_resolves_to_administrativo():
    resolved = canonical_role_from_value("secretaria")

    assert resolved is UserRole.SECRETARIA
    assert resolved is not UserRole.ADMINISTRATIVO


def test_administrativo_is_excluded_from_assignable_role_values():
    assert UserRole.ADMINISTRATIVO.value in CANONICAL_ROLE_VALUES
    assert UserRole.ADMINISTRATIVO.value not in ASSIGNABLE_ROLE_VALUES
    assert UserRole.COORDINADOR.value in ASSIGNABLE_ROLE_VALUES
    assert UserRole.SECRETARIA.value in ASSIGNABLE_ROLE_VALUES


def test_unknown_role_and_missing_permission_fail_closed():
    actor = _user(
        "unknown@example.com",
        "superadmin",
        user_roles=[_assignment("mystery", ["employees.view"])],
    )

    assert canonical_role_from_value("superadmin") is None
    assert has_permission(actor, "employees.view") is False


def test_bootstrap_admin_detection_uses_configured_email_case_insensitively():
    settings = _settings("Root@Example.com")

    assert is_bootstrap_admin(_user("root@example.com", UserRole.ADMIN), settings)
    assert not is_bootstrap_admin(_user("other@example.com", UserRole.ADMIN), settings)


def test_only_bootstrap_admin_can_assign_dev_role():
    settings = _settings()
    bootstrap = _user("root@example.com", UserRole.ADMIN)
    developer = _user("dev@example.com", UserRole.DEV)
    decano = _user("dean@example.com", UserRole.DECANO)

    ensure_can_assign_role(bootstrap, UserRole.DEV, settings)

    for actor in (developer, decano):
        with pytest.raises(HTTPException) as exc_info:
            ensure_can_assign_role(actor, UserRole.DEV, settings)
        assert exc_info.value.status_code == 403


def test_admin_role_is_system_only_and_cannot_be_assigned_through_backoffice():
    settings = _settings()
    bootstrap = _user("root@example.com", UserRole.ADMIN)
    developer = _user("dev@example.com", UserRole.DEV)
    decano = _user("dean@example.com", UserRole.DECANO)

    for actor in (bootstrap, developer, decano):
        with pytest.raises(HTTPException) as exc_info:
            ensure_can_assign_role(actor, UserRole.ADMIN, settings)
        assert exc_info.value.status_code == 403


def test_permission_helper_allows_assigned_permission_and_denies_missing_permission():
    actor = _user(
        "director@example.com",
        UserRole.DIRECTOR,
        user_roles=[_assignment("DIRECTOR", ["employees.view"])],
    )

    assert has_permission(actor, "employees.view") is True
    assert has_permission(actor, "roles.update") is False


def test_non_bootstrap_admin_does_not_receive_total_permission_access():
    settings = _settings("root@example.com")
    actor = _user("legacy-admin@example.com", UserRole.ADMIN)

    assert has_permission(actor, "roles.manage", settings) is False


@pytest.mark.asyncio
async def test_legacy_business_admin_dependency_remains_deploy_safe():
    actor = _user("legacy-admin@example.com", UserRole.DECANO)

    assert await get_current_active_admin(actor) is actor


def test_object_access_allows_owner_and_denies_unrelated_actor():
    actor_id = uuid4()
    actor = _user("student@example.com", UserRole.ESTUDIANTE, id=actor_id)

    assert_object_access(actor, owner_user_id=actor_id)

    with pytest.raises(HTTPException) as exc_info:
        assert_object_access(actor, owner_user_id=uuid4())
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_users_list_hides_bootstrap_admin_from_backoffice():
    settings = _settings("root@example.com")
    bootstrap = _user("root@example.com", UserRole.ADMIN)
    visible = _user("dean@example.com", UserRole.DECANO)
    db = _mock_db(_db_result(values=[bootstrap, visible]))

    users = await users_endpoint.list_users(db, visible, settings)

    assert users == [visible]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("payload", "unchanged_field", "unchanged_value"),
    [
        (UserUpdate(full_name="Changed"), "full_name", "Root"),
        (UserUpdate(is_active=False), "is_active", True),
    ],
)
async def test_users_update_denies_bootstrap_admin_mutation_by_non_bootstrap_actor(
    payload, unchanged_field, unchanged_value
):
    settings = _settings("root@example.com")
    actor = _user("dev@example.com", UserRole.DEV)
    bootstrap = _user("root@example.com", UserRole.ADMIN, full_name="Root", is_active=True)
    db = _mock_db(_db_result(value=bootstrap))

    with pytest.raises(HTTPException) as exc_info:
        await users_endpoint.update_user(
            db,
            actor,
            bootstrap.id,
            payload,
            settings,
        )

    assert exc_info.value.status_code == 403
    assert getattr(bootstrap, unchanged_field) == unchanged_value
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_users_delete_and_password_change_deny_bootstrap_mutation_by_non_bootstrap_actor():
    settings = _settings("root@example.com")
    actor = _user("dev@example.com", UserRole.DEV)
    bootstrap = _user("root@example.com", UserRole.ADMIN, hashed_password="old-hash")

    delete_db = _mock_db(_db_result(value=bootstrap))
    with pytest.raises(HTTPException) as delete_exc:
        await users_endpoint.delete_user(delete_db, actor, bootstrap.id, settings)
    assert delete_exc.value.status_code == 403
    delete_db.delete.assert_not_awaited()
    delete_db.commit.assert_not_awaited()

    password_db = _mock_db(_db_result(value=bootstrap))
    with pytest.raises(HTTPException) as password_exc:
        await users_endpoint.change_user_password(
            password_db,
            actor,
            bootstrap.id,
            UserPasswordChange(new_password="NewPassword123!"),
            settings,
        )
    assert password_exc.value.status_code == 403
    assert bootstrap.hashed_password == "old-hash"
    password_db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_users_update_denies_dev_role_assignment_by_non_bootstrap_actor():
    settings = _settings("root@example.com")
    actor = _user("dean@example.com", UserRole.DECANO)
    target = _user("teacher@example.com", UserRole.CATEDRATICO)
    db = _mock_db(_db_result(value=target))

    with pytest.raises(HTTPException) as exc_info:
        await users_endpoint.update_user(
            db,
            actor,
            target.id,
            UserUpdate(role=UserRole.DEV),
            settings,
        )

    assert exc_info.value.status_code == 403
    assert target.role is UserRole.CATEDRATICO
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_users_update_denies_renaming_normal_user_to_reserved_bootstrap_email():
    settings = _settings("Root@Example.com")
    actor = _user("dean@example.com", UserRole.DECANO)
    target = _user("teacher@example.com", UserRole.CATEDRATICO)
    db = _mock_db(_db_result(value=target), _db_result(value=None))

    with pytest.raises(HTTPException) as exc_info:
        await users_endpoint.update_user(
            db,
            actor,
            target.id,
            UserUpdate(email="root@example.com"),
            settings,
        )

    assert exc_info.value.status_code == 403
    assert target.email == "teacher@example.com"
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_users_update_denies_bootstrap_admin_mutation_even_by_bootstrap_actor():
    settings = _settings("root@example.com")
    actor = _user("root@example.com", UserRole.ADMIN)
    bootstrap = _user("root@example.com", UserRole.ADMIN, full_name="Root")
    db = _mock_db(_db_result(value=bootstrap))

    with pytest.raises(HTTPException) as exc_info:
        await users_endpoint.update_user(
            db,
            actor,
            bootstrap.id,
            UserUpdate(full_name="Changed"),
            settings,
        )

    assert exc_info.value.status_code == 403
    assert bootstrap.full_name == "Root"
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_auth_register_denies_admin_role_by_non_bootstrap_actor():
    settings = _settings()
    actor = _user("dean@example.com", UserRole.DECANO)
    db = _mock_db(_db_result(value=None))

    with pytest.raises(HTTPException) as exc_info:
        await auth_endpoint.register(
            db,
            actor,
            UserCreate(
                email="new-admin@miumg.edu.gt",
                password="ChangeMe123!",
                full_name="New Admin",
                role=UserRole.ADMIN,
            ),
            settings,
        )

    assert exc_info.value.status_code == 403
    db.add.assert_not_called()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_auth_register_denies_dev_role_by_non_bootstrap_actor():
    settings = _settings()
    actor = _user("owner@example.com", UserRole.DUEÑO)
    db = _mock_db(_db_result(value=None))

    with pytest.raises(HTTPException) as exc_info:
        await auth_endpoint.register(
            db,
            actor,
            UserCreate(
                email="new-dev@miumg.edu.gt",
                password="ChangeMe123!",
                full_name="New Dev",
                role=UserRole.DEV,
            ),
            settings,
        )

    assert exc_info.value.status_code == 403
    db.add.assert_not_called()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_auth_register_allows_bootstrap_actor_to_register_dev():
    settings = _settings()
    actor = _user("root@example.com", UserRole.ADMIN)
    db = _mock_db(_db_result(value=None))

    user = await auth_endpoint.register(
        db,
        actor,
        UserCreate(
            email="new-dev@miumg.edu.gt",
            password="ChangeMe123!",
            full_name="New Dev",
            role=UserRole.DEV,
        ),
        settings,
    )

    assert user.email == "new-dev@miumg.edu.gt"
    assert user.role is UserRole.DEV
    db.add.assert_called_once()
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_auth_register_denies_admin_role_even_by_bootstrap_actor():
    settings = _settings()
    actor = _user("root@example.com", UserRole.ADMIN)
    db = _mock_db(_db_result(value=None))

    with pytest.raises(HTTPException) as exc_info:
        await auth_endpoint.register(
            db,
            actor,
            UserCreate(
                email="new-admin@miumg.edu.gt",
                password="ChangeMe123!",
                full_name="New Admin",
                role=UserRole.ADMIN,
            ),
            settings,
        )

    assert exc_info.value.status_code == 403
    db.add.assert_not_called()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_auth_register_denies_reserved_bootstrap_email_case_insensitively():
    settings = _settings("root@miumg.edu.gt")
    actor = _user("root@miumg.edu.gt", UserRole.ADMIN)
    db = _mock_db(_db_result(value=None))

    with pytest.raises(HTTPException) as exc_info:
        await auth_endpoint.register(
            db,
            actor,
            UserCreate(
                email="Root@miumg.edu.gt",
                password="ChangeMe123!",
                full_name="Impersonated Root",
                role=UserRole.DEV,
            ),
            settings,
        )

    assert exc_info.value.status_code == 403
    db.add.assert_not_called()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_users_update_denies_admin_role_assignment_by_non_bootstrap_actor():
    settings = _settings("root@example.com")
    actor = _user("dean@example.com", UserRole.DECANO)
    target = _user("teacher@example.com", UserRole.CATEDRATICO)
    db = _mock_db(_db_result(value=target))

    with pytest.raises(HTTPException) as exc_info:
        await users_endpoint.update_user(
            db,
            actor,
            target.id,
            UserUpdate(role=UserRole.ADMIN),
            settings,
        )

    assert exc_info.value.status_code == 403
    assert target.role is UserRole.CATEDRATICO
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_users_update_denies_admin_role_assignment_by_bootstrap_actor():
    settings = _settings("root@example.com")
    actor = _user("root@example.com", UserRole.ADMIN)
    target = _user("teacher@example.com", UserRole.CATEDRATICO)
    db = _mock_db(_db_result(value=target))

    with pytest.raises(HTTPException) as exc_info:
        await users_endpoint.update_user(
            db,
            actor,
            target.id,
            UserUpdate(role=UserRole.ADMIN),
            settings,
        )

    assert exc_info.value.status_code == 403
    assert target.role is UserRole.CATEDRATICO
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_users_update_denies_administrativo_role_assignment():
    settings = _settings("root@example.com")
    actor = _user("dean@example.com", UserRole.DECANO)
    target = _user("teacher@example.com", UserRole.CATEDRATICO)
    db = _mock_db(_db_result(value=target))

    with pytest.raises(HTTPException) as exc_info:
        await users_endpoint.update_user(
            db,
            actor,
            target.id,
            UserUpdate(role=UserRole.ADMINISTRATIVO),
            settings,
        )

    assert exc_info.value.status_code == 403
    assert target.role is UserRole.CATEDRATICO
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_auth_register_denies_administrativo_role():
    settings = _settings("root@example.com")
    actor = _user("root@example.com", UserRole.ADMIN)
    db = _mock_db(_db_result(value=None))

    with pytest.raises(HTTPException) as exc_info:
        await auth_endpoint.register(
            db,
            actor,
            UserCreate(
                email="new-administrativo@miumg.edu.gt",
                password="ChangeMe123!",
                full_name="New Administrativo",
                role=UserRole.ADMINISTRATIVO,
            ),
            settings,
        )

    assert exc_info.value.status_code == 403
    db.add.assert_not_called()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_roles_create_dev_is_reserved_to_bootstrap_admin():
    settings = _settings("root@example.com")
    actor = _user("dev@example.com", UserRole.DEV)
    db = _mock_db()

    with pytest.raises(HTTPException) as exc_info:
        await roles_endpoint.create_role(
            db,
            actor,
            RoleCreate(name="DEV", description="Technical", permission_ids=[]),
            settings,
        )

    assert exc_info.value.status_code == 403
    db.add.assert_not_called()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_roles_assignment_rejects_dev_replacement_by_non_bootstrap_actor():
    settings = _settings("root@example.com")
    actor = _user("dev@example.com", UserRole.DEV)
    target = _user("teacher@example.com", UserRole.CATEDRATICO)
    dev_role = SimpleNamespace(id=uuid4(), name="DEV")
    db = _mock_db(
        _db_result(value=target),
        _db_result(values=[dev_role]),
    )

    with pytest.raises(HTTPException) as exc_info:
        await roles_endpoint.assign_user_roles(
            db,
            actor,
            target.id,
            UserRoleAssign(role_ids=[dev_role.id]),
            settings,
        )

    assert exc_info.value.status_code == 403
    db.add_all.assert_not_called()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_roles_assignment_rejects_admin_replacement_by_non_bootstrap_actor():
    settings = _settings("root@example.com")
    actor = _user("dev@example.com", UserRole.DEV)
    target = _user("teacher@example.com", UserRole.CATEDRATICO)
    admin_role = SimpleNamespace(id=uuid4(), name="ADMIN")
    assignment = SimpleNamespace(
        id=uuid4(), user_id=target.id, role_id=admin_role.id, role=admin_role
    )
    db = _mock_db(
        _db_result(value=target),
        _db_result(values=[admin_role]),
        _db_result(values=[]),
        _db_result(values=[assignment]),
    )

    with pytest.raises(HTTPException) as exc_info:
        await roles_endpoint.assign_user_roles(
            db,
            actor,
            target.id,
            UserRoleAssign(role_ids=[admin_role.id]),
            settings,
        )

    assert exc_info.value.status_code == 403
    db.add_all.assert_not_called()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_roles_assignment_rejects_admin_replacement_by_bootstrap_actor():
    settings = _settings("root@example.com")
    actor = _user("root@example.com", UserRole.ADMIN)
    target = _user("teacher@example.com", UserRole.CATEDRATICO)
    admin_role = SimpleNamespace(id=uuid4(), name="ADMIN")
    assignment = SimpleNamespace(
        id=uuid4(), user_id=target.id, role_id=admin_role.id, role=admin_role
    )
    db = _mock_db(
        _db_result(value=target),
        _db_result(values=[admin_role]),
        _db_result(values=[]),
        _db_result(values=[assignment]),
    )

    with pytest.raises(HTTPException) as exc_info:
        await roles_endpoint.assign_user_roles(
            db,
            actor,
            target.id,
            UserRoleAssign(role_ids=[admin_role.id]),
            settings,
        )

    assert exc_info.value.status_code == 403
    db.add_all.assert_not_called()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_roles_assignment_allows_bootstrap_admin_to_assign_dev():
    settings = _settings("root@example.com")
    actor = _user("root@example.com", UserRole.ADMIN)
    target = _user("teacher@example.com", UserRole.CATEDRATICO)
    dev_role = SimpleNamespace(id=uuid4(), name="DEV")
    assignment = SimpleNamespace(id=uuid4(), user_id=target.id, role_id=dev_role.id, role=dev_role)
    db = _mock_db(
        _db_result(value=target),
        _db_result(values=[dev_role]),
        _db_result(values=[]),
        _db_result(values=[assignment]),
    )

    assignments = await roles_endpoint.assign_user_roles(
        db,
        actor,
        target.id,
        UserRoleAssign(role_ids=[dev_role.id]),
        settings,
    )

    assert assignments == [assignment]
    db.add_all.assert_called_once()
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_technical_rbac_dependency_allows_dev_and_bootstrap_but_denies_business_roles():
    settings = _settings("root@example.com")
    bootstrap = _user("root@example.com", UserRole.ADMIN)
    developer = _user("dev@example.com", UserRole.DEV)
    decano = _user("dean@example.com", UserRole.DECANO)
    owner = _user("owner@example.com", UserRole.DUEÑO)

    assert await deps.get_current_technical_rbac_admin(bootstrap, settings) is bootstrap
    assert await deps.get_current_technical_rbac_admin(developer, settings) is developer

    for actor in (decano, owner):
        with pytest.raises(HTTPException) as exc_info:
            await deps.get_current_technical_rbac_admin(actor, settings)
        assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_roles_permission_matrix_denies_business_top_role_mutation():
    settings = _settings("root@example.com")
    actor = _user("dean@example.com", UserRole.DECANO)
    role = SimpleNamespace(id=uuid4(), name="DIRECTOR", permissions=[])
    permission = SimpleNamespace(id=uuid4(), code="users.view")
    db = _mock_db(_db_result(value=role), _db_result(values=[permission]))

    with pytest.raises(HTTPException) as exc_info:
        await roles_endpoint.set_role_permissions(db, actor, role.id, [permission.id], settings)

    assert exc_info.value.status_code == 403
    assert role.permissions == []
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_roles_crud_denies_business_top_role_access_to_rbac_internals():
    settings = _settings("root@example.com")
    actor = _user("owner@example.com", UserRole.DUEÑO)
    role = SimpleNamespace(id=uuid4(), name="DIRECTOR")

    list_db = _mock_db(_db_result(values=[role]))
    with pytest.raises(HTTPException) as list_exc:
        await roles_endpoint.list_roles(list_db, actor, True, settings)
    assert list_exc.value.status_code == 403
    list_db.execute.assert_not_awaited()

    create_db = _mock_db(_db_result(value=None))
    with pytest.raises(HTTPException) as create_exc:
        await roles_endpoint.create_role(
            create_db,
            actor,
            RoleCreate(name="DIRECTOR", description="Academic", permission_ids=[]),
            settings,
        )
    assert create_exc.value.status_code == 403
    create_db.add.assert_not_called()

    delete_db = _mock_db(_db_result(value=role))
    with pytest.raises(HTTPException) as delete_exc:
        await roles_endpoint.delete_role(delete_db, actor, role.id, settings)
    assert delete_exc.value.status_code == 403
    delete_db.delete.assert_not_awaited()


def test_users_routes_require_backend_permissions_not_deploy_safe_admin_role_only():
    assert "users.view" in _route_permission_codes(users_endpoint.router, "/", "GET")
    assert "users.manage" in _route_permission_codes(users_endpoint.router, "/{user_id}", "PATCH")
    assert "users.manage" in _route_permission_codes(users_endpoint.router, "/{user_id}", "DELETE")
    assert "users.manage" in _route_permission_codes(
        users_endpoint.router, "/{user_id}/change-password", "POST"
    )


@pytest.mark.asyncio
async def test_current_user_loads_role_permissions_for_backend_permission_checks(monkeypatch):
    user = _user("dev@example.com", UserRole.DEV, is_active=True)
    db = _mock_db(_db_result(value=user))
    monkeypatch.setattr(deps, "decode_token", lambda token: {"sub": str(user.id), "type": "access"})

    assert await deps.get_current_user(db, "token") is user

    statement = db.execute.await_args.args[0]
    assert statement._with_options


@pytest.mark.asyncio
async def test_permissions_list_denies_business_top_role_access_to_rbac_internals():
    settings = _settings("root@example.com")
    actor = _user("owner@example.com", UserRole.DUEÑO)
    db = _mock_db(_db_result(values=[]))

    with pytest.raises(HTTPException) as exc_info:
        await permissions_endpoint.list_permissions(db, actor, None, settings)

    assert exc_info.value.status_code == 403
    db.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_roles_user_role_lookup_denies_bootstrap_admin_detail_access():
    settings = _settings("root@example.com")
    actor = _user("dev@example.com", UserRole.DEV)
    bootstrap = _user("root@example.com", UserRole.ADMIN)
    db = _mock_db(_db_result(value=bootstrap), _db_result(values=[]))

    with pytest.raises(HTTPException) as exc_info:
        await roles_endpoint.get_user_roles(db, actor, bootstrap.id, settings)

    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_roles_assignment_denies_bootstrap_admin_target_mutation():
    settings = _settings("root@example.com")
    actor = _user("dev@example.com", UserRole.DEV)
    bootstrap = _user("root@example.com", UserRole.ADMIN)
    role = SimpleNamespace(id=uuid4(), name="DIRECTOR")
    db = _mock_db(_db_result(value=bootstrap), _db_result(values=[role]))

    with pytest.raises(HTTPException) as exc_info:
        await roles_endpoint.assign_user_roles(db, actor, bootstrap.id, UserRoleAssign(role_ids=[role.id]), settings)

    assert exc_info.value.status_code == 403
    db.add_all.assert_not_called()
    db.commit.assert_not_awaited()


def test_create_admin_values_are_env_driven_and_repair_existing_admin():
    settings = _settings("root@example.com")
    values = build_bootstrap_admin_values(settings, hashed_password="hashed")

    assert values["email"] == "root@example.com"
    assert values["full_name"] == "Root Admin"
    assert values["role"] is UserRole.ADMIN
    assert values["hashed_password"] == "hashed"
    assert values["is_active"] is True

    existing = _user("root@example.com", UserRole.DECANO, is_active=False)
    repair_bootstrap_admin_instance(existing, settings, hashed_password="new-hash")

    assert existing.role is UserRole.ADMIN
    assert existing.is_active is True
    assert existing.hashed_password == "new-hash"


def test_create_admin_sql_uses_env_placeholders_not_hardcoded_secret():
    sql = (Path(__file__).parents[1] / "create_admin.sql").read_text()

    assert "Admin2024!" not in sql
    assert "BOOTSTRAP_ADMIN_EMAIL" in sql
    assert "BOOTSTRAP_ADMIN_PASSWORD_HASH" in sql
    assert "'ADMIN'" in sql


def test_canonical_migration_seeds_roles_permissions_and_legacy_mapping():
    migration = _load_canonical_migration()

    role_names = {role["name"] for role in migration.CANONICAL_ROLES}

    # This migration (202606101200) is frozen history: it predates the
    # COORDINADOR/SECRETARIA split and must not be edited (the split's own
    # migration stacks on top of it). Its seeded role set therefore still
    # matches the pre-split canonical roles, not the current module-level
    # CANONICAL_ROLES.
    pre_split_roles = CANONICAL_ROLES - {"COORDINADOR", "SECRETARIA"}
    assert role_names == pre_split_roles
    assert "users.manage" in {permission[0] for permission in migration.CANONICAL_PERMISSIONS}
    assert migration.LEGACY_ROLE_MAPPING["coordinador"] == "ADMINISTRATIVO"
    assert migration.LEGACY_ROLE_MAPPING["catedratico"] == "CATEDRATICO"


def test_legacy_admin_fallback_role_rejects_system_or_invalid_values():
    assert _settings().legacy_admin_fallback_role == "DECANO"

    for fallback in ("ADMIN", "DEV", "superadmin"):
        with pytest.raises(ValueError):
            Settings(
                bootstrap_admin_email="root@example.com",
                bootstrap_admin_full_name="Root Admin",
                bootstrap_admin_password="ChangeMe123!",
                legacy_admin_fallback_role=fallback,
            )


def test_canonical_migration_downgrade_restores_legacy_role_values_without_deleting_assignments():
    migration = _load_canonical_migration()
    downgrade_source = inspect.getsource(migration.downgrade)

    assert "WHEN role::text = 'ADMIN' THEN 'admin'::userrole" in downgrade_source
    assert "WHEN role::text = 'DECANO' THEN 'admin'::userrole" in downgrade_source
    assert "DELETE FROM user_roles" not in downgrade_source
    assert "DELETE FROM roles" not in downgrade_source
