---
phase: 18-sleep-timer-fade-navigation-path-standardization
plan: "01"
subsystem: testing
tags: [tdd, jest, sleep-timer, deep-links, path-normalization, react-native-track-player]

# Dependency graph
requires: []
provides:
  - "RED test stubs for SLEEP-01 sleep timer volume fade (8 cases)"
  - "RED test stubs for NAVIGATION-03 deep link handler (13 cases)"
  - "RED test stubs for DEBT-01 path normalization SQL migration (6 cases)"
affects:
  - "18-03-PLAN (implements sleep fade logic to turn PlayerBackgroundServiceFade tests GREEN)"
  - "18-04-PLAN (implements deepLinkHandler.ts and 0014_normalize_paths.sql to turn remaining tests GREEN)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD Wave 0: write failing tests before implementation — --no-verify for RED stubs with missing-module imports"
    - "normalizePaths test pattern: load migration SQL from disk, run against in-memory testDb, assert row state"
    - "deepLinkHandler test pattern: mock expo-router + useAppStore + eventBus; test standalone exported function"
    - "fade test pattern: mock playerService.executeSetVolume; verify store._setVolume NOT called during fade"

key-files:
  created:
    - src/services/__tests__/PlayerBackgroundServiceFade.test.ts
    - src/services/__tests__/deepLinkHandler.test.ts
    - src/db/helpers/__tests__/normalizePaths.test.ts
  modified: []

key-decisions:
  - "normalizePaths test loads migration SQL from disk (not hardcoded) — tests break if SQL is wrong, pass only when migration is correct"
  - "deepLinkHandler import path is @/lib/deepLinkHandler — Plan 04 must create this file at that exact path"
  - "PlayerBackgroundServiceFade tests access fade logic via _testHandlePlaybackProgressUpdated export — Plan 03 must export this shim from PlayerBackgroundService"
  - "fade tests verify store._setVolume is NOT called — enforces silent-fade requirement"
  - "getSleepTimerRemaining() used for fade window check (not sleepTimer.endTime) — handles both duration and chapter timer types"

patterns-established:
  - "RED test shim pattern: _testHandlePlaybackProgressUpdated export for testing internal background service handlers"
  - "Migration test pattern: PRAGMA foreign_keys = OFF before inserting test rows with FK dependencies"

requirements-completed: [SLEEP-01, NAVIGATION-03, DEBT-01]

# Metrics
duration: 20min
completed: 2026-03-17
---

# Phase 18 Plan 01: TDD Wave 0 — RED Test Stubs Summary

**Three RED test files (27 failing tests) defining the full behavioral contract for sleep timer fade, deep link routing, and path normalization before any implementation exists**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-03-17T20:11:20Z
- **Completed:** 2026-03-17T20:31:00Z
- **Tasks:** 2 of 2
- **Files modified:** 3

## Accomplishments

- Created 8 RED test stubs for SLEEP-01: linear volume fade, cancel restore, silent fade (store not updated), chapter timer compatibility, stop-time restore, guard conditions
- Created 13 RED test stubs for NAVIGATION-03: auth guard, all tab routes (home/library/series/authors/more), item deep link, resume/play-pause actions, unknown scheme no-op
- Created 6 RED test stubs for DEBT-01: file:// prefix stripped, %20/%28/%29 percent-encoding decoded, clean D:/C: paths unchanged, all three tables updated

## Task Commits

Each task was committed atomically:

1. **Task 1: PlayerBackgroundServiceFade test stubs (SLEEP-01 RED)** - `e1a91e2` (test)
2. **Task 2: deepLinkHandler and normalizePaths test stubs (NAVIGATION-03 + DEBT-01 RED)** - `1d6fc9b` (test)

**Plan metadata:** (see final commit after state updates)

_Note: All commits use --no-verify per STATE.md convention — RED stubs intentionally have missing-module imports that lint-staged blocks_

## Files Created/Modified

- `src/services/__tests__/PlayerBackgroundServiceFade.test.ts` — 8 failing tests for SLEEP-01 sleep timer volume fade behavior; accesses fade logic via `_testHandlePlaybackProgressUpdated` export shim
- `src/services/__tests__/deepLinkHandler.test.ts` — 13 failing tests for NAVIGATION-03; imports from `@/lib/deepLinkHandler` which does not yet exist
- `src/db/helpers/__tests__/normalizePaths.test.ts` — 6 failing tests for DEBT-01; loads `0014_normalize_paths.sql` from disk; fails with "file not found" until migration is created

## Decisions Made

- `normalizePaths` test loads migration SQL from disk rather than hardcoding SQL — this ensures the test verifies the actual migration file, not a copy of it
- `deepLinkHandler` tests import from `@/lib/deepLinkHandler` (standalone lib function) not from `_layout.tsx` — Plan 04 must create this file at that exact path for tests to pass
- `PlayerBackgroundServiceFade` tests access the internal handler via `_testHandlePlaybackProgressUpdated` shim — Plan 03 must export this from `PlayerBackgroundService.ts`
- Test for fade cancel uses a two-tick pattern: first tick captures `_preFadeVolume`, second tick with `sleepTimer.type === null` triggers restore
- `PRAGMA foreign_keys = OFF` used in normalizePaths test to insert FK-constrained rows without satisfying all parent table requirements

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all three test files compiled and reached RED state on first run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Three RED test files fully define the behavioral contract for SLEEP-01, NAVIGATION-03, and DEBT-01
- Plans 03 and 04 can implement against these tests as the acceptance criteria
- Plan 03 needs to: (1) export `_testHandlePlaybackProgressUpdated` from `PlayerBackgroundService.ts`, (2) add fade logic, (3) create `0014_normalize_paths.sql`
- Plan 04 needs to: (1) create `src/lib/deepLinkHandler.ts` with exported `handleDeepLinkUrl` function, (2) wire into `_layout.tsx`
- All 852 pre-existing tests continue to pass; only the 27 new RED tests fail

## Self-Check: PASSED

- FOUND: src/services/**tests**/PlayerBackgroundServiceFade.test.ts
- FOUND: src/services/**tests**/deepLinkHandler.test.ts
- FOUND: src/db/helpers/**tests**/normalizePaths.test.ts
- FOUND: .planning/phases/18-sleep-timer-fade-navigation-path-standardization/18-01-SUMMARY.md
- Commits e1a91e2 (task 1) and 1d6fc9b (task 2) verified in git log

---

_Phase: 18-sleep-timer-fade-navigation-path-standardization_
_Completed: 2026-03-17_
