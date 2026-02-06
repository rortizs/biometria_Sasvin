import uuid
from datetime import datetime, date

from sqlalchemy import (
    String,
    DateTime,
    Date,
    Float,
    Text,
    ForeignKey,
    UniqueConstraint,
    Boolean,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from geoalchemy2 import Geography

from app.db.base import Base


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    employee_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
    )
    record_date: Mapped[date] = mapped_column(Date, nullable=False)
    check_in: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    check_out: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    check_in_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    check_out_photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    check_in_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_out_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="present")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # PostGIS GEOGRAPHY fields (check-in)
    check_in_point = mapped_column(Geography("POINT", srid=4326), nullable=True)

    # PostGIS GEOGRAPHY fields (check-out)
    check_out_point = mapped_column(Geography("POINT", srid=4326), nullable=True)

    # Legacy geolocation fields (maintained for backward compatibility)
    check_in_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_in_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_in_distance_meters: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_out_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_out_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_out_distance_meters: Mapped[float | None] = mapped_column(
        Float, nullable=True
    )

    # Geo validation flag
    geo_validated: Mapped[bool] = mapped_column(Boolean, default=False)

    # Anti-Spoofing: Liveness Detection Scores (0-1, higher = more confident it's a real person)
    check_in_liveness_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    check_out_liveness_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Anti-Spoofing: Device Fingerprinting (SHA256 hash of User-Agent + IP)
    # Used for detecting suspicious patterns (multiple devices, impossible travel, etc.)
    check_in_device_fingerprint: Mapped[str | None] = mapped_column(
        String(32), nullable=True
    )
    check_out_device_fingerprint: Mapped[str | None] = mapped_column(
        String(32), nullable=True
    )

    # Relationships
    employee: Mapped["Employee"] = relationship(
        "Employee", back_populates="attendance_records"
    )

    __table_args__ = (
        UniqueConstraint("employee_id", "record_date", name="uq_employee_date"),
    )
