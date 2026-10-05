# Option C: Coordinator Full Event-Chain Ownership

**Status:** Deferred — Option B chosen for immediate refactor
**Date:** 2026-03-16
**Context:** Evaluated during coordinator consolidation brainstorm; see Option B spec for what was implemented.

---

## What This Would Be

Option C takes the coordinator's authority to its logical conclusion: no collaborator ever dispatches an event. Collaborators are pure I/O — they execute operations against TrackPlayer and return results. The coordinator chains all transitions internally based on those results, without routing through the event bus mid-execution.

Today, `executeTransition` calls a collaborator method which may dispatch events back to the coordinator (creating a nested dispatch). Under Option C, `executeTransition` calls a collaborator method, receives a structured result, and decides the next event itself — keeping everything in a single locked call frame.

---

## Architecture

### Collaborator Contract (Proposed)

```typescript
// Collaborators return structured results instead of dispatching events
interface LoadTrackResult {
  status: 'loaded' | 'already_playing' | 'error';
  position: number;
  track: PlayerTrack;
}

interface QueueRebuildResult {
  status: 'rebuilt' | 'skipped' | 'error';
  position: number;
}

// No dispatchPlayerEvent calls inside collaborators at all
class TrackLoadingCollaborator {
  async executeLoadTrack(libraryItemId: string, episodeId?: string): Promise<LoadTrackResult> { ... }
  async executeRebuildQueue(track: PlayerTrack): Promise<QueueRebuildResult> { ... }
}
```

### Coordinator executeTransition (Proposed)

```typescript
// Coordinator handles ALL chaining decisions
case PlayerState.LOADING:
  if (event.type === "LOAD_TRACK") {
    const result = await playerService.executeLoadTrack(...);
    if (result.status === 'already_playing') {
      // Short-circuit: update context only, no queue rebuild needed
      return;
    }
    if (result.status === 'loaded') {
      // Coordinator owns the "now play" decision
      this.context.position = result.position;
      this.context.currentTrack = result.track;
      this.context.currentState = PlayerState.READY;
      // Transition directly without event bus round-trip
      await this.executeTransition({ type: "PLAY" }, PlayerState.PLAYING);
    }
  }
  break;
```

---

## What Changes

### Removed from Collaborators

- All `dispatchPlayerEvent()` calls
- All `facade.dispatchEvent()` calls
- `IPlayerServiceFacade.dispatchEvent()` removed from interface
- No event bus imports in collaborators at all

### New Coordinator Responsibilities

- Chain LOADING → READY → PLAYING without intermediate events
- Queue rebuild lifecycle handled inline (not via RELOAD_QUEUE/QUEUE_RELOADED events)
- "Already playing" short-circuit handled at coordinator level
- Error recovery chaining (NATIVE_PLAYBACK_ERROR → retry or STOP decision)

### Events Eliminated

- `RELOAD_QUEUE` — becomes an internal coordinator action, not an event
- `QUEUE_RELOADED` — same
- `PLAY` dispatched from within `executeLoadTrack` — eliminated entirely
- `SEEK_COMPLETE` — coordinator could inline this after `executeSeek` returns

---

## Trade-offs

### Advantages

- True single-source-of-truth: every transition decision lives in `executeTransition`
- No nested dispatch complexity; no need for AsyncLock to prevent reentrancy
- Collaborators become trivially unit-testable (pure input/output, no event assertions)
- State machine trace covers all decisions (currently some chaining happens off the trace path)
- Eliminates the entire class of "dispatch inside side-effect" smells

### Disadvantages

- **executeTransition becomes significantly more complex** — it currently has ~80 lines of switch logic; with full chaining it would need to handle multi-step flows with their own error paths
- **Loses event granularity** — RELOAD_QUEUE, QUEUE_RELOADED, PLAY are currently observable in the diagnostic trace and transition history; inlining them loses that visibility
- **All-or-nothing refactor** — the entire collaborator interface must change at once; can't be done incrementally
- **New test surface** — coordinator tests would need to verify chaining logic that's currently covered by event integration
- **Risk surface** — the AsyncLock/event-queue model has been battle-tested against the async bugs this architecture was introduced to fix; inlining transitions re-opens that surface

### Why Option B Is Preferred Now

Option B achieves the primary goal (collaborators have no coordinator imports, decision logic lives in coordinator context) without eliminating the event bus model that provides observability, incremental testability, and proven async safety.

Option C makes sense as a future step **after** Option B is stable — once the boundary is clean, the event-chain model could be progressively simplified without the risk of reopening async bugs.

---

## Migration Path (If Pursued Later)

1. Start with SEEK: `executeSeek` returns void today but SEEK_COMPLETE is dispatched from inside. Replace with coordinator-inlined `SEEK_COMPLETE` context update.
2. If that pattern proves clean, apply to queue rebuild: replace RELOAD_QUEUE/QUEUE_RELOADED with inline coordinator lifecycle.
3. Last: replace PLAY-after-load dispatch with coordinator-chained transition.
4. Remove `dispatchEvent` from `IPlayerServiceFacade`.
5. Remove event bus imports from all collaborators.
6. Evaluate whether RELOAD_QUEUE/QUEUE_RELOADED events should be retained as trace-only signals (emitted by coordinator internally, not dispatched to itself).
