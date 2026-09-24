from functools import lru_cache

from pydantic_settings import BaseSettings  # pyright: ignore[reportMissingImports]
from pydantic import Field, field_validator


# Design.md D9: DIRECTOR is read-only (never an approver) and ADMINISTRATIVO
# is deprecated/non-assignable, so neither is a valid landing role for a
# legacy admin fallback anymore. Only the two read-only business top roles
# remain eligible.
LEGACY_ADMIN_FALLBACK_ALLOWED_ROLES = {"DECANO", "DUEÑO"}


class Settings(BaseSettings):
    # App
    app_name: str = "Biometria API"
    debug: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://biometria:biometria_secret@localhost:5432/biometria_db"

    # Security
    secret_key: str = Field(default="", validate_default=True)
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Bootstrap RBAC admin
    bootstrap_admin_email: str = "admin@sistemaslab.dev"
    bootstrap_admin_full_name: str = "System Administrator"
    bootstrap_admin_password: str = ""
    legacy_admin_fallback_role: str = "DECANO"

    @field_validator("secret_key")
    @classmethod
    def validate_secret_key(cls, value: str) -> str:
        normalized = value.strip()
        if (
            not normalized
            or normalized == "your-secret-key-change-in-production"
            or len(normalized) < 32
        ):
            raise ValueError("SECRET_KEY must be set to a non-default value with at least 32 characters")
        return normalized

    @field_validator("legacy_admin_fallback_role")
    @classmethod
    def validate_legacy_admin_fallback_role(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in LEGACY_ADMIN_FALLBACK_ALLOWED_ROLES:
            raise ValueError("LEGACY_ADMIN_FALLBACK_ROLE must be a non-system business role")
        return normalized

    # CORS
    cors_origins: str = "http://localhost:4200"

    # Face Recognition
    face_recognition_threshold: float = 0.6

    # Email notifications (Resend). notification_service._send_email_notification
    # no-ops when resend_api_key is empty -- set all three via env vars to
    # enable email delivery.
    resend_api_key: str = ""
    email_from_name: str = "Sistema Biométrico UMG"
    email_from: str = "notificaciones@sistemaslab.dev"

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
