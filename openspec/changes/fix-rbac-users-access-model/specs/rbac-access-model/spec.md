# RBAC Access Model Specification

## Purpose

This spec defines canonical role behavior, system-user protection, role assignment rules, module/permission administration, backend authorization enforcement, and migration compatibility for the RBAC users access model.

## Requirements

### Requirement: Canonical Roles

The system MUST use the canonical roles `ADMIN`, `DEV`, `DECANO`, `DUEÑO`, `DIRECTOR`, `ADMINISTRATIVO`, `CATEDRATICO`, `ESTUDIANTE`, and `PADRES` for authorization decisions.

#### Scenario: Canonical role is accepted

- GIVEN an authenticated user has a canonical role assigned
- WHEN the backend evaluates access to a protected endpoint
- THEN authorization MUST use the user's canonical role and permissions

#### Scenario: Unknown role fails closed

- GIVEN an authenticated user has no mapped canonical role or permission
- WHEN the user requests a protected endpoint directly through the API
- THEN the backend MUST deny the request
- AND the denial MUST NOT grant access based on frontend route visibility

### Requirement: Hidden Bootstrap Admin

The system MUST maintain a bootstrap `ADMIN` identity configured from environment settings and MUST treat that identity as hidden and immutable from backoffice user administration.

#### Scenario: Bootstrap admin is hidden from user list

- GIVEN a bootstrap `ADMIN` exists with the configured bootstrap email
- WHEN any non-bootstrap actor requests the users list from the backend
- THEN the response MUST NOT include the bootstrap `ADMIN`

#### Scenario: Bootstrap admin cannot be deleted

- GIVEN a non-bootstrap actor is authenticated with any role, including `DEV`, `DECANO`, or `DUEÑO`
- WHEN the actor sends a direct API request to delete the bootstrap `ADMIN`
- THEN the backend MUST deny the request
- AND the bootstrap `ADMIN` MUST remain active

#### Scenario: Bootstrap admin cannot be deactivated

- GIVEN a non-bootstrap actor is authenticated with any role, including `DEV`, `DECANO`, or `DUEÑO`
- WHEN the actor sends a direct API request to deactivate the bootstrap `ADMIN`
- THEN the backend MUST deny the request
- AND the bootstrap `ADMIN` MUST remain active

#### Scenario: Bootstrap admin cannot be updated by non-bootstrap actor

- GIVEN a non-bootstrap actor is authenticated with any role, including `DEV`, `DECANO`, or `DUEÑO`
- WHEN the actor sends a direct API request to update bootstrap `ADMIN` profile, password, role, permissions, or active state
- THEN the backend MUST deny the request
- AND no bootstrap `ADMIN` fields MUST be changed

#### Scenario: Bootstrap admin can recover itself through server-side recovery path

- GIVEN the configured bootstrap `ADMIN` is missing or has broken role assignment
- WHEN the approved server-side bootstrap recovery process runs with environment configuration
- THEN the system MUST create or repair the bootstrap `ADMIN`
- AND the repaired identity MUST remain hidden from backoffice user listings

### Requirement: DEV Role Assignment Restriction

Only the bootstrap `ADMIN` MUST be allowed to create a `DEV` user or assign the `DEV` role to an existing user.

#### Scenario: Bootstrap admin assigns DEV

- GIVEN the authenticated actor is the bootstrap `ADMIN`
- WHEN the actor creates a user with `DEV` or assigns `DEV` to an existing user
- THEN the backend MUST allow the operation when all other validation passes

#### Scenario: DEV cannot assign DEV

- GIVEN the authenticated actor has the `DEV` role but is not the bootstrap `ADMIN`
- WHEN the actor sends a direct API request to create a `DEV` user or assign `DEV`
- THEN the backend MUST deny the request
- AND the target user's roles MUST remain unchanged

#### Scenario: Business top role cannot assign DEV

- GIVEN the authenticated actor has `DECANO` or `DUEÑO`
- WHEN the actor sends a direct API request to create a `DEV` user or assign `DEV`
- THEN the backend MUST deny the request
- AND the target user's roles MUST remain unchanged

### Requirement: DEV Technical Administration

The `DEV` role MUST be allowed to administer RBAC roles, user role assignments, module permissions, and internal audit or bug validation access, except for actions reserved to the bootstrap `ADMIN`.

#### Scenario: DEV manages role permissions

- GIVEN an authenticated actor has `DEV`
- WHEN the actor configures non-bootstrap role module permissions through the roles API
- THEN the backend MUST allow the operation when all other validation passes

#### Scenario: DEV views internal audit access

- GIVEN an authenticated actor has `DEV`
- WHEN the actor requests internal audit or bug validation access
- THEN the backend MUST allow access to technical audit and validation resources

#### Scenario: DEV cannot mutate bootstrap admin

- GIVEN an authenticated actor has `DEV`
- WHEN the actor sends a direct API request to modify bootstrap `ADMIN` identity, active state, roles, or permissions
- THEN the backend MUST deny the request

### Requirement: Business Top Role Boundaries

`DECANO` and `DUEÑO` MUST have top business access for operational modules but MUST NOT administer technical RBAC internals, hidden bootstrap identity, internal audit, or bug validation resources.

#### Scenario: DECANO accesses business administration

- GIVEN an authenticated actor has `DECANO`
- WHEN the actor requests a permitted business administration module
- THEN the backend MUST allow the request when all module permission checks pass

#### Scenario: DUEÑO accesses business administration

- GIVEN an authenticated actor has `DUEÑO`
- WHEN the actor requests a permitted business administration module
- THEN the backend MUST allow the request when all module permission checks pass

#### Scenario: DECANO cannot administer RBAC internals

- GIVEN an authenticated actor has `DECANO`
- WHEN the actor sends a direct API request to change role permissions, assign technical roles, or access internal audits
- THEN the backend MUST deny the request

#### Scenario: DUEÑO cannot administer RBAC internals

- GIVEN an authenticated actor has `DUEÑO`
- WHEN the actor sends a direct API request to change role permissions, assign technical roles, or access internal audits
- THEN the backend MUST deny the request

### Requirement: Module Access Boundaries

The system MUST enforce module access boundaries for `DIRECTOR`, `ADMINISTRATIVO`, `CATEDRATICO`, `ESTUDIANTE`, and `PADRES` using backend permissions and object-level checks.

#### Scenario: DIRECTOR accesses assigned academic management

- GIVEN an authenticated actor has `DIRECTOR`
- WHEN the actor requests an academic or operational module granted to `DIRECTOR`
- THEN the backend MUST allow the request when object-level constraints pass

#### Scenario: ADMINISTRATIVO accesses assigned operational work

- GIVEN an authenticated actor has `ADMINISTRATIVO`
- WHEN the actor requests an administrative module granted to `ADMINISTRATIVO`
- THEN the backend MUST allow the request when object-level constraints pass

#### Scenario: CATEDRATICO accesses teacher-scoped data

- GIVEN an authenticated actor has `CATEDRATICO`
- WHEN the actor requests teacher-scoped attendance, schedule, or student data assigned to that actor
- THEN the backend MUST allow the request when ownership or assignment is proven

#### Scenario: ESTUDIANTE accesses own data only

- GIVEN an authenticated actor has `ESTUDIANTE`
- WHEN the actor requests student-visible attendance or academic data
- THEN the backend MUST allow only resources owned by or assigned to that student

#### Scenario: PADRES accesses child data only

- GIVEN an authenticated actor has `PADRES`
- WHEN the actor requests parent-visible attendance or academic data
- THEN the backend MUST allow only resources for children linked to that parent

#### Scenario: Module boundary bypass is denied by API

- GIVEN an authenticated actor has `DIRECTOR`, `ADMINISTRATIVO`, `CATEDRATICO`, `ESTUDIANTE`, or `PADRES`
- WHEN the actor sends a direct API request to a module or object outside their permissions
- THEN the backend MUST deny the request

### Requirement: Users View Role Assignment

The Users view MUST be used to assign roles to users and MUST NOT configure module or permission access directly.

#### Scenario: User role assignment is allowed by authorized actor

- GIVEN an authenticated actor has permission to assign non-technical roles
- WHEN the actor assigns a permitted role from the Users view or users API
- THEN the backend MUST persist the role assignment

#### Scenario: Users view cannot edit permission matrix

- GIVEN an authenticated actor has access to the Users view
- WHEN the actor sends a direct users API request containing module permission changes
- THEN the backend MUST ignore or reject permission matrix changes
- AND role permissions MUST remain unchanged

### Requirement: Roles View Permission Configuration

The Roles view MUST configure module and permission access for roles and MUST NOT be used to assign roles to individual users.

#### Scenario: Role permission matrix is configured by authorized actor

- GIVEN an authenticated actor has permission to manage role permissions
- WHEN the actor updates module or permission access through the Roles view or roles API
- THEN the backend MUST persist the role permission configuration

#### Scenario: Roles view cannot assign user roles

- GIVEN an authenticated actor has access to the Roles view
- WHEN the actor sends a direct roles API request attempting to assign a role to an individual user
- THEN the backend MUST reject the user assignment
- AND the target user's roles MUST remain unchanged

### Requirement: Backend Authorization Enforcement

The backend MUST enforce authentication, role permissions, and object-level authorization for all protected users, roles, permissions, employees, permission request, attendance, and related administration endpoints.

#### Scenario: Frontend visibility is insufficient

- GIVEN a route or action is hidden in the frontend
- WHEN an authenticated user without required permission calls the corresponding backend endpoint directly
- THEN the backend MUST deny the request

#### Scenario: Missing permission denies protected route

- GIVEN an authenticated user lacks the required permission for a protected endpoint
- WHEN the user calls the endpoint directly
- THEN the backend MUST deny the request

#### Scenario: Object-level authorization denies cross-user resource access

- GIVEN an authenticated user has a valid role but does not own or have assignment to a target resource
- WHEN the user requests that resource directly by identifier
- THEN the backend MUST deny the request

### Requirement: Legacy Role Migration Compatibility

The system MUST provide a migration-compatible mapping from legacy roles into canonical roles and MUST fail closed for unmapped values.

#### Scenario: Legacy admin bootstrap maps to ADMIN

- GIVEN a legacy admin user matches the configured bootstrap admin identity
- WHEN migration or compatibility mapping runs
- THEN that user MUST be mapped to hidden `ADMIN`

#### Scenario: Non-bootstrap legacy admin maps to fallback business role

- GIVEN a legacy admin user does not match the configured bootstrap admin identity
- WHEN migration or compatibility mapping runs
- THEN that user MUST be mapped to the configured legacy admin fallback business role
- AND the user MUST NOT receive `ADMIN` or `DEV` unless explicitly assigned by bootstrap `ADMIN`

#### Scenario: Known legacy roles map to canonical roles

- GIVEN users have known legacy roles such as `director`, `coordinador`, `secretaria`, `supervisor`, or `catedratico`
- WHEN migration or compatibility mapping runs
- THEN each user MUST receive the documented canonical role mapping

#### Scenario: Unknown legacy role is denied

- GIVEN a user has an unknown or unmapped legacy role
- WHEN the user requests a protected endpoint
- THEN the backend MUST deny protected access until a canonical role or permission is assigned

### Requirement: Authorization Test Coverage

The system MUST include authorization tests for role assignment, module access, object access, hidden bootstrap protection, migration mapping, and negative direct API access.

#### Scenario: Direct API negative tests cover every protected role boundary

- GIVEN automated backend tests exist for RBAC endpoints
- WHEN the test suite runs
- THEN tests MUST include direct API denial scenarios for actors without required permissions

#### Scenario: Bootstrap protection tests cover destructive actions

- GIVEN automated backend tests exist for users endpoints
- WHEN the test suite runs
- THEN tests MUST verify that non-bootstrap actors cannot list, update, deactivate, or delete the bootstrap `ADMIN`
