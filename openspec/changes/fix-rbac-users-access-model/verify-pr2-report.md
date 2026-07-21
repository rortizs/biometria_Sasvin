## Verification Report

**Change**: `fix-rbac-users-access-model`
**Slice**: PR2 users/roles/permissions enforcement
**Branch**: `fix/rbac-users-access-model-users-roles`
**Verifier**: dedicated `sdd-verify` executor sub-agent
**Strict TDD**: ACTIVE, enforced by artifact/test evidence
**Verdict**: PASS WITH WARNINGS

### Scope Verified

- Users routes require backend permission dependencies: `users.view` for list and `users.manage` for update, delete, and password change.
- `get_current_user()` eagerly loads `user_roles -> role -> permissions` so direct API permission checks evaluate DB-backed role permissions.
- Roles and permissions internals are restricted to bootstrap `ADMIN` and `DEV` via `get_current_technical_rbac_admin()`.
- Business top roles (`DECANO`, `DUEÑO`) are denied from technical RBAC internals.
- Bootstrap `ADMIN` role detail and role-assignment mutation are protected in roles user-role endpoints.
- DEV assignment remains bootstrap-only, while `ADMIN` assignment remains system-only.

### Artifact Evidence

- Read `openspec/changes/fix-rbac-users-access-model/proposal.md`.
- Read `openspec/changes/fix-rbac-users-access-model/design.md`.
- Read `openspec/changes/fix-rbac-users-access-model/tasks.md`.
- Read delta specs under `openspec/changes/fix-rbac-users-access-model/specs/`:
  - `rbac-access-model/spec.md`
  - `attendance-access-control/spec.md`
  - `permission-request-workflow/spec.md`
- Read changed PR2 backend files:
  - `backend/app/api/deps.py`
  - `backend/app/api/v1/endpoints/users.py`
  - `backend/app/api/v1/endpoints/roles.py`
  - `backend/app/api/v1/endpoints/permissions.py`
  - `backend/tests/test_rbac_access_model.py`
- Read prior report `openspec/changes/fix-rbac-users-access-model/verify-pr2-report.md` before replacing it with this current verification report.

### PR2 Requirement Mapping

| PR2 scope item | Implementation evidence | Runtime test evidence | Result |
|---|---|---|---|
| Users routes require backend permissions | `users.py` uses `Depends(require_permission("users.view"))` for list and `Depends(require_permission("users.manage"))` for update/delete/password change. | `test_users_routes_require_backend_permissions_not_deploy_safe_admin_role_only`; full backend suite passed. | PASS |
| Roles/permissions internals are DEV/bootstrap-only | `roles.py` and `permissions.py` depend on `get_current_technical_rbac_admin()`, which allows bootstrap admin or canonical `DEV` and denies business roles. | `test_technical_rbac_dependency_allows_dev_and_bootstrap_but_denies_business_roles`, `test_roles_crud_denies_business_top_role_access_to_rbac_internals`, `test_roles_permission_matrix_denies_business_top_role_mutation`, `test_permissions_list_denies_business_top_role_access_to_rbac_internals`; full backend suite passed. | PASS |
| Bootstrap `ADMIN` role detail/mutation protected | `roles.py` calls `protect_bootstrap_admin_mutation()` in `get_user_roles()` and `assign_user_roles()`. | `test_roles_user_role_lookup_denies_bootstrap_admin_detail_access`, `test_roles_assignment_denies_bootstrap_admin_target_mutation`; full backend suite passed. | PASS |
| Permission checks eager-load role permissions | `deps.py` applies `selectinload(User.user_roles).selectinload(UserRoleAssignment.role).selectinload(Role.permissions)` in `get_current_user()`. | `test_current_user_loads_role_permissions_for_backend_permission_checks`; full backend suite passed. | PASS |
| DEV assignment remains bootstrap-only | `ensure_can_assign_role()` denies `DEV` unless actor is bootstrap admin and denies all `ADMIN` assignment; users and roles endpoints call it before mutation. | DEV/Admin assignment denial and bootstrap allowance tests in `test_rbac_access_model.py`; full backend suite passed. | PASS |
| Backend tests pass | Requested `pytest` failed because command is not on PATH; fallback venv command passed. | `PYTHONPATH=. ./.venv/bin/pytest` from `backend/`: 87 passed, 33 warnings. | PASS WITH WARNING |
| Frontend skipped only if no relevant frontend changes | `git diff --name-only` showed only backend and OpenSpec files; no frontend files are changed for PR2. | Frontend command intentionally skipped as out of scope for this backend-only slice. | PASS WITH WARNING |

### Commands Run

| Command | Workdir | Result | Evidence |
|---|---|---|---|
| `git status --short` | project root | Passed | Changed files are backend API/test files and OpenSpec task/report artifact only. |
| `git diff --stat` | project root | Passed | Diff summary shows backend/app/api/deps.py, users.py, roles.py, permissions.py, backend/tests/test_rbac_access_model.py, tasks.md. |
| `git diff --name-only` | project root | Passed | No `frontend/` paths present. |
| `pytest` | `backend/` | Failed environment command | `zsh:1: command not found: pytest`. |
| `PYTHONPATH=. ./.venv/bin/pytest` | `backend/` | Passed | `87 passed, 33 warnings in 1.59s`. |

### Risks

#### Critical

- None for the PR2 users/roles/permissions enforcement slice.

#### Warnings

- `pytest` is not available on PATH in `backend`; project venv fallback is required for local verification.
- Full backend suite passes but emits existing unrelated warnings: Pydantic class-based config deprecations and `datetime.utcnow()` deprecations.
- Frontend tests were skipped because PR2 has no frontend changes; frontend visibility remains Phase 4 / PR4 scope.

#### Suggestions

- Consider making the project verification command explicit in docs or task artifact as `PYTHONPATH=. ./.venv/bin/pytest` unless PATH is normalized.
- Keep Phase 3 permission-request/attendance object-scope requirements out of PR2 judgment; they remain unchecked tasks by design.

### Verdict

PASS WITH WARNINGS for PR2 users/roles/permissions enforcement. The warning status is due to local PATH missing `pytest`, existing unrelated warnings, and intentional frontend skip due no frontend changes.
