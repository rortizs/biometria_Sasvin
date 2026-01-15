"""
Leave Balance Service - Logica de negocio para saldos laborales
"""
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.employee import Employee
from app.models.leave_balance import (
    LeavePolicy, LeaveBalance, LeaveTransaction,
    LeaveUnit, AccrualType, TransactionType
)
from app.models.schedule import ScheduleException, ExceptionType


class LeaveService:
    """Servicio para gestion de saldos laborales"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def calculate_years_of_service(self, employee: Employee, as_of_date: date | None = None) -> int:
        """Calcula anios de antiguedad del empleado"""
        if not employee.hire_date:
            return 0

        reference_date = as_of_date or date.today()
        delta = reference_date - employee.hire_date

        return delta.days // 365

    async def calculate_vacation_days(
        self,
        employee: Employee,
        policy: LeavePolicy,
        period_year: int
    ) -> tuple[Decimal, Decimal, Decimal]:
        """
        Calcula dias de vacaciones segun antiguedad.

        Returns:
            Tuple[base_amount, increment_amount, total_amount]
        """
        # Fecha de referencia: inicio del periodo
        reference_date = date(period_year, 1, 1)
        years_of_service = await self.calculate_years_of_service(employee, reference_date)

        base_amount = policy.base_amount

        # Calcular incremento por antiguedad
        if policy.years_for_increment > 0:
            increments = years_of_service // policy.years_for_increment
            increment_amount = policy.increment_per_years * Decimal(str(increments))
        else:
            increment_amount = Decimal("0")

        total_amount = base_amount + increment_amount

        # Aplicar tope maximo si existe
        if policy.max_amount and total_amount > policy.max_amount:
            total_amount = policy.max_amount

        return base_amount, increment_amount, total_amount

    async def get_or_create_balance(
        self,
        employee_id: UUID,
        policy_id: UUID,
        period_year: int
    ) -> LeaveBalance:
        """Obtiene o crea el saldo para un empleado/politica/periodo"""
        # Buscar existente
        query = select(LeaveBalance).where(
            LeaveBalance.employee_id == employee_id,
            LeaveBalance.policy_id == policy_id,
            LeaveBalance.period_year == period_year
        )
        result = await self.db.execute(query)
        balance = result.scalar_one_or_none()

        if balance:
            return balance

        # Crear nuevo
        period_start = date(period_year, 1, 1)
        period_end = date(period_year, 12, 31)

        # Obtener empleado y politica para calcular
        emp_result = await self.db.execute(
            select(Employee).where(Employee.id == employee_id)
        )
        employee = emp_result.scalar_one_or_none()

        policy_result = await self.db.execute(
            select(LeavePolicy).where(LeavePolicy.id == policy_id)
        )
        policy = policy_result.scalar_one_or_none()

        if not employee or not policy:
            raise ValueError("Employee or Policy not found")

        # Calcular saldo inicial
        if policy.accrual_type == AccrualType.annual:
            _, _, initial = await self.calculate_vacation_days(employee, policy, period_year)
        elif policy.accrual_type == AccrualType.fixed:
            initial = policy.base_amount
        else:
            initial = Decimal("0")

        # Verificar arrastre del periodo anterior
        carryover = Decimal("0")
        if policy.allow_carryover:
            prev_balance = await self.db.execute(
                select(LeaveBalance).where(
                    LeaveBalance.employee_id == employee_id,
                    LeaveBalance.policy_id == policy_id,
                    LeaveBalance.period_year == period_year - 1
                )
            )
            prev = prev_balance.scalar_one_or_none()
            if prev and prev.current_balance > 0:
                carryover = prev.current_balance
                if policy.max_carryover and carryover > policy.max_carryover:
                    carryover = policy.max_carryover

        balance = LeaveBalance(
            employee_id=employee_id,
            policy_id=policy_id,
            period_year=period_year,
            period_start=period_start,
            period_end=period_end,
            initial_balance=initial,
            current_balance=initial + carryover,
            used_amount=Decimal("0"),
            pending_amount=Decimal("0"),
            carryover_amount=carryover
        )

        self.db.add(balance)
        await self.db.flush()

        # Crear transaccion de acreditacion inicial
        if initial > 0:
            await self.create_transaction(
                balance_id=balance.id,
                transaction_type=TransactionType.credit,
                amount=initial,
                description=f"Acreditacion inicial periodo {period_year}"
            )

        if carryover > 0:
            await self.create_transaction(
                balance_id=balance.id,
                transaction_type=TransactionType.credit,
                amount=carryover,
                description=f"Arrastre periodo {period_year - 1}"
            )

        return balance

    async def create_transaction(
        self,
        balance_id: UUID,
        transaction_type: TransactionType,
        amount: Decimal,
        description: str | None = None,
        schedule_exception_id: UUID | None = None,
        usage_start_date: date | None = None,
        usage_end_date: date | None = None,
        created_by: UUID | None = None
    ) -> LeaveTransaction:
        """Crea una transaccion y actualiza el saldo"""
        # Obtener balance actual
        result = await self.db.execute(
            select(LeaveBalance).where(LeaveBalance.id == balance_id)
        )
        balance = result.scalar_one_or_none()

        if not balance:
            raise ValueError("Balance not found")

        balance_before = balance.current_balance

        # Calcular nuevo saldo
        if transaction_type in [TransactionType.credit]:
            balance_after = balance_before + amount
            balance.current_balance = balance_after
        elif transaction_type in [TransactionType.debit, TransactionType.expiration]:
            balance_after = balance_before - amount
            balance.current_balance = balance_after
            balance.used_amount += amount
        elif transaction_type == TransactionType.adjustment:
            # Adjustment puede ser positivo o negativo
            balance_after = balance_before + amount  # amount puede ser negativo
            balance.current_balance = balance_after

        # Crear transaccion
        transaction = LeaveTransaction(
            balance_id=balance_id,
            transaction_type=transaction_type,
            amount=abs(amount),
            balance_before=balance_before,
            balance_after=balance_after,
            schedule_exception_id=schedule_exception_id,
            usage_start_date=usage_start_date,
            usage_end_date=usage_end_date,
            description=description,
            created_by=created_by
        )

        self.db.add(transaction)
        await self.db.flush()

        return transaction

    async def deduct_from_exception(
        self,
        schedule_exception: ScheduleException,
        created_by: UUID | None = None
    ) -> LeaveTransaction | None:
        """
        Descuenta saldo automaticamente cuando se aprueba una excepcion.

        Mapeo de tipos de excepcion a politicas:
        - vacation -> VACATION policy
        - sick_leave -> SICK_LEAVE policy
        - compensatory -> COMPENSATORY policy
        """
        if not schedule_exception.employee_id:
            return None  # Excepciones globales (feriados) no descuentan

        # Mapear tipo de excepcion a codigo de politica
        exception_to_policy = {
            ExceptionType.VACATION: "VACATION",
            ExceptionType.SICK_LEAVE: "SICK_LEAVE",
        }

        policy_code = exception_to_policy.get(schedule_exception.exception_type)
        if not policy_code:
            return None  # Este tipo no descuenta saldo

        # Buscar politica
        policy_result = await self.db.execute(
            select(LeavePolicy).where(LeavePolicy.code == policy_code)
        )
        policy = policy_result.scalar_one_or_none()

        if not policy:
            return None

        # Calcular dias a descontar
        days = (schedule_exception.end_date - schedule_exception.start_date).days + 1

        # Obtener o crear balance para el periodo
        period_year = schedule_exception.start_date.year
        balance = await self.get_or_create_balance(
            employee_id=schedule_exception.employee_id,
            policy_id=policy.id,
            period_year=period_year
        )

        # Crear transaccion de descuento
        transaction = await self.create_transaction(
            balance_id=balance.id,
            transaction_type=TransactionType.debit,
            amount=Decimal(str(days)),
            description=f"{schedule_exception.exception_type.value}: {schedule_exception.description or 'Sin descripcion'}",
            schedule_exception_id=schedule_exception.id,
            usage_start_date=schedule_exception.start_date,
            usage_end_date=schedule_exception.end_date,
            created_by=created_by
        )

        await self.db.commit()

        return transaction

    async def bulk_accrual(
        self,
        policy_id: UUID,
        period_year: int,
        employee_ids: list[UUID] | None = None
    ) -> int:
        """
        Acreditacion masiva de saldos para un periodo.

        Args:
            policy_id: ID de la politica
            period_year: Anio del periodo
            employee_ids: Lista de empleados (None = todos los activos)

        Returns:
            Cantidad de saldos creados/actualizados
        """
        # Obtener empleados
        if employee_ids:
            emp_query = select(Employee).where(
                Employee.id.in_(employee_ids),
                Employee.is_active == True
            )
        else:
            emp_query = select(Employee).where(Employee.is_active == True)

        result = await self.db.execute(emp_query)
        employees = result.scalars().all()

        count = 0
        for employee in employees:
            await self.get_or_create_balance(
                employee_id=employee.id,
                policy_id=policy_id,
                period_year=period_year
            )
            count += 1

        await self.db.commit()

        return count
