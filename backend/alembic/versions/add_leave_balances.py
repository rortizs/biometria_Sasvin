"""Add leave balances tables for time-off management

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2025-01-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'c3d4e5f6g7h8'
down_revision = 'b2c3d4e5f6g7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create leave_unit enum
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE leaveunit AS ENUM ('days', 'hours');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    # Create accrual_type enum
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE accrualtype AS ENUM ('annual', 'fixed', 'overtime', 'manual');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    # Create transaction_type enum
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE transactiontype AS ENUM ('credit', 'debit', 'adjustment', 'expiration');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    # Create leave_policies table
    op.create_table(
        'leave_policies',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('code', sa.String(50), nullable=False, unique=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('unit', postgresql.ENUM('days', 'hours', name='leaveunit', create_type=False), nullable=False, server_default='days'),
        sa.Column('accrual_type', postgresql.ENUM('annual', 'fixed', 'overtime', 'manual', name='accrualtype', create_type=False), nullable=False, server_default='annual'),
        sa.Column('base_amount', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('increment_per_years', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('years_for_increment', sa.Integer(), nullable=False, server_default='5'),
        sa.Column('max_amount', sa.Numeric(10, 2), nullable=True),
        sa.Column('expires_after_days', sa.Integer(), nullable=True),
        sa.Column('allow_carryover', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('max_carryover', sa.Numeric(10, 2), nullable=True),
        sa.Column('color', sa.String(7), nullable=False, server_default='#3b82f6'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    # Create leave_balances table
    op.create_table(
        'leave_balances',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('employees.id', ondelete='CASCADE'), nullable=False),
        sa.Column('policy_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('leave_policies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('period_year', sa.Integer(), nullable=False),
        sa.Column('period_start', sa.Date(), nullable=False),
        sa.Column('period_end', sa.Date(), nullable=False),
        sa.Column('initial_balance', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('current_balance', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('used_amount', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('pending_amount', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('carryover_amount', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('employee_id', 'policy_id', 'period_year', name='uq_employee_policy_period'),
        sa.CheckConstraint('current_balance >= 0', name='ck_positive_balance'),
    )

    # Create leave_transactions table
    op.create_table(
        'leave_transactions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('balance_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('leave_balances.id', ondelete='CASCADE'), nullable=False),
        sa.Column('transaction_type', postgresql.ENUM('credit', 'debit', 'adjustment', 'expiration', name='transactiontype', create_type=False), nullable=False),
        sa.Column('amount', sa.Numeric(10, 2), nullable=False),
        sa.Column('balance_before', sa.Numeric(10, 2), nullable=False),
        sa.Column('balance_after', sa.Numeric(10, 2), nullable=False),
        sa.Column('schedule_exception_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('schedule_exceptions.id', ondelete='SET NULL'), nullable=True),
        sa.Column('usage_start_date', sa.Date(), nullable=True),
        sa.Column('usage_end_date', sa.Date(), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
    )

    # Create indexes
    op.create_index('ix_leave_policies_code', 'leave_policies', ['code'])
    op.create_index('ix_leave_balances_employee', 'leave_balances', ['employee_id'])
    op.create_index('ix_leave_balances_policy', 'leave_balances', ['policy_id'])
    op.create_index('ix_leave_balances_period', 'leave_balances', ['period_year'])
    op.create_index('ix_leave_transactions_balance', 'leave_transactions', ['balance_id'])
    op.create_index('ix_leave_transactions_created', 'leave_transactions', ['created_at'])

    # Insert default policies
    op.execute("""
        INSERT INTO leave_policies (id, code, name, description, unit, accrual_type, base_amount, increment_per_years, years_for_increment, max_amount, color)
        VALUES
            (gen_random_uuid(), 'VACATION', 'Vacaciones', 'Dias de vacaciones anuales segun antiguedad', 'days', 'annual', 15, 1, 5, 30, '#1E3A5F'),
            (gen_random_uuid(), 'SICK_LEAVE', 'Incapacidad', 'Fondo de dias por enfermedad', 'days', 'fixed', 30, 0, 1, NULL, '#DC2626'),
            (gen_random_uuid(), 'COMPENSATORY', 'Horas Compensatorias', 'Acumulacion por horas extra trabajadas', 'hours', 'overtime', 0, 0, 1, NULL, '#059669');
    """)


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_leave_transactions_created')
    op.drop_index('ix_leave_transactions_balance')
    op.drop_index('ix_leave_balances_period')
    op.drop_index('ix_leave_balances_policy')
    op.drop_index('ix_leave_balances_employee')
    op.drop_index('ix_leave_policies_code')

    # Drop tables
    op.drop_table('leave_transactions')
    op.drop_table('leave_balances')
    op.drop_table('leave_policies')

    # Drop enum types
    op.execute('DROP TYPE IF EXISTS transactiontype')
    op.execute('DROP TYPE IF EXISTS accrualtype')
    op.execute('DROP TYPE IF EXISTS leaveunit')
