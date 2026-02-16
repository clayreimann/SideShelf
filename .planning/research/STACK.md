# Stack Research

**Domain:** React Native audio player — state machine migration (coordinator execution control, position reconciliation, Zustand proxy bridge)
**Researched:** 2026-02-16
**Confidence:** HIGH for FSM decision and Zustand bridge pattern; MEDIUM for position reconciliation priority ordering (domain pattern, not well-documented as a named pattern)

---

## Executive Decision Summary

Three questions, three answers:

1. **FSM library**: Keep the custom implementation. Do not adopt XState.
2. **Position reconciliation priority**: Native player > server session DB > AsyncStorage > zero.
3. **Zustand-as-proxy bridge**: Coordinator-pushes via `useAppStore.setState()`. No new middleware.

---

## Recommended Stack

### Core Technologies

| Technology                | Version           | Purpose                                                             | Why Recommended                                                                                                                                                                  |
| ------------------------- | ----------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom FSM (existing)     | —                 | State machine execution control in `PlayerStateCoordinator`         | Already written, well-structured, covers all needed states. XState adds 16.7 kB gzipped, a steep learning curve, and migration risk with no meaningful upside for this use case. |
| Zustand                   | 5.0.8 (installed) | React UI state store; playerSlice as read-only proxy of coordinator | Already installed. `subscribeWithSelector` middleware already applied in `appStore.ts`. `useAppStore.setState()` is the correct external-push API.                               |
| async-lock                | 1.4.1 (installed) | Serial event queue processing in coordinator                        | Already in use in `PlayerStateCoordinator`. Prevents race conditions in transition execution. Keep it.                                                                           |
| eventemitter3             | 5.0.1 (installed) | Coordinator emits `diagnostic` and `eventProcessed` events          | Already in use. Sufficient for coordinator-to-subscriber notification.                                                                                                           |
| react-native-track-player | 4.1.2 (installed) | Native audio playback; authoritative source for live position       | Native module; `useProgress()` hook is the only reliable real-time position source during playback.                                                                              |

### Supporting Libraries

| Library                                      | Version                    | Purpose                                                           | When to Use                                                                                    |
| -------------------------------------------- | -------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `zustand/middleware` `subscribeWithSelector` | bundled with zustand 5.0.8 | Enables `useAppStore.subscribe(selector, callback)` outside React | Already applied in `appStore.ts`. Use for coordinator-to-store change notifications if needed. |
| `@react-native-async-storage/async-storage`  | 2.2.0 (installed)          | Persist position, track, rate, volume between sessions            | Fallback source only during cold start / restoration. Not authoritative during playback.       |

### Development Tools

| Tool                      | Purpose                                   | Notes                                                                                                 |
| ------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Existing `PlayerEventBus` | Decoupled event dispatch from coordinator | Already correctly structured. No changes needed to bus itself.                                        |
| Existing `transitions.ts` | State transition matrix                   | Well-defined. Phase 2 execution can be added by removing `observerMode` guard in `executeTransition`. |

---

## Decision: Keep Custom FSM — Do NOT Adopt XState

### Why NOT XState

XState v5 (current: 5.28.0, `@xstate/react` 6.0.0) is a well-designed library. For greenfield projects it is the right default. For this migration it is wrong:

1. **The FSM is already written and correct.** `PlayerStateCoordinator` has a complete transition matrix in `transitions.ts`, serial processing via `async-lock`, diagnostic tooling, and `executeTransition` scaffolded. XState would replace working code with learning curve.

2. **Bundle size penalty for zero gain.** XState core is ~16.7 kB gzipped. The app is already well into install size; adding a large dependency to replace a hand-rolled ~200-line transitions file is not justified.

3. **Actor model mismatch.** XState v5 centers on actors. The existing architecture is a singleton coordinator + event bus + services. Migrating to XState actors would require restructuring service boundaries — scope creep that derails the actual goal.

4. **No visualization ROI.** XState's main DX advantage over custom FSMs is the Stately visualizer. The `transitions.ts` record is already so explicit it can be visualized by reading it. The tradeoff is not worth it.

5. **Migration risk.** Replacing a running, partially-validated state machine mid-migration with a new library introduces a regression surface with no tests written for XState integration.

**Decision: The Phase 2+ work is adding execution behavior to the existing FSM, not replacing the FSM.**

### What This Means for Phase 2

The existing coordinator has `observerMode = false` and `executeTransition()` already scaffolded. Phase 2 execution control is unblocking `executeTransition` — not a rewrite.

---

## Decision: Position Reconciliation Priority Order

Audio position comes from three sources with different staleness profiles. The coordinator must have one deterministic algorithm.

### Priority Stack (highest to lowest authority)

| Priority     | Source                                                    | When Authoritative                                        | Rationale                                                                                                                                                                                                                                                                                                   |
| ------------ | --------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 (highest)  | Native player (`TrackPlayer.getProgress()`)               | During active playback, after queue loaded                | The native player is the ground truth for what the user is actually hearing. It is updated every progress tick. Never override it with a stale number once playback is running.                                                                                                                             |
| 2            | Server session DB (`ProgressService.getCurrentSession()`) | At app startup / cold restore, before playback begins     | The Audiobookshelf server's `currentTime` is the cross-device authoritative record. Prefer this over local AsyncStorage at restoration time, as AsyncStorage may be stale from a different session or device. Current threshold: >1s diff triggers update (already in `playerSlice.restorePersistedState`). |
| 3            | AsyncStorage (`ASYNC_KEYS.position`)                      | Cold start when server is unreachable or no session found | Offline fallback. Accept as the best available position when neither native player nor server can supply a value.                                                                                                                                                                                           |
| 4 (fallback) | Zero                                                      | No other source available                                 | Initial state.                                                                                                                                                                                                                                                                                              |

### Reconciliation Algorithm (for coordinator Phase 3)

```typescript
async function reconcilePosition(
  nativePosition: number | null, // from TrackPlayer.getProgress()
  dbSessionTime: number | null, // from ProgressService.getCurrentSession()
  asyncStoragePosition: number | null // from AsyncStorage
): Promise<number> {
  // Rule 1: If native player has a non-zero position, it wins.
  // "Non-zero" means playback has actually started or been seeked.
  if (nativePosition !== null && nativePosition > 0) {
    return nativePosition;
  }

  // Rule 2: Server session is authoritative at startup.
  if (dbSessionTime !== null && dbSessionTime > 0) {
    return dbSessionTime;
  }

  // Rule 3: AsyncStorage as offline fallback.
  if (asyncStoragePosition !== null && asyncStoragePosition > 0) {
    return asyncStoragePosition;
  }

  return 0;
}
```

### Key Design Constraint: No Position Fights

The critical failure mode is two sources both claiming authority and writing back and forth. Prevent this by:

- **During playback**: native player is the ONLY source that writes position to the coordinator context. Server sync reads coordinator position; it does NOT push position back to the coordinator.
- **During restoration** (RESTORING state only): server DB can override AsyncStorage position. Once `RESTORE_COMPLETE` fires, this gate closes.
- **Seeking**: coordinator position optimistically updates on `SEEK` event, then native player confirms via `NATIVE_PROGRESS_UPDATED`.

This maps cleanly to the existing `POSITION_RECONCILED` event already defined in `transitions.ts` (RESTORING -> READY and SYNCING_POSITION -> READY).

---

## Decision: Zustand-as-Proxy Bridge Pattern

### The Pattern: Coordinator Pushes, playerSlice Receives

The correct pattern is **coordinator-pushes via `useAppStore.setState()`**. Do not use middleware, do not use subscriptions that create feedback loops.

Rationale:

- `useAppStore` already has `subscribeWithSelector` applied (confirmed in `appStore.ts` line 60-61).
- `useAppStore.setState()` works outside React components — it is a plain JavaScript method on the store object. No hooks, no providers needed.
- The coordinator is a singleton (`PlayerStateCoordinator.getInstance()`). It can hold a direct reference to `useAppStore.setState`.
- This is the documented Zustand pattern for external store integration. The Zustand docs explicitly show `useDogStore.setState({ ... })` from outside components.

### Bridge Implementation Pattern

```typescript
// In PlayerStateCoordinator, after processEventQueue completes a transition:

import { useAppStore } from "@/stores/appStore";

private syncToStore(): void {
  // Push coordinator's StateContext into playerSlice
  // Only called after a confirmed state transition or context update
  useAppStore.setState((state) => ({
    ...state,
    player: {
      ...state.player,
      // Map coordinator context fields to playerSlice fields
      isPlaying: this.context.isPlaying,
      position: this.context.position,
      currentTrack: this.context.currentTrack,
      currentChapter: this.context.currentChapter,
      playbackRate: this.context.playbackRate,
      volume: this.context.volume,
      currentPlaySessionId: this.context.sessionId,
      loading: {
        isLoadingTrack: this.context.isLoadingTrack,
        isSeeking: this.context.isSeeking,
      },
    },
  }));
}
```

### What "Read-Only Proxy" Means in Practice

The playerSlice becomes a **read-only projection** of coordinator state for React components. This means:

1. **playerSlice state fields** (`isPlaying`, `position`, `currentTrack`, etc.) are written **only** by the coordinator bridge, not by `PlayerBackgroundService` directly.
2. **playerSlice mutation methods** (`updatePosition`, `updatePlayingState`, `_setCurrentTrack`, etc.) become coordinator-internal calls that the bridge invokes on behalf of the coordinator.
3. **React components** continue using `usePlayer()` hook as today — zero API change.
4. **Services** (`PlayerBackgroundService`, `ProgressService`) dispatch events to the event bus instead of calling playerSlice setters directly.

### What NOT to Do

**Do NOT use `subscribeWithSelector` to create a coordinator-to-store feedback loop.** Pattern to avoid:

```typescript
// BAD: Creates a circular subscription
useAppStore.subscribe(
  (state) => state.player.isPlaying,
  (isPlaying) => coordinator.dispatch({ type: isPlaying ? "PLAY" : "PAUSE" })
);
```

This creates ambiguity about who initiated the state change and can cause infinite dispatch loops. Direction is always **coordinator → store**, never **store → coordinator**.

### Migration Path (How to Reach This from Phase 1)

Phase 1 already dispatches events from `PlayerBackgroundService` → `eventBus` → coordinator. The bridge is the missing last step:

1. Add `syncToStore()` method to coordinator (calls `useAppStore.setState`)
2. Call `syncToStore()` at the end of `handleEvent()` after context is updated
3. Remove direct `playerSlice` mutations from `PlayerBackgroundService` (they become coordinator responsibilities)
4. The `updatePosition`, `updatePlayingState` etc. methods in playerSlice can be simplified to pure state setters with no side effects once the coordinator owns the write path

---

## Alternatives Considered

| Recommended                                     | Alternative                                                              | When to Use Alternative                                                                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom FSM (keep existing)                      | XState v5                                                                | Only if starting greenfield with complex nested/parallel states. Not for this migration.                                                                               |
| Coordinator-pushes `useAppStore.setState()`     | `subscribeWithSelector` middleware in playerSlice that reads coordinator | Creates temporal coupling and complexity. The coordinator already knows when state changes — it should push, not have the store poll.                                  |
| Coordinator-pushes `useAppStore.setState()`     | Separate Zustand store for coordinator state                             | Would require updating all existing `usePlayer()` call sites. The existing `playerSlice` shape is already correct — fill it from coordinator instead of from services. |
| Native player as position truth during playback | Server position as position truth during playback                        | Server position is ~5-10 seconds stale by design (sync interval). Never use it as the authoritative position during live playback.                                     |
| Coordinator emits `diagnostic` events + bridge  | Redux DevTools middleware for debugging                                  | EventEmitter3 diagnostic events are already wired. No need to add another debugging layer.                                                                             |

## What NOT to Use

| Avoid                                                                          | Why                                                                                                                                              | Use Instead                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| XState (`xstate`, `@xstate/react`)                                             | 16.7 kB gzip overhead, replaces working code, actor model requires service restructuring                                                         | Existing custom FSM in `PlayerStateCoordinator` + `transitions.ts`                                   |
| `immer` middleware in Zustand                                                  | Not installed, not needed. Zustand spread patterns are sufficient and already consistent across all slices                                       | Plain `set((state) => ({ ...state, player: { ...state.player, ... } }))`                             |
| Direct `TrackPlayer` calls from coordinator                                    | Coordinator already delegates to `PlayerService.execute*()`. Keep that boundary.                                                                 | `PlayerService.executePlay()`, `executeSeek()`, etc.                                                 |
| AsyncStorage as authoritative position source during playback                  | AsyncStorage writes are async and may be 100-500ms stale. Writing position to AsyncStorage on every progress tick is a performance anti-pattern. | Write to AsyncStorage only on pause/stop/background. Use native player for live position.            |
| Calling `restorePersistedState()` from playerSlice for Phase 3+ reconciliation | Reconciliation logic should live in the coordinator (which has all sources visible), not in the slice                                            | Move reconciliation into a `PositionReconciler` service called by coordinator during RESTORING state |

---

## Stack Patterns by Variant

**If coordinator needs to notify React components of non-state events (e.g., playback errors):**

- Use the existing EventEmitter3 `this.emit('error', ...)` in coordinator
- Create a `useCoordinatorEvents()` hook that subscribes with `useEffect` and calls `useAppStore.setState`
- Because: one-way data flow, no store pollution with ephemeral events

**If position sync during playback needs lower latency than the full `handleEvent()` cycle:**

- Add a fast path: `NATIVE_PROGRESS_UPDATED` events skip the lock and call a direct `updatePosition()` on the store
- Only safe because position updates are idempotent and don't drive state transitions
- Consistent with existing `noOpEvents` list in `transitions.ts` — `NATIVE_PROGRESS_UPDATED` is already designated no-op

**If Phase 4 (state propagation to subscribers) requires broadcasting to non-React subscribers:**

- Use the existing `EventEmitter3` `this.emit('stateChanged', context)` pattern
- Non-React services subscribe directly to coordinator, not to Zustand
- Because: Zustand subscriptions are designed for React re-renders, not service-to-service coordination

---

## Version Compatibility

| Package                         | Compatible With                   | Notes                                                                                                                                        |
| ------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| zustand@5.0.8                   | react@19.1.0, react-native@0.81.5 | Confirmed installed and in use. Uses `useSyncExternalStore` internally — safe for React 19 concurrent mode.                                  |
| eventemitter3@5.0.1             | Node.js, React Native             | No React dependency. Works in background service context.                                                                                    |
| async-lock@1.4.1                | Node.js async/await               | Pure JS, no React Native native module required. Safe for service layer.                                                                     |
| react-native-track-player@4.1.2 | expo@54.0.21                      | Confirmed installed. `useProgress()` hook requires React context; for service-layer position reads use `TrackPlayer.getProgress()` directly. |

---

## Sources

- Zustand v5 docs — external store setState pattern: https://zustand.docs.pmnd.rs/guides/updating-state
  Confidence: HIGH (official docs, confirmed behavior)
- Zustand `subscribeWithSelector` middleware: https://zustand.docs.pmnd.rs/middlewares/subscribe-with-selector
  Confidence: HIGH (official docs)
- XState v5 npm — current version 5.28.0: https://www.npmjs.com/package/xstate
  Confidence: HIGH (npm registry, verified)
- XState bundle size ~16.7 kB gzipped: https://bundlephobia.com/package/xstate
  Confidence: MEDIUM (bundlephobia, not directly fetched but corroborated by multiple search results)
- Existing codebase analysis — `PlayerStateCoordinator.ts`, `playerSlice.ts`, `appStore.ts`, `transitions.ts`, `eventBus.ts`
  Confidence: HIGH (source of truth for what is already built)
- Position reconciliation priority order: derived from current `playerSlice.restorePersistedState()` implementation + domain reasoning about source staleness
  Confidence: MEDIUM (domain pattern, not a named standard — but the logic is directly observable in the existing code)
- XState v5 custom FSM tradeoffs: https://www.rainforestqa.com/blog/selecting-a-finite-state-machine-library-for-react
  Confidence: MEDIUM (multiple sources agree on bundle size and learning curve tradeoffs)

---

_Stack research for: abs-react-native coordinator state machine migration (Phase 2+)_
_Researched: 2026-02-16_
