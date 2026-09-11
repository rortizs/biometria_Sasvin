"""add faces module permissions

Revision ID: 202606171200
Revises: 202606161200
Create Date: 2026-06-17

Design: design.md D10 (retire coarse role gates in favor of
`require_permission(...)`). Spec: rbac-access-model "Business Top Role
Boundaries" -- "DECANO and DUEÑO cannot perform operational write actions".

Why this migration exists: unlike `settings.*` (seeded by the
pre-canonical migration `9f8e7d6c5b4a`), no `faces.*` permission code was
ever seeded anywhere in this codebase. `backend/app/api/v1/endpoints/
faces.py`'s task-3.11 gate replacement swaps `get_current_active_admin`
(a deploy-safe fallback role set that included `DECANO`/`DUEÑO`, the exact
over-privilege bug this task closes) for `require_permission("faces
.create"/"faces.delete")` -- without this migration, `has_permission()`
would return `False` for every actor except the hidden bootstrap `ADMIN`
(same functional-regression risk documented in
`202606161200_add_locations_permissions.py`).

`POST /faces/verify` intentionally stays unauthenticated (kiosk/check-in
identification flow) and needs no permission row.

Upgrade:
  1. Seed `faces.create` (face embedding registration) and `faces.delete`
     (face embedding removal) permission rows.
  2. Grant both to `ADMIN` and `DEV`, mirroring `202606161200`'s
     `ADMIN`/`DEV` cross-join grant.

Downgrade: revokes the `ADMIN`/`DEV` grants for these two codes, then
deletes the two permission rows. Does not touch `roles`/`user_roles`
(same non-destructive contract as `202606161200`).
"""

import uuid

from alembic import op
import sqlalchemy as sa


revision = "202606171200"
down_revision = "202606161200"
branch_labels = None
depends_on = None


FACES_PERMISSIONS = [
    ("faces.create", "faces", "create", "global", "Registrar embeddings faciales de empleados"),
    ("faces.delete", "faces", "delete", "global", "Eliminar embeddings faciales de empleados"),
]


def upgrade() -> None:
    bind = op.get_bind()

    for code, module, action, scope, description in FACES_PERMISSIONS:
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
            "INSERT INTO role_permissions (role_id, permission_id) "
            "SELECT r.id, p.id FROM roles r CROSS JOIN permissions p "
            "WHERE r.name IN ('ADMIN', 'DEV') AND p.code LIKE 'faces.%' "
            "ON CONFLICT (role_id, permission_id) DO NOTHING"
        )
    )


def downgrade() -> None:
    bind = op.get_bind()

    bind.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE permission_id IN "
            "(SELECT id FROM permissions WHERE code LIKE 'faces.%')"
        )
    )
    bind.execute(sa.text("DELETE FROM permissions WHERE code LIKE 'faces.%'"))
