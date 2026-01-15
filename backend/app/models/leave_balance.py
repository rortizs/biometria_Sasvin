"""
Leave Balance Models - Saldos Laborales

Tipos de saldo:
- Vacaciones (dias): acumulacion anual segun antiguedad
- Incapacidad (dias): fondo fijo anual
- Horas Compensatorias (horas:minutos): por horas extra trabajadas
- Personalizados: configurables por empresa
"""
import uuid
from datetime import datetime, date
from decimal import Decimal
from enum import Enum as PyEnum

from sqlalchemy import (
    String, Boolean, DateTime, Date, Integer, ForeignKey,
    Text, Numeric, UniqueConstraint, Enum, CheckConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class LeaveUnit(str, PyEnum):
    """Unidad de medida del saldo"""
    DAYS = "days"           # Dias
    HOURS = "hours"         # Horas (para compensatorios)


class AccrualType(str, PyEnum):
    """Tipo de acumulacion del saldo"""
    ANNUAL = "annual"           # Acumulacion anual (vacaciones)
    FIXED = "fixed"             # Fondo fijo (incapacidad)
    OVERTIME = "overtime"       # Por horas extra (compensatorio)
    MANUAL = "manual"           # Asignacion manual


class TransactionType(str, PyEnum):
    """Tipo de transaccion"""
    CREDIT = "credit"           # Acreditacion (suma)
    DEBIT = "debit"             # Uso/Descuento (resta)
    ADJUSTMENT = "adjustment"   # Ajuste manual
    EXPIRATION = "expiration"   # Vencimiento


class LeavePolicy(Base):
    """
    Politica de saldo laboral - Define tipos de saldo y reglas de acumulacion.

    Ejemplos:
    - Vacaciones: 15 dias/anio, acumulacion anual
    - Incapacidad: 30 dias/anio, fondo fijo
    - Compensatorio: horas extra trabajadas
    """
    __tablename__ = "leave_policies"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Configuracion
    unit: Mapped[LeaveUnit] = mapped_column(
        Enum(LeaveUnit), nullable=False, default=LeaveUnit.DAYS
    )
    accrual_type: Mapped[AccrualType] = mapped_column(
        Enum(AccrualType), nullable=False, default=AccrualType.ANNUAL
    )

    # Cantidad base por periodo (ej: 15 dias/anio)
    base_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=0
    )

    # Incremento por anio de antiguedad (ej: +1 dia por cada 5 anios)
    increment_per_years: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=0
    )
    years_for_increment: Mapped[int] = mapped_column(
        Integer, nullable=False, default=5
    )
    max_amount: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True  # Tope maximo
    )

    # Reglas de expiracion
    expires_after_days: Mapped[int | None] = mapped_column(
        Integer, nullable=True  # Dias para vencer (null = no vence)
    )
    allow_carryover: Mapped[bool] = mapped_column(
        Boolean, default=False  # Permite arrastrar al siguiente periodo
    )
    max_carryover: Mapped[Decimal | None] = mapped_column(
        Numeric(10, 2), nullable=True  # Maximo a arrastrar
    )

    # Color para UI
    color: Mapped[str] = mapped_column(
        String(7), default="#3b82f6"  # Hex color
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    balances: Mapped[list["LeaveBalance"]] = relationship(
        "LeaveBalance", back_populates="policy", cascade="all, delete-orphan"
    )


class LeaveBalance(Base):
    """
    Saldo de un empleado para un tipo de permiso en un periodo.

    Ej: Juan tiene 15 dias de vacaciones para 2025
    """
    __tablename__ = "leave_balances"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("employees.id", ondelete="CASCADE"), nullable=False
    )
    policy_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leave_policies.id", ondelete="CASCADE"), nullable=False
    )

    # Periodo (anual normalmente)
    period_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)

    # Saldos (en la unidad definida por policy)
    initial_balance: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=0
    )
    current_balance: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=0
    )
    used_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=0
    )
    pending_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=0  # Solicitudes pendientes
    )

    # Arrastre del periodo anterior
    carryover_amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=0
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    policy: Mapped["LeavePolicy"] = relationship(
        "LeavePolicy", back_populates="balances"
    )
    transactions: Mapped[list["LeaveTransaction"]] = relationship(
        "LeaveTransaction", back_populates="balance", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint(
            "employee_id", "policy_id", "period_year",
            name="uq_employee_policy_period"
        ),
        CheckConstraint("current_balance >= 0", name="ck_positive_balance"),
    )

    @property
    def available_balance(self) -> Decimal:
        """Saldo disponible = actual - pendiente"""
        return self.current_balance - self.pending_amount


class LeaveTransaction(Base):
    """
    Transaccion/Movimiento de saldo.

    Registra cada cambio: acreditacion anual, uso por vacaciones, ajustes, etc.
    """
    __tablename__ = "leave_transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    balance_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("leave_balances.id", ondelete="CASCADE"), nullable=False
    )

    transaction_type: Mapped[TransactionType] = mapped_column(
        Enum(TransactionType), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )

    # Saldo antes y despues de la transaccion
    balance_before: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    balance_after: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False
    )

    # Referencia a la excepcion de horario (si aplica)
    schedule_exception_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("schedule_exceptions.id", ondelete="SET NULL"), nullable=True
    )

    # Fechas de uso (para vacaciones, etc.)
    usage_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    usage_end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Relationships
    balance: Mapped["LeaveBalance"] = relationship(
        "LeaveBalance", back_populates="transactions"
    )
