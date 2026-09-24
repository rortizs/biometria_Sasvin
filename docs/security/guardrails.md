# Security Guardrails

This slice adds baseline browser, container, and supply-chain guardrails for the
biometric attendance stack.

## Browser headers

The frontend nginx config emits these headers for SPA, static asset, and PWA
responses:

- `Content-Security-Policy` scoped to the same origin, with websocket support for
  the existing `/api/v1/ws/` channel.
- `Strict-Transport-Security` for HTTPS clients behind Traefik TLS termination.
- `Permissions-Policy` with only same-origin geolocation enabled because the app
  includes location-aware attendance flows.
- `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy`.

nginx also disables version disclosure with `server_tokens off` and hides
upstream `X-Powered-By` headers from proxied API responses.

## Container hardening

- Frontend now uses `nginxinc/nginx-unprivileged` and listens on port `8080`.
- Compose services opt into `no-new-privileges` and drop Linux capabilities.
- Frontend and backend root filesystems are read-only, with tmpfs mounts for
  runtime scratch paths.
- Backend still runs as the non-root `appuser` from the Dockerfile.

## CI and dependency scanning

`.github/workflows/security-ci.yml` validates Docker Compose/nginx config, builds
and audits the Angular frontend, audits Python requirements with `pip-audit`, and
compiles backend Python sources. The workflow uses read-only repository
permissions and does not require secrets.

Dependabot is configured for npm, pip, Docker base images, and GitHub Actions.
