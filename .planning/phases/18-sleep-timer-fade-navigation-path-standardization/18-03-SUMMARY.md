---
phase: 18-sleep-timer-fade-navigation-path-standardization
plan: "03"
subsystem: services
tags: [sleep-timer, volume-fade, react-native-track-player, background-service, tdd]

# Dependency graph
requires:
  - phase: 18-01
    provides: "RED test stubs for SLEEP-01 (8 failing PlayerBackgroundServiceFade tests)"
provides:
  - "Sleep timer volume fade in PlayerBackgroundService — linear ramp to silence over final 30 seconds"
  - "_testHandlePlaybackProgressUpdated export shim for unit testing the background handler"
affects:
  - "18-04-PLAN (path normalization and deep link handler — independent plans)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level fade state (_preFadeVolume) persists across ticks within a test's module lifetime; reset by jest.resetModules() between tests"
    - "Sleep timer guard uses store.player.isPlaying not TrackPlayer.getPlaybackState() — avoids mock instance divergence after jest.resetModules()"
    - "Test shim pattern: attach _testHandlePlaybackProgressUpdated to module.exports via serviceExports property (not ES export const — CJS module.exports overwrites ES exports)"

key-files:
  created: []
  modified:
    - src/services/PlayerBackgroundService.ts

key-decisions:
  - "Use store.player.isPlaying (not TrackPlayer.getPlaybackState()) for the sleep timer fade guard — after jest.resetModules() the test file's top-level TrackPlayer import diverges from the freshly-required module's TrackPlayer instance; store.player.isPlaying reads from the mocked store which remains consistent"
  - "Move sleep timer cancel detection and fade block OUTSIDE the if(ids) guard — fade logic does not need a user session to operate, and tests mock getCurrentUser to return null"
  - "Attach _testHandlePlaybackProgressUpdated to serviceExports before module.exports = trackPlayerBackgroundService — ES module export const is overwritten by module.exports in this CJS file"

patterns-established:
  - "Background service module-level state: cleared on jest.resetModules(); attach test shims to serviceExports object rather than using ES export"

requirements-completed: [SLEEP-01]

# Metrics
duration: 25min
completed: 2026-03-17
---

# Phase 18 Plan 03: Sleep Timer Volume Fade Summary

**Linear volume fade from pre-fade level to silence over final 30 seconds of sleep timer, with cancel restore and expiry restore, implemented in PlayerBackgroundService**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-17T20:35:00Z
- **Completed:** 2026-03-17T21:00:00Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments

- Implemented `_preFadeVolume` module-level state and `FADE_WINDOW_SECONDS = 30` constant in PlayerBackgroundService
- Added cancel detection: when `sleepTimer.type` becomes null mid-fade, `executeSetVolume(_preFadeVolume)` restores volume and clears state
- Added linear fade: each tick inside `[0, 30]` second window calls `executeSetVolume(_preFadeVolume * (remaining / 30))`
- Added expiry restore: when `shouldPause` fires, volume is restored before `cancelSleepTimer()` and `dispatchPlayerEvent({type:"PAUSE"})`
- Exported `_testHandlePlaybackProgressUpdated` shim via `serviceExports` for unit test access
- All 8 `PlayerBackgroundServiceFade` tests GREEN; full test suite passes (879 tests, 0 regressions)

## Task Commits

1. **Task 1: Implement sleep timer volume fade in PlayerBackgroundService** - `6462e79` (feat)

**Plan metadata:** (see final commit after state updates)

## Files Created/Modified

- `src/services/PlayerBackgroundService.ts` — Added fade logic: `_preFadeVolume`, `FADE_WINDOW_SECONDS`, cancel detection block, fade block inside sleep timer check, volume restore on expiry, `_testHandlePlaybackProgressUpdated` export shim

## Decisions Made

- **store.player.isPlaying instead of TrackPlayer.getPlaybackState()**: The test file's top-level `import TrackPlayer` gets the mock from module load time. After `jest.resetModules()` in `afterEach`, freshly-required modules get new mock instances — the test's `TrackPlayer` reference and `PlayerBackgroundService`'s `TrackPlayer` reference diverge. Using `store.player.isPlaying` (from the mocked store) avoids this entirely, and matches the coordinator's view of state anyway.
- **Fade block outside `if(ids)` guard**: The sleep timer fade does not need a user session or library item ID — it only needs the store state and `playerService.executeSetVolume`. Tests mock `getCurrentUser` to return null (no session), so placing fade logic inside `if(ids)` would silently skip it in tests.
- **CJS shim pattern**: The file uses `module.exports = trackPlayerBackgroundService` at the bottom, which overwrites any ES module `export const` declarations. The test accesses `bgService._testHandlePlaybackProgressUpdated` via `require()`, so the shim must be attached to `serviceExports` before `module.exports` is assigned.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used store.player.isPlaying instead of TrackPlayer.getPlaybackState() for fade guard**

- **Found during:** Task 1 (GREEN phase debugging)
- **Issue:** Plan spec showed `isPlaying = state.state === State.Playing` from `TrackPlayer.getPlaybackState()`. After `jest.resetModules()` in test `afterEach`, freshly-required `PlayerBackgroundService` gets a new `TrackPlayer` mock instance not configured by the test's `beforeEach` setup, causing tests 2-6 to silently fail (getPlaybackState returns undefined, outer try/catch swallows the TypeError).
- **Fix:** Moved `getPlaybackState()` call inside `if(ids)` block (for session tracking only). Sleep timer fade guard reads `store.player.isPlaying` which the test controls via `mockUseAppStore.mockReturnValue(buildStoreState({isPlaying: true}))`.
- **Files modified:** src/services/PlayerBackgroundService.ts
- **Verification:** All 8 PlayerBackgroundServiceFade tests GREEN after fix
- **Committed in:** 6462e79 (Task 1 commit)

**2. [Rule 1 - Bug] Moved fade/cancel block outside `if(ids)` guard**

- **Found during:** Task 1 (RED→GREEN debugging)
- **Issue:** Plan diagram placed cancel detection and sleep timer block inside `if(ids)`. Tests mock `getCurrentUser` to return null → `ids` is null → fade code never executed.
- **Fix:** Moved cancel detection and entire sleep timer block (fade + shouldPause logic) to run before `if(ids)`, using `store.player.isPlaying` for the playing guard.
- **Files modified:** src/services/PlayerBackgroundService.ts
- **Verification:** All 8 tests GREEN; full suite passes
- **Committed in:** 6462e79 (Task 1 commit)

**3. [Rule 1 - Bug] Used serviceExports property instead of ES export const for test shim**

- **Found during:** Task 1 (initial RED test run)
- **Issue:** Plan spec said "export const \_testHandlePlaybackProgressUpdated = handlePlaybackProgressUpdated". File uses `module.exports = trackPlayerBackgroundService` at bottom which overwrites ES exports. `require("@/services/PlayerBackgroundService")._testHandlePlaybackProgressUpdated` returned `undefined`.
- **Fix:** Attached to `serviceExports` object (same pattern as `reconnectBackgroundService`): `serviceExports._testHandlePlaybackProgressUpdated = handlePlaybackProgressUpdated`.
- **Files modified:** src/services/PlayerBackgroundService.ts
- **Verification:** `handlePlaybackProgressUpdated` defined in all tests; tests 1-8 pass
- **Committed in:** 6462e79 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (Rule 1 - Bug)
**Impact on plan:** All fixes necessary for behavioral correctness and test compatibility. No scope creep. The functional behavior (fade logic, cancel restore, expiry restore) matches the plan spec exactly — only the implementation location and export mechanism differed.

## Issues Encountered

- None beyond the three auto-fixed deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SLEEP-01 tests are fully GREEN — sleep timer volume fade is implemented and verified
- Plan 18-04 can proceed: deepLinkHandler.ts and 0014_normalize_paths.sql (independent of this plan)
- Full test suite clean: 879 tests, 0 regressions

## Self-Check: PASSED

- FOUND: src/services/PlayerBackgroundService.ts
- FOUND: .planning/phases/18-sleep-timer-fade-navigation-path-standardization/18-03-SUMMARY.md
- FOUND: commit 6462e79 (feat(18-03): implement sleep timer volume fade)

---

_Phase: 18-sleep-timer-fade-navigation-path-standardization_
_Completed: 2026-03-17_
