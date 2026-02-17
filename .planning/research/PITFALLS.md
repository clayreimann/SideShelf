# Pitfalls Research

**Domain:** React Native audio player — state machine migration from observer to execution mode
**Researched:** 2026-02-16
**Confidence:** HIGH — grounded in actual codebase analysis, not generic advice

---

## Critical Pitfalls

### Pitfall 1: Coordinator-to-Service Feedback Loop

**What goes wrong:**
The coordinator calls `PlayerService.executePlay()`, which previously dispatched `dispatchPlayerEvent({ type: "PLAY" })` in its old public path. If any execute\* method accidentally re-dispatches an event instead of calling TrackPlayer directly, the coordinator processes the same intent twice: coordinator calls service → service dispatches event → coordinator receives event → coordinator calls service again.

**Why it happens:**
PlayerService has two method variants for each action: a public API method (e.g., `play()`) that dispatches to the event bus, and an internal execute method (e.g., `executePlay()`) that calls TrackPlayer directly. The distinction is documented but not enforced by TypeScript. During development of Phase 2 service methods, a developer may call the wrong variant. The pattern is already present — look at `executeLoadTrack` which calls `TrackPlayer.play()` directly at line 402, but `reloadTrackPlayerQueue` inside it calls `dispatchPlayerEvent` for RELOAD_QUEUE and QUEUE_RELOADED. If a new execute method calls `dispatchPlayerEvent`, the loop closes.

**How to avoid:**

- Name execute methods with a clear prefix (`execute*`) and add a JSDoc comment: "Called by Coordinator only. Must not dispatch events."
- Lint rule or code review gate: no `dispatchPlayerEvent` call inside any `execute*` method
- The coordinator's `executeTransition` already has the comment "be careful of infinite loops" at line 621 — take that comment seriously and add a test that verifies the execute path does not cause a second event to appear on the event bus

**Warning signs:**

- `metrics.totalEventsProcessed` grows faster than user actions would explain
- State transitions appear twice in the transition history for a single user action
- Event queue depth grows instead of draining after a command

**Phase to address:** Phase 2 — this is the first phase where execute paths are activated

---

### Pitfall 2: Dual Position Authority During Phase 3 Transition

**What goes wrong:**
After Phase 3 centralizes position in the coordinator, `PlayerBackgroundService.handlePlaybackProgressUpdated` still calls `store.updatePosition(updatedSession.currentTime)` at 14 separate call sites. If Phase 3 also begins having the coordinator push position to the store via subscriptions, both code paths run simultaneously. The result is position flicker: the coordinator sets position X, the background service sets position Y (from DB session one tick later), the coordinator re-reads from TrackPlayer and sets X again.

**Why it happens:**
`handlePlaybackProgressUpdated` is a monolithic 270-line function with many fallback branches, each updating `store.updatePosition`. The Phase 3 plan removes "duplicate position tracking" but the background service calls are scattered, not centralized. It is easy to miss one branch. The background service also runs in a separate JS context on Android (documented in `PlayerBackgroundService.ts` lines 47-53), meaning the two coordinators (UI context and background context) will have independent position authority.

**How to avoid:**

- Before removing any position tracking, make all background service branches route through a single call site: extract a `setCanonicalPosition(position)` helper that either updates the store directly (Phase 2) or dispatches a POSITION_RECONCILED event (Phase 3)
- The existing `POSITION_RECONCILED` event type is already defined in the coordinator — use it as the Phase 3 handoff mechanism instead of direct store writes
- On Android, accept that the background context coordinator cannot be the authority for UI position; the DB session (read via ProgressService) remains the cross-context source of truth

**Warning signs:**

- Position display jumps backward by 1-2 seconds periodically during playback
- `positionReconciliationCount` in coordinator metrics grows faster than expected (more than once per seek)
- Two POSITION_RECONCILED events appear in transition history for a single seek

**Phase to address:** Phase 3 — position centralization

---

### Pitfall 3: Zustand Re-render Storm from NATIVE_PROGRESS_UPDATED

**What goes wrong:**
`NATIVE_PROGRESS_UPDATED` fires approximately once per second during playback. In Phase 4, when the coordinator pushes state to subscribers via a React hook (`usePlayerState`), every subscriber re-renders every second — including components that only care about the book title or playback speed. Even components that display nothing position-related will re-render if they subscribe to the coordinator context object as a whole.

**Why it happens:**
The planned Phase 4 hook returns the entire `StateContext` object. Any field change in `StateContext` triggers a re-render in every subscriber. `StateContext` has 18 fields. `position` and `lastPositionUpdate` change every second. The `updatePosition` call in `playerSlice` already has this problem but Zustand's `subscribeWithSelector` middleware mitigates it — the existing components use field-level selectors. A naive `usePlayerState()` returning the whole context object will regress this.

**How to avoid:**

- Design `usePlayerState` with a selector parameter from day one: `usePlayerState(ctx => ctx.position)` rather than `usePlayerState()` returning the whole context
- Alternatively, split the coordinator's subscription into "fast path" (position, isPlaying — updates at 1Hz) and "slow path" (track info, session, chapter — updates on transitions only)
- Before Phase 4, measure render counts in the existing UI: `React.Profiler` or Flipper React DevTools to establish a baseline that Phase 4 must not exceed

**Warning signs:**

- React DevTools Profiler shows components not related to position re-rendering every second
- UI jank during playback that wasn't present before Phase 4
- `avgEventProcessingTime` increasing (coordinator spending time notifying many subscribers)

**Phase to address:** Phase 4 — state propagation

---

### Pitfall 4: Premature Legacy Flag Removal Exposing Unguarded Code Paths

**What goes wrong:**
Phase 5 removes implicit state flags like `isRestoringState` and `sessionCreationInProgress`. These flags guard against specific race conditions that the coordinator now handles — but only for code paths that flow through the coordinator. There are still direct store writes in the codebase that bypass the coordinator (e.g., `store._setTrackLoading(true)` in `executeLoadTrack` at line 358, `store.updatePosition` in remote jump handlers in `PlayerBackgroundService`). Removing the flag before all code paths route through the coordinator silently removes the guard from those remaining direct paths.

**Why it happens:**
Phase 5 removes flags based on "coordinator now handles this," but the coordinator handles it only for the event-dispatched path. The background service's remote jump handlers (`handleRemoteJumpForward`, `handleRemoteJumpBackward`) still call `store.updatePosition` directly AND dispatch SEEK events. When the guard flag is removed, the direct write races against the coordinator's response to the SEEK event.

**How to avoid:**

- Before removing any flag in Phase 5, grep for all write sites that bypass the coordinator for the state that flag guards
- Use this checklist: for each flag removed, verify no direct `store.*` call related to that flag's concern remains outside coordinator-controlled code
- Remove flags in dependency order: flags that guard UI-only state (e.g., `isRestoringState`) can go early; flags that guard session creation must wait until ProgressService is fully coordinator-controlled

**Warning signs:**

- New duplicate session bugs appearing after Phase 5 begins
- `isRestoringState` removal causes chapter display to show "Opening Credits" on app resume
- Tests that were passing before Phase 5 begin failing on edge cases

**Phase to address:** Phase 5 — cleanup

---

## Technical Debt Patterns

| Shortcut                                                                           | Immediate Benefit             | Long-term Cost                                             | When Acceptable                                                                                                |
| ---------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Keep `store.updatePosition` calls in PlayerBackgroundService during Phase 3        | Reduces scope of Phase 3      | Position authority is split; reconciliation bugs persist   | Only during Phase 3 if all calls are funneled through a single extracted helper that can be swapped in Phase 4 |
| Leave `observerMode` flag wired to a feature flag instead of removing it           | Easy rollback of Phase 2      | Dead code branch in coordinator that confuses readers      | Phase 2 only; remove in Phase 3 cleanup                                                                        |
| Build `usePlayerState` hook returning the full `StateContext`                      | Faster Phase 4 implementation | Re-render storm on every position tick (see Pitfall 3)     | Never — add selector support before first component migration                                                  |
| Remove `isRestoringState` flag before background service is coordinator-controlled | Simpler Phase 5               | Race condition on app resume exposes stale chapter display | Never — sequence matters                                                                                       |

---

## Integration Gotchas

| Integration                                     | Common Mistake                                                                                                                       | Correct Approach                                                                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| react-native-track-player in background context | Assuming coordinator state is shared between UI and background JS contexts on Android                                                | Accept two coordinator instances; use DB session (via ProgressService) as cross-context truth; background context coordinator is for event ordering only                                                                   |
| `executeTransition` calling PlayerService       | Calling `playerService.play()` (public API, dispatches event) instead of `playerService.executePlay()` (internal, calls TrackPlayer) | Only call `execute*` variants from within the coordinator's `executeTransition` method                                                                                                                                     |
| Zustand store writes from coordinator           | Having coordinator call `store.updatePosition()` directly to push state to UI                                                        | Use subscription/event mechanism; coordinator should be observable, not a store writer                                                                                                                                     |
| AsyncLock in `processEventQueue`                | Adding `await` calls inside the lock that trigger TrackPlayer events, which re-enter the queue while the lock is held                | The event bus is non-blocking (`playerEventBus.dispatch` is synchronous fire-and-forget); new events queue but never try to acquire the lock synchronously — safe as long as execute methods do not call `this.dispatch()` |

---

## Performance Traps

| Trap                                                                           | Symptoms                                                                                       | Prevention                                                                                                                                               | When It Breaks                                                                                                               |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Coordinator subscription notifying on every NATIVE_PROGRESS_UPDATED            | 1Hz re-renders across all player UI components                                                 | Selector-based subscriptions; separate fast/slow subscription channels                                                                                   | Immediately on first component migration in Phase 4                                                                          |
| ProgressService DB query inside NATIVE_PROGRESS_UPDATED handler (existing)     | handlePlaybackProgressUpdated already calls `progressService.getCurrentSession` twice per tick | This is pre-existing; Phase 3 should move to cached session state in coordinator to eliminate DB reads per tick                                          | At scale: no device impact, but battery drain on older iOS devices                                                           |
| AsyncLock queue growing unbounded                                              | Event queue depth stays at 5+ during playback; position updates lag behind actual playback     | NATIVE_PROGRESS_UPDATED is already a no-op in the coordinator (doesn't acquire lock-blocking work); maintain this classification                         | If NATIVE_PROGRESS_UPDATED is ever changed to trigger a state transition that requires executeTransition, queue will back up |
| PlayerBackgroundService re-registering listeners on hot reload without cleanup | Duplicate event handlers firing; progress updates appear to trigger twice                      | Existing `cleanupEventListeners` guard using `global.__playerBackgroundServiceSubscriptions` handles this; do not bypass it during Phase 2-5 development | On every hot reload in development if guard is disabled                                                                      |

---

## "Looks Done But Isn't" Checklist

- [ ] **Phase 2 execution mode enabled:** `observerMode = false` is already set in the committed code (line 75 of `PlayerStateCoordinator.ts`) — but `executeTransition` is the stub that needs service method calls wired up. Verify by checking that `executePlay()`, `executePause()`, `executeStop()`, `executeLoadTrack()` are actually called and tested, not just that the flag is set.

- [ ] **Phase 2 feedback loop prevented:** The coordinator's `executeTransition` calls `playerService.execute*` methods. Verify no `execute*` method contains a `dispatchPlayerEvent` call. A grep passes — but also write a test that asserts the event bus receives exactly one event per coordinator dispatch.

- [ ] **Phase 3 position centralized:** All 14 `store.updatePosition` calls in `PlayerBackgroundService.handlePlaybackProgressUpdated` either removed or funneled through the coordinator. Verify by grepping for `store.updatePosition` after Phase 3 — it should appear only in `playerSlice.ts` itself (the setter implementation) and nowhere in service files.

- [ ] **Phase 4 subscription hook tested for render count:** Migration of even one component to `usePlayerState` requires verifying render count under playback. Run React Profiler for 30 seconds of playback and confirm render frequency matches the component's actual data update frequency.

- [ ] **Phase 5 flags removed in dependency order:** `isRestoringState` guards the chapter display during app resume. It can only be removed when the coordinator's RESTORING state reliably prevents chapter updates during queue rebuild. Verify by simulating app resume 10 times and checking chapter display does not flash "Opening Credits."

---

## Recovery Strategies

| Pitfall                                 | Recovery Cost | Recovery Steps                                                                                                                                                                                                                     |
| --------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feedback loop (Pitfall 1) in production | LOW           | Set `observerMode = true` in `PlayerStateCoordinator.ts`, redeploy. This is the documented Phase 2 rollback.                                                                                                                       |
| Position fight in Phase 3               | MEDIUM        | Revert Phase 3 changes; restore all `store.updatePosition` call sites in PlayerBackgroundService from git; redeploy. Position authority returns to the scattered pre-Phase-3 state.                                                |
| Re-render storm in Phase 4              | MEDIUM        | Roll back component changes to use `useAppStore` selectors; keep coordinator running for monitoring. Coordinator continues providing diagnostics.                                                                                  |
| Premature flag removal in Phase 5       | HIGH          | No coordinator rollback available (Phase 5 is final). Must restore flag from git, re-add guard logic to affected code paths, full regression test. This is why Phase 5 has "no rollback" in the migration plan — sequence matters. |

---

## Pitfall-to-Phase Mapping

| Pitfall                              | Prevention Phase | Verification                                                                                                                                          |
| ------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordinator-to-Service Feedback Loop | Phase 2          | Grep: no `dispatchPlayerEvent` in any `execute*` method; unit test: one event in → one TrackPlayer call out                                           |
| Dual Position Authority              | Phase 3          | Grep: no `store.updatePosition` in service files outside playerSlice; integration test: position is monotonically increasing during 5-minute playback |
| Zustand Re-render Storm              | Phase 4          | React Profiler: component render count during 30s playback matches component's data change frequency                                                  |
| Premature Legacy Flag Removal        | Phase 5          | Manual QA: app resume 10x shows no chapter flash; automated test: RESTORING state prevents \_updateCurrentChapter calls                               |

---

## Sources

- Direct code analysis: `/Users/clay/Code/github/abs-react-native/src/services/coordinator/PlayerStateCoordinator.ts` — feedback loop comment at line 621, `observerMode = false` at line 75
- Direct code analysis: `/Users/clay/Code/github/abs-react-native/src/services/PlayerBackgroundService.ts` — 14 `store.updatePosition` call sites in `handlePlaybackProgressUpdated`, Android dual-context note at lines 47-53
- Direct code analysis: `/Users/clay/Code/github/abs-react-native/src/stores/slices/playerSlice.ts` — `updatePosition` persists to AsyncStorage on every call; `isRestoringState` guards `_updateCurrentChapter`
- Direct code analysis: `/Users/clay/Code/github/abs-react-native/src/services/PlayerService.ts` — public/execute method pair pattern; `executeLoadTrack` calls `store._setCurrentTrack` and `store._setTrackLoading` directly
- Project documentation: `/Users/clay/Code/github/abs-react-native/docs/plans/state-machine-migration.md` — rollback strategies, success metrics, phase ordering rationale
- Project documentation: `/Users/clay/Code/github/abs-react-native/docs/architecture/player-state-machine.md` — NATIVE_STATE_CHANGED handler, observer mode behavior, Android dual-context acknowledgment

---

_Pitfalls research for: React Native audio player state machine migration (Phases 2-5)_
_Researched: 2026-02-16_
