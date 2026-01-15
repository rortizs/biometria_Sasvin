"""
Leave Balances API Endpoints - Saldos Laborales
"""
from datetime import date
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_current_active_admin
from app.models.user import User
from app.models.employee import Employee
from app.models.leave_balance import LeavePolicy, LeaveBalance, LeaveTransaction
from app.schemas.leave_balance import (
    LeavePolicyCreate, LeavePolicyUpdate, LeavePolicyResponse,
    LeaveBalanceCreate, LeaveBalanceUpdate, LeaveBalanceResponse,
    LeaveTransactionCreate, LeaveTransactionResponse,
    EmployeeBalanceSummary, EmployeeBalanceDetail,
    BulkAccrualCreate, BalanceCalculationRequest, BalanceCalculationResponse,
    LeaveUnitEnum
)
from app.services.leave_service import LeaveService

router = APIRouter()


# ============ Leave Policies ============

@router.get("/policies", response_model=list[LeavePolicyResponse])
async def list_policies(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    active_only: bool = True,
) -> list[LeavePolicyResponse]:
    """Lista todas las politicas de saldo"""
    query = select(LeavePolicy)
    if active_only:
        query = query.where(LeavePolicy.is_active == True)
    query = query.order_by(LeavePolicy.name)

    result = await db.execute(query)
    policies = result.scalars().all()

    return [LeavePolicyResponse.model_validate(p) for p in policies]


@router.post("/policies", response_model=LeavePolicyResponse, status_code=status.HTTP_201_CREATED)
async def create_policy(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    policy_in: LeavePolicyCreate,
) -> LeavePolicyResponse:
    """Crea una nueva politica de saldo"""
    # Verificar codigo unico
    result = await db.execute(
        select(LeavePolicy).where(LeavePolicy.code == policy_in.code)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Policy code already exists"
        )

    policy = LeavePolicy(**policy_in.model_dump())
    db.add(policy)
    await db.commit()
    await db.refresh(policy)

    return LeavePolicyResponse.model_validate(policy)


@router.get("/policies/{policy_id}", response_model=LeavePolicyResponse)
async def get_policy(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    policy_id: UUID,
) -> LeavePolicyResponse:
    """Obtiene una politica por ID"""
    result = await db.execute(
        select(LeavePolicy).where(LeavePolicy.id == policy_id)
    )
    policy = result.scalar_one_or_none()

    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Policy not found"
        )

    return LeavePolicyResponse.model_validate(policy)


@router.patch("/policies/{policy_id}", response_model=LeavePolicyResponse)
async def update_policy(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    policy_id: UUID,
    policy_in: LeavePolicyUpdate,
) -> LeavePolicyResponse:
    """Actualiza una politica"""
    result = await db.execute(
        select(LeavePolicy).where(LeavePolicy.id == policy_id)
    )
    policy = result.scalar_one_or_none()

    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Policy not found"
        )

    update_data = policy_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(policy, field, value)

    await db.commit()
    await db.refresh(policy)

    return LeavePolicyResponse.model_validate(policy)


@router.delete("/policies/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_policy(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    policy_id: UUID,
) -> None:
    """Elimina una politica"""
    result = await db.execute(
        select(LeavePolicy).where(LeavePolicy.id == policy_id)
    )
    policy = result.scalar_one_or_none()

    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Policy not found"
        )

    await db.delete(policy)
    await db.commit()


# ============ Leave Balances ============

@router.get("/", response_model=list[EmployeeBalanceSummary])
async def list_balances(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    search: str | None = None,
    policy_id: UUID | None = None,
    department_id: UUID | None = None,
    employee_id: UUID | None = None,
    period_year: int | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> list[EmployeeBalanceSummary]:
    """
    Lista saldos agrupados por empleado.
    Vista principal del modulo de saldos.
    """
    # Si no se especifica periodo, usar el actual
    if not period_year:
        period_year = date.today().year

    # Query base de empleados
    emp_query = select(Employee).where(Employee.is_active == True)

    if search:
        search_filter = f"%{search}%"
        emp_query = emp_query.where(
            (Employee.first_name.ilike(search_filter)) |
            (Employee.last_name.ilike(search_filter)) |
            (Employee.employee_code.ilike(search_filter))
        )

    if department_id:
        emp_query = emp_query.where(Employee.department_id == department_id)

    if employee_id:
        emp_query = emp_query.where(Employee.id == employee_id)

    emp_query = emp_query.order_by(Employee.last_name, Employee.first_name)
    emp_query = emp_query.offset(skip).limit(limit)

    result = await db.execute(emp_query)
    employees = result.scalars().all()

    summaries = []
    for emp in employees:
        # Obtener saldos del empleado para el periodo
        bal_query = (
            select(LeaveBalance)
            .options(selectinload(LeaveBalance.policy))
            .where(
                LeaveBalance.employee_id == emp.id,
                LeaveBalance.period_year == period_year
            )
        )

        if policy_id:
            bal_query = bal_query.where(LeaveBalance.policy_id == policy_id)

        bal_result = await db.execute(bal_query)
        balances = bal_result.scalars().all()

        # Obtener nombre del departamento
        dept_name = None
        if emp.department_id:
            from app.models.department import Department
            dept_result = await db.execute(
                select(Department.name).where(Department.id == emp.department_id)
            )
            dept_name = dept_result.scalar_one_or_none()

        balance_responses = []
        for bal in balances:
            balance_responses.append(LeaveBalanceResponse(
                id=bal.id,
                employee_id=bal.employee_id,
                policy_id=bal.policy_id,
                period_year=bal.period_year,
                period_start=bal.period_start,
                period_end=bal.period_end,
                initial_balance=bal.initial_balance,
                current_balance=bal.current_balance,
                used_amount=bal.used_amount,
                pending_amount=bal.pending_amount,
                carryover_amount=bal.carryover_amount,
                available_balance=bal.available_balance,
                created_at=bal.created_at,
                updated_at=bal.updated_at,
                policy_name=bal.policy.name if bal.policy else None,
                policy_code=bal.policy.code if bal.policy else None,
                policy_unit=LeaveUnitEnum(bal.policy.unit.value) if bal.policy else None,
                policy_color=bal.policy.color if bal.policy else None,
            ))

        summaries.append(EmployeeBalanceSummary(
            employee_id=emp.id,
            employee_code=emp.employee_code,
            first_name=emp.first_name,
            last_name=emp.last_name,
            department_name=dept_name,
            balances=balance_responses
        ))

    return summaries


@router.get("/employee/{employee_id}/detail", response_model=EmployeeBalanceDetail)
async def get_employee_balance_detail(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    employee_id: UUID,
    policy_id: UUID,
    period_year: int | None = None,
) -> EmployeeBalanceDetail:
    """
    Obtiene detalle de un saldo con historial de transacciones.
    Vista expandida de la tabla.
    """
    if not period_year:
        period_year = date.today().year

    # Obtener empleado
    emp_result = await db.execute(
        select(Employee).where(Employee.id == employee_id)
    )
    employee = emp_result.scalar_one_or_none()

    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )

    # Obtener saldo
    bal_result = await db.execute(
        select(LeaveBalance)
        .options(
            selectinload(LeaveBalance.policy),
            selectinload(LeaveBalance.transactions)
        )
        .where(
            LeaveBalance.employee_id == employee_id,
            LeaveBalance.policy_id == policy_id,
            LeaveBalance.period_year == period_year
        )
    )
    balance = bal_result.scalar_one_or_none()

    if not balance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Balance not found for this employee/policy/period"
        )

    # Obtener nombre del departamento
    dept_name = None
    if employee.department_id:
        from app.models.department import Department
        dept_result = await db.execute(
            select(Department.name).where(Department.id == employee.department_id)
        )
        dept_name = dept_result.scalar_one_or_none()

    # Calcular antiguedad
    service = LeaveService(db)
    years_of_service = await service.calculate_years_of_service(employee)

    # Construir respuesta
    balance_response = LeaveBalanceResponse(
        id=balance.id,
        employee_id=balance.employee_id,
        policy_id=balance.policy_id,
        period_year=balance.period_year,
        period_start=balance.period_start,
        period_end=balance.period_end,
        initial_balance=balance.initial_balance,
        current_balance=balance.current_balance,
        used_amount=balance.used_amount,
        pending_amount=balance.pending_amount,
        carryover_amount=balance.carryover_amount,
        available_balance=balance.available_balance,
        created_at=balance.created_at,
        updated_at=balance.updated_at,
        policy_name=balance.policy.name if balance.policy else None,
        policy_code=balance.policy.code if balance.policy else None,
        policy_unit=LeaveUnitEnum(balance.policy.unit.value) if balance.policy else None,
        policy_color=balance.policy.color if balance.policy else None,
    )

    transactions = [
        LeaveTransactionResponse.model_validate(t)
        for t in sorted(balance.transactions, key=lambda x: x.created_at, reverse=True)
    ]

    return EmployeeBalanceDetail(
        employee_id=employee.id,
        employee_code=employee.employee_code,
        first_name=employee.first_name,
        last_name=employee.last_name,
        department_name=dept_name,
        hire_date=employee.hire_date,
        years_of_service=years_of_service,
        balance=balance_response,
        transactions=transactions
    )


@router.post("/", response_model=LeaveBalanceResponse, status_code=status.HTTP_201_CREATED)
async def create_balance(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    balance_in: LeaveBalanceCreate,
) -> LeaveBalanceResponse:
    """Crea un saldo manualmente"""
    service = LeaveService(db)
    balance = await service.get_or_create_balance(
        employee_id=balance_in.employee_id,
        policy_id=balance_in.policy_id,
        period_year=balance_in.period_year
    )

    # Actualizar valores si se especifican
    if balance_in.initial_balance:
        balance.initial_balance = balance_in.initial_balance
        balance.current_balance = balance_in.initial_balance + balance_in.carryover_amount
    if balance_in.carryover_amount:
        balance.carryover_amount = balance_in.carryover_amount

    await db.commit()
    await db.refresh(balance)

    # Cargar relacion de policy
    pol_result = await db.execute(
        select(LeavePolicy).where(LeavePolicy.id == balance.policy_id)
    )
    policy = pol_result.scalar_one_or_none()

    return LeaveBalanceResponse(
        id=balance.id,
        employee_id=balance.employee_id,
        policy_id=balance.policy_id,
        period_year=balance.period_year,
        period_start=balance.period_start,
        period_end=balance.period_end,
        initial_balance=balance.initial_balance,
        current_balance=balance.current_balance,
        used_amount=balance.used_amount,
        pending_amount=balance.pending_amount,
        carryover_amount=balance.carryover_amount,
        available_balance=balance.available_balance,
        created_at=balance.created_at,
        updated_at=balance.updated_at,
        policy_name=policy.name if policy else None,
        policy_code=policy.code if policy else None,
        policy_unit=LeaveUnitEnum(policy.unit.value) if policy else None,
        policy_color=policy.color if policy else None,
    )


@router.post("/bulk-accrual", response_model=dict)
async def bulk_accrual(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    accrual_in: BulkAccrualCreate,
) -> dict:
    """Acreditacion masiva de saldos para todos los empleados activos"""
    service = LeaveService(db)
    count = await service.bulk_accrual(
        policy_id=accrual_in.policy_id,
        period_year=accrual_in.period_year,
        employee_ids=accrual_in.employee_ids
    )

    return {
        "message": f"Balances created/updated for {count} employees",
        "count": count,
        "policy_id": str(accrual_in.policy_id),
        "period_year": accrual_in.period_year
    }


@router.post("/calculate", response_model=BalanceCalculationResponse)
async def calculate_balance(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    calc_in: BalanceCalculationRequest,
) -> BalanceCalculationResponse:
    """Calcula el saldo que le corresponde a un empleado segun su antiguedad"""
    # Obtener empleado
    emp_result = await db.execute(
        select(Employee).where(Employee.id == calc_in.employee_id)
    )
    employee = emp_result.scalar_one_or_none()

    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )

    # Obtener politica
    pol_result = await db.execute(
        select(LeavePolicy).where(LeavePolicy.id == calc_in.policy_id)
    )
    policy = pol_result.scalar_one_or_none()

    if not policy:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Policy not found"
        )

    service = LeaveService(db)
    years_of_service = await service.calculate_years_of_service(
        employee,
        date(calc_in.period_year, 1, 1)
    )
    base, increment, total = await service.calculate_vacation_days(
        employee, policy, calc_in.period_year
    )

    return BalanceCalculationResponse(
        employee_id=employee.id,
        policy_id=policy.id,
        period_year=calc_in.period_year,
        years_of_service=years_of_service,
        calculated_amount=total,
        base_amount=base,
        increment_amount=increment
    )


# ============ Transactions ============

@router.post("/transactions", response_model=LeaveTransactionResponse, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    trans_in: LeaveTransactionCreate,
) -> LeaveTransactionResponse:
    """Crea una transaccion manual (ajuste, correccion, etc)"""
    from app.models.leave_balance import TransactionType

    service = LeaveService(db)
    transaction = await service.create_transaction(
        balance_id=trans_in.balance_id,
        transaction_type=TransactionType(trans_in.transaction_type.value),
        amount=trans_in.amount,
        description=trans_in.description,
        schedule_exception_id=trans_in.schedule_exception_id,
        usage_start_date=trans_in.usage_start_date,
        usage_end_date=trans_in.usage_end_date,
        created_by=current_user.id
    )

    await db.commit()
    await db.refresh(transaction)

    return LeaveTransactionResponse.model_validate(transaction)


@router.get("/transactions/{balance_id}", response_model=list[LeaveTransactionResponse])
async def list_transactions(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    balance_id: UUID,
) -> list[LeaveTransactionResponse]:
    """Lista transacciones de un saldo"""
    result = await db.execute(
        select(LeaveTransaction)
        .where(LeaveTransaction.balance_id == balance_id)
        .order_by(LeaveTransaction.created_at.desc())
    )
    transactions = result.scalars().all()

    return [LeaveTransactionResponse.model_validate(t) for t in transactions]
