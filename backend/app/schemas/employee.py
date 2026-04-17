from datetime import datetime, date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr

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
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "employee_code": "EMP-001",
                "first_name": "María",
                "last_name": "López",
                "email": "mlopez@sistemaslab.dev",
                "phone": "+502 5555-0001",
                "hire_date": "2024-01-15",
                "department_id": "550e8400-e29b-41d4-a716-446655440000",
                "position_id": "550e8400-e29b-41d4-a716-446655440001",
                "location_id": "550e8400-e29b-41d4-a716-446655440002",
            }
        }
    )

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
