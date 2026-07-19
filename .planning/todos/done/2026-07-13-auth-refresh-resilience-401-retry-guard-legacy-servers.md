---
created: 2026-07-13T00:00:00.000Z
title: Auth resilience — refresh failures, 401 retry loop, legacy servers
area: auth
brief: A
priority: P0
depends_on: []
files:
  - src/services/ApiClientService.ts
  - src/lib/api/api.ts
  - src/providers/AuthProvider.tsx
  - src/db/helpers/tokens.ts
---

## Problem

Three related defects in the token lifecycle, found in a full-app review (2026-07-13):

1. **Network blips destroy sessions.** `performTokenRefresh` in
   `src/services/ApiClientService.ts:219-224` calls `clearTokens()` in its
   catch block on _any_ error — including fetch timeouts and offline failures.
   Failure scenario: a request 401s on flaky cellular → refresh request times
   out → catch fires → tokens wiped → user force-logged-out with
   "Session expired". The user did nothing wrong and their refresh token was
   still valid. This is likely a contributor to the existing todo
   `2026-03-31-app-startup-login-flicker-and-expired-token-ux.md` (expired
   token blocks offline use) — read that todo before starting; the two should
   not conflict.

2. **Unbounded 401 recursion.** `src/lib/api/api.ts:66-73`: on a 401,
   `apiFetch` calls `handleUnauthorized()`, and on success recursively calls
   itself with the same arguments — no depth guard. Failure scenario: server
   keeps returning 401 on the resource (revoked user, permission-scoped
   endpoint, reverse-proxy auth mismatch) while `/auth/refresh` keeps
   succeeding → infinite refresh/retry loop hammering the server.

3. **Legacy-server login silently breaks.** `src/providers/AuthProvider.tsx:175`
   asserts `refreshToken!` (non-null). Audiobookshelf servers older than v2.26
   return only `user.token` with no refresh token (see
   `extractTokensFromAuthResponse` in `src/db/helpers/tokens.ts`, which
   explicitly models this by returning `refreshToken: null`). Login appears to
   succeed; then the first 401 finds no refresh token, `performTokenRefresh`
   clears everything, and the user is force-logged-out with no explanation.

## Solution

**1. Refresh failure discrimination** (`ApiClientService.performTokenRefresh`):

- Only call `clearTokens()` when the server _definitively rejects_ the refresh:
  HTTP 401 or 403 from `POST /auth/refresh`.
- On network-level failures (fetch throw/abort, timeout) and on 5xx responses:
  return `false` **without** clearing tokens. The current request fails, but
  the session survives for a later retry.
- Keep the single-flight mutex (`refreshPromise`) behavior exactly as is.

**2. One-retry guard** (`apiFetch` in `src/lib/api/api.ts`):

- Add an internal retry flag (private wrapper or an internal-only option) so
  that after one successful refresh + one retry, a second 401 is returned to
  the caller as-is instead of triggering another refresh cycle.

**3. Legacy server handling** (login path in `AuthProvider.login`):

- Remove the `refreshToken!` assertion. When `refreshToken` is null after
  login, pick one of (implementer's call — document the choice in code):
  - **(a) Reject login** with a clear error: "This server version is not
    supported; SideShelf requires Audiobookshelf ≥ 2.26." Surface it through
    the existing login error path.
  - **(b) Support token-only auth**: store the access token with no refresh
    token, and treat a later 401 as terminal (session expired) rather than
    attempting refresh.
- `ApiClientService.setTokens` signature currently requires a non-null
  `refreshToken: string` — adjust typing to match whichever choice is made.

**4. Message accuracy** (`AuthProvider` line ~104):

- The "Session expired" `loginMessage` should only be set on genuine auth
  rejection. After change 1, verify the subscription-based state sync no
  longer produces this message on transient network failures (it shouldn't,
  since tokens are no longer cleared — but confirm).

## Verification

- Unit tests for `ApiClientService.performTokenRefresh`:
  - refresh responds 401/403 → tokens cleared, returns false
  - refresh fetch throws / times out → tokens **retained**, returns false
  - refresh responds 5xx → tokens retained, returns false
  - refresh responds 200 with tokens → tokens rotated, returns true
- Unit test for `apiFetch`: an endpoint that persistently 401s triggers
  exactly one refresh and one retry, then surfaces the 401.
- Unit test for login with a response missing `refreshToken` (shape per
  `extractTokensFromAuthResponse`), asserting the chosen behavior.
- `npm test` fully green.

## Out of scope

- Server-side logout / refresh-token revocation on logout (note as TODO if
  the area is touched).
- Offline-access UX from the 2026-03-31 todo (separate work; just don't
  conflict with it).
- Any UI changes beyond the message condition.
