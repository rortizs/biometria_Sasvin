"""rbac_tables_audit_log_schedule_columns

Revision ID: 9f8e7d6c5b4a
Revises: e5f6a7b8c9d0
Create Date: 2026-04-22

"""
import uuid
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '9f8e7d6c5b4a'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------

ROLES = [
    {"id": "11111111-0000-0000-0000-000000000001", "name": "admin",        "description": "Acceso total al sistema"},
    {"id": "11111111-0000-0000-0000-000000000002", "name": "director",     "description": "Director de facultad o departamento"},
    {"id": "11111111-0000-0000-0000-000000000003", "name": "coordinador",  "description": "Coordinador de carrera"},
    {"id": "11111111-0000-0000-0000-000000000004", "name": "secretaria",   "description": "Personal de secretaría"},
    {"id": "11111111-0000-0000-0000-000000000005", "name": "catedratico",  "description": "Docente / catedrático"},
]

# Format: (code, module, action, scope, description)
PERMISSIONS = [
    # employees
    ("employees.view",   "employees", "view",   "global", "Ver listado de empleados"),
    ("employees.create", "employees", "create", "global", "Crear nuevos empleados"),
    ("employees.update", "employees", "update", "global", "Editar datos de empleados"),
    ("employees.delete", "employees", "delete", "global", "Eliminar empleados"),
    # attendance
    ("attendance.view",   "attendance", "view",   "global", "Ver registros de asistencia"),
    ("attendance.export", "attendance", "export", "global", "Exportar reportes de asistencia"),
    # schedules
    ("schedules.view",   "schedules", "view",   "global", "Ver horarios"),
    ("schedules.create", "schedules", "create", "global", "Crear horarios"),
    ("schedules.update", "schedules", "update", "global", "Editar horarios"),
    ("schedules.delete", "schedules", "delete", "global", "Eliminar horarios"),
    # permission_requests
    ("permission_requests.view",    "permission_requests", "view",    "global", "Ver solicitudes de permiso"),
    ("permission_requests.create",  "permission_requests", "create",  "global", "Crear solicitudes de permiso"),
    ("permission_requests.approve", "permission_requests", "approve", "global", "Aprobar solicitudes de permiso"),
    ("permission_requests.reject",  "permission_requests", "reject",  "global", "Rechazar solicitudes de permiso"),
    # settings
    ("settings.view",   "settings", "view",   "global", "Ver configuración del sistema"),
    ("settings.update", "settings", "update", "global", "Actualizar configuración del sistema"),
    # departments
    ("departments.view",   "departments", "view",   "global", "Ver departamentos"),
    ("departments.create", "departments", "create", "global", "Crear departamentos"),
    ("departments.update", "departments", "update", "global", "Editar departamentos"),
    ("departments.delete", "departments", "delete", "global", "Eliminar departamentos"),
    # positions
    ("positions.view",   "positions", "view",   "global", "Ver cargos"),
    ("positions.create", "positions", "create", "global", "Crear cargos"),
    ("positions.update", "positions", "update", "global", "Editar cargos"),
    ("positions.delete", "positions", "delete", "global", "Eliminar cargos"),
    # roles
    ("roles.view",   "roles", "view",   "global", "Ver roles y permisos"),
    ("roles.create", "roles", "create", "global", "Crear roles"),
    ("roles.update", "roles", "update", "global", "Editar roles"),
    ("roles.delete", "roles", "delete", "global", "Eliminar roles"),
    ("roles.assign", "roles", "assign", "global", "Asignar roles a usuarios"),
]

ROLE_PERMISSIONS = {
    "admin": [p[0] for p in PERMISSIONS],
    "director": [
        "employees.view", "employees.create", "employees.update",
        "attendance.view", "attendance.export",
        "schedules.view", "schedules.create", "schedules.update",
        "permission_requests.view", "permission_requests.approve", "permission_requests.reject",
        "settings.view",
        "departments.view", "departments.create", "departments.update",
        "positions.view", "positions.create", "positions.update",
        "roles.view",
    ],
    "coordinador": [
        "employees.view",
        "attendance.view",
        "schedules.view",
        "permission_requests.view", "permission_requests.approve", "permission_requests.reject",
        "departments.view",
        "positions.view",
    ],
    "secretaria": [
        "employees.view", "employees.create", "employees.update",
        "attendance.view",
        "schedules.view",
        "permission_requests.view", "permission_requests.create",
        "departments.view",
        "positions.view",
    ],
    "catedratico": [
        "employees.view",
        "attendance.view",
        "schedules.view",
        "permission_requests.view", "permission_requests.create",
    ],
}


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Create roles table
    # ------------------------------------------------------------------
    op.create_table(
        "roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(50), unique=True, nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_roles_name", "roles", ["name"])

    # ------------------------------------------------------------------
    # 2. Create permissions table
    # ------------------------------------------------------------------
    op.create_table(
        "permissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code", sa.String(100), unique=True, nullable=False),
        sa.Column("module", sa.String(50), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("scope", sa.String(50), nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_permissions_code", "permissions", ["code"])
    op.create_index("ix_permissions_module", "permissions", ["module"])

    # ------------------------------------------------------------------
    # 3. Create role_permissions junction table
    # ------------------------------------------------------------------
    op.create_table(
        "role_permissions",
        sa.Column(
            "role_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("roles.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "permission_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("permissions.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )

    # ------------------------------------------------------------------
    # 4. Create user_roles table
    # ------------------------------------------------------------------
    op.create_table(
        "user_roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("roles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("assigned_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "assigned_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.UniqueConstraint("user_id", "role_id", name="uq_user_role"),
    )
    op.create_index("ix_user_roles_user_id", "user_roles", ["user_id"])
    op.create_index("ix_user_roles_role_id", "user_roles", ["role_id"])

    # ------------------------------------------------------------------
    # 5. Create audit_action_type enum + audit_logs table
    # ------------------------------------------------------------------
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE auditactiontype AS ENUM (
                'login', 'logout', 'create', 'update', 'delete',
                'view', 'approve', 'reject', 'assign'
            );
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "action",
            postgresql.ENUM(
                "login", "logout", "create", "update", "delete",
                "view", "approve", "reject", "assign",
                name="auditactiontype",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("resource_type", sa.String(50), nullable=False),
        sa.Column("resource_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("details", postgresql.JSONB(), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_resource_type", "audit_logs", ["resource_type"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    # ------------------------------------------------------------------
    # 6. Add columns to schedules
    # ------------------------------------------------------------------
    op.add_column("schedules", sa.Column("lunch_start", sa.Time(), nullable=True))
    op.add_column("schedules", sa.Column("lunch_end", sa.Time(), nullable=True))
    op.add_column("schedules", sa.Column("dinner_start", sa.Time(), nullable=True))
    op.add_column("schedules", sa.Column("dinner_end", sa.Time(), nullable=True))
    op.add_column("schedules", sa.Column("net_hours", sa.Numeric(5, 2), nullable=True))

    # ------------------------------------------------------------------
    # 7. Add columns to permission_requests
    # ------------------------------------------------------------------
    op.add_column("permission_requests", sa.Column("start_time", sa.Time(), nullable=True))
    op.add_column("permission_requests", sa.Column("end_time", sa.Time(), nullable=True))
    op.add_column("permission_requests", sa.Column("hours_affected", sa.Numeric(5, 2), nullable=True))

    # ------------------------------------------------------------------
    # 8. Seed roles
    # ------------------------------------------------------------------
    roles_table = sa.table(
        "roles",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
        sa.column("is_active", sa.Boolean),
    )
    op.bulk_insert(roles_table, [
        {"id": r["id"], "name": r["name"], "description": r["description"], "is_active": True}
        for r in ROLES
    ])

    # ------------------------------------------------------------------
    # 9. Seed permissions
    # ------------------------------------------------------------------
    permissions_table = sa.table(
        "permissions",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("code", sa.String),
        sa.column("module", sa.String),
        sa.column("action", sa.String),
        sa.column("scope", sa.String),
        sa.column("description", sa.String),
    )
    perm_rows = []
    perm_id_map = {}
    for code, module, action, scope, description in PERMISSIONS:
        pid = str(uuid.uuid4())
        perm_id_map[code] = pid
        perm_rows.append({
            "id": pid,
            "code": code,
            "module": module,
            "action": action,
            "scope": scope,
            "description": description,
        })
    op.bulk_insert(permissions_table, perm_rows)

    # ------------------------------------------------------------------
    # 10. Seed role_permissions
    # ------------------------------------------------------------------
    role_name_to_id = {r["name"]: r["id"] for r in ROLES}
    rp_table = sa.table(
        "role_permissions",
        sa.column("role_id", postgresql.UUID(as_uuid=True)),
        sa.column("permission_id", postgresql.UUID(as_uuid=True)),
    )
    rp_rows = []
    for role_name, perm_codes in ROLE_PERMISSIONS.items():
        role_id = role_name_to_id[role_name]
        for code in perm_codes:
            rp_rows.append({"role_id": role_id, "permission_id": perm_id_map[code]})
    op.bulk_insert(rp_table, rp_rows)

    # ------------------------------------------------------------------
    # 11. Migrate existing users.role → user_roles junction (Python UUIDs)
    # ------------------------------------------------------------------
    bind = op.get_bind()
    users = bind.execute(sa.text("SELECT id, role::text AS role_name FROM users")).fetchall()
    roles_map = {
        row.name: str(row.id)
        for row in bind.execute(sa.text("SELECT id, name FROM roles")).fetchall()
    }
    from datetime import datetime as dt_
    ur_rows = [
        {
            "id": str(uuid.uuid4()),
            "user_id": str(u.id),
            "role_id": roles_map[u.role_name],
            "assigned_at": dt_.utcnow(),
        }
        for u in users if u.role_name in roles_map
    ]
    if ur_rows:
        bind.execute(
            sa.text(
                "INSERT INTO user_roles (id, user_id, role_id, assigned_at) "
                "VALUES (:id, :user_id, :role_id, :assigned_at) "
                "ON CONFLICT (user_id, role_id) DO NOTHING"
            ),
            ur_rows,
        )


def downgrade() -> None:
    op.drop_column("permission_requests", "hours_affected")
    op.drop_column("permission_requests", "end_time")
    op.drop_column("permission_requests", "start_time")

    op.drop_column("schedules", "net_hours")
    op.drop_column("schedules", "dinner_end")
    op.drop_column("schedules", "dinner_start")
    op.drop_column("schedules", "lunch_end")
    op.drop_column("schedules", "lunch_start")

    op.drop_index("ix_audit_logs_created_at")
    op.drop_index("ix_audit_logs_resource_type")
    op.drop_index("ix_audit_logs_action")
    op.drop_index("ix_audit_logs_user_id")
    op.drop_table("audit_logs")
    op.execute("DROP TYPE IF EXISTS auditactiontype")

    op.drop_index("ix_user_roles_role_id")
    op.drop_index("ix_user_roles_user_id")
    op.drop_table("user_roles")

    op.drop_table("role_permissions")

    op.drop_index("ix_permissions_module")
    op.drop_index("ix_permissions_code")
    op.drop_table("permissions")

    op.drop_index("ix_roles_name")
    op.drop_table("roles")
