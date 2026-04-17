from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, field_validator


class UserBase(BaseModel):
    email: EmailStr
    full_name: str | None = None
    role: str = "admin"


class UserCreate(UserBase):
    password: str

    @field_validator("email")
    @classmethod
    def validate_umg_email(cls, v: str) -> str:
        if not v.endswith("@miumg.edu.gt"):
            raise ValueError("Solo se aceptan correos institucionales @miumg.edu.gt")
        return v


class UserResponse(UserBase):
    id: UUID
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str
    type: str
    exp: datetime
