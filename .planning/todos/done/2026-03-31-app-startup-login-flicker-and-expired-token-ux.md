---
created: 2026-03-31T00:00:00.000Z
completed: 2026-07-17T00:00:00.000Z
title: App startup login flicker and expired token UX
area: auth
phase: 23
files:
  - src/types/auth.ts
  - src/providers/AuthProvider.tsx
  - src/app/index.tsx
  - src/app/login.tsx
  - src/app/(tabs)/_layout.tsx
  - src/components/ui/AppStatusIndicators.tsx
  - src/components/library/LibraryItemDetail/ConsolidatedPlayerControls.tsx
  - src/lib/authNavigation.ts
  - src/lib/helpers/playbackAvailability.ts
  - src/stores/slices/authorsSlice.ts
  - src/stores/slices/seriesSlice.ts
---

## Problem

Two related auth UX issues:

1. **Startup login flicker** — occasionally on launch the app showed the login screen even though the token was still valid. The app needed a distinct initialization state so routing could wait for stored credentials.

2. **Token expiry blocked offline use** — terminal token expiry was treated like an explicit logout, replacing the tab stack even though cached metadata and downloaded media were still usable.

## Final behavior

- Authentication is represented by an explicit `AuthStatus`: `initializing`, `signedOut`, `authenticated`, or `reauthRequired`.
- Only `signedOut` redirects to blocking login. A terminal refresh rejection clears tokens and enters `reauthRequired` while retaining the configured server, username, local user ID, cached slices, and downloads.
- A restart with the retained local identity and cleared tokens reconstructs `reauthRequired`, preserving offline access across force-quit/relaunch.
- Transient network and 5xx refresh failures retain the existing tokens and remain authenticated. Explicit logout remains `signedOut` and continues clearing user data.
- Expiry never automatically opens login or interrupts playback. A shared safe-area status area above both standard and native tabs shows `Session expired` with a translated `Sign in` action and composes with the existing offline indicator.
- The action opens `/login?mode=reauth`. Successful reauthentication dismisses that sheet and returns to the existing route; ordinary login still replaces the app root.
- Cached library, home, author, series, user-profile, and download state continue initializing from local data while reauthentication is required.
- Downloaded playback remains available. Starting a streaming-only item is disabled with translated `Sign in to stream` feedback until authentication succeeds; an already-playing item is not stopped.

## Verification

- Added provider coverage for authenticated, signed-out, terminal expiry, restart reconstruction, transient credential preservation, successful login compatibility, and explicit logout behavior.
- Added navigation policy coverage for blocking login versus reauthentication-sheet behavior.
- Added shared status-area coverage for expiry-only, offline-only, combined, and healthy states, including the `mode=reauth` route.
- Added playback availability coverage for downloaded and streaming-only media.
- Added author/series cache-readiness coverage for database-only initialization.
- Scoped ESLint: zero errors in changed source and test files.
- TypeScript: zero errors in changed files. The repository-wide typecheck still reports pre-existing errors outside this change.
- Full Jest suite: 58 suites passed; 1,067 tests passed and 3 skipped.

## Manual acceptance remaining

- On-device expiry during active downloaded playback, relaunch-before-reauthentication, and route-preservation checks remain appropriate release smoke tests because native audio and iOS form-sheet behavior are not exercised by Jest.
