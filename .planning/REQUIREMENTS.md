# Requirements: Player State Machine Migration

**Defined:** 2026-02-16
**Core Value:** The coordinator owns player state — services execute its commands and report reality back, not the other way around.

## v1 Requirements

Requirements for completing the migration (Phases 2–5). Phase 1 (observer mode) is already validated in production.

### Execution Control (Phase 2)

- [ ] **EXEC-01**: Coordinator calls service methods when events arrive (not just observes)
- [ ] **EXEC-02**: Transition guards prevent invalid operations (duplicate sessions, play-when-loading, seek-when-idle)
- [ ] **EXEC-03**: Test suite asserts exactly one event is dispatched per coordinator action (feedback loop prevention)
- [ ] **EXEC-04**: `observerMode` flag preserved and functional for instant rollback
- [ ] **EXEC-05**: NATIVE\_\* events continue to update coordinator context unconditionally (confirmation + external control handling)
- [ ] **EXEC-06**: All existing playback behaviors work without regression (resume position, chapter display, lock screen controls, background audio)

### Position Reconciliation (Phase 3)

- [ ] **POS-01**: Coordinator owns canonical position with defined priority: native player > server DB > AsyncStorage > zero
- [ ] **POS-02**: `MIN_PLAUSIBLE_POSITION` threshold preserved in reconciliation algorithm (prevents position-0 false starts)
- [ ] **POS-03**: Native position-0-before-queue-loaded edge case handled (coordinator does not overwrite valid position with 0 during load)
- [ ] **POS-04**: `determineResumePosition()` removed from PlayerService after coordinator owns position
- [ ] **POS-05**: Position drift <5 seconds over 30-minute playback session
- [ ] **POS-06**: Android BGS coordinator instance does not conflict with UI coordinator (DB session remains cross-context truth)

### State Propagation (Phase 4)

- [ ] **PROP-01**: playerSlice receives all player state from coordinator (no direct writes from services to playerSlice)
- [ ] **PROP-02**: `usePlayerState()` hook supports selector-based subscriptions (prevents re-render storms from 1Hz position updates)
- [ ] **PROP-03**: React component render counts do not increase after bridge is added (validated with profiler)
- [ ] **PROP-04**: Sleep timer state retained as playerSlice-local (documented exception to read-only proxy pattern)
- [ ] **PROP-05**: Android BGS does not call `syncToStore()` (separate JS context enforcement)
- [ ] **PROP-06**: `updateNowPlayingMetadata()` debounce behavior preserved after bridge is added

### Cleanup (Phase 5)

- [ ] **CLEAN-01**: Implicit state flags removed: `isLoading`, `isPreparing`, `sessionCreationInProgress` in services
- [ ] **CLEAN-02**: `PlayerService.ts` reduced from ~1640 lines to under 1100 lines
- [ ] **CLEAN-03**: `isRestoringState` removed last, only after BGS chapter updates route through coordinator
- [ ] **CLEAN-04**: ProgressService session mutex removed after coordinator serial queue is confirmed as the effective guard
- [ ] **CLEAN-05**: Integration tests cover full playback flow through coordinator (load → play → pause → seek → stop)
- [ ] **CLEAN-06**: 90%+ test coverage maintained across all modified files

## v2 Requirements

Deferred — not in current migration scope.

### Enhanced Diagnostics

- **DIAG-01**: Coordinator diagnostics exportable to crash reporting service (not just local JSON)
- **DIAG-02**: Position drift metric tracked and reported per session

### Performance

- **PERF-01**: `NATIVE_PROGRESS_UPDATED` events bypass async-lock for lower-latency position updates (requires explicit safety analysis)

## Out of Scope

| Feature                                   | Reason                                                                |
| ----------------------------------------- | --------------------------------------------------------------------- |
| Full playerSlice removal                  | Zustand/React integration is valuable; become read-only proxy instead |
| Changing state machine topology           | Phase 1 validated the transition matrix — it stays                    |
| New player features                       | This is a migration, not a feature addition                           |
| XState or other FSM library adoption      | No benefit; adds 16.7kB gzipped for zero functional gain              |
| Performance optimization beyond migration | Don't optimize what isn't measured as slow                            |
| Sleep timer migration to coordinator      | UI-only state; not execution state; intentional exception             |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase   | Status  |
| ----------- | ------- | ------- |
| EXEC-01     | Phase 2 | Pending |
| EXEC-02     | Phase 2 | Pending |
| EXEC-03     | Phase 2 | Pending |
| EXEC-04     | Phase 2 | Pending |
| EXEC-05     | Phase 2 | Pending |
| EXEC-06     | Phase 2 | Pending |
| POS-01      | Phase 3 | Pending |
| POS-02      | Phase 3 | Pending |
| POS-03      | Phase 3 | Pending |
| POS-04      | Phase 3 | Pending |
| POS-05      | Phase 3 | Pending |
| POS-06      | Phase 3 | Pending |
| PROP-01     | Phase 4 | Pending |
| PROP-02     | Phase 4 | Pending |
| PROP-03     | Phase 4 | Pending |
| PROP-04     | Phase 4 | Pending |
| PROP-05     | Phase 4 | Pending |
| PROP-06     | Phase 4 | Pending |
| CLEAN-01    | Phase 5 | Pending |
| CLEAN-02    | Phase 5 | Pending |
| CLEAN-03    | Phase 5 | Pending |
| CLEAN-04    | Phase 5 | Pending |
| CLEAN-05    | Phase 5 | Pending |
| CLEAN-06    | Phase 5 | Pending |

**Coverage:**

- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0 ✓

---

_Requirements defined: 2026-02-16_
_Last updated: 2026-02-16 after initial definition_
