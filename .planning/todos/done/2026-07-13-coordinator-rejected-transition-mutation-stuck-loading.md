---
created: 2026-07-13T00:00:00.000Z
title: Coordinator integrity — rejected-transition mutation + stuck LOADING state
area: player
brief: B
priority: P0
depends_on: []
files:
  - src/services/coordinator/PlayerStateCoordinator.ts
  - src/services/coordinator/transitions.ts
  - src/services/coordinator/__tests__/
---

## Problem

Two defects in `src/services/coordinator/PlayerStateCoordinator.ts`, found in
a full-app review (2026-07-13):

1. **Context mutates on rejected events.** `handleEvent` calls
   `updateContextFromEvent(event)` at line ~281, _before_ checking
   `validation.allowed`. The state machine's core invariant — rejected events
   have no effect — is violated. Failure scenarios:
   - A `SEEK` dispatched while in `LOADING` is rejected by the transition
     table (LOADING has no SEEK entry), yet context.position is overwritten
     and `isSeeking` is set true with no `SEEK_COMPLETE` ever coming.
   - A rejected `PAUSE` still sets `context.isPlaying = false` even though
     `executePause` never runs — and `PlayerService.togglePlayPause()` reads
     exactly that flag to decide PLAY vs PAUSE, so the next tap dispatches the
     wrong command.

2. **No recovery from failed execution.** `executeTransition`'s catch
   (lines ~1308-1314) only logs — the comment even says "We might want to
   dispatch an error event here." Failure scenario: `executeLoadTrack` throws
   (file missing, network down) → machine stays in `LOADING` → per
   `src/services/coordinator/transitions.ts`, LOADING only exits via native
   events (`NATIVE_TRACK_CHANGED`, `QUEUE_RELOADED`, `NATIVE_ERROR`,
   `NATIVE_PLAYBACK_ERROR`) that will never arrive after a JS-side throw, and
   `LOAD_TRACK` is not allowed in LOADING — the user cannot retry with _any_
   book. Playback is dead until app restart.

## Solution

**1. Move context updates behind validation:**

- Relocate `updateContextFromEvent` inside the `validation.allowed` branch of
  `handleEvent`.
- Audit each event case in `updateContextFromEvent` and classify:
  - _Observational_ (reports native reality): `NATIVE_STATE_CHANGED`,
    `NATIVE_PROGRESS_UPDATED`, `NATIVE_TRACK_CHANGED` — these are allowed
    (as transitions or no-ops) in nearly all states already; preserve current
    behavior for all **allowed** paths exactly.
  - _Imperative_ (commands): `PLAY`, `PAUSE`, `SEEK`, `STOP`, `SET_RATE`,
    `SET_VOLUME`, `LOAD_TRACK`, etc. — when rejected, must have zero context
    effect.
- Keep the diagnostic/history recording and trace events for rejected
  transitions (they feed the auto trace dumps — do not lose that).
- Careful with the POS-03 guard and `isLoadingTrack` interplay — read the
  extensive inline comments before moving anything; they document real bugs.

**2. Error recovery in `executeTransition`:**

- In the catch block, dispatch a failure event that routes to `ERROR` (e.g.
  `NATIVE_ERROR` with the caught error), with loop protection:
  - do not re-dispatch if the failing event was itself an error event
  - do not re-dispatch if `currentState` is already `ERROR`/`FATAL_ERROR`
- Confirm `ERROR`'s existing exits (`PLAY`, `LOAD_TRACK`, `STOP`) make retry
  possible from the UI after a failed load.
- Consider adding `STOP: IDLE` to the LOADING row of the transition table so
  users can bail out of a hung load — add only if tests confirm no regression
  in the load → play happy path.

## Verification

- Extend existing tests in `src/services/coordinator/__tests__/`:
  - rejected SEEK in LOADING leaves `context.position` / `isSeeking` untouched
  - rejected PAUSE leaves `context.isPlaying` untouched
  - `executeLoadTrack` throwing lands the machine in ERROR, and a subsequent
    `LOAD_TRACK` transitions to LOADING and succeeds
  - no infinite dispatch loop when the error-path dispatch itself fails
- Full suite green (`npm test`) — the coordinator is heavily tested and
  regressions will surface.
- `npx dpdm --circular src/services/PlayerService.ts` unchanged before/after
  (project rule; do not introduce new cycles).

## Out of scope

- The store-bridge split-brain (`syncStateToStore` currentTrack exception).
- ProgressService heuristics (separate brief H,
  2026-07-13-progressservice-constants-hotpath-lifecycle.md) — land this
  brief first; H depends on it.
