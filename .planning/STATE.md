# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** The coordinator owns player state — services execute its commands and report reality back, not the other way around.
**Current focus:** Milestone v1.1 — Bug Fixes & Polish (not started — defining requirements)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-20 — Milestone v1.1 started

Progress: [░░░░░░░░░░] 0%

## Accumulated Context

### Decisions (v1.0)

Decisions are logged in PROJECT.md Key Decisions table.
Context carried forward from v1.0 migration:

- [Phase 1]: Keep custom FSM over XState — production-validated, XState adds 16.7 kB with no functional gain
- [Phase 1]: observerMode flag preserved as instant rollback for Phase 2+
- [Phase 1]: playerSlice stays as Zustand/React integration layer; became read-only proxy in Phase 4
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
- [Phase 3.1 Plan 01]: preSeekState captured in updateContextFromEvent BEFORE transition — at that point currentState is still the origin state (PLAYING/PAUSED)
- [Phase 3.1 Plan 01]: Auto-PLAY dispatched via dispatchPlayerEvent in executeTransition READY case (not from PlayerService execute\*), so EXEC-03 feedback loop tests remain unaffected
- [Phase 3.1 Plan 01]: isSeeking cleared in NATIVE_PROGRESS_UPDATED (real seek-completion signal) not only SEEK_COMPLETE (logical event)
- [Phase 3.1 Plan 01]: shouldOpenOnLongPress on MenuView — single prop makes short press = skip action, long press = interval menu (appearance only; skip action itself untested — SKIP-01 in v1.1)
- [Phase 3.1 Plan 02]: isFinished guard placed BEFORE session position processing in the activeSession branch — finished items skip all session/timestamp comparison logic entirely
- [Phase 3.1 Plan 02]: Both branches (activeSession and savedProgress) get the isFinished guard so whichever branch executes, finished items always return 0
- [Phase 3.1 Plan 02]: AsyncStorage cleared at read time (coordinator) AND write time (UI component) — defense in depth
- [Phase 3.1 Plan 02]: currentTime explicitly set to 0 (not preserved) when marking as unfinished — prevents API and DB divergence
- [Phase 05]: syncStoreWithTrackPlayer calls in reconnectBackgroundService removed — coordinator bridge propagates all state changes via syncStateToStore
- [Phase 05]: On app foreground (trackPlayerIsPlaying branch), no manual sync needed — coordinator bridge keeps store in sync continuously via NATIVE events
- [Phase 05, Plan 03]: Coordinator reads store.player.currentChapter (not this.context.currentChapter) after updatePosition() — store reflects updated chapter synchronously via Zustand set
- [Phase 05, Plan 03]: Periodic now playing updates (2-second gate) removed alongside chapter detection — coordinator bridge makes them redundant
- [Phase 05, Plan 03]: lastSyncedChapterId shared between syncPositionToStore and syncStateToStore — whichever fires first on a chapter transition sets the debounce, preventing double calls
- [Phase 05]: isRestoringState replaced by coordinator-managed loading.isLoadingTrack in \_updateCurrentChapter (CLEAN-03)
- [Phase 05]: PlayerService.ts duplicate JSDoc blocks removed; 6 duplicate comments + 2 verbose JSDoc condensed, bringing file from 1140 to 1097 lines
- [Phase 05, Plan 05]: Full lifecycle integration test gates Plan 06 (session mutex removal); seek from PAUSED uses NATIVE_PROGRESS_UPDATED as seek completion signal; coverage targets met for coordinator (92.83%) and playerSlice (91.62%)
- [Phase 05, Plan 06]: startSessionLocks mutex removed from ProgressService — coordinator serial queue + BGS existingSession guard (line 729) provide equivalent duplicate-session protection; 37 lines removed, file 1215 → 1178 lines; CLEAN-04 complete; Phase 5 all 6 plans done

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-02-20
Stopped at: v1.1 milestone initialized — defining requirements
Resume file: None
