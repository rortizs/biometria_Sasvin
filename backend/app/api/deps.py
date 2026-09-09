from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
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
from app.models.user_scope_assignment import UserScopeAssignment

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


@dataclass(frozen=True)
class ScopeSet:
    """Design.md D4: the resolved organizational scope for one user, built
    from their `user_scope_assignments` rows.

    Every field is a `frozenset` of target IDs (departments/facultades,
    locations/sedes, directors). An all-empty `ScopeSet` means the user has
    no assignment row at all -- callers MUST treat that as unscoped and
    deny (spec: "Missing scope assignment fails closed"), never as "no
    restriction, allow everything". `assert_request_scope` enforces this;
    `is_unscoped` is exposed for callers that need the raw signal.
    """

    department_ids: frozenset = field(default_factory=frozenset)
    location_ids: frozenset = field(default_factory=frozenset)
    director_ids: frozenset = field(default_factory=frozenset)

    @property
    def is_unscoped(self) -> bool:
        return not (self.department_ids or self.location_ids or self.director_ids)


async def resolve_user_scopes(db: AsyncSession, user: User) -> ScopeSet:
    """Design.md D4: query `user_scope_assignments` for `user` and return
    the set of department/location/director IDs they are scoped to.

    Returns an all-empty `ScopeSet` when the user has no assignment rows
    (unscoped) -- this is a valid, expected state (e.g. the D3 rung-3
    ambiguous-reclassification fallback), not an error. Callers are
    responsible for failing closed on that case via `assert_request_scope`.
    """
    result = await db.execute(
        select(UserScopeAssignment).where(UserScopeAssignment.user_id == user.id)
    )
    department_ids: set = set()
    location_ids: set = set()
    director_ids: set = set()
    for assignment in result.scalars().all():
        if getattr(assignment, "department_id", None) is not None:
            department_ids.add(assignment.department_id)
        if getattr(assignment, "location_id", None) is not None:
            location_ids.add(assignment.location_id)
        if getattr(assignment, "director_user_id", None) is not None:
            director_ids.add(assignment.director_user_id)
    return ScopeSet(
        department_ids=frozenset(department_ids),
        location_ids=frozenset(location_ids),
        director_ids=frozenset(director_ids),
    )


async def assert_request_scope(
    db: AsyncSession,
    user: User,
    *,
    target_department_id=None,
    target_location_id=None,
    target_director_id=None,
) -> None:
    """Design.md D4/D10, spec "Missing scope assignment fails closed":
    raise 403 unless `user`'s resolved `user_scope_assignments` cover at
    least one of the provided targets.

    Fails closed in every edge case:
    - an unscoped user (all-empty `ScopeSet`, e.g. a D3 rung-3 audited
      fallback `COORDINADOR`) is denied on every call, never silently
      allowed through;
    - a scoped user whose assignment targets a *different* department,
      location, or director than the one requested is denied (cross-scope
      denial);
    - calling with no target at all is a caller error and is also denied,
      never treated as "nothing to check, allow".

    Multiple provided targets use union-match semantics (matching any one
    of them is enough), per design.md's own open question note that
    facultad/sede scope enforcement "currently assumes union-match".
    """
    scopes = await resolve_user_scopes(db, user)
    checks = []
    if target_department_id is not None:
        checks.append(target_department_id in scopes.department_ids)
    if target_location_id is not None:
        checks.append(target_location_id in scopes.location_ids)
    if target_director_id is not None:
        checks.append(target_director_id in scopes.director_ids)
    if not checks or not any(checks):
        raise _permission_denied()


def user_has_role(user: User, role: UserRole, configured_settings=settings) -> bool:
    """Public predicate over `_canonical_roles_for_user`, for call sites
    that need a plain role check without a full `require_permission`
    dependency -- e.g. `attendance.py`'s optional-auth self-scope
    enforcement, which must not force authentication onto an
    intentionally-anonymous route just to inspect one role."""
    return role in _canonical_roles_for_user(user, configured_settings)


async def get_optional_current_user(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User | None:
    """Best-effort actor resolution for routes that stay reachable without
    authentication (spec: attendance-access-control's face-recognition
    kiosk flow, `"No requiere autenticacion"`) but must additionally
    enforce actor-specific rules when a Bearer token happens to be
    present -- e.g. the frontend's global auth interceptor attaches one to
    every outgoing request whenever the caller's browser already has an
    active session (`frontend/.../auth.interceptor.ts`), even on routes
    with no Angular route guard (`/kiosk`, `/attendance` are guardless in
    `app.routes.ts`).

    Unlike `get_current_user`, this function NEVER raises: a missing,
    malformed, expired, or otherwise invalid token -- or a token for an
    inactive/nonexistent user -- silently resolves to `None`, preserving
    the anonymous kiosk path for every caller that doesn't happen to carry
    a session token. Callers that need a required actor must keep using
    `get_current_user`/`require_permission`.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None

    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None

    payload = decode_token(token)
    if payload is None or payload.get("type") != "access":
        return None

    user_id = payload.get("sub")
    if user_id is None:
        return None

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

    if user is None or not user.is_active:
        return None

    return user


def require_teacher_position(employee) -> None:
    """Design.md D6: assert `employee`'s position maps to the teacher
    canonical role (`CATEDRATICO`).

    Used to gate `SECRETARIA`'s employee-write access (spec: "SECRETARIA
    creates/edits catedrático employees only" / "SECRETARIA cannot manage
    non-teaching employees"). This call only builds and unit-tests the
    guard; task 3.9 wires it into the `employees` endpoint call site.
    """
    position = getattr(employee, "position_rel", None)
    canonical_role = getattr(position, "canonical_role", None) if position else None
    if canonical_role != UserRole.CATEDRATICO.value:
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
    """DEPRECATED (design.md D10): this coarse role gate is the over-
    privilege root cause tasks 3.9-3.12 replace with
    `require_permission(...)` + object/scope assertions. Kept working
    as-is for existing call sites (employees/schedules/departments/
    positions/locations/settings/faces/attendance) until those tasks
    migrate them; do not add new call sites."""
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
    """Allow coordinador, director, admin

    DEPRECATED (design.md D10): still matches the legacy `ADMINISTRATIVO`
    role and `DIRECTOR` (now read-only, never an approver), not the split
    `COORDINADOR`/`SECRETARIA` roles. Task 3.13 replaces this with
    scope-aware `require_permission("permission_requests.approve.stage1")`
    + `assert_request_scope`. Kept working as-is for the current
    `permission_requests` call sites; do not add new call sites.
    """
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
    """Allow secretaria, coordinador, director, admin

    DEPRECATED (design.md D10): this is the actual over-privilege root
    cause flagged by design.md's decision table -- it still matches the
    legacy `ADMINISTRATIVO` role and `DIRECTOR` (now read-only), granting
    write access to employees/positions/schedules/departments/locations
    that neither role should have under the split taxonomy. Task 3.9
    replaces its `employees` call sites with
    `require_permission("employees.manage.catedratico")` +
    `require_teacher_position`; tasks 3.10-3.12 replace the rest. Kept
    working as-is until those tasks land; do not add new call sites.
    """
    allowed = {UserRole.ADMINISTRATIVO, UserRole.DIRECTOR, UserRole.ADMIN}
    if not (_canonical_roles_for_user(current_user) & allowed):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permisos insuficientes")
    return current_user
