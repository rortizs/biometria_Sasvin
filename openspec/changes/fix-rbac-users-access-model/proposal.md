# Proposal: Fix RBAC Users Access Model

## Intent

Fix the RBAC model so user administration, role assignment, permission visibility, and protected business actions are enforced by the backend, not only by Angular routing or UI hiding. The primary security risk is OWASP Broken Access Control: every protected route must fail closed, apply least privilege, and prevent object/property-level authorization bypasses.

Issue refs: `sistemaslab-umg/sistema-biometrico#34`, `rortizs/biometria_Sasvin#29`.

## Capabilities

- `rbac-access-model`: defines canonical roles, role assignment rules, system user protection, backend permission checks, and UI visibility expectations for user/role administration.
- `permission-request-workflow`: constrains who can create, view, approve, deny, and audit permission requests by role and object ownership.
- `attendance-access-control`: constrains teacher/student attendance marking and parent read-only access to child attendance/grades.

## Scope

In scope:
- Replace legacy/incomplete role assumptions with: `ADMIN`, `DEV`, `DECANO`, `DUEÑO`, `DIRECTOR`, `ADMINISTRATIVO`, `CATEDRATICO`, `ESTUDIANTE`, `PADRES`.
- Treat `ADMIN` as hidden bootstrap/system user sourced from `.env`; never list, update, deactivate, or delete it from backoffice.
- Allow only `ADMIN` to create or assign `DEV`.
- Keep `DECANO`/`DUEÑO` as top business roles without technical RBAC or internal audit administration.
- Make Users view assign roles; Roles view manage module/permission visibility/access.
- Enforce authorization in backend routes for users, roles, permissions, permission requests, employees, and attendance.
- Update frontend guards/models/views only to reflect backend-enforced permissions.

Out of scope:
- Redesigning the admin UI.
- Implementing new biometric attendance behavior.
- Changing authentication token format unless required by the design.
- Data migration execution; this proposal only defines the change.

## Affected Areas

- Backend: `app/models/user.py`, `app/api/deps.py`, users/roles/permissions/permission_requests/employees/attendance endpoints, `create_admin_user.py`, `create_admin.sql`.
- Frontend: auth guard, routes, user model, users admin page, dashboard visibility.

## Risks

- Existing seeded users with legacy roles may lose access if migration mapping is incomplete.
- Hiding bootstrap admin incorrectly could lock out all technical administration.
- Frontend-only assumptions may mask missing backend denials unless tests cover direct API calls.
- Permission denial logging must avoid leaking sensitive object details.

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
