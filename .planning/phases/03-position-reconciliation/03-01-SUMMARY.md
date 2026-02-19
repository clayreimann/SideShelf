---
phase: 03-position-reconciliation
plan: 01
subsystem: coordinator
tags: [position-reconciliation, state-machine, player-coordinator, typescript]

# Dependency graph
requires:
  - phase: 02-execution-control
    provides: PlayerStateCoordinator with full execution control, isLoadingTrack context flag, POSITION_RECONCILED event type

provides:
  - MIN_PLAUSIBLE_POSITION (5s) and LARGE_DIFF_THRESHOLD (30s) exported as shared constants from src/types/coordinator.ts
  - ResumeSource union type and ResumePositionInfo interface exported from src/types/coordinator.ts
  - resolveCanonicalPosition(libraryItemId) public method on PlayerStateCoordinator implementing full priority chain
  - Native-0 guard in updateContextFromEvent blocking position overwrite during isLoadingTrack=true

affects:
  - 03-02 (will wire PlayerService callers to coordinator.resolveCanonicalPosition)
  - PlayerService.executeLoadTrack and reloadTrackPlayerQueue (Plan 02 callers)
  - PlayerBackgroundService (MIN_PLAUSIBLE_POSITION constant to be unified in Plan 02)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Coordinator-owned position resolution: single resolveCanonicalPosition() method replaces scattered determineResumePosition() calls"
    - "isLoadingTrack guard pattern: gate NATIVE_PROGRESS_UPDATED position-0 updates during track loading via context flag"
    - "No-break constant migration: types added to coordinator.ts while PlayerService still has local copies (Plan 02 removes those)"

key-files:
  created: []
  modified:
    - src/types/coordinator.ts
    - src/services/coordinator/PlayerStateCoordinator.ts

key-decisions:
  - "Export MIN_PLAUSIBLE_POSITION and LARGE_DIFF_THRESHOLD from src/types/coordinator.ts (not a separate positionReconciliation.ts) — constants are coordinator-owned, co-locating with coordinator types is the natural home"
  - "resolveCanonicalPosition is public (not private) so PlayerService callers can invoke it directly in Plan 02 without indirection"
  - "Dispatch POSITION_RECONCILED after resolveCanonicalPosition to ensure context update flows through event bus — context.position is also set directly for immediate availability"
  - "Native-0 guard: only skip position update when isLoadingTrack=true AND position=0; duration update is always safe"

patterns-established:
  - "resolveCanonicalPosition pattern: coordinator method resolves, updates context.position, dispatches POSITION_RECONCILED, syncs AsyncStorage"
  - "Pre-existing TS errors are baseline: verify new errors vs baseline before each task"

# Metrics
duration: 2min
completed: 2026-02-17
---

# Phase 3 Plan 01: Position Reconciliation Infrastructure Summary

**Coordinator-owned resolveCanonicalPosition() method with DB session > savedProgress > AsyncStorage > store priority chain, plus native-0 guard blocking false position resets during track loading (POS-02, POS-03)**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-17T04:18:14Z
- **Completed:** 2026-02-17T04:20:41Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- MIN_PLAUSIBLE_POSITION (5s) and LARGE_DIFF_THRESHOLD (30s) are now exported shared constants from src/types/coordinator.ts — no more hardcoded inline duplicates
- Coordinator has resolveCanonicalPosition(libraryItemId) implementing the full 4-source priority chain (DB session > savedProgress > AsyncStorage > store) including implausibility checks and timestamp-based discrepancy resolution
- Native-0 guard added to NATIVE_PROGRESS_UPDATED: when isLoadingTrack=true and position=0, position is not overwritten (duration update still applied)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract shared constants and types to coordinator types** - `860678f` (feat)
2. **Task 2: Add resolveCanonicalPosition method and native-0 guard to coordinator** - `61d6c7a` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `src/types/coordinator.ts` - Added MIN_PLAUSIBLE_POSITION, LARGE_DIFF_THRESHOLD, ResumeSource, ResumePositionInfo exports at bottom of file
- `src/services/coordinator/PlayerStateCoordinator.ts` - Added 7 new imports, native-0 guard in updateContextFromEvent, and resolveCanonicalPosition() method in new "Position Reconciliation" section between Context Management and Event Bus Integration

## Decisions Made

- Export constants from src/types/coordinator.ts (not a separate positionReconciliation.ts) — coordinator owns position, types are co-located there naturally
- resolveCanonicalPosition is public so Plan 02's PlayerService callers can invoke it directly without indirection
- Dispatch POSITION_RECONCILED after resolution so context update is observable via event bus; also set context.position directly for immediate in-method availability
- Only skip position=0 update when isLoadingTrack=true; duration is always safe to update

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in src/**tests**/mocks/database.ts, src/services/coordinator/**tests**/PlayerStateCoordinator.test.ts, and other files were confirmed as baseline before starting and do not affect this plan's deliverables.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 (03-02) can now wire PlayerService.executeLoadTrack() and reloadTrackPlayerQueue() to call coordinator.resolveCanonicalPosition() instead of the private determineResumePosition()
- MIN_PLAUSIBLE_POSITION in PlayerBackgroundService.ts (line 744) should be unified to import from types/coordinator.ts in Plan 02
- All 500 tests pass; no regressions introduced

---

_Phase: 03-position-reconciliation_
_Completed: 2026-02-17_
