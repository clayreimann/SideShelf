---
created: 2026-07-13T00:00:00.000Z
title: Logging — token leakage in persisted logs, eager body reads, deep-link hardening
area: logging
brief: D
priority: P1
depends_on: [C]
files:
  - src/lib/api/api.ts
  - src/lib/logger/index.ts
  - src/app/_layout.tsx
  - src/lib/exportUtils.ts
---

## Problem

Found in a full-app review (2026-07-13). Three issues, one attack chain:

1. **Tokens persist in exportable logs.** The logger persists all logs to a
   SQLite database. Redaction (`redactHeaders` in `src/lib/api/api.ts`)
   covers only the `Authorization` header — not **response bodies**. The
   `api:fetch:detailed` tag (disabled by default via
   `DEFAULT_DISABLED_TAGS` in `src/lib/logger/index.ts:64`) logs full
   request and response bodies at `src/lib/api/api.ts:52-54` and `63-65`.
   `/login` and `/api/me` responses contain access and refresh tokens; the
   login request body contains the password.

2. **Deep links can silently enable it.** `side-shelf://logger?enabled[api:fetch:detailed]=true`
   is processed in `src/app/_layout.tsx:249-308` with no user confirmation —
   any tapped link can flip logger config. Logs are exportable via
   `expo-sharing` (`src/lib/exportUtils.ts`).
   Attack chain: malicious link enables detailed logging → user later shares
   logs for a support request → tokens exfiltrated.

3. **Eager evaluation cost.** In `apiFetch`, the template literal
   ``detailedLog.info(`... body: ${await res.clone().text()}`)`` is
   evaluated _before_ the logger can check whether the tag is enabled. So on
   **every API response in the app** — even with detailed logging disabled
   (the default) — the response is cloned and fully read into a JS string.
   During a full-library sync this doubles parsing work and briefly holds
   multi-MB strings. Also `JSON.stringify(res.headers)` on RN's fetch
   Headers object yields `{}` — the header logging there is a no-op.

## Solution

**1. Lazy evaluation** (`apiFetch`):

- Add/locate an `isEnabled(tag)` (or level-check) fast path on the logger and
  guard both `detailedLog` call sites so that when the tag is disabled, zero
  `res.clone()` / body-read work happens. Alternatively support lazy message
  functions (`log.info(() => ...)`) — pick whichever fits the existing
  logger API with the least churn.
- Replace the useless `JSON.stringify(res.headers)` with the existing
  `redactHeaders` output over an iterated Headers object, or drop it.

**2. Body redaction before persistence:**

- Scrub known credential fields from any logged request/response body:
  `token`, `accessToken`, `refreshToken`, `password`, and the
  `x-refresh-token` header. JSON-aware replacement with a regex fallback for
  non-JSON bodies is acceptable. Apply at the api.ts call sites or centrally
  in the logger persistence layer — implementer's choice; centrally is more
  robust to future call sites.
- Audit `handleResponseError` in `src/lib/api/endpoints.ts` and the login
  flow (`login()` uses raw fetch, not apiFetch) for any path where a body
  containing credentials is interpolated into a log or error message.

**3. Deep-link confirmation** (`src/app/_layout.tsx`):

- Before applying `level[...]` / `enabled[...]` params from a deep link, show
  an in-app confirmation (Alert) listing the requested changes; apply only on
  accept. Cover both the cold-start path (`Linking.getInitialURL`) and the
  warm path (`Linking.addEventListener`).

## Verification

- Unit test: redaction of a synthetic `/login`-shaped and `/api/me`-shaped
  body (assert tokens absent from the persisted/logged string).
- Unit test: with `api:fetch:detailed` disabled, `res.clone` is never called
  (spy on the Response mock).
- Manual: trigger `side-shelf://logger?enabled[api:fetch:detailed]=true` and
  confirm the confirmation dialog appears and declining is a no-op.
- `npm test` fully green.

## Out of scope

- The logger↔appStore circular import — brief C
  (2026-07-13-break-logger-appstore-circular-dependency-enforce-check.md)
  touches the same module and should land **first**.
- General log-volume reduction or log retention policy.
- The bundle-loader deep link (already gated to preview builds).
