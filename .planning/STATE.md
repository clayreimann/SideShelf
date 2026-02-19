# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** The coordinator owns player state — services execute its commands and report reality back, not the other way around.
**Current focus:** Phase 4 - State Propagation

## Current Position

Phase: 3.1 (Fix Coordinator Service Bugs) — COMPLETE
Plan: 2 of 2 complete in current phase
Status: 03.1-02 complete — Bug 2 (finished items resume from end) and Bug 3 (mark-as-unfinished position reset) fixed. Phase 3.1 complete.
Last activity: 2026-02-18 — 03.1-02: isFinished guard in resolveCanonicalPosition + mark-as-unfinished resets currentTime/AsyncStorage to 0

Progress: [=======---] 70% (Phase 1 complete; Phase 2 complete; Phase 3 complete; Phase 3.1 complete)

## Performance Metrics

**Velocity:**

- Total plans completed: 6 (Phase 2 complete + Phase 3 complete + Phase 3.1 complete)
- Average duration: 4.2 min
- Total execution time: 25 min

**By Phase:**

| Phase             | Plans   | Total  | Avg/Plan |
| ----------------- | ------- | ------ | -------- |
| 1. Observer Mode  | Shipped | -      | -        |
| 2. Execution Ctrl | 2/2     | 7 min  | 3.5 min  |
| 3. Position Recon | 2/2     | 10 min | 5 min    |
| 3.1 Bug Fixes     | 2/2     | 15 min | 7.5 min  |

**Recent Trend:**

- Last 5 plans: 4 min, 2 min, 8 min, 12 min, 3 min
- Trend: stable ~3-12 min/plan

_Updated after each plan completion_

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 1]: Keep custom FSM over XState — production-validated, XState adds 16.7 kB with no functional gain
- [Phase 1]: observerMode flag preserved as instant rollback for Phase 2+
- [Phase 1]: playerSlice stays as Zustand/React integration layer; becomes read-only proxy in Phase 4
- [All phases]: YOLO rollback posture — 122+ tests + Phase 1 production validation is sufficient confidence
- [Phase 2 Plan 01]: Remove stale nextState !== currentState guard in executeTransition (simplest fix; validation already done in validateTransition)
- [Phase 2 Plan 01]: Remove applySmartRewind import entirely from BGS — coordinator's executePlay handles it via PlayerService
- [Phase 2 Plan 01]: BGS remote handlers are pure event dispatchers — side effects belong in coordinator's executeTransition
- [Phase 2 Plan 02]: executePlay/executePause must guard on event.type (not just nextState) to avoid false firing for same-state no-ops
- [Phase 2 Plan 02]: SET_RATE/SET_VOLUME belong in transition matrix as no-op transitions so validation gate allows executeTransition to call executeSetRate/executeSetVolume
- [Phase 2 Plan 02]: executeStop fires on PlayerState.STOPPING case (not IDLE) — STOP from PLAYING goes PLAYING->STOPPING->IDLE via NATIVE_STATE_CHANGED
- [Phase 2 Bug Fix]: executeLoadTrack early returns (same libraryItemId) must dispatch PLAY — calling TrackPlayer.play() directly bypasses coordinator and leaves it stuck in LOADING/READY
- [Phase 2 Bug Fix]: LOADING → PLAYING transition added to handle PLAY arriving before NATIVE_TRACK_CHANGED
- [Phase 3 Plan 01]: Export MIN_PLAUSIBLE_POSITION and LARGE_DIFF_THRESHOLD from types/coordinator.ts — coordinator owns position, constants co-located there
- [Phase 3 Plan 01]: resolveCanonicalPosition is public so Plan 02's PlayerService callers invoke it directly without indirection
- [Phase 3 Plan 01]: Native-0 guard: skip position=0 update only when isLoadingTrack=true; duration is always safe to update
- [Phase 3 Plan 02]: Mock getCoordinator in PlayerService tests — real coordinator causes event bus subscribe errors in test context; mock returns simple object with resolveCanonicalPosition as jest.fn()
- [Phase 3 Plan 02]: POS-06 documented as platform convention via it.skip with JSDoc — Android dual-coordinator isolation is a platform guarantee (separate JS contexts), not a unit-testable behavior
- [Phase 3 Plan 02]: Module-level DB helper mocks in coordinator tests are safe — existing tests don't call these paths; beforeEach defaults (null/testuser) are inert
- [Phase 3.1 Plan 01]: preSeekState captured in updateContextFromEvent BEFORE transition — at that point currentState is still the origin state (PLAYING/PAUSED)
- [Phase 3.1 Plan 01]: Auto-PLAY dispatched via dispatchPlayerEvent in executeTransition READY case (not from PlayerService execute\*), so EXEC-03 feedback loop tests remain unaffected
- [Phase 3.1 Plan 01]: isSeeking cleared in NATIVE_PROGRESS_UPDATED (real seek-completion signal) not only SEEK_COMPLETE (logical event)
- [Phase 3.1 Plan 01]: shouldOpenOnLongPress on MenuView — single prop makes short press = skip action, long press = interval menu
- [Phase 3.1 Plan 02]: isFinished guard placed BEFORE session position processing in the activeSession branch — finished items skip all session/timestamp comparison logic entirely
- [Phase 3.1 Plan 02]: Both branches (activeSession and savedProgress) get the isFinished guard so whichever branch executes, finished items always return 0
- [Phase 3.1 Plan 02]: AsyncStorage cleared at read time (coordinator) AND write time (UI component) — defense in depth
- [Phase 3.1 Plan 02]: currentTime explicitly set to 0 (not preserved) when marking as unfinished — prevents API and DB divergence

### Roadmap Evolution

- Phase 03.1 inserted after Phase 3: Fix coordinator service bugs (URGENT)

### Pending Todos

None.

### Blockers/Concerns

- [Phase 4]: Sleep timer write path decision (coordinator context vs. retained local write) must be resolved before Phase 4 begins
- [Phase 4]: React Profiler baseline render count measurement needed before any component migration

## Session Continuity

Last session: 2026-02-18
Stopped at: Completed 03.1-02-PLAN.md — Bug 2 (finished items position reset) and Bug 3 (mark-as-unfinished position reset) fixed. Phase 3.1 complete. Ready for Phase 4.
Resume file: None
