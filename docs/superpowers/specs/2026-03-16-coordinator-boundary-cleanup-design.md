# Coordinator Boundary Cleanup — Design Spec

**Date:** 2026-03-16
**Status:** Approved — ready for implementation plan
**Branch:** milestones/milestone-1.3

---

## Background

The `PlayerStateCoordinator` was introduced to absorb decision-making logic from PlayerService, PlayerBackgroundService, and playerSlice — squashing async bugs caused by state decisions being spread across multiple actors. Collaborators (`TrackLoadingCollaborator`, `PlaybackControlCollaborator`, `ProgressRestoreCollaborator`, `BackgroundReconnectCollaborator`) were introduced alongside to keep the coordinator testable by isolating TrackPlayer I/O.

An audit found that `TrackLoadingCollaborator` partially undoes this separation: it imports from the coordinator layer to re-check state that the coordinator already validated, and dispatches events that drive the next state transition (a decision that belongs to the coordinator). Everything else in the architecture — `PlayerBackgroundService`, `ProgressService`, `playerSlice`, diagnostic components — is correctly decoupled.

---

## Goal

**Collaborators have no coordinator imports.** They are pure executors: they receive commands from the coordinator (via `PlayerService` execute methods), call TrackPlayer, and return results. All decision logic — what to do next, whether to rebuild the queue, whether to short-circuit a load — lives in the coordinator.

---

## Boundary Rule

Collaborators may:

- Call TrackPlayer APIs
- Read from the Zustand store (for playback settings, current track data)
- Call DB helpers
- Dispatch **factual** events that report completion of a pure operation (e.g., `SEEK_COMPLETE`, `POSITION_RECONCILED`)

Collaborators may not:

- Import `getCoordinator`, `PlayerStateCoordinator`, `PlayerState`, or `dispatchPlayerEvent` for decision-driving dispatches
- Call `coordinator.getState()` or `coordinator.getContext()`
- Dispatch events that drive the next coordinator state transition (e.g., `PLAY` after load, `RELOAD_QUEUE`, `QUEUE_RELOADED`)

---

## The Three Changes

### Change 1 — Remove `coordinator.getState()` from `reloadTrackPlayerQueue`

**Current behaviour (`TrackLoadingCollaborator.ts:344–361`):**

```
reloadTrackPlayerQueue():
  1. dispatchPlayerEvent({ type: "RELOAD_QUEUE" })       ← coordinator event
  2. coordinator.getState() check                         ← state re-check
  3. if state is PLAYING/PAUSED → return false (abort)
  4. TrackPlayer.reset(), buildTrackList(), TrackPlayer.add()
  5. resolveCanonicalPosition()
  6. dispatchPlayerEvent({ type: "QUEUE_RELOADED" })      ← coordinator event
```

The guard exists because when `reloadTrackPlayerQueue` is called from `executePlay` (a coordinator side-effect), the coordinator is already in PLAYING state — and the collaborator needs to prevent `TrackPlayer.reset()` from stomping active playback. This is the collaborator re-checking state the coordinator already resolved.

**New behaviour:**

- `reloadTrackPlayerQueue` becomes a pure execution function with signature `Promise<ResumePositionInfo>` (throws on failure rather than returning `boolean`): reset, build, add, resolve position, return position info
- No coordinator imports, no state check, no event dispatches
- The coordinator ensures this function is only called from a state where queue rebuild is valid (IDLE, RESTORING, or LOADING). The call site moves — it is no longer reachable from `executePlay`
- `RELOAD_QUEUE` and `QUEUE_RELOADED` remain valid coordinator signals and are dispatched by the coordinator itself in `executeTransition`, **before and after** the `reloadTrackPlayerQueue` call respectively. This ordering is required to preserve the POS-03 guard: `updateContextFromEvent` for `RELOAD_QUEUE` sets `context.isLoadingTrack = true`, which prevents the native-zero position artifact from overwriting a valid resume position during the queue rebuild I/O. Concretely, the coordinator flow becomes:
  1. Dispatch `RELOAD_QUEUE` internally (sets `isLoadingTrack = true` via context update)
  2. Call `reloadTrackPlayerQueue()` (pure I/O)
  3. Dispatch `QUEUE_RELOADED` with resolved position (sets `isLoadingTrack = false`, updates position)

### Change 2 — Move PLAY dispatch after load into coordinator

**Current behaviour (`TrackLoadingCollaborator.ts:90, 94, 213`):**
After `executeLoadTrack` completes (or short-circuits), the collaborator dispatches `{ type: "PLAY" }` to drive the coordinator into PLAYING state.

**New behaviour:**

- A `playIntentOnLoad: boolean` field is added to `StateContext`
- Set to `true` when a `LOAD_TRACK` event is processed by `updateContextFromEvent`
- Cleared to `false` if a `PAUSE` event or error arrives during LOADING
- After `executeLoadTrack` returns in `executeTransition`, the coordinator checks `context.playIntentOnLoad` and dispatches `{ type: "PLAY" }` via `dispatchPlayerEvent` — consistent with the existing post-seek resume dispatch at coordinator line 1099. This routes through `processEventQueue`, runs the transition table check, records the transition in history, and calls `executePlay` via `executeTransition` — preserving observability in the diagnostic trace
- The collaborator removes all `dispatchPlayerEvent` calls related to playback initiation

### Change 3 — Move "already playing this item" short-circuit into coordinator

**Current behaviour (`TrackLoadingCollaborator.ts:80–101`):**

```
executeLoadTrack():
  if (store.player.currentTrack?.libraryItemId === libraryItemId) {
    const state = await TrackPlayer.getPlaybackState()
    if (state === Playing || state === Paused) {
      dispatchPlayerEvent({ type: "PLAY" })   ← drives coordinator
      return
    }
  }
  // ... full load
```

The collaborator queries native TrackPlayer state and makes a routing decision (full load vs resume) that the coordinator already has the context to make.

**New behaviour:**

- The coordinator context already tracks `context.currentTrack` and `context.currentState`
- When a `LOAD_TRACK` event arrives with a `libraryItemId` matching `context.currentTrack?.libraryItemId`, and the coordinator is in **PLAYING or PAUSED** state, the coordinator short-circuits in `executeTransition` — dispatching `PLAY` directly without calling `executeLoadTrack`
- READY state is excluded from the short-circuit: `context.currentTrack` is populated via `NATIVE_TRACK_CHANGED` events (fired during active playback cycles). In READY state reached via the RESTORING path, `context.currentTrack` may not reliably reflect what is loaded in TrackPlayer, making the libraryItemId match unsafe. The full load path is the correct behaviour from READY state.
- `executeLoadTrack` only receives control when a genuine load is required
- No `TrackPlayer.getPlaybackState()` call needed for this decision; coordinator context is authoritative for PLAYING and PAUSED states where `context.currentTrack` has been positively confirmed by a prior playback cycle

### Change 4 — Move "does the queue need rebuilding?" decision into coordinator context

**Current behaviour:**
`PlaybackControlCollaborator.executePlay()` calls `this.facade.rebuildCurrentTrackIfNeeded()`, which delegates to `ProgressRestoreCollaborator.rebuildCurrentTrackIfNeeded()`. That method inspects the live TrackPlayer queue and calls `reloadTrackPlayerQueue()` if the queue doesn't match the expected track. This is the call path that originally motivated the `coordinator.getState()` guard in Change 1 — by the time `reloadTrackPlayerQueue` is reached, the coordinator is already in PLAYING state (since `executePlay` is a PLAYING-state side-effect).

The decision "does the queue need rebuilding before we can play?" belongs in the coordinator, not in `executePlay`.

**New behaviour:**

- Add `queueStatus: 'unknown' | 'valid'` to `StateContext`
  - Set to `'unknown'` on `RESTORE_STATE` and `STOP` (queue may have been cleared by the OS or background service)
  - Set to `'valid'` on `QUEUE_RELOADED` (coordinator has just rebuilt it)
  - Initialised to `'unknown'` in `createInitialContext()`
- When coordinator processes a `PLAY` event and `context.queueStatus === 'unknown'`, it performs an inline rebuild within `executeTransition` **before** calling `executePlay`. These context mutations are applied **directly** (not via `dispatchPlayerEvent`) because the coordinator may already be in PLAYING or PAUSED state when the PLAY event arrives, and the transition table does not accept `RELOAD_QUEUE` from those states. The inline sequence:
  1. Call `updateContextFromEvent({ type: "RELOAD_QUEUE" })` directly — sets `isLoadingTrack = true`, preserving POS-03 before any I/O
  2. Call `executeRebuildQueue()` — the pure execution function from Change 1
  3. Call `updateContextFromEvent({ type: "QUEUE_RELOADED", payload: { position } })` directly — sets `isLoadingTrack = false`, updates position, sets `queueStatus = 'valid'`
  4. Proceed to `executePlay()`
- When `context.queueStatus === 'valid'`, coordinator calls `executePlay()` directly — no rebuild check needed

**Consequences:**

- `PlaybackControlCollaborator.executePlay()` removes the `this.facade.rebuildCurrentTrackIfNeeded()` call entirely
- `ProgressRestoreCollaborator.rebuildCurrentTrackIfNeeded()` is removed
- `IPlayerServiceFacade.rebuildCurrentTrackIfNeeded()` is removed from the facade interface
- `IPlayerServiceFacade.dispatchEvent()` can now be safely removed — no collaborator needs it after Changes 1–4
- `reloadTrackPlayerQueue` is renamed `executeRebuildQueue` (pure execution function, no events, no state check), callable only by the coordinator via the facade

---

## Context Changes

New fields added to `StateContext` (`src/types/coordinator.ts`):

```typescript
/** Set when LOAD_TRACK arrives; cleared on PAUSE or error during LOADING.
 *  Coordinator uses this to dispatch PLAY after load completes. */
playIntentOnLoad: boolean;

/** Whether the TrackPlayer queue is known to be populated and valid.
 *  'unknown' after RESTORE_STATE or STOP (queue may have been cleared by OS/BGS).
 *  'valid' after QUEUE_RELOADED (coordinator just rebuilt and confirmed the queue). */
queueStatus: "unknown" | "valid";
```

Both initialised in `createInitialContext()`: `playIntentOnLoad = false`, `queueStatus = 'unknown'`.

`playIntentOnLoad` updated in `updateContextFromEvent()`:

- `LOAD_TRACK` → `true`
- `PAUSE` → `false`
- `NATIVE_PLAYBACK_ERROR` → `false`
- `NATIVE_ERROR` → `false`
- `STOP` → `false`

`queueStatus` updated in `updateContextFromEvent()`:

- `QUEUE_RELOADED` → `'valid'`
- `RESTORE_STATE` → `'unknown'`
- `STOP` → `'unknown'`

---

## Interface Changes

After all four changes land:

**Retained:**

- `IPlayerServiceFacade.dispatchEvent()` — retained for factual event dispatches. `PlaybackControlCollaborator.executeSeek` dispatches `SEEK_COMPLETE` via this method; that is a permitted factual dispatch that survives this refactor. The decision-driving calls (`PLAY`, `RELOAD_QUEUE`, `QUEUE_RELOADED`) are removed from collaborators by Changes 1–4, but the method itself stays on the interface.

**Removed:**

- `IPlayerServiceFacade.rebuildCurrentTrackIfNeeded()` — removed in Change 4
- `IPlayerServiceFacade.reloadTrackPlayerQueue()` — replaced by `executeRebuildQueue` (see below)

**Added:**

- `IPlayerServiceFacade.executeRebuildQueue(track: PlayerTrack): Promise<ResumePositionInfo>` — the renamed, pure execution replacement for `reloadTrackPlayerQueue`. Called only by the coordinator from within `executeTransition`. Throws on failure (caught by the existing try/catch at coordinator lines 1143–1149).
- `IPlayerServiceFacade.resolveCanonicalPosition(libraryItemId: string): Promise<ResumePositionInfo>` — `TrackLoadingCollaborator` currently calls `coordinator.resolveCanonicalPosition()` directly at lines 187 and 376, which is a coordinator import violating the boundary rule. Adding this to the facade allows the collaborator to call `this.facade.resolveCanonicalPosition(libraryItemId)` while `PlayerService` (the facade implementer) delegates to `getCoordinator().resolveCanonicalPosition()`. The coordinator's implementation is unchanged.

`BackgroundReconnectCollaborator` does not use `dispatchEvent` for decision-driving purposes and is unaffected.

---

## Transitions

No new states or transitions are required. Existing guards already reject `RELOAD_QUEUE` from PLAYING, PAUSED, and READY states — the collaborator's state check was redundant with what the state machine already enforced.

Verify `transitions.ts` explicitly lists PLAYING, PAUSED, and READY as non-accepting states for `RELOAD_QUEUE` (audit during implementation).

---

## Error Handling

- `reloadTrackPlayerQueue` (pure execution): throws on failure. Caught by the existing `try/catch` in `executeTransition` (lines 1143–1149). Coordinator can dispatch `NATIVE_ERROR` or log appropriately.
- `playIntentOnLoad` guard: if the user pauses during LOADING, `playIntentOnLoad` is cleared before `executeLoadTrack` returns — coordinator will not auto-play.
- "Already playing" short-circuit: if coordinator short-circuits to PLAY but something is wrong at the native layer, `executePlay` surfaces the error through the existing path.

---

## Testing Impact

**Collaborator tests become simpler:**

- Drop all `getCoordinator` mocks
- Drop all event dispatch assertions (`dispatchPlayerEvent` mock)
- Test only that the correct TrackPlayer methods were called with correct arguments

**Coordinator tests gain four new cases:**

- `LOAD_TRACK` with matching `libraryItemId` + coordinator in PLAYING or PAUSED → verify PLAY dispatched, `executeLoadTrack` not called
- `executeLoadTrack` returns → verify coordinator dispatches PLAY when `playIntentOnLoad` is true, does not when false
- `LOAD_TRACK` dispatched while coordinator is already in LOADING state (rapid double-tap) → verify second event is rejected by transition table, `playIntentOnLoad` is not corrupted by the rejected event
- PLAY event with `queueStatus === 'unknown'` → verify coordinator performs inline rebuild (dispatches RELOAD_QUEUE, calls executeRebuildQueue, dispatches QUEUE_RELOADED) before calling executePlay; verify PLAY with `queueStatus === 'valid'` skips rebuild

**`IPlayerServiceFacade` mock:** `dispatchEvent` is retained on the interface (for factual `SEEK_COMPLETE` dispatches). Update collaborator test mocks to remove decision-driving event assertions (`PLAY`, `RELOAD_QUEUE`, `QUEUE_RELOADED`) while keeping `dispatchEvent` in the mock for the `SEEK_COMPLETE` path.

---

## Out of Scope

- Removing factual event dispatches from collaborators (`SEEK_COMPLETE`, `POSITION_RECONCILED`) — this is Option C territory
- Other methods on `ProgressRestoreCollaborator` (session restoration, `syncPositionFromDatabase`) — audit confirmed they are clean and do not import from coordinator
- Refactoring `PlaybackControlCollaborator` or `BackgroundReconnectCollaborator` beyond removing `rebuildCurrentTrackIfNeeded` — audit confirmed they are otherwise clean
- Any changes to `ProgressService`, `PlayerBackgroundService`, or `playerSlice` — all correctly decoupled

---

## Related

- `docs/investigation/coordinator-full-event-chain-ownership.md` — Option C (deferred)
