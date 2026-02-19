# Phase 3: Position Reconciliation - Research

**Researched:** 2026-02-16
**Domain:** Audio player position management — multi-source reconciliation, coordinator migration, Android dual-context isolation
**Confidence:** HIGH (all findings based on direct codebase inspection)

## Summary

Phase 3 migrates position reconciliation logic from `PlayerService.determineResumePosition()` into the `PlayerStateCoordinator`. Currently, position reconciliation is split across at least four locations: `determineResumePosition()` in PlayerService (called in two places), `restorePersistedState()` in playerSlice, `handleActiveTrackChanged()` in PlayerBackgroundService, and `reconcileTrackPlayerState()` in PlayerService. Each location has its own MIN_PLAUSIBLE_POSITION constant (5 seconds) hardcoded inline — the value is duplicated, not shared.

The coordinator already has a `POSITION_RECONCILED` event type defined, context fields for tracking position, and the `positionReconciliationCount` metric. The infrastructure exists; it just isn't wired to perform reconciliation. The main work is: (1) extracting `determineResumePosition()` logic into a coordinator-owned method, (2) hooking that method into the LOADING → READY or LOADING → PLAYING transition, (3) ensuring native position-0 during queue load does not overwrite a valid prior position, and (4) ensuring the Android BGS coordinator does not conflict with the UI coordinator by establishing the DB session as the cross-context truth (which it already is for the BGS's own writes).

The "native 0 before queue loaded" problem is already partially solved: the BGS `handleActiveTrackChanged()` has a `MIN_PLAUSIBLE_POSITION` guard that prefers store position when TrackPlayer reports <5 seconds. The coordinator context also has an `isLoadingTrack` flag that could gate position updates. The key design question is when to trust native position-0 as "real zero" vs "not yet loaded".

**Primary recommendation:** Move `determineResumePosition()` into a private method on the coordinator, call it during the LOADING transition (after executeLoadTrack places tracks in the queue), dispatch `POSITION_RECONCILED` with the result, and have executeLoadTrack consume the coordinator's position rather than running its own lookup. Remove the duplicated call in `reloadTrackPlayerQueue()` as well.

---

## Standard Stack

### Core (no new dependencies needed)

| Component                              | Version  | Purpose                                | Status         |
| -------------------------------------- | -------- | -------------------------------------- | -------------- |
| `async-lock`                           | existing | Serial event processing in coordinator | Already in use |
| `PlayerStateCoordinator`               | Phase 2  | Owns canonical state                   | Already in use |
| `ProgressService.getCurrentSession()`  | existing | DB session as position source          | Already in use |
| `getMediaProgressForLibraryItem()`     | existing | Saved progress fallback                | Already in use |
| `ASYNC_KEYS.position` via `asyncStore` | existing | AsyncStorage position fallback         | Already in use |
| `TrackPlayer.getProgress()`            | existing | Native position source                 | Already in use |

No new libraries are needed. Phase 3 is a pure refactor of existing logic into the right place.

---

## Architecture Patterns

### Current Position Resolution — As-Is

Position is determined in **four separate places**, each with slightly different logic:

#### 1. `PlayerService.determineResumePosition()` (lines 647–761)

Called by:

- `executeLoadTrack()` (line 365) — full track load
- `reloadTrackPlayerQueue()` (line 585) — queue rebuild after JS context recreation

Priority order (most-to-least authoritative):

1. Active DB session (`getActiveSession`) — with plausibility checks
2. Saved DB progress (`getMediaProgressForLibraryItem`) — fallback if session is implausible
3. AsyncStorage position (`ASYNC_KEYS.position`) — final fallback
4. Zustand store position — last resort (source = "store")

Special cases handled:

- `sessionPosition < MIN_PLAUSIBLE_POSITION` → reject, prefer savedProgress or AsyncStorage
- `positionDiff > LARGE_DIFF_THRESHOLD (30s)` → prefer newer timestamp between session vs savedProgress
- Syncs AsyncStorage to authoritative value after picking

#### 2. `playerSlice.restorePersistedState()` (lines 132–361)

Called on cold app start. Sequence:

1. Restore from AsyncStorage (track, playbackRate, volume, position, isPlaying, sessionId)
2. Reconcile with DB session — if DB session exists and diff > 1s, use DB session's `currentTime`
3. Best-effort: apply position to TrackPlayer if queue is non-empty
4. Dispatch `RESTORE_STATE` → `RESTORE_COMPLETE` to coordinator

Does NOT implement the MIN_PLAUSIBLE_POSITION check — just uses raw DB currentTime.

#### 3. `PlayerBackgroundService.handleActiveTrackChanged()` (lines 744–763)

Called when native track changes during playback. Gets start position for new session:

1. Try `TrackPlayer.getProgress().position`
2. If `startPosition < MIN_PLAUSIBLE_POSITION` and `store.player.position >= MIN_PLAUSIBLE_POSITION`, use store position
3. No AsyncStorage fallback here — relies on `progressService.startSession()` having fallback logic

This is the primary "native 0 before queue loaded" guard that already exists.

#### 4. `PlayerService.reconcileTrackPlayerState()` (lines 1184–1375)

Full reconciliation for foreground restore. Compares TrackPlayer position vs DB session. Uses a `STALE_SESSION_THRESHOLD` of 60 seconds — if DB session >60s old and TrackPlayer is ahead, prefer TrackPlayer.

### MIN_PLAUSIBLE_POSITION — Current State

The constant `5` (seconds) is hardcoded in two separate files:

- `PlayerService.ts:655` — `const MIN_PLAUSIBLE_POSITION = 5;`
- `PlayerBackgroundService.ts:744` — `const MIN_PLAUSIBLE_POSITION = 5;`

There is no shared constant. Phase 3 must extract this into a shared constant, ideally in `src/types/coordinator.ts` or a dedicated `positionReconciliation.ts` helper.

### Coordinator — Current Position Infrastructure

The coordinator has:

- `context.position` — updated from `NATIVE_PROGRESS_UPDATED`, `SEEK`, `QUEUE_RELOADED`, `POSITION_RECONCILED`, `RESTORE_STATE`, and `STOP`
- `context.isLoadingTrack` — set true on `LOAD_TRACK`, cleared on `QUEUE_RELOADED`
- `POSITION_RECONCILED` event type with payload `{ position: number }` — defined but no executeTransition handler
- `positionReconciliationCount` metric — incremented on `POSITION_RECONCILED`
- Transition: `RESTORING -> READY` via `POSITION_RECONCILED`, `SYNCING_POSITION -> READY` via `POSITION_RECONCILED`

The coordinator currently does NOT:

- Guard `NATIVE_PROGRESS_UPDATED` position-0 updates during track loading
- Execute any position reconciliation logic itself
- Own or reference MIN_PLAUSIBLE_POSITION

### Android BGS Dual-Coordinator Architecture

From `PlayerBackgroundService.ts` line 44–52:

```typescript
/**
 * HEADLESS JS ARCHITECTURE NOTE:
 *
 * On Android, this service runs in a SEPARATE JavaScript context from the main UI.
 * This means:
 * - There are TWO separate PlayerStateCoordinator instances (UI + background)
 * - NO shared memory between contexts
 * - Communication happens through: Native TrackPlayer state, Database, AsyncStorage
 *
 * The getCoordinator() call below ensures the background context has its own
 * coordinator instance to receive events dispatched from this service.
 * Both coordinators stay eventually consistent by observing the same native player.
 */
getCoordinator();
```

The BGS already calls `getCoordinator()` at module level, creating its own BGS-context coordinator. Both coordinators observe the same native TrackPlayer. DB session is the cross-context source of truth — the BGS writes positions via `progressService.updateProgress()`, which writes to the DB. The UI coordinator reads from DB on reconciliation.

**POS-06 is largely already satisfied by convention.** The risk area is if Phase 3 introduces a coordinator-owned reconciliation method that one coordinator context calls while the other has stale data. Since the BGS coordinator only runs in the BGS context and the UI coordinator only runs in the UI context, and both read from DB, there is no conflict as long as neither writes directly to the other's in-memory state (which they cannot — separate JS contexts on Android).

---

## Don't Hand-Roll

| Problem                     | Don't Build                    | Use Instead                                                                            | Why                                                  |
| --------------------------- | ------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Position source priority    | New priority queue abstraction | Extend existing `determineResumePosition()` logic, move it into coordinator            | Logic is tested and working; just needs relocation   |
| Shared constants            | Separate config file           | Export `MIN_PLAUSIBLE_POSITION` from `types/coordinator.ts` or a shared constants file | One source of truth, easy to find                    |
| "Is queue loaded" detection | New flag or polling            | Use existing `context.isLoadingTrack` flag in coordinator                              | Already set on LOAD_TRACK, cleared on QUEUE_RELOADED |
| Cross-context position sync | IPC/message passing            | DB session already serves this role                                                    | Reinventing what already works                       |

---

## Common Pitfalls

### Pitfall 1: "Native 0 = not loaded" vs "Native 0 = actually at start"

**What goes wrong:** After `TrackPlayer.reset()` + `TrackPlayer.add(tracks)`, the native player reports `position: 0` for a brief period before the track is seeked. If the coordinator processes `NATIVE_PROGRESS_UPDATED { position: 0 }` during LOADING state and writes it to `context.position`, it overwrites the valid prior position that was just resolved by `determineResumePosition()`.

**Why it happens:** `NATIVE_PROGRESS_UPDATED` is a no-op event (no state transition), so it's processed in ALL states including LOADING. The coordinator's `updateContextFromEvent` currently writes position unconditionally: `case "NATIVE_PROGRESS_UPDATED": this.context.position = event.payload.position`.

**How to avoid:** Gate the NATIVE_PROGRESS_UPDATED context update: if `context.isLoadingTrack` is true AND `event.payload.position === 0`, do NOT overwrite `context.position`. The coordinator should only accept native 0 when it knows the queue is loaded and playback is active.

Alternatively: treat position-0 native reports during LOADING state as suspect — reject them in `updateContextFromEvent`.

**Warning signs:** After loading a book at position 1800s, the position in the coordinator resets to 0 immediately after the NATIVE_PROGRESS_UPDATED fires. The coordinator's transition history will show LOADING state with a NATIVE_PROGRESS_UPDATED event overwriting the position.

### Pitfall 2: Calling determineResumePosition() before tracks are in the queue

**What goes wrong:** `determineResumePosition()` currently runs inside `executeLoadTrack()` after `TrackPlayer.add(tracks)`. If moved to the coordinator, it must be invoked at the right moment — after tracks are queued but before/during the seek. If called too early (before `TrackPlayer.add()`), the subsequent `TrackPlayer.seekTo()` inside `executeLoadTrack()` may fail silently.

**How to avoid:** The reconciliation method on the coordinator should be invoked from within `executeLoadTrack()` (after `TrackPlayer.add()`), or via a coordinator event dispatch after add completes. The cleaner approach: have `executeLoadTrack()` call a coordinator method `coordinator.reconcilePosition(libraryItemId)` that returns the best position, then `executeLoadTrack()` does the seek. This keeps the seek in `executeLoadTrack()` where it belongs, but the position lookup logic lives in the coordinator.

### Pitfall 3: Removing determineResumePosition() from reloadTrackPlayerQueue()

**What goes wrong:** `determineResumePosition()` is called in TWO places in PlayerService: `executeLoadTrack()` (line 365) and `reloadTrackPlayerQueue()` (line 585). POS-04 requires it to be removed from PlayerService entirely. Both callers must be updated, not just one.

**reloadTrackPlayerQueue** is called from `rebuildCurrentTrackIfNeeded()` which is called from `executePlay()`. The queue reload flow also needs position reconciliation. If only `executeLoadTrack` is updated, the queue-rebuild path will regress.

**How to avoid:** When designing the coordinator-side reconciliation method, ensure both code paths call it. After migration, search for all references to `determineResumePosition` to confirm complete removal.

### Pitfall 4: Double-position-write race on QUEUE_RELOADED

**What goes wrong:** `reloadTrackPlayerQueue()` dispatches `QUEUE_RELOADED` with `{ position: resumeInfo.position }`. The coordinator's `updateContextFromEvent` writes this position to `context.position`. If `executeLoadTrack()` also seeks TrackPlayer to a position independently, two seeks may fire. The result is the correct final position, but the log may show a spurious seek.

**How to avoid:** After Phase 3, either:

- `executeLoadTrack()` consults coordinator's resolved position, performs one seek, dispatches QUEUE_RELOADED
- Or coordinator dispatches POSITION_RECONCILED which triggers `executeSeek()` in `executeTransition()`

Pick one path; don't have both executeLoadTrack AND the coordinator dispatch a seek.

### Pitfall 5: DB session position on fresh cold start

**What goes wrong:** On the very first load of an item (no DB session exists yet), `determineResumePosition()` falls through to AsyncStorage or store position. If AsyncStorage has a stale position from a previous session that was not properly cleared, the user resumes at the wrong position.

**Status:** This is existing behavior. Phase 3 shouldn't change it, but the reconciliation algorithm must preserve the existing fallback chain: DB session → savedProgress → AsyncStorage → zero.

---

## Code Examples

### Current determineResumePosition() — To Be Relocated

```typescript
// Source: src/services/PlayerService.ts:647–761
// Priority: DB session > savedProgress > AsyncStorage > store
private async determineResumePosition(libraryItemId: string): Promise<ResumePositionInfo> {
  const store = useAppStore.getState();
  const asyncStoragePosition = (await getAsyncItem(ASYNC_KEYS.position)) as number | null;

  let position = store.player.position;
  let source: ResumeSource = "store";
  let authoritativePosition: number | null = null;

  const MIN_PLAUSIBLE_POSITION = 5; // seconds  <-- needs to become a shared constant
  const LARGE_DIFF_THRESHOLD = 30; // seconds

  // ... 100+ lines of priority logic
}
```

### Coordinator Context — isLoadingTrack guard

```typescript
// Source: src/services/coordinator/PlayerStateCoordinator.ts:309–466
// Gate for NATIVE_PROGRESS_UPDATED position-0 during loading:
case "NATIVE_PROGRESS_UPDATED":
  // POS-03: Do not overwrite valid position with native-0 during track load
  if (this.context.isLoadingTrack && event.payload.position === 0) {
    this.context.duration = event.payload.duration; // duration update is safe
    this.context.lastPositionUpdate = Date.now();
    // Do NOT update position — native 0 during loading is not authoritative
    break;
  }
  this.context.position = event.payload.position;
  this.context.duration = event.payload.duration;
  this.context.lastPositionUpdate = Date.now();
  break;
```

### POSITION_RECONCILED dispatch from executeTransition

```typescript
// Pattern for coordinator to resolve and propagate position
// (proposed — not yet in codebase)
case PlayerState.READY:
  if (event.type === "NATIVE_TRACK_CHANGED" || event.type === "QUEUE_RELOADED") {
    const resolvedPosition = await this.resolveCanonicalPosition(libraryItemId);
    if (resolvedPosition > 0) {
      // Dispatch back through event bus so context updates atomically
      dispatchPlayerEvent({
        type: "POSITION_RECONCILED",
        payload: { position: resolvedPosition }
      });
    }
  }
  break;
```

### Shared MIN_PLAUSIBLE_POSITION constant (proposed)

```typescript
// Proposed location: src/types/coordinator.ts or src/lib/positionReconciliation.ts
/**
 * Minimum position (seconds) considered plausible when resuming playback.
 * Positions below this threshold may indicate a "not yet loaded" state from
 * the native player, not actual progress at the start of the media.
 */
export const MIN_PLAUSIBLE_POSITION = 5; // seconds

/**
 * Threshold (seconds) for treating a position discrepancy as "large".
 * When DB session and saved progress differ by more than this, we prefer
 * the more recently updated source.
 */
export const LARGE_DIFF_THRESHOLD = 30; // seconds
```

---

## State of the Art

| Old Approach                                 | Current Approach                                               | After Phase 3                                        |
| -------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------- |
| `determineResumePosition()` in PlayerService | Called in 2 places (executeLoadTrack + reloadTrackPlayerQueue) | Single call in coordinator; PlayerService removed    |
| MIN_PLAUSIBLE_POSITION hardcoded inline (x2) | 2 separate constants in 2 files                                | 1 shared constant exported from types/coordinator.ts |
| Native-0 not guarded during LOADING          | BGS guards it on track change; coordinator does not            | Coordinator guards it via `isLoadingTrack` flag      |
| Position-0 false starts on cold load         | Partial mitigation via session/progress fallback               | Full mitigation via coordinator-owned algorithm      |

---

## Open Questions

1. **Where exactly should the coordinator's reconciliation method be invoked?**
   - What we know: `executeLoadTrack()` calls `TrackPlayer.add(tracks)` then `determineResumePosition()` then seeks. The coordinator's `executeTransition()` is what calls `executeLoadTrack()`.
   - What's unclear: Should the coordinator call its own `resolveCanonicalPosition()` from within `executeTransition()` (after awaiting `executeLoadTrack()`), or should `executeLoadTrack()` call a coordinator method directly, or should it happen on the NATIVE_TRACK_CHANGED/QUEUE_RELOADED transition into READY?
   - Recommendation: Have `executeLoadTrack()` call `coordinator.resolveAndApplyPosition(libraryItemId)` after `TrackPlayer.add()`. The coordinator method resolves the position, updates `context.position`, dispatches `POSITION_RECONCILED`, and returns the position for the seek. This keeps the seek in `executeLoadTrack()` but moves the resolution logic to the coordinator.

2. **How to distinguish "native 0 = not loaded" from "native 0 = user started from beginning"?**
   - What we know: `context.isLoadingTrack` is true from `LOAD_TRACK` until `QUEUE_RELOADED`. Native 0 during loading is suspect.
   - What's unclear: What about a user explicitly seeking to position 0? That would be a SEEK event, not a NATIVE_PROGRESS_UPDATED, so it's distinguishable.
   - What about a user who starts a brand-new book with no prior session? In that case, `determineResumePosition()` returns `position: 0, source: "store"`, and `executeLoadTrack()` skips the seek (line 376: `if (resumeInfo.position > 0)`). So position-0 for new books flows through correctly — the issue is only when a prior position should be used but native-0 arrives first.
   - Recommendation: Guard native-0 updates to `context.position` only when `isLoadingTrack === true`. After the queue is loaded (`QUEUE_RELOADED` clears `isLoadingTrack`), native-0 is accepted as authoritative.

3. **Should the coordinator gate NATIVE_PROGRESS_UPDATED position-0 updates, or should PlayerService just not call `TrackPlayer.seekTo(0)` when position is 0?**
   - What we know: PlayerService already skips the seek when `resumeInfo.position === 0` (line 376). The problem is that native events fire between add() and seek(), overwriting context.position.
   - Recommendation: Gate in the coordinator. The context guard is the right place because the coordinator owns position.

4. **What tests need to be written for POS-01 through POS-06?**
   - POS-01: Unit test for the reconciliation algorithm (correct priority order). Can be tested against a pure function extracted from the coordinator.
   - POS-02: Unit test that MIN_PLAUSIBLE_POSITION is applied (session < 5s rejected).
   - POS-03: Coordinator unit test: when `isLoadingTrack=true` and `NATIVE_PROGRESS_UPDATED { position: 0 }` arrives, `context.position` is NOT overwritten.
   - POS-04: Verify `determineResumePosition` no longer exists in PlayerService (can be a test-time assertion, but better enforced by compilation — just remove the method).
   - POS-05: Integration/scenario test: after simulating 30 minutes of playback with periodic session updates, verify `context.position` tracks within 5s of the mock DB session position. This is a harder test — may need a mock clock or an end-to-end flow.
   - POS-06: This is largely a convention, not testable in unit tests. Document the BGS coordinator's read-only stance on position (it writes to DB, but does not try to coordinate with the UI coordinator's position state).

5. **Does Android BGS need any new guarding?**
   - What we know: The BGS context is already isolated. Its `handleActiveTrackChanged()` has the MIN_PLAUSIBLE_POSITION guard (BGS line 744). The BGS writes progress to DB via `progressService.updateProgress()`, which is the cross-context truth.
   - What's unclear: After Phase 3, if the UI coordinator owns position resolution, does the BGS coordinator duplicate that work? On Android, the BGS IS the active coordinator when the app is backgrounded. It must still do its own position resolution.
   - Recommendation: The BGS coordinator should call the same coordinator-side position resolution method. Since both contexts get `PlayerStateCoordinator.getInstance()`, and both will have the resolution method, this works transparently. The DB session remains the authority in both contexts.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase inspection of:
  - `src/services/PlayerService.ts` — `determineResumePosition()`, `executeLoadTrack()`, `reloadTrackPlayerQueue()`, `reconcileTrackPlayerState()`
  - `src/services/coordinator/PlayerStateCoordinator.ts` — full coordinator implementation
  - `src/services/PlayerBackgroundService.ts` — `handleActiveTrackChanged()`, `handlePlaybackProgressUpdated()`
  - `src/services/coordinator/transitions.ts` — full transition matrix
  - `src/types/coordinator.ts` — event types, StateContext, PersistedPlayerState
  - `src/stores/slices/playerSlice.ts` — `restorePersistedState()`, `updatePosition()`
  - `src/lib/asyncStore.ts` — ASYNC_KEYS, getItem/saveItem
  - `src/__tests__/` + `src/services/__tests__/` + `src/services/coordinator/__tests__/` — existing test coverage

---

## Metadata

**Confidence breakdown:**

- Position source priority: HIGH — read directly from `determineResumePosition()` source
- MIN_PLAUSIBLE_POSITION location/value: HIGH — grepped across codebase, found exactly 2 copies at value 5
- "Native 0 during loading" problem: HIGH — code path confirmed in `updateContextFromEvent`
- Android BGS dual-coordinator: HIGH — comment + `getCoordinator()` call at module level confirmed
- Reconciliation algorithm design: MEDIUM — recommended approach is reasonable but not yet validated by user decision
- POS-05 test design (drift <5s): MEDIUM — mechanism is clear, exact test implementation needs planning

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (codebase-internal research, stable until next Phase 3 changes)
