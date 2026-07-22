# Tasks: Fix Client QA Admin Workflows

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1,040–1,280 authored; PR1 existing navigation is 142 lines |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3a → PR3b; each ≤400 authored lines |
| Delivery strategy | auto-forecast |
| Chain strategy | feature-branch-chain (user selected) |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
Next recommended: apply PR1 on the feature-branch chain

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Preserve navigation; add delete API/backend | PR1 | `cd backend && PYTHONPATH=. ./.venv/bin/python -m pytest tests/test_schedule_bulk_delete.py` | API admin/403 smoke | navigation files + backend delete files/tests |
| 2 | Angular delete UX and permission feedback | PR2 | `cd frontend && npm test -- --watch=false` | N/A: browser is PR3b | Angular service/component files/tests |
| 3 | Playwright fixtures and guarded harness | PR3a | `cd frontend && npx playwright test e2e/fixtures` | `E2E_ALLOW_MUTATION=1 npx playwright test` | E2E config/fixtures only |
| 4 | Three complete E2E workflows and release gate | PR3b | `cd frontend && npx playwright test e2e` | localhost/127.0.0.1, unique run IDs, teardown manifest | E2E specs/integration gate |

## Phase 1: PR1 — Navigation and Backend Contract

- [x] 1.1 **Verified pre-SDD work (maintainer accepted):** retained `schedules.component.ts` and `schedules.component.spec.ts` navigation coverage for next/previous, UTC boundary, empty week, and stale-load rejection. The user explicitly accepted the unavailable historical RED receipt; current focused and full frontend suites pass.
- [x] 1.2 **RED:** add focused `backend/tests/test_schedule_bulk_delete.py` cases for 422 validation, unauthenticated/403 admin access, inclusive selection, preservation predicates, repeat `deleted_count: 0`, and rollback.
- [x] 1.3 **GREEN:** add validated request/count schemas in `backend/app/schemas/schedule.py`; implement `DELETE /schedules/assignments/bulk` in `backend/app/api/v1/endpoints/schedules.py` with one transaction, `RETURNING`, admin authorization, safe logs, and canonical `deleted_count`.
- [ ] 1.4 Run backend focused/full pytest, Angular focused tests, live PostgreSQL preservation/concurrency integration, inspect `git diff --stat`, link every PR to approved issue #38, and create the required review receipt before pre-push/pre-PR gates.

## Phase 2: PR2 — Angular Action and Permission Feedback

- [ ] 2.1 **RED:** extend `api.service.ts`, `schedule.model.ts`, `schedule.service.ts`, and `schedules.component.spec.ts` for typed DELETE body, confirmation/cancel, snapshot, single-flight, success refresh/clear, and failure preservation.
- [ ] 2.2 **GREEN:** implement the typed delete path and confirmed action in the same frontend files; navigation is disabled while deleting and current range is refreshed.
- [ ] 2.3 **RED/GREEN:** modify `permission_requests.py` authorization-first approved handling and add exact-detail/non-leakage tests in backend and `permission-requests.component.spec.ts`.
- [ ] 2.4 Run `cd frontend && npm test -- --watch=false` and build; run backend permission tests; preserve receipt and pass pre-push/pre-PR gates.

## Phase 3: PR3a — E2E Harness and Fixtures

- [ ] 3.1 **RED:** add fixture tests/config in `frontend/playwright.config.ts` and `frontend/e2e/**` proving mutation guard, unique run IDs, manifest tracking, and finally cleanup.
- [ ] 3.2 **GREEN:** implement localhost/127.0.0.1-only guarded fixtures and deterministic teardown; do not broaden fixture data scope.

## Phase 4: PR3b — Full Browser Release Coverage

- [ ] 4.1 **RED:** add Playwright scenarios for week navigation, cancelled deletion (no request), confirmed deletion, repeated no-op, all preservation boundaries, and exact approved message.
- [ ] 4.2 **GREEN:** wire role/label selectors and stable API/UI assertions; run the suite twice and verify no fixture leakage.
- [ ] 4.3 Execute backend pytest, Angular tests/build, full E2E, CI, clean integration, review receipt validation, pre-PR/pre-push gates; merge to `main` only after all pass, then deploy production and validate health/target workflows.
