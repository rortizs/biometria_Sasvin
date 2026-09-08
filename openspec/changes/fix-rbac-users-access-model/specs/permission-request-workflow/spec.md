# Permission Request Workflow Specification

## Purpose

This spec defines role and object boundaries for permission requests, the two-stage approval state machine, director notification, internal audit access, bug validation access, and permission-request authorization enforcement.

## ADDED Requirements

### Requirement: Stage 1 Coordinator Review

The system MUST allow only a `COORDINADOR` scoped to the request's facultad and/or sede to approve or reject a permission request while it is in `pending` status.

#### Scenario: Scoped coordinador approves request

- GIVEN an authenticated actor has `COORDINADOR` scoped to the request employee's facultad/sede
- AND the request status is `pending`
- WHEN the actor approves the request
- THEN the backend MUST set the request status to `coordinator_approved`

#### Scenario: Scoped coordinador rejects request with reason

- GIVEN an authenticated actor has `COORDINADOR` scoped to the request employee's facultad/sede
- AND the request status is `pending`
- WHEN the actor rejects the request with a reason
- THEN the backend MUST set the request status to `rejected` with rejection stage `coordinator`

#### Scenario: Out-of-scope coordinador is denied

- GIVEN an authenticated actor has `COORDINADOR` scoped to a different facultad/sede than the request's employee
- WHEN the actor sends a direct API request to approve or reject the request
- THEN the backend MUST deny the request
- AND the request status MUST remain unchanged

#### Scenario: Non-coordinador actor is denied stage 1 review

- GIVEN an authenticated actor does not have `COORDINADOR`
- WHEN the actor sends a direct API request to perform the stage 1 approval or rejection action
- THEN the backend MUST deny the request

### Requirement: Stage 2 Secretaría Review

The system MUST allow only a `SECRETARIA` assigned to the request's `DIRECTOR` to approve or reject a permission request that is in `coordinator_approved` status, and MUST require non-empty justification for both actions.

#### Scenario: Assigned secretaría approves with justification

- GIVEN an authenticated actor has `SECRETARIA` assigned to the request's scope `DIRECTOR`
- AND the request status is `coordinator_approved`
- WHEN the actor approves the request with non-empty justification
- THEN the backend MUST set the request status to `approved`
- AND the backend MUST trigger schedule exception creation per existing approved-request behavior

#### Scenario: Assigned secretaría rejects with justification

- GIVEN an authenticated actor has `SECRETARIA` assigned to the request's scope `DIRECTOR`
- AND the request status is `coordinator_approved`
- WHEN the actor rejects the request with non-empty justification
- THEN the backend MUST set the request status to `rejected` with rejection stage `director`

#### Scenario: Approve or reject without justification is rejected

- GIVEN an authenticated actor has `SECRETARIA` assigned to the request's scope `DIRECTOR`
- AND the request status is `coordinator_approved`
- WHEN the actor sends a direct API request to approve or reject without justification text
- THEN the backend MUST respond with HTTP 422
- AND the request status MUST remain unchanged

#### Scenario: Unassigned secretaría is denied

- GIVEN an authenticated actor has `SECRETARIA` but is not assigned to the request's scope `DIRECTOR`
- WHEN the actor sends a direct API request to approve or reject the request
- THEN the backend MUST deny the request

#### Scenario: DIRECTOR cannot approve or deny

- GIVEN an authenticated actor has `DIRECTOR`
- WHEN the actor sends a direct API request to approve or reject a permission request at any stage
- THEN the backend MUST deny the request

#### Scenario: Stage 2 action while stage 1 is incomplete is denied

- GIVEN a permission request has status `pending`
- WHEN an authenticated `SECRETARIA` actor sends a direct API request to approve or reject that request
- THEN the backend MUST deny the request
- AND the request status MUST remain `pending`

### Requirement: Director Notification Visibility

The system MUST notify a scoped `DIRECTOR` when a permission request reaches `coordinator_approved` status and MUST allow that `DIRECTOR` to read the request without granting any transition authority.

#### Scenario: Scoped director receives notification

- GIVEN a `DIRECTOR` is scoped to a permission request's facultad/sede
- WHEN the request transitions to `coordinator_approved`
- THEN the backend MUST create a notification for that `DIRECTOR`

#### Scenario: Scoped director reads the request

- GIVEN a `DIRECTOR` is scoped to a permission request's facultad/sede
- WHEN the actor requests that permission request by identifier
- THEN the backend MUST return the request

#### Scenario: Director cannot transition the request

- GIVEN a `DIRECTOR` is scoped to a permission request's facultad/sede
- WHEN the actor sends a direct API request to approve, reject, or otherwise transition the request
- THEN the backend MUST deny the request

### Requirement: Requester Outcome Notification

The system MUST notify the requesting `CATEDRATICO` of the final request status and MUST include the justification or rejection reason text when the request is denied at either stage.

#### Scenario: Requester sees final status

- GIVEN a permission request reaches a terminal status of `approved` or `rejected`
- WHEN the requester views their request
- THEN the backend MUST return the final status

#### Scenario: Requester sees denial justification

- GIVEN a permission request is denied at stage 1 or stage 2
- WHEN the requester views their request
- THEN the backend MUST include the rejection reason or justification text provided by the reviewer

## MODIFIED Requirements

### Requirement: Permission Request Creation

The system MUST allow permission request creation only for authenticated actors whose role and object relationship permit the requested action.
(Previously: did not enumerate the `CATEDRATICO` self-creation path or explicitly test identity boundaries beyond a generic "unrelated user".)

#### Scenario: Authorized actor creates own permission request

- GIVEN an authenticated actor is allowed to request access for their own eligible resource or workflow
- WHEN the actor creates a permission request
- THEN the backend MUST create the request
- AND the request MUST be associated with the requesting actor

#### Scenario: Actor cannot create request for unrelated user

- GIVEN an authenticated actor has no authority over another user's resources
- WHEN the actor sends a direct API request to create a permission request for that other user
- THEN the backend MUST deny the request

#### Scenario: CATEDRATICO creates own request

- GIVEN an authenticated actor has `CATEDRATICO`
- WHEN the actor creates a permission request for their own linked employee identity
- THEN the backend MUST create the request in `pending` status associated with that actor

#### Scenario: Actor cannot create request for an employee outside their identity

- GIVEN an authenticated actor has `CATEDRATICO`
- WHEN the actor sends a direct API request to create a permission request naming a different employee's identifier
- THEN the backend MUST deny the request

### Requirement: Permission Request Visibility

The system MUST expose permission requests only to the request owner, the scoped `COORDINADOR` for stage 1, the scoped `DIRECTOR` for read-only notification, the assigned `SECRETARIA` for stage 2, and `DEV` or bootstrap `ADMIN`.
(Previously: used generic "owns, reviews, or has audit permission" wording without an explicit role allow-list.)

#### Scenario: Request owner views own request

- GIVEN an authenticated actor owns a permission request
- WHEN the actor requests that permission request by identifier
- THEN the backend MUST return the request

#### Scenario: Scoped coordinador views request

- GIVEN an authenticated actor has `COORDINADOR` scoped to the request's facultad/sede
- WHEN the actor requests that permission request by identifier
- THEN the backend MUST return the request

#### Scenario: Scoped director views request read-only

- GIVEN an authenticated actor has `DIRECTOR` scoped to the request's facultad/sede
- WHEN the actor requests that permission request by identifier
- THEN the backend MUST return the request

#### Scenario: Assigned secretaría views request

- GIVEN an authenticated actor has `SECRETARIA` assigned to the request's scope `DIRECTOR`
- WHEN the actor requests that permission request by identifier
- THEN the backend MUST return the request

#### Scenario: Unrelated actor cannot view request

- GIVEN an authenticated actor is not the owner and is not the scoped coordinador, scoped director, assigned secretaría, `DEV`, or bootstrap `ADMIN`
- WHEN the actor sends a direct API request for that permission request by identifier
- THEN the backend MUST deny the request

#### Scenario: DECANO/DUEÑO cannot view permission requests

- GIVEN an authenticated actor has `DECANO` or `DUEÑO`
- WHEN the actor sends a direct API request for a permission request by identifier or in list form
- THEN the backend MUST deny the request

### Requirement: Permission Request Authorization Tests

The system MUST include backend authorization tests for permission request creation, visibility, stage 1 approval/denial, stage 2 approval/denial, mandatory justification enforcement, audit access, and negative direct API access.
(Previously: referenced a single generic approval/denial stage without stage-scoped or justification-specific coverage.)

#### Scenario: Direct API denial tests cover unauthorized approvals

- GIVEN automated backend tests exist for permission request endpoints
- WHEN the test suite runs
- THEN tests MUST verify unauthorized actors cannot approve or deny permission requests through direct API calls

#### Scenario: Direct API denial tests cover unauthorized visibility

- GIVEN automated backend tests exist for permission request endpoints
- WHEN the test suite runs
- THEN tests MUST verify unrelated actors cannot view permission requests by direct identifier access

#### Scenario: Tests cover stage-scoped denial

- GIVEN automated backend tests exist for permission request endpoints
- WHEN the test suite runs
- THEN tests MUST verify out-of-scope `COORDINADOR` and unassigned `SECRETARIA` actors are denied at their respective stage

#### Scenario: Tests cover missing-justification 422 responses

- GIVEN automated backend tests exist for permission request endpoints
- WHEN the test suite runs
- THEN tests MUST verify stage 2 approve/reject without justification returns HTTP 422

## REMOVED Requirements

### Requirement: Permission Request Review

(Reason: replaced by an explicit two-stage state machine — a scoped `COORDINADOR` performs stage 1 and an assigned `SECRETARIA` performs stage 2 with mandatory justification — because a single generic "reviewer" concept collapsed two distinct approval stages with different scopes, actors, and validation rules.)
(Migration: see ADDED requirements "Stage 1 Coordinator Review" and "Stage 2 Secretaría Review".)

## Requirements (Unchanged)

Carried forward as-is from the prior revision of this spec; not affected by this design revision.

### Requirement: Internal Audit And Bug Validation Access

Internal audit and bug validation access MUST be restricted to `DEV` and bootstrap `ADMIN`; business roles MUST NOT access technical audit internals unless explicitly granted by a future spec.

#### Scenario: DEV accesses internal audit

- GIVEN an authenticated actor has `DEV`
- WHEN the actor requests internal audit or bug validation records
- THEN the backend MUST allow the request when all other validation passes

#### Scenario: Bootstrap admin accesses internal audit

- GIVEN the authenticated actor is the bootstrap `ADMIN`
- WHEN the actor requests internal audit or bug validation records
- THEN the backend MUST allow the request when all other validation passes

#### Scenario: DECANO cannot access internal audit

- GIVEN an authenticated actor has `DECANO`
- WHEN the actor sends a direct API request for internal audit or bug validation records
- THEN the backend MUST deny the request

#### Scenario: DUEÑO cannot access internal audit

- GIVEN an authenticated actor has `DUEÑO`
- WHEN the actor sends a direct API request for internal audit or bug validation records
- THEN the backend MUST deny the request

### Requirement: Permission Request Audit Logging

The system SHOULD record security-relevant permission request actions and denials without exposing sensitive object details to unauthorized actors.

#### Scenario: Sensitive status transition is auditable

- GIVEN an authorized reviewer approves or denies a permission request
- WHEN the backend completes the status transition
- THEN the action SHOULD be available for audit with actor, target request, status, and timestamp

#### Scenario: Denial does not leak sensitive details

- GIVEN an unauthorized actor requests a permission request they cannot access
- WHEN the backend denies the request
- THEN the response MUST NOT reveal sensitive request details
- AND any audit record SHOULD avoid leaking confidential object content
