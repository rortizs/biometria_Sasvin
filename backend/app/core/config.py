from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_name: str = "Biometria API"
    debug: bool = False

    # Database
    database_url: str = (
        "postgresql+asyncpg://biometria:biometria_secret@localhost:5432/biometria_db"
    )

    # Redis (for rate limiting and caching)
    redis_url: str = "redis://localhost:6379/0"

    # Security
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # CORS
    cors_origins: str = "http://localhost:4200"

    # Face Recognition
    face_recognition_threshold: float = 0.6

    # Anti-Spoofing / Liveness Detection
    liveness_detection_enabled: bool = True
    liveness_threshold: float = 0.5  # Score 0-1, higher = more strict
    liveness_min_frames: int = 3  # Minimum frames required for liveness check
    liveness_max_frames: int = 5  # Maximum frames to process
    anti_spoofing_model_path: str = "models/anti_spoofing_model.onnx"  # ONNX model path

    # Image Quality Validation
    min_image_width: int = 640
    min_image_height: int = 480
    min_brightness: int = 40
    max_brightness: int = 220
    min_sharpness: float = 100.0  # Laplacian variance

    # Geolocation & Fraud Detection
    geo_validation_enabled: bool = True
    max_reasonable_speed_kmh: float = 80.0  # For impossible travel detection
    impossible_travel_window_minutes: int = 60  # Time window to check
    location_anomaly_lookback_days: int = 30  # Days to analyze patterns
    location_anomaly_z_score_threshold: float = 3.0  # Standard deviations

    # Rate Limiting
    rate_limit_enabled: bool = True
    rate_limit_times: int = 3  # Max attempts
    rate_limit_seconds: int = 60  # Per time window

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
