# Architecture Research: PlayerStateCoordinator Migration

**Domain:** React Native audio player state machine migration (observer → executor)
**Researched:** 2026-02-16
**Confidence:** HIGH — based on direct codebase analysis of all relevant files

---

## Standard Architecture

### System Overview (Target State After Phases 2–5)

```
┌────────────────────────────────────────────────────────────────────┐
│                           UI Layer                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐     │
│  │ Player UI   │  │  Library UI  │  │  Settings / Other UI   │     │
│  └──────┬──────┘  └──────────────┘  └────────────────────────┘     │
│         │ read-only (subscribe)                                      │
├─────────┴──────────────────────────────────────────────────────────┤
│                        Zustand (playerSlice)                        │
│   Read-only proxy of coordinator context — no write paths          │
│   React/Expo Router integration layer                              │
├────────────────────────────────────────────────────────────────────┤
│                    PlayerStateCoordinator (singleton)               │
│                                                                     │
│   ┌──────────────┐   ┌────────────────┐   ┌─────────────────────┐  │
│   │ Event Queue  │ → │  State Machine │ → │  Context (canonical) │  │
│   │ (serial)     │   │  + Transitions │   │  position/state/     │  │
│   └──────────────┘   └────────────────┘   │  session/track       │  │
│                                           └─────────────────────┘  │
│         ↑                                          ↓               │
│         │ (subscribe)                  (call execute* methods)      │
├─────────┴──────────────────────────────────────────────────────────┤
│                         Event Bus                                   │
│   dispatchPlayerEvent() — services write here, coordinator reads   │
├─────────────────────────────────────────────────────────────────────┤
│                       Service Layer                                 │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │  PlayerService  │  │ PlayerBackground  │  │ ProgressService  │   │
│  │  (execution)    │  │    Service        │  │ (DB + server     │   │
│  │                 │  │  (native events)  │  │  sync)           │   │
│  └─────────────────┘  └──────────────────┘  └──────────────────┘   │
│         ↓                     ↓                      ↓             │
├─────────────────────────────────────────────────────────────────────┤
│                  Native / External Layer                            │
│  ┌────────────────────────────┐   ┌─────────────────────────────┐   │
│  │   react-native-track-player│   │  SQLite (Drizzle ORM)        │   │
│  │   (TrackPlayer native)     │   │  AsyncStorage               │   │
│  └────────────────────────────┘   │  Audiobookshelf Server API  │   │
│                                   └─────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component                 | Responsibility                                                        | What Changes in Migration                                                                                                                   | Communicates With                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlayerStateCoordinator`  | Owns canonical state, validates transitions, executes commands        | Phase 2: call service execute\* methods; Phase 3: own position reconciliation; Phase 4: push to subscribers                                 | EventBus (receives), PlayerService (commands), ProgressService (commands)                                                                           |
| `PlayerEventBus`          | Decoupled dispatch; prevents circular dependencies                    | No change — stays exactly as-is                                                                                                             | All services (write), Coordinator (reads)                                                                                                           |
| `transitions.ts`          | Defines allowed state transitions                                     | No change — matrix validated in Phase 1                                                                                                     | Coordinator only                                                                                                                                    |
| `PlayerService`           | Audio playback execution layer                                        | Phase 2: public methods dispatch events, execute\* methods called by coordinator; Phase 5: remove position reconciliation + implicit guards | TrackPlayer, EventBus, Coordinator (receives commands)                                                                                              |
| `PlayerBackgroundService` | Forward native TrackPlayer events to EventBus; handle remote controls | Phase 2: remote control handlers dispatch events, coordinator calls execute\*; Phase 5: simplified, no session logic                        | EventBus (writes), ProgressService (direct calls remain for session management), Zustand store (direct writes remain for performance-critical path) |
| `ProgressService`         | DB session persistence + server sync                                  | Phase 5: remove mutex lock, remove stale session detection (coordinator guards prevent duplicates)                                          | EventBus (writes SESSION\_\* events), DB helpers, Server API                                                                                        |
| `playerSlice`             | Zustand/React integration layer                                       | Phase 4: becomes read-only proxy; all internal `_set*` write paths removed or rerouted through coordinator                                  | Coordinator (subscribes), React components (reads)                                                                                                  |

---

## Recommended Project Structure

No structural changes are needed. The migration works within the existing layout:

```
src/
├── services/
│   ├── coordinator/
│   │   ├── PlayerStateCoordinator.ts    # Phase 2: add executeTransition(); Phase 3: add position reconciliation
│   │   ├── eventBus.ts                  # No change
│   │   ├── transitions.ts               # No change
│   │   └── __tests__/                   # Phase 2+: add execution tests
│   ├── PlayerService.ts                 # Phase 2: public methods dispatch; Phase 5: remove reconcile*
│   ├── PlayerBackgroundService.ts       # Phase 5: simplify remote handlers
│   └── ProgressService.ts              # Phase 5: remove mutex, remove duplicate guards
├── stores/
│   └── slices/
│       └── playerSlice.ts              # Phase 4: remove write paths; become coordinator proxy
├── hooks/                              # Phase 4: add usePlayerState() hook
│   └── usePlayerState.ts              # NEW — coordinator subscription hook
└── types/
    └── coordinator.ts                  # Phase 3: add position source timestamps to StateContext
```

---

## Architectural Patterns

### Pattern 1: Events Up, Commands Down

**What:** All information flows up to coordinator via events. All actions flow down from coordinator via execute\* method calls on services.

**When to use:** Always. This is the core invariant of the architecture.

**Trade-offs:** Services cannot shortcut the coordinator (prevents the old implicit coordination). The event queue adds ~1ms latency on commands, which is imperceptible for audio.

```typescript
// CORRECT: service dispatches event, coordinator decides and calls back
async play(): Promise<void> {
  dispatchPlayerEvent({ type: "PLAY" });
}

async executePlay(): Promise<void> {
  await TrackPlayer.play(); // called by coordinator only
}

// WRONG: service calls TrackPlayer directly in the public API
async play(): Promise<void> {
  await TrackPlayer.play(); // bypasses coordinator — don't do this
}
```

### Pattern 2: Coordinator executeTransition() Dispatch Table

**What:** `executeTransition()` switches on `nextState` (for state-driven actions) and also on `event.type` (for event-driven actions that don't change state, like SEEK).

**When to use:** Phase 2 onwards.

**Trade-offs:** Two switch statements is slightly verbose but keeps the logic readable and directly maps to the state machine topology. Do not collapse into one switch — state-driven and event-driven actions have different semantics.

```typescript
private async executeTransition(
  event: PlayerEvent,
  nextState: PlayerState | null
): Promise<void> {
  const playerService = PlayerService.getInstance();

  // 1. State-change-driven actions
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
      case PlayerState.PAUSED:
        await playerService.executePause();
        break;
      case PlayerState.IDLE:
        if (event.type === "STOP") {
          await playerService.executeStop();
        }
        break;
    }
  }

  // 2. Event-driven actions (no state change required)
  switch (event.type) {
    case "SEEK":
      await playerService.executeSeek(event.payload.position);
      break;
    case "SET_RATE":
      await playerService.executeSetRate(event.payload.rate);
      break;
    case "SET_VOLUME":
      await playerService.executeSetVolume(event.payload.volume);
      break;
  }
}
```

**Status note:** This pattern already exists in the codebase (`PlayerStateCoordinator.ts:567–623`) and `observerMode` is already `false`. Phase 2 is already structurally complete — the key work is verifying the execute\* methods on PlayerService are correct and tests cover the execution paths.

### Pattern 3: Position Reconciliation in Coordinator (Phase 3)

**What:** Coordinator owns a single canonical position derived from all sources. Sources have explicit priority. Coordinator pushes reconciled position to DB and store.

**When to use:** Phase 3.

**Trade-offs:** Adds complexity to the coordinator but eliminates the position drift that occurs when each service independently decides what the position is.

**Priority order (highest to lowest):**

1. Server position (from fetchMediaProgress after session sync) — most authoritative for cross-device
2. DB session position (from active listening session) — local authoritative
3. TrackPlayer native position (from NATIVE_PROGRESS_UPDATED) — real-time but ephemeral
4. AsyncStorage position — fallback for cold start only

```typescript
// In StateContext (extend Phase 1 types)
interface StateContext {
  // existing fields...
  positionSources: {
    native: { value: number; timestamp: number } | null;
    db: { value: number; timestamp: number } | null;
    server: { value: number; timestamp: number } | null;
  };
}

// In coordinator
private reconcilePosition(sources: StateContext["positionSources"]): number {
  // During active playback: native is most current
  // On app launch / after server sync: db/server wins
  // Use timestamp to break ties
  const candidates = [sources.server, sources.db, sources.native]
    .filter(Boolean)
    .sort((a, b) => b!.timestamp - a!.timestamp);

  return candidates[0]?.value ?? this.context.position;
}
```

**Important:** The `determineResumePosition()` logic in `PlayerService` (lines 646–760) moves into the coordinator as part of Phase 3. The service should call `coordinator.getCanonicalResumePosition(libraryItemId)` instead of doing its own multi-source resolution.

### Pattern 4: playerSlice as Coordinator Proxy (Phase 4)

**What:** `playerSlice` keeps its interface (React components don't change imports) but removes all write paths. Instead, it subscribes to coordinator context and reflects it.

**When to use:** Phase 4 only.

**Trade-offs:** Existing React component code is unchanged (reads from `useAppStore`). The `_set*` actions and direct Zustand writes from services are removed. The hook `usePlayerState()` is additive, not a replacement.

```typescript
// src/hooks/usePlayerState.ts (NEW in Phase 4)
export function usePlayerState(): Readonly<StateContext> {
  const [state, setState] = useState<StateContext>(getCoordinator().getContext());

  useEffect(() => {
    // Coordinator emits 'stateChanged' after each transition + context update
    const coordinator = getCoordinator();
    const unsubscribe = coordinator.subscribe((context) => setState(context));
    return unsubscribe;
  }, []);

  return state;
}

// In PlayerStateCoordinator (Phase 4 addition)
private subscribers: Set<(ctx: StateContext) => void> = new Set();

subscribe(listener: (ctx: StateContext) => void): () => void {
  this.subscribers.add(listener);
  // Emit current state immediately
  listener({ ...this.context });
  return () => this.subscribers.delete(listener);
}

// Called at end of handleEvent() after context update
private notifySubscribers(): void {
  const snapshot = { ...this.context };
  this.subscribers.forEach((fn) => fn(snapshot));
}
```

**Key constraint from PROJECT.md:** `playerSlice` stays as the Zustand/React integration layer — do not remove it. Replace its write paths, not the slice itself. React components keep reading from `useAppStore().player`.

---

## Data Flow

### Command Flow (Phase 2+): UI → TrackPlayer

```
UI Component
    ↓ calls
PlayerService.play() / seekTo() / etc.
    ↓ dispatchPlayerEvent({ type: "PLAY" })
PlayerEventBus
    ↓ notify listeners
PlayerStateCoordinator.dispatch(event)
    ↓ enqueue
Serial Event Queue (async-lock)
    ↓ dequeue one at a time
handleEvent(event)
    ↓ validateTransition()
    ↓ updateContextFromEvent()
    ↓ executeTransition() [Phase 2+]
PlayerService.executePlay()
    ↓
TrackPlayer.play() [native]
    ↓ fires PlaybackState event
PlayerBackgroundService
    ↓ dispatchPlayerEvent({ type: "NATIVE_STATE_CHANGED" })
PlayerEventBus → Coordinator (confirms execution)
```

### Position Flow (Phase 3+): Native → Canonical → Store/DB

```
TrackPlayer fires PlaybackProgressUpdated every ~1s
    ↓
PlayerBackgroundService.handlePlaybackProgressUpdated()
    ↓ dispatchPlayerEvent({ type: "NATIVE_PROGRESS_UPDATED", payload: { position } })
PlayerEventBus → Coordinator
    ↓ updateContextFromEvent(): update positionSources.native
    ↓ reconcilePosition(): select canonical position
    ↓ update context.position
    ↓ notifySubscribers() [Phase 4]
playerSlice receives update → React re-renders
    ↓ (separately, on sync interval)
Coordinator calls ProgressService.updateProgress(canonicalPosition)
    ↓
DB session updated
    ↓ (on shouldSyncToServer)
Coordinator calls ProgressService.syncSessionToServer()
    ↓
Server API call
```

### State Restoration Flow (all phases)

```
App launch
    ↓
playerSlice.restorePersistedState()
    ↓ dispatchPlayerEvent({ type: "RESTORE_STATE", payload: { ... } })
Coordinator: IDLE → RESTORING
    ↓ context.position, context.currentTrack set from payload
    ↓ (if queue mismatch)
PlayerService dispatches RELOAD_QUEUE → Coordinator: RESTORING → LOADING
    ↓
PlayerService.reloadTrackPlayerQueue() → TrackPlayer.add()
    ↓ dispatchPlayerEvent({ type: "QUEUE_RELOADED", payload: { position } })
Coordinator: LOADING → READY
    ↓
RESTORE_COMPLETE dispatched
User can now PLAY / PAUSE
```

### Session Start Flow (Phase 2+): Coordinator guards against duplicates

```
PlayerBackgroundService.handleActiveTrackChanged()
    ↓ (currently calls progressService.startSession() directly)
Phase 2+: dispatchPlayerEvent({ type: "NATIVE_TRACK_CHANGED" })
    ↓ Coordinator validates state allows session start
    ↓ Coordinator calls progressService.startSession() exactly once
    ↓ ProgressService.mutex lock removed (coordinator guarantees serial execution)
```

---

## Build Order / Phase Dependencies

The phases have hard sequential dependencies:

```
Phase 1 (COMPLETE)
  "State machine observes and validates, does not execute"
  Output: event bus, transitions matrix, coordinator types, diagnostics
      ↓ (required: validates state machine topology before execution)

Phase 2: Execute Transitions
  "Coordinator calls service execute* methods when observerMode = false"
  Prerequisite: Phase 1 transition matrix validated in production
  Output: coordinator calls PlayerService.execute*() on transitions
  Key work: verify executeTransition() (already scaffolded), add execution tests
      ↓ (required: coordinator must execute before it can own position)

Phase 3: Canonical Position
  "Coordinator owns position reconciliation; removes duplicate logic from services"
  Prerequisite: Coordinator executing (Phase 2), so it's the only writer
  Output: StateContext gains positionSources; PlayerService.determineResumePosition() moves to coordinator
  Key work: multi-source reconciliation, positionSources timestamps, remove from PlayerService/ProgressService
      ↓ (required: canonical position must exist before UI can subscribe to it cleanly)

Phase 4: Coordinator → Zustand Bridge
  "playerSlice becomes read-only; coordinator.subscribe() drives UI updates"
  Prerequisite: Coordinator has canonical position (Phase 3)
  Output: usePlayerState() hook, coordinator.subscribe() API, playerSlice write paths removed
  Key work: add subscribe API to coordinator, add usePlayerState hook, remove _set*() callers in services
      ↓ (safe to proceed independently of Phase 4, but cleaner after)

Phase 5: Service Simplification
  "Remove legacy coordination guards, mutexes, implicit flags"
  Prerequisite: Phase 2 (coordinator executes, so guards are redundant); Phase 4 optional
  Output: ProgressService mutex removed, isRestoringState flag removed, reconcileTrackPlayerState() removed
  Key work: identify and delete dead coordination code; update tests
```

---

## Anti-Patterns

### Anti-Pattern 1: Circular Coordinator → Service → Coordinator

**What people do:** Service method calls coordinator.dispatch() which calls back into the same service synchronously within the same event handler.

**Why it's wrong:** The event queue uses an async lock. Re-entering the queue from within the lock causes deadlock.

**Do this instead:** Services dispatch to the event bus only. The coordinator responds to the dispatched event on the next tick. The existing architecture already enforces this via the event bus indirection.

### Anti-Pattern 2: Calling TrackPlayer Directly From a Public Service Method

**What people do:** When adding a new control (e.g., `skipChapter()`), write the implementation directly in the public method, bypassing the coordinator.

**Why it's wrong:** The coordinator's state machine never sees this action. State becomes inconsistent. Position reconciliation breaks because the native position changes without a corresponding event going through the state machine.

**Do this instead:** Public method dispatches an event. Coordinator transitions state. Coordinator calls `executeSkipChapter()` on the service. Service calls TrackPlayer.

### Anti-Pattern 3: Writing to playerSlice From Services (Phase 4+)

**What people do:** Continue calling `store._setCurrentTrack()` or `store.updatePosition()` from PlayerService/PlayerBackgroundService after Phase 4.

**Why it's wrong:** Creates two writers for the same state — coordinator and services both writing to playerSlice. React renders will be inconsistent.

**Do this instead:** After Phase 4, only the coordinator subscription writes to playerSlice. Services dispatch events and let the coordinator push to the store.

### Anti-Pattern 4: Removing observerMode Flag Before Execution is Stable

**What people do:** Delete the `observerMode` flag as part of cleanup in Phase 5.

**Why it's wrong:** The flag is the rollback mechanism for Phases 2–3. If a regression is discovered in production, setting `observerMode = true` and redeploying is a 5-minute fix.

**Do this instead:** Keep `observerMode` until Phase 5 cleanup, after Phase 3 has been stable in production for at least one release cycle.

### Anti-Pattern 5: Coordinator Calling ProgressService for Position Updates at 1Hz

**What people do:** On every NATIVE_PROGRESS_UPDATED event, coordinator calls `progressService.updateProgress()`.

**Why it's wrong:** NATIVE_PROGRESS_UPDATED fires every ~1 second. DB writes at 1Hz add unnecessary I/O and increase SQLite contention.

**Do this instead:** Context position updates at 1Hz (in-memory), but DB writes are throttled. The existing `Math.floor(currentTime) % 5 === 0` pattern in PlayerBackgroundService is correct; the coordinator should replicate this throttle. Immediate syncs on PAUSE, SEEK, STOP are appropriate.

---

## Integration Points

### External Services

| Service                   | Integration Pattern                                                                                                                | Notes                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| react-native-track-player | PlayerBackgroundService subscribes to native events, dispatches to EventBus; PlayerService calls TrackPlayer._ in execute_ methods | TrackPlayer is the only component that talks directly to native audio                              |
| Audiobookshelf Server API | ProgressService calls API on sync intervals                                                                                        | No change from current pattern; coordinator dispatches SESSION*SYNC*\* events                      |
| SQLite / Drizzle ORM      | ProgressService reads/writes via db/helpers                                                                                        | No change; coordinator reads position from DB during reconciliation (Phase 3)                      |
| AsyncStorage              | playerSlice reads on cold start for restoration                                                                                    | Phase 3: coordinator takes over cold-start position resolution; AsyncStorage becomes fallback-only |

### Internal Boundaries

| Boundary                                  | Communication                                   | Notes                                                                                                                           |
| ----------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Services → Coordinator                    | Event bus (one-way)                             | Services NEVER import coordinator directly                                                                                      |
| Coordinator → Services                    | Direct method calls (execute\*)                 | Coordinator DOES import services directly; this is the clean direction                                                          |
| Coordinator → UI                          | Subscription callback (Phase 4) / Zustand proxy | Services must NOT call `store._set*()` after Phase 4                                                                            |
| PlayerBackgroundService → ProgressService | Direct calls for session management             | This boundary stays for Phase 5; BGS calls progressService.updateProgress() because it runs in a separate JS context on Android |

---

## Phase-Specific What Changes vs What Stays

### Phase 2: Execute Transitions

**What changes:**

- `PlayerStateCoordinator.observerMode` is already `false` — verify `executeTransition()` is correctly wired
- `executeTransition()` already exists with correct structure — add tests
- Services' public methods already dispatch events instead of executing directly

**What stays the same:**

- Event bus, transitions matrix, all event types
- Context updates from ALL events (NATIVE\_\* events still update context for reality-checking)
- PlayerBackgroundService still directly calls `progressService.updateProgress()` for session management
- playerSlice write paths still active (cleaned up in Phase 4)

**Key risk:** PlayerService.executeLoadTrack() (lines 223–421) calls `store._setCurrentTrack()` and `store._setTrackLoading()` directly. This is acceptable in Phase 2 — it's cleaned up in Phase 4.

### Phase 3: Canonical Position

**What changes:**

- `StateContext` gains `positionSources` with timestamps
- `PlayerService.determineResumePosition()` (lines 646–760) moves to coordinator as `getCanonicalResumePosition()`
- `PlayerService.reconcileTrackPlayerState()` (lines 1183–1374) is replaced by coordinator position reconciliation
- Position writes to `store.updatePosition()` in PlayerBackgroundService are replaced by coordinator subscription push

**What stays the same:**

- PlayerBackgroundService fires events (position updates still come from NATIVE_PROGRESS_UPDATED)
- ProgressService DB writes for session persistence
- Server sync intervals and logic

**Key risk:** `PlayerService.determineResumePosition()` is complex (multiple fallback sources). Moving it requires careful test coverage before removal.

### Phase 4: Coordinator → Zustand Bridge

**What changes:**

- `PlayerStateCoordinator` gains `subscribe()` / `notifySubscribers()`
- `playerSlice.ts` removes `_setCurrentTrack()`, `updatePosition()`, `updatePlayingState()`, all internal `_set*()` callers
- `src/hooks/usePlayerState.ts` added
- Services remove all `store._set*()` calls

**What stays the same:**

- playerSlice state shape (React components keep the same access pattern)
- playerSlice for UI-only state: `isModalVisible`, `sleepTimer`, `isRestoringState`
- `restorePersistedState()` (still dispatches RESTORE_STATE event)

**Key risk:** React component render performance. Coordinator notifies on every context update. Ensure subscribers only re-render when relevant fields change — use selector-based subscription or `useMemo` in the hook.

### Phase 5: Service Simplification

**What changes:**

- `ProgressService.startSessionLocks` mutex removed (coordinator serial queue prevents concurrent calls)
- `PlayerService.reconcileTrackPlayerState()` deleted
- `PlayerService.verifyTrackPlayerConsistency()` deleted
- `playerSlice.isRestoringState` flag deleted
- `store.setIsRestoringState()` calls deleted
- `observerMode` flag kept (rollback capability) but noted as removable in future
- Dead code pruned from PlayerBackgroundService

**What stays the same:**

- Core service method signatures (external API unchanged)
- PlayerBackgroundService structure (still required by react-native-track-player)
- ProgressService session persistence (DB and server sync logic)
- Event bus, transitions, coordinator core

---

## Scalability Considerations

This is a single-device audio player — traditional scalability concerns don't apply. The relevant considerations are:

| Concern                    | Current                                 | After Migration     | Notes                                                                          |
| -------------------------- | --------------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| Event queue depth          | <5 events typical                       | Same                | Serial processing is appropriate; audio events are low frequency               |
| Position update frequency  | 1Hz from TrackPlayer                    | Same                | DB writes throttled to every 5s; context updates at 1Hz                        |
| Memory                     | 100-entry event history                 | Same                | Already capped                                                                 |
| Android background context | Separate JS context for BGS             | Unchanged           | Two coordinator instances (UI + BGS) is intentional and documented in BGS file |
| React render count         | Each `store._set*()` may trigger render | Improved in Phase 4 | Coordinator subscription with selectors reduces redundant renders              |

---

## Sources

- Direct codebase analysis (HIGH confidence):
  - `src/services/coordinator/PlayerStateCoordinator.ts` — Phase 1 implementation, executeTransition() already scaffolded
  - `src/services/coordinator/eventBus.ts` — event bus pattern
  - `src/services/coordinator/transitions.ts` — validated state transition matrix
  - `src/types/coordinator.ts` — complete type definitions
  - `src/services/PlayerService.ts` — execute\*/public method split already in place
  - `src/services/PlayerBackgroundService.ts` — native event handling
  - `src/services/ProgressService.ts` — session management, DB sync
  - `src/stores/slices/playerSlice.ts` — Zustand integration layer
  - `docs/architecture/player-state-machine.md` — design rationale
  - `docs/plans/state-machine-migration.md` — Phase 2–5 plan
  - `.planning/PROJECT.md` — project constraints and key decisions

---

_Architecture research for: PlayerStateCoordinator migration (observer → executor)_
_Researched: 2026-02-16_
