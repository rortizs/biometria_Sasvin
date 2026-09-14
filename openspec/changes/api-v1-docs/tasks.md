# Tasks: Versioned FastAPI Documentation Routes

## Implementation

- [x] Add regression tests for `/api/v1/docs` and `/api/v1/openapi.json`.
- [x] Add compatibility tests for `/api/docs` and `/api/openapi.json`.
- [x] Move canonical FastAPI docs routes under `/api/v1`.
- [x] Preserve legacy documentation URLs.
- [x] Update root metadata to point to `/api/v1/docs`.

## Verification

- [x] RED: docs route regression tests failed against the previous implementation.
- [x] GREEN: targeted docs tests pass.
- [x] Backend test suite passes.
- [x] Frontend production build passes.
- [x] Frontend unit test suite passes.
- [x] E2E suite inspection completed: no E2E suite/config is present in the repo.
- [x] E2E docs smoke script added: `backend/scripts/e2e_docs_smoke.py`.
- [x] RED: `/Users/richardortiz/workspace/Fullstack/biometria_Sasvin/backend/.venv/bin/python scripts/e2e_docs_smoke.py http://127.0.0.1:65534` fails when no server is running.
- [x] GREEN: E2E docs smoke passes on `http://127.0.0.1:8010` against an unshimmed `uvicorn app.main:app` candidate server.
- [x] Local Python 3.14 dependency compatibility fixed by pinning `setuptools<81` so `face_recognition_models` can still import `pkg_resources`.

## Review Workload Forecast

- Estimated changed lines: under 400.
- Chained PRs recommended: No; this is a single focused work unit.
- User requested chained-PR discipline: treat this as PR 1/1 with a review budget under 400 changed lines.
- Decision needed before apply: No.
