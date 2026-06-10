# Permission Request Workflow Specification

## Purpose

This spec defines role and object boundaries for permission requests, internal audit access, bug validation access, and permission-request authorization enforcement.

## Requirements

### Requirement: Permission Request Creation

The system MUST allow permission request creation only for authenticated actors whose role and object relationship permit the requested action.

#### Scenario: Authorized actor creates own permission request

- GIVEN an authenticated actor is allowed to request access for their own eligible resource or workflow
- WHEN the actor creates a permission request
- THEN the backend MUST create the request
- AND the request MUST be associated with the requesting actor

#### Scenario: Actor cannot create request for unrelated user

- GIVEN an authenticated actor has no authority over another user's resources
- WHEN the actor sends a direct API request to create a permission request for that other user
- THEN the backend MUST deny the request

### Requirement: Permission Request Review

The system MUST allow permission request approval or denial only to roles with explicit review permission for the request scope.

#### Scenario: Authorized business reviewer approves request

- GIVEN an authenticated actor has permission to review the request's business scope
- WHEN the actor approves an eligible permission request
- THEN the backend MUST update the request status to approved

#### Scenario: Unauthorized reviewer cannot approve request

- GIVEN an authenticated actor lacks permission to review a permission request
- WHEN the actor sends a direct API request to approve or deny it
- THEN the backend MUST deny the request
- AND the permission request status MUST remain unchanged

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

### Requirement: Permission Request Visibility

The system MUST expose permission requests only to actors who own the request, are assigned to review it, or have explicit technical audit permission.

#### Scenario: Request owner views own request

- GIVEN an authenticated actor owns a permission request
- WHEN the actor requests that permission request by identifier
- THEN the backend MUST return the request

#### Scenario: Reviewer views assigned request

- GIVEN an authenticated actor has review permission for a permission request's scope
- WHEN the actor requests that permission request by identifier
- THEN the backend MUST return the request

#### Scenario: Unrelated actor cannot view request

- GIVEN an authenticated actor neither owns nor can review a permission request
- WHEN the actor sends a direct API request for that permission request by identifier
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

### Requirement: Permission Request Authorization Tests

The system MUST include backend authorization tests for permission request creation, visibility, approval, denial, audit access, and negative direct API access.

#### Scenario: Direct API denial tests cover unauthorized approvals

- GIVEN automated backend tests exist for permission request endpoints
- WHEN the test suite runs
- THEN tests MUST verify unauthorized actors cannot approve or deny permission requests through direct API calls

#### Scenario: Direct API denial tests cover unauthorized visibility

- GIVEN automated backend tests exist for permission request endpoints
- WHEN the test suite runs
- THEN tests MUST verify unrelated actors cannot view permission requests by direct identifier access
