# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** The coordinator owns player state — services execute its commands and report reality back, not the other way around.
**Current focus:** Phase 4 - State Propagation

## Current Position

Phase: 4 of 5 (State Propagation)
Plan: 3 of 3 in current phase (complete)
Status: Phase 4 complete — PROP-01 through PROP-06 contract tests added; coordinator bridge proven as single write authority across all three service files
Last activity: 2026-02-19 — 04-03: PROP contract tests; full lifecycle verification, sleep timer isolation, BGS graceful failure, chapter debounce

Progress: [==========] 89% (Phase 1 complete; Phase 2 complete; Phase 3 complete; Phase 4 complete)

## Performance Metrics

**Velocity:**

- Total plans completed: 6 (Phase 2 complete + Phase 3 complete + Phase 3.1 complete)
- Average duration: 4.2 min
- Total execution time: 25 min
- Total plans completed: 5 (Phase 4 Plan 01 complete)
- Average duration: 3.2 min
- Total execution time: 20 min
- Total plans completed: 7 (Phase 4 complete)
- Average duration: 3.7 min
- Total execution time: 43 min

**By Phase:**

| Phase             | Plans   | Total  | Avg/Plan |
| ----------------- | ------- | ------ | -------- |
| 1. Observer Mode  | Shipped | -      | -        |
| 2. Execution Ctrl | 2/2     | 7 min  | 3.5 min  |
| 3. Position Recon | 2/2     | 10 min | 5 min    |
| 3.1 Bug Fixes     | 2/2     | 15 min | 7.5 min  |
| 4. State Prop     | 3/3     | 26 min | 8.7 min  |

**Recent Trend:**

- Last 5 plans: 4 min, 2 min, 8 min, 12 min, 3 min, 3 min, 8 min
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
- [Phase 4 Plan 01]: Two-tier sync: NATIVE_PROGRESS_UPDATED uses syncPositionToStore (position only); all other events use syncStateToStore (full state) — prevents 1Hz Zustand selector storms
- [Phase 4 Plan 01]: Chapter change debounce via lastSyncedChapterId — updateNowPlayingMetadata only fires on actual chapter.id change, not every structural sync (PROP-06)
- [Phase 4 Plan 01]: BGS guard is try/catch (not null-check) — catches Zustand throwing entirely in Android headless JS context (PROP-05)
- [Phase 4 Plan 01]: Sync calls placed inside existing !observerMode block after executeTransition — context and state already advanced, side effects complete before propagation
- [Phase 4 Plan 02]: RELOAD_QUEUE case added to coordinator updateContextFromEvent — enables removal of direct store.\_setTrackLoading(true) from reloadTrackPlayerQueue
- [Phase 4 Plan 02]: NATIVE_STATE_CHANGED clears isLoadingTrack when state===Playing — mirrors removed BGS direct write
- [Phase 4 Plan 02]: NATIVE_PLAYBACK_ERROR dispatched from BGS + clears isLoadingTrack in coordinator — enables bridge propagation (was direct store write)
- [Phase 4 Plan 02]: BGS chapter-change updateNowPlayingMetadata RETAINED — CHAPTER_CHANGED never dispatched; bridge path dead (Phase 5 candidate)
- [Phase 4 Plan 03]: PROP-02 documented as structurally satisfied (usePlayerState is a one-liner delegate to useAppStore(selector))
- [Phase 4 Plan 03]: PROP-03 documented with manual verification command — mocked store prevents real Zustand selector reactivity testing in Jest
- [Phase 4 Plan 03]: Task 2 required no code changes — PlayerService tests were already updated during Plan 02

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-19
Stopped at: Completed 04-03-PLAN.md — Phase 4 complete. PROP-01 through PROP-06 contract tests prove coordinator bridge is correct and complete. Phase 5 (Component Migration) is next.
Resume file: None
