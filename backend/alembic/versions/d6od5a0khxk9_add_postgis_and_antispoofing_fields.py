"""Add PostGIS geography columns and anti-spoofing fields

Revision ID: d6od5a0khxk9
Revises: b2c3d4e5f6g7
Create Date: 2026-02-06 10:30:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from geoalchemy2 import Geography

# revision identifiers, used by Alembic.
revision = "d6od5a0khxk9"
down_revision = "b2c3d4e5f6g7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ===================================================================
    # PART 1: Add PostGIS GEOGRAPHY columns to locations table
    # ===================================================================

    # Add location_point column (GEOGRAPHY type with SRID 4326 = WGS84)
    op.execute("""
        ALTER TABLE locations 
        ADD COLUMN location_point GEOGRAPHY(POINT, 4326);
    """)

    # Migrate existing lat/lon data to location_point
    op.execute("""
        UPDATE locations 
        SET location_point = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
    """)

    # Make location_point NOT NULL (after data migration)
    op.execute("""
        ALTER TABLE locations 
        ALTER COLUMN location_point SET NOT NULL;
    """)

    # Create spatial index (GIST) for fast geospatial queries
    op.execute("""
        CREATE INDEX idx_locations_point 
        ON locations USING GIST(location_point);
    """)

    # ===================================================================
    # PART 2: Add PostGIS GEOGRAPHY columns to attendance_records table
    # ===================================================================

    # Add check_in_point and check_out_point columns
    op.execute("""
        ALTER TABLE attendance_records
        ADD COLUMN check_in_point GEOGRAPHY(POINT, 4326),
        ADD COLUMN check_out_point GEOGRAPHY(POINT, 4326);
    """)

    # Migrate existing check-in lat/lon data to check_in_point
    op.execute("""
        UPDATE attendance_records
        SET check_in_point = ST_SetSRID(ST_MakePoint(check_in_longitude, check_in_latitude), 4326)::geography
        WHERE check_in_latitude IS NOT NULL AND check_in_longitude IS NOT NULL;
    """)

    # Migrate existing check-out lat/lon data to check_out_point
    op.execute("""
        UPDATE attendance_records
        SET check_out_point = ST_SetSRID(ST_MakePoint(check_out_longitude, check_out_latitude), 4326)::geography
        WHERE check_out_latitude IS NOT NULL AND check_out_longitude IS NOT NULL;
    """)

    # Create spatial indexes for analytics
    op.execute("""
        CREATE INDEX idx_attendance_checkin_point 
        ON attendance_records USING GIST(check_in_point);
    """)

    op.execute("""
        CREATE INDEX idx_attendance_checkout_point 
        ON attendance_records USING GIST(check_out_point);
    """)

    # ===================================================================
    # PART 3: Add anti-spoofing fields to attendance_records table
    # ===================================================================

    # Add liveness detection scores (0-1, higher = more confident it's real person)
    op.add_column(
        "attendance_records",
        sa.Column("check_in_liveness_score", sa.Float(), nullable=True),
    )
    op.add_column(
        "attendance_records",
        sa.Column("check_out_liveness_score", sa.Float(), nullable=True),
    )

    # Add device fingerprinting for fraud detection
    op.add_column(
        "attendance_records",
        sa.Column("check_in_device_fingerprint", sa.String(32), nullable=True),
    )
    op.add_column(
        "attendance_records",
        sa.Column("check_out_device_fingerprint", sa.String(32), nullable=True),
    )

    # Add indexes for device fingerprint queries (detect suspicious patterns)
    op.create_index(
        "idx_attendance_checkin_device",
        "attendance_records",
        ["check_in_device_fingerprint"],
        unique=False,
    )
    op.create_index(
        "idx_attendance_checkout_device",
        "attendance_records",
        ["check_out_device_fingerprint"],
        unique=False,
    )

    # Add index for record_date + employee_id (used in fraud detection queries)
    op.create_index(
        "idx_attendance_date_employee",
        "attendance_records",
        ["record_date", "employee_id"],
        unique=False,
    )


def downgrade() -> None:
    # ===================================================================
    # Rollback anti-spoofing fields
    # ===================================================================
    op.drop_index("idx_attendance_date_employee", table_name="attendance_records")
    op.drop_index("idx_attendance_checkout_device", table_name="attendance_records")
    op.drop_index("idx_attendance_checkin_device", table_name="attendance_records")

    op.drop_column("attendance_records", "check_out_device_fingerprint")
    op.drop_column("attendance_records", "check_in_device_fingerprint")
    op.drop_column("attendance_records", "check_out_liveness_score")
    op.drop_column("attendance_records", "check_in_liveness_score")

    # ===================================================================
    # Rollback PostGIS columns from attendance_records
    # ===================================================================
    op.execute("DROP INDEX IF EXISTS idx_attendance_checkout_point;")
    op.execute("DROP INDEX IF EXISTS idx_attendance_checkin_point;")

    op.drop_column("attendance_records", "check_out_point")
    op.drop_column("attendance_records", "check_in_point")

    # ===================================================================
    # Rollback PostGIS columns from locations
    # ===================================================================
    op.execute("DROP INDEX IF EXISTS idx_locations_point;")
    op.drop_column("locations", "location_point")
