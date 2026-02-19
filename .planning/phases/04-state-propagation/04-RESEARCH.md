# Phase 4: State Propagation - Research

**Researched:** 2026-02-19
**Domain:** Zustand v5 store bridge patterns, React render optimization, coordinator-to-store propagation
**Confidence:** HIGH

## Summary

Phase 4 adds a `syncToStore()` bridge method on `PlayerStateCoordinator` that becomes the single write path to `playerSlice`. After this phase, services (PlayerService, PlayerBackgroundService, ProgressService) hold zero direct references to playerSlice mutators. The coordinator's internal context — which is already the source of truth for position, playback state, track, chapter, session, and rate — propagates to Zustand on every state transition and on position updates.

The codebase is using Zustand v5.0.8 with `subscribeWithSelector` already wired in `appStore.ts`. The `usePlayerState(selector)` hook already exists in `appStore.ts` (line 572) and is already selector-based — it passes through to `useAppStore(selector)` directly. Selector-based subscriptions in Zustand v5 use `Object.is` equality by default, meaning `usePlayerState(s => s.player.position)` only re-renders when `position` actually changes value. This is the core mechanism satisfying PROP-02/PROP-03: components that subscribe via selector will not storm-render from 1Hz position ticks if only one field changes at a time.

The Android BGS constraint (PROP-05) is structurally enforced by the headless JS context: Zustand stores are not accessible in the background JS thread. The `syncToStore()` method must import `useAppStore` directly, which is automatically a no-op import in the BGS context. The safe implementation is to guard with a runtime check or simply let the import fail silently — the BGS already dispatches all its work through `dispatchPlayerEvent()` and coordinator transitions, so `syncToStore()` is architecturally unreachable from BGS.

**Primary recommendation:** Implement `syncToStore()` on the coordinator that calls playerSlice mutators from the coordinator's context (already populated). Call it at the end of `updateContextFromEvent()` for position/playing/chapter events. Wire PlayerService and BGS to stop calling playerSlice mutators directly, routing all state updates through the coordinator's event flow instead.

## Standard Stack

### Core

| Library               | Version              | Purpose                                             | Why Standard                  |
| --------------------- | -------------------- | --------------------------------------------------- | ----------------------------- |
| zustand               | ^5.0.8               | Zustand store — already in use                      | Already the app's state layer |
| subscribeWithSelector | (bundled in zustand) | Enables selector-based `.subscribe()` outside React | Already wired in appStore.ts  |

### Supporting

| Library                       | Version                   | Purpose                              | When to Use                              |
| ----------------------------- | ------------------------- | ------------------------------------ | ---------------------------------------- |
| @testing-library/react-native | ^13.3.3                   | Component render testing             | Render count validation (PROP-03)        |
| React.Profiler                | (bundled in react 19.1.0) | Measures render counts and durations | Baseline before bridge, comparison after |

### Alternatives Considered

| Instead of                                            | Could Use                  | Tradeoff                                                                                                                                                                            |
| ----------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Direct `useAppStore.getState()` writes in syncToStore | RxJS / EventEmitter fanout | No benefit — Zustand already handles subscription fanout; adds dependency                                                                                                           |
| React.Profiler in tests                               | reassure (callstack)       | reassure gives statistical baselines but adds test infrastructure overhead; `reassure` is not in package.json; React.Profiler + renderSpy pattern in Jest is sufficient for PROP-03 |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure

The bridge lives on the coordinator. No new files needed.

```
src/
├── services/
│   └── coordinator/
│       └── PlayerStateCoordinator.ts   # Add syncToStore() method here
├── stores/
│   └── slices/
│       └── playerSlice.ts              # Remains unchanged; mutators stay but only coordinator calls them
```

### Pattern 1: Coordinator Bridge — syncToStore()

**What:** A private method on `PlayerStateCoordinator` that maps coordinator `context` fields to `playerSlice` mutators.
**When to use:** Called at the tail of `updateContextFromEvent()` for events that change player-facing state.

```typescript
// Source: derived from existing updateContextFromEvent() + useAppStore patterns in codebase
private syncToStore(): void {
  // Guard: skip in contexts where Zustand is unavailable (Android BGS)
  // In practice the import simply fails silently in BGS headless context,
  // but an explicit check prevents any import-resolution errors at runtime.
  let store: ReturnType<typeof useAppStore.getState>;
  try {
    store = useAppStore.getState();
  } catch {
    return; // BGS headless context — no store available
  }

  const ctx = this.context;

  // Batch all writes — Zustand v5 batches synchronous set() calls automatically
  store._setCurrentTrack(ctx.currentTrack);
  store.updatePlayingState(ctx.isPlaying);
  store.updatePosition(ctx.position);
  store._setTrackLoading(ctx.isLoadingTrack);
  store._setSeeking(ctx.isSeeking);
  store._setPlaybackRate(ctx.playbackRate);
  store._setVolume(ctx.volume);
  store._setPlaySessionId(ctx.sessionId);
  // Note: lastPauseTime, sleepTimer, isRestoringState are EXCEPTIONS — see PROP-04
}
```

**Important:** `syncToStore()` should NOT be called on every single event. It should be called selectively — specifically for events that change player-visible state:

- `NATIVE_PROGRESS_UPDATED` — position (called every 1Hz)
- `NATIVE_STATE_CHANGED` — isPlaying
- `PLAY`, `PAUSE`, `STOP` — isPlaying + track + session
- `LOAD_TRACK` — isLoadingTrack
- `QUEUE_RELOADED` — isLoadingTrack=false + position
- `SEEK`, `SEEK_COMPLETE` — isSeeking + position
- `SET_RATE` — playbackRate
- `SET_VOLUME` — volume
- `SESSION_CREATED`, `SESSION_ENDED` — sessionId
- `NATIVE_TRACK_CHANGED` — currentTrack

For position-only events (1Hz `NATIVE_PROGRESS_UPDATED`), call only `store.updatePosition()` — not the full sync — to minimize per-tick work.

### Pattern 2: Granular vs. Full Sync Strategy

**What:** Two tiers of syncToStore to minimize unnecessary Zustand mutations.
**When to use:** Distinguish between high-frequency (1Hz position) and low-frequency (track/session/state) events.

```typescript
// HIGH-FREQUENCY: only position sync (called 1Hz during playback)
private syncPositionToStore(): void {
  try {
    useAppStore.getState().updatePosition(this.context.position);
  } catch { return; }
}

// LOW-FREQUENCY: full state sync (called on track/session/state transitions)
private syncStateToStore(): void {
  try {
    const store = useAppStore.getState();
    // ... full sync
  } catch { return; }
}
```

### Pattern 3: Removing Direct Writes from Services

**What:** Replace every `store._setX()` / `store.updateX()` call in PlayerService, PlayerBackgroundService, and ProgressService with either (a) no call at all (coordinator will sync it), or (b) a `dispatchPlayerEvent()` that the coordinator handles.

**When to use:** For every write that's now handled by the coordinator, delete the direct store write from the service.

**Concrete removals in PlayerService.ts:**

| Line (approx) | Current call                                | Action after Phase 4                                                                            |
| ------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 349           | `store._setCurrentTrack(track)`             | Removed — coordinator receives LOAD_TRACK, sets context.currentTrack, syncStateToStore calls it |
| 350           | `store._setTrackLoading(true)`              | Removed — coordinator sets isLoadingTrack on LOAD_TRACK event                                   |
| 360           | `store.updatePosition(resumeInfo.position)` | Removed — POSITION_RECONCILED event causes coordinator sync                                     |
| 401           | `store._setTrackLoading(false)`             | Removed — QUEUE_RELOADED event sets isLoadingTrack=false                                        |
| 432           | `store._setLastPauseTime(pauseTime)`        | RETAINED — lastPauseTime is ephemeral service state, not coordinator state                      |
| 464           | `store._setLastPauseTime(null)`             | RETAINED — same exception                                                                       |
| 468           | `store._setTrackLoading(false)`             | Removed                                                                                         |
| 540           | `store._setTrackLoading(true)`              | Removed                                                                                         |
| 704           | `store._setCurrentTrack(null)`              | Removed — STOP event → context.currentTrack = null → sync                                       |
| 705           | `store._setPlaySessionId(null)`             | Removed — SESSION_ENDED event → coordinator syncs                                               |
| 747           | `store._setPlaySessionId(playSession.id)`   | Removed — SESSION_CREATED event → coordinator syncs                                             |
| 966           | `store._setCurrentTrack(track)`             | Removed                                                                                         |

**Concrete removals in PlayerBackgroundService.ts:**

| Line (approx)                                                   | Current call                          | Action after Phase 4                                                          |
| --------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| 186, 235, 300, 384, 461, 465, 608, 652, 660, 666, 673, 678, 682 | `store.updatePosition(...)`           | Removed — all BGS writes are already dispatched via events; coordinator syncs |
| 385                                                             | `store.updatePlayingState(isPlaying)` | Removed — NATIVE_STATE_CHANGED event handles this                             |
| 372                                                             | `store._setTrackLoading(false)`       | Removed                                                                       |
| 838                                                             | `store._setTrackLoading(false)`       | Removed                                                                       |
| 515                                                             | `store._setLastPauseTime(pauseTime)`  | RETAINED — pause time is service-local ephemeral state                        |

### Pattern 4: updateNowPlayingMetadata() after Bridge

**What:** `updateNowPlayingMetadata()` is a method on `playerSlice` that reads `currentTrack` and `currentChapter` from the store, then calls `TrackPlayer.updateMetadataForTrack()`. After Phase 4, the coordinator bridge must call this after chapter changes — not BGS directly reading the store.

**Risk:** BGS currently calls `await store.updateNowPlayingMetadata()` after `store.updatePosition()`. After Phase 4, BGS won't write to the store directly, so the chapter update won't be visible to `updateNowPlayingMetadata()` until `syncToStore()` has run. The coordinator must call `updateNowPlayingMetadata()` at the end of `syncStateToStore()` when chapter changes, not BGS.

**Debounce preservation (PROP-06):** `updateNowPlayingMetadata()` is already called on two paths in BGS:

1. On chapter change (non-gated, immediate)
2. Periodically, every 2 seconds (`Math.floor(position) % 2 === 0` gate)

After the bridge, the coordinator can replicate this by tracking previous chapter in the context and calling `updateNowPlayingMetadata()` when `CHAPTER_CHANGED` is processed (or when `_updateCurrentChapter()` detects a chapter change via `syncToStore()`). The 2-second periodic gate should also be preserved. Neither is a "debounce" in the classical sense — they are conditional dispatch guards.

### Pattern 5: Sleep Timer Exception (PROP-04)

**What:** Sleep timer state (`player.sleepTimer`) is retained as a direct playerSlice write. Components call `setSleepTimer()`, `setSleepTimerChapter()`, `cancelSleepTimer()` directly on the store. BGS reads `store.player.sleepTimer` to check if timer has expired.

**Why retained:** Sleep timer is UI-only preference state, not execution state. It is not part of the playback state machine. The coordinator does not need to mediate it.

**Implementation:** The `syncStateToStore()` bridge must NOT overwrite `sleepTimer`. It only syncs coordinator-owned fields.

### Anti-Patterns to Avoid

- **Writing all context fields on every event:** `syncToStore()` called on every `NATIVE_PROGRESS_UPDATED` with all 10+ fields causes Zustand to re-evaluate all selectors. Use `syncPositionToStore()` for position-only events.
- **Calling syncToStore() in observer mode:** When `observerMode=true`, coordinator should not drive store writes — add guard `if (this.observerMode) return;` at top of syncToStore.
- **Overwriting sleep timer from syncToStore:** `sleepTimer` is the documented exception. Never include it in the synced fields.
- **Calling syncToStore() from BGS:** The coordinator in BGS headless context has no Zustand access. The try/catch guard handles this, but don't add BGS-specific code paths that explicitly call syncToStore.
- **Sync after rejected transitions:** Only sync on valid, accepted transitions. `handleEvent()` already guards this — call `syncToStore()` only inside the `if (validation.allowed)` branch.

## Don't Hand-Roll

| Problem                        | Don't Build                   | Use Instead                                                              | Why                                                                           |
| ------------------------------ | ----------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Batching multiple store writes | Custom batching wrapper       | Zustand v5 batches synchronous set() calls automatically                 | Zustand already handles this; extra batching layer adds complexity            |
| Selector equality for position | Custom deep-equal             | `Object.is` (default in Zustand v5)                                      | Primitives (number) use Object.is — position re-renders only on value change  |
| Render count measurement       | Custom React.Profiler wrapper | `renderSpy` pattern with `jest.fn()` passed to `React.Profiler.onRender` | Standard Jest pattern, no new libraries needed                                |
| Debounce for metadata updates  | Custom debounce utility       | Preserve existing conditional dispatch guards (`% 2 === 0`)              | The existing gate is sufficient; real debounce adds complexity for no benefit |

**Key insight:** Zustand v5 already provides all the primitives needed — selector equality, subscribeWithSelector for non-React subscriptions, and `getState()` for outside-React writes. No new libraries are required for Phase 4.

## Common Pitfalls

### Pitfall 1: syncToStore() Called on Every 1Hz Position Event with Full Sync

**What goes wrong:** Every `NATIVE_PROGRESS_UPDATED` event calls the full `syncStateToStore()` which writes 10+ fields to Zustand. Components subscribed via `usePlayer()` (which selects multiple fields) re-render on every tick even when only position changed.
**Why it happens:** Developer uses one syncToStore method for all event types.
**How to avoid:** Use two tiers: `syncPositionToStore()` for `NATIVE_PROGRESS_UPDATED`, `syncStateToStore()` for structural changes.
**Warning signs:** React Profiler shows high render count on FullScreenPlayer during playback after bridge is added.

### Pitfall 2: updateNowPlayingMetadata() Called Before Store Sync

**What goes wrong:** Coordinator syncs store, then calls `updateNowPlayingMetadata()`. But `updateNowPlayingMetadata()` reads `currentChapter` from the store. If sync hasn't completed (async ordering), chapter is stale.
**Why it happens:** `updateNowPlayingMetadata()` is defined on playerSlice and reads `get()` at call time. Store writes are synchronous in Zustand, so sync completes before the metadata call.
**How to avoid:** Call `syncStateToStore()` first (synchronous), then call `updateNowPlayingMetadata()` (async). Order is: sync → then metadata.
**Warning signs:** Lock screen shows wrong chapter title after chapter changes.

### Pitfall 3: observerMode Flag Not Respected in syncToStore

**What goes wrong:** In Phase 2, `observerMode=true` was the rollback escape hatch. If `syncToStore()` ignores `observerMode`, then enabling observer mode for rollback still drives store writes, creating split authority between services and coordinator.
**Why it happens:** Developer adds syncToStore to `updateContextFromEvent()` rather than `handleEvent()`.
**How to avoid:** Add `syncToStore()` only inside `if (!this.observerMode)` block in `handleEvent()`, or add an explicit guard inside `syncToStore()`.
**Warning signs:** Store state changes even when `coordinator.isObserverMode() === true`.

### Pitfall 4: Android BGS Crashes on useAppStore Import

**What goes wrong:** `syncToStore()` calls `useAppStore.getState()` which in the Android headless JS context throws because the Zustand module initializes differently or the React tree is absent.
**Why it happens:** React Native headless JS contexts don't have a full React runtime.
**How to avoid:** Wrap `useAppStore.getState()` in try/catch and return early on failure. Since the coordinator already checks at import time, a simple try/catch is sufficient.
**Warning signs:** Android background playback crashes after Phase 4 is deployed. Check logs for Zustand-related errors in BGS context.

### Pitfall 5: lastPauseTime Overwritten by syncToStore

**What goes wrong:** `syncStateToStore()` includes `_setLastPauseTime(ctx.lastPauseTime)` but `lastPauseTime` is not tracked in coordinator context (not a field on `StateContext`).
**Why it happens:** Developer adds all playerSlice fields to the sync without checking which fields belong to coordinator context vs. playerSlice-local.
**How to avoid:** Only sync fields that are present in `StateContext` (defined in `src/types/coordinator.ts`). `lastPauseTime` is not in StateContext — leave it as a direct write from services.
**Warning signs:** Smart rewind stops working after Phase 4 (smart rewind reads `lastPauseTime` which would be null from the sync).

### Pitfall 6: `usePlayer()` hook causes extra renders due to useMemo dependencies

**What goes wrong:** `usePlayer()` in `appStore.ts` (lines 515-558) uses `React.useMemo()` with a large dependency array. If position changes every 1Hz, the memo recomputes and all consumers of `usePlayer()` re-render.
**Why it happens:** `usePlayer()` subscribes to `position` and other fields together — if any field changes, the memo invalidates.
**How to avoid:** Components that display position should use `usePlayerState(s => s.player.position)` directly rather than `usePlayer()`. This is already the documented pattern. No change needed to `usePlayer()` itself — just ensure position-heavy components use the selector form.
**Warning signs:** FullScreenPlayer re-renders every second even when paused.

## Code Examples

Verified patterns from official sources and existing codebase:

### Selector-Based Subscription (already correct, no change needed)

```typescript
// Source: appStore.ts line 572 (already implemented correctly)
export function usePlayerState<T>(selector: (state: PlayerSlice) => T): T {
  return useAppStore(selector);
}

// Usage in component — re-renders ONLY when position changes value:
const position = usePlayerState((s) => s.player.position);
const isPlaying = usePlayerState((s) => s.player.isPlaying);
```

### Store Write Outside React (coordinator bridge)

```typescript
// Source: Zustand v5 official docs — getState() for outside-React writes
// Already used throughout PlayerService.ts: useAppStore.getState()._setX()
private syncPositionToStore(): void {
  if (this.observerMode) return;
  try {
    useAppStore.getState().updatePosition(this.context.position);
  } catch {
    // BGS headless context — no store available
    return;
  }
}
```

### Render Count Verification (PROP-03)

```typescript
// Pattern: React.Profiler + render counter in Jest
import React from 'react';
import { render } from '@testing-library/react-native';

let renderCount = 0;
const onRender = () => { renderCount++; };

const { rerender } = render(
  <React.Profiler id="test" onRender={onRender}>
    <ComponentUnderTest />
  </React.Profiler>
);

const baselineCount = renderCount;
// Simulate bridge sending 10 position updates
for (let i = 0; i < 10; i++) {
  act(() => useAppStore.getState().updatePosition(i * 10));
}

// If component only subscribes to track/isPlaying (not position),
// render count should not increase:
expect(renderCount).toBe(baselineCount);
```

### subscribeWithSelector — Non-React Subscription

```typescript
// Source: Zustand v5 docs — subscribeWithSelector is already in appStore.ts
// Can be used to subscribe to chapter changes outside React for NowPlaying updates:
const unsub = useAppStore.subscribe(
  (state) => state.player.currentChapter?.chapter.id,
  (newChapterId, prevChapterId) => {
    if (newChapterId !== prevChapterId) {
      // Chapter changed — update now playing metadata
      useAppStore.getState().updateNowPlayingMetadata();
    }
  }
);
// Note: this approach is an ALTERNATIVE to calling metadata from coordinator.
// The simpler approach is to call it directly from syncStateToStore().
```

### updateNowPlayingMetadata() after syncToStore

```typescript
// Source: derived from existing BGS logic at line 468-475
private async syncStateToStoreAndMetadata(): Promise<void> {
  // 1. Sync state (synchronous)
  this.syncStateToStore();

  // 2. After sync, check if chapter changed and update metadata
  const store = useAppStore.getState();
  const currentChapterId = store.player.currentChapter?.chapter.id;
  if (currentChapterId !== this.context.currentChapter?.id) {
    // Chapter changed — update now playing metadata
    await store.updateNowPlayingMetadata();
  }
}
```

## State of the Art

| Old Approach                                             | Current Approach                                                        | When Changed         | Impact                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------- | --------------------------------------- |
| Services write to playerSlice directly                   | Coordinator bridge is single write path                                 | Phase 4 (this phase) | Eliminates split authority              |
| Multiple scattered `store.updatePosition()` calls in BGS | Single `syncPositionToStore()` from coordinator                         | Phase 4              | Single source of truth for store writes |
| Services read/write store as needed                      | Services are pure executors; only read store for track/rate/session IDs | Phase 4              | Cleaner service layer                   |

**Deprecated/outdated after Phase 4:**

- `store._setCurrentTrack()` called from PlayerService.playTrack(), executeStop(), restorePlayerServiceFromSession()
- `store._setTrackLoading()` called from PlayerService/BGS
- `store.updatePosition()` called from BGS and PlayerService directly
- `store.updatePlayingState()` called from BGS
- `store._setPlaySessionId()` called from PlayerService

All of these become coordinator-mediated after Phase 4.

## Open Questions

1. **Where exactly to call syncToStore() in handleEvent()**
   - What we know: It must be inside `if (validation.allowed)` and `if (!this.observerMode)`. It should run after context is updated (after `updateContextFromEvent()`).
   - What's unclear: Whether to call it for ALL allowed events or only a subset. Calling it on NATIVE_TRACK_CHANGED, NATIVE_STATE_CHANGED, etc. makes sense. Calling it on CHAPTER_CHANGED (a no-op state event) is also needed to update `currentChapter`.
   - Recommendation: Call `syncPositionToStore()` from `NATIVE_PROGRESS_UPDATED` case in `updateContextFromEvent()`. Call `syncStateToStore()` from `handleEvent()` after every non-PROGRESS event that is allowed.

2. **updateNowPlayingMetadata() ownership after Phase 4**
   - What we know: Currently lives on playerSlice. BGS calls it after position updates and chapter changes. After Phase 4, BGS won't write to store directly.
   - What's unclear: Should `updateNowPlayingMetadata()` move to PlayerService? Or stay on playerSlice and be called by coordinator?
   - Recommendation: Keep it on playerSlice (it reads playerSlice fields and calls TrackPlayer). The coordinator calls it via `useAppStore.getState().updateNowPlayingMetadata()` after syncStateToStore. This minimizes file changes.

3. **isRestoringState flag lifecycle**
   - What we know: `isRestoringState` guards chapter updates in `_updateCurrentChapter()`. It is set in `restorePersistedState()` (playerSlice) and in `reloadTrackPlayerQueue()` (PlayerService).
   - What's unclear: Does the coordinator need to know about `isRestoringState`? Or does it remain a playerSlice-local guard?
   - Recommendation: Leave it as playerSlice-local for Phase 4. Phase 5 removes it entirely after BGS chapter updates route through coordinator.

4. **Baseline render count measurement**
   - What we know: PROP-03 requires "render counts do not increase after bridge is added." Phase 4 notes say baseline measurement is needed before any component migration.
   - What's unclear: Which components to baseline — FullScreenPlayer (heaviest), FloatingPlayer, PlayPauseButton?
   - Recommendation: Write Profiler tests for FullScreenPlayer and FloatingPlayer before adding bridge. These are the two position-sensitive components most at risk from 1Hz re-renders.

5. **Handling `_setLastPauseTime` — not in StateContext**
   - What we know: `lastPauseTime` is not a field on `StateContext` in coordinator. PlayerService calls `_setLastPauseTime()` in `executePause()` and `executePlay()`.
   - What's unclear: Should `lastPauseTime` be added to StateContext, or remain a service-direct write?
   - Recommendation: Keep it as a service-direct write for Phase 4. It's ephemeral (not persisted), used only for smart rewind calculation. Adding it to StateContext would require changes to transitions.ts and coordinator, for no architectural benefit. Document it as a second exception alongside sleep timer.

## Sources

### Primary (HIGH confidence)

- Codebase analysis (read files directly):
  - `src/services/coordinator/PlayerStateCoordinator.ts` — full coordinator source, context structure, executeTransition flow
  - `src/stores/slices/playerSlice.ts` — all mutator signatures, sleep timer state, updateNowPlayingMetadata
  - `src/stores/appStore.ts` — usePlayerState, usePlayer, subscribeWithSelector wiring
  - `src/services/PlayerService.ts` — all direct store write lines identified
  - `src/services/PlayerBackgroundService.ts` — all direct store write lines identified
  - `src/services/coordinator/eventBus.ts` — dispatch mechanism
  - `.planning/REQUIREMENTS.md` — PROP-01 through PROP-06 verbatim
  - `.planning/ROADMAP.md` — Phase 4 success criteria verbatim

### Secondary (MEDIUM confidence)

- [Zustand subscribeWithSelector docs](https://zustand.docs.pmnd.rs/middlewares/subscribe-with-selector) — selector-based subscribe API confirmed, equality function behavior
- [Prevent rerenders with useShallow](https://zustand.docs.pmnd.rs/guides/prevent-rerenders-with-use-shallow) — Object.is equality default behavior in v5
- [Zustand Discussion #2867 — Best practices on selectors v5](https://github.com/pmndrs/zustand/discussions/2867) — selector stability guidance

### Tertiary (LOW confidence)

- [reassure by Callstack](https://github.com/callstack/reassure) — statistical render count baseline tool (not installed, not needed for Phase 4; React.Profiler in Jest is sufficient)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all libraries already in use, no new dependencies
- Architecture (bridge design): HIGH — based on direct code reading + Zustand v5 verified patterns
- Write path removal scope: HIGH — all direct store writes in services identified by grep
- Render storm prevention: HIGH — selector pattern verified in Zustand v5 docs
- Android BGS constraint: HIGH — headless JS context constraint is structural, documented in BGS source
- Pitfalls: HIGH for coordinator-related, MEDIUM for render count (requires measurement to confirm)

**Research date:** 2026-02-19
**Valid until:** 2026-03-21 (30 days — Zustand v5 is stable; codebase is under active development)
