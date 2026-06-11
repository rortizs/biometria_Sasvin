# Tasks: Fix RBAC Users Access Model

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 900-1,400 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 foundation -> PR2 RBAC APIs -> PR3 workflow/attendance -> PR4 Angular |
| Delivery strategy | auto-forecast |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Canonical roles, migration, bootstrap recovery, helpers | PR1 | Base = tracker; run `cd backend && pytest` |
| 2 | Users/Roles/Permissions enforcement | PR2 | Base = PR1; include direct API denials |
| 3 | Permission requests + attendance object access | PR3 | Base = PR2; include object-scope tests |
| 4 | Angular permission visibility | PR4 | Base = PR3; run `cd frontend && npm test -- --watch=false` |

## Phase 1: Foundation / Migration

- [x] 1.1 RED: add canonical role, unknown-role denial, and bootstrap detection tests in `backend/tests/test_rbac_access_model.py`.
- [x] 1.2 GREEN: update `backend/app/core/config.py`, `backend/app/models/user.py`, and `backend/alembic/versions/*_canonical_rbac_roles.py`.
- [x] 1.3 RED/GREEN: test/update `backend/create_admin_user.py` and `backend/create_admin.sql` for env bootstrap repair.
- [x] 1.4 RED/GREEN: test/add permission and object-access helpers in `backend/app/api/deps.py`.

## PR1 Foundation Blocker Fixes

- [x] B1 RED/GREEN: enforce `protect_bootstrap_admin_mutation()` in users endpoints for update, deactivate via `is_active`, delete, and password change.
- [x] B2 RED/GREEN: enforce `ensure_can_assign_role()` in users and roles endpoints so only bootstrap `ADMIN` can create, assign, or replace `DEV`.
- [x] B3 RED/GREEN: preserve deploy-safe access for migrated business admins while avoiding total `has_permission()` access for non-bootstrap `ADMIN`.
- [x] B4 RED/GREEN: validate `LEGACY_ADMIN_FALLBACK_ROLE` against a non-system business-role allowlist.
- [x] B5 RED/GREEN: make Alembic downgrade map canonical user roles back to legacy values without deleting role assignments or canonical role rows.
- [x] B6 RED/GREEN: make `ADMIN` system-only by blocking `ADMIN` assignment through users and RBAC role assignment backoffice paths, including bootstrap actors.
- [x] B7 RED/GREEN: reserve the configured bootstrap admin email from users API reassignment paths case-insensitively and keep bootstrap admin mutation server-side only.
- [x] B8 RED/GREEN: enforce `ensure_can_assign_role()` and reserved bootstrap email protection in `/auth/register` so business admins cannot create `ADMIN` or `DEV` users.

## Phase 2: Users / RBAC APIs

- [ ] 2.1 RED: add users API tests for bootstrap `ADMIN` list/update/deactivate/reset/delete denial.
- [ ] 2.2 GREEN: update `backend/app/api/v1/endpoints/users.py` to hide/protect bootstrap admin and reject permission-matrix writes.
- [ ] 2.3 RED/GREEN: test/enforce DEV assignment; only bootstrap `ADMIN` may create or assign `DEV`.
- [ ] 2.4 RED/GREEN: test/update `backend/app/api/v1/endpoints/roles.py` and `permissions.py` for DEV-only RBAC internals.

## Phase 3: Workflow / Attendance Enforcement

- [ ] 3.1 RED/GREEN: test/update `permission_requests.py` for owner/reviewer visibility, approval denial, and audit-safe responses.
- [ ] 3.2 RED/GREEN: test/update `attendance.py` for teacher, student, parent, admin, and missing-relationship boundaries.
- [ ] 3.3 RED/GREEN: test/update employees, faces, locations, schedules, and settings endpoints to use permission dependencies.

## Phase 4: Frontend Permission Visibility

- [ ] 4.1 RED/GREEN: update tests/models in `frontend/src/app/core/models/{user,role}.model.ts` for roles, permissions, modules.
- [ ] 4.2 RED/GREEN: test/update `auth.service.ts`, `auth.guard.ts`, and `app.routes.ts` for `data.permission`.
- [ ] 4.3 RED/GREEN: test/update admin dashboard/users/roles pages for backend-driven visibility and role/permission separation.

## Phase 5: Verification / Cleanup

- [ ] 5.1 Run `cd backend && pytest`.
- [ ] 5.2 Run `cd frontend && npm test -- --watch=false`.
- [ ] 5.3 Review hardcoded legacy roles, `ADMIN_ROLES`, denial leaks, and PR boundaries.
