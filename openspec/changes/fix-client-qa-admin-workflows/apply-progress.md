# Apply Progress: Fix Client QA Admin Workflows

## Status

Partial: the restored Python 3.11.14 runner enabled the backend TDD cycle. The maintainer explicitly accepted task 1.1 as verified pre-SDD work despite the unavailable historical RED receipt. Tasks 1.1–1.3 are complete; task 1.4 requires live PostgreSQL integration evidence and parent-orchestrated review receipt work.

## Delivery Boundary

- Mode: feature-branch-chain, PR1 child targeting the parent-created tracker branch.
- Start: preserve the existing uncommitted schedules week-navigation implementation and tests.
- Finish: backend bulk-delete contract, endpoint, focused tests, and the required stale-response navigation regression; PR2/PR3 remain out of scope.
- Review budget: 345 authored code/test changed lines (323 additions, 22 deletions), including the pre-existing navigation diff and the new untracked backend test; within the 400-line PR1 limit. Planning artifacts are excluded.
- Rollback boundary: revert the existing navigation files and any future PR1 backend schema, endpoint, and test files independently.

## Task Progress

- [x] 1.1 Existing navigation behavior is green and a required stale-response RED/GREEN regression was added. The maintainer explicitly accepted the unavailable historical RED receipt for this pre-SDD patch.
- [x] 1.2 Backend RED tests were added first and failed during collection because the endpoint did not exist; they now cover validation, auth/non-leakage, inclusive employee/date predicates, repeat no-op, and rollback.
- [x] 1.3 Added validated request/count schemas and an admin-only one-statement `DELETE ... RETURNING` endpoint with commit/rollback and safe count-only logging.
- [ ] 1.4 Backend and Angular verification plus diff inspection passed, but no commit, PR, lifecycle gate, or review receipt was created, per the requested scope.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 | `frontend/src/app/features/admin/pages/schedules/schedules.component.spec.ts` | Angular component | `npm test -- --watch=false`: 128/128 passed | Historical RED unavailable for existing navigation; new stale-response test failed as expected (`2026-07-13` overwrote `2026-07-20`) | Focused 4/4 and full 129/129 passed | Existing next/previous and UTC cases plus new stale-response case | Added monotonic load token; green |
| 1.2 | `backend/tests/test_schedule_bulk_delete.py` | Backend endpoint | N/A (new file) | Expected collection failure: `delete_bulk_assignments` did not exist | 4/4 passed | Validation, auth/non-leakage, inclusive statement predicates, repeat zero, rollback | Test fixture override only; green |
| 1.3 | `backend/app/{schemas/schedule.py,api/v1/endpoints/schedules.py}` | Backend endpoint | Backend baseline: 40/40 passed | Same endpoint-absent RED as 1.2 | Focused 4/4; full backend 44/44 passed | Two deleted rows and repeat zero; rollback path | Minimal endpoint/schema implementation; green |
| 1.4 | PR1 verification | Integration | Backend 40/40; Angular 128/128 | N/A | Backend 44/44; Angular 129/129 passed | N/A | Receipt intentionally not created; parent-owned lifecycle action |

## Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test command and exact result | `cd backend && PYTHONPATH=. ./.venv/bin/python -m pytest tests/test_schedule_bulk_delete.py` exited 0: 4/4 passed. `cd frontend && npm test -- --watch=false --include='src/app/features/admin/pages/schedules/schedules.component.spec.ts'` exited 0: 4/4 passed. |
| Runtime harness command/scenario and exact result | FastAPI `TestClient` exercised unauthenticated and non-admin `DELETE /api/v1/schedules/assignments/bulk`: 401 and 403 with no assignment disclosure; included in focused backend result. |
| Rollback boundary | `backend/app/schemas/schedule.py`, `backend/app/api/v1/endpoints/schedules.py`, `backend/tests/test_schedule_bulk_delete.py`, and the monotonic stale-load guard/test in `frontend/src/app/features/admin/pages/schedules/{schedules.component.ts,schedules.component.spec.ts}`. Reverting these restores only PR1 behavior. |

## Risk

The task 1.1 historical RED receipt remains unavailable but was explicitly accepted by the maintainer as pre-SDD work. Full live PostgreSQL concurrency/preservation integration remains required in task 1.4; focused unit/route tests verify the single-table, employee/date-scoped statement and rollback path. PR2/E2E work was not started.
