## Exploration: fix-client-qa-admin-workflows

### Current State
The isolated worktree is based on `origin/main` at `275193e` and has only the intended, uncommitted TDD navigation change in `schedules.component.ts` and its spec. The fix introduces a signal-backed calendar range, UTC date-only parsing/formatting, and symmetric seven-day navigation so API parameters, headers, labels, and returned rows remain aligned. The prior implementation mixed `new Date('YYYY-MM-DD')`, local date mutation, and stale filter-derived computed values, which explains timezone drift and navigation desynchronization.

Schedule assignments currently support single-row delete (admin-only) and bulk upsert (`POST /schedules/assignments/bulk`) for secretaria-or-above. The bulk schema accepts explicit employee UUIDs and explicit `date` values; the model has a database uniqueness constraint on `(employee_id, assignment_date)`. There is no range-scoped bulk delete endpoint or frontend action. The calendar endpoint already accepts inclusive `start_date`/`end_date` date-only query parameters and returns date-only day values.

Permission approval is a two-stage state machine: `pending -> coordinator_approved -> approved`. The backend currently returns the generic `No se puede aprobar en el estado actual` for an already-approved request, while the Angular admin page displays `err.error.detail`; therefore the requested Spanish message can be implemented as a backend 400 detail and will surface in the existing UI error area. No Playwright/browser E2E setup or schedule-specific backend tests were found; current automated coverage is Angular Karma/Jasmine plus general pytest infrastructure.

### Affected Areas
- `frontend/src/app/features/admin/pages/schedules/schedules.component.ts` — add visible-range bulk-delete action, explicit confirmation, loading/error handling, selection cleanup, and refresh; preserve the uncommitted navigation fix.
- `frontend/src/app/features/admin/pages/schedules/schedules.component.spec.ts` — extend unit coverage for delete payload, confirmation, refresh, and range boundaries.
- `frontend/src/app/core/services/schedule.service.ts` — expose the new range-scoped bulk-delete contract.
- `frontend/src/app/core/models/schedule.model.ts` — add request/response types if the endpoint returns counts or an idempotency result.
- `backend/app/schemas/schedule.py` — define a validated delete request with employee IDs and inclusive start/end dates; reject empty IDs, invalid ranges, and malformed UUID/date input.
- `backend/app/api/v1/endpoints/schedules.py` — add an admin-authorized atomic bulk delete filtered by selected employees and inclusive visible range; ensure no exception/default schedule rows are touched.
- `backend/app/models/schedule.py` — likely no change; the existing unique constraint supports idempotent repeated deletes.
- `backend/app/api/v1/endpoints/permission_requests.py` — return the exact requested message for `approved` (and any other terminal state policy must remain explicit).
- `frontend/src/app/features/admin/pages/permission-requests/permission-requests.component.ts` — existing error rendering is compatible; add a focused regression spec if this component has/gets test coverage.
- `backend/tests/` — add endpoint tests for authorization, inclusive boundaries, out-of-range preservation, atomic rollback, and repeated deletion.
- `frontend/` E2E tooling — establish a browser E2E runner/config or use the repository-approved browser harness; no existing Playwright config/specs were found.

### Approaches
1. **Explicit employee IDs + inclusive visible date range bulk delete** — `DELETE /schedules/assignments/bulk` with `{ employee_ids, start_date, end_date }`, one transaction, admin-only, delete only `ScheduleAssignment` rows matching both predicates.
   - Pros: directly expresses the issue scope; prevents pattern-based or out-of-range deletion; naturally idempotent (`0` deleted on repeat); one atomic SQL statement/transaction; easy to authorize and test.
   - Cons: requires a new schema/service/UI contract and a confirmation UX; must define whether empty selected IDs is 422 or a no-op.
   - Effort: Medium

2. **Frontend list-then-delete each assignment** — fetch visible assignments, call existing `DELETE /assignments/{id}` per row.
   - Pros: reuses an existing endpoint.
   - Cons: non-atomic, race-prone, many requests, partial failure leaves an ambiguous calendar, and can accidentally drift from the visible range between fetch and delete.
   - Effort: Medium initially, High to make safe

3. **Generic filter/pattern deletion endpoint** — accept optional employee/date/pattern filters.
   - Pros: reusable for future administration tools.
   - Cons: violates the narrow issue boundary and increases risk of accidental pattern or out-of-range deletion; weaker contract and harder confirmation semantics.
   - Effort: High

### Recommendation
Use approach 1. Make the endpoint admin-only, validate non-empty employee IDs and `start_date <= end_date`, apply both employee and inclusive date predicates to `ScheduleAssignment` only, execute a single transaction, and return a deterministic deleted count. Treat repeated identical requests as successful no-ops. The UI should derive the range from the current calendar range, require explicit `window.confirm` text naming employees and dates, call the endpoint once, clear employee/cell selection, then reload the calendar. Keep the existing navigation patch unchanged and test it across a timezone-sensitive boundary.

For already-approved requests, return exactly: `La solicitud ya fue aprobada. Indique al colaborador que ingrese una nueva solicitud.` Keep the status-machine authorization checks before terminal-state handling only if they are intentional; otherwise ensure an authorized admin/coordinator-facing request gets the clear message and unauthorized users cannot use it to infer protected workflow details.

### Risks
- The current backend bulk upsert loops and commits once but does not explicitly guard concurrent duplicate creation beyond the database uniqueness constraint; the new delete is safer as one SQL delete, but tests should cover concurrent/repeated requests and transaction rollback.
- Date-only values must remain Python `date`/PostgreSQL `DATE` and must not be converted through local-time `Date` parsing in the browser. The existing `today` comparison uses UTC, which is consistent but should be documented/tested at timezone boundaries.
- Selection currently persists across week navigation; bulk deletion must use the visible range at confirmation/call time and must not infer dates from selected cells or schedule patterns.
- Existing assignment deletion is admin-only, while creation is secretaria-or-above; the new endpoint must not accidentally inherit the weaker dependency.
- No browser E2E harness exists in this worktree. Adding/configuring one plus fixtures and cleanup can exceed the 400-line review budget; forecast approximately 300–450 authored lines for backend contract/tests, frontend UX/tests, permission regression, and E2E. If over 400, split into: (1) navigation + backend delete contract/tests, (2) frontend bulk-delete UX + permission message, (3) browser E2E/fixtures and integration validation.
- Deployment/merge is explicitly out of scope for exploration and must wait for backend tests, Angular tests/build, browser E2E, review receipt, and clean integration checks.

### Ready for Proposal
Yes. The proposal should lock the narrow contract to explicit employee IDs and inclusive visible dates, admin authorization, atomic/idempotent behavior, exact Spanish terminal-state messaging, and browser E2E as a release gate. It should also record the 400-line forecast and allow automatic PR slicing if the E2E setup pushes the change over budget.
