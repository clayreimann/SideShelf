---
created: 2026-07-13T00:00:00.000Z
title: ProgressService — named constants, hot-path cost, lifecycle hygiene
area: progress
brief: H
priority: P3
depends_on: [B]
files:
  - src/services/ProgressService.ts
  - src/db/schema/localData.ts
  - src/db/helpers/localListeningSessions.ts
  - src/index.ts
  - src/types/coordinator.ts
---

## Problem

Found in a full-app review (2026-07-13). `src/services/ProgressService.ts`
(~1,200 lines) works but accumulates four maintainability/performance
issues:

1. **Inconsistent magic numbers.** Staleness is 10 minutes in `startSession`
   (line ~334, inline literal) but 15 minutes (`PAUSE_TIMEOUT`) in
   `updateProgress` and `rehydrateActiveSession`. "Paused" is inferred as

   > 60 s since last update in two places (lines ~608, ~737 — one in ms, one
   > in seconds). "Brand new session" = `currentTime === startTime`.
   > Duplicate-session cleanup uses `currentTime < 5` and a 10-minute age
   > window. None are consistently named or documented; it is unclear which
   > differences are intentional.

2. **Positional throttling misfires.** `Math.floor(currentTime) % 10 === 0`
   (lines ~632 and ~643) throttles by _media position_, not wall time: at 2×
   playback rate it fires half as often per wall-second of listening; if
   ticks repeat within the same media second it double-fires; a seek can
   skip the boundary entirely.

3. **Hot-path cost.** Every 1 Hz progress tick runs `getActiveSession` (a
   query) plus `updateSessionProgress` (a write). The
   `local_listening_sessions` table has **no index** on its hot lookup
   columns — it is the only hot table in `src/db/schema/` without one
   (compare `media_progress_user_library_idx` in
   `src/db/schema/mediaProgress.ts:22`).

4. **Lifecycle.** The constructor starts `setInterval(...)` as an import
   side effect (lines ~97-99) — the 2-minute background sync runs even when
   logged out, and `shutdown()` has no caller. Separately, nearly every
   `dispatchPlayerEvent` in this service hardcodes
   `source: "startup_bootstrap"` (e.g. lines ~413, ~799, ~836) even during
   normal playback — polluting exactly the trace metadata the coordinator's
   diagnostics exist to collect.

## Solution

**1. Named constants:**

- Extract every threshold into named class constants with a one-line "why"
  comment each. Reconcile the 10-vs-15-minute staleness split into ONE
  deliberate value — or two _named_ values if the difference is intentional
  (decide and document the reasoning; if unsure, unify on `PAUSE_TIMEOUT`).
- Unify the two "paused" inferences into one named constant and one helper.

**2. Wall-clock throttles:**

- Replace both `% 10 === 0` checks with a last-dispatch/last-log timestamp
  comparison (wall time).

**3. Hot path:**

- Add a Drizzle index on `local_listening_sessions (user_id,
library_item_id)` in `src/db/schema/localData.ts`, then run
  `npm run drizzle:generate` (project rule for schema changes — expect
  exactly one new migration).
- Cache the active session row in the service, invalidated on session
  start / end / stale-detection / `forceRehydrateSession`, to avoid the
  per-tick `getActiveSession` query.
- **Do NOT change the per-tick write frequency** — `updateSessionProgress`
  every tick is the crash-recovery mechanism; the resume-position guarantee
  depends on it.

**4. Lifecycle + trace metadata:**

- Move periodic-sync startup out of the constructor into an explicit
  `initialize()` called from app init (find `initializeApp` via
  `src/index.ts`), gated on an authenticated user; call `shutdown()` on
  logout (see `AuthProvider.logout`).
- Fix `source` values on all `dispatchPlayerEvent` calls: check the
  `DispatchMeta` type in `src/types/coordinator.ts` for the allowed union
  first — if `"progress_service"` (or similar) isn't a member, extend the
  union rather than reusing a wrong value.

## Constraints

- Land AFTER brief B
  (2026-07-13-coordinator-rejected-transition-mutation-stuck-loading.md) —
  both touch the player event flow; B changes how rejected/error events
  behave.
- Heuristic behavior changes must be conservative: this file encodes
  hard-won offline-sync edge cases (zombie sessions, TrackPlayer-not-
  restored-yet zero positions). Renaming and unifying constants is safe;
  changing their _values_ needs a stated rationale per value.

## Verification

- Existing ProgressService tests pass unchanged where behavior is
  unchanged; add tests for the wall-clock throttle and staleness boundary
  behavior (just-under vs just-over threshold).
- `npm run drizzle:generate` produces exactly one migration; migration
  applies cleanly in the test DB harness (`src/__tests__/utils/testDb.ts`).
- Manual crash-recovery check: play ~2 minutes, force-kill the app,
  relaunch — resume position intact.
- `npm test` fully green.

## Out of scope

- Decomposing ProgressService into collaborators (worthwhile follow-up —
  PlayerService/DownloadService set the pattern — but a separate refactor).
- Sync protocol / server API changes.
- Sync interval values (`SYNC_INTERVAL_*`) — leave as is.
