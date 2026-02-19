---
phase: 04-state-propagation
plan: 01
subsystem: player
tags: [coordinator, zustand, state-machine, store-bridge, react-native]

# Dependency graph
requires:
  - phase: 03-position-reconciliation
    provides: resolveCanonicalPosition, coordinator owns position logic

provides:
  - syncPositionToStore() — 1Hz lightweight position sync to Zustand
  - syncStateToStore() — full structural sync on all allowed non-progress transitions
  - handleEvent() wiring for bridge calls inside !observerMode block
  - Six bridge unit tests covering all PROP requirements

affects:
  - 04-02 (can now safely remove direct store writes from services)
  - PlayerService, PlayerBackgroundService (Plan 02 will redirect their store writes through coordinator)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Coordinator-to-store bridge: two-tier sync (position-only vs full structural)"
    - "Chapter change debounce via lastSyncedChapterId field"
    - "BGS try/catch guard for headless context Zustand unavailability"
    - "observer mode guard at top of both sync methods"

key-files:
  created: []
  modified:
    - src/services/coordinator/PlayerStateCoordinator.ts
    - src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts

key-decisions:
  - "Two-tier sync: NATIVE_PROGRESS_UPDATED uses syncPositionToStore (position only); all other events use syncStateToStore (full state) — prevents Zustand selector re-evaluation storms at 1Hz"
  - "Chapter change debounce via lastSyncedChapterId: updateNowPlayingMetadata only called when chapter.id changes, not on every structural sync (PROP-06)"
  - "BGS context guard is try/catch not null-check: guards against Zustand throwing entirely, not just returning null"
  - "Sync calls placed inside existing if (!this.observerMode) block after executeTransition — context and state are already advanced before sync runs"
  - "lastPauseTime, sleepTimer, isRestoringState, isModalVisible, initialized explicitly excluded from syncStateToStore — these are service-ephemeral, UI-only, or lifecycle fields"

patterns-established:
  - "Store bridge placement: after executeTransition, inside !observerMode block — ensures side effects are complete before propagation"
  - "Two-tier sync pattern: lightweight (position-only) vs structural (full state) split on event type"

# Metrics
duration: 3min
completed: 2026-02-19
---

# Phase 4 Plan 01: Coordinator-to-Store Bridge Summary

**Zustand store bridge with two-tier sync: 1Hz position-only path via syncPositionToStore() and full structural sync via syncStateToStore(), wired into handleEvent() with observer mode and BGS guards**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-19T05:00:00Z
- **Completed:** 2026-02-19T05:03:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `syncPositionToStore()` private method: calls only `store.updatePosition()` for the 1Hz NATIVE_PROGRESS_UPDATED path, avoiding full state re-evaluation storms
- Added `syncStateToStore()` private method: syncs all 8 coordinator context fields to playerSlice mutators, with chapter-change debounce via `lastSyncedChapterId`
- Wired both methods into `handleEvent()` inside the existing `!observerMode` block, after `executeTransition()` completes
- Six new bridge unit tests covering all PROP requirements: position-only sync, full state sync, observer mode guard, sleepTimer/lastPauseTime exclusion, chapter-change debounce, and BGS error handling

## Task Commits

1. **Task 1: Add syncPositionToStore and syncStateToStore bridge methods** - `94c52b2` (feat)
2. **Task 2: Add bridge unit tests** - `5136f04` (test)

## Files Created/Modified

- `src/services/coordinator/PlayerStateCoordinator.ts` - Added `lastSyncedChapterId` field, `syncPositionToStore()` and `syncStateToStore()` private methods, and bridge wiring in `handleEvent()`
- `src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts` - Added `describe("Store Bridge (Phase 4)")` block with 6 unit tests

## Decisions Made

- Two-tier sync: NATIVE_PROGRESS_UPDATED uses lightweight position-only path; all other allowed events use full structural sync. Prevents Zustand selector re-evaluation storms at 1Hz.
- Chapter change debounce: `lastSyncedChapterId` tracks the last synced chapter ID. `updateNowPlayingMetadata()` is only called when `chapter.id` changes, not on every structural sync.
- BGS guard is `try/catch` (not null-check): catches the case where Zustand throws entirely in the Android headless JS context, not just returns null.
- Sync calls placed inside existing `if (!this.observerMode)` block after `executeTransition()` — context is already updated, state already advanced, side effects already complete.
- Excluded from sync: `lastPauseTime` (service-ephemeral, owned by executePause), `sleepTimer` (PROP-04 exception, UI-driven), `isRestoringState` (playerSlice-local guard), `isModalVisible` (UI-only), `initialized` (lifecycle).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Bridge test for "chapter change" initially failed because the test mock for `CHAPTER_CHANGED` used a flat object instead of the correct `CurrentChapter` structure (`{ chapter: ChapterRow, positionInChapter, chapterDuration }`). Fixed the test mock to use the correct nested structure.

## Next Phase Readiness

- Plan 02 can now safely remove direct store writes from PlayerService, PlayerBackgroundService, and ProgressService — the coordinator bridge handles propagation
- All 112 existing coordinator tests pass (1 skipped by design — POS-06 platform convention)
- TypeScript: no new errors in coordinator files (pre-existing errors in unrelated files)

---

_Phase: 04-state-propagation_
_Completed: 2026-02-19_
