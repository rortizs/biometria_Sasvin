"""add_permission_requests_and_user_roles

Revision ID: d1e2f3a4b5c6
Revises: c7b4f2a8cd01
Create Date: 2026-04-20

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'd1e2f3a4b5c6'
down_revision = 'c7b4f2a8cd01'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Create userrole enum type
    # ------------------------------------------------------------------
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE userrole AS ENUM (
                'admin', 'director', 'coordinador', 'secretaria', 'catedratico'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    # ------------------------------------------------------------------
    # 2. Alter users.role column: String(50) -> userrole enum
    #    Uses USING cast to migrate existing string values.
    # ------------------------------------------------------------------
    op.execute("""
        ALTER TABLE users
            ALTER COLUMN role TYPE userrole
            USING role::userrole;
    """)
    op.execute("""
        ALTER TABLE users
            ALTER COLUMN role SET DEFAULT 'admin'::userrole;
    """)

    # ------------------------------------------------------------------
    # 3. Create enum types for permission_requests
    # ------------------------------------------------------------------
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE permissionrequeststatus AS ENUM (
                'pending', 'coordinator_approved', 'approved', 'rejected'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    op.execute("""
        DO $$ BEGIN
            CREATE TYPE rejectionstage AS ENUM (
                'coordinator', 'director'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    # ------------------------------------------------------------------
    # 4. Create permission_requests table
    # ------------------------------------------------------------------
    op.create_table(
        'permission_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),

        # Requester and target employee
        sa.Column(
            'requested_by_user_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id'),
            nullable=False,
        ),
        sa.Column(
            'employee_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('employees.id'),
            nullable=False,
        ),

        # Request details
        sa.Column('exception_type', sa.String(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),

        # Status
        sa.Column(
            'status',
            postgresql.ENUM(
                'pending', 'coordinator_approved', 'approved', 'rejected',
                name='permissionrequeststatus',
                create_type=False,
            ),
            nullable=False,
            server_default='pending',
        ),

        # Coordinator review
        sa.Column(
            'coordinator_reviewed_by',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id'),
            nullable=True,
        ),
        sa.Column('coordinator_reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('coordinator_notes', sa.Text(), nullable=True),

        # Director review
        sa.Column(
            'director_reviewed_by',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id'),
            nullable=True,
        ),
        sa.Column('director_reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('director_notes', sa.Text(), nullable=True),

        # Rejection
        sa.Column(
            'rejection_stage',
            postgresql.ENUM(
                'coordinator', 'director',
                name='rejectionstage',
                create_type=False,
            ),
            nullable=True,
        ),
        sa.Column('rejection_reason', sa.Text(), nullable=True),

        # Link to approved schedule exception
        sa.Column(
            'schedule_exception_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('schedule_exceptions.id'),
            nullable=True,
        ),

        sa.Column(
            'created_at',
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # Indexes for common query patterns
    op.create_index(
        'ix_permission_requests_employee_id',
        'permission_requests',
        ['employee_id'],
    )
    op.create_index(
        'ix_permission_requests_requested_by',
        'permission_requests',
        ['requested_by_user_id'],
    )
    op.create_index(
        'ix_permission_requests_status',
        'permission_requests',
        ['status'],
    )


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_permission_requests_status')
    op.drop_index('ix_permission_requests_requested_by')
    op.drop_index('ix_permission_requests_employee_id')

    # Drop table
    op.drop_table('permission_requests')

    # Drop new enum types
    op.execute('DROP TYPE IF EXISTS rejectionstage')
    op.execute('DROP TYPE IF EXISTS permissionrequeststatus')

    # Revert users.role back to String
    op.execute("""
        ALTER TABLE users
            ALTER COLUMN role TYPE varchar(50)
            USING role::text;
    """)
    op.execute("ALTER TABLE users ALTER COLUMN role SET DEFAULT 'admin'")

    # Drop userrole enum
    op.execute('DROP TYPE IF EXISTS userrole')
