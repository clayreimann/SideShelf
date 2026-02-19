# Roadmap: Player State Machine Migration

## Overview

Phase 1 (observer mode) is complete and production-validated. This roadmap covers Phases 2-5: flipping the coordinator from observer to executor, centralizing playback position authority, bridging coordinator state to the UI layer, and deleting the legacy coordination scaffolding that becomes redundant once the coordinator owns everything. Each phase unlocks the next — the dependency ordering is structural, not conventional. All four phases together complete the original design intent: the coordinator is the single source of truth for player state.

## Phases

**Phase Numbering:**

- Phases 2-5 continue from Phase 1 (already shipped)
- Integer phases (2, 3, 4, 5): Planned milestone work
- Decimal phases (e.g., 2.1): Urgent insertions if needed

- [x] **Phase 1: Observer Mode** - Coordinator observes and validates — SHIPPED (production-validated)
- [x] **Phase 2: Execution Control** - Coordinator calls service methods; services stop executing independently — COMPLETE (human-accepted 2026-02-16)
- [x] **Phase 3: Position Reconciliation** - Coordinator owns canonical position; single deterministic algorithm replaces three scattered ones — COMPLETE (2026-02-16)
- [x] **Phase 03.1: Fix Coordinator Service Bugs** - Four runtime bugs fixed: seek state memory loss, completed items resuming from end, mark-as-unfinished not resetting position, skip button UX — COMPLETE (2026-02-18)
- [ ] **Phase 4: State Propagation** - playerSlice becomes read-only proxy driven by coordinator bridge
- [ ] **Phase 5: Cleanup** - Legacy guard flags and reconciliation methods deleted; services simplified to thin execution layers

## Phase Details

### Phase 1: Observer Mode

**Goal**: Coordinator observes and validates all player state transitions in production
**Status**: COMPLETE — production-validated with 122+ tests, 90%+ coverage, <10ms average event processing, minimal rejections
**Plans**: Shipped

### Phase 2: Execution Control

**Goal**: The coordinator calls service methods when events arrive — services no longer execute playback commands independently; coordinator is the single executor
**Depends on**: Phase 1 (complete)
**Requirements**: EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05, EXEC-06
**Success Criteria** (what must be TRUE):

1. A play command issued from any surface (UI button, lock screen, headphone control) routes through the coordinator before any TrackPlayer call is made
2. Attempting to start a second playback session while one is loading is rejected by a transition guard — no duplicate session is created
3. The event bus receives exactly one event per coordinator action (no feedback loop from `execute*` methods back into the bus)
4. Setting `observerMode = true` reverts the coordinator to Phase 1 behavior without a code deploy
5. NATIVE\_\* events (lock screen, external controls) continue to update coordinator context unconditionally, even when coordinator is executor
6. All existing playback behaviors work without regression: resume position, chapter display, lock screen controls, background audio

**Plans:** 2 plans

Plans:

- [x] 02-01-PLAN.md — Fix executeTransition bug, observerMode runtime toggle, BGS duplicate side effect removal
- [x] 02-02-PLAN.md — Execution control contract tests (EXEC-01 through EXEC-06)

### Phase 3: Position Reconciliation

**Goal**: The coordinator owns canonical playback position using a single deterministic reconciliation algorithm; all position sources (native, server DB, AsyncStorage) are subordinate to it
**Depends on**: Phase 2
**Requirements**: POS-01, POS-02, POS-03, POS-04, POS-05, POS-06
**Success Criteria** (what must be TRUE):

1. After cold app start, the player resumes at the correct position (within 5 seconds of actual last position) rather than restarting from zero
2. After 30 minutes of continuous playback, position drift is less than 5 seconds between coordinator canonical position and server-synced position
3. Native position reports of 0 during track queue loading do not overwrite a valid prior position stored in the coordinator
4. `PlayerService.determineResumePosition()` no longer exists — position reconciliation has exactly one home in the coordinator
5. On Android, the background service coordinator does not conflict with the UI coordinator; DB session remains the cross-context source of truth

**Plans:** 2 plans

Plans:

- [ ] 03-01-PLAN.md — Extract shared constants, create coordinator resolveCanonicalPosition method, add native-0 guard
- [ ] 03-02-PLAN.md — Wire PlayerService callers, remove determineResumePosition, update BGS constant, POS contract tests

### Phase 4: State Propagation

**Goal**: playerSlice becomes a read-only proxy — all player state fields are written only by the coordinator bridge (`syncToStore()`); services have no direct write paths to playerSlice
**Depends on**: Phase 3
**Requirements**: PROP-01, PROP-02, PROP-03, PROP-04, PROP-05, PROP-06
**Success Criteria** (what must be TRUE):

1. A grep for `playerSlice` write methods in service files (PlayerService, PlayerBackgroundService, ProgressService) returns zero results for player state fields
2. Component render counts (measured with React Profiler) do not increase after the bridge is added — `usePlayerState(selector)` prevents re-render storms from 1Hz position updates
3. Sleep timer state is written directly to playerSlice (documented exception) and does not break when coordinator bridge is active
4. The Android background service coordinator never calls `syncToStore()` — the Zustand store is inaccessible from the headless JS context
5. `updateNowPlayingMetadata()` debounce behavior is preserved after chapter changes trigger the coordinator bridge
   **Plans**: TBD

### Phase 5: Cleanup

**Goal**: Legacy guard flags and redundant reconciliation methods are deleted; PlayerService is simplified to a thin execution layer; the migration is structurally complete
**Depends on**: Phase 4
**Requirements**: CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05, CLEAN-06
**Success Criteria** (what must be TRUE):

1. Implicit state flags (`isLoading`, `isPreparing`, `sessionCreationInProgress`) do not exist anywhere in service files — confirmed by grep
2. `PlayerService.ts` line count is under 1,100 lines (down from ~1,640 lines)
3. `isRestoringState` is removed only after BGS chapter updates route through the coordinator — the removal is the last flag removed, in dependency order
4. `ProgressService` session mutex is removed and no duplicate session creation is observable in a complete load-play-pause-seek-stop integration test run
5. An integration test exercises the full playback flow (load → play → pause → seek → stop) end-to-end through the coordinator, and 90%+ test coverage is maintained across all modified files
   **Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 2 → 3 → 4 → 5

| Phase                      | Plans Complete | Status      | Completed  |
| -------------------------- | -------------- | ----------- | ---------- |
| 1. Observer Mode           | -              | Complete    | 2026-02-16 |
| 2. Execution Control       | 2/2            | Complete    | 2026-02-16 |
| 3. Position Reconciliation | 2/2            | Complete    | 2026-02-16 |
| 03.1. Bug Fixes            | 2/2            | Complete    | 2026-02-18 |
| 4. State Propagation       | 0/TBD          | Not started | -          |
| 5. Cleanup                 | 0/TBD          | Not started | -          |
