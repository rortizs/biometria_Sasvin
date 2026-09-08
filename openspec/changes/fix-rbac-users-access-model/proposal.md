# Proposal: Fix RBAC Users Access Model

## Intent

Fix the RBAC model so user administration, role assignment, permission visibility, and protected business actions are enforced by the backend, not only by Angular routing or UI hiding. The primary security risk is OWASP Broken Access Control: every protected route must fail closed, apply least privilege, and prevent object/property-level authorization bypasses.

Issue refs: `sistemaslab-umg/sistema-biometrico#34`, `rortizs/biometria_Sasvin#29`.

## Capabilities

- `rbac-access-model`: defines canonical roles, role assignment rules, system user protection, backend permission checks, organizational scope assignment (`user_scope_assignments` binding `COORDINADOR`/`DIRECTOR` to facultad/sede and `SECRETARIA` to `DIRECTOR`), and UI visibility expectations for user/role administration.
- `permission-request-workflow`: constrains who can create and view permission requests, and enforces a two-stage approval — stage 1 `COORDINADOR` scoped to the request's facultad/sede, stage 2 `SECRETARIA` with mandatory justification. `DIRECTOR` is notified and can read the request but holds no approve/deny authority.
- `attendance-access-control`: constrains teacher/student attendance marking, catedrático self check-in/out, and parent read-only access to child attendance/grades.

## Scope

In scope:
- Replace legacy/incomplete role assumptions with: `ADMIN`, `DEV`, `DECANO`, `DUEÑO`, `DIRECTOR`, `COORDINADOR`, `SECRETARIA`, `CATEDRATICO`, `ESTUDIANTE`, `PADRES`. `ADMINISTRATIVO` remains defined in the database enum as deprecated and non-assignable, since PostgreSQL cannot drop an enum value without a type rebuild.
- Treat `ADMIN` as hidden bootstrap/system user sourced from `.env`; never list, update, deactivate, or delete it from backoffice.
- Allow only `ADMIN` to create or assign `DEV`.
- `DECANO`/`DUEÑO` are explicitly read-only — general reporting and dashboard modules only. They hold no technical RBAC, internal audit, or operational write access.
- Add the `user_scope_assignments` table and an admin surface to manage coordinador/director facultad-sede scope and secretaría-director assignments.
- Add `positions.canonical_role` to gate `SECRETARIA` employee writes to catedrático-only positions.
- Remove the coarse `get_current_secretaria_or_above` / `get_current_coordinador_or_above` / `get_current_active_admin` role gates in favor of `require_permission` plus object-scope checks.
- Make Users view assign roles; Roles view manage module/permission visibility/access.
- Enforce authorization in backend routes for users, roles, permissions, permission requests, employees, and attendance.
- Update frontend guards/models/views only to reflect backend-enforced permissions.

Out of scope:
- Redesigning the admin UI.
- Implementing new biometric attendance behavior.
- Changing authentication token format unless required by the design.

## Affected Areas

- Backend: `app/models/user.py`, `app/api/deps.py`, users/roles/permissions/permission_requests/employees/attendance endpoints, `create_admin_user.py`, `create_admin.sql`.
- Frontend: auth guard, routes, user model, users admin page, dashboard visibility.

## Risks

- Existing seeded users with legacy roles may lose access if migration mapping is incomplete.
- Hiding bootstrap admin incorrectly could lock out all technical administration.
- Frontend-only assumptions may mask missing backend denials unless tests cover direct API calls.
- Permission denial logging must avoid leaking sensitive object details.
- **Phase-1 data loss**: migration `202606101200` already collapsed coordinador/secretaria into `ADMINISTRATIVO` and deleted legacy `user_roles` rows wherever it ran. The original coordinador/secretaria distinction may be unrecoverable for those users, so the reclassification migration needs a documented heuristic (see design D3) and an audit trail for ambiguous cases.
- **Rollout-ordering risk**: enforcement MUST NOT go live before `user_scope_assignments` rows are populated for existing coordinadores, directores, and secretarías, or every permission-request stage transition fails closed. Rollout must be staged: migrate schema → populate scope rows → enable enforcement.

## Rollback Plan

- Keep role migration reversible via explicit legacy-to-new mapping.
- Preserve a verified bootstrap admin recovery path through `.env` and server-side script.
- Roll back endpoint policy changes together with frontend visibility changes to avoid inconsistent access.

## Success Criteria

- `admin@sistemaslab.dev` or configured bootstrap admin is hidden and immutable through user APIs.
- Non-`ADMIN` users cannot create/assign `DEV`, even by direct API calls.
- Each role can access only its documented modules/actions.
- Permission denials fail closed with appropriate status codes and audit logs where useful.
- Backend tests prove object-level and role-level enforcement for affected endpoints.
- `COORDINADOR` cannot resolve permission requests outside their assigned facultad/sede.
- `DIRECTOR` cannot approve or deny permission requests at any stage (read-only, notified only).
- Stage-2 approval or denial without justification returns HTTP 422.
- `COORDINADOR` cannot export or edit attendance reports (read-only only).
