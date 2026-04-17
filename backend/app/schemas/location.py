from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class LocationBase(BaseModel):
    name: str
    address: str | None = None
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    radius_meters: int = Field(default=50, ge=10, le=5000)

    @field_validator("radius_meters", mode="before")
    @classmethod
    def default_radius_if_none(cls, v: object) -> object:
        return 50 if v is None else v


class LocationCreate(LocationBase):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Campus Central UMG",
                "address": "6a Calle 22-38 Zona 10, Ciudad de Guatemala",
                "latitude": 14.6407,
                "longitude": -90.5133,
                "radius_meters": 100,
            }
        }
    )


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
