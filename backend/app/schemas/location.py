from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class LocationBase(BaseModel):
    name: str
    address: str | None = None
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    radius_meters: int = Field(default=50, ge=10, le=5000)


class LocationCreate(LocationBase):
    pass


class LocationUpdate(BaseModel):
    name: str | None = None
    address: str | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    radius_meters: int | None = Field(default=None, ge=10, le=5000)
    is_active: bool | None = None


class LocationResponse(LocationBase):
    id: UUID
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
