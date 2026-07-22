# Schedule Assignment Bulk Delete Specification

## Purpose

Define a safe administrative deletion operation scoped to selected employees and the currently visible inclusive date range.

## Requirements

### Requirement: Validated admin-only bulk deletion

The system MUST accept a bulk-delete request containing a non-empty set of valid employee IDs, an ISO date-only `start_date`, and `end_date` where `start_date <= end_date`. The operation MUST require an authenticated administrator and MUST return a deterministic deleted count.

#### Scenario: Delete matching assignments

- GIVEN an administrator submits valid employee IDs and an inclusive range
- WHEN matching assignments are deleted
- THEN only selected employees and dates from start through end are affected
- AND the response is successful with the exact number deleted

#### Scenario: Reject invalid input

- GIVEN an empty ID set, malformed ID/date, or start date after end date
- WHEN a delete request is submitted
- THEN the system returns a validation client error (422)
- AND no assignment is changed

#### Scenario: Reject non-admin access

- GIVEN an unauthenticated user or authenticated non-admin
- WHEN the user submits a valid delete request
- THEN the system returns 401 or 403 respectively
- AND no protected assignment existence is disclosed

### Requirement: Atomic, idempotent deletion

The deletion MUST be atomic: either all matching rows are removed or none are. Repeating an identical successful request MUST be a successful no-op with deleted count zero.

#### Scenario: Repeat the same deletion

- GIVEN a prior request removed its matching assignments
- WHEN the identical request is submitted again
- THEN the system returns success with `deleted_count: 0`
- AND no unrelated row is changed

#### Scenario: Failure rolls back

- GIVEN a transaction failure occurs during deletion
- WHEN the request completes
- THEN it returns a server error
- AND all rows targeted by that request remain unchanged

### Requirement: Preserve excluded assignments

The operation MUST NOT delete patterns, default schedules, exceptions, assignments for unselected employees, or assignments outside the inclusive range.

#### Scenario: Preserve neighboring and special rows

- GIVEN matching, out-of-range, unselected, default, pattern, and exception records coexist
- WHEN an administrator deletes the visible range
- THEN only matching ordinary assignments in that range are removed
- AND every excluded record remains intact

### Requirement: Confirmed client workflow

The client MUST show the selected employees and inclusive dates in a confirmation prompt. Cancel MUST perform no request. While deleting, the action MUST prevent duplicate submission; success MUST clear relevant selection and refresh the current range; failure MUST show an actionable error and preserve recoverable selection.

#### Scenario: Confirm, cancel, and result states

- GIVEN selected employees and a visible range
- WHEN the administrator cancels confirmation
- THEN no request is sent
- WHEN the administrator confirms
- THEN exactly one request is sent and loading is shown
- AND success or error is rendered according to the response
