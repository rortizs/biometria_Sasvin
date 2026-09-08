from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.security import decode_token
from app.db.session import get_db
from app.models.role import Role
from app.models.role_permission import UserRoleAssignment
from app.models.user import ASSIGNABLE_ROLE_VALUES, User, UserRole, canonical_role_from_value

settings = get_settings()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def is_bootstrap_admin(user: User, configured_settings=settings) -> bool:
    email = getattr(user, "email", None)
    return bool(email) and email.casefold() == configured_settings.bootstrap_admin_email.casefold()


def _canonical_roles_for_user(user: User, configured_settings=settings) -> set[UserRole]:
    roles: set[UserRole] = set()
    primary = canonical_role_from_value(
        getattr(user, "role", None),
        user_email=getattr(user, "email", None),
        bootstrap_admin_email=configured_settings.bootstrap_admin_email,
        legacy_admin_fallback_role=configured_settings.legacy_admin_fallback_role,
    )
    if primary:
        roles.add(primary)

    for assignment in getattr(user, "user_roles", []) or []:
        role = getattr(assignment, "role", None)
        if not role or getattr(role, "is_active", True) is False:
            continue
        canonical = canonical_role_from_value(
            getattr(role, "name", None),
            user_email=getattr(user, "email", None),
            bootstrap_admin_email=configured_settings.bootstrap_admin_email,
            legacy_admin_fallback_role=configured_settings.legacy_admin_fallback_role,
        )
        if canonical:
            roles.add(canonical)
    return roles


def has_permission(user: User, code: str, configured_settings=settings) -> bool:
    roles = _canonical_roles_for_user(user, configured_settings)
    if not roles:
        return False
    if is_bootstrap_admin(user, configured_settings):
        return True

    for assignment in getattr(user, "user_roles", []) or []:
        role = getattr(assignment, "role", None)
        canonical = canonical_role_from_value(
            getattr(role, "name", None) if role else None,
            user_email=getattr(user, "email", None),
            bootstrap_admin_email=configured_settings.bootstrap_admin_email,
            legacy_admin_fallback_role=configured_settings.legacy_admin_fallback_role,
        )
        if not role or canonical not in roles:
            continue
        for permission in getattr(role, "permissions", []) or []:
            if getattr(permission, "code", None) == code:
                return True
    return False


def _permission_denied() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not enough permissions",
    )


def ensure_can_assign_role(user: User, target_role: str | UserRole, configured_settings=settings) -> None:
    canonical = canonical_role_from_value(target_role)
    if canonical == UserRole.ADMIN:
        raise _permission_denied()
    if canonical == UserRole.DEV and not is_bootstrap_admin(user, configured_settings):
        raise _permission_denied()
    if canonical is None or canonical.value not in ASSIGNABLE_ROLE_VALUES:
        raise _permission_denied()


def assert_object_access(
    actor: User,
    *,
    owner_user_id=None,
    employee_id=None,
    configured_settings=settings,
) -> None:
    roles = _canonical_roles_for_user(actor, configured_settings)
    if is_bootstrap_admin(actor, configured_settings) or UserRole.DEV in roles:
        return
    if owner_user_id is not None and getattr(actor, "id", None) == owner_user_id:
        return
    if employee_id is not None and getattr(actor, "employee_id", None) == employee_id:
        return
    raise _permission_denied()


def protect_bootstrap_admin_mutation(target_user: User, actor: User, configured_settings=settings) -> None:
    if is_bootstrap_admin(target_user, configured_settings):
        raise _permission_denied()


def require_permission(code: str):
    async def dependency(current_user: Annotated[User, Depends(get_current_user)]) -> User:
        if not has_permission(current_user, code):
            raise _permission_denied()
        return current_user

    return dependency


def require_any_permission(*codes: str):
    async def dependency(current_user: Annotated[User, Depends(get_current_user)]) -> User:
        if not any(has_permission(current_user, code) for code in codes):
            raise _permission_denied()
        return current_user

    return dependency


async def get_current_user(
    db: Annotated[AsyncSession, Depends(get_db)],
    token: Annotated[str, Depends(oauth2_scheme)],
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_token(token)
    if payload is None:
        raise credentials_exception

    if payload.get("type") != "access":
        raise credentials_exception

    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    result = await db.execute(
        select(User)
        .where(User.id == user_id)
        .options(
            selectinload(User.user_roles)
            .selectinload(UserRoleAssignment.role)
            .selectinload(Role.permissions)
        )
    )
    user = result.scalar_one_or_none()

    if user is None:
        raise credentials_exception

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )

    return user


async def get_current_active_admin(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    deploy_safe_admin_roles = {UserRole.ADMIN, UserRole.DEV, UserRole.DECANO, UserRole.DUEÑO}
    if not (_canonical_roles_for_user(current_user) & deploy_safe_admin_roles):
        raise _permission_denied()
    return current_user


async def get_current_technical_rbac_admin(
    current_user: Annotated[User, Depends(get_current_user)],
    configured_settings=settings,
) -> User:
    if is_bootstrap_admin(current_user, configured_settings):
        return current_user
    if UserRole.DEV in _canonical_roles_for_user(current_user, configured_settings):
        return current_user
    raise _permission_denied()


async def get_current_coordinador_or_above(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Allow coordinador, director, admin"""
    allowed = {UserRole.ADMINISTRATIVO, UserRole.DIRECTOR, UserRole.ADMIN}
    if not (_canonical_roles_for_user(current_user) & allowed):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permisos insuficientes")
    return current_user


async def get_current_director_or_above(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Allow director, admin"""
    allowed = {UserRole.DIRECTOR, UserRole.ADMIN}
    if not (_canonical_roles_for_user(current_user) & allowed):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permisos insuficientes")
    return current_user


async def get_current_secretaria_or_above(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Allow secretaria, coordinador, director, admin"""
    allowed = {UserRole.ADMINISTRATIVO, UserRole.DIRECTOR, UserRole.ADMIN}
    if not (_canonical_roles_for_user(current_user) & allowed):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permisos insuficientes")
    return current_user
