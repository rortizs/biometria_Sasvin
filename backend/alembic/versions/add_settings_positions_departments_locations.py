"""add_settings_positions_departments_locations

Revision ID: a1b2c3d4e5f6
Revises: 34e172e6e8db
Create Date: 2026-01-14 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '34e172e6e8db'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create new tables first (they need to exist before FK references)
    op.create_table('settings',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('company_name', sa.String(length=200), nullable=False),
        sa.Column('company_address', sa.Text(), nullable=True),
        sa.Column('slogan', sa.String(length=500), nullable=True),
        sa.Column('email_domain', sa.String(length=100), nullable=False),
        sa.Column('logo_url', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table('positions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )

    op.create_table('departments',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table('locations',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('radius_meters', sa.Integer(), nullable=False, server_default='50'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # 2. Add FK columns to employees (before dropping old string columns)
    op.add_column('employees', sa.Column('department_id', sa.UUID(), nullable=True))
    op.add_column('employees', sa.Column('position_id', sa.UUID(), nullable=True))
    op.add_column('employees', sa.Column('location_id', sa.UUID(), nullable=True))

    # 3. Create FK constraints
    op.create_foreign_key('fk_employees_department', 'employees', 'departments', ['department_id'], ['id'])
    op.create_foreign_key('fk_employees_position', 'employees', 'positions', ['position_id'], ['id'])
    op.create_foreign_key('fk_employees_location', 'employees', 'locations', ['location_id'], ['id'])

    # 4. Drop old string columns from employees
    op.drop_column('employees', 'department')
    op.drop_column('employees', 'position')

    # 5. Make email required (first update any NULL values to placeholder)
    op.execute("UPDATE employees SET email = 'placeholder@change.me' WHERE email IS NULL")
    op.alter_column('employees', 'email', nullable=False)

    # 6. Add geolocation columns to attendance_records
    op.add_column('attendance_records', sa.Column('check_in_latitude', sa.Float(), nullable=True))
    op.add_column('attendance_records', sa.Column('check_in_longitude', sa.Float(), nullable=True))
    op.add_column('attendance_records', sa.Column('check_in_distance_meters', sa.Float(), nullable=True))
    op.add_column('attendance_records', sa.Column('check_out_latitude', sa.Float(), nullable=True))
    op.add_column('attendance_records', sa.Column('check_out_longitude', sa.Float(), nullable=True))
    op.add_column('attendance_records', sa.Column('check_out_distance_meters', sa.Float(), nullable=True))
    op.add_column('attendance_records', sa.Column('geo_validated', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    # Remove geo columns from attendance_records
    op.drop_column('attendance_records', 'geo_validated')
    op.drop_column('attendance_records', 'check_out_distance_meters')
    op.drop_column('attendance_records', 'check_out_longitude')
    op.drop_column('attendance_records', 'check_out_latitude')
    op.drop_column('attendance_records', 'check_in_distance_meters')
    op.drop_column('attendance_records', 'check_in_longitude')
    op.drop_column('attendance_records', 'check_in_latitude')

    # Make email nullable again
    op.alter_column('employees', 'email', nullable=True)

    # Re-add old string columns to employees
    op.add_column('employees', sa.Column('position', sa.String(length=100), nullable=True))
    op.add_column('employees', sa.Column('department', sa.String(length=100), nullable=True))

    # Drop FK constraints
    op.drop_constraint('fk_employees_location', 'employees', type_='foreignkey')
    op.drop_constraint('fk_employees_position', 'employees', type_='foreignkey')
    op.drop_constraint('fk_employees_department', 'employees', type_='foreignkey')

    # Drop FK columns from employees
    op.drop_column('employees', 'location_id')
    op.drop_column('employees', 'position_id')
    op.drop_column('employees', 'department_id')

    # Drop new tables
    op.drop_table('locations')
    op.drop_table('departments')
    op.drop_table('positions')
    op.drop_table('settings')
