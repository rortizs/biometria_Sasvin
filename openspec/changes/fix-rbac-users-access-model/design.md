# Design: Fix RBAC Users Access Model

## Technical Approach

Backend-enforced permissions from the RBAC tables (`roles`, `permissions`, `role_permissions`, `user_roles`) remain the authorization source (PR1/PR2, shipped). This revision corrects the **role taxonomy** and the **permission-request workflow**: `ADMINISTRATIVO` collapsed two real business roles (Coordinador, Secretaría) with different duties and different approval stages, and `DIRECTOR` was modelled as an approver when it is read-only + notified. Phase 3/4 therefore adds two canonical roles, an organizational scope model, and a scope-aware two-stage state machine on top of the existing `permission_requests` columns.

## Architecture Decisions

| # | Decision | Choice | Alternatives rejected | Rationale |
|---|---|---|---|---|
| D1 | Role taxonomy | Split into canonical `COORDINADOR` and `SECRETARIA`; keep `ADMINISTRATIVO` in the enum as **deprecated, non-assignable** | Umbrella `ADMINISTRATIVO` with subroles; hard-drop the value | Two distinct permission sets and two distinct approval stages cannot share one role without reintroducing over-privilege. PostgreSQL cannot `DROP VALUE` from an enum, so the deprecated value stays to avoid a type rebuild and to keep the Phase-1 downgrade path intact. |
| D2 | Legacy aliases | `UserRole.coordinador = "COORDINADOR"`, `UserRole.secretaria = "SECRETARIA"`, `UserRole.administrativo = "ADMINISTRATIVO"`; `LEGACY_ROLE_MAPPING` maps `coordinador→COORDINADOR`, `secretaria→SECRETARIA`, `supervisor→COORDINADOR` | Drop legacy aliases | Existing endpoints/schemas import `UserRole.coordinador`; today it *is* `ADMINISTRATIVO`, so the split silently changes comparison semantics — which is the intended fix, but every call site and the merged assertions in `tests/test_rbac_access_model.py` must be updated in the same slice. |
| D3 | Reclassifying already-migrated `ADMINISTRATIVO` rows | Deterministic ladder: (1) surviving `roles.name` in `user_roles`, (2) `positions.canonical_role` via `users.employee_id`, (3) fallback `COORDINADOR` **with no scope assignment** + audit row | Fallback to `SECRETARIA`; block migration on ambiguity | The Phase-1 migration already erased the coordinador/secretaria distinction where applied. `COORDINADOR` without scope resolves zero requests and holds no employee-write permission, so it is the least-privilege landing spot; the audit row makes manual repair explicit. |
| D4 | Organizational scope | New table `user_scope_assignments(id, user_id, department_id?, location_id?, director_user_id?, created_at)` with a CHECK that exactly one target is set and a unique index on the triple | FK columns on `users` (1:1 only); three separate tables | One admin surface serves coordinador→facultad/sede, director→facultad/sede (notifications) and secretaria→director, supports 1:N, and keeps real FK integrity instead of a polymorphic `scope_id`. |
| D5 | Teacher side of the scope | Reuse existing `employees.department_id` (facultad) and `employees.location_id` (sede) | New `employees.faculty_id` | Columns already exist and are populated; adding a parallel field would duplicate truth. |
| D6 | Teacher-only employee writes | Add nullable `positions.canonical_role`; `SECRETARIA` may create/update an employee only when the target position maps to `CATEDRATICO` | String match on `positions.name`; new `employees.employee_type` enum | Reuses the existing Position taxonomy, one nullable column, no employee-row backfill, no brittle string matching. |
| D7 | Stage-2 actor | `SECRETARIA` assigned to the scope's `DIRECTOR` performs stage 2; `DIRECTOR` gets read + notification only | Director approves; either role approves | Matches the business rule; keeps DB columns `director_reviewed_by/_at/_notes` and `RejectionStage.director` unchanged (documented as "stage 2, executed by the director's secretaría") to avoid an enum/column rename across merged code. |
| D8 | Mandatory justification | Stage-2 approve **and** reject require non-empty justification, enforced in the endpoint (422), persisted to `director_notes` / `rejection_reason` | Pydantic-required `notes` on the shared schema | The same schema serves stage 1 (optional notes); stage-aware validation avoids breaking stage-1 callers. |
| D9 | Legacy admin fallback allowlist | Narrow `LEGACY_ADMIN_FALLBACK_ALLOWED_ROLES` to `{DECANO, DUEÑO}` | Keep `DIRECTOR`/`ADMINISTRATIVO` | `DIRECTOR` is now read-only and `ADMINISTRATIVO` is deprecated; neither is a valid landing role for a legacy admin. |
| D10 | Retire the coarse role gates | Replace `get_current_secretaria_or_above` / `get_current_coordinador_or_above` / `get_current_active_admin` usages with `require_permission(...)` + object-scope assertions | Keep the gates and tighten their role sets | These three gates are the actual over-privilege root cause: `get_current_secretaria_or_above` grants `ADMINISTRATIVO`/`DIRECTOR` write access to employees, positions, schedules, departments and locations. |

## Corrected Role Matrix (target)

| Role | Dashboard | Attendance reports | Employees | Permission requests |
|---|---|---|---|---|
| `DECANO` / `DUEÑO` | read | read | none | none |
| `DIRECTOR` | read | read | none | read + notified (no decision) |
| `COORDINADOR` | read | read (no export/edit) | none | **stage a1** approve/deny, scoped to own facultad/sede |
| `SECRETARIA` | read | read | create/update **catedrático only** | **stage a2** approve/deny with mandatory justification |
| `CATEDRATICO` | own | own | none | create own + read own status |

## Two-Stage State Machine

    pending ──approve(COORDINADOR, scope match)──▶ coordinator_approved ──approve(SECRETARIA of scope DIRECTOR, justification)──▶ approved ──▶ ScheduleException + notify requester
       │                                                 │
       │ reject(COORDINADOR, reason)                     │ reject(SECRETARIA, justification)
       ▼                                                 ▼
    rejected(stage=coordinator)                       rejected(stage=director)

Notification points: on `pending` → scoped `COORDINADOR`; on `coordinator_approved` → requester, scoped `DIRECTOR` (read-only), assigned `SECRETARIA`; on `approved`/`rejected` → requester with justification. `approved` and `rejected` are terminal; owner-initiated `DELETE` stays restricted to `pending`.

Scope resolution: `request.employee → (department_id, location_id) → user_scope_assignments` gives the eligible coordinadores and directores; `director_user_id` rows give the eligible secretarías. Any unresolved link **fails closed** (403), never falls back to global access.

## Data Flow

    JWT ─▶ get_current_user (roles+permissions eager-loaded)
        ─▶ require_permission("permission_requests.approve.stage1|stage2")
        ─▶ assert_request_scope(actor, request)   # user_scope_assignments ∩ employee scope
        ─▶ transition + mandatory justification   ─▶ notify_user(...) ─▶ AuditLog

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/app/models/user.py` | Modify | Add `COORDINADOR`/`SECRETARIA`, deprecate `ADMINISTRATIVO`, retarget legacy aliases and `LEGACY_ROLE_MAPPING`. |
| `backend/app/models/user_scope_assignment.py` | Create | `UserScopeAssignment` model (D4). |
| `backend/app/models/position.py` | Modify | Add `canonical_role` column (D6). |
| `backend/alembic/versions/*_split_administrativo_and_scopes.py` | Create | Enum values, reclassification ladder (D3), `user_scope_assignments`, `positions.canonical_role`, new permission rows; reversible downgrade merging both roles back to `ADMINISTRATIVO`. |
| `backend/app/core/config.py` | Modify | Narrow the fallback allowlist (D9). |
| `backend/app/api/deps.py` | Modify | Add `assert_request_scope`, `resolve_user_scopes`, `require_teacher_position`; deprecate the three coarse gates (D10). |
| `backend/app/api/v1/endpoints/permission_requests.py` | Modify | Scope-aware two-stage transitions, mandatory stage-2 justification, scoped list/detail visibility, director read-only notification. |
| `backend/app/api/v1/endpoints/{employees,schedules,departments,positions,locations,settings,attendance,faces}.py` | Modify | Replace coarse gates with permission + object-scope dependencies. |
| `backend/app/api/v1/endpoints/user_scopes.py` (or `users.py`) | Create/Modify | Admin surface to manage scope assignments. |
| `backend/tests/test_rbac_access_model.py` | Modify | Update the merged legacy-mapping assertions (lines ~36, 124-126, 799) to the split taxonomy. |
| `frontend/src/app/core/models/user.model.ts` | Modify | Replace the legacy lowercase `UserRole` union with canonical roles + permissions. |
| `frontend/.../permission-requests`, `dashboard`, `attendance` | Modify | Stage-aware actions, mandatory justification field, director read-only view, coordinador export hidden. |

## Interfaces / Contracts

```python
CanonicalRole = Literal["ADMIN","DEV","DECANO","DUEÑO","DIRECTOR",
                        "COORDINADOR","SECRETARIA","CATEDRATICO","ESTUDIANTE","PADRES"]
# deprecated, non-assignable: "ADMINISTRATIVO"

def resolve_user_scopes(user) -> ScopeSet: ...          # departments, locations, directors
def assert_request_scope(actor, request, stage: int) -> None: ...  # 403 fail-closed
```

New permission codes: `dashboard.view`, `reports.attendance.view`, `reports.attendance.export`, `permission_requests.create`, `permission_requests.view.scope`, `permission_requests.approve.stage1`, `permission_requests.approve.stage2`, `employees.manage.catedratico`, `attendance.mark.self`, `user_scopes.manage`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Backend unit | Split enum + legacy mapping, reclassification ladder, scope resolution, teacher-position guard | Strict TDD, pytest, extend `tests/test_rbac_access_model.py` |
| Backend integration | Stage a1/a2 authorization, cross-scope denial, director cannot approve, missing justification 422, coordinador export denial | pytest + httpx direct API calls |
| Frontend unit | Canonical role union, stage-aware buttons, director read-only, justification required | `npm test -- --watch=false` |

## Threat Matrix

N/A — no shell command, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. HTTP route authorization is covered by the fail-closed scenarios in `specs/rbac-access-model` and `specs/permission-request-workflow`.

## Migration / Rollout

New Alembic revision on top of `202606101200`. Upgrade: add enum values, create `user_scope_assignments` and `positions.canonical_role`, reclassify `ADMINISTRATIVO` rows via the D3 ladder, seed the new permissions and role grants, resync `user_roles`. Downgrade: map `COORDINADOR`/`SECRETARIA` back to `ADMINISTRATIVO`, drop the new table/column and the new permission rows, preserving role assignments (same contract as Phase-1 blocker B5). Deploy backend before frontend. **Scope assignments must be populated before the coordinador/secretaría enforcement is enabled**, otherwise every stage transition fails closed — stage the rollout as: migrate → populate scopes → enable enforcement.

## Open Questions

- [x] **(blocking for tasks)** Secretaría↔Director cardinality: this design assumes an explicit assignment relation (`user_scope_assignments.director_user_id`) allowing 1:N in both directions, with a *single* `SECRETARIA` role behaving identically for every director it is assigned to. **Confirmed by maintainer** — implemented in PR12 (task 3.13).
- [x] Do `DECANO`/`DUEÑO` retain any permission-request visibility? This design says no (fail closed), since the stated rules mention only reports and dashboard. **Implemented** — `Permission Request Visibility` spec's explicit allow-list excludes `DECANO`/`DUEÑO`.
- [x] Is the coordinador scope facultad (`department`), sede (`location`), or both simultaneously? The model supports both; enforcement assumes union-match. **Implemented** — stage 1/stage 2 scope resolution in `permission_requests.py` (task 3.13) uses union-match.
