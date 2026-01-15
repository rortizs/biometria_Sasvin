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

    class Config:
        from_attributes = True
