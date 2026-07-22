# Design: Fix Client QA Admin Workflows

## Technical Approach

Preserve the existing uncommitted navigation fix in `schedules.component.ts` and its spec (currently 142 changed lines). Keep the visible range as signal-backed `YYYY-MM-DD` values; parse/shift/render only with UTC calendar operations. Add a narrow admin-only bulk-delete contract for `ScheduleAssignment`, then expose it through typed Angular models/service and a confirmed, single-flight action. Return the exact approved-request terminal detail only after authentication/role authorization. Browser E2E remains a required release gate.

## Architecture Decisions

| Option | Tradeoff | Decision and rationale |
|---|---|---|
| Date-only strings + UTC helpers | Requires explicit parsing helpers | **Choose.** It matches FastAPI `date`/PostgreSQL `DATE` and prevents locale/DST drift across filters, API parameters, headers, labels, and rows. |
| `DELETE /schedules/assignments/bulk` with body | Some clients handle DELETE bodies inconsistently; Angular supports them | **Choose.** `{ employee_ids, start_date, end_date }` expresses one destructive resource operation and avoids URL limits. Extend `ApiService.delete` with an optional typed body. |
| One SQL `DELETE ... RETURNING id` and commit | PostgreSQL-specific count path | **Choose.** Both employee and inclusive-date predicates are inseparable, count is `len(returned ids)`, rollback is atomic, and repeats/concurrent followers safely return `0`. |
| Backend terminal-state detail | UI already renders `err.error.detail` | **Choose.** Keep authentication and role authorization first. Only after authorization succeeds, an `approved` record returns HTTP 400 with exactly `La solicitud ya fue aprobada. Indique al colaborador que ingrese una nueva solicitud.`; unauthorized callers receive 401/403 without terminal-state disclosure. |
| Feature-branch chain | More PR coordination | **Recommend.** Estimated 860–1,140 authored changed lines exceeds 400; all slices must integrate before the E2E release gate. |

## Data Flow

    UTC range signal → calendar GET → latest response → aligned grid
           │
    selected IDs + range snapshot → confirm → DELETE bulk → DB commit
                                                   │
                         clear selections ← count ─┴→ refresh current range

The UI snapshots IDs/range before confirmation, disables duplicate submission with `deleting`, and ignores stale calendar responses using a monotonically increasing load token. Success clears row/cell selection and refreshes; cancellation or failure preserves selection and shows an actionable error. Navigation during deletion is disabled. Backend exceptions trigger rollback; logs include actor ID, employee count, range, deleted count, duration, and outcome—never tokens or employee names.

Permission approval follows `authenticate → authorize approver → load/check request state`. An authorized attempt against an already-approved request returns HTTP 400 with detail `La solicitud ya fue aprobada. Indique al colaborador que ingrese una nueva solicitud.`; authentication or authorization failure returns 401/403 before state inspection and never exposes that detail.

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/app/schemas/schedule.py` | Modify | Validated non-empty UUID list, ordered dates, count response. |
| `backend/app/api/v1/endpoints/schedules.py` | Modify | Admin-only atomic bulk delete, rollback, structured logging. |
| `backend/app/api/v1/endpoints/permission_requests.py` | Modify | Exact authorized `approved` terminal detail. |
| `backend/tests/test_schedule_bulk_delete.py` | Create | Contract/auth/scope/idempotency/concurrency/rollback tests. |
| `backend/tests/test_permission_requests.py` | Create | Exact detail and non-leakage regression. |
| `frontend/src/app/core/services/api.service.ts` | Modify | Optional DELETE body. |
| `frontend/src/app/core/{models/schedule.model.ts,services/schedule.service.ts}` | Modify | Typed delete request/response and API method. |
| `frontend/src/app/features/admin/pages/schedules/{schedules.component.ts,schedules.component.spec.ts}` | Modify | Preserve navigation fix; confirmation, single-flight delete, selection cleanup, latest refresh. |
| `frontend/src/app/features/admin/pages/permission-requests/permission-requests.component.spec.ts` | Create | Backend detail rendering regression. |
| `frontend/{package.json,playwright.config.ts,e2e/**}` | Modify/Create | Browser gate, local-only fixtures, three QA workflows. |

## Interfaces / Contracts

```text
DELETE /api/v1/schedules/assignments/bulk
Body: { employee_ids: UUID[1..], start_date: date, end_date: date }
200:  { deleted_count: integer >= 0 }
401/403: existing auth semantics; 422: malformed/empty IDs or start_date > end_date

Permission approval terminal-state response (after authentication and authorization):
400: { detail: "La solicitud ya fue aprobada. Indique al colaborador que ingrese una nueva solicitud." }
Unauthorized callers: 401/403 before terminal-state evaluation; the exact detail is not disclosed.
```

Only `schedule_assignments` matching `employee_id IN (...) AND assignment_date BETWEEN ...` are deleted; defaults, exceptions, patterns, other employees, and out-of-range rows are untouched.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Backend | Validation, admin/403, inclusive boundaries, preservation, repeat/concurrent count, forced DB failure rollback, exact approved detail/non-leakage | Async pytest/httpx with dependency overrides and PostgreSQL integration transaction. |
| Angular | UTC navigation, payload snapshot, cancel, duplicate suppression, success clear/refresh, error preservation, stale-load rejection, terminal detail | Karma/Jasmine service/component tests. |
| Browser E2E | Cancelled deletion sends no request; confirmed deletion; repeated identical deletion succeeds with `deleted_count: 0`; preservation of unselected employees, out-of-range assignments, patterns, defaults, and exceptions; week navigation; exact already-approved message `La solicitud ya fue aprobada. Indique al colaborador que ingrese una nueva solicitud.` | Playwright role/label selectors. API fixtures require localhost/127.0.0.1 plus `E2E_ALLOW_MUTATION=1`, use unique run IDs, record created UUIDs, and delete only that manifest in fixture teardown/finally. This suite remains a required release gate. |

## Threat Matrix

| Boundary | Applicability | Design response / RED tests |
|---|---|---|
| Documentation-like paths | N/A — no executable classification | None. |
| Git repository selection | N/A — no Git automation | None. |
| Commit state | N/A — no commit automation | None. |
| Push state | N/A — no push automation | None. |
| PR commands | N/A — chain is planning only, not command composition | None. |

## Migration / Rollout

No data migration required. Forecast: **860–1,140 authored changed lines total**, exactly the sum of the proposed ≤400-line slices: **PR1 (320–390)** existing navigation + backend delete contract/tests; **PR2 (260–360)** Angular delete UX + permission detail/tests; **PR3 (280–390)** Playwright harness, guarded fixtures, three E2E flows, integration gate. Each slice retains its tests and independent rollback; `sdd-tasks` must refine counts before apply. If the E2E harness and flows are forecast above 400 before implementation, split PR3 into separate harness/fixture and workflow/integration slices, each independently capped at 400, rather than accepting a size exception.

## Open Questions

None.
