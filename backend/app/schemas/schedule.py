from datetime import date, time, datetime
from uuid import UUID
from enum import Enum

from pydantic import BaseModel, Field


class ExceptionTypeEnum(str, Enum):
    day_off = "day_off"
    vacation = "vacation"
    sick_leave = "sick_leave"
    holiday = "holiday"
    permission = "permission"
    other = "other"


# Schedule (Pattern) Schemas
class ScheduleBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    check_in_time: time
    check_out_time: time
    tolerance_minutes: int = Field(default=15, ge=0, le=120)
    color: str = Field(default="#f97316", pattern=r'^#[0-9a-fA-F]{6}$')


class ScheduleCreate(ScheduleBase):
    pass


class ScheduleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    check_in_time: time | None = None
    check_out_time: time | None = None
    tolerance_minutes: int | None = None
    color: str | None = None
    is_active: bool | None = None


class ScheduleResponse(ScheduleBase):
    id: UUID
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# Employee Schedule (Default Pattern Assignment) Schemas
class EmployeeScheduleBase(BaseModel):
    employee_id: UUID
    schedule_id: UUID
    day_of_week: int = Field(..., ge=0, le=6)  # 0=Monday, 6=Sunday
    effective_from: date
    effective_to: date | None = None


class EmployeeScheduleCreate(EmployeeScheduleBase):
    pass


class EmployeeScheduleResponse(EmployeeScheduleBase):
    id: UUID

    class Config:
        from_attributes = True


# Schedule Assignment (Specific Date) Schemas
class ScheduleAssignmentBase(BaseModel):
    employee_id: UUID
    assignment_date: date
    schedule_id: UUID | None = None
    custom_check_in: time | None = None
    custom_check_out: time | None = None
    is_day_off: bool = False


class ScheduleAssignmentCreate(ScheduleAssignmentBase):
    pass


class ScheduleAssignmentUpdate(BaseModel):
    schedule_id: UUID | None = None
    custom_check_in: time | None = None
    custom_check_out: time | None = None
    is_day_off: bool | None = None


class ScheduleAssignmentResponse(ScheduleAssignmentBase):
    id: UUID
    created_at: datetime
    created_by: UUID | None = None

    class Config:
        from_attributes = True


# Schedule Exception Schemas
class ScheduleExceptionBase(BaseModel):
    employee_id: UUID | None = None  # NULL = applies to all
    exception_type: ExceptionTypeEnum
    start_date: date
    end_date: date
    description: str | None = None
    has_work_hours: bool = False
    work_check_in: time | None = None
    work_check_out: time | None = None


class ScheduleExceptionCreate(ScheduleExceptionBase):
    pass


class ScheduleExceptionUpdate(BaseModel):
    exception_type: ExceptionTypeEnum | None = None
    start_date: date | None = None
    end_date: date | None = None
    description: str | None = None
    has_work_hours: bool | None = None
    work_check_in: time | None = None
    work_check_out: time | None = None


class ScheduleExceptionResponse(ScheduleExceptionBase):
    id: UUID
    created_at: datetime
    created_by: UUID | None = None

    class Config:
        from_attributes = True


# Bulk Assignment for Calendar View
class BulkAssignmentCreate(BaseModel):
    employee_ids: list[UUID]
    dates: list[date]
    schedule_id: UUID | None = None
    is_day_off: bool = False


# Calendar View Response
class CalendarDayInfo(BaseModel):
    date: date
    schedule_id: UUID | None = None
    schedule_name: str | None = None
    check_in: time | None = None
    check_out: time | None = None
    is_day_off: bool = False
    exception_type: ExceptionTypeEnum | None = None
    exception_description: str | None = None
    color: str = "#e5e7eb"  # Default gray for day off


class EmployeeCalendarRow(BaseModel):
    employee_id: UUID
    employee_code: str
    first_name: str
    last_name: str
    department_name: str | None = None
    default_schedule_id: UUID | None = None
    default_schedule_name: str | None = None
    days: list[CalendarDayInfo]


class CalendarResponse(BaseModel):
    start_date: date
    end_date: date
    employees: list[EmployeeCalendarRow]
