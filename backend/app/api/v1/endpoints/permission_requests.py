from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import (
    assert_request_scope,
    get_current_user,
    get_db,
    has_permission,
    is_bootstrap_admin,
    resolve_user_scopes,
    user_has_role,
)
from app.models.employee import Employee
from app.models.permission_request import (
    PermissionRequest,
    PermissionRequestStatus,
    RejectionStage,
)
from app.models.role import Role
from app.models.role_permission import UserRoleAssignment
from app.models.schedule import ScheduleException
from app.models.user import User, UserRole
from app.models.user_scope_assignment import UserScopeAssignment
from app.schemas.permission_request import (
    PermissionRequestApprove,
    PermissionRequestCreate,
    PermissionRequestReject,
    PermissionRequestResponse,
)
from app.services.notification_service import notify_user

router = APIRouter()


# ---------------------------------------------------------------------------
# Two-stage scope resolution helpers (design.md D4/D7/D10, task 3.13)
# ---------------------------------------------------------------------------


def _stage_permission_denied(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


async def _get_request_or_404(db: AsyncSession, request_id: UUID) -> PermissionRequest:
    result = await db.execute(
        select(PermissionRequest).where(PermissionRequest.id == request_id)
    )
    permission_request = result.scalar_one_or_none()
    if not permission_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Solicitud no encontrada",
        )
    return permission_request


async def _get_request_employee(
    db: AsyncSession, permission_request: PermissionRequest
) -> Employee | None:
    result = await db.execute(
        select(Employee).where(Employee.id == permission_request.employee_id)
    )
    return result.scalar_one_or_none()


async def _resolve_scope_director_ids(
    db: AsyncSession, employee: Employee | None
) -> set:
    """Design.md scope resolution: `request.employee -> (department_id,
    location_id) -> user_scope_assignments` gives the DIRECTOR(s) scoped to
    this request's facultad/sede -- "the request's scope DIRECTOR" the
    Stage 2 Secretaría Review requirement and the Director Notification
    Visibility requirement both refer to. A facultad/sede may have more
    than one scoped DIRECTOR (design.md D4's 1:N); any one of them counts
    (union-match, same convention `assert_request_scope` already
    documents). Any unresolved link (no employee, or no department/
    location set on the employee) fails closed to an empty set, never a
    silent "everyone matches".
    """
    if employee is None:
        return set()
    conditions = []
    if employee.department_id is not None:
        conditions.append(UserScopeAssignment.department_id == employee.department_id)
    if employee.location_id is not None:
        conditions.append(UserScopeAssignment.location_id == employee.location_id)
    if not conditions:
        return set()

    result = await db.execute(
        select(UserScopeAssignment)
        .where(or_(*conditions))
        .options(
            selectinload(UserScopeAssignment.user)
            .selectinload(User.user_roles)
            .selectinload(UserRoleAssignment.role)
            .selectinload(Role.permissions)
        )
    )
    return {
        assignment.user_id
        for assignment in result.scalars().all()
        if assignment.user is not None and user_has_role(assignment.user, UserRole.DIRECTOR)
    }


async def _assert_stage2_secretaria_scope(
    db: AsyncSession, actor: User, employee: Employee | None
) -> None:
    """Spec "Stage 2 Secretaría Review": only a `SECRETARIA` whose own
    `user_scope_assignments.director_user_id` names one of the request's
    scope `DIRECTOR`(s) may act. Fails closed (403) when no `DIRECTOR` is
    scoped to the request at all (unresolved link, design.md "Any
    unresolved link fails closed") and when the actor is not assigned to
    any of the resolved directors (unassigned secretaría).
    """
    director_ids = await _resolve_scope_director_ids(db, employee)
    if not director_ids:
        raise _stage_permission_denied(
            "Permisos insuficientes: no hay un director con alcance para esta solicitud"
        )
    actor_scope = await resolve_user_scopes(db, actor)
    if not (director_ids & actor_scope.director_ids):
        raise _stage_permission_denied(
            "Permisos insuficientes: se requiere secretaría asignada al director de esta solicitud"
        )


# ---------------------------------------------------------------------------
# Visibility + creation scope helpers (design.md D4/D7/D10, task 3.14)
# ---------------------------------------------------------------------------


def _is_denied_visibility_role(actor: User) -> bool:
    """Spec "Permission Request Visibility": `DECANO`/`DUEÑO` have no
    visibility into permission requests at all -- fail closed regardless
    of ownership or scope, per the explicit "DECANO/DUEÑO cannot view
    permission requests" scenario.
    """
    return user_has_role(actor, UserRole.DECANO) or user_has_role(actor, UserRole.DUEÑO)


async def _actor_scope_matches_request(
    db: AsyncSession, actor: User, employee: Employee | None
) -> bool:
    """Boolean wrapper around `assert_request_scope` (tasks 3.7/3.13) for
    read-only visibility: a `COORDINADOR` or `DIRECTOR` may view a request
    when their own `user_scope_assignments` cover the request employee's
    facultad/sede -- the same scope match stage 1 approval already
    enforces, reused rather than duplicated (spec "Scoped coordinador
    views request" / "Scoped director views request read-only").
    """
    try:
        await assert_request_scope(
            db,
            actor,
            target_department_id=employee.department_id if employee else None,
            target_location_id=employee.location_id if employee else None,
        )
        return True
    except HTTPException:
        return False


async def _actor_can_view_request(
    db: AsyncSession, actor: User, permission_request: PermissionRequest
) -> bool:
    """Spec "Permission Request Visibility": an actor may see a request
    only if they are the owner, a scoped `COORDINADOR`, a scoped `DIRECTOR`
    (read-only), the `SECRETARIA` assigned to the request's scope
    `DIRECTOR`(s), or `DEV`/bootstrap `ADMIN`. Every other actor -- and
    `DECANO`/`DUEÑO` unconditionally -- is denied (fail closed).
    """
    if _is_denied_visibility_role(actor):
        return False
    if is_bootstrap_admin(actor) or user_has_role(actor, UserRole.DEV):
        return True
    if permission_request.requested_by_user_id == actor.id:
        return True

    employee = await _get_request_employee(db, permission_request)

    if user_has_role(actor, UserRole.COORDINADOR) or user_has_role(actor, UserRole.DIRECTOR):
        if await _actor_scope_matches_request(db, actor, employee):
            return True

    if user_has_role(actor, UserRole.SECRETARIA):
        director_ids = await _resolve_scope_director_ids(db, employee)
        if director_ids:
            actor_scope = await resolve_user_scopes(db, actor)
            if director_ids & actor_scope.director_ids:
                return True

    return False


async def _resolve_visible_employee_ids(db: AsyncSession, actor: User) -> set:
    """DB-level visibility scope for `list_permission_requests` (spec
    "Permission Request Visibility"): which `employee_id`s this actor may
    see requests for, beyond their own. A `COORDINADOR`/`DIRECTOR` sees
    requests for employees inside their own department/location scope; an
    assigned `SECRETARIA` sees requests for employees inside her assigned
    `DIRECTOR`(s)' department/location scope (design.md D7 -- `SECRETARIA`
    holds no department/location scope of her own, only a
    `director_user_id` link). Returns an empty set when the actor holds
    none of these roles or has no matching scope -- the caller combines
    this with an owner-only fallback, never treats empty as "see
    everything".
    """
    department_ids: set = set()
    location_ids: set = set()

    if user_has_role(actor, UserRole.COORDINADOR) or user_has_role(actor, UserRole.DIRECTOR):
        scopes = await resolve_user_scopes(db, actor)
        department_ids |= set(scopes.department_ids)
        location_ids |= set(scopes.location_ids)

    if user_has_role(actor, UserRole.SECRETARIA):
        actor_scopes = await resolve_user_scopes(db, actor)
        if actor_scopes.director_ids:
            result = await db.execute(
                select(UserScopeAssignment).where(
                    UserScopeAssignment.user_id.in_(actor_scopes.director_ids)
                )
            )
            for assignment in result.scalars().all():
                if assignment.department_id is not None:
                    department_ids.add(assignment.department_id)
                if assignment.location_id is not None:
                    location_ids.add(assignment.location_id)

    if not department_ids and not location_ids:
        return set()

    conditions = []
    if department_ids:
        conditions.append(Employee.department_id.in_(department_ids))
    if location_ids:
        conditions.append(Employee.location_id.in_(location_ids))
    result = await db.execute(select(Employee.id).where(or_(*conditions)))
    return set(result.scalars().all())


# ---------------------------------------------------------------------------
# POST /permission-requests  — any authenticated user
# ---------------------------------------------------------------------------

@router.post(
    "/",
    response_model=PermissionRequestResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["permission-requests"],
    responses={
        422: {"description": "La solicitud debe realizarse con al menos 7 días de anticipación"},
    },
)
async def create_permission_request(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    request_in: PermissionRequestCreate,
) -> PermissionRequestResponse:
    """
    Crear una solicitud de permiso. Requiere autenticación.

    La `start_date` debe ser al menos 7 días posterior a la fecha de hoy.
    La solicitud queda en estado `pending` hasta que un coordinador la apruebe.

    Spec "Permission Request Creation": un actor solo puede crear una
    solicitud para su propio `employee_id` (derivado de su identidad de
    usuario, nunca del valor enviado por el cliente) -- se deniega
    cualquier intento de crear una solicitud a nombre de otro empleado.
    `DEV`/bootstrap `ADMIN` quedan exentos (mismo patrón administrativo
    usado en el resto de este archivo).
    """
    if not (is_bootstrap_admin(current_user) or user_has_role(current_user, UserRole.DEV)):
        if current_user.employee_id != request_in.employee_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo puede crear solicitudes de permiso para su propio registro de empleado",
            )

    permission_request = PermissionRequest(
        requested_by_user_id=current_user.id,
        employee_id=request_in.employee_id,
        exception_type=request_in.exception_type,
        start_date=request_in.start_date,
        end_date=request_in.end_date,
        description=request_in.description,
        status=PermissionRequestStatus.pending,
    )
    db.add(permission_request)
    await db.commit()
    await db.refresh(permission_request)
    return PermissionRequestResponse.model_validate(permission_request)


# ---------------------------------------------------------------------------
# GET /permission-requests  — role-based visibility
# ---------------------------------------------------------------------------

@router.get(
    "/",
    response_model=list[PermissionRequestResponse],
    tags=["permission-requests"],
)
async def list_permission_requests(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    status_filter: PermissionRequestStatus | None = Query(None, alias="status"),
    employee_id: UUID | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
) -> list[PermissionRequestResponse]:
    """
    Listar solicitudes de permiso.

    Spec "Permission Request Visibility": expone solicitudes únicamente al
    dueño, al `COORDINADOR` con alcance, al `DIRECTOR` con alcance
    (solo lectura), a la `SECRETARIA` asignada al director del alcance, y
    a `DEV`/bootstrap `ADMIN`. `DECANO`/`DUEÑO` no tienen ninguna
    visibilidad sobre solicitudes de permiso.

    Filtros opcionales: `status`, `employee_id`.
    """
    if _is_denied_visibility_role(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No autorizado para ver solicitudes de permiso",
        )

    if is_bootstrap_admin(current_user) or user_has_role(current_user, UserRole.DEV):
        query = select(PermissionRequest)
    else:
        visible_employee_ids = await _resolve_visible_employee_ids(db, current_user)
        conditions = [PermissionRequest.requested_by_user_id == current_user.id]
        if visible_employee_ids:
            conditions.append(PermissionRequest.employee_id.in_(visible_employee_ids))
        query = select(PermissionRequest).where(or_(*conditions))

    if status_filter is not None:
        query = query.where(PermissionRequest.status == status_filter)
    if employee_id is not None:
        query = query.where(PermissionRequest.employee_id == employee_id)

    query = query.offset(skip).limit(limit).order_by(PermissionRequest.created_at.desc())

    result = await db.execute(query)
    records = result.scalars().all()
    return [PermissionRequestResponse.model_validate(r) for r in records]


# ---------------------------------------------------------------------------
# GET /permission-requests/{request_id}
# ---------------------------------------------------------------------------

@router.get(
    "/{request_id}",
    response_model=PermissionRequestResponse,
    tags=["permission-requests"],
    responses={
        403: {"description": "No autorizado para ver esta solicitud"},
        404: {"description": "Solicitud no encontrada"},
    },
)
async def get_permission_request(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    request_id: UUID,
) -> PermissionRequestResponse:
    """
    Obtener una solicitud de permiso por su UUID.

    Spec "Permission Request Visibility": visible únicamente al dueño, al
    `COORDINADOR` con alcance, al `DIRECTOR` con alcance (solo lectura), a
    la `SECRETARIA` asignada al director del alcance, y a `DEV`/bootstrap
    `ADMIN`. `DECANO`/`DUEÑO` no tienen ninguna visibilidad. La misma
    respuesta ya incluye `status`, `coordinator_notes`/`director_notes` y
    `rejection_reason`, por lo que este chequeo también cubre la spec
    "Requester Outcome Notification" (el dueño ve el estado final y la
    justificación al leer su propia solicitud, sin necesitar un endpoint
    adicional).
    """
    permission_request = await _get_request_or_404(db, request_id)

    if not await _actor_can_view_request(db, current_user, permission_request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No autorizado para ver esta solicitud",
        )

    return PermissionRequestResponse.model_validate(permission_request)


# ---------------------------------------------------------------------------
# PATCH /permission-requests/{request_id}/approve
# ---------------------------------------------------------------------------

@router.patch(
    "/{request_id}/approve",
    response_model=PermissionRequestResponse,
    tags=["permission-requests"],
    responses={
        400: {"description": "No se puede aprobar en el estado actual"},
        403: {"description": "Permisos insuficientes para esta etapa de aprobación"},
        404: {"description": "Solicitud no encontrada"},
    },
)
async def approve_permission_request(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    request_id: UUID,
    body: PermissionRequestApprove,
) -> PermissionRequestResponse:
    """
    Aprobar una solicitud de permiso (design.md's two-stage state machine).

    1. `pending` → `coordinator_approved`: requiere `COORDINADOR` con
       alcance (`user_scope_assignments`) sobre la facultad/sede del
       empleado de la solicitud (permiso
       `permission_requests.approve.stage1`).
    2. `coordinator_approved` → `approved`: requiere `SECRETARIA` asignada
       al `DIRECTOR` con alcance sobre esa misma facultad/sede (permiso
       `permission_requests.approve.stage2`), con justificación obligatoria
       (`notes`, HTTP 422 si falta). Al alcanzar `approved` se crea
       automáticamente un `ScheduleException` vinculado. `DIRECTOR` no
       posee ninguno de los dos permisos de etapa y por tanto nunca puede
       aprobar (spec: "DIRECTOR cannot approve or deny").
    """
    permission_request = await _get_request_or_404(db, request_id)
    now = datetime.utcnow()

    if permission_request.status == PermissionRequestStatus.pending:
        # Stage 1: scoped COORDINADOR approval
        if not has_permission(current_user, "permission_requests.approve.stage1"):
            raise _stage_permission_denied(
                "Permisos insuficientes: se requiere rol coordinador con alcance"
            )
        employee = await _get_request_employee(db, permission_request)
        await assert_request_scope(
            db,
            current_user,
            target_department_id=employee.department_id if employee else None,
            target_location_id=employee.location_id if employee else None,
        )

        permission_request.status = PermissionRequestStatus.coordinator_approved
        permission_request.coordinator_reviewed_by = current_user.id
        permission_request.coordinator_reviewed_at = now
        permission_request.coordinator_notes = body.notes

        await notify_user(
            db=db,
            user_id=str(permission_request.requested_by_user_id),
            title="Solicitud en revisión",
            message=(
                f"Tu solicitud de {permission_request.exception_type} del "
                f"{permission_request.start_date} fue aprobada por el coordinador y "
                f"está pendiente de aprobación final por secretaría."
            ),
            notification_type="permission_coordinator_approved",
            request_id=str(permission_request.id),
        )

        # Spec "Director Notification Visibility": notify every DIRECTOR
        # scoped to this request's facultad/sede -- read-only, never a
        # decision-maker, but must be informed the request reached stage 2.
        for director_id in await _resolve_scope_director_ids(db, employee):
            await notify_user(
                db=db,
                user_id=str(director_id),
                title="Solicitud de permiso en revisión final",
                message=(
                    f"La solicitud de {permission_request.exception_type} del "
                    f"{permission_request.start_date} fue aprobada por el coordinador "
                    f"y está pendiente de la revisión final de secretaría."
                ),
                notification_type="permission_director_notified",
                request_id=str(permission_request.id),
            )

    elif permission_request.status == PermissionRequestStatus.coordinator_approved:
        # Stage 2: assigned SECRETARIA approval, mandatory justification
        if not has_permission(current_user, "permission_requests.approve.stage2"):
            raise _stage_permission_denied(
                "Permisos insuficientes: se requiere rol secretaría asignada al director"
            )
        employee = await _get_request_employee(db, permission_request)
        await _assert_stage2_secretaria_scope(db, current_user, employee)
        if not body.notes or not body.notes.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="La justificación es obligatoria para aprobar en esta etapa",
            )

        permission_request.status = PermissionRequestStatus.approved
        permission_request.director_reviewed_by = current_user.id
        permission_request.director_reviewed_at = now
        permission_request.director_notes = body.notes

        # Auto-create ScheduleException
        schedule_exception = ScheduleException(
            employee_id=permission_request.employee_id,
            exception_type=permission_request.exception_type,
            start_date=permission_request.start_date,
            end_date=permission_request.end_date,
            description=permission_request.description,
            created_by=current_user.id,
        )
        db.add(schedule_exception)
        await db.flush()  # Get the id without committing yet
        permission_request.schedule_exception_id = schedule_exception.id

        await notify_user(
            db=db,
            user_id=str(permission_request.requested_by_user_id),
            title="Solicitud aprobada",
            message=(
                f"Tu solicitud de {permission_request.exception_type} del "
                f"{permission_request.start_date} al {permission_request.end_date} "
                f"fue aprobada."
            ),
            notification_type="permission_approved",
            request_id=str(permission_request.id),
        )

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede aprobar en el estado actual",
        )

    await db.commit()
    await db.refresh(permission_request)
    return PermissionRequestResponse.model_validate(permission_request)


# ---------------------------------------------------------------------------
# PATCH /permission-requests/{request_id}/reject
# ---------------------------------------------------------------------------

@router.patch(
    "/{request_id}/reject",
    response_model=PermissionRequestResponse,
    tags=["permission-requests"],
    responses={
        400: {"description": "No se puede rechazar en el estado actual"},
        403: {"description": "Permisos insuficientes para esta etapa"},
        404: {"description": "Solicitud no encontrada"},
    },
)
async def reject_permission_request(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    request_id: UUID,
    body: PermissionRequestReject,
) -> PermissionRequestResponse:
    """
    Rechazar una solicitud de permiso (design.md's two-stage state machine).

    - Estado `pending`: requiere `COORDINADOR` con alcance sobre la
      facultad/sede del empleado (`permission_requests.approve.stage1`).
    - Estado `coordinator_approved`: requiere `SECRETARIA` asignada al
      `DIRECTOR` con alcance sobre esa facultad/sede
      (`permission_requests.approve.stage2`), con justificación obligatoria
      (`rejection_reason`, HTTP 422 si falta). `DIRECTOR` nunca posee
      ninguno de los dos permisos de etapa (spec: "DIRECTOR cannot approve
      or deny").
    """
    permission_request = await _get_request_or_404(db, request_id)
    now = datetime.utcnow()

    if permission_request.status == PermissionRequestStatus.pending:
        if not has_permission(current_user, "permission_requests.approve.stage1"):
            raise _stage_permission_denied(
                "Permisos insuficientes: se requiere rol coordinador con alcance"
            )
        employee = await _get_request_employee(db, permission_request)
        await assert_request_scope(
            db,
            current_user,
            target_department_id=employee.department_id if employee else None,
            target_location_id=employee.location_id if employee else None,
        )
        permission_request.rejection_stage = RejectionStage.coordinator
        permission_request.coordinator_reviewed_by = current_user.id
        permission_request.coordinator_reviewed_at = now

    elif permission_request.status == PermissionRequestStatus.coordinator_approved:
        if not has_permission(current_user, "permission_requests.approve.stage2"):
            raise _stage_permission_denied(
                "Permisos insuficientes: se requiere rol secretaría asignada al director"
            )
        employee = await _get_request_employee(db, permission_request)
        await _assert_stage2_secretaria_scope(db, current_user, employee)
        if not body.rejection_reason or not body.rejection_reason.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="La justificación es obligatoria para rechazar en esta etapa",
            )
        permission_request.rejection_stage = RejectionStage.director
        permission_request.director_reviewed_by = current_user.id
        permission_request.director_reviewed_at = now

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No se puede rechazar en el estado actual",
        )

    permission_request.status = PermissionRequestStatus.rejected
    permission_request.rejection_reason = body.rejection_reason

    await notify_user(
        db=db,
        user_id=str(permission_request.requested_by_user_id),
        title="Solicitud rechazada",
        message=(
            f"Tu solicitud de {permission_request.exception_type} del "
            f"{permission_request.start_date} fue rechazada. "
            f"Motivo: {body.rejection_reason}"
        ),
        notification_type="permission_rejected",
        request_id=str(permission_request.id),
    )

    await db.commit()
    await db.refresh(permission_request)
    return PermissionRequestResponse.model_validate(permission_request)


# ---------------------------------------------------------------------------
# DELETE /permission-requests/{request_id}
# ---------------------------------------------------------------------------

@router.delete(
    "/{request_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["permission-requests"],
    responses={
        403: {"description": "Solo se puede eliminar una solicitud propia en estado pending"},
        404: {"description": "Solicitud no encontrada"},
    },
)
async def delete_permission_request(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    request_id: UUID,
) -> None:
    """
    Eliminar una solicitud de permiso.

    - Solo se puede eliminar si el estado es `pending`.
    - El usuario debe ser el creador de la solicitud, o tener rol `admin`.
    """
    result = await db.execute(
        select(PermissionRequest).where(PermissionRequest.id == request_id)
    )
    permission_request = result.scalar_one_or_none()

    if not permission_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Solicitud no encontrada",
        )

    is_admin = current_user.role == UserRole.admin
    is_owner = permission_request.requested_by_user_id == current_user.id

    if not is_admin:
        if not is_owner:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No autorizado para eliminar esta solicitud",
            )
        if permission_request.status != PermissionRequestStatus.pending:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Solo se pueden eliminar solicitudes en estado pending",
            )

    await db.delete(permission_request)
    await db.commit()
