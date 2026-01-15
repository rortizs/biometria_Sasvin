"""
Leave Balance Schemas - Saldos Laborales
"""
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from enum import Enum

from pydantic import BaseModel, Field


class LeaveUnitEnum(str, Enum):
    days = "days"
    hours = "hours"


class AccrualTypeEnum(str, Enum):
    annual = "annual"
    fixed = "fixed"
    overtime = "overtime"
    manual = "manual"


class TransactionTypeEnum(str, Enum):
    credit = "credit"
    debit = "debit"
    adjustment = "adjustment"
    expiration = "expiration"


# ============ Leave Policy Schemas ============

class LeavePolicyBase(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    unit: LeaveUnitEnum = LeaveUnitEnum.days
    accrual_type: AccrualTypeEnum = AccrualTypeEnum.annual
    base_amount: Decimal = Field(default=Decimal("0"), ge=0)
    increment_per_years: Decimal = Field(default=Decimal("0"), ge=0)
    years_for_increment: int = Field(default=5, ge=1)
    max_amount: Decimal | None = None
    expires_after_days: int | None = None
    allow_carryover: bool = False
    max_carryover: Decimal | None = None
    color: str = Field(default="#3b82f6", pattern=r'^#[0-9a-fA-F]{6}$')


class LeavePolicyCreate(LeavePolicyBase):
    pass


class LeavePolicyUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    unit: LeaveUnitEnum | None = None
    accrual_type: AccrualTypeEnum | None = None
    base_amount: Decimal | None = None
    increment_per_years: Decimal | None = None
    years_for_increment: int | None = None
    max_amount: Decimal | None = None
    expires_after_days: int | None = None
    allow_carryover: bool | None = None
    max_carryover: Decimal | None = None
    color: str | None = None
    is_active: bool | None = None


class LeavePolicyResponse(LeavePolicyBase):
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============ Leave Balance Schemas ============

class LeaveBalanceBase(BaseModel):
    employee_id: UUID
    policy_id: UUID
    period_year: int = Field(..., ge=2000, le=2100)
    period_start: date
    period_end: date


class LeaveBalanceCreate(LeaveBalanceBase):
    initial_balance: Decimal = Field(default=Decimal("0"), ge=0)
    carryover_amount: Decimal = Field(default=Decimal("0"), ge=0)


class LeaveBalanceUpdate(BaseModel):
    initial_balance: Decimal | None = None
    current_balance: Decimal | None = None
    carryover_amount: Decimal | None = None


class LeaveBalanceResponse(LeaveBalanceBase):
    id: UUID
    initial_balance: Decimal
    current_balance: Decimal
    used_amount: Decimal
    pending_amount: Decimal
    carryover_amount: Decimal
    available_balance: Decimal
    created_at: datetime
    updated_at: datetime

    # Nested info
    policy_name: str | None = None
    policy_code: str | None = None
    policy_unit: LeaveUnitEnum | None = None
    policy_color: str | None = None

    class Config:
        from_attributes = True


# ============ Leave Transaction Schemas ============

class LeaveTransactionBase(BaseModel):
    balance_id: UUID
    transaction_type: TransactionTypeEnum
    amount: Decimal = Field(..., gt=0)
    description: str | None = None


class LeaveTransactionCreate(LeaveTransactionBase):
    schedule_exception_id: UUID | None = None
    usage_start_date: date | None = None
    usage_end_date: date | None = None


class LeaveTransactionResponse(LeaveTransactionBase):
    id: UUID
    balance_before: Decimal
    balance_after: Decimal
    schedule_exception_id: UUID | None = None
    usage_start_date: date | None = None
    usage_end_date: date | None = None
    created_at: datetime
    created_by: UUID | None = None

    class Config:
        from_attributes = True


# ============ Employee Balance Summary ============

class EmployeeBalanceSummary(BaseModel):
    """Resumen de saldos de un empleado para la vista principal"""
    employee_id: UUID
    employee_code: str
    first_name: str
    last_name: str
    department_name: str | None = None

    # Lista de saldos activos
    balances: list[LeaveBalanceResponse] = []


class EmployeeBalanceDetail(BaseModel):
    """Detalle expandido con historial de transacciones"""
    employee_id: UUID
    employee_code: str
    first_name: str
    last_name: str
    department_name: str | None = None
    hire_date: date | None = None
    years_of_service: int = 0

    balance: LeaveBalanceResponse
    transactions: list[LeaveTransactionResponse] = []


# ============ Bulk Operations ============

class BulkAccrualCreate(BaseModel):
    """Acreditacion masiva de saldos (ej: vacaciones anuales)"""
    policy_id: UUID
    period_year: int = Field(..., ge=2000, le=2100)
    employee_ids: list[UUID] | None = None  # None = todos los activos


class BalanceCalculationRequest(BaseModel):
    """Solicitud para calcular saldo de vacaciones segun antiguedad"""
    employee_id: UUID
    policy_id: UUID
    period_year: int


class BalanceCalculationResponse(BaseModel):
    """Respuesta del calculo de saldo"""
    employee_id: UUID
    policy_id: UUID
    period_year: int
    years_of_service: int
    calculated_amount: Decimal
    base_amount: Decimal
    increment_amount: Decimal


# ============ Filters ============

class LeaveBalanceFilters(BaseModel):
    """Filtros para la lista de saldos"""
    search: str | None = None
    policy_id: UUID | None = None
    department_id: UUID | None = None
    employee_id: UUID | None = None
    period_year: int | None = None
