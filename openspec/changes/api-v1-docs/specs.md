# Specification: Versioned FastAPI Documentation Routes

## Scenarios

### Scenario 1: Canonical Swagger UI

Given the FastAPI backend is running
When a user requests `GET /api/v1/docs`
Then the response MUST be HTTP 200
And the response body MUST contain Swagger UI
And Swagger UI MUST load the schema from `/api/v1/openapi.json`.

### Scenario 2: Canonical OpenAPI schema

Given the FastAPI backend is running
When a user requests `GET /api/v1/openapi.json`
Then the response MUST be HTTP 200
And the response body MUST be the OpenAPI schema for `Sistema Biométrico de Asistencia — API`.

### Scenario 3: Legacy Swagger compatibility

Given existing users may have bookmarked `/api/docs`
When a user requests `GET /api/docs`
Then the backend SHOULD redirect to `/api/v1/docs`.

### Scenario 4: Legacy OpenAPI compatibility

Given existing clients may fetch `/api/openapi.json`
When a client requests `GET /api/openapi.json`
Then the backend MUST still return HTTP 200 with the OpenAPI JSON schema.

## Non-Goals

- The API business prefix `/api/v1` MUST NOT change.
- The Angular frontend API base URL MUST NOT change.
