# Permission Request Terminal Feedback Specification

## Purpose

Give authorized users an exact, actionable message when an already-approved request cannot be approved again.

## Requirements

### Requirement: Authorized already-approved response

After authorization succeeds, an approval attempt for an already-approved request MUST return HTTP 400 with exactly: `La solicitud ya fue aprobada. Indique al colaborador que ingrese una nueva solicitud.` The response MUST NOT weaken authorization or reveal terminal-state details to unauthorized callers.

#### Scenario: Already-approved request

- GIVEN an authorized approver submits an already-approved request
- WHEN approval is attempted
- THEN the response status is 400
- AND the detail is exactly `La solicitud ya fue aprobada. Indique al colaborador que ingrese una nueva solicitud.`

#### Scenario: Unauthorized terminal-state attempt

- GIVEN a caller lacks approval authorization
- WHEN the caller submits the same request
- THEN authorization fails with 401 or 403 before terminal-state feedback
- AND the exact approved message is not disclosed

### Requirement: QA coverage and release gate

The change MUST provide isolated fixtures and cleanup for backend, Angular, and browser E2E tests. E2E MUST cover week navigation, confirmed/cancelled bulk deletion including repeated no-op, preservation boundaries, and terminal permission feedback. Release integration MUST require backend tests, Angular tests/build, E2E, review receipt, and clean integration; if authored changes exceed 400 lines, work MUST be automatically split into reviewable slices.

#### Scenario: Repeatable E2E execution

- GIVEN a clean test environment
- WHEN the browser suite runs and tears down
- THEN fixtures are isolated, cleanup completes, and no test data leaks
- AND a second run produces the same outcomes

#### Scenario: Release gate failure

- GIVEN any required test, build, E2E, review receipt, or integration check fails
- WHEN release readiness is evaluated
- THEN the gate fails and release is blocked
- AND an oversized change is split rather than accepted as a single review unit
