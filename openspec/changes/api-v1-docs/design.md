# Design: Versioned Documentation Routes

## Decision

Use FastAPI's built-in documentation route configuration for the canonical versioned routes:

- `docs_url="/api/v1/docs"`
- `openapi_url="/api/v1/openapi.json"`
- `redoc_url="/api/v1/redoc"`

Add explicit legacy compatibility routes for previous public documentation URLs.

## Rationale

The frontend and business API already use `/api/v1`. Moving the canonical docs under the same prefix removes the mismatch that produces `{"detail":"Not Found"}` on `/api/v1/docs`.

Keeping legacy compatibility avoids breaking existing bookmarks and tooling that already use `/api/docs` or `/api/openapi.json`.

## Compatibility Strategy

| Legacy URL | Behavior |
|------------|----------|
| `/api/docs` | Redirect to `/api/v1/docs` |
| `/api/openapi.json` | Return OpenAPI JSON directly |
| `/api/redoc` | Redirect to `/api/v1/redoc` |

Returning JSON directly for `/api/openapi.json` is intentional: API clients and tools may not follow redirects as consistently as browsers.
