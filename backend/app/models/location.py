import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, Text, DateTime, Integer, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geography

from app.db.base import Base


class Location(Base):
    """Sedes/Ubicaciones de trabajo con coordenadas GPS."""

    __tablename__ = "locations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)

    # PostGIS GEOGRAPHY type (WGS84 SRID 4326)
    # Primary geospatial field for efficient spatial queries
    location_point = mapped_column(Geography("POINT", srid=4326), nullable=False)

    # Legacy fields (maintained for backward compatibility)
    # TODO: Consider deprecating after full migration to PostGIS
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)

    radius_meters: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    employees: Mapped[list["Employee"]] = relationship(
        "Employee", back_populates="location_rel"
    )
