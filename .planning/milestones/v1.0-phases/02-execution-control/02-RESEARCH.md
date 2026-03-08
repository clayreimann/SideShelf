# Phase 2: Execution Control - Research

**Researched:** 2026-02-16
**Domain:** Coordinator execution mode — converting the observer-mode PlayerStateCoordinator into an active executor; transition guards; feedback loop prevention; observerMode rollback flag
**Confidence:** HIGH — all findings come from direct codebase inspection (no external library research needed; this is purely an internal architecture change)

## Summary

Phase 2 is a narrower change than it appears from the outside. The coordinator already has `observerMode = false` and an `executeTransition()` method. The skeleton is already present and active. The core work is **fixing three concrete gaps** that prevent the current implementation from satisfying the six success criteria: (1) the `observerMode` field is `readonly` and cannot be toggled at runtime, (2) the BGS handlers duplicate work that `execute*` methods also do (smart rewind, pause-time recording), and (3) there are no tests that assert "exactly one event dispatched per coordinator action" (feedback loop prevention contract).

The feedback loop risk is the most subtle issue. When the BGS handles a `RemotePlay` event, it calls `applySmartRewind()` and then dispatches `{ type: "PLAY" }` to the bus. The coordinator sees the `PLAY` event, validates it, and calls `playerService.executePlay()`. `executePlay()` calls `applySmartRewind()` again. This means smart rewind fires twice for every remote play initiated from the lock screen. The same duplication pattern exists for `executePause()` setting `_setLastPauseTime`. Phase 2 must establish a clean contract: BGS dispatches events to the bus; `execute*` methods own all side effects; BGS does not duplicate those side effects before dispatching.

The transition guards already work at the `validateTransition()` level — if a transition is not allowed, `executeTransition` is never called. The gap is that `executeTransition` does not correctly guard all cases. Specifically, `SEEK` events can arrive while the coordinator is in `IDLE` state (seek-when-idle) and the current code would still try to call `executeSeek()` because the state-specific action switch runs after the `nextState !== currentState` check but not after a guard for the event type vs. current state. The same issue applies to non-state-changing events like `SEEK`, `SET_RATE`, `SET_VOLUME`.

**Primary recommendation:** Phase 2 is a targeted fix in three areas — (a) make `observerMode` a non-readonly private field with a setter, (b) move all side effects out of BGS pre-dispatch handlers into `execute*` methods, and (c) add the feedback-loop test suite (EXEC-03). No new architecture is required; the existing structure is correct.

## Standard Stack

No external libraries needed. This phase uses only code already in the repository.

| Component                 | Location                                             | Role                                              |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| `PlayerStateCoordinator`  | `src/services/coordinator/PlayerStateCoordinator.ts` | Main change target                                |
| `PlayerBackgroundService` | `src/services/PlayerBackgroundService.ts`            | Side-effect duplication to remove                 |
| `PlayerService`           | `src/services/PlayerService.ts`                      | `execute*` methods receive the moved side effects |
| `eventBus`                | `src/services/coordinator/eventBus.ts`               | No changes needed                                 |
| `transitions`             | `src/services/coordinator/transitions.ts`            | No changes needed                                 |

## Architecture Patterns

### Current Execution Flow (with Phase 2 already partially active)

```
User taps Play button
  → PlayerService.play()
    → dispatchPlayerEvent({ type: "PLAY" })
      → playerEventBus.dispatch(event)
        → coordinator.dispatch(event)        [via bus subscription]
          → validateTransition(READY, PLAY)  [allowed]
          → executeTransition(PLAY, PLAYING) [!observerMode → calls]
            → playerService.executePlay()
              → applySmartRewind()
              → TrackPlayer.play()
```

```
Lock screen Play button pressed
  → BGS.handleRemotePlay()
    → applySmartRewind()                     [DUPLICATE — also in executePlay()]
    → store._setLastPauseTime(null)          [DUPLICATE — also in executePlay()]
    → dispatchPlayerEvent({ type: "PLAY" })
      → playerEventBus.dispatch(event)
        → coordinator.dispatch(event)
          → validateTransition(PAUSED, PLAY)
          → executeTransition(PLAY, PLAYING)
            → playerService.executePlay()
              → applySmartRewind()           [FIRES AGAIN]
              → store._setLastPauseTime(null) [FIRES AGAIN]
              → TrackPlayer.play()
```

### Target Execution Flow (Phase 2 goal)

```
Lock screen Play button pressed
  → BGS.handleRemotePlay()
    → dispatchPlayerEvent({ type: "PLAY" }) [BGS only dispatches; no side effects]
      → playerEventBus.dispatch(event)
        → coordinator.dispatch(event)
          → validateTransition(PAUSED, PLAY)
          → executeTransition(PLAY, PLAYING)
            → playerService.executePlay()
              → applySmartRewind()           [fires exactly once]
              → store._setLastPauseTime(null) [fires exactly once]
              → TrackPlayer.play()
```

### Pattern 1: observerMode as Runtime Toggle

The current implementation has `private readonly observerMode = false`. To satisfy EXEC-04 (instant rollback), this needs to be:

```typescript
// Source: src/services/coordinator/PlayerStateCoordinator.ts
private observerMode = false;   // Remove 'readonly'

setObserverMode(value: boolean): void {
  this.observerMode = value;
  log.info(`[Coordinator] Observer mode ${value ? 'enabled' : 'disabled'}`);
}
```

The singleton pattern ensures there is only one coordinator instance per JS context, so setting it on the singleton toggles the behavior globally immediately.

### Pattern 2: Transition Guard for Non-State-Changing Events

The current `executeTransition` checks `nextState !== currentState` before calling state-targeted methods (LOADING, PLAYING, PAUSED, IDLE), but then unconditionally runs the event-type switch for SEEK, SET_RATE, SET_VOLUME. This means a `SEEK` event from IDLE state would pass `validateTransition` (which rejects it — `allowed: false`) but... actually no. Looking at the code:

```typescript
// In handleEvent:
if (validation.allowed) {
  // ...
  if (!this.observerMode) {
    await this.executeTransition(event, nextState); // Only called if allowed
  }
}
```

`executeTransition` is only called when `validation.allowed` is true. And `validateTransition` returns `allowed: false` for `SEEK` from `IDLE`. So the guard is actually working correctly — `executeTransition` is only called on allowed transitions. The issue is subtler: the event-type switch in `executeTransition` checks for `SEEK`, `SET_RATE`, `SET_VOLUME` regardless of `nextState`. This is intentional — these events don't cause state transitions but still need execution. Since they're only reached when `validation.allowed === true`, they are properly guarded.

**Conclusion on guards:** The existing validation guards are correct. No changes needed to `transitions.ts`. The EXEC-02 requirement (duplicate session prevention via play-when-loading guard) is already satisfied: `LOAD_TRACK` from `LOADING` state is not in the transition matrix (only `NATIVE_TRACK_CHANGED`, `QUEUE_RELOADED`, `NATIVE_ERROR`, `NATIVE_PLAYBACK_ERROR`, `NATIVE_STATE_CHANGED`, `NATIVE_PROGRESS_UPDATED` are allowed from `LOADING`). Wait — actually looking more carefully: `LOADING` state does NOT allow `LOAD_TRACK`. So a second `LOAD_TRACK` while loading is rejected. This is correct.

### Pattern 3: Feedback Loop Prevention Contract

The test suite must verify that `execute*` methods do NOT call `dispatchPlayerEvent`. Currently there is no such test. The pattern:

```typescript
// In coordinator test:
it("should not dispatch events from executePlay", async () => {
  const dispatchSpy = jest.spyOn(playerEventBus, "dispatch");

  // Transition to READY so PLAY is valid
  // ...setup...

  await coordinator.dispatch({ type: "PLAY" });
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Only the original PLAY event should be dispatched, not a second one
  // from inside executePlay
  const eventTypes = dispatchSpy.mock.calls.map((call) => call[0].type);
  const playEvents = eventTypes.filter((t) => t === "PLAY");
  expect(playEvents).toHaveLength(0); // coordinator doesn't re-dispatch
});
```

Note: The `execute*` methods in PlayerService currently do NOT call `dispatchPlayerEvent`. This is already correct. The feedback loop risk is in BGS pre-dispatch side effects, not in `execute*` calling back to the bus. The EXEC-03 test suite should verify this contract is maintained.

### Pattern 4: NATIVE\_\* Events Unconditional Context Update (EXEC-05)

This is already implemented correctly. In `updateContextFromEvent`, `NATIVE_STATE_CHANGED` updates `context.isPlaying` regardless of `observerMode`. In `handleEvent`, `updateContextFromEvent` is always called before the `observerMode` check for `executeTransition`. No changes needed.

### Anti-Patterns to Avoid

- **Removing BGS side effects without moving them to execute\* methods**: If `applySmartRewind()` is removed from BGS but not added to `executePlay()`, smart rewind breaks for remote play. Move, don't delete.
- **Making executeTransition call dispatchPlayerEvent**: This creates the feedback loop. `execute*` methods must only call TrackPlayer and store methods.
- **Adding observerMode check inside execute\* methods**: The coordinator is the gatekeeper. `execute*` methods should execute unconditionally when called. The coordinator decides whether to call them.

## Don't Hand-Roll

| Problem                 | Don't Build                 | Use Instead                      | Why                                                          |
| ----------------------- | --------------------------- | -------------------------------- | ------------------------------------------------------------ |
| Runtime feature flags   | Custom flag management      | Simple private field with setter | The coordinator is a singleton; one field is sufficient      |
| Feedback loop detection | Circular dependency tracker | Test suite assertion (EXEC-03)   | The architecture prevents loops; tests verify the contract   |
| Transition validation   | New guard logic             | Existing `validateTransition()`  | Already works correctly; only reachable via bus subscription |

## Common Pitfalls

### Pitfall 1: Smart Rewind Double-Execution

**What goes wrong:** After Phase 2 activation, lock screen Play triggers `applySmartRewind()` twice — once in `BGS.handleRemotePlay()` and once in `PlayerService.executePlay()`.

**Why it happens:** BGS was written to handle all side effects before dispatching, because in Phase 1 the coordinator was an observer that didn't call back. Now that the coordinator calls `executePlay()`, side effects happen again.

**How to avoid:** Remove `applySmartRewind()` and `store._setLastPauseTime(null)` from `BGS.handleRemotePlay()`. Move them exclusively into `PlayerService.executePlay()`. Do the same audit for `BGS.handleRemotePause()` vs `PlayerService.executePause()`.

**Warning signs:** During testing, `applySmartRewind()` mock shows 2 calls per remote play action.

### Pitfall 2: observerMode readonly Prevents Rollback

**What goes wrong:** EXEC-04 says observerMode can be set to `true` for instant rollback, but `private readonly observerMode = false` cannot be changed after construction.

**Why it happens:** The field was set as `readonly` during Phase 1 implementation since Phase 1 always ran in observer mode and the flag was only a forward reference.

**How to avoid:** Remove `readonly` from the field declaration. Add a `setObserverMode(value: boolean)` public method.

**Warning signs:** TypeScript error "Cannot assign to 'observerMode' because it is a read-only property."

### Pitfall 3: BGS Parallel Execution Context (Android)

**What goes wrong:** On Android, BGS runs in a headless JS context. It has its own `PlayerStateCoordinator` instance (the singleton is per-JS-context). When BGS dispatches `PLAY`, the BGS coordinator processes it and calls `playerService.executePlay()` — but the BGS context does not have a properly initialized PlayerService (no active TrackPlayer setup, no store access from the UI context).

**Why it happens:** The Android headless JS context is a separate process from the UI. The singleton coordinator in BGS context and the UI context are different objects.

**How to avoid:** The BGS coordinator should remain in observer mode OR the `execute*` calls in the BGS context coordinator should be no-ops. The safest approach: BGS dispatches events to the bus, the BGS coordinator observes them, but the BGS context should NOT execute `execute*` methods on PlayerService because TrackPlayer is the authoritative executor in the BGS context. The BGS context should either: (a) keep `observerMode = true` always, or (b) call TrackPlayer directly (current BGS behavior) and the coordinator only observes.

**Warning signs:** Double execution of TrackPlayer methods on Android. iOS won't show this issue (single JS context).

### Pitfall 4: togglePlayPause Not Yet Migrated

**What goes wrong:** `PlayerService.togglePlayPause()` directly queries `TrackPlayer.getPlaybackState()` and calls `this.pause()` or `this.play()`, bypassing the event bus.

**Why it happens:** `togglePlayPause` was not updated in Phase 1. `pause()` and `play()` now dispatch events, so `togglePlayPause` is partially migrated. But it still queries TrackPlayer directly to determine which path to take, rather than asking the coordinator for current state.

**How to avoid:** This is an acceptable Phase 2 exception — `togglePlayPause` calls `this.play()` or `this.pause()` which dispatch events, so execution still routes through the coordinator. A full fix (using coordinator state instead of TrackPlayer state) can wait for Phase 3/4.

### Pitfall 5: executeTransition Receives Already-Updated Context State

**What goes wrong:** In `handleEvent`, the state is updated with `this.context.currentState = nextState` BEFORE `executeTransition` is called. The check `nextState !== this.context.currentState` inside `executeTransition` will always be false.

**Why it happens:** Looking at the code flow in `handleEvent`:

```typescript
// Line 256-258: state is updated here
this.context.previousState = currentState;
this.context.currentState = nextState;
// ...
// Line 261-263: then executeTransition is called
if (!this.observerMode) {
  await this.executeTransition(event, nextState);
}
```

And in `executeTransition`:

```typescript
if (nextState && nextState !== this.context.currentState) {
  // This check is ALWAYS false because context was already updated above
```

**How to avoid:** The `executeTransition` method uses the `nextState` parameter passed to it, and the inner check `nextState !== this.context.currentState` needs to compare against the PREVIOUS state (before update). Fix by either: (a) passing `previousState` as a parameter to `executeTransition`, or (b) removing the guard inside `executeTransition` since it's already guarded by `validateTransition` at the `handleEvent` level. Option (b) is simpler and correct since `executeTransition` is only called when `validation.allowed === true`.

**Warning signs:** `executePlay()`, `executePause()` never get called even when transitions are allowed. Test the coordinator with a PlayerService mock to verify calls happen.

## Code Examples

### Verified: Current executeTransition (source of the bug)

```typescript
// Source: src/services/coordinator/PlayerStateCoordinator.ts lines 567-623
private async executeTransition(
  event: PlayerEvent,
  nextState: PlayerState | null
): Promise<void> {
  const playerService = PlayerService.getInstance();
  try {
    // BUG: this.context.currentState was already set to nextState in handleEvent
    // So this check is ALWAYS false for state-changing events
    if (nextState && nextState !== this.context.currentState) {
      switch (nextState) {
        case PlayerState.LOADING:
          if (event.type === "LOAD_TRACK") {
            await playerService.executeLoadTrack(
              event.payload.libraryItemId,
              event.payload.episodeId
            );
          }
          break;
        case PlayerState.PLAYING:
          await playerService.executePlay();
          break;
        // ...
      }
    }
    // These run unconditionally (for allowed events) — correct
    switch (event.type) {
      case "SEEK":
        await playerService.executeSeek(event.payload.position);
        break;
      // ...
    }
  } catch (error) { /* ... */ }
}
```

### Verified: observerMode as readonly (must change)

```typescript
// Source: src/services/coordinator/PlayerStateCoordinator.ts line 75
private readonly observerMode = false;  // 'readonly' prevents EXEC-04
```

### Verified: BGS duplicate side effects (must remove from BGS)

```typescript
// Source: src/services/PlayerBackgroundService.ts lines 100-114
async function handleRemotePlay(): Promise<void> {
  const progress = await TrackPlayer.getProgress();
  await applySmartRewind(progress.position);      // DUPLICATE of executePlay()
  const store = useAppStore.getState();
  store._setLastPauseTime(null);                   // DUPLICATE of executePlay()
  dispatchPlayerEvent({ type: "PLAY" });
}

// Source: src/services/PlayerService.ts lines 467-488
async executePlay(): Promise<void> {
  // ...
  await applySmartRewind();                        // Already here
  store._setLastPauseTime(null);                   // Already here
  await TrackPlayer.play();
}
```

## State of the Art

| Component                 | Phase 1 State                                            | Phase 2 Target                                         |
| ------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| `observerMode`            | `private readonly = false` (hardcoded, unwriteable)      | `private = false` with `setObserverMode()` setter      |
| `executeTransition` guard | `nextState !== this.context.currentState` (always false) | Remove incorrect guard; call execute methods directly  |
| BGS remote handlers       | Duplicate side effects before dispatch                   | Dispatch only; side effects in execute\*               |
| EXEC-03 test              | Not present                                              | Test suite asserts execute\* never dispatches          |
| Android BGS coordinator   | Observes events (Phase 1)                                | Remains in observer/limited mode (separate JS context) |

## Open Questions

1. **Android BGS execution mode**
   - What we know: Android BGS has its own coordinator instance. BGS calls TrackPlayer directly for lock screen controls (which is correct for the BGS context). If BGS coordinator has `observerMode = false`, it would try to call `playerService.execute*()` methods in the BGS context — which would double-execute commands.
   - What's unclear: Should the BGS coordinator always stay in observer mode? Or should `execute*` methods be safe to call in the BGS context (idempotent TrackPlayer calls)?
   - Recommendation: BGS coordinator should remain in observer mode (or not have execution mode enabled). The BGS is responsible for TrackPlayer calls in its own context; the UI coordinator handles UI-context TrackPlayer calls. The cleanest solution: check `isBackgroundServiceInitialized()` at coordinator init time, or simply document that BGS dispatches events and BGS TrackPlayer calls are "owned" by BGS, not coordinator.

2. **togglePlayPause migration**
   - What we know: `togglePlayPause()` queries `TrackPlayer.getPlaybackState()` directly, then calls `this.play()` or `this.pause()` which dispatch events correctly.
   - What's unclear: Is this a Phase 2 concern or deferred to Phase 3?
   - Recommendation: Defer to Phase 3. `togglePlayPause()` uses `this.play()` / `this.pause()` which route through the coordinator. The direct TrackPlayer query is for routing, not execution — acceptable for now.

3. **handleRemoteJumpForward / handleRemoteJumpBackward**
   - What we know: These compute a new position, dispatch `SEEK`, then also call `progressService.updateProgress()` and `store.updatePosition()` — side effects that exist alongside the coordinator's `executeSeek()`.
   - What's unclear: Should `executeSeek()` handle progress updates and store updates?
   - Recommendation: Phase 2 should only address the direct playback command duplication (play/pause/stop). Progress sync side effects in BGS jump handlers are not duplicated in `executeSeek()` (which only calls `TrackPlayer.seekTo()`), so there is no double-execution. This is not a Phase 2 blocker.

## Sources

### Primary (HIGH confidence)

- Direct code inspection: `src/services/coordinator/PlayerStateCoordinator.ts` — full file read
- Direct code inspection: `src/services/coordinator/eventBus.ts` — full file read
- Direct code inspection: `src/services/coordinator/transitions.ts` — full file read
- Direct code inspection: `src/services/PlayerService.ts` — full file read
- Direct code inspection: `src/services/PlayerBackgroundService.ts` — first 600 lines read
- Direct code inspection: `src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts` — full file read
- Direct code inspection: `src/types/coordinator.ts` — full file read
- Direct code inspection: `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md`

## Metadata

**Confidence breakdown:**

- Current implementation state: HIGH — code directly inspected
- Feedback loop analysis: HIGH — traced execution paths explicitly
- Android BGS behavior: MEDIUM — architecture documented in code comments; runtime behavior not directly tested
- observerMode readonly issue: HIGH — TypeScript keyword directly visible in code

**Research date:** 2026-02-16
**Valid until:** Until any of the above source files change (these are internal-only findings; no external library concerns)
