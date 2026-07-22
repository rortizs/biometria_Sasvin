# Weekly Schedule Navigation Specification

## Purpose

Provide a trustworthy, reactive seven-day calendar whose visible dates, labels, rows, and API range remain identical across timezone boundaries.

## Requirements

### Requirement: Synchronized date-only visible week

The system MUST represent the visible range as date-only values in `America/Guatemala`, with an inclusive start and end exactly six calendar days apart (seven included dates). Navigation MUST update the range, labels, rows, and API query together.

#### Scenario: Navigate to the next week

- GIVEN a visible Monday-through-Sunday week
- WHEN the user selects next week
- THEN start and end advance by seven calendar days
- AND the request, header, labels, and returned rows use that same inclusive range

#### Scenario: Navigate across a UTC/local boundary

- GIVEN a date near midnight UTC whose Guatemala date differs from UTC
- WHEN the calendar loads or changes week
- THEN every displayed and requested date remains the Guatemala date-only value
- AND no day shifts because of local JavaScript time conversion

#### Scenario: Navigate backward and return

- GIVEN the user navigates forward one week
- WHEN the user selects previous week
- THEN the original seven-day range and its assignments are restored
- AND no stale filter, label, or row remains from the intervening week

### Requirement: Reactive calendar state

The calendar MUST derive its displayed week and data query from one reactive range state. A refresh MUST preserve the current visible range and render empty days when no assignments exist.

#### Scenario: Empty visible week

- GIVEN the selected week has no assignments
- WHEN the calendar refreshes
- THEN all seven date columns remain visible
- AND the empty result is rendered for that exact range
