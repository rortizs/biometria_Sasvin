"""Add schedule assignments and exceptions tables

Revision ID: add_schedule_assignments
Revises: add_settings_positions_departments_locations
Create Date: 2024-01-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'add_schedule_assignments'
down_revision = 'add_settings_positions_departments_locations'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new columns to schedules table
    op.add_column('schedules', sa.Column('description', sa.String(255), nullable=True))
    op.add_column('schedules', sa.Column('color', sa.String(7), server_default='#f97316', nullable=False))

    # Create exception type enum
    exception_type_enum = postgresql.ENUM(
        'day_off', 'vacation', 'sick_leave', 'holiday', 'permission', 'other',
        name='exceptiontype',
        create_type=True
    )
    exception_type_enum.create(op.get_bind(), checkfirst=True)

    # Create schedule_assignments table
    op.create_table(
        'schedule_assignments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('employees.id', ondelete='CASCADE'), nullable=False),
        sa.Column('assignment_date', sa.Date(), nullable=False),
        sa.Column('schedule_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('schedules.id', ondelete='SET NULL'), nullable=True),
        sa.Column('custom_check_in', sa.Time(), nullable=True),
        sa.Column('custom_check_out', sa.Time(), nullable=True),
        sa.Column('is_day_off', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.UniqueConstraint('employee_id', 'assignment_date', name='uq_employee_assignment_date')
    )

    # Create schedule_exceptions table
    op.create_table(
        'schedule_exceptions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('employees.id', ondelete='CASCADE'), nullable=True),
        sa.Column('exception_type', sa.Enum('day_off', 'vacation', 'sick_leave', 'holiday', 'permission', 'other', name='exceptiontype'), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('has_work_hours', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('work_check_in', sa.Time(), nullable=True),
        sa.Column('work_check_out', sa.Time(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    )

    # Create indexes
    op.create_index('ix_schedule_assignments_employee_date', 'schedule_assignments', ['employee_id', 'assignment_date'])
    op.create_index('ix_schedule_exceptions_employee_dates', 'schedule_exceptions', ['employee_id', 'start_date', 'end_date'])
    op.create_index('ix_schedule_exceptions_type', 'schedule_exceptions', ['exception_type'])


def downgrade() -> None:
    op.drop_index('ix_schedule_exceptions_type')
    op.drop_index('ix_schedule_exceptions_employee_dates')
    op.drop_index('ix_schedule_assignments_employee_date')
    op.drop_table('schedule_exceptions')
    op.drop_table('schedule_assignments')
    op.drop_column('schedules', 'color')
    op.drop_column('schedules', 'description')

    # Drop enum type
    op.execute('DROP TYPE IF EXISTS exceptiontype')
