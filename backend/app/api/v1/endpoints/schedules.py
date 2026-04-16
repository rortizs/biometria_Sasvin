from typing import Annotated
from uuid import UUID
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_current_active_admin, get_current_user
from app.models.schedule import (
    Schedule,
    EmployeeSchedule,
    ScheduleAssignment,
    ScheduleException,
    ExceptionType,
)
from app.models.employee import Employee
from app.models.department import Department
from app.models.user import User
from app.schemas.schedule import (
    ScheduleCreate,
    ScheduleUpdate,
    ScheduleResponse,
    EmployeeScheduleCreate,
    EmployeeScheduleResponse,
    ScheduleAssignmentCreate,
    ScheduleAssignmentUpdate,
    ScheduleAssignmentResponse,
    ScheduleExceptionCreate,
    ScheduleExceptionUpdate,
    ScheduleExceptionResponse,
    BulkAssignmentCreate,
    CalendarResponse,
    EmployeeCalendarRow,
    CalendarDayInfo,
    ExceptionTypeEnum,
)

router = APIRouter()


# ==================== SCHEDULE PATTERNS ====================


@router.get(
    "/patterns",
    response_model=list[ScheduleResponse],
    tags=["schedules"],
)
async def list_schedule_patterns(
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    active_only: bool = True,
) -> list[Schedule]:
    """
    Listar patrones de horario reutilizables.

    Un patrón define horario de entrada/salida y se puede asignar a uno o varios
    empleados para días específicos. Ejemplos: "Turno Mañana 7-13h", "Turno Tarde 14-20h".
    """
    query = select(Schedule)
    if active_only:
        query = query.where(Schedule.is_active == True)
    query = query.offset(skip).limit(limit).order_by(Schedule.name)
    result = await db.execute(query)
    return result.scalars().all()


@router.get(
    "/patterns/{pattern_id}",
    response_model=ScheduleResponse,
    tags=["schedules"],
    responses={
        404: {"description": "Patrón de horario no encontrado"},
    },
)
async def get_schedule_pattern(
    db: Annotated[AsyncSession, Depends(get_db)],
    pattern_id: UUID,
) -> Schedule:
    """Obtener un patrón de horario por su UUID."""
    result = await db.execute(select(Schedule).where(Schedule.id == pattern_id))
    pattern = result.scalar_one_or_none()
    if not pattern:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Schedule pattern not found"
        )
    return pattern


@router.post(
    "/patterns",
    response_model=ScheduleResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["schedules"],
    responses={
        400: {"description": "Ya existe un patrón con ese nombre"},
    },
)
async def create_schedule_pattern(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    pattern_in: ScheduleCreate,
) -> Schedule:
    """Crear un nuevo patrón de horario reutilizable. Requiere rol admin. El nombre debe ser único."""
    result = await db.execute(select(Schedule).where(Schedule.name == pattern_in.name))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pattern with this name already exists",
        )

    pattern = Schedule(**pattern_in.model_dump())
    db.add(pattern)
    await db.commit()
    await db.refresh(pattern)
    return pattern


@router.patch(
    "/patterns/{pattern_id}",
    response_model=ScheduleResponse,
    tags=["schedules"],
    responses={
        404: {"description": "Patrón de horario no encontrado"},
    },
)
async def update_schedule_pattern(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    pattern_id: UUID,
    pattern_in: ScheduleUpdate,
) -> Schedule:
    """Actualizar un patrón de horario parcialmente. Requiere rol admin."""
    result = await db.execute(select(Schedule).where(Schedule.id == pattern_id))
    pattern = result.scalar_one_or_none()
    if not pattern:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Schedule pattern not found"
        )

    update_data = pattern_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(pattern, field, value)

    await db.commit()
    await db.refresh(pattern)
    return pattern


@router.delete(
    "/patterns/{pattern_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["schedules"],
    responses={
        404: {"description": "Patrón de horario no encontrado"},
    },
)
async def delete_schedule_pattern(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    pattern_id: UUID,
) -> None:
    """Eliminar un patrón de horario. Requiere rol admin."""
    result = await db.execute(select(Schedule).where(Schedule.id == pattern_id))
    pattern = result.scalar_one_or_none()
    if not pattern:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Schedule pattern not found"
        )
    await db.delete(pattern)
    await db.commit()


# ==================== SCHEDULE ASSIGNMENTS ====================


@router.get(
    "/assignments",
    response_model=list[ScheduleAssignmentResponse],
    tags=["schedules"],
)
async def list_assignments(
    db: Annotated[AsyncSession, Depends(get_db)],
    employee_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[ScheduleAssignment]:
    """
    Listar asignaciones de horario con filtros opcionales.

    Las asignaciones vinculan un patrón de horario a un empleado para una fecha concreta.
    Filtros disponibles: `employee_id`, `date_from`, `date_to` (todos opcionales, combinables).
    Resultados ordenados por fecha ascendente.
    """
    query = select(ScheduleAssignment)

    if employee_id:
        query = query.where(ScheduleAssignment.employee_id == employee_id)
    if date_from:
        query = query.where(ScheduleAssignment.assignment_date >= date_from)
    if date_to:
        query = query.where(ScheduleAssignment.assignment_date <= date_to)

    query = query.order_by(ScheduleAssignment.assignment_date)
    result = await db.execute(query)
    return result.scalars().all()


@router.post(
    "/assignments",
    response_model=ScheduleAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["schedules"],
)
async def create_assignment(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    assignment_in: ScheduleAssignmentCreate,
) -> ScheduleAssignment:
    """
    Asignar un patrón de horario a un empleado para una fecha específica. Requiere rol admin.

    Comportamiento upsert: si ya existe una asignación para ese empleado y fecha,
    la actualiza en lugar de crear un duplicado.

    Para marcar un día libre sin patrón, usar `is_day_off: true`.
    Para horario personalizado sin patrón, usar `custom_check_in` y `custom_check_out`.
    """
    # Check if assignment already exists for this employee and date
    result = await db.execute(
        select(ScheduleAssignment).where(
            and_(
                ScheduleAssignment.employee_id == assignment_in.employee_id,
                ScheduleAssignment.assignment_date == assignment_in.assignment_date,
            )
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Update existing assignment
        update_data = assignment_in.model_dump(
            exclude={"employee_id", "assignment_date"}
        )
        for field, value in update_data.items():
            setattr(existing, field, value)
        await db.commit()
        await db.refresh(existing)
        return existing

    # Create new assignment
    assignment = ScheduleAssignment(
        **assignment_in.model_dump(), created_by=current_user.id
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return assignment


@router.post(
    "/assignments/bulk",
    status_code=status.HTTP_201_CREATED,
    tags=["schedules"],
)
async def create_bulk_assignments(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    bulk_in: BulkAssignmentCreate,
) -> dict:
    """
    Asignar un patrón de horario a múltiples empleados y fechas en una sola llamada. Requiere rol admin.

    Útil para configurar horarios semanales o quincenales en bloque.
    Acepta listas de `employee_ids` y `dates` — genera el producto cartesiano de ambas.

    Comportamiento upsert por cada par (empleado, fecha): actualiza si existe, crea si no.
    La respuesta incluye `created` y `updated` con los conteos respectivos.
    """
    created_count = 0
    updated_count = 0

    for emp_id in bulk_in.employee_ids:
        for assignment_date in bulk_in.dates:
            result = await db.execute(
                select(ScheduleAssignment).where(
                    and_(
                        ScheduleAssignment.employee_id == emp_id,
                        ScheduleAssignment.assignment_date == assignment_date,
                    )
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.schedule_id = bulk_in.schedule_id
                existing.is_day_off = bulk_in.is_day_off
                updated_count += 1
            else:
                assignment = ScheduleAssignment(
                    employee_id=emp_id,
                    assignment_date=assignment_date,
                    schedule_id=bulk_in.schedule_id,
                    is_day_off=bulk_in.is_day_off,
                    created_by=current_user.id,
                )
                db.add(assignment)
                created_count += 1

    await db.commit()
    return {"created": created_count, "updated": updated_count}


@router.delete(
    "/assignments/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["schedules"],
    responses={
        404: {"description": "Asignación no encontrada"},
    },
)
async def delete_assignment(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    assignment_id: UUID,
) -> None:
    """Eliminar una asignación de horario. Requiere rol admin."""
    result = await db.execute(
        select(ScheduleAssignment).where(ScheduleAssignment.id == assignment_id)
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found"
        )
    await db.delete(assignment)
    await db.commit()


# ==================== SCHEDULE EXCEPTIONS ====================


@router.get(
    "/exceptions",
    response_model=list[ScheduleExceptionResponse],
    tags=["schedules"],
)
async def list_exceptions(
    db: Annotated[AsyncSession, Depends(get_db)],
    employee_id: UUID | None = None,
    exception_type: ExceptionTypeEnum | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[ScheduleException]:
    """
    Listar excepciones de horario con filtros opcionales.

    Tipos de excepción disponibles (`exception_type`):
    - `vacation` — vacaciones
    - `holiday` — feriado nacional o institucional
    - `sick_leave` — incapacidad médica
    - `permission` — permiso con o sin goce de sueldo
    - `other` — otro motivo

    **Nota:** Las excepciones con `employee_id = null` aplican a **todos** los empleados
    (útil para feriados globales). Al filtrar por `employee_id`, se devuelven tanto las
    excepciones individuales del empleado como las globales.
    """
    query = select(ScheduleException)

    if employee_id:
        query = query.where(
            or_(
                ScheduleException.employee_id == employee_id,
                ScheduleException.employee_id == None,
            )
        )
    if exception_type:
        query = query.where(ScheduleException.exception_type == exception_type)
    if date_from:
        query = query.where(ScheduleException.end_date >= date_from)
    if date_to:
        query = query.where(ScheduleException.start_date <= date_to)

    query = query.order_by(ScheduleException.start_date)
    result = await db.execute(query)
    return result.scalars().all()


@router.post(
    "/exceptions",
    response_model=ScheduleExceptionResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["schedules"],
)
async def create_exception(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    exception_in: ScheduleExceptionCreate,
) -> ScheduleException:
    """
    Crear una excepción de horario. Requiere rol admin.

    Tipos disponibles: `vacation`, `holiday`, `sick_leave`, `permission`, `other`.

    Omitir `employee_id` para crear una excepción **global** que aplica a todos los empleados
    (útil para feriados nacionales o cierre institucional).

    Si `has_work_hours: true`, se pueden especificar `work_check_in` y `work_check_out`
    para días con horario reducido (p.ej. feriado con guardia). Si `has_work_hours: false`,
    el día se marca como descanso.
    """
    exception = ScheduleException(
        **exception_in.model_dump(), created_by=current_user.id
    )
    db.add(exception)
    await db.commit()
    await db.refresh(exception)
    return exception


@router.patch(
    "/exceptions/{exception_id}",
    response_model=ScheduleExceptionResponse,
    tags=["schedules"],
    responses={
        404: {"description": "Excepción no encontrada"},
    },
)
async def update_exception(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    exception_id: UUID,
    exception_in: ScheduleExceptionUpdate,
) -> ScheduleException:
    """Actualizar una excepción de horario parcialmente. Requiere rol admin."""
    result = await db.execute(
        select(ScheduleException).where(ScheduleException.id == exception_id)
    )
    exception = result.scalar_one_or_none()
    if not exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Exception not found"
        )

    update_data = exception_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(exception, field, value)

    await db.commit()
    await db.refresh(exception)
    return exception


@router.delete(
    "/exceptions/{exception_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["schedules"],
    responses={
        404: {"description": "Excepción no encontrada"},
    },
)
async def delete_exception(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    exception_id: UUID,
) -> None:
    """Eliminar una excepción de horario. Requiere rol admin."""
    result = await db.execute(
        select(ScheduleException).where(ScheduleException.id == exception_id)
    )
    exception = result.scalar_one_or_none()
    if not exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Exception not found"
        )
    await db.delete(exception)
    await db.commit()


# ==================== CALENDAR VIEW ====================


@router.get(
    "/calendar",
    response_model=CalendarResponse,
    tags=["schedules"],
)
async def get_calendar(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    start_date: date = Query(..., description="Fecha de inicio del rango (YYYY-MM-DD)"),
    end_date: date = Query(..., description="Fecha de fin del rango (YYYY-MM-DD)"),
    department_id: UUID | None = None,
    employee_id: UUID | None = None,
) -> CalendarResponse:
    """
    Vista consolidada de horarios para todos los empleados en un rango de fechas. Requiere autenticación.

    Para cada empleado y cada día del rango, resuelve el horario aplicable
    siguiendo esta lógica de prioridad (de mayor a menor):

    1. **Excepción** (`vacation`, `holiday`, `sick_leave`, `permission`, `other`) —
       si existe una excepción individual o global para ese día, tiene prioridad absoluta.
       Color: gris (día libre) o azul (excepción con horas de trabajo especiales).
    2. **Asignación específica** — si hay una asignación para ese empleado y fecha concreta,
       aplica el patrón asignado o el horario personalizado. Color: color del patrón o violeta
       si es horario custom.
    3. **Horario por defecto** (`EmployeeSchedule`) — si no hay excepción ni asignación,
       se usa el patrón asignado al empleado para ese día de la semana.

    **Filtros opcionales:** `department_id` para ver solo un departamento,
    `employee_id` para ver solo un empleado.

    La respuesta es una grilla: una fila por empleado, una columna por día del rango.
    """

    # Get employees
    emp_query = select(Employee).where(Employee.is_active == True)
    if department_id:
        emp_query = emp_query.where(Employee.department_id == department_id)
    if employee_id:
        emp_query = emp_query.where(Employee.id == employee_id)
    emp_query = emp_query.order_by(Employee.last_name, Employee.first_name)

    emp_result = await db.execute(emp_query)
    employees = emp_result.scalars().all()

    # Get all schedule patterns
    patterns_result = await db.execute(
        select(Schedule).where(Schedule.is_active == True)
    )
    patterns = {p.id: p for p in patterns_result.scalars().all()}

    # Get departments for display
    dept_result = await db.execute(select(Department))
    departments = {d.id: d.name for d in dept_result.scalars().all()}

    # Get all assignments in date range
    assign_result = await db.execute(
        select(ScheduleAssignment).where(
            and_(
                ScheduleAssignment.assignment_date >= start_date,
                ScheduleAssignment.assignment_date <= end_date,
            )
        )
    )
    assignments = {}
    for a in assign_result.scalars().all():
        key = (a.employee_id, a.assignment_date)
        assignments[key] = a

    # Get all exceptions in date range
    exc_result = await db.execute(
        select(ScheduleException).where(
            and_(
                ScheduleException.end_date >= start_date,
                ScheduleException.start_date <= end_date,
            )
        )
    )
    exceptions = exc_result.scalars().all()

    # Get default employee schedules
    default_schedules_result = await db.execute(select(EmployeeSchedule))
    default_schedules = {}
    for ds in default_schedules_result.scalars().all():
        key = (ds.employee_id, ds.day_of_week)
        if (
            key not in default_schedules
            or ds.effective_from > default_schedules[key].effective_from
        ):
            default_schedules[key] = ds

    # Build calendar response
    calendar_rows = []
    for emp in employees:
        days = []
        current_date = start_date

        # Get default pattern for employee
        default_pattern_id = None
        default_pattern_name = None
        for dow in range(7):
            key = (emp.id, dow)
            if key in default_schedules:
                ds = default_schedules[key]
                if ds.schedule_id in patterns:
                    default_pattern_id = ds.schedule_id
                    default_pattern_name = patterns[ds.schedule_id].name
                    break

        while current_date <= end_date:
            day_info = CalendarDayInfo(date=current_date)
            day_of_week = current_date.weekday()

            # Check for exceptions first
            exception_found = None
            for exc in exceptions:
                if exc.start_date <= current_date <= exc.end_date:
                    if exc.employee_id is None or exc.employee_id == emp.id:
                        exception_found = exc
                        break

            if exception_found:
                day_info.exception_type = ExceptionTypeEnum(
                    exception_found.exception_type.value
                )
                day_info.exception_description = exception_found.description
                if exception_found.has_work_hours:
                    day_info.check_in = exception_found.work_check_in
                    day_info.check_out = exception_found.work_check_out
                    day_info.color = "#1e40af"  # Blue for special hours
                else:
                    day_info.is_day_off = True
                    day_info.color = "#6b7280"  # Gray for day off
            else:
                # Check for specific assignment
                key = (emp.id, current_date)
                if key in assignments:
                    assign = assignments[key]
                    if assign.is_day_off:
                        day_info.is_day_off = True
                        day_info.color = "#6b7280"
                    elif assign.schedule_id and assign.schedule_id in patterns:
                        pattern = patterns[assign.schedule_id]
                        day_info.schedule_id = pattern.id
                        day_info.schedule_name = pattern.name
                        day_info.check_in = pattern.check_in_time
                        day_info.check_out = pattern.check_out_time
                        day_info.color = pattern.color
                    elif assign.custom_check_in and assign.custom_check_out:
                        day_info.check_in = assign.custom_check_in
                        day_info.check_out = assign.custom_check_out
                        day_info.color = "#8b5cf6"  # Purple for custom
                else:
                    # Use default schedule for day of week
                    ds_key = (emp.id, day_of_week)
                    if ds_key in default_schedules:
                        ds = default_schedules[ds_key]
                        if ds.schedule_id in patterns:
                            pattern = patterns[ds.schedule_id]
                            day_info.schedule_id = pattern.id
                            day_info.schedule_name = pattern.name
                            day_info.check_in = pattern.check_in_time
                            day_info.check_out = pattern.check_out_time
                            day_info.color = pattern.color

            days.append(day_info)
            current_date += timedelta(days=1)

        row = EmployeeCalendarRow(
            employee_id=emp.id,
            employee_code=emp.employee_code,
            first_name=emp.first_name,
            last_name=emp.last_name,
            department_name=departments.get(emp.department_id)
            if emp.department_id
            else None,
            default_schedule_id=default_pattern_id,
            default_schedule_name=default_pattern_name,
            days=days,
        )
        calendar_rows.append(row)

    return CalendarResponse(
        start_date=start_date, end_date=end_date, employees=calendar_rows
    )
