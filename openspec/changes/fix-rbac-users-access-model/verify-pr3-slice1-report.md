## Verification Report

**Change**: `fix-rbac-users-access-model`
**Slice**: PR3 work unit 1 of ~4 — `UserRole` enum split only (tasks 3.1, 3.2). Tasks 3.3-3.15 are intentionally not started and are NOT evaluated as missing/incomplete in this report; they are only referenced where apply-progress.md or the code makes a claim about them that needed checking.
**Branch**: `fix/rbac-users-access-model-users-roles`
**Verifier**: dedicated `sdd-verify` executor sub-agent
**Strict TDD**: ACTIVE, enforced by artifact/test evidence
**Verdict**: PASS WITH WARNINGS (one CRITICAL gap flagged below — see "Verdict rationale")

Note on filename: named `verify-pr3-slice1-report.md` (not `verify-pr3-report.md`) because this checkpoint covers only work unit 1/~4 of PR3; a future full-PR3 verification pass should use a separate `verify-pr3-report.md` to avoid overwriting this slice-specific record.

### Scope Verified

- `backend/app/models/user.py`: `UserRole` enum split (`COORDINADOR`/`SECRETARIA` added as first-class canonical members), `ADMINISTRATIVO` kept as a deprecated, non-assignable enum value, `LEGACY_ROLE_MAPPING` retargeted so `coordinador`→`COORDINADOR`, `secretaria`→`SECRETARIA`, `supervisor`→`COORDINADOR` (previously all three collapsed to `ADMINISTRATIVO`).
- `backend/tests/test_rbac_access_model.py`: updated legacy-mapping parametrize, new `CANONICAL_ROLES` set, new split-specific unit tests, decoupled frozen-migration seeded-role assertion.
- Full backend regression suite (90 tests) for collateral breakage.
- B5 Alembic downgrade contract (frozen migration `202606101200`) for unintended interaction with the enum split.
- The `deps.py` / `permission_requests.py` silent-narrowing risk apply-progress.md self-flagged.

### Artifact Evidence

- Read `openspec/changes/fix-rbac-users-access-model/specs/rbac-access-model/spec.md` (`Canonical Roles`, `Legacy Role Migration Compatibility` requirements).
- Read `openspec/changes/fix-rbac-users-access-model/tasks.md` (tasks 3.1, 3.2 and their spec linkage).
- Read `openspec/changes/fix-rbac-users-access-model/apply-progress.md` (TDD Cycle Evidence, Deviations, Issues/Risks sections).
- Read `openspec/changes/fix-rbac-users-access-model/design.md` (D1/D2, B5 downgrade contract).
- Read `backend/app/models/user.py`, `backend/tests/test_rbac_access_model.py` in full.
- Read `backend/app/api/deps.py` (`ensure_can_assign_role`, `get_current_coordinador_or_above`, `get_current_secretaria_or_above`), `backend/app/api/v1/endpoints/users.py`, `backend/app/schemas/user.py`, `backend/app/schemas/role.py`, `backend/app/api/v1/endpoints/permission_requests.py`.
- Read frozen migration `backend/alembic/versions/202606101200_canonical_rbac_roles.py` (upgrade/downgrade SQL).
- Ran `git diff HEAD -- backend/app/models/user.py backend/tests/test_rbac_access_model.py` and `git diff --numstat`/`--stat` for the same two files.

### Requirement Mapping

| Spec requirement / scenario | Implementation evidence | Runtime test evidence | Result |
|---|---|---|---|
| Canonical Roles — canonical list includes `COORDINADOR`/`SECRETARIA` split | `UserRole` enum in `user.py` adds `COORDINADOR = "COORDINADOR"`, `SECRETARIA = "SECRETARIA"` as first-class members. | `test_user_role_enum_exposes_only_canonical_values_with_legacy_aliases` (asserts `{role.value for role in UserRole} == CANONICAL_ROLES`, which now includes both). | PASS |
| Canonical Roles — `ADMINISTRATIVO` "MUST remain defined at the database enum level ... MUST NOT be assignable to any user through any API" | `DEPRECATED_ROLE_VALUES`/`ASSIGNABLE_ROLE_VALUES` are real (non-decorative) module-level constants in `user.py` excluding `ADMINISTRATIVO`. **However, nothing in the codebase consumes `ASSIGNABLE_ROLE_VALUES`.** `UserBase.role: UserRole` (schemas/user.py) accepts any enum member including `ADMINISTRATIVO`; `ensure_can_assign_role()` (deps.py:83) only blocks `ADMIN` and unauthorized `DEV` — it does not check `ASSIGNABLE_ROLE_VALUES`. `PUT /users/{id}` (users.py:88-90) and `POST /auth/register` (auth.py:110) both call only `ensure_can_assign_role`, so a direct API request with `role: "ADMINISTRATIVO"` passes Pydantic validation and passes the assignment guard today. | `test_administrativo_is_excluded_from_assignable_role_values` only asserts the data-structure marker (`ADMINISTRATIVO.value not in ASSIGNABLE_ROLE_VALUES`) in isolation — it never calls an endpoint. No test in the file exercises `PUT /users`, `POST /auth/register`, or any other route with `role="ADMINISTRATIVO"` and asserts a 4xx rejection. | **CRITICAL — UNTESTED at the API layer, and the underlying behavior does not exist yet.** The scenario's GIVEN/WHEN is explicitly "a direct API request" — a readiness marker with zero call sites does not satisfy a MUST-level API-enforcement requirement. |
| Legacy Role Migration Compatibility — "a user with legacy role `coordinador` MUST receive canonical role `COORDINADOR`" | `LEGACY_ROLE_MAPPING["coordinador"] = "COORDINADOR"` in `user.py`. | `test_known_legacy_roles_map_to_canonical_roles[coordinador-...]`, `test_legacy_coordinador_no_longer_resolves_to_administrativo` — both pass. | PASS |
| Legacy Role Migration Compatibility — "a user with legacy role `secretaria` MUST receive canonical role `SECRETARIA`" | `LEGACY_ROLE_MAPPING["secretaria"] = "SECRETARIA"` in `user.py`. | `test_known_legacy_roles_map_to_canonical_roles[secretaria-...]`, `test_legacy_secretaria_no_longer_resolves_to_administrativo` — both pass. | PASS |
| Legacy Role Migration Compatibility — "a user with legacy role `supervisor` MUST receive canonical role `COORDINADOR`" | `LEGACY_ROLE_MAPPING["supervisor"] = "COORDINADOR"` in `user.py`. | `test_known_legacy_roles_map_to_canonical_roles[supervisor-...]` — passes. | PASS |
| Legacy Role Migration Compatibility — ambiguous-migration reclassification ladder, audit record (task 3.3-3.5 territory) | Not implemented in this slice; not claimed as implemented by apply-progress.md. | N/A — correctly out of scope. | SKIPPED (by design, not a gap in this slice) |

### TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | `apply-progress.md` includes a "TDD Cycle Evidence" table for 3.1/3.2. |
| All tasks have tests | ✅ | Both 3.1 and 3.2 map to `test_rbac_access_model.py`. |
| RED confirmed (tests exist) | ✅ | Verified the reported RED (`ImportError: cannot import name 'ASSIGNABLE_ROLE_VALUES'`) is consistent with the current file needing that import; test file exists and imports it at line 21. |
| GREEN confirmed (tests pass) | ✅ | Independently ran `pytest tests/test_rbac_access_model.py -q` → **50 passed**, matches claim exactly. |
| Triangulation adequate | ⚠️ | Legacy-mapping triangulated well (3 parametrize cases + 2 dedicated negative tests). The `ADMINISTRATIVO` non-assignability claim is triangulated only at the data-structure level (1 test, 4 assertions) — zero triangulation at the API-behavior level the spec scenario actually describes. |
| Safety Net for modified files | ✅ | Full suite run before/after per apply-progress.md; independently reproduced full-suite pass below. |

**TDD Compliance**: 5/6 checks fully passed — the triangulation gap tracks directly to the CRITICAL finding above (the test only proves a marker exists, not that any request path enforces it).

### Assertion Quality

No tautologies, ghost loops, or assertion-without-production-call patterns found in the diff. `test_administrativo_is_excluded_from_assignable_role_values` is a real, non-trivial assertion (checks 4 distinct enum-membership facts) — but it is scoped narrowly to the data structure, not to any code path that acts on it. This is not an assertion-quality defect per se; it is a coverage-scope gap, captured in the Requirement Mapping table above rather than double-counted here.

**Assertion quality**: ✅ No trivial/meaningless assertions found; the CRITICAL finding is a coverage gap, not an assertion-quality defect.

### Command Verification (independently executed, not trusted from apply-progress.md)

| Command | Workdir | Result | Evidence |
|---|---|---|---|
| `PYTHONPATH=. ./.venv/bin/pytest tests/test_rbac_access_model.py -q` | `backend/` | Passed | **50 passed, 9 warnings** — matches apply-progress.md's claim exactly. |
| `PYTHONPATH=. ./.venv/bin/pytest -q` | `backend/` | Passed | **90 passed, 33 warnings** — matches apply-progress.md's claim exactly. |
| `git diff HEAD --numstat -- backend/app/models/user.py backend/tests/test_rbac_access_model.py` | project root | Passed | `user.py`: 21 insertions / 5 deletions. `test_rbac_access_model.py`: 39 insertions / 5 deletions. Total = 60 insertions + 10 deletions = **70 authored lines changed**, matching apply-progress.md's claim exactly. Well inside the 400-line review budget. |
| `git status --short` | project root | Passed | Only `backend/app/models/user.py` and `backend/tests/test_rbac_access_model.py` are modified for this slice among tracked RBAC files; other modified paths (`attendance.component.ts`, several `openspec/` files) predate this slice and are outside its rollback boundary. Confirms the claimed 2-file rollback boundary. |

### Deep-Dive Findings

**1. `ASSIGNABLE_ROLE_VALUES` is a real, non-decorative mechanism but has zero production call sites (CRITICAL).**
`grep -rn "ASSIGNABLE_ROLE_VALUES" backend --type py` returns exactly 3 hits: its definition in `user.py`, and 2 references inside `test_rbac_access_model.py`. No schema validator, no endpoint, no `ensure_can_assign_role` branch consumes it. Concretely: `UserUpdate.role: UserRole | None` (schemas/user.py:30) accepts `"ADMINISTRATIVO"` as valid input (it's still a defined enum member for backward compatibility, per D1), and `ensure_can_assign_role()` (deps.py:83-87) only special-cases `ADMIN`/`DEV`. Traced both call sites that gate role mutation — `users.py:90` (`PUT /users/{id}`) and `auth.py:110` (`POST /auth/register`) — and confirmed neither adds any additional check. Today, an authorized actor with `users.manage` permission sending `PUT /users/{id}` with `{"role": "ADMINISTRATIVO"}` would succeed, in direct contradiction of the spec's "MUST NOT be assignable to any user through any API." This is exploitable now — it does not require the future migration (task 3.5) to land, since `ADMINISTRATIVO` is already a live PostgreSQL enum value from the frozen `202606101200` migration.
Recommendation: add an explicit check (e.g., in `ensure_can_assign_role()`) that rejects any `target_role` not in `ASSIGNABLE_ROLE_VALUES`, plus an endpoint-level test (`PUT /users/{id}` and `POST /auth/register` with `role="ADMINISTRATIVO"` → 4xx). This should be tracked as a task before this spec scenario can be marked done — it is currently untracked in `tasks.md` 3.3-3.15 as written.

**2. `LEGACY_ROLE_MAPPING` retargeting is genuine, not cosmetic.**
Confirmed via direct diff read: `"coordinador": "COORDINADOR"`, `"secretaria": "SECRETARIA"`, `"supervisor": "COORDINADOR"` (previously all three mapped to `"ADMINISTRATIVO"`). Verified against `canonical_role_from_value()` behavior through passing tests `test_legacy_coordinador_no_longer_resolves_to_administrativo` and `test_legacy_secretaria_no_longer_resolves_to_administrativo`, which explicitly assert `is not UserRole.ADMINISTRATIVO`.

**3. Frozen-migration test decoupling is a legitimate narrowing, not a tautology weakening.**
Read the actual diff on `test_canonical_migration_seeds_roles_permissions_and_legacy_mapping`: the assertion changed from `role_names == CANONICAL_ROLES` to `role_names == (CANONICAL_ROLES - {"COORDINADOR", "SECRETARIA"})`. This still asserts full-set equality against the migration's actual seeded roles (9 real role names checked, not vacuous) — it now correctly reflects that migration `202606101200` is frozen history predating the split and seeds only the pre-split 9 roles. Not a tautology; not weakened into `True == True`. Confirmed the migration itself was not touched (`LEGACY_ROLE_MAPPING["coordinador"] == "ADMINISTRATIVO"` assertion on the frozen migration module still passes, correctly, since that file is untouched).

**4. B5 downgrade contract is genuinely unaffected.**
Read `alembic/versions/202606101200_canonical_rbac_roles.py` `downgrade()` in full: it operates via raw SQL string literals against the Postgres `userrole` enum type (`WHEN role::text = 'ADMINISTRATIVO' THEN 'coordinador'::userrole`, etc.) and never references `COORDINADOR`/`SECRETARIA` as Python enum members or DB enum labels. The Postgres `userrole` type does not yet have `COORDINADOR`/`SECRETARIA` added as valid labels (that only happens when the future migration in task 3.5 runs `ALTER TYPE ... ADD VALUE`), so nothing in this slice's Python-level enum change can interact with the frozen migration's SQL at all — they operate on different layers (Python enum vs. Postgres enum type) that are currently out of sync by design pending 3.5. Confirmed no risk to the documented downgrade-to-`ADMINISTRATIVO` contract.

**5. `deps.py` / `permission_requests.py` silent-narrowing risk is real and accurately scoped by apply-progress.md.**
Confirmed at cited line numbers: `deps.py:199` and `deps.py:219` (`get_current_coordinador_or_above`, `get_current_secretaria_or_above`) both still reference `UserRole.ADMINISTRATIVO` literally in their `allowed` sets — no `AttributeError` (the member still exists), but a user newly assigned `COORDINADOR`/`SECRETARIA` (not yet possible in production — see point 4) would not match these gates. `permission_requests.py:96,151,206,318` reference `UserRole.coordinador` (the alias), which now resolves to `COORDINADOR` instead of `ADMINISTRATIVO` — confirmed via grep at exactly those 4 lines. apply-progress.md's claim that "no live production impact yet since no migration ran" is accurate: the Postgres `userrole` type doesn't have `COORDINADOR`/`SECRETARIA` as valid values yet, so no real row can currently hold those values (any attempt would raise a DB-level invalid-enum-label error, not a clean assignment). This is consistent with, and does not change, finding #1's severity — finding #1 is about `ADMINISTRATIVO` (already live in the DB today), not about `COORDINADOR`/`SECRETARIA` (not yet reachable at the DB layer).

### Issues Found

**CRITICAL**
- Spec scenario "Deprecated ADMINISTRATIVO is not assignable through any API" (rbac-access-model, Canonical Roles) is not actually enforced by any endpoint. `ASSIGNABLE_ROLE_VALUES` exists but is unconsumed; `PUT /users/{id}` and `POST /auth/register` would currently accept `role: "ADMINISTRATIVO"`. This is exploitable today, independent of the still-unwritten migration (task 3.5), because `ADMINISTRATIVO` is already a live database enum value. No covering runtime test exists at the API layer — the only test is a data-structure-only unit check.

**WARNING**
- `tasks.md` 3.3-3.15 do not appear to contain an explicit task for wiring `ASSIGNABLE_ROLE_VALUES` enforcement into `ensure_can_assign_role()` or an equivalent guard. Unless this is folded implicitly into an existing task (e.g., 3.6/3.7), it should be added explicitly so the CRITICAL above has a tracked landing spot before this change is archived.
- `apply-progress.md`'s TDD Cycle Evidence table describes the marker as "consumed by the new tests" without noting that no production code consumes it — technically accurate (it doesn't over-claim API enforcement) but the omission makes the gap easy to miss on a fast read; a future apply-progress report for this area should state explicitly "not yet wired into any endpoint" the way this report now does.

**SUGGESTION**
- Once task 3.5's migration adds `COORDINADOR`/`SECRETARIA` to the Postgres `userrole` type, consider a defensive integration test that a direct DB write of an unsupported/removed role label fails cleanly (documentation only — not blocking).

### Verdict rationale

Tasks 3.1 and 3.2 are complete as scoped (model/enum split + legacy-mapping retarget), all 50 focused tests and all 90 full-suite tests pass on independent re-run, the diff size claim (70 lines) is exact, the frozen-migration test change is a legitimate narrowing (not a tautology), and the B5 downgrade contract is confirmed unaffected. These are solid foundations for the next slice.

The one CRITICAL finding — the `ADMINISTRATIVO` non-assignability spec scenario has a real marker but zero enforcement and zero API-level test coverage — is a genuine gap against a MUST-level spec requirement that this slice's own task linkage (tasks.md 3.2) claims to address. It does not block 3.3-3.5 (the scope-table/migration work) from proceeding, since it is orthogonal to the reclassification ladder and does not touch the same files, but it should be tracked as an explicit task (recommend inserting before or alongside 3.6-3.7) and closed with an endpoint-level test before this change is archived as complete.

**Verdict: PASS WITH WARNINGS** for tasks 3.1/3.2 as literally scoped (model + tests, all passing); **one CRITICAL requirement gap flagged** for the maintainer's attention regarding the broader "Deprecated ADMINISTRATIVO is not assignable through any API" scenario, which needs a tracked follow-up task, not a re-do of this slice.
