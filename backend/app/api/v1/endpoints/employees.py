from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db, get_current_active_admin
from app.models.employee import Employee
from app.models.user import User
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeResponse

router = APIRouter()


@router.get(
    "/",
    response_model=list[EmployeeResponse],
    tags=["employees"],
    responses={
        401: {"description": "Token inválido o expirado — se requiere rol admin"},
    },
)
async def list_employees(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    active_only: bool = True,
) -> list[EmployeeResponse]:
    """
    Listar empleados/catedráticos registrados en el sistema. Requiere rol admin.

    **Paginación:** usar `skip` y `limit` (máx. 1000 por request).
    Los resultados se ordenan alfabéticamente por apellido y nombre.

    **Filtro `active_only`:** por defecto `true` — solo devuelve empleados activos.
    Pasar `active_only=false` para incluir empleados dados de baja.

    El campo `has_face_registered` indica si el empleado ya tiene embeddings
    faciales registrados y puede hacer check-in biométrico.
    """
    query = select(Employee).options(selectinload(Employee.face_embeddings))

    if active_only:
        query = query.where(Employee.is_active == True)

    query = query.offset(skip).limit(limit).order_by(Employee.last_name, Employee.first_name)

    result = await db.execute(query)
    employees = result.scalars().all()

    response = []
    for emp in employees:
        emp_dict = {
            "id": emp.id,
            "employee_code": emp.employee_code,
            "first_name": emp.first_name,
            "last_name": emp.last_name,
            "email": emp.email,
            "phone": emp.phone,
            "hire_date": emp.hire_date,
            "is_active": emp.is_active,
            "created_at": emp.created_at,
            "has_face_registered": len(emp.face_embeddings) > 0,
            "department_id": emp.department_id,
            "position_id": emp.position_id,
            "location_id": emp.location_id,
        }
        response.append(EmployeeResponse(**emp_dict))

    return response


@router.get(
    "/{employee_id}",
    response_model=EmployeeResponse,
    tags=["employees"],
    responses={
        401: {"description": "Token inválido o expirado — se requiere rol admin"},
        404: {"description": "Empleado no encontrado"},
    },
)
async def get_employee(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    employee_id: UUID,
) -> EmployeeResponse:
    """
    Obtener los datos de un empleado por su UUID. Requiere rol admin.

    Incluye el estado de registro facial (`has_face_registered`) y las referencias
    a departamento, puesto y sede asignados.
    """
    query = (
        select(Employee)
        .options(selectinload(Employee.face_embeddings))
        .where(Employee.id == employee_id)
    )
    result = await db.execute(query)
    employee = result.scalar_one_or_none()

    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )

    return EmployeeResponse(
        id=employee.id,
        employee_code=employee.employee_code,
        first_name=employee.first_name,
        last_name=employee.last_name,
        email=employee.email,
        phone=employee.phone,
        hire_date=employee.hire_date,
        is_active=employee.is_active,
        created_at=employee.created_at,
        has_face_registered=len(employee.face_embeddings) > 0,
        department_id=employee.department_id,
        position_id=employee.position_id,
        location_id=employee.location_id,
    )


@router.post(
    "/",
    response_model=EmployeeResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["employees"],
    responses={
        400: {"description": "El `employee_code` ya existe — debe ser único en el sistema"},
        401: {"description": "Token inválido o expirado — se requiere rol admin"},
    },
)
async def create_employee(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    employee_in: EmployeeCreate,
) -> EmployeeResponse:
    """
    Crear un nuevo empleado/catedrático. Requiere rol admin.

    El `employee_code` debe ser único (p.ej. `EMP-001`, número de carné, código institucional).
    El email también es requerido y se usa solo para identificación interna — no se envían correos.

    Después de crear el empleado, registrar sus fotos con `POST /faces/register`
    para que pueda hacer check-in biométrico. Hasta entonces, `has_face_registered` es `false`.
    """
    # Check if employee code already exists
    result = await db.execute(
        select(Employee).where(Employee.employee_code == employee_in.employee_code)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Employee code already exists",
        )

    employee = Employee(**employee_in.model_dump())
    db.add(employee)
    await db.commit()
    await db.refresh(employee)

    return EmployeeResponse(
        id=employee.id,
        employee_code=employee.employee_code,
        first_name=employee.first_name,
        last_name=employee.last_name,
        email=employee.email,
        phone=employee.phone,
        hire_date=employee.hire_date,
        is_active=employee.is_active,
        created_at=employee.created_at,
        has_face_registered=False,
        department_id=employee.department_id,
        position_id=employee.position_id,
        location_id=employee.location_id,
    )


@router.patch(
    "/{employee_id}",
    response_model=EmployeeResponse,
    tags=["employees"],
    responses={
        401: {"description": "Token inválido o expirado — se requiere rol admin"},
        404: {"description": "Empleado no encontrado"},
    },
)
async def update_employee(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    employee_id: UUID,
    employee_in: EmployeeUpdate,
) -> EmployeeResponse:
    """
    Actualizar parcialmente los datos de un empleado. Requiere rol admin.

    Solo se actualizan los campos incluidos en el body (PATCH semántico).
    Para dar de baja a un empleado sin eliminarlo, usar `is_active: false`.

    No modifica los embeddings faciales — para eso usar `DELETE /faces/{id}`
    seguido de `POST /faces/register`.
    """
    query = (
        select(Employee)
        .options(selectinload(Employee.face_embeddings))
        .where(Employee.id == employee_id)
    )
    result = await db.execute(query)
    employee = result.scalar_one_or_none()

    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )

    update_data = employee_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(employee, field, value)

    await db.commit()
    await db.refresh(employee)

    return EmployeeResponse(
        id=employee.id,
        employee_code=employee.employee_code,
        first_name=employee.first_name,
        last_name=employee.last_name,
        email=employee.email,
        phone=employee.phone,
        hire_date=employee.hire_date,
        is_active=employee.is_active,
        created_at=employee.created_at,
        has_face_registered=len(employee.face_embeddings) > 0,
        department_id=employee.department_id,
        position_id=employee.position_id,
        location_id=employee.location_id,
    )


@router.delete(
    "/{employee_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["employees"],
    responses={
        401: {"description": "Token inválido o expirado — se requiere rol admin"},
        404: {"description": "Empleado no encontrado"},
    },
)
async def delete_employee(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_active_admin)],
    employee_id: UUID,
) -> None:
    """
    Eliminar permanentemente un empleado y todos sus datos. Requiere rol admin.

    **ADVERTENCIA — efecto CASCADE:** elimina también todos los registros asociados:
    embeddings faciales, registros de asistencia e historial de sesiones biométricas.
    Esta acción es irreversible.

    Para desactivar sin perder historial, preferir `PATCH /{id}` con `is_active: false`.
    """
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    employee = result.scalar_one_or_none()

    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found",
        )

    await db.delete(employee)
    await db.commit()
