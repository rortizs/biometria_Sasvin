from datetime import datetime, date
from uuid import UUID

from pydantic import BaseModel, EmailStr

from app.schemas.position import PositionResponse
from app.schemas.department import DepartmentResponse
from app.schemas.location import LocationResponse


class EmployeeBase(BaseModel):
    employee_code: str
    first_name: str
    last_name: str
    email: EmailStr  # NOW REQUIRED
    phone: str | None = None
    hire_date: date | None = None


class EmployeeCreate(EmployeeBase):
    department_id: UUID | None = None
    position_id: UUID | None = None
    location_id: UUID | None = None


class EmployeeUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    hire_date: date | None = None
    is_active: bool | None = None
    department_id: UUID | None = None
    position_id: UUID | None = None
    location_id: UUID | None = None


class EmployeeResponse(EmployeeBase):
    id: UUID
    is_active: bool
    created_at: datetime
    has_face_registered: bool = False
    department_id: UUID | None = None
    position_id: UUID | None = None
    location_id: UUID | None = None

    class Config:
        from_attributes = True


class EmployeeDetailResponse(EmployeeResponse):
    """Response with nested relationships."""
    department: DepartmentResponse | None = None
    position: PositionResponse | None = None
    location: LocationResponse | None = None

    class Config:
        from_attributes = True
