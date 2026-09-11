from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class PositionBase(BaseModel):
    name: str
    description: str | None = None


class PositionCreate(PositionBase):
    pass


class PositionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class PositionResponse(PositionBase):
    id: UUID
    is_active: bool
    created_at: datetime
    # Design D6 / task 3.4: `positions.canonical_role` (e.g. "CATEDRATICO")
    # -- exposed so the frontend can mirror the backend's
    # `require_teacher_position` restriction (task 3.9's
    # `_require_teacher_target_position` in `employees.py`) by filtering
    # the create/edit position dropdown before submit (task 4.7).
    canonical_role: str | None = None

    class Config:
        from_attributes = True
