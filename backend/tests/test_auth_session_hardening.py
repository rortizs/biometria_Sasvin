from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from fastapi import HTTPException
from fastapi.security import OAuth2PasswordRequestForm
import pytest

from app.api.v1.endpoints import auth as auth_endpoint
from app.api.v1.endpoints import users as users_endpoint
from app.core.security import create_refresh_token, decode_token
from app.models.user import User
from app.schemas.user import ChangeFirstPasswordRequest, UserPasswordChange


GENERIC_AUTH_DETAIL = "Incorrect email or password"


@pytest.fixture(autouse=True)
def _clear_login_throttle_state():
    auth_endpoint._login_failures.clear()


def _db_result(value=None) -> MagicMock:
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _mock_db(*results) -> AsyncMock:
    db = AsyncMock()
    db.execute = AsyncMock(side_effect=list(results))
    db.commit = AsyncMock()
    return db


def _user(**overrides) -> SimpleNamespace:
    return SimpleNamespace(
        id=overrides.pop("id", uuid4()),
        email=overrides.pop("email", "user@miumg.edu.gt"),
        hashed_password=overrides.pop("hashed_password", "hashed"),
        is_active=overrides.pop("is_active", True),
        refresh_token_version=overrides.pop("refresh_token_version", 0),
        must_change_password=overrides.pop("must_change_password", True),
        **overrides,
    )


def _test_secret() -> str:
    return "-".join(("not", "the", "real", "secret"))


def _form(
    username: str = "session-hardening@miumg.edu.gt",
    secret: str | None = None,
) -> OAuth2PasswordRequestForm:
    return cast(
        OAuth2PasswordRequestForm,
        SimpleNamespace(username=username, password=secret or _test_secret()),
    )


@pytest.mark.asyncio
async def test_refresh_rotates_refresh_token_version():
    user = _user(refresh_token_version=0)
    db = _mock_db(_db_result(value=user))

    response = await auth_endpoint.refresh_token(db, create_refresh_token(str(user.id), 0))
    payload = decode_token(response.refresh_token)

    assert payload is not None
    assert user.refresh_token_version == 1
    assert payload["rv"] == 1
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_refresh_rejects_token_issued_before_password_change():
    user = _user(refresh_token_version=0)
    old_refresh_token = create_refresh_token(str(user.id))
    user.refresh_token_version = 1
    db = _mock_db(_db_result(value=user))

    with pytest.raises(HTTPException) as exc_info:
        await auth_endpoint.refresh_token(db, old_refresh_token)

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid refresh token"


@pytest.mark.asyncio
async def test_change_first_password_increments_refresh_token_version():
    user = _user(refresh_token_version=0)
    db = _mock_db()

    await auth_endpoint.change_first_password(
        db,
        cast(User, user),
        ChangeFirstPasswordRequest(new_password=_test_secret()),
    )

    assert user.refresh_token_version == 1
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_admin_password_reset_invalidates_prior_refresh_token(monkeypatch):
    target_user = _user(refresh_token_version=0)
    admin_user = _user(email="admin@miumg.edu.gt")
    old_refresh_token = create_refresh_token(str(target_user.id), 0)
    db = _mock_db(_db_result(value=target_user), _db_result(value=target_user))
    monkeypatch.setattr(users_endpoint, "get_password_hash", lambda _: "updated-hash")

    await users_endpoint.change_user_password(
        db,
        cast(User, admin_user),
        target_user.id,
        UserPasswordChange(new_password=_test_secret()),
    )

    assert target_user.refresh_token_version == 1
    with pytest.raises(HTTPException) as exc_info:
        await auth_endpoint.refresh_token(db, old_refresh_token)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_inactive_login_uses_generic_authentication_error(monkeypatch):
    user = _user(is_active=False)
    db = _mock_db(_db_result(value=user))
    monkeypatch.setattr(auth_endpoint, "verify_password", lambda *_: True)

    with pytest.raises(HTTPException) as exc_info:
        await auth_endpoint.login(db, _form())

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == GENERIC_AUTH_DETAIL


@pytest.mark.asyncio
async def test_login_throttles_repeated_invalid_attempts_without_enumerating_account(monkeypatch):
    db = _mock_db(*[_db_result(value=None) for _ in range(5)])
    monkeypatch.setattr(auth_endpoint, "verify_password", lambda *_: False)

    for _ in range(5):
        with pytest.raises(HTTPException) as exc_info:
            await auth_endpoint.login(db, _form())
        assert exc_info.value.status_code == 401
        assert exc_info.value.detail == GENERIC_AUTH_DETAIL

    with pytest.raises(HTTPException) as exc_info:
        await auth_endpoint.login(db, _form())

    assert exc_info.value.status_code == 429
    assert exc_info.value.detail == GENERIC_AUTH_DETAIL
    assert db.execute.await_count == 5
