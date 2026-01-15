import uuid
from datetime import datetime, time, date
from enum import Enum as PyEnum

from sqlalchemy import String, Boolean, DateTime, Time, Date, Integer, ForeignKey, UniqueConstraint, Enum, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ExceptionType(str, PyEnum):
    """Types of schedule exceptions"""
    DAY_OFF = "day_off"           # Día libre
    VACATION = "vacation"         # Vacaciones
    SICK_LEAVE = "sick_leave"     # Incapacidad
    HOLIDAY = "holiday"           # Feriado
    PERMISSION = "permission"     # Permiso
    OTHER = "other"               # Otro


class Schedule(Base):
    """Work schedule patterns (Patrones de horario)"""
    __tablename__ = "schedules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    check_in_time: Mapped[time] = mapped_column(Time, nullable=False)
    check_out_time: Mapped[time] = mapped_column(Time, nullable=False)
    tolerance_minutes: Mapped[int] = mapped_column(Integer, default=15)
    color: Mapped[str] = mapped_column(String(7), default="#f97316")  # Hex color for UI
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class EmployeeSchedule(Base):
    """Default schedule pattern assigned to employee per day of week"""
    __tablename__ = "employee_schedules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    schedule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schedules.id", ondelete="CASCADE"), nullable=False
    )
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)  # 0=Monday, 6=Sunday
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "employee_id", "day_of_week", "effective_from",
            name="uq_employee_day_effective"
        ),
    )


class ScheduleAssignment(Base):
    """Specific schedule assignment for an employee on a specific date (overrides default)"""
    __tablename__ = "schedule_assignments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    assignment_date: Mapped[date] = mapped_column(Date, nullable=False)
    schedule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schedules.id", ondelete="SET NULL"), nullable=True
    )
    # Custom times if not using a schedule pattern
    custom_check_in: Mapped[time | None] = mapped_column(Time, nullable=True)
    custom_check_out: Mapped[time | None] = mapped_column(Time, nullable=True)
    is_day_off: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        UniqueConstraint("employee_id", "assignment_date", name="uq_employee_assignment_date"),
    )


class ScheduleException(Base):
    """Schedule exceptions: vacations, holidays, sick leave, etc."""
    __tablename__ = "schedule_exceptions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=True
    )  # NULL means applies to all employees (e.g., holidays)
    exception_type: Mapped[ExceptionType] = mapped_column(
        Enum(ExceptionType), nullable=False
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # For holidays/exceptions that still have work hours
    has_work_hours: Mapped[bool] = mapped_column(Boolean, default=False)
    work_check_in: Mapped[time | None] = mapped_column(Time, nullable=True)
    work_check_out: Mapped[time | None] = mapped_column(Time, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
