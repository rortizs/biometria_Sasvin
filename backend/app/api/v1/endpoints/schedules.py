from typing import Annotated
from uuid import UUID
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_current_active_admin, get_current_active_user
from app.models.schedule import Schedule, EmployeeSchedule, ScheduleAssignment, ScheduleException, ExceptionType
from app.models.employee import Employee
from app.models.department import Department
from app.models.user import User
from app.schemas.schedule import (
    ScheduleCreate, ScheduleUpdate, ScheduleResponse,
    EmployeeScheduleCreate, EmployeeScheduleResponse,
    ScheduleAssignmentCreate, ScheduleAssignmentUpdate, ScheduleAssignmentResponse,
    ScheduleExceptionCreate, ScheduleExceptionUpdate, ScheduleExceptionResponse,
    BulkAssignmentCreate,
    CalendarResponse, EmployeeCalendarRow, CalendarDayInfo, ExceptionTypeEnum
)

router = APIRouter()


# ==================== SCHEDULE PATTERNS ====================

@router.get("/patterns", response_model=list[ScheduleResponse])
async def list_schedule_patterns(
    db: Annotated[AsyncSession, Depends(get_db)],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    active_only: bool = True,
) -> list[Schedule]:
    """List all schedule patterns."""
    query = select(Schedule)
    if active_only:
        query = query.where(Schedule.is_active == True)
    query = query.offset(skip).limit(limit).order_by(Schedule.name)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/patterns/{pattern_id}", response_model=ScheduleResponse)
async def get_schedule_pattern(
    db: Annotated[AsyncSession, Depends(get_db)],
    pattern_id: UUID,
) -> Schedule:
    """Get a specific schedule pattern."""
    result = await db.execute(select(Schedule).where(Schedule.id == pattern_id))
    pattern = result.scalar_one_or_none()
    if not pattern:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule pattern not found")
    return pattern


@router.post("/patterns", response_model=ScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule_pattern(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    pattern_in: ScheduleCreate,
) -> Schedule:
    """Create a new schedule pattern (admin only)."""
    result = await db.execute(select(Schedule).where(Schedule.name == pattern_in.name))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Pattern with this name already exists")

    pattern = Schedule(**pattern_in.model_dump())
    db.add(pattern)
    await db.commit()
    await db.refresh(pattern)
    return pattern


@router.patch("/patterns/{pattern_id}", response_model=ScheduleResponse)
async def update_schedule_pattern(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    pattern_id: UUID,
    pattern_in: ScheduleUpdate,
) -> Schedule:
    """Update a schedule pattern (admin only)."""
    result = await db.execute(select(Schedule).where(Schedule.id == pattern_id))
    pattern = result.scalar_one_or_none()
    if not pattern:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule pattern not found")

    update_data = pattern_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(pattern, field, value)

    await db.commit()
    await db.refresh(pattern)
    return pattern


@router.delete("/patterns/{pattern_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule_pattern(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    pattern_id: UUID,
) -> None:
    """Delete a schedule pattern (admin only)."""
    result = await db.execute(select(Schedule).where(Schedule.id == pattern_id))
    pattern = result.scalar_one_or_none()
    if not pattern:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule pattern not found")
    await db.delete(pattern)
    await db.commit()


# ==================== SCHEDULE ASSIGNMENTS ====================

@router.get("/assignments", response_model=list[ScheduleAssignmentResponse])
async def list_assignments(
    db: Annotated[AsyncSession, Depends(get_db)],
    employee_id: UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[ScheduleAssignment]:
    """List schedule assignments with optional filters."""
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


@router.post("/assignments", response_model=ScheduleAssignmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    assignment_in: ScheduleAssignmentCreate,
) -> ScheduleAssignment:
    """Create or update a schedule assignment for a specific date."""
    # Check if assignment already exists for this employee and date
    result = await db.execute(
        select(ScheduleAssignment).where(
            and_(
                ScheduleAssignment.employee_id == assignment_in.employee_id,
                ScheduleAssignment.assignment_date == assignment_in.assignment_date
            )
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Update existing assignment
        update_data = assignment_in.model_dump(exclude={'employee_id', 'assignment_date'})
        for field, value in update_data.items():
            setattr(existing, field, value)
        await db.commit()
        await db.refresh(existing)
        return existing

    # Create new assignment
    assignment = ScheduleAssignment(**assignment_in.model_dump(), created_by=current_user.id)
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return assignment


@router.post("/assignments/bulk", status_code=status.HTTP_201_CREATED)
async def create_bulk_assignments(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    bulk_in: BulkAssignmentCreate,
) -> dict:
    """Create assignments for multiple employees and dates."""
    created_count = 0
    updated_count = 0

    for emp_id in bulk_in.employee_ids:
        for assignment_date in bulk_in.dates:
            result = await db.execute(
                select(ScheduleAssignment).where(
                    and_(
                        ScheduleAssignment.employee_id == emp_id,
                        ScheduleAssignment.assignment_date == assignment_date
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
                    created_by=current_user.id
                )
                db.add(assignment)
                created_count += 1

    await db.commit()
    return {"created": created_count, "updated": updated_count}


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    assignment_id: UUID,
) -> None:
    """Delete a schedule assignment."""
    result = await db.execute(select(ScheduleAssignment).where(ScheduleAssignment.id == assignment_id))
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    await db.delete(assignment)
    await db.commit()


# ==================== SCHEDULE EXCEPTIONS ====================

@router.get("/exceptions", response_model=list[ScheduleExceptionResponse])
async def list_exceptions(
    db: Annotated[AsyncSession, Depends(get_db)],
    employee_id: UUID | None = None,
    exception_type: ExceptionTypeEnum | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[ScheduleException]:
    """List schedule exceptions with optional filters."""
    query = select(ScheduleException)

    if employee_id:
        query = query.where(
            or_(ScheduleException.employee_id == employee_id, ScheduleException.employee_id == None)
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


@router.post("/exceptions", response_model=ScheduleExceptionResponse, status_code=status.HTTP_201_CREATED)
async def create_exception(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    exception_in: ScheduleExceptionCreate,
) -> ScheduleException:
    """Create a schedule exception (vacation, holiday, sick leave, etc.)."""
    exception = ScheduleException(**exception_in.model_dump(), created_by=current_user.id)
    db.add(exception)
    await db.commit()
    await db.refresh(exception)
    return exception


@router.patch("/exceptions/{exception_id}", response_model=ScheduleExceptionResponse)
async def update_exception(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    exception_id: UUID,
    exception_in: ScheduleExceptionUpdate,
) -> ScheduleException:
    """Update a schedule exception."""
    result = await db.execute(select(ScheduleException).where(ScheduleException.id == exception_id))
    exception = result.scalar_one_or_none()
    if not exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exception not found")

    update_data = exception_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(exception, field, value)

    await db.commit()
    await db.refresh(exception)
    return exception


@router.delete("/exceptions/{exception_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exception(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    exception_id: UUID,
) -> None:
    """Delete a schedule exception."""
    result = await db.execute(select(ScheduleException).where(ScheduleException.id == exception_id))
    exception = result.scalar_one_or_none()
    if not exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exception not found")
    await db.delete(exception)
    await db.commit()


# ==================== CALENDAR VIEW ====================

@router.get("/calendar", response_model=CalendarResponse)
async def get_calendar(
    db: Annotated[AsyncSession, Depends(get_db)],
    start_date: date = Query(..., description="Start date of the calendar view"),
    end_date: date = Query(..., description="End date of the calendar view"),
    department_id: UUID | None = None,
    employee_id: UUID | None = None,
) -> CalendarResponse:
    """Get calendar view with schedules for all employees in a date range."""

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
    patterns_result = await db.execute(select(Schedule).where(Schedule.is_active == True))
    patterns = {p.id: p for p in patterns_result.scalars().all()}

    # Get departments for display
    dept_result = await db.execute(select(Department))
    departments = {d.id: d.name for d in dept_result.scalars().all()}

    # Get all assignments in date range
    assign_result = await db.execute(
        select(ScheduleAssignment).where(
            and_(
                ScheduleAssignment.assignment_date >= start_date,
                ScheduleAssignment.assignment_date <= end_date
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
                ScheduleException.start_date <= end_date
            )
        )
    )
    exceptions = exc_result.scalars().all()

    # Get default employee schedules
    default_schedules_result = await db.execute(select(EmployeeSchedule))
    default_schedules = {}
    for ds in default_schedules_result.scalars().all():
        key = (ds.employee_id, ds.day_of_week)
        if key not in default_schedules or ds.effective_from > default_schedules[key].effective_from:
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
                day_info.exception_type = ExceptionTypeEnum(exception_found.exception_type.value)
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
            department_name=departments.get(emp.department_id) if emp.department_id else None,
            default_schedule_id=default_pattern_id,
            default_schedule_name=default_pattern_name,
            days=days
        )
        calendar_rows.append(row)

    return CalendarResponse(
        start_date=start_date,
        end_date=end_date,
        employees=calendar_rows
    )
