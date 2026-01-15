from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class SettingsBase(BaseModel):
    company_name: str
    company_address: str | None = None
    slogan: str | None = None
    email_domain: str
    logo_url: str | None = None


class SettingsCreate(SettingsBase):
    pass


class SettingsUpdate(BaseModel):
    company_name: str | None = None
    company_address: str | None = None
    slogan: str | None = None
    email_domain: str | None = None
    logo_url: str | None = None


class SettingsResponse(SettingsBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
