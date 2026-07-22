# Proposal: Fix Client QA Admin Workflows

## Intent

Resolve issue #38: trustworthy weekly navigation, safe bulk assignment cleanup, and actionable permission feedback.

## Scope

### In Scope
- Signal-backed seven-day navigation with UTC-safe dates; API range, headers, labels, and rows stay aligned.
- Admin-only confirmed deletion by employee IDs and inclusive visible `start_date`/`end_date`; atomic transaction, deterministic count, and idempotent repeat.
- Exact terminal-state detail: `La solicitud ya fue aprobada. Indique al colaborador que ingrese una nueva solicitud.`
- Automated backend, Angular, and browser E2E coverage.

### Out of Scope
- Deleting default schedules, exceptions, patterns, unselected employees, or assignments outside the visible range.
- Changing creation permissions, permission lifecycle, unrelated calendar UX, or biometric processing.
- Merge to `main` or production deployment before every gate passes.

## Capabilities

### New Capabilities
- `weekly-schedule-navigation`: Reactive, timezone-safe visible-week navigation and rendering.
- `schedule-assignment-bulk-delete`: Authorized atomic deletion for selected employees and an inclusive date range.
- `permission-request-terminal-feedback`: Exact already-approved request feedback without weakening authorization.

### Modified Capabilities
None; no existing OpenSpec capabilities are present.

## Approach

Preserve the navigation patch. Add a REST delete contract validating non-empty UUIDs and ordered date bounds. Enforce admin authorization and delete `ScheduleAssignment` rows in one transaction. The UI confirms impact, submits once, clears selection, and refreshes. Handle approved state after authorization.

## Affected Areas

| Area | Impact |
|---|---|
| `frontend/src/app/features/admin/pages/schedules/` | Navigation, deletion, tests |
| `frontend/src/app/core/{services,models}/schedule.*` | API contract |
| `backend/app/{api/v1/endpoints,schemas}/schedule*` | Admin endpoint |
| `backend/app/api/v1/endpoints/permission_requests.py` | Terminal-state detail |
| `backend/tests/`, frontend E2E | Regression coverage |

## Security and Risks

- Destructive scope: enforce admin authorization, both predicates, confirmation, rollback, and preservation tests.
- Date drift: keep values date-only and test timezone boundaries.
- E2E may exceed 400 authored lines; auto-split instead of accepting an oversized review.

## Rollback Plan

Revert slices independently: remove endpoint/UI action, restore prior permission detail, and revert navigation with tests. No migration; E2E uses isolated fixtures.

## Dependencies and Release Gate

- JWT roles, SQLAlchemy transactions, Angular tests, and an approved browser runner.
- Merge/deploy require backend tests, Angular tests/build, E2E, review receipt, and clean integration.

## Acceptance Criteria

- [ ] Previous/next week remains aligned across timezone boundaries.
- [ ] Only an admin can confirm and atomically delete matching assignments; invalid/empty ranges fail, unrelated rows survive, and repeats succeed with zero deleted.
- [ ] Approved requests display the exact message without information leakage.
- [ ] Required E2E covers all three QA workflows and passes as a release gate.

## Tentative PR Slicing

If forecast exceeds 400 authored lines: (1) navigation + backend delete/tests; (2) frontend deletion + permission feedback; (3) E2E/fixtures + integration. `sdd-tasks` sets final boundaries.
