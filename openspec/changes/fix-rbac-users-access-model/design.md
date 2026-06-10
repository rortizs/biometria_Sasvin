# Design: Fix RBAC Users Access Model

## Technical Approach

Replace hardcoded `User.role` route checks with backend-enforced permissions from existing RBAC tables (`roles`, `permissions`, `role_permissions`, `user_roles`). `users.role` remains only as a migration/compatibility primary-role mirror until the frontend and tokens stop depending on it. No delta specs exist yet, so this design derives from the proposal capabilities: `rbac-access-model`, `permission-request-workflow`, and `attendance-access-control`.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Authorization source | DB-backed permissions are canonical; route dependencies ask for permission codes. | Continue enum hierarchy checks in `app/api/deps.py`. | OWASP Broken Access Control requires fail-closed checks per protected action, not UI or legacy role assumptions. |
| Bootstrap admin | Add env-backed hidden `ADMIN` identity, defaulting to `admin@sistemaslab.dev`, and protect it in API code. | Keep visible admin user editable in backoffice. | Prevents lockout while blocking accidental deletion/deactivation or privilege changes. |
| UI authorization | Frontend consumes backend permissions for route/card/sidebar visibility. | Keep `ADMIN_ROLES` arrays in Angular. | UI hiding is convenience only; backend remains authority and denies direct API calls. |

## Data Flow

    JWT -> get_current_user(load user_roles->role->permissions)
        -> require_permission("module.action")
        -> optional assert_object_access(resource, actor)
        -> endpoint mutation/query -> AuditLog on sensitive grants/denials

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/app/core/config.py` | Modify | Add `bootstrap_admin_email`, `bootstrap_admin_full_name`, script-only `bootstrap_admin_password`, and `legacy_admin_fallback_role`. |
| `backend/app/models/user.py` | Modify | Expand role enum to uppercase canonical roles; keep legacy mapping during migration. |
| `backend/alembic/versions/*_canonical_rbac_roles.py` | Create | Seed `ADMIN`, `DEV`, `DECANO`, `DUEÑO`, `DIRECTOR`, `ADMINISTRATIVO`, `CATEDRATICO`, `ESTUDIANTE`, `PADRES`; map legacy roles and sync `user_roles`. |
| `backend/app/api/deps.py` | Modify | Add `has_permission`, `require_permission`, `require_any_permission`, `is_bootstrap_admin`, and object-access helpers. |
| `backend/app/api/v1/endpoints/{auth,users,roles,permissions,permission_requests,employees,attendance,faces,locations,schedules,settings}.py` | Modify | Replace role comparisons with permission/object checks; hide/protect bootstrap user; restrict role assignment. |
| `backend/create_admin_user.py`, `backend/create_admin.sql` | Modify | Remove hardcoded password/identity; repair/create env bootstrap user and role assignment. |
| `frontend/src/app/core/models/{user,role}.model.ts` | Modify | Add canonical roles and permission fields. |
| `frontend/src/app/core/services/auth.service.ts`, `frontend/src/app/core/guards/auth.guard.ts`, `frontend/src/app/app.routes.ts` | Modify | Expose permission helpers and route `data.permission` checks. |
| `frontend/src/app/features/admin/pages/{dashboard,users,roles}/*.ts` | Modify | Render cards/actions from backend permissions; Users assigns roles, Roles edits module permissions. |

## Interfaces / Contracts

```python
CanonicalRole = Literal["ADMIN", "DEV", "DECANO", "DUEÑO", "DIRECTOR", "ADMINISTRATIVO", "CATEDRATICO", "ESTUDIANTE", "PADRES"]
def require_permission(code: str): ...
def assert_object_access(actor: User, action: str, owner_user_id: UUID | None = None, employee_id: UUID | None = None) -> None: ...
```

`GET /auth/me` should return `role`, `roles[]`, `permissions[]`, and `modules[]`. `ADMIN` is never returned by `/users/`, cannot be patched, password-reset, deactivated, deleted, or assigned away through backoffice. Only `ADMIN` may create/assign `DEV`; `DEV` may manage technical RBAC except changing `ADMIN`. `DECANO`/`DUEÑO` get top business permissions but no internal RBAC/audit administration. `PADRES`/`ESTUDIANTE` object access fails closed unless ownership/relationship can be proven by existing `users.employee_id` or future relation data.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Backend unit | Permission helpers, legacy mapping, bootstrap detection, role assignment matrix. | Strict TDD: write failing pytest tests first, then implement. |
| Backend integration | Direct API denial/allow for users, roles, permissions, permission requests, employees, attendance. | `pytest` with async endpoint calls/mocked DB matching existing tests. |
| Frontend unit | Guards, dashboard cards, users/roles action visibility. | `ng test --watch=false`; tests fail first against current `ADMIN_ROLES` arrays. |

## Migration / Rollout

Add a reversible Alembic migration: create canonical roles/permissions including users, locations, faces, and module visibility; map `admin` bootstrap email to `ADMIN`, other `admin` to `legacy_admin_fallback_role` (`DECANO` default), `director` to `DIRECTOR`, `coordinador`/`secretaria`/`supervisor` to `ADMINISTRATIVO`, `catedratico` to `CATEDRATICO`. Deploy backend migration before frontend. Recovery: run `create_admin_user.py` with env to repair hidden `ADMIN`. Rollback: deploy previous app pair and Alembic downgrade to restore legacy role values/user role rows.

## Open Questions

- [ ] Confirm whether non-bootstrap legacy `admin` should map to `DECANO` or `DUEÑO`; design defaults to `DECANO` via env.
