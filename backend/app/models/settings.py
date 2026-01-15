import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Settings(Base):
    """Configuración global de la institución (singleton)."""
    __tablename__ = "settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_name: Mapped[str] = mapped_column(String(200), nullable=False)
    company_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    slogan: Mapped[str | None] = mapped_column(String(500), nullable=True)
    email_domain: Mapped[str] = mapped_column(
        String(100), nullable=False
    )  # ej: "miumg.edu.gt"
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
