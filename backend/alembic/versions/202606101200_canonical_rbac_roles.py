"""canonical RBAC roles and bootstrap admin foundation

Revision ID: 202606101200
Revises: f1a2b3c4d5e6
Create Date: 2026-06-10
"""

import os
import uuid

from alembic import op
import sqlalchemy as sa


revision = "202606101200"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


CANONICAL_ROLES = [
    {"name": "ADMIN", "description": "Hidden bootstrap system administrator"},
    {"name": "DEV", "description": "Technical RBAC and audit administration"},
    {"name": "DECANO", "description": "Top business administration"},
    {"name": "DUEÑO", "description": "Business owner administration"},
    {"name": "DIRECTOR", "description": "Academic/operational direction"},
    {"name": "ADMINISTRATIVO", "description": "Administrative operations"},
    {"name": "CATEDRATICO", "description": "Teacher-scoped access"},
    {"name": "ESTUDIANTE", "description": "Student self-service access"},
    {"name": "PADRES", "description": "Parent child-scoped read access"},
]

CANONICAL_PERMISSIONS = [
    ("users.view", "users", "view", "global", "View users"),
    ("users.manage", "users", "manage", "global", "Manage users and role assignments"),
    ("roles.view", "roles", "view", "global", "View roles and permissions"),
    ("roles.manage", "roles", "manage", "global", "Manage role permissions"),
    ("permissions.view", "permissions", "view", "global", "View permissions"),
    ("audit.internal", "audit", "view", "global", "View internal audit and validation data"),
]

LEGACY_ROLE_MAPPING = {
    "director": "DIRECTOR",
    "coordinador": "ADMINISTRATIVO",
    "secretaria": "ADMINISTRATIVO",
    "supervisor": "ADMINISTRATIVO",
    "catedratico": "CATEDRATICO",
}

LEGACY_ADMIN_FALLBACK_ALLOWED_ROLES = {"DECANO", "DUEÑO", "DIRECTOR", "ADMINISTRATIVO"}


def _legacy_admin_fallback_role() -> str:
    fallback = os.getenv("LEGACY_ADMIN_FALLBACK_ROLE", "DECANO").strip().upper()
    if fallback not in LEGACY_ADMIN_FALLBACK_ALLOWED_ROLES:
        raise ValueError("LEGACY_ADMIN_FALLBACK_ROLE must be a non-system business role")
    return fallback


def upgrade() -> None:
    bind = op.get_bind()
    with op.get_context().autocommit_block():
        for role in [r["name"] for r in CANONICAL_ROLES]:
            op.execute(f"ALTER TYPE userrole ADD VALUE IF NOT EXISTS '{role}'")

    for role in CANONICAL_ROLES:
        bind.execute(
            sa.text(
                "INSERT INTO roles (id, name, description, is_active, created_at, updated_at) "
                "VALUES (:id, :name, :description, true, NOW(), NOW()) "
                "ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, "
                "is_active = true, updated_at = NOW()"
            ),
            {"id": str(uuid.uuid4()), **role},
        )

    for code, module, action, scope, description in CANONICAL_PERMISSIONS:
        bind.execute(
            sa.text(
                "INSERT INTO permissions (id, code, module, action, scope, description, created_at) "
                "VALUES (:id, :code, :module, :action, :scope, :description, NOW()) "
                "ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description"
            ),
            {
                "id": str(uuid.uuid4()),
                "code": code,
                "module": module,
                "action": action,
                "scope": scope,
                "description": description,
            },
        )

    bind.execute(
        sa.text(
            "UPDATE users SET role = CASE "
            "WHEN role::text = 'admin' AND lower(email) = lower(:bootstrap_email) THEN 'ADMIN'::userrole "
            "WHEN role::text = 'admin' THEN CAST(:fallback AS userrole) "
            "WHEN role::text = 'director' THEN 'DIRECTOR'::userrole "
            "WHEN role::text IN ('coordinador','secretaria','supervisor') THEN 'ADMINISTRATIVO'::userrole "
            "WHEN role::text = 'catedratico' THEN 'CATEDRATICO'::userrole "
            "ELSE role::text END::userrole"
        ),
        {
            "bootstrap_email": os.getenv("BOOTSTRAP_ADMIN_EMAIL", "admin@sistemaslab.dev"),
            "fallback": _legacy_admin_fallback_role(),
        },
    )

    bind.execute(
        sa.text(
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            "WHERE r.name IN ('ADMIN', 'DEV') "
            "ON CONFLICT (role_id, permission_id) DO NOTHING"
        )
    )
    bind.execute(
        sa.text(
            "DELETE FROM user_roles WHERE role_id IN "
            "(SELECT id FROM roles WHERE name IN ('admin','director','coordinador','secretaria','supervisor','catedratico'))"
        )
    )
    assignments = bind.execute(
        sa.text("SELECT u.id AS user_id, r.id AS role_id FROM users u JOIN roles r ON r.name = u.role::text")
    ).fetchall()
    for assignment in assignments:
        bind.execute(
            sa.text(
                "INSERT INTO user_roles (id, user_id, role_id, assigned_at) "
                "VALUES (:id, :user_id, :role_id, NOW()) "
                "ON CONFLICT (user_id, role_id) DO NOTHING"
            ),
            {"id": str(uuid.uuid4()), "user_id": assignment.user_id, "role_id": assignment.role_id},
        )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(
        sa.text(
            "UPDATE users SET role = CASE "
            "WHEN role::text = 'ADMIN' THEN 'admin'::userrole "
            "WHEN role::text = 'DEV' THEN 'admin'::userrole "
            "WHEN role::text = 'DECANO' THEN 'admin'::userrole "
            "WHEN role::text = 'DUEÑO' THEN 'admin'::userrole "
            "WHEN role::text = 'DIRECTOR' THEN 'director'::userrole "
            "WHEN role::text = 'ADMINISTRATIVO' THEN 'coordinador'::userrole "
            "WHEN role::text = 'CATEDRATICO' THEN 'catedratico'::userrole "
            "ELSE role::text END::userrole"
        )
    )
    bind.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE role_id IN "
            "(SELECT id FROM roles WHERE name IN ('ADMIN', 'DEV'))"
        )
    )
