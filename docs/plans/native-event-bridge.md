# Native Event Bridge Architecture Plan

## Executive Summary

**Problem:** Two separate `PlayerStateCoordinator` instances (UI + Headless JS) don't see each other's events, causing stale UI and desynchronized state.

**Solution:** Native event bridge that broadcasts events to all JS contexts with **coordinator only in UI context**.

**Key Decision:** Don't instantiate coordinator in Headless JS at all! Only the UI coordinator executes commands. Headless services just dispatch events.

**Estimated Effort:** 5-8 days  
**Native Code Footprint:** ~270 lines total (minimal as requested)

---

## Core Architecture

### Dual Coordinator Design with Responsibility Split ✅

**Critical Insight:** We need **both** coordinators, but with **different responsibilities**:

- **Headless Coordinator**: Executes TrackPlayer commands (always running)
- **UI Coordinator**: Updates store and UI (only when foregrounded)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │       UI Context (Main Thread - when active)     │   │
│  │                                                  │   │
│  │  PlayerService ──┐                               │   │
│  │  UI Components ──┼──► dispatchPlayerEvent()      │   │
│  │                  │           │                   │   │
│  │                  │           ▼                   │   │
│  │         UI Coordinator (observerMode = true)     │   │
│  │                  │                               │   │
│  │                  ├──► Update Store               │   │
│  │                  ├──► Update UI                  │   │
│  │                  └──► NO TrackPlayer calls       │   │
│  └──────────────────────────────────────────────────┘   │
│                           ▲                             │
│                           │                             │
│                  ┌────────┴────────┐                    │
│                  │ Native Event    │                    │
│                  │ Bridge          │                    │
│                  │ (broadcasts)    │                    │
│                  └────────┬────────┘                    │
│                           │                             │
│                           │                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Headless JS Context (Background - always runs)  │  │
│  │                                                   │  │
│  │  PlayerBackgroundService ──► dispatchPlayerEvent()│  │
│  │  (progress, remote controls)   │                 │  │
│  │                                 ▼                 │  │
│  │      Headless Coordinator (observerMode = false)  │  │
│  │                  │                                │  │
│  │                  ├──► executeTransition()         │  │
│  │                  ├──► Call TrackPlayer methods    │  │
│  │                  └──► NO store updates            │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Why This Works

**Problem Solved:**

- ✅ Remote controls work when app backgrounded (Headless executes)
- ✅ UI updates when app foregrounded (UI coordinator updates store)
- ✅ No duplicate TrackPlayer calls (only Headless executes)
- ✅ No unsafe store access (Headless doesn't touch store)

**Responsibility Split:**

| Coordinator  | Runs When           | Execution Mode      | Updates Store | Calls TrackPlayer |
| ------------ | ------------------- | ------------------- | ------------- | ----------------- |
| **UI**       | App foregrounded    | Observer (`true`)   | ✅ Yes        | ❌ No             |
| **Headless** | Always (background) | Execution (`false`) | ❌ No         | ✅ Yes            |

**Event Flow Example (Lock Screen Pause):**

```
1. User taps pause on lock screen
   ↓
2. handleRemotePause() in Headless JS
   ↓
3. dispatchPlayerEvent({ type: 'PAUSE' })
   ↓
4. Native Bridge broadcasts to both contexts
   ↓
5. Headless Coordinator receives → executeTransition()
   → TrackPlayer.pause() ✅
   ↓
6. UI Coordinator receives (if active) → updateContext()
   → store.setPlaying(false) ✅
```

### Key Design Decisions

#### 1. Headless Coordinator = Execution Authority

**Why:** Headless JS runs continuously during playback, even when app backgrounded.

```typescript
// src/services/coordinator/PlayerStateCoordinator.ts

export class PlayerStateCoordinator {
  private readonly observerMode: boolean;

  constructor() {
    // Headless executes, UI observes
    this.observerMode = !isHeadlessContext();

    log.info(
      `Coordinator initialized: context=${getContextId()}, ` + `observerMode=${this.observerMode}`
    );
  }

  private async executeTransition(event: PlayerEvent, nextState: PlayerState | null) {
    // Only execute in Headless context
    if (this.observerMode) {
      log.debug("Skipping execution in UI context (observer mode)");
      return;
    }

    // Execute TrackPlayer commands
    const playerService = PlayerService.getInstance();
    // ... execution logic
  }
}
```

#### 2. UI Coordinator = Store/UI Authority

**Why:** Zustand store should only be accessed from UI/React context.

```typescript
// src/services/coordinator/PlayerStateCoordinator.ts

private updateContextFromEvent(event: PlayerEvent): void {
  // Update internal context (both coordinators)
  switch (event.type) {
    case 'NATIVE_PROGRESS_UPDATED':
      this.context.position = event.payload.position;
      break;
    // ... other context updates
  }

  // Only update store in UI context
  if (!isHeadlessContext()) {
    this.updateStore(event);
  }
}

private updateStore(event: PlayerEvent): void {
  const store = useAppStore.getState();

  switch (event.type) {
    case 'NATIVE_PROGRESS_UPDATED':
      store.updatePosition(event.payload.position);
      break;
    case 'PLAY':
      store.setPlaying(true);
      break;
    case 'PAUSE':
      store.setPlaying(false);
      break;
    // ... other store updates
  }
}
```

#### 3. No Handoff Protocol Needed

**Why:** Responsibilities are orthogonal (don't overlap):

- Headless always executes (even when UI active)
- UI always updates store (when active)
- Native bridge keeps state synchronized
- No need for "which coordinator is primary" logic

**Benefit:** Simpler than handoff protocol!

---

## Implementation Details

### 1. Native Event Bridge Module

#### Android (Kotlin) - `ABSPlayerEventBridge.kt`

```kotlin
package com.sideshelf

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class ABSPlayerEventBridgeModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val EVENT_NAME = "ABSPlayerEvent"
        private const val MODULE_NAME = "ABSPlayerEventBridge"
    }

    override fun getName() = MODULE_NAME

    @ReactMethod
    fun dispatch(eventData: ReadableMap) {
        // Broadcast to ALL JS contexts (UI + Headless)
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            ?.emit(EVENT_NAME, eventData)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for NativeEventEmitter
    }
}
```

#### iOS (Swift) - `ABSPlayerEventBridge.swift`

```swift
import Foundation

@objc(ABSPlayerEventBridge)
class ABSPlayerEventBridge: RCTEventEmitter {

    override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    override func supportedEvents() -> [String]! {
        return ["ABSPlayerEvent"]
    }

    @objc
    func dispatch(_ eventData: NSDictionary) {
        // Broadcast to ALL JS contexts
        sendEvent(withName: "ABSPlayerEvent", body: eventData)
    }
}
```

#### Module Registration

**Android:** Add to `MainApplication.kt`:

```kotlin
override fun getPackages(): List<ReactPackage> {
    return PackageList(this).packages.apply {
        add(ReactPackage {
            listOf(ABSPlayerEventBridgeModule(it))
        })
    }
}
```

**iOS:** Add to bridge module list (auto-discovered if using `RCT_EXPORT_MODULE`)

---

### 2. Event Bus Update

**Key Changes:**

1. Use native bridge for cross-context events
2. Add context ID to prevent echo
3. Serialize events properly

```typescript
// src/services/coordinator/eventBus.ts
import { NativeModules, NativeEventEmitter, Platform } from "react-native";
import type { PlayerEvent } from "@/types/coordinator";
import { logger } from "@/lib/logger";

const log = logger.forTag("PlayerEventBus");

// Native module
const { ABSPlayerEventBridge } = NativeModules;

// Native event emitter (receives broadcasts)
const nativeEventEmitter = ABSPlayerEventBridge
  ? new NativeEventEmitter(ABSPlayerEventBridge)
  : null;

// Unique ID for this JS context (prevents echo)
const CONTEXT_ID = `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

type EventListener = (event: PlayerEvent) => void | Promise<void>;

export class PlayerEventBus {
  private listeners: EventListener[] = [];
  private eventHistory: Array<{ event: PlayerEvent; timestamp: number }> = [];
  private readonly MAX_HISTORY = 100;
  private nativeSubscription: any;

  constructor() {
    // Subscribe to native event broadcasts
    if (nativeEventEmitter) {
      this.nativeSubscription = nativeEventEmitter.addListener(
        "ABSPlayerEvent",
        (eventData: any) => {
          // Ignore events from this context (echo prevention)
          if (eventData.__contextId === CONTEXT_ID) {
            log.debug(`Ignoring echo event: ${eventData.type}`);
            return;
          }

          // Reconstruct event
          const event: PlayerEvent = {
            type: eventData.type,
            payload: eventData.payload,
          } as PlayerEvent;

          log.debug(`Received cross-context event: ${event.type}`);

          // Notify local listeners
          this.notifyListeners(event);
        }
      );
    }
  }

  /**
   * Dispatch an event
   * - If native bridge available: broadcasts to ALL contexts
   * - If no native bridge: local only (fallback)
   */
  dispatch(event: PlayerEvent): void {
    log.debug(`Dispatching event: ${event.type}`);

    // Add to history
    this.eventHistory.push({ event, timestamp: Date.now() });
    if (this.eventHistory.length > this.MAX_HISTORY) {
      this.eventHistory.shift();
    }

    if (ABSPlayerEventBridge) {
      // Send through native bridge (broadcasts to all contexts)
      const eventData = {
        type: event.type,
        payload: event.payload || {},
        __contextId: CONTEXT_ID,
        __timestamp: Date.now(),
      };

      try {
        ABSPlayerEventBridge.dispatch(eventData);
      } catch (err) {
        log.error("Failed to dispatch via native bridge:", err as Error);
        // Fallback: notify local listeners only
        this.notifyListeners(event);
      }
    } else {
      // No native bridge (web/development): local only
      this.notifyListeners(event);
    }
  }

  /**
   * Notify all local listeners
   */
  private notifyListeners(event: PlayerEvent): void {
    this.listeners.forEach((listener) => {
      try {
        const result = listener(event);
        if (result instanceof Promise) {
          result.catch((err) => {
            log.error("Event listener error:", err as Error);
          });
        }
      } catch (err) {
        log.error("Event listener error:", err as Error);
      }
    });
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  getEventHistory(): ReadonlyArray<{ event: PlayerEvent; timestamp: number }> {
    return [...this.eventHistory];
  }

  clearListeners(): void {
    this.listeners = [];
  }

  destroy(): void {
    if (this.nativeSubscription) {
      this.nativeSubscription.remove();
    }
    this.clearListeners();
  }
}

export const playerEventBus = new PlayerEventBus();

export function dispatchPlayerEvent(event: PlayerEvent): void {
  playerEventBus.dispatch(event);
}
```

---

### 3. Coordinator Context Detection

**Add context detection utility:**

```typescript
// src/services/coordinator/contextDetection.ts

/**
 * Detect if code is running in Headless JS context
 *
 * Headless JS has these characteristics:
 * - No window object
 * - Has __fbBatchedBridge global
 * - AppState might not be available
 */
export function isHeadlessContext(): boolean {
  // Check for window object (UI contexts have window)
  if (typeof window !== "undefined") {
    return false; // Definitely UI context
  }

  // Headless JS has the bridge but no window
  if (typeof global !== "undefined" && typeof (global as any).__fbBatchedBridge !== "undefined") {
    return true;
  }

  return false;
}

/**
 * Get context identifier for logging
 */
export function getContextId(): string {
  return isHeadlessContext() ? "HEADLESS" : "UI";
}
```

---

### 4. Coordinator Initialization in Both Contexts

**Both contexts initialize a coordinator, but with different modes:**

```typescript
// src/services/coordinator/PlayerStateCoordinator.ts

export class PlayerStateCoordinator {
  private static instance: PlayerStateCoordinator | null = null;
  private readonly observ​erMode: boolean;
  private readonly contextId: string;

  /**
   * Get singleton instance
   * Creates instance in BOTH contexts with different modes
   */
  static getInstance(): PlayerStateCoordinator {
    if (!PlayerStateCoordinator.instance) {
      PlayerStateCoordinator.instance = new PlayerStateCoordinator();
    }
    return PlayerStateCoordinator.instance;
  }

  private constructor() {
    this.contextId = getContextId();

    // UI context = observer mode (no execution)
    // Headless context = execution mode (executes TrackPlayer)
    this.observerMode = !isHeadlessContext();

    log.info(
      `[${this.contextId}] Coordinator initialized: ` +
      `observerMode=${this.observerMode}`
    );

    // Subscribe to event bus in BOTH contexts
    this.eventBusUnsubscribe = playerEventBus.subscribe(
      (event) => this.dispatch(event)
    );
  }

  private async executeTransition(
    event: PlayerEvent,
    nextState: PlayerState | null
  ): Promise<void> {
    // Skip execution in UI context (observer mode)
    if (this.observerMode) {
      log.debug(`[${this.contextId}] Skipping execution (observer mode)`);
      return;
    }

    // Execute TrackPlayer commands in Headless context
    log.debug(
      `[${this.contextId}] Executing transition: ${event.type} → ${nextState}`
    );

    const playerService = PlayerService.getInstance();

    try {
      // Handle state transitions
      if (nextState && nextState !== this.context.currentState) {
        switch (nextState) {
          case PlayerState.LOADING:
            if (event.type === 'LOAD_TRACK') {
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
            if (event.type === 'STOP') {
              await playerService.executeStop();
            }
            break;
        }
      }

      // Handle events that don't necessarily change state
      switch (event.type) {
        case 'SEEK':
          await playerService.executeSeek(event.payload.position);
          break;
        case 'SET_RATE':
          await playerService.executeSetRate(event.payload.rate);
          break;
        case 'SET_VOLUME':
          await playerService.executeSetVolume(event.payload.volume);
          break;
      }
    } catch (error) {
      log.error(
        `[${this.contextId}] Error executing transition: ${event.type} → ${nextState}`,
        error as Error
      );
    }
  }

  private updateContextFromEvent(event: PlayerEvent): void {
    // Update internal context (BOTH coordinators do this)
    switch (event.type) {
      case 'NATIVE_PROGRESS_UPDATED':
        this.context.position = event.payload.position;
        this.context.duration = event.payload.duration;
        this.context.lastPositionUpdate = Date.now();
        break;

      case 'PLAY':
        this.context.isPlaying = true;
        break;

      case 'PAUSE':
        this.context.isPlaying = false;
        break;

      // ... other context updates
    }

    // Only update store in UI context
    if (!this.observerMode) {
      // We're in Headless context - no store updates
      log.debug(`[${this.contextId}] Skipping store update (Headless context)`);
    } else {
      // We're in UI context - safe to update store
      this.updateStore(event);
    }
  }

  private updateStore(event: PlayerEvent): void {
    const store = useAppStore.getState();

    switch (event.type) {
      case 'NATIVE_PROGRESS_UPDATED':
        store.updatePosition(event.payload.position);
        break;

      case 'PLAY':
        store.setPlaying(true);
        break;

      case 'PAUSE':
        store.setPlaying(false);
        break;

      case 'NATIVE_TRACK_CHANGED':
        // Update current track in store
        break;

      // ... other store updates
    }
  }
}

/**
 * Convenience function - initializes in BOTH contexts
 */
export function getCoordinator(): PlayerStateCoordinator {
  return PlayerStateCoordinator.getInstance();
}
```

**Update background service to initialize coordinator:**

```typescript
// src/services/PlayerBackgroundService.ts

import { getCoordinator } from "@/services/coordinator/PlayerStateCoordinator";

// Initialize coordinator in Headless context (execution mode)
getCoordinator();

// Remote control handlers just dispatch events
async function handleRemotePlay(): Promise<void> {
  // ... existing logic (smart rewind, etc.)

  // Dispatch event - Headless coordinator will execute
  dispatchPlayerEvent({ type: "PLAY" });

  // DON'T call TrackPlayer directly anymore!
  // await TrackPlayer.play(); // ❌ Remove this
}

async function handleRemotePause(): Promise<void> {
  const store = useAppStore.getState();
  const pauseTime = Date.now();
  store._setLastPauseTime(pauseTime);

  // Dispatch event - Headless coordinator will execute
  dispatchPlayerEvent({ type: "PAUSE" });

  // DON'T call TrackPlayer directly!
  // await TrackPlayer.pause(); // ❌ Remove this
}

// ... similar for other handlers
```

---

### 5. Store Access Safety

With coordinator only in UI context, store access is always safe:

```typescript
// src/services/coordinator/PlayerStateCoordinator.ts

private updateContextFromEvent(event: PlayerEvent): void {
  // Safe to access store - we're always in UI context
  const store = useAppStore.getState();

  switch (event.type) {
    case 'NATIVE_PROGRESS_UPDATED':
      this.context.position = event.payload.position;
      this.context.duration = event.payload.duration;
      this.context.lastPositionUpdate = Date.now();

      // Safe store update
      store.updatePosition(event.payload.position);
      break;

    // ... other cases
  }
}
```

**Remove all store access from PlayerBackgroundService:**

```typescript
// src/services/PlayerBackgroundService.ts

// BEFORE (❌ Risky)
store.updatePosition(event.position);

// AFTER (✅ Safe)
// Just dispatch event, UI coordinator updates store
dispatchPlayerEvent({
  type: "NATIVE_PROGRESS_UPDATED",
  payload: { position: event.position, duration: event.duration },
});
```

---

## Key Architectural Questions Answered

### Q1: How to detect UI vs Headless context?

**Answer:** Check for `window` object and `__fbBatchedBridge`:

```typescript
export function isHeadlessContext(): boolean {
  if (typeof window !== "undefined") return false; // Has window = UI
  if (typeof global !== "undefined" && typeof (global as any).__fbBatchedBridge !== "undefined") {
    return true; // Has bridge but no window = Headless
  }
  return false;
}
```

### Q2: How to prevent duplicate execution?

**Answer:** Use `observerMode` flag set based on context. Only Headless coordinator executes:

```typescript
constructor() {
  // UI observes, Headless executes
  this.observerMode = !isHeadlessContext();
}

private async executeTransition(...) {
  if (this.observerMode) {
    return; // Skip execution in UI context
  }
  // Execute TrackPlayer commands in Headless
}
```

### Q3: Do we need coordinator in Headless JS?

**Answer:** **Yes!** The Headless coordinator is the **execution authority**:

- Headless context always runs (even when UI backgrounded)
- Handles remote control events (lock screen play/pause)
- Executes all TrackPlayer commands
- UI coordinator just observes and updates store

**Responsibility split eliminates need for handoff protocol.**

### Q4: What about when app is backgrounded?

**Answer:** **This is why we need Headless coordinator!**

When app backgrounds:

1. UI context pauses/terminates → UI coordinator stops
2. Headless context keeps running → Headless coordinator still active
3. User taps pause on lock screen → Headless handles it ✅
4. Event broadcasts to both contexts
5. Headless executes pause, UI (when resumed) updates store

This is the **critical insight** - headless must be able to execute independently.

---

## Migration Path

### Phase 1: Native Module (2-3 days)

- [ ] Create `ABSPlayerEventBridge` for Android
- [ ] Create `ABSPlayerEventBridge` for iOS
- [ ] Add TypeScript bindings
- [ ] Test native module sends/receives events

### Phase 2: Event Bus Update (1 day)

- [ ] Update `eventBus.ts` to use native bridge
- [ ] Add context ID for echo prevention
- [ ] Add fallback for non-native platforms
- [ ] Update event bus tests

### Phase 3: Context Detection (1 day)

- [ ] Create `contextDetection.ts` utility
- [ ] Update coordinator to check context
- [ ] Return `null` in Headless JS
- [ ] Add logging for context awareness

### Phase 4: Remove Headless Coordinator (1 day)

- [ ] Remove `getCoordinator()` call from `PlayerBackgroundService`
- [ ] Remove all store access from background service
- [ ] Update services to only dispatch events
- [ ] Verify UI coordinator receives background events

### Phase 5: Testing (2-3 days)

- [ ] Unit tests with native module mocks
- [ ] Integration tests for cross-context events
- [ ] Manual testing: UI updates from background
- [ ] Manual testing: Remote controls work
- [ ] Manual testing: No duplicate TrackPlayer calls
- [ ] Performance testing

**Total: 7-9 days**

---

## Testing Strategy

### Unit Tests

```typescript
// eventBus.test.ts
describe("PlayerEventBus with Native Bridge", () => {
  beforeEach(() => {
    // Mock native module
    NativeModules.ABSPlayerEventBridge = {
      dispatch: jest.fn(),
    };
  });

  it("should dispatch through native bridge", () => {
    const event: PlayerEvent = { type: "PLAY" };
    dispatchPlayerEvent(event);

    expect(NativeModules.ABSPlayerEventBridge.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PLAY",
        __contextId: expect.any(String),
      })
    );
  });

  it("should ignore echo events", () => {
    const listener = jest.fn();
    playerEventBus.subscribe(listener);

    // Simulate receiving our own event back
    const eventData = {
      type: "PLAY",
      __contextId: CONTEXT_ID, // Same as ours
    };

    // Should be ignored
    expect(listener).not.toHaveBeenCalled();
  });
});
```

### Integration Tests

```typescript
// coordinator.integration.test.ts
describe("Cross-Context Event Flow", () => {
  it("should update UI from background events", async () => {
    // Simulate background service dispatching event
    const backgroundEvent: PlayerEvent = {
      type: "NATIVE_PROGRESS_UPDATED",
      payload: { position: 123.45, duration: 600 },
    };

    // Dispatch from "background context"
    dispatchPlayerEvent(backgroundEvent);

    // Wait for native bridge
    await new Promise((resolve) => setTimeout(resolve, 100));

    // UI coordinator should have received it
    const coordinator = PlayerStateCoordinator.getInstance();
    expect(coordinator?.getContext().position).toBe(123.45);
  });
});
```

### Manual Test Checklist

- [ ] **Background Progress Updates UI**
  - Start playback
  - Background the app
  - Progress should update when foregrounding

- [ ] **Remote Controls Work**
  - Use lock screen controls
  - Play/pause/seek should work
  - UI should reflect changes

- [ ] **No Duplicate Execution**
  - Add logging to TrackPlayer calls
  - Verify each command called only once
  - Check both UI and background contexts

- [ ] **Store Updates Safely**
  - Verify no store access warnings in logs
  - Position updates correctly in UI
  - Chapter changes appear in UI

---

## Performance Impact

**Per-Event Overhead:**

- JS → Native: ~0.1-0.5ms
- Native → JS broadcast: ~0.1-0.5ms
- Total: < 1ms

**Event Frequency:**

- Progress updates: 1/second
- State changes: ~10/minute
- User commands: sporadic

**CPU Impact:** < 1% (negligible)

**Memory Impact:** ~50KB for native module

---

## Rollback Plan

If issues arise:

1. **Disable native bridge:**

   ```typescript
   const USE_NATIVE_BRIDGE = false; // Feature flag
   ```

2. **Fall back to local event bus:**
   - Events stay in their context
   - Accept that UI may be stale during background

3. **Revert in stages:**
   - Phase 5 → Phase 4 (re-add headless coordinator)
   - Phase 4 → Phase 3 (keep context detection)
   - Phase 3 → Phase 2 (revert event bus)
   - Phase 2 → Phase 1 (remove native module)

---

## Alternatives Considered

### Option 2: Full Native Coordinator (Rejected)

**What:** Move entire state machine to native

**Pros:**

- Single source of truth
- Shared across all contexts

**Cons:**

- ~1000+ lines of native code per platform
- Lose TypeScript type safety
- Much harder to test and iterate
- Duplicate implementation for iOS/Android
- Lose hot reload benefits

**Verdict:** Too much native code, loses JS benefits

---

### Option 3: Native State Storage (Rejected)

**What:** Native stores state, JS coordinators are controllers

**Pros:**

- Single source of truth for state
- Keep some JS logic

**Cons:**

- More complex than Option 1
- Need serialization/deserialization
- Coordinators become stateless controllers
- Significant refactoring required
- Still ~300-400 lines native code

**Verdict:** More complex than needed, Option 1 is simpler

---

## Code Size Summary

**Native Code:**

- Android: ~120 lines
- iOS: ~100 lines
- Registration: ~30 lines
- **Total: ~250 lines**

**JS Changes:**

- Event bus update: +80 lines
- Context detection: +40 lines
- Coordinator update: +20 lines
- Background service: -30 lines
- **Total: +110 lines**

**Tests:**

- Native mocks: +50 lines
- Integration tests: +100 lines
- **Total: +150 lines**

**Grand Total: ~510 lines** (mostly tests and documentation)

---

## Next Steps

1. **Review & Approve Plan**
2. **Create Feature Branch**
3. **Implement Native Modules** (Android first, then iOS)
4. **Update Event Bus**
5. **Add Context Detection**
6. **Remove Headless Coordinator**
7. **Test Thoroughly**
8. **Merge to Main**

**Estimated Timeline:** 7-9 days for complete implementation and testing.
