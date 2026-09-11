# Attendance Access Control Specification

## Purpose

This spec defines backend-enforced attendance and academic-data access boundaries for teachers, students, parents, and administrative roles.

## MODIFIED Requirements

### Requirement: Teacher Attendance Scope

The system MUST allow `CATEDRATICO` actors to mark or manage attendance only for assigned classes, schedules, students, or equivalent teacher-scoped resources, and MUST allow `CATEDRATICO` actors to register their own attendance check-in/check-out as employees.
(Previously: scoped only to marking attendance for assigned classes/students; did not cover the teacher's own attendance registration.)

#### Scenario: Teacher marks assigned attendance

- GIVEN an authenticated actor has `CATEDRATICO`
- AND the target attendance context is assigned to that teacher
- WHEN the actor marks attendance
- THEN the backend MUST allow the operation when all attendance validation passes

#### Scenario: Teacher cannot mark unassigned attendance

- GIVEN an authenticated actor has `CATEDRATICO`
- AND the target attendance context is not assigned to that teacher
- WHEN the actor sends a direct API request to mark attendance
- THEN the backend MUST deny the request

#### Scenario: CATEDRATICO marks own attendance

- GIVEN an authenticated actor has `CATEDRATICO`
- WHEN the actor registers their own check-in or check-out attendance record
- THEN the backend MUST allow the operation when it targets the actor's own employee identity
- AND the backend MUST deny the operation if it targets a different employee's attendance record

### Requirement: Administrative Attendance Access

The system MUST allow `DECANO`, `DUEÑO`, `DIRECTOR`, and `COORDINADOR` read-only access to attendance reports, and MUST allow `SECRETARIA` to create or update employee records only for employees whose position maps to canonical role `CATEDRATICO`, all according to assigned backend permissions and object-level constraints.
(Previously: granted `DIRECTOR`, `ADMINISTRATIVO`, `DECANO`, and `DUEÑO` combined attendance-and-employee-module access without a read-only/write split.)

#### Scenario: Business and academic roles access read-only attendance reports

- GIVEN an authenticated actor has `DECANO`, `DUEÑO`, `DIRECTOR`, or `COORDINADOR`
- WHEN the actor requests an attendance report covered by their permissions
- THEN the backend MUST allow read-only access when object-level constraints pass
- AND the backend MUST deny any create, update, delete, or export action on that report

#### Scenario: SECRETARIA manages catedrático employee records

- GIVEN an authenticated actor has `SECRETARIA`
- AND the target employee's position maps to canonical role `CATEDRATICO`
- WHEN the actor creates or updates that employee record
- THEN the backend MUST allow the operation when object-level constraints pass

#### Scenario: SECRETARIA cannot manage non-teaching employee records

- GIVEN an authenticated actor has `SECRETARIA`
- AND the target employee's position does not map to canonical role `CATEDRATICO`
- WHEN the actor sends a direct API request to create or update that employee record
- THEN the backend MUST deny the request

#### Scenario: Administrative actor cannot bypass object scope

- GIVEN an authenticated actor has `DECANO`, `DUEÑO`, `DIRECTOR`, `COORDINADOR`, or `SECRETARIA`
- AND the target object is outside the actor's permitted scope
- WHEN the actor sends a direct API request for the object
- THEN the backend MUST deny the request

## Requirements (Unchanged)

Carried forward as-is from the prior revision of this spec; not affected by this design revision.

### Requirement: Student Attendance Access

The system MUST allow `ESTUDIANTE` actors to view only their own attendance and permitted academic data.

#### Scenario: Student views own attendance

- GIVEN an authenticated actor has `ESTUDIANTE`
- WHEN the actor requests their own attendance history
- THEN the backend MUST return only records belonging to that student

#### Scenario: Student cannot view another student's attendance

- GIVEN an authenticated actor has `ESTUDIANTE`
- WHEN the actor sends a direct API request for another student's attendance or grades
- THEN the backend MUST deny the request

### Requirement: Parent Attendance Access

The system MUST allow `PADRES` actors read-only access only to attendance and permitted academic data for linked children.

#### Scenario: Parent views linked child attendance

- GIVEN an authenticated actor has `PADRES`
- AND the requested student is linked to that parent
- WHEN the actor requests the student's attendance history
- THEN the backend MUST return the linked child's permitted records

#### Scenario: Parent cannot view unlinked child attendance

- GIVEN an authenticated actor has `PADRES`
- AND the requested student is not linked to that parent
- WHEN the actor sends a direct API request for the student's attendance or grades
- THEN the backend MUST deny the request

#### Scenario: Parent cannot mutate attendance

- GIVEN an authenticated actor has `PADRES`
- WHEN the actor sends a direct API request to create, update, delete, or validate attendance
- THEN the backend MUST deny the request

### Requirement: Attendance Backend Enforcement

The backend MUST enforce attendance access control independently from Angular guards, route metadata, dashboard cards, or hidden UI actions.

#### Scenario: Hidden UI action is denied by backend

- GIVEN an attendance action is hidden in the frontend for an actor
- WHEN the actor calls the corresponding attendance endpoint directly
- THEN the backend MUST deny the request if the actor lacks required permission or object relationship

#### Scenario: Missing relationship fails closed

- GIVEN the system cannot prove teacher assignment, student ownership, or parent-child relationship for a requested attendance resource
- WHEN the actor requests that resource
- THEN the backend MUST deny the request

### Requirement: Attendance Authorization Tests

The system MUST include backend authorization tests for teacher scope, student self-access, parent child-access, administrative boundaries, and negative direct API access.

#### Scenario: Direct API denial tests cover attendance mutation

- GIVEN automated backend tests exist for attendance endpoints
- WHEN the test suite runs
- THEN tests MUST verify unauthorized roles cannot mutate attendance through direct API calls

#### Scenario: Direct API denial tests cover cross-student reads

- GIVEN automated backend tests exist for attendance endpoints
- WHEN the test suite runs
- THEN tests MUST verify `ESTUDIANTE` and `PADRES` cannot read unowned or unlinked student records through direct API calls
