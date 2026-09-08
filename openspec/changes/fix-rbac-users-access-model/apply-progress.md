# Apply Progress: fix-rbac-users-access-model

**PR boundary**: PR3 slice, work unit 1 of ~4 (role split only — `user_scope_assignments`, the reclassification migration, and coarse-gate replacement are separate, later work units in the same PR3 boundary).
**Mode**: Strict TDD
**Chain strategy**: feature-branch-chain
**Base/tracker**: tracker branch `fix/rbac-users-access-model`; current branch `fix/rbac-users-access-model-users-roles`

## Completed Tasks

### Phase 1: Foundation / Migration
- [x] 1.1 RED: add canonical role, unknown-role denial, and bootstrap detection tests in `backend/tests/test_rbac_access_model.py`.
- [x] 1.2 GREEN: update `backend/app/core/config.py`, `backend/app/models/user.py`, and `backend/alembic/versions/*_canonical_rbac_roles.py`.
- [x] 1.3 RED/GREEN: test/update `backend/create_admin_user.py` and `backend/create_admin.sql` for env bootstrap repair.
- [x] 1.4 RED/GREEN: test/add permission and object-access helpers in `backend/app/api/deps.py`.

### PR1 Foundation Blocker Fixes
- [x] B1-B8 (bootstrap admin mutation protection, DEV/ADMIN assignment restriction, legacy fallback allowlist, downgrade role mapping, reserved bootstrap email, `/auth/register` guard). See prior progress (Engram #4719) for full evidence.

### Phase 2: Users / RBAC APIs
- [x] 2.1-2.4 (bootstrap denial coverage, `users.view`/`users.manage` wiring, DEV assignment restriction, roles/permissions internals restricted to bootstrap ADMIN/DEV). See prior progress (Engram #4719) for full evidence.

### Phase 3: Role Split, Scope Model, Backend Enforcement (this slice + 3.2b follow-up)
- [x] 3.1 RED: updated `backend/tests/test_rbac_access_model.py` legacy-mapping parametrize (`coordinador`→`COORDINADOR`, `secretaria`→`SECRETARIA`, `supervisor`→`COORDINADOR`) and `CANONICAL_ROLES`, plus new split-specific assertions.
- [x] 3.2 GREEN: `backend/app/models/user.py` — added `COORDINADOR`/`SECRETARIA` enum values + legacy aliases (`coordinador`, `secretaria`, `administrativo`), kept `ADMINISTRATIVO` as deprecated/non-assignable, retargeted `LEGACY_ROLE_MAPPING["coordinador"/"secretaria"/"supervisor"]` (D1/D2).
- [x] 3.2b RED/GREEN: `backend/app/api/deps.py` `ensure_can_assign_role()` now denies any `target_role` not in `ASSIGNABLE_ROLE_VALUES` (i.e. `ADMINISTRATIVO`), additive to the existing `ADMIN`/`DEV` checks. Closes the CRITICAL gap flagged by `verify-pr3-slice1-report.md` (spec scenario "Deprecated ADMINISTRATIVO is not assignable through any API" was unenforced at the API layer).

## TDD Cycle Evidence (this slice)

| Task | Test File | Layer | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|-----|-------|-------------|----------|
| 3.1 | `backend/tests/test_rbac_access_model.py` | Unit (enum/mapping) | ✅ `ImportError: cannot import name 'ASSIGNABLE_ROLE_VALUES' from 'app.models.user'` — collection failed after adding the new import + updated parametrize/`CANONICAL_ROLES`/new tests, before touching `user.py` | ✅ After `user.py` GREEN edit, `pytest tests/test_rbac_access_model.py` → 50 passed | ✅ Covers: `coordinador`→`COORDINADOR`, `secretaria`→`SECRETARIA`, `supervisor`→`COORDINADOR` (parametrize); explicit "no longer resolves to ADMINISTRATIVO" tests for both legacy values; `ADMINISTRATIVO` excluded from `ASSIGNABLE_ROLE_VALUES` while `COORDINADOR`/`SECRETARIA` are included; decoupled the frozen `202606101200` migration's own seeded-role assertion (`test_canonical_migration_seeds_roles_permissions_and_legacy_mapping`) from the now-changed module `CANONICAL_ROLES` set, since that migration is explicitly out of scope and unedited | ✅ Reused existing `_load_canonical_migration()` helper and `CANONICAL_ROLES` set pattern; no new fixtures needed |
| 3.2 | `backend/app/models/user.py` | Model / enum | (test-driven from 3.1's RED) | ✅ Added `COORDINADOR`/`SECRETARIA` canonical members, kept `ADMINISTRATIVO` with an explanatory comment referencing D1/D2 and the B5 downgrade contract, added `administrativo` legacy alias for symmetry with the other deprecated-but-present aliasing pattern, added `DEPRECATED_ROLE_VALUES`/`ASSIGNABLE_ROLE_VALUES` as the model-level non-assignability marker consumed by the new tests | ✅ Same RED cycle as 3.1 (single commit-sized change, enum+mapping are inseparable) | ✅ No behavior beyond what tests assert; did not touch `deps.py`, schemas, or endpoints (out of scope for this slice) |
| 3.2b | `backend/tests/test_rbac_access_model.py`, `backend/app/api/deps.py` | Endpoint-function / dependency guard | ✅ Added `test_users_update_denies_administrativo_role_assignment` (calls `users_endpoint.update_user` directly, `role=UserRole.ADMINISTRATIVO`) and `test_auth_register_denies_administrativo_role` (calls `auth_endpoint.register` directly, `role=UserRole.ADMINISTRATIVO`, bootstrap `ADMIN` actor). Ran `pytest tests/test_rbac_access_model.py -q -k administrativo_role` before touching `deps.py` → **2 failed** (both assignments succeeded, no `HTTPException` raised — confirms the CRITICAL gap was real and exploitable) | ✅ After adding `if canonical is None or canonical.value not in ASSIGNABLE_ROLE_VALUES: raise _permission_denied()` to `ensure_can_assign_role()` (imports `ASSIGNABLE_ROLE_VALUES` from `app.models.user`), `pytest tests/test_rbac_access_model.py -q` → **52 passed** | ✅ New checks reuses the same code path (`ensure_can_assign_role`) already exercised by `PATCH /users/{id}` and `POST /auth/register`, so both direct-API entry points are covered by construction, not just the isolated data-structure marker the verify report flagged | ✅ Additive `if` branch only; did not touch or weaken the existing `ADMIN`/`DEV` checks in the same function — both are still asserted passing by the pre-existing B2/B6/B7/B8 tests |

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `cd backend && PYTHONPATH=. ./.venv/bin/pytest tests/test_rbac_access_model.py -q` → **52 passed**, 9 warnings (pre-existing Pydantic/datetime deprecation warnings, unrelated) |
| Runtime harness command/scenario and exact result | N/A for 3.2b — `ensure_can_assign_role()` is a pure in-process dependency guard called synchronously from `update_user`/`register`; no DB row shape or migration boundary changed. (Same N/A rationale as 3.1/3.2 for the still-deferred Alembic migration, task 3.5.) |
| Rollback boundary | 3.2b touches exactly two files on top of 3.1/3.2's two: `backend/app/api/deps.py` (+3/-1 lines, single additive `if` branch) and `backend/tests/test_rbac_access_model.py` (+45/-0 lines, two new tests). Revertable independently of 3.1/3.2 via `git checkout -- backend/app/api/deps.py` plus removing the two new test functions, without touching `backend/app/models/user.py`. |

## Verification

- Safety baseline (before any edit in this session): `cd backend && PYTHONPATH=. ./.venv/bin/pytest tests/test_rbac_access_model.py` → not re-run standalone; prior progress (#4719) recorded 47 passed after PR2.
- RED (after test-file edit, before model edit): `cd backend && PYTHONPATH=. ./.venv/bin/pytest tests/test_rbac_access_model.py -q` → **collection error**, `ImportError: cannot import name 'ASSIGNABLE_ROLE_VALUES' from 'app.models.user'`.
- GREEN (after `user.py` edit): `cd backend && PYTHONPATH=. ./.venv/bin/pytest tests/test_rbac_access_model.py -q` → **50 passed**, 9 warnings.
- Full backend regression: `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q` → **90 passed**, 33 warnings (all pre-existing Pydantic/`datetime.utcnow()` deprecation warnings, none new).
- Diff size: `git diff --numstat` → `backend/app/models/user.py` +21/-5, `backend/tests/test_rbac_access_model.py` +39/-5 → **70 authored lines changed**, well inside the 400-line review budget.

### 3.2b follow-up (this apply call)

- Safety baseline: `cd backend && PYTHONPATH=. ./.venv/bin/pytest tests/test_rbac_access_model.py -q` → **50 passed**, 9 warnings (matches the state left by 3.1/3.2 above).
- RED (new tests added, `deps.py` untouched): `cd backend && PYTHONPATH=. ./.venv/bin/pytest tests/test_rbac_access_model.py -q -k "administrativo_role"` → **2 failed** — `test_users_update_denies_administrativo_role_assignment` and `test_auth_register_denies_administrativo_role` both failed because no `HTTPException` was raised (`ADMINISTRATIVO` assignment silently succeeded), confirming the CRITICAL gap from `verify-pr3-slice1-report.md` reproduces.
- GREEN (`ensure_can_assign_role()` edited in `deps.py`): `cd backend && PYTHONPATH=. ./.venv/bin/pytest tests/test_rbac_access_model.py -q` → **52 passed**, 9 warnings.
- Full backend regression: `cd backend && PYTHONPATH=. ./.venv/bin/pytest -q` → **92 passed**, 33 warnings (same pre-existing warning count/content as the 90-pass baseline; the +2 tests add no new warnings).
- Diff size (this follow-up only, on top of 3.1/3.2's already-uncommitted changes): `backend/app/api/deps.py` +3/-1, `backend/tests/test_rbac_access_model.py` +45/-0 → **49 authored lines changed** for 3.2b, well under the 400-line budget and under the 50-line target given for this slice. Cumulative `git diff --numstat` against `HEAD` for all of PR3 slice 1 + this follow-up: `backend/app/models/user.py` +21/-5, `backend/app/api/deps.py` +3/-1, `backend/tests/test_rbac_access_model.py` +84/-5 → 119 total (still well inside 400).

## Deviations from Design / Prompt Conflict (flagged, not silently resolved)

The apply prompt's numbered "Implement exactly what design.md's reclassification ladder specifies" list (items 3 and part of item 4) asked for the new Alembic migration with the D3 recovery ladder, plus tests proving migration upgrade/downgrade round-trips and the audited unscoped-`COORDINADOR` fallback. That work corresponds to `tasks.md` 3.3-3.5 (creating `UserScopeAssignment`, `positions.canonical_role`, and the migration itself with its audit-row seeding), which the same prompt's "Scope for THIS apply call" section explicitly excluded ("ONLY tasks 3.1 and 3.2 ... Do not implement tasks 3.3 onward in this call even if tasks.md describes them"), and which the prompt separately said was deliberately checkpointed for maintainer review before more code lands on top of it.

I resolved this in favor of the explicit, repeated scope boundary (3.1/3.2 only) rather than the broader numbered list, because implementing the migration without the audit table/model from 3.3-3.4 would mean either fabricating an audit mechanism outside the design's intended location or building 3.3-3.5 without them being assigned. **Not implemented in this slice**: the Alembic migration reclassifying existing `ADMINISTRATIVO` rows, the D3 recovery ladder, the audit-row logic, and the migration round-trip/audited-fallback tests. These remain open as `tasks.md` 3.3-3.5 for the next apply slice.

## Grep for AttributeError / Silent-Break Risk (task 5)

Grepped the full backend for `UserRole.ADMINISTRATIVO`, `UserRole.coordinador`, `UserRole.secretaria` outside the test file and the frozen `202606101200` migration:

- `backend/app/api/deps.py:199,219` (`get_current_coordinador_or_above`, `get_current_secretaria_or_above`) — reference `UserRole.ADMINISTRATIVO` literally. **No `AttributeError`** — `ADMINISTRATIVO` remains a valid enum member. **Silent behavior change**: users now assigned `COORDINADOR` or `SECRETARIA` (a different enum value than `ADMINISTRATIVO`) will no longer match these gates and will be denied where a legacy `ADMINISTRATIVO` user previously passed. This is the exact over-privilege root cause D10 targets for replacement in task 3.7 — expected, not accidental, but real until that task lands.
- `backend/app/api/v1/endpoints/permission_requests.py:96,151,206,318` — reference `UserRole.coordinador` (an alias, not a literal). **No `AttributeError`** — the alias now resolves to `COORDINADOR` instead of `ADMINISTRATIVO`. **Silent behavior change**: these privilege sets now match only users with the new `COORDINADOR` role; legacy `ADMINISTRATIVO`-classified users (not yet reclassified — reclassification migration is 3.5, not yet written) and `SECRETARIA` users will no longer match here. This endpoint's two-stage logic isn't implemented yet (task 3.13), so its current behavior was already provisional; this narrows an already-incomplete check further until 3.13 lands.
- Full backend test suite (`pytest`, 90 tests across all modules including `permission_requests` and `deps`-dependent endpoints) passes with this change — confirms no import-time or collection-time break anywhere in the codebase.

No other file in `backend/` references `UserRole.ADMINISTRATIVO`/`coordinador`/`secretaria`.

## Remaining Tasks (current tasks.md)

- [ ] 3.3 RED: create `backend/tests/test_user_scope_assignment.py`.
- [ ] 3.4 GREEN: create `UserScopeAssignment` model + `positions.canonical_role`.
- [ ] 3.5 GREEN: create the reclassification migration (D3 ladder, audit row, new permissions, reversible downgrade).
- [ ] 3.6 RED/GREEN: narrow `LEGACY_ADMIN_FALLBACK_ALLOWED_ROLES`.
- [ ] 3.7 RED/GREEN: add `resolve_user_scopes`/`assert_request_scope`/`require_teacher_position`; deprecate coarse gates.
- [ ] 3.8-3.15: scope admin surface, endpoint gate replacement (employees/schedules/departments/positions/locations/settings/faces/attendance), two-stage permission-request state machine, visibility rules, cross-scope denial tests.
- [ ] Phase 4 (4.1-4.7): Angular role/permission model, guards, scope admin UI.
- [ ] Phase 5 (5.1-5.3): final backend/frontend verification and cleanup.

## Risks

- The two `deps.py`/`permission_requests.py` silent-behavior changes documented above are real and will cause `COORDINADOR`/`SECRETARIA` users (once such users exist, which requires the still-unwritten migration) to be denied by the old coarse gates until task 3.7+ replaces them — this is expected sequencing per the design's own "migrate → populate scopes → enable enforcement" rollout note, but is worth the maintainer's explicit acknowledgement before 3.3-3.5 land.
- No production data exists yet with `COORDINADOR`/`SECRETARIA` roles (they didn't exist before this slice), so no live user is reclassified or newly locked out by this specific slice — the risk above only matters once the migration (3.5) actually assigns these new role values to real rows.
- Existing backend suite still emits 33 pre-existing deprecation warnings unrelated to this change.

## Resolved from Previous Verification (`verify-pr3-slice1-report.md`)

- **CRITICAL — "Deprecated ADMINISTRATIVO is not assignable through any API"**: closed by task 3.2b in this apply call. `ensure_can_assign_role()` (`backend/app/api/deps.py`) now denies any `target_role` outside `ASSIGNABLE_ROLE_VALUES`, additive to its existing `ADMIN`/`DEV` checks. Both call sites the report cited — `PATCH /users/{id}` (`users.py:90`, via `update_user`) and `POST /auth/register` (`auth.py:110`, via `register`) — call `ensure_can_assign_role()` unconditionally, so both are covered by this one guard change. Two new direct-endpoint-function tests (`test_users_update_denies_administrativo_role_assignment`, `test_auth_register_denies_administrativo_role`) reproduce the report's exact RED (silent success, no `HTTPException`) before the fix and pass after it. Scope model / migration (tasks 3.3-3.5) remains untouched, as constrained.
