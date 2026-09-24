from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import roles as roles_endpoint
from app.core.config import Settings
from app.models.user import User, UserRole
from app.schemas.role import RoleUpdate
from app.schemas.user import (
    ChangeFirstPasswordRequest,
    UserCreate,
    UserPasswordChange,
    UserUpdate,
)


STRONG_TEST_SECRET = "Change" + "Me123!"
WEAK_TEST_SECRET = "".join(["short"])


def _settings(email: str = "root@example.com") -> Settings:
    return Settings(
        bootstrap_admin_email=email,
        bootstrap_admin_full_name="Root Admin",
        bootstrap_admin_password=STRONG_TEST_SECRET,
    )


def _user(email: str, role: UserRole) -> User:
    return cast(User, SimpleNamespace(id=uuid4(), email=email, role=role, user_roles=[]))


def _db_result(value: Any = None, values: list[Any] | None = None) -> MagicMock:
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    result.scalars.return_value.all.return_value = values or []
    return result


def _mock_db(*results: MagicMock) -> Any:
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=list(results))
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.delete = AsyncMock()
    return db


def _as_session(db: Any) -> Any:
    return db


@pytest.mark.asyncio
async def test_canonical_role_cannot_be_renamed_through_admin_api() -> None:
    actor = _user("root@example.com", UserRole.ADMIN)
    role = SimpleNamespace(id=uuid4(), name="DIRECTOR", description="Academic", is_active=True)
    db = _mock_db(_db_result(value=role))

    with pytest.raises(HTTPException) as exc_info:
        await roles_endpoint.update_role(
            _as_session(db),
            actor,
            role.id,
            RoleUpdate(name="SECRETARIA"),
            _settings(),
        )

    assert exc_info.value.status_code == 403
    assert role.name == "DIRECTOR"
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_canonical_role_cannot_be_deleted_through_admin_api() -> None:
    actor = _user("root@example.com", UserRole.ADMIN)
    role = SimpleNamespace(id=uuid4(), name="DIRECTOR")
    db = _mock_db(_db_result(value=role))

    with pytest.raises(HTTPException) as exc_info:
        await roles_endpoint.delete_role(_as_session(db), actor, role.id, _settings())

    assert exc_info.value.status_code == 403
    db.delete.assert_not_awaited()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_canonical_role_permissions_cannot_be_replaced_through_admin_api() -> None:
    actor = _user("root@example.com", UserRole.ADMIN)
    role = SimpleNamespace(id=uuid4(), name="DIRECTOR", permissions=[])
    permission = SimpleNamespace(id=uuid4(), code="users.view")
    db = _mock_db(_db_result(value=role), _db_result(values=[permission]))

    with pytest.raises(HTTPException) as exc_info:
        await roles_endpoint.set_role_permissions(
            _as_session(db), actor, role.id, [permission.id], _settings()
        )

    assert exc_info.value.status_code == 403
    assert role.permissions == []
    db.commit.assert_not_awaited()


def test_user_update_email_requires_institutional_domain_like_create() -> None:
    with pytest.raises(ValueError, match="@miumg.edu.gt"):
        UserUpdate(email="student@gmail.com")


@pytest.mark.parametrize(
    "payload_factory",
    [
        lambda: UserCreate(
            email="weak@miumg.edu.gt",
            password=WEAK_TEST_SECRET,
            role=UserRole.DECANO,
        ),
        lambda: UserPasswordChange(new_password=WEAK_TEST_SECRET),
        lambda: ChangeFirstPasswordRequest(new_password=WEAK_TEST_SECRET),
    ],
)
def test_user_password_inputs_reject_weak_passwords_consistently(payload_factory: Any) -> None:
    with pytest.raises(ValueError):
        payload_factory()
