from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, field_validator, Field

from app.models.user import UserRole


class UserBase(BaseModel):
    email: EmailStr
    full_name: str | None = None
    role: UserRole = UserRole.admin


class UserCreate(UserBase):
    password: str

    @field_validator("email")
    @classmethod
    def validate_umg_email(cls, v: str) -> str:
        if not v.endswith("@miumg.edu.gt"):
            raise ValueError("Solo se aceptan correos institucionales @miumg.edu.gt")
        return v


class UserUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class UserPasswordChange(BaseModel):
    new_password: str = Field(..., min_length=8)


class UserResponse(UserBase):
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

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
