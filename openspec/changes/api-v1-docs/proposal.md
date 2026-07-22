# Expose FastAPI Docs Under `/api/v1`

## Problem

The production API uses `/api/v1` for backend endpoints, but FastAPI documentation is currently exposed at `/api/docs`. Users who follow the API prefix and open `/api/v1/docs` receive `{"detail":"Not Found"}`.

## Proposed Change

Make `/api/v1/docs`, `/api/v1/openapi.json`, and `/api/v1/redoc` the canonical documentation routes.

Preserve existing compatibility for current public links:

- `/api/docs` redirects to `/api/v1/docs`.
- `/api/openapi.json` remains available as JSON for existing clients.
- `/api/redoc` redirects to `/api/v1/redoc`.

## Scope

In scope:

- FastAPI docs route configuration.
- Regression tests for canonical and legacy documentation routes.

Out of scope:

- Business API route changes.
- Frontend API base URL changes.
- Deployment infrastructure changes.

## Rollback

Revert the route configuration and docs route tests to restore `/api/docs` as the canonical Swagger path.
