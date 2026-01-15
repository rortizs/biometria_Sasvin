from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class DepartmentBase(BaseModel):
    name: str
    description: str | None = None


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class DepartmentResponse(DepartmentBase):
    id: UUID
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
