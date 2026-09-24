from time import monotonic
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    ensure_can_assign_role,
    get_db,
    get_current_user,
    permission_codes_for_user,
    require_permission,
    settings,
)
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.models.user import User
from app.schemas.user import (
    AuthMeResponse,
    ChangeFirstPasswordRequest,
    Token,
    UserCreate,
    UserResponse,
)

router = APIRouter()

GENERIC_AUTH_ERROR = "Incorrect email or password"
_login_failures: dict[str, tuple[int, float]] = {}


def _throttle_key(username: str) -> str:
    return username.strip().casefold()


def _is_login_throttled(username: str) -> bool:
    attempts, locked_until = _login_failures.get(_throttle_key(username), (0, 0.0))
    now = monotonic()
    if locked_until > now:
        return True
    if locked_until:
        _login_failures.pop(_throttle_key(username), None)
        return False
    return attempts >= settings.login_throttle_max_attempts


def _record_failed_login(username: str) -> None:
    key = _throttle_key(username)
    attempts, locked_until = _login_failures.get(key, (0, 0.0))
    now = monotonic()
    if locked_until <= now:
        attempts += 1
        locked_until = 0.0
    if attempts >= settings.login_throttle_max_attempts:
        locked_until = now + settings.login_throttle_lock_seconds
    _login_failures[key] = (attempts, locked_until)


def _clear_failed_login(username: str) -> None:
    _login_failures.pop(_throttle_key(username), None)


@router.post(
    "/login",
    response_model=Token,
    tags=["auth"],
    responses={
        401: {"description": "Email o contraseña incorrectos"},
        429: {"description": "Demasiados intentos de login"},
    },
)
async def login(
    db: Annotated[AsyncSession, Depends(get_db)],
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> Token:
    """
    Autenticar un usuario y obtener tokens JWT.

    **Formato del request:** `application/x-www-form-urlencoded` (NO JSON).
    Usar los campos `username` (email) y `password`.

    En Swagger UI: click en **Authorize** arriba a la derecha, ingresar email y password.
    En Postman/Insomnia: body tipo `form-data` o `x-www-form-urlencoded`.

    **Respuesta:**
    - `access_token` — válido por 30 minutos. Usar en el header `Authorization: Bearer <token>`
    - `refresh_token` — válido por 7 días. Usar en `POST /refresh` para renovar el access token
    """
    if _is_login_throttled(form_data.username):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=GENERIC_AUTH_ERROR,
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        _record_failed_login(form_data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=GENERIC_AUTH_ERROR,
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        _record_failed_login(form_data.username)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=GENERIC_AUTH_ERROR,
            headers={"WWW-Authenticate": "Bearer"},
        )

    _clear_failed_login(form_data.username)
    return Token(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id), user.refresh_token_version),
    )


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["auth"],
    responses={
        400: {"description": "El email ya está registrado"},
        401: {"description": "Token inválido o expirado — se requiere autenticación"},
        403: {"description": "Solo el admin puede crear usuarios"},
    },
)
async def register(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_admin: Annotated[User, Depends(require_permission("users.manage"))],
    user_in: UserCreate,
    configured_settings=settings,
) -> User:
    """
    Registrar un nuevo usuario del sistema. Requiere el permiso `users.manage`.

    Este endpoint crea usuarios con acceso al panel de administración.
    No confundir con el registro de empleados (`POST /employees/`) —
    los empleados son las personas cuya asistencia se controla,
    los usuarios son quienes administran el sistema.

    El email debe ser único y pertenecer al dominio @miumg.edu.gt.
    La contraseña se hashea con bcrypt antes de guardarse.

    NOTA de seguridad (fix RBAC): este endpoint antes usaba el gate
    genérico `get_current_active_admin` (allowlist `{ADMIN, DEV, DECANO,
    DUEÑO}`), lo que permitía a DECANO/DUEÑO crear usuarios arbitrarios pese
    a que la spec "Business Top Role Boundaries" los declara de solo
    lectura. Ahora usa `require_permission("users.manage")`, el mismo
    permiso que ya protege `PATCH/DELETE /users/{id}` — solo lo tienen
    `ADMIN`/`DEV` (y el bootstrap admin). `ensure_can_assign_role()` sigue
    aplicando debajo para impedir que se asigne `ADMIN`/`DEV`/
    `ADMINISTRATIVO` incluso a un actor con `users.manage`.
    """
    if user_in.email.casefold() == configured_settings.bootstrap_admin_email.casefold():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Reserved bootstrap admin email cannot be assigned through auth register API",
        )

    ensure_can_assign_role(current_admin, user_in.role, configured_settings)

    result = await db.execute(select(User).where(User.email == user_in.email))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        role=user_in.role,
        must_change_password=True,
        employee_id=user_in.employee_id,
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    return user


@router.post(
    "/refresh",
    response_model=Token,
    tags=["auth"],
    responses={
        401: {"description": "Refresh token inválido, expirado o usuario inactivo"},
    },
)
async def refresh_token(
    db: Annotated[AsyncSession, Depends(get_db)],
    refresh_token: str,
) -> Token:
    """
    Renovar el access token usando un refresh token válido.

    El access token expira en 30 minutos. Cuando recibas un 401 en cualquier
    endpoint protegido, usá este endpoint con el `refresh_token` obtenido en el login
    para obtener un nuevo par de tokens sin pedir las credenciales de nuevo.

    El refresh token expira en 7 días. Si también está expirado, el usuario debe
    volver a hacer login.
    """
    payload = decode_token(refresh_token)

    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    token_version = payload.get("rv")
    if not user or not user.is_active or token_version != user.refresh_token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    user.refresh_token_version += 1
    await db.commit()

    return Token(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id), user.refresh_token_version),
    )


@router.get(
    "/me",
    response_model=AuthMeResponse,
    tags=["auth"],
    responses={
        401: {"description": "Token inválido o expirado"},
    },
)
async def get_current_user_info(
    current_user: Annotated[User, Depends(get_current_user)],
) -> AuthMeResponse:
    """
    Obtener los datos del usuario autenticado actualmente.

    Útil para verificar que el token es válido y conocer el rol del usuario
    sin hacer otra llamada. También sirve como health-check de autenticación
    desde el frontend al cargar la aplicación.

    Incluye `permissions`: la lista de códigos de permiso efectivamente
    otorgados al usuario actual (calculada desde la relación ya cargada por
    `get_current_user()`, sin consulta adicional), para que el frontend
    pueda construir guards/UI basados en permisos en vez de comparar
    nombres de rol directamente.
    """
    data = UserResponse.model_validate(current_user).model_dump()
    return AuthMeResponse(**data, permissions=permission_codes_for_user(current_user))


@router.post(
    "/change-first-password",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["auth"],
)
async def change_first_password(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    payload: ChangeFirstPasswordRequest,
) -> None:
    """Self-service: change password on first login. Resets must_change_password flag."""
    current_user.hashed_password = get_password_hash(payload.new_password)
    current_user.must_change_password = False
    current_user.refresh_token_version += 1
    await db.commit()
