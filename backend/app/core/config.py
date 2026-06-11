from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache


LEGACY_ADMIN_FALLBACK_ALLOWED_ROLES = {"DECANO", "DUEÑO", "DIRECTOR", "ADMINISTRATIVO"}


class Settings(BaseSettings):
    # App
    app_name: str = "Biometria API"
    debug: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://biometria:biometria_secret@localhost:5432/biometria_db"

    # Security
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Bootstrap RBAC admin
    bootstrap_admin_email: str = "admin@sistemaslab.dev"
    bootstrap_admin_full_name: str = "System Administrator"
    bootstrap_admin_password: str = ""
    legacy_admin_fallback_role: str = "DECANO"

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

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
