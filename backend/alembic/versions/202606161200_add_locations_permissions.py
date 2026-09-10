"""add locations module permissions

Revision ID: 202606161200
Revises: 202606151200
Create Date: 2026-06-16

Design: design.md D10 (retire coarse role gates in favor of
`require_permission(...)`). Spec: rbac-access-model "Module Access
Boundaries", "Backend Authorization Enforcement".

Why this migration exists: unlike `departments.*`/`positions.*`/
`schedules.*` (seeded by the pre-canonical migration `9f8e7d6c5b4a`),
`locations.*` permission codes were never seeded anywhere in this
codebase. `backend/app/api/v1/endpoints/locations.py`'s task-3.10 gate
replacement swaps `get_current_secretaria_or_above`/
`get_current_active_admin` for `require_permission("locations.create"
/"update"/"delete")` -- without this migration, `has_permission()` would
return `False` for every actor except the hidden bootstrap `ADMIN`
(which bypasses permission checks entirely), since no `role_permissions`
row could reference a permission code that does not exist. That would be
a real functional regression, not the intended staged-rollout gap (the
staged-rollout gap is "no role holds the grant yet, an operator adds it
via the Roles view" -- it assumes the permission row itself exists).

Upgrade:
  1. Seed `locations.view`/`locations.create`/`locations.update`/
     `locations.delete` permission rows, mirroring `departments.*`/
     `positions.*`'s module/action/scope shape.
  2. Grant all four to `ADMIN` and `DEV`, mirroring `202606101200`'s
     `ADMIN`/`DEV` cross-join grant (that migration's own cross join ran
     before these rows existed, so it never covered them).

Downgrade: revokes the `ADMIN`/`DEV` grants for these four codes, then
deletes the four permission rows. Does not touch `roles`/`user_roles`
(same non-destructive contract as `202606101200`/`202606151200`).
"""

import uuid

from alembic import op
import sqlalchemy as sa


revision = "202606161200"
down_revision = "202606151200"
branch_labels = None
depends_on = None


LOCATIONS_PERMISSIONS = [
    ("locations.view", "locations", "view", "global", "Ver sedes"),
    ("locations.create", "locations", "create", "global", "Crear sedes"),
    ("locations.update", "locations", "update", "global", "Editar sedes"),
    ("locations.delete", "locations", "delete", "global", "Eliminar sedes"),
]


def upgrade() -> None:
    bind = op.get_bind()

    for code, module, action, scope, description in LOCATIONS_PERMISSIONS:
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
            "WHERE r.name IN ('ADMIN', 'DEV') AND p.code LIKE 'locations.%' "
            "ON CONFLICT (role_id, permission_id) DO NOTHING"
        )
    )


def downgrade() -> None:
    bind = op.get_bind()

    bind.execute(
        sa.text(
            "DELETE FROM role_permissions WHERE permission_id IN "
            "(SELECT id FROM permissions WHERE code LIKE 'locations.%')"
        )
    )
    bind.execute(sa.text("DELETE FROM permissions WHERE code LIKE 'locations.%'"))
