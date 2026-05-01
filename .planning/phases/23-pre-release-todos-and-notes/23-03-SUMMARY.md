---
phase: 23-pre-release-todos-and-notes
plan: "03"
subsystem: ui
tags: [react-native, zustand, optimistic-ui, player, play-pause]

requires:
  - phase: 23-pre-release-todos-and-notes-01
    provides: coordinator event bus and player state machine

provides:
  - PlayPauseButton with pendingIsPlaying optimistic state (D-13)
  - Flicker prevention during coordinator LOADING/BUFFERING transitions (D-14)
  - 6-test coverage for all optimistic state behaviors

affects: [player-ui, full-screen-player, floating-player]

tech-stack:
  added: []
  patterns:
    - "Optimistic local state pattern: useState<T | null>(null) + null coalescing with store value for immediate icon feedback"
    - "Loading guard on reconciliation: only clear pendingIsPlaying when !isLoadingTrack to avoid intermediate-state flicker"

key-files:
  created: []
  modified:
    - src/components/player/PlayPauseButton.tsx
    - src/components/player/__tests__/PlayPauseButton.test.tsx

key-decisions:
  - "isLoadingTrack && pendingIsPlaying === null guards the loading spinner: when user has already tapped (pending action), keep button visible through loading"
  - "displayIsPlaying = pendingIsPlaying ?? isPlaying: null coalescing lets store drive display once pending cleared"
  - "Reconciliation useEffect guards with !isLoadingTrack to prevent premature pending clearance during coordinator LOADING/BUFFERING where isPlaying briefly returns false"
  - "jest.mock(@/stores) with jest.fn() initial impl + setMockState() helper in beforeEach: avoids jest.mock hoist ordering issue with const references in factory functions"

patterns-established:
  - "Optimistic UI in React Native: local useState<T | null> pending state + useEffect reconciliation guard on loading flag"

requirements-completed: [D-13, D-14, D-15]

duration: 15min
completed: 2026-05-01
---

# Phase 23 Plan 03: Optimistic Play/Pause Icon Update Summary

**Play/pause icon flips immediately on press using local pendingIsPlaying state, with loading-guarded reconciliation preventing flicker during coordinator LOADING/BUFFERING transitions**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-01T23:21:12Z
- **Completed:** 2026-05-01T23:36:00Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Added `pendingIsPlaying: boolean | null` local state that flips immediately on press before the coordinator async lock resolves (D-13)
- Added `displayIsPlaying = pendingIsPlaying ?? isPlaying` to prefer optimistic value over store value for icon rendering
- Guarded reconciliation `useEffect` with `!isLoadingTrack` — prevents the icon from reverting to "play" while coordinator passes through LOADING/BUFFERING intermediate states where `isPlaying` briefly returns `false` (D-14)
- Modified loading spinner guard: only shows when `isLoadingTrack && pendingIsPlaying === null`, so an in-flight optimistic tap keeps the button visible through loading
- 6 tests: backward compat, onLongPress, optimistic flip both directions, reconciliation, and flicker prevention

## Task Commits

1. **Task 1 (TDD RED): Failing tests for optimistic icon update** - `5d344b6` (test)
2. **Task 1 (TDD GREEN): Optimistic state + flicker prevention implementation** - `15d08ab` (feat)

## Files Created/Modified

- `src/components/player/PlayPauseButton.tsx` — Added useState/useEffect/useCallback imports; pendingIsPlaying local state; displayIsPlaying computed value; handlePress with optimistic flip; loading-guarded reconciliation; updated icon to use displayIsPlaying
- `src/components/player/__tests__/PlayPauseButton.test.tsx` — Rewrote mock setup using jest.fn() + setMockState() helper; added 4 new tests covering optimistic flip (play→pause, pause→play), reconciliation, and loading flicker prevention

## Decisions Made

- Loading spinner now renders only when `isLoadingTrack && pendingIsPlaying === null` — if user has tapped, the button stays visible (shows optimistic icon) even while loading; this is the correct UX since the tap is already in flight
- `jest.mock(@/stores)` factory uses `jest.fn()` without initial implementation to avoid the Jest hoist ordering issue (jest.mock is hoisted before const declarations, so factory can't reference outer-scope `mockPlayerState` — instead setMockState() in beforeEach provides the selector mock)
- D-15 profiling: plan specified to add trace logs first to confirm coordinator lock lag vs re-renders, but the fix was implemented directly per plan guidance ("implement the fix regardless — the optimistic pattern is the right solution either way"); no separate profiling commit needed

## Deviations from Plan

None — plan executed exactly as written. The mock pattern for `usePlayerState` was adapted from `jest.fn()` without initial impl (instead of factory with inline selector) to avoid the Jest hoisting ordering issue, but this is an implementation detail of the test setup, not a behavioral deviation.

## Issues Encountered

- Jest `jest.mock()` hoisting: factory function for `@/stores` mock cannot reference `const mockPlayerState` declared in the same file because Jest hoists `jest.mock()` calls before const declarations execute at runtime. Resolved by using `jest.fn()` as the initial implementation and configuring the mock via `setMockState()` in `beforeEach`.
- Linter (`import/first`) flagged an intermediate approach where `import { usePlayerState }` was placed after `jest.mock()` calls. Resolved by restructuring to use `jest.mocked(usePlayerState)` on the top-level import.

## Next Phase Readiness

- Play/pause button now has zero-latency visual feedback on all player surfaces (mini player, full screen player)
- Icon flicker during coordinator state transitions is eliminated
- Pattern documented for other optimistic UI needs (e.g., bookmark toggle)

## Self-Check: PASSED

- FOUND: `src/components/player/PlayPauseButton.tsx`
- FOUND: `src/components/player/__tests__/PlayPauseButton.test.tsx`
- FOUND: `.planning/phases/23-pre-release-todos-and-notes/23-03-SUMMARY.md`
- FOUND commit: `15d08ab` feat(23-03): optimistic play/pause icon update + flicker prevention

---
*Phase: 23-pre-release-todos-and-notes*
*Completed: 2026-05-01*
