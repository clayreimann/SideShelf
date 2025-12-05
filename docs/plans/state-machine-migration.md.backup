# Player State Machine Migration Plan

## Overview

Migrate player synchronization from implicit state flags to an explicit event-driven state machine to eliminate race conditions and position drift.

**Current Status:** ✅ Phase 1 Complete (Observer Mode)

## Architecture Summary

```
Services → EventBus → Coordinator → Services
```

- **Event Bus**: Decouples event dispatching (prevents circular dependencies)
- **Coordinator**: Owns canonical state, validates transitions, orchestrates services
- **Serial Processing**: Events queued and processed one at a time (eliminates race conditions)

**Key Files:**

- `src/types/coordinator.ts` - State and event type definitions
- `src/services/coordinator/eventBus.ts` - Event bus implementation
- `src/services/coordinator/transitions.ts` - State transition matrix
- `src/services/coordinator/PlayerStateCoordinator.ts` - Main coordinator

---

## Phase 1: Observer Mode ✅ COMPLETE

**Goal:** Validate state machine logic without affecting behavior

**Observer Mode Behavior:**

The coordinator operates with a critical design principle: **context updates from ALL events to reflect actual system state**.

- **State Machine State**: Represents logical phase (PLAYING, PAUSED, etc.)
  - Transitions validate but don't control execution (services still execute)
  - May have no-op transitions (PLAYING→PLAYING)
  - Represents "what phase are we in"

- **Context Fields**: Represent actual current reality (isPlaying, position, etc.)
  - Update from ALL events including NATIVE\_\*
  - Always reflect current system state
  - May change within same state machine state
  - Represent "what's actually happening"

- **Purpose**: Diagnostics UI shows what coordinator observes vs what's actually happening
  - Can compare state machine predictions vs reality
  - Identifies missing transitions or incorrect model
  - Validates state machine accuracy before Phase 2 gives it control

**Example:**

```typescript
// Lock screen pause while in PLAYING state
NATIVE_STATE_CHANGED(Paused) arrives

Result:
- State Machine: PLAYING (no-op transition allowed)
- Context.isPlaying: false (updated from event)

Diagnostics shows: "State: PLAYING, Actually Playing: No"
// This mismatch is expected and validates lock screen handling
```

**Completed:**

- ✅ Created PlayerStateCoordinator with event queue
- ✅ Implemented event bus to prevent circular dependencies
- ✅ Added state transition validation (observer mode)
- ✅ Integrated with all services:
  - PlayerService (LOAD_TRACK, PLAY, PAUSE, STOP, RELOAD_QUEUE, QUEUE_RELOADED)
  - PlayerBackgroundService (all NATIVE\_\* events)
  - ProgressService (SESSION\_\* events)
  - playerSlice (RESTORE_STATE)
  - index.ts (APP_FOREGROUNDED)
- ✅ Added diagnostics UI to Track Player screen with transition history
- ✅ Comprehensive unit tests (122+ tests, 90%+ coverage)
- ✅ Fixed critical issues discovered during validation:
  - Internal state machine now updates correctly in observer mode
  - Context synchronization from ALL event payloads (including NATIVE_STATE_CHANGED)
  - NATIVE_STATE_CHANGED updates isPlaying context for accurate diagnostics
  - Session events marked as no-op (concurrent with playback)
  - Queue reload events handle TrackPlayer rebuilding
  - Transition history tracking (100-entry circular buffer)
  - RESTORING state allows PLAY/PAUSE for user control
  - NATIVE_STATE_CHANGED accepted from PAUSED state (lock screen controls)

**Validation Results:**

- ✅ State machine tracks state accurately (idle → loading → ready → playing)
- ✅ Context fields populated correctly from ALL events (position, duration, sessionId, isPlaying, track info)
- ✅ Lock screen controls work correctly (NATIVE_STATE_CHANGED accepted from paused/playing)
- ✅ Minimal rejected transitions (<5% under normal operation)
- ✅ Event processing time <10ms average
- ✅ No performance degradation
- ✅ Diagnostics UI shows accurate real-time state

**Phase 1 is production-ready** and provides complete state visibility for debugging.

---

## Phase 2: Execute Transitions

**Goal:** Coordinator starts executing state transitions through services

**Tasks:**

1. **Enable Execution Mode**

   ```typescript
   // In PlayerStateCoordinator.ts
   private readonly observerMode = false; // Change from true
   ```

2. **Add Service Method Calls**

   ```typescript
   private async executeTransition(event: PlayerEvent, nextState: PlayerState) {
     switch (nextState) {
       case PlayerState.LOADING:
         await PlayerService.loadTrack(event.payload);
         break;
       case PlayerState.PLAYING:
         await PlayerService.play();
         break;
       case PlayerState.PAUSED:
         await PlayerService.pause();
         break;
       // etc...
     }
   }
   ```

3. **Update Services to Check Coordinator First**

   ```typescript
   // In PlayerService.playTrack()
   async playTrack(libraryItemId: string) {
     // Dispatch event instead of direct execution
     dispatchPlayerEvent({
       type: 'LOAD_TRACK',
       payload: { libraryItemId }
     });
   }
   ```

4. **Add Transition Guards**
   - Prevent invalid transitions (e.g., play when already playing)
   - Add validation for track loading state
   - Handle concurrent session creation

**Testing:**

- Verify all transitions work through coordinator
- Test error recovery paths
- Validate no duplicate sessions created

**Important Note on Context Updates:**

Context fields must continue to update from ALL events (including NATIVE\_\*) in Phase 2 and beyond because:

1. **Confirmation**: Verify execution actually happened (e.g., coordinator calls play(), NATIVE_STATE_CHANGED confirms)
2. **External events**: Lock screen, headphones, and system interruptions still generate NATIVE\_\* events
3. **Reality check**: Detect if native player disagrees with coordinator's commands

Even when coordinator controls execution, it must observe reality to detect:

- Commands that fail silently
- External controls overriding coordinator
- System interruptions (phone calls, audio focus loss)

**Rollback:** Set `observerMode = true` and redeploy

---

## Phase 2.5: Native Event Bridge for Cross-Context Synchronization

**Goal:** Implement native event bridge to synchronize UI and Headless JS coordinators

**Status:** ⏳ Planned

### Problem Statement

On Android, `PlayerBackgroundService` runs in Headless JS (separate JavaScript context from UI). This creates critical issues:

1. **Events don't cross contexts**: Background service events (progress updates, remote controls) don't reach UI coordinator
2. **UI stays stale**: UI won't update position, chapters, or state from background playback
3. **Remote controls break when backgrounded**: No coordinator to execute TrackPlayer commands when UI pauses

### Solution: Dual Coordinators with Native Event Bridge

**Architecture:**

```
UI Context (observerMode = true)
├── Receives all events via native bridge
├── Updates Zustand store
├── Updates UI
└── Does NOT execute TrackPlayer commands

Headless Context (observerMode = false)
├── Receives all events via native bridge
├── Executes TrackPlayer commands
├── Handles remote controls (always running)
└── Does NOT update store (no React context)

Native Event Bridge
└── Broadcasts events to ALL JS contexts
```

**Responsibility Split:**

| Coordinator  | Runs When           | Execution Mode      | Updates Store | Calls TrackPlayer |
| ------------ | ------------------- | ------------------- | ------------- | ----------------- |
| **UI**       | App foregrounded    | Observer (`true`)   | ✅ Yes        | ❌ No             |
| **Headless** | Always (background) | Execution (`false`) | ❌ No         | ✅ Yes            |

**Why This Works:**

- ✅ Remote controls work when app backgrounded (Headless executes)
- ✅ UI updates when app foregrounded (UI coordinator updates store)
- ✅ No duplicate TrackPlayer calls (only Headless executes)
- ✅ No unsafe store access (Headless doesn't touch store)
- ✅ No handoff protocol needed (responsibilities don't overlap)

### Implementation Tasks

**1. Native Event Bridge Module (2-3 days)**

Create Android and iOS modules to broadcast events across JS contexts:

**Android (`ABSPlayerEventBridge.kt`):**

```kotlin
class ABSPlayerEventBridgeModule(reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    @ReactMethod
    fun dispatch(eventData: ReadableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit("ABSPlayerEvent", eventData)
    }
}
```

**iOS (`ABSPlayerEventBridge.swift`):**

```swift
@objc(ABSPlayerEventBridge)
class ABSPlayerEventBridge: RCTEventEmitter {
    @objc
    func dispatch(_ eventData: NSDictionary) {
        sendEvent(withName: "ABSPlayerEvent", body: eventData)
    }
}
```

- [ ] Create Android native module
- [ ] Create iOS native module
- [ ] Add TypeScript bindings
- [ ] Test cross-context event delivery

**2. Event Bus Update (1 day)**

Update `eventBus.ts` to use native bridge:

```typescript
import { NativeModules, NativeEventEmitter } from "react-native";

const { ABSPlayerEventBridge } = NativeModules;
const emitter = new NativeEventEmitter(ABSPlayerEventBridge);
const CONTEXT_ID = `ctx-${Date.now()}-${Math.random()}`;

export class PlayerEventBus {
  constructor() {
    // Listen for cross-context events
    emitter.addListener("ABSPlayerEvent", (eventData) => {
      if (eventData.__contextId === CONTEXT_ID) return; // Skip echo
      this.notifyListeners(eventData);
    });
  }

  dispatch(event: PlayerEvent): void {
    // Broadcast to all contexts
    ABSPlayerEventBridge.dispatch({
      type: event.type,
      payload: event.payload,
      __contextId: CONTEXT_ID,
    });
  }
}
```

- [ ] Add native bridge integration
- [ ] Add context ID for echo prevention
- [ ] Add fallback for non-native platforms
- [ ] Update event bus tests

**3. Context Detection Utility (1 day)**

```typescript
// src/services/coordinator/contextDetection.ts
export function isHeadlessContext(): boolean {
  // UI has window, Headless doesn't
  if (typeof window !== "undefined") return false;

  // Headless has __fbBatchedBridge but no window
  if (typeof global !== "undefined" && typeof (global as any).__fbBatchedBridge !== "undefined") {
    return true;
  }

  return false;
}

export function getContextId(): string {
  return isHeadlessContext() ? "HEADLESS" : "UI";
}
```

- [ ] Create context detection utility
- [ ] Add tests for context detection
- [ ] Add logging for context awareness

**4. Coordinator Architecture with Mixins (2 days)**

Refactor to use Mixins for code reuse between UI, Headless, and Unified coordinators:

```typescript
// src/services/coordinator/mixins.ts
type Constructor<T = {}> = new (...args: any[]) => T;

// Mixin: Adds store update capability
export function WithStoreUpdates<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    updateStore(event: PlayerEvent, nextState: PlayerState) {
      const store = useAppStore.getState();
      switch (event.type) {
        case "NATIVE_PROGRESS_UPDATED":
          store.updatePosition(event.payload.position);
          break;
        case "PLAY":
        case "NATIVE_STATE_CHANGED":
          if (nextState === PlayerState.PLAYING) store.setPlaying(true);
          break;
        case "PAUSE":
          store.setPlaying(false);
          break;
        // ... other store updates
      }
    }
  };
}

// Mixin: Adds TrackPlayer execution capability
export function WithTrackPlayerExecution<TBase extends Constructor>(Base: TBase) {
  return class extends Base {
    async executeTransition(event: PlayerEvent, nextState: PlayerState) {
      const playerService = PlayerService.getInstance();
      try {
        // ... execution logic (load, play, pause, etc.)
        switch (nextState) {
          case PlayerState.PLAYING:
            await playerService.executePlay();
            break;
          case PlayerState.PAUSED:
            await playerService.executePause();
            break;
          // ...
        }
      } catch (error) {
        log.error(`Execution error: ${event.type}`, error);
      }
    }
  };
}

// src/services/coordinator/PlayerStateCoordinator.ts (Base)
export abstract class BaseCoordinator {
  protected context: StateContext;

  constructor(protected readonly contextId: string) {
    playerEventBus.subscribe((event) => this.dispatch(event));
  }

  protected async handleEvent(event: PlayerEvent): Promise<void> {
    await this.updateContext(event);
    const nextState = this.validateTransition(event);
    if (nextState) await this.onTransition(event, nextState);
  }

  protected abstract onTransition(event: PlayerEvent, nextState: PlayerState): Promise<void>;
}

// src/services/coordinator/UICoordinator.ts
class UICoordinator extends WithStoreUpdates(BaseCoordinator) {
  constructor() {
    super("UI");
  }

  protected async onTransition(event: PlayerEvent, nextState: PlayerState) {
    this.updateStore(event, nextState); // Only updates store
  }
}

// src/services/coordinator/HeadlessCoordinator.ts
class HeadlessCoordinator extends WithTrackPlayerExecution(BaseCoordinator) {
  constructor() {
    super("HEADLESS");
  }

  protected async onTransition(event: PlayerEvent, nextState: PlayerState) {
    await this.executeTransition(event, nextState); // Only executes commands
  }
}

// src/services/coordinator/UnifiedCoordinator.ts (iOS)
class UnifiedCoordinator extends WithStoreUpdates(WithTrackPlayerExecution(BaseCoordinator)) {
  constructor() {
    super("UNIFIED");
  }

  protected async onTransition(event: PlayerEvent, nextState: PlayerState) {
    await this.executeTransition(event, nextState); // Execute first
    this.updateStore(event, nextState); // Then update store
  }
}

// src/services/coordinator/index.ts (Factory)
export function getCoordinator(): BaseCoordinator {
  if (Platform.OS === "ios") return UnifiedCoordinator.getInstance();
  if (isHeadlessContext()) return HeadlessCoordinator.getInstance();
  return UICoordinator.getInstance();
}
```

**Benefits:**

- ✅ **Code Reuse**: `updateStore` and `executeTransition` logic written once
- ✅ **Explicit Capabilities**: Mixins clearly define what each coordinator can do
- ✅ **Platform Specifics**: iOS gets both capabilities, Android gets split
- ✅ **Type Safety**: Mixins add methods to the class type

- [ ] Create `mixins.ts` with `WithStoreUpdates` and `WithTrackPlayerExecution`
- [ ] Refactor `PlayerStateCoordinator` to `BaseCoordinator`
- [ ] Create `UICoordinator`, `HeadlessCoordinator`, `UnifiedCoordinator`
- [ ] Update factory and tests

**5. Track Metadata Synchronization**

How does the UI know what track is playing if Headless loads it?

1. **Headless/Unified Coordinator** receives `LOAD_TRACK` event
2. Executes `TrackPlayer.load(track)`
3. Native player emits `playback-track-changed`
4. `PlayerBackgroundService` listens to native event
5. Dispatches `NATIVE_TRACK_CHANGED` event via bridge
6. **UI/Unified Coordinator** receives `NATIVE_TRACK_CHANGED`
7. Updates `store.activeTrackId`
8. UI components reactively update metadata from store

**6. Remove Direct Store Access from Background Service (1 day)**

```typescript
// src/services/PlayerBackgroundService.ts

// BEFORE (❌ Risky - direct store access in Headless)
store.updatePosition(event.position);

// AFTER (✅ Safe - dispatch event, UI coordinator updates store)
dispatchPlayerEvent({
  type: "NATIVE_PROGRESS_UPDATED",
  payload: { position: event.position, duration: event.duration },
});
```

- [ ] Remove all `store.updatePosition()` calls
- [ ] Remove all `store.setPlaying()` calls
- [ ] Replace with event dispatches
- [ ] Verify no store access remains

**6. Testing (2-3 days)**

- [ ] Unit tests with native module mocks
- [ ] Integration tests for cross-context events
- [ ] Manual: UI updates from background events
- [ ] Manual: Remote controls work when backgrounded
- [ ] Manual: No duplicate TrackPlayer calls
- [ ] Manual: Position/state stays synced
- [ ] Performance: Event latency < 1ms

### Key Architectural Decisions

**Q: Why Mixins instead of just inheritance?**
A: Code reuse! `UnifiedCoordinator` (iOS) needs BOTH `executeTransition` (from Headless) AND `updateStore` (from UI). Mixins allow us to compose these capabilities without duplicating code.

**Q: How to prevent duplicate TrackPlayer calls?**
A: Only `HeadlessCoordinator` and `UnifiedCoordinator` use `WithTrackPlayerExecution`. `UICoordinator` does not have this capability.

**Q: How to prevent unsafe store access?**
A: Only `UICoordinator` and `UnifiedCoordinator` use `WithStoreUpdates`. `HeadlessCoordinator` does not have this capability.

**Q: Do they stay synchronized?**
A: Yes! Native bridge broadcasts ALL events to both contexts. All coordinators extend `BaseCoordinator` which handles the state machine logic.

### Event Flow Examples

**Remote Control (Lock Screen Pause):**

```
1. User taps pause on lock screen
2. handleRemotePause() in Headless JS
3. dispatchPlayerEvent({ type: 'PAUSE' })
4. Native bridge broadcasts to BOTH contexts
5. Headless Coordinator: executeTransition() → TrackPlayer.pause() ✅
6. UI Coordinator: updateStore() → store.setPlaying(false) ✅
```

**Progress Update:**

```
1. TrackPlayer fires progress event in Headless
2. handlePlaybackProgressUpdated() dispatches NATIVE_PROGRESS_UPDATED
3. Native bridge broadcasts to BOTH contexts
4. Headless Coordinator: updates context.position (no execution needed)
5. UI Coordinator: updates context.position + store.updatePosition() ✅
```

### Testing Strategy

**Unit Tests:**

- Mock `ABSPlayerEventBridge` module
- Verify events dispatched via native bridge
- Test echo prevention (context ID filtering)
- Test context detection (window vs \_\_fbBatchedBridge)

**Integration Tests:**

- Simulate background service dispatching event
- Verify UI coordinator receives and updates store
- Simulate UI dispatching command
- Verify Headless coordinator executes TrackPlayer call

**Manual Tests:**

- Background app during playback
- Use lock screen controls (play/pause/seek)
- Foreground app → verify UI updated
- Monitor logs: verify only one TrackPlayer call per event
- Monitor logs: verify no store access from Headless

### Performance Impact

**Per-Event Overhead:**

- JS → Native: ~0.1-0.5ms
- Native → JS broadcast: ~0.1-0.5ms
- Total: < 1ms per event (negligible)

**Event Frequency:**

- Progress updates: 1/second
- State changes: ~10/minute
- User commands: sporadic

**CPU Impact:** < 1% overhead
**Memory Impact:** ~50KB for native module

### Rollback Plan

1. **Disable native bridge via feature flag**

   ```typescript
   const USE_NATIVE_BRIDGE = false;
   ```

2. **Fall back to local event bus**
   - Events stay in their context
   - Accept that UI may be stale during background
   - Remote controls still work (background service calls TrackPlayer directly)

3. **Staged rollback**
   - Phase 6 → Phase 5 (re-enable direct store access in background)
   - Phase 5 → Phase 4 (remove context-based mode split)
   - Phase 4 → Phase 3 (revert event bus)
   - Phase 3 → Phase 2 (remove context detection)
   - Phase 2 → Phase 1 (remove native modules)

### Success Criteria

- ✅ UI updates correctly during background playback
- ✅ Remote controls work when app backgrounded
- ✅ No duplicate TrackPlayer calls (verify in logs)
- ✅ No store access errors from Headless context
- ✅ Position stays synchronized (drift < 1 second)
- ✅ Event processing latency < 10ms average
- ✅ No memory leaks (stable over 1hr playback)

### Dependencies

**Must complete Phase 2 first:**

- Services must dispatch events (not direct execution)
- `execute*` methods must exist on PlayerService
- Coordinator must validate transitions

**Enables future phases:**

- Phase 3 (Position Logic) easier with synchronized state
- Phase 4 (State Propagation) can use either coordinator's state
- Phase 5 (Cleanup) can remove legacy dual-path code

### Timeline

**Total: 8-10 days**

- Native modules: 2-3 days
- Event bus update: 1 day
- Context detection: 1 day
- Base class + subclasses (UI/Headless/Unified): 2 days
- Remove store access: 1 day
- Testing: 2-3 days

\*\*Rollback:

---

## Phase 3: Centralize Position Logic

**Goal:** Coordinator owns canonical position, reconciles all sources

**Tasks:**

1. **Track Position in Coordinator**

   ```typescript
   interface StateContext {
     // ... existing fields
     position: number; // Canonical position
     lastNativeUpdate: number; // Timestamp from TrackPlayer
     lastServerUpdate: number; // Timestamp from server sync
   }
   ```

2. **Add Position Reconciliation**

   ```typescript
   private reconcilePosition(sources: {
     native?: number;
     server?: number;
     asyncStorage?: number;
   }): number {
     // Priority: server > native > AsyncStorage
     // Use most recent timestamp as tiebreaker
   }
   ```

3. **Update Progress Reporting**

   ```typescript
   // Coordinator calls ProgressService with canonical position
   private async handleProgressUpdate(event: ProgressUpdateEvent) {
     const position = this.reconcilePosition({
       native: event.payload.position
     });

     if (Math.abs(position - this.context.position) > 5) {
       await ProgressService.syncPosition(position);
     }
   }
   ```

4. **Remove Duplicate Position Tracking**
   - Keep position only in coordinator context
   - Services query coordinator for current position
   - Remove position from playerSlice (defer to Phase 4)

**Testing:**

- Test position sync during playback
- Verify seek operations update correctly
- Test app backgrounding/foregrounding scenarios
- Validate server sync doesn't create drift

**Rollback:** Services can revert to local position tracking

---

## Phase 4: State Propagation

**Goal:** Replace playerSlice with coordinator state subscriptions

**Tasks:**

1. **Add Subscription API**

   ```typescript
   // In PlayerStateCoordinator
   subscribe(listener: (context: StateContext) => void): () => void {
     const subscription = { listener };
     this.subscriptions.push(subscription);
     return () => this.unsubscribe(subscription);
   }
   ```

2. **Create React Hook**

   ```typescript
   // src/hooks/usePlayerState.ts
   export function usePlayerState() {
     const [state, setState] = useState<StateContext | null>(null);

     useEffect(() => {
       const coordinator = getCoordinator();
       const unsubscribe = coordinator.subscribe(setState);
       setState(coordinator.getContext()); // Initial state
       return unsubscribe;
     }, []);

     return state;
   }
   ```

3. **Update Components**

   ```typescript
   // Replace playerSlice usage
   // Before:
   const { isPlaying, position } = usePlayerSlice();

   // After:
   const playerState = usePlayerState();
   const { isPlaying, position } = playerState || {};
   ```

4. **Remove playerSlice**
   - Migrate all components to usePlayerState
   - Remove playerSlice store
   - Remove playerSlice actions

**Testing:**

- Verify UI updates correctly
- Test subscription cleanup (no memory leaks)
- Validate performance (render counts)

**Rollback:** Keep playerSlice alongside coordinator temporarily

---

## Phase 5: Cleanup

**Goal:** Remove legacy code and simplify

**Tasks:**

1. **Remove Implicit State Flags**

   ```typescript
   // Delete these from services:
   private isLoading = false;
   private isPreparing = false;
   private sessionCreationInProgress = false;
   ```

2. **Simplify Service Methods**
   - Remove state checks (coordinator validates)
   - Remove position reconciliation (coordinator owns)
   - Remove duplicate session guards

3. **Update Tests**
   - Remove tests for deleted code
   - Update integration tests to use coordinator

4. **Documentation**
   - Update architecture docs
   - Add coordinator API reference
   - Document event types and transitions

**Testing:**

- Full regression test suite
- Performance benchmarks
- Manual QA of all player features

---

## Rollback Strategy

### Phase 2-3 Rollback

1. Set `observerMode = true` in coordinator
2. Services continue to execute directly
3. Redeploy

### Phase 4 Rollback

1. Revert component changes (restore playerSlice usage)
2. Keep coordinator running for monitoring
3. Redeploy

### Phase 5 Rollback

No rollback - cleanup is final. Test thoroughly in phases 2-4.

---

## Success Metrics

**Performance:**

- Event processing time: <10ms average
- No increase in session creation time
- Position sync latency: <1 second

**Reliability:**

- Zero race condition bugs
- Zero duplicate sessions created
- Position drift: <5 seconds over 30min playback

**Code Quality:**

- Remove 500+ lines of state management code
- Single source of truth for player state
- 90%+ test coverage maintained

---

## Testing Strategy

### Unit Tests

**Phase 1 ✅ Complete:**

- Event bus: 56 tests (100% coverage)
  - Event dispatching and subscription
  - Event history tracking
  - Async listener handling
  - Error handling and edge cases
- Transitions: 47 tests (100% coverage)
  - State transition matrix completeness
  - Validation functions
  - Complete playback flows
  - Error recovery scenarios
- Coordinator: 37 tests (90% coverage)
  - Singleton pattern
  - Serial event processing
  - Metrics collection
  - Observer mode behavior

**Phase 2-5 Requirements:**

- Add tests for new transition execution paths
- Test service method calls from coordinator
- Validate position reconciliation logic
- Test subscription and state propagation
- Maintain >90% coverage throughout

### Integration Tests

**Phase 2:**

- Complete playback flow: load → play → pause → stop
- Error recovery: load failure, playback error
- Concurrent operations: multiple play attempts
- Session management: creation, stale session cleanup

**Phase 3:**

- Position reconciliation from multiple sources
- Seek during playback
- App backgrounding/foregrounding
- Server sync during playback

**Phase 4:**

- UI updates on state changes
- Subscription cleanup (memory leaks)
- React component render counts
- State propagation to multiple subscribers

**Phase 5:**

- Full regression suite
- Performance benchmarks
- Manual QA checklist

### Manual Testing Checklist

For each phase, validate:

**Playback Scenarios:**

- [ ] Load and play audiobook
- [ ] Load and play podcast episode
- [ ] Pause and resume
- [ ] Seek forward/backward
- [ ] Change playback speed
- [ ] Adjust volume

**Background Scenarios:**

- [ ] Background app and resume
- [ ] Kill app and restore session
- [ ] Receive phone call during playback
- [ ] Switch to another app and back

**Network Scenarios:**

- [ ] Offline playback (downloaded content)
- [ ] Poor network (streaming)
- [ ] Network switch (WiFi to cellular)
- [ ] Server unreachable during sync

**Edge Cases:**

- [ ] Multiple rapid pause/play
- [ ] Seek during loading
- [ ] Session timeout handling
- [ ] App crash recovery
- [ ] Multiple devices (session conflict)

### Performance Testing

**Metrics to Track:**

Event Processing:

- Average processing time: <10ms
- 95th percentile: <50ms
- Queue depth: <5 events

Session Operations:

- Session creation: <500ms
- Position sync: <1s
- Server sync: <2s

UI Responsiveness:

- Play button response: <100ms
- Seek operation: <200ms
- Position update frequency: 1Hz

Memory:

- No memory leaks (subscription cleanup)
- Event history capped at 100
- Coordinator memory stable over time

### Regression Testing

Before each phase deployment:

1. **Run full test suite:** `npm test`
2. **Check coverage:** `npm run test:coverage`
3. **Manual QA:** Complete checklist above
4. **Performance validation:** Check metrics
5. **Log review:** Check for errors/warnings

### Monitoring in Production

**Phase 1 (Current):**

- Monitor invalid transition rate
- Track state mismatches (coordinator vs actual)
- Alert on high queue depth
- Review diagnostic logs weekly

**Phase 2-5:**

- Monitor event processing time
- Track error recovery frequency
- Alert on duplicate sessions
- Monitor position drift

**Dashboard Metrics:**

- Total events processed
- State transition count
- Rejected transition count
- Average processing time
- Current state distribution

---

## Timeline Estimate

- **Phase 2:** 2-3 days development + 1 week validation
- **Phase 3:** 3-4 days development + 1 week validation
- **Phase 4:** 2-3 days development + 1 week validation
- **Phase 5:** 1-2 days development + full regression

**Total:** 4-6 weeks with validation periods

---

## Decision Points

After each phase, evaluate:

1. **Are logs showing unexpected behavior?** → Investigate before proceeding
2. **Any performance regression?** → Optimize before proceeding
3. **User reports of new bugs?** → Rollback and fix
4. **State machine missing edge cases?** → Add transitions before proceeding

Do not proceed to next phase until current phase is stable in production.
