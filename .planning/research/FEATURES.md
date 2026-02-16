# Feature Research

**Domain:** React Native audio player — state machine migration (coordinator execution control, position reconciliation, read-only store proxy, legacy cleanup)
**Researched:** 2026-02-16
**Confidence:** HIGH — derived entirely from codebase analysis of a brownfield project; all claims are directly verifiable in source files

---

## Context: This Is a Migration, Not a Feature Addition

The research question is "what does done look like for each phase?" The output is not a list of new capabilities — it is a set of observable behaviors that confirm each phase is working. Features here mean: what can be verified by a developer, a test, or a user?

The four phases under study:

- **Phase 2** — Coordinator executes transitions (calls service methods)
- **Phase 3** — Coordinator owns canonical position (reconciles native/server/AsyncStorage)
- **Phase 4** — playerSlice becomes read-only proxy for coordinator state
- **Phase 5** — Remove legacy state flags and simplify services

---

## Feature Landscape

### Table Stakes (Users Expect These)

These behaviors must be preserved exactly. Any regression here is a user-visible bug. They do not exist today because of the migration — they exist today in spite of the fragmented state management. The migration must not break any of them.

| Feature                                                 | Why Expected                                          | Complexity | Phase Risk | Notes                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------- | ----------------------------------------------------- | ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Play starts at correct position (resume)                | Core audiobook UX — users left off somewhere          | MEDIUM     | Phase 3    | `determineResumePosition()` in PlayerService currently queries activeSession, savedProgress, AsyncStorage with its own priority logic. Phase 3 must replicate this logic in the coordinator's reconciliation algorithm. STACK.md already specifies the priority order (native > DB > AsyncStorage). |
| Position bar updates during playback (1 Hz)             | Users see they are progressing                        | LOW        | Phase 4    | Currently `NATIVE_PROGRESS_UPDATED` events hit `PlayerBackgroundService` → `updatePosition()` → `playerSlice`. Phase 4 must maintain 1 Hz UI update frequency after routing through coordinator. The STACK.md fast-path note (NATIVE_PROGRESS_UPDATED skips lock) resolves this.                    |
| Pause/play from lock screen and notification            | Standard mobile audio expectation                     | LOW        | Phase 2    | Remote control events in `PlayerBackgroundService` already dispatch to event bus (`PLAY`, `PAUSE`). Phase 2 makes coordinator execute them via `executePlay()`/`executePause()`. This is already scaffolded in `executeTransition()`.                                                               |
| Chapter display updates correctly                       | Users navigate by chapter; stale display is confusing | MEDIUM     | Phase 4    | `_updateCurrentChapter()` in playerSlice is called by `updatePosition()`. After Phase 4 the coordinator bridge owns `updatePosition` writes. The chapter calculation logic must remain connected to position updates.                                                                               |
| Seek works from UI, lock screen, and headphone controls | User controls progress directly                       | LOW        | Phase 2    | `SEEK` event dispatched; `executeSeek()` is already scaffolded in coordinator. Remote seek in `PlayerBackgroundService` dispatches `SEEK` event. Straightforward.                                                                                                                                   |
| Playback rate persists across sessions                  | Users set 1.5x and expect it to stick                 | LOW        | Phase 3/4  | Currently saved to AsyncStorage by `_setPlaybackRate()`. After Phase 4, coordinator bridge writes this value. The coordinator `StateContext` already has `playbackRate`.                                                                                                                            |
| App restore resumes correct book at correct position    | Kill app, reopen — do not start over                  | HIGH       | Phase 3    | Most complex table-stakes item. Involves RESTORING state, reconciling AsyncStorage + DB session + native queue rebuild. `isRestoringState` flag in playerSlice coordinates this today. Phase 3 must fully own this flow through the coordinator's RESTORING → READY transition path.                |
| Progress syncs to server                                | Multi-device listening requires server sync           | MEDIUM     | Phase 3/5  | `ProgressService` sync runs concurrently with playback (no-op SESSION\_\* events). After Phase 3, coordinator's canonical position must be what ProgressService reads — not TrackPlayer directly.                                                                                                   |
| Now playing metadata on lock screen shows chapter title | Standard iOS/Android behavior                         | LOW        | Phase 4    | `updateNowPlayingMetadata()` called from `PlayerService` and `playerSlice`. After Phase 4, coordinator bridge must trigger this after chapter changes.                                                                                                                                              |
| Sleep timer fires at correct time                       | Feature users actively use                            | LOW        | Phase 4    | Sleep timer state lives in playerSlice (`sleepTimer`). Phase 4 coordinator bridge must preserve this field or the timer logic must migrate. Note: sleep timer is currently playerSlice-local; it may need to move to coordinator context if Phase 4 makes playerSlice fully read-only.              |

---

### Developer-Facing Reliability Improvements

These are the actual goals of the migration. Users may perceive some of these indirectly (fewer glitches) but they are primarily observable via tests, logs, and diagnostics.

#### Phase 2: Coordinator Executes Transitions

| Improvement                         | What Observable Behavior Proves It                                                                                                                                                                                          | Complexity | Notes                                                                                                                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Duplicate play sessions eliminated  | In logs and DB: only one `localListeningSession` row per play of a given item; `startSessionLocks` mutex in ProgressService no longer needs to defend against concurrent calls                                              | MEDIUM     | Root cause today: `PlayerService.executeLoadTrack()` and `PlayerBackgroundService.handlePlaybackStateChanged()` can both trigger session creation. Phase 2 serializes all `LOAD_TRACK` → session creation through the coordinator's event queue. |
| `play-when-loading` guard works     | Dispatching `PLAY` while coordinator is in LOADING state returns without calling `executePlay()` — verifiable via coordinator metrics (`rejectedTransitionCount` increments, no `executePlay()` call, no TrackPlayer error) | LOW        | Transition matrix already rejects PLAY from LOADING. Phase 2 makes this enforcement real rather than observational.                                                                                                                              |
| Coordinator is the single executor  | All `TrackPlayer.play()`, `TrackPlayer.pause()`, `TrackPlayer.seekTo()` calls originate from `executeTransition()`, not scattered across `PlayerService`, `PlayerBackgroundService`, remote handler functions               | HIGH       | This is the central Phase 2 deliverable. "Done" means: grep `TrackPlayer.play()` shows it only in `PlayerService.executePlay()`, which is only called from the coordinator.                                                                      |
| NATIVE\_\* events confirm execution | After coordinator calls `executePlay()`, a `NATIVE_STATE_CHANGED(Playing)` event arrives and coordinator context shows `isPlaying=true` within 500ms                                                                        | LOW        | Already tracked in coordinator context. Phase 2 makes this a verification loop rather than just an observation.                                                                                                                                  |
| `observerMode` flag is preserved    | Instant rollback is available: setting `observerMode = true` in `PlayerStateCoordinator.ts` returns to Phase 1 behavior without redeployment of services                                                                    | LOW        | The flag already exists at line 75 of `PlayerStateCoordinator.ts`. Do not remove it.                                                                                                                                                             |

#### Phase 3: Coordinator Owns Canonical Position

| Improvement                              | What Observable Behavior Proves It                                                                                                                                                                                                                                                                                            | Complexity | Notes                                                                                                                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Single position reconciliation algorithm | The scattered position logic in `PlayerService.determineResumePosition()` (lines 646–760), `playerSlice.restorePersistedState()` (lines 132–361), and `PlayerService.reconcileTrackPlayerState()` (lines 1183–1374) is replaced by one function in the coordinator. Grep confirms the old functions are removed or delegated. | HIGH       | This is the most complex Phase 3 item. Three large functions currently implement overlapping reconciliation logic.                                                                                                 |
| Resume position is correct on cold start | App kill → reopen → position bar shows same location as before kill, within ≤5 seconds                                                                                                                                                                                                                                        | HIGH       | "Done" test: kill app at position 1h23m45s, reopen, confirm player shows 1h23m44s–1h23m50s range.                                                                                                                  |
| No position drift during long playback   | After 30 minutes of playback, position shown in UI matches `TrackPlayer.getProgress().position` within ≤5 seconds                                                                                                                                                                                                             | MEDIUM     | Currently possible for store position to drift from native player due to async `updatePosition()` calls with no ordering guarantee. Phase 3 makes native player authoritative and writes flow coordinator → store. |
| Server sync reads coordinator position   | `ProgressService.updateProgress()` reads position from coordinator context (or takes it as argument from coordinator), not from `TrackPlayer.getProgress()` directly or from store                                                                                                                                            | MEDIUM     | Current code in `PlayerBackgroundService.handlePlaybackProgressUpdated()` calls both `updateProgress()` and `store.updatePosition()`. Phase 3 makes coordinator the intermediary.                                  |
| Seek optimistic update is correct        | UI position bar jumps immediately on `SEEK` event dispatch; coordinator context `position` updates optimistically; `NATIVE_PROGRESS_UPDATED` confirms or corrects within ~100ms                                                                                                                                               | LOW        | Coordinator already updates `context.position` on `SEEK` event (line 343 of `PlayerStateCoordinator.ts`). Phase 3 wires this through to the store.                                                                 |
| App-foreground reconciliation works      | After backgrounding and foregrounding, `APP_FOREGROUNDED` event triggers coordinator position reconciliation; result written to store and TrackPlayer seeked if needed                                                                                                                                                        | MEDIUM     | `reconcileTrackPlayerState()` in PlayerService currently handles this. Phase 3 moves it to coordinator.                                                                                                            |

#### Phase 4: playerSlice Becomes Read-Only Proxy

| Improvement                                           | What Observable Behavior Proves It                                                                                                                                                                                                                    | Complexity | Notes                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Single write path to playerSlice player fields        | All mutations to `player.isPlaying`, `player.position`, `player.currentTrack`, `player.loading.*` originate from coordinator's `syncToStore()` bridge. No service calls `updatePlayingState()`, `updatePosition()`, or `_setCurrentTrack()` directly. | HIGH       | "Done" means: grep for `updatePosition(`, `updatePlayingState(`, `_setCurrentTrack(`, `_setTrackLoading(`, `_setSeeking(` shows them called only from coordinator bridge code, not from `PlayerBackgroundService` or `PlayerService` directly.                            |
| React component re-renders are unchanged              | `usePlayer()` hook consumers (`PlayPauseButton`, `ConsolidatedPlayerControls`, `FullScreenPlayer`) still re-render at the correct rate with correct values                                                                                            | MEDIUM     | The bridge writes to the same playerSlice shape via `useAppStore.setState()`. React re-render behavior should be identical. Measure with React DevTools or render count tests.                                                                                            |
| `isRestoringState` flag removed from playerSlice      | The `isRestoringState: boolean` field and `setIsRestoringState()` action in playerSlice are deleted; the RESTORING coordinator state replaces its semantic role                                                                                       | MEDIUM     | Current usage: prevents premature chapter updates. After Phase 4, coordinator is in RESTORING state during restoration — `_updateCurrentChapter()` calls can check coordinator state instead of this flag, or the coordinator bridge controls when chapter writes happen. |
| playerSlice mutation methods become no-ops or deleted | `updatePosition()`, `updatePlayingState()`, `_setCurrentTrack()` etc. either delegate to coordinator (for the migration period) or are removed                                                                                                        | MEDIUM     | Coordinate with any external callers. Check: these methods are also called in tests — tests need updating.                                                                                                                                                                |
| Session ID in store reflects coordinator              | `player.currentPlaySessionId` (currently set by `_setPlaySessionId()`) matches `coordinator.getContext().sessionId` at all times                                                                                                                      | LOW        | Coordinator already tracks `sessionId` in context from SESSION_CREATED events. Bridge writes this through.                                                                                                                                                                |

#### Phase 5: Remove Legacy Flags and Simplify

| Improvement                                                                    | What Observable Behavior Proves It                                                                                                                                                                                    | Complexity | Notes                                                                                                                     |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `isRestoringState` flag deleted                                                | No reference to `isRestoringState` in source tree                                                                                                                                                                     | LOW        | Already noted in Phase 4; Phase 5 confirms deletion.                                                                      |
| Boolean guard flags removed from services                                      | `startSessionLocks` Map in ProgressService (the per-item mutex) is removed or reduced; `rebuildCurrentTrackIfNeeded()` guard logic simplified because coordinator's serial queue prevents the race it defends against | MEDIUM     | These flags are coordination mechanisms. Once coordinator is the only coordinator, they are redundant.                    |
| `PlayerService.determineResumePosition()` deleted or reduced to a thin wrapper | The 114-line function is replaced by coordinator Phase 3 reconciliation                                                                                                                                               | LOW        | After Phase 3 moves the logic to coordinator, Phase 5 deletes the original.                                               |
| `PlayerService.reconcileTrackPlayerState()` deleted                            | The 192-line reconciliation method is replaced by coordinator Phase 3 logic                                                                                                                                           | LOW        | Same as above.                                                                                                            |
| `PlayerService.restorePlayerServiceFromSession()` deleted or delegated         | The 94-line restoration method moves to coordinator's RESTORING state handler                                                                                                                                         | LOW        | Coordinator owns restoration in Phase 3+.                                                                                 |
| 500+ lines removed from PlayerService                                          | `PlayerService.ts` is currently 1640 lines. Phase 5 target: under 1100 lines (execution-only delegate, no state management)                                                                                           | HIGH       | This is the code-quality payoff. "Done" = line count reduced and each remaining method is a thin `TrackPlayer.*` wrapper. |
| 90%+ test coverage maintained                                                  | `npm run test:coverage` shows no regression                                                                                                                                                                           | LOW        | Ongoing gate throughout all phases.                                                                                       |

---

### Anti-Features (Do Not Build, Do Not Break)

| Anti-Feature                                                 | Why Avoid                                                                                                                                                  | What to Do Instead                                                                                                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| XState migration                                             | Replaces working, validated, production-running code; adds 16.7 kB bundle; requires actor model restructuring. Thoroughly documented decision in STACK.md. | Keep the custom FSM. The `executeTransition()` scaffold already exists — Phase 2 just removes the `observerMode` guard.                                   |
| New player features during migration                         | Scope creep. The migration is a structural change, not a feature addition.                                                                                 | After Phase 5 is clean and stable, add features on top of the clean architecture.                                                                         |
| Changing the state transition matrix                         | Phase 1 validated the topology in production. 122+ tests cover the transition matrix.                                                                      | Only add transitions if a clear gap is discovered during Phase 2-5 work. Document the gap first.                                                          |
| Making playerSlice a new Zustand store                       | Would require updating every `usePlayer()` call site; creates migration risk with no benefit                                                               | Bridge coordinator → existing playerSlice via `useAppStore.setState()`. Zero call site changes.                                                           |
| Store-to-coordinator feedback loops                          | A `subscribeWithSelector` subscription that dispatches events back to coordinator creates infinite loops and temporal ambiguity                            | Data flows one direction: coordinator → store. Store dispatches nothing back to coordinator.                                                              |
| AsyncStorage as position source during live playback         | Writes are async and 100–500ms stale; creates drift                                                                                                        | Write to AsyncStorage only on pause/stop/background. Use native player as authoritative live source.                                                      |
| Seeking TrackPlayer during active playback for position sync | Causes audio stutter                                                                                                                                       | If playback is active, update store position without seeking TrackPlayer. Already documented in existing `reconcileTrackPlayerState()` code at line 1313. |
| Removing the `observerMode` flag                             | Destroys Phase 2 rollback capability                                                                                                                       | Keep the flag until Phase 5 cleanup.                                                                                                                      |
| Fully removing playerSlice                                   | Zustand/React integration is too valuable; all component selectors use it                                                                                  | Replace write paths only. Keep read paths. Phase 4 makes it read-only, not removed.                                                                       |

---

## Feature Dependencies

```
Phase 2 (Execution Control)
    └──required by──> Phase 3 (Position Reconciliation)
                          └──required by──> Phase 4 (Store Proxy)
                                                └──required by──> Phase 5 (Cleanup)

Phase 2 enabler: observerMode=false already coded in PlayerStateCoordinator (line 75)
Phase 3 enabler: StateContext.position already tracked in coordinator context
Phase 4 enabler: useAppStore.setState() API exists; subscribeWithSelector already applied
Phase 5 enabler: removal is safe only after Phase 3+4 own the write paths
```

### Dependency Notes

- **Phase 2 requires completed Phase 1**: Already satisfied. Phase 1 is production-validated.
- **Phase 3 requires Phase 2**: Position reconciliation is only meaningful if the coordinator is executing transitions. If services still execute independently, the coordinator's "canonical position" is a shadow, not a truth.
- **Phase 4 requires Phase 3**: The coordinator can only be the write path to playerSlice after it owns canonical position. Phase 4 before Phase 3 creates a bridge that writes potentially stale position data.
- **Phase 5 requires Phase 4**: Legacy flags and reconciliation methods are still load-bearing until Phase 4 routes all writes through the coordinator. Deleting them before Phase 4 is complete breaks the app.
- **`isRestoringState` removal spans Phase 4 and 5**: The flag can be removed from playerSlice in Phase 4 (when coordinator RESTORING state replaces its purpose) but must remain in tests until Phase 5 confirms the replacement logic works correctly.
- **Sleep timer migration is Phase 4-specific**: The `sleepTimer` state in playerSlice is playerSlice-local today. If Phase 4 makes playerSlice fully read-only, sleep timer must either move to coordinator context or retain a local write path. This is a Phase 4 design decision that needs resolution before implementation.

---

## MVP Definition (Phase Ordering)

The phases are already ordered correctly in the project plan. This section confirms why the ordering is correct and what "done" looks like for each gate.

### Phase 2 Launch Gate (Required Before Phase 3)

- [ ] Coordinator calls `executePlay()`, `executePause()`, `executeLoadTrack()`, `executeSeek()`, `executeSetRate()`, `executeSetVolume()`, `executeStop()` — all existing scaffolding in `executeTransition()` is connected
- [ ] `observerMode = false` in production; rollback tested by setting it back to `true`
- [ ] No duplicate session creation under rapid play/stop/play stress test
- [ ] Lock screen play/pause continue to work
- [ ] `npm test` passes with >90% coverage

### Phase 3 Launch Gate (Required Before Phase 4)

- [ ] `PlayerService.determineResumePosition()` replaced by coordinator reconciliation
- [ ] Cold-start position restoration: kill at known position, reopen, land within 5 seconds
- [ ] Server sync reads coordinator position, not TrackPlayer directly
- [ ] 30-minute playback drift test: UI position matches native within 5 seconds
- [ ] `npm test` passes with >90% coverage

### Phase 4 Launch Gate (Required Before Phase 5)

- [ ] `useAppStore.setState()` bridge in coordinator writes all playerSlice player fields
- [ ] No direct `updatePosition()`, `updatePlayingState()`, `_setCurrentTrack()` calls from services
- [ ] `isRestoringState` removed from playerSlice; coordinator RESTORING state handles its role
- [ ] Chapter display still updates correctly from coordinator bridge
- [ ] Sleep timer behavior confirmed (either migrated to coordinator context or documented as retained local write path)
- [ ] `npm test` passes with >90% coverage

### Phase 5 Launch Gate (Migration Complete)

- [ ] `PlayerService.determineResumePosition()` deleted
- [ ] `PlayerService.reconcileTrackPlayerState()` deleted
- [ ] `PlayerService.restorePlayerServiceFromSession()` deleted or reduced to thin wrapper
- [ ] `isRestoringState` field deleted from playerSlice and types
- [ ] PlayerService.ts under 1100 lines (down from 1640)
- [ ] Full regression test suite passes
- [ ] Manual QA checklist from `docs/plans/state-machine-migration.md` completed

---

## Feature Prioritization Matrix

| Feature / Improvement                        | User Value                                             | Implementation Cost                    | Priority | Phase |
| -------------------------------------------- | ------------------------------------------------------ | -------------------------------------- | -------- | ----- |
| No duplicate sessions                        | HIGH (prevents corrupted progress)                     | LOW (serial queue already prevents it) | P1       | 2     |
| Lock screen controls execute via coordinator | HIGH (core UX)                                         | LOW (scaffolded in executeTransition)  | P1       | 2     |
| Single position authority on cold start      | HIGH (correct resume)                                  | HIGH (replaces 3 scattered algorithms) | P1       | 3     |
| 30-minute position drift elimination         | MEDIUM (most users don't notice <5s)                   | MEDIUM                                 | P2       | 3     |
| playerSlice write paths owned by coordinator | LOW direct (invisible) HIGH indirect (enables cleanup) | HIGH                                   | P2       | 4     |
| isRestoringState flag removed                | LOW direct (invisible)                                 | MEDIUM                                 | P2       | 4/5   |
| PlayerService 500+ line reduction            | LOW direct MEDIUM maintenance                          | LOW (deletion after Phase 3+4)         | P3       | 5     |
| Sleep timer migration                        | MEDIUM (active user feature)                           | MEDIUM (design decision needed)        | P2       | 4     |

**Priority key:**

- P1: Must land for this migration to be considered working
- P2: High-value reliability improvement that is the stated goal
- P3: Code quality payoff; valuable but not blocking

---

## Phase-Specific Complexity Flags

These are not anti-features — they are known hard spots that need explicit design attention.

### Phase 2: Confirm NATIVE\_\* events still update coordinator context

The `observerMode = false` change gates execution behind the transition matrix. But `updateContextFromEvent()` runs unconditionally (before the `!this.observerMode` guard at line 261 of `PlayerStateCoordinator.ts`). Verify this remains true in Phase 2 — external controls (lock screen, headphones, phone calls) must still update coordinator context even when coordinator is executing transitions. The architecture doc confirms this design intent explicitly.

### Phase 3: reconcilePosition() must handle the "server position is newer than native" case correctly

The STACK.md reconciliation algorithm gives native player highest priority when position > 0. But on cold start, native player position is 0 until queue is loaded. The reconciler must correctly distinguish "native position is 0 because playback hasn't started" from "native position is 0 because something failed." The existing `MIN_PLAUSIBLE_POSITION = 5` threshold in `PlayerService.determineResumePosition()` (line 654) solves this edge case — the new coordinator reconciliation algorithm must replicate this guard.

### Phase 3: Android Headless JS context has its own coordinator

`PlayerBackgroundService` creates a separate `PlayerStateCoordinator` instance in the Android background JS context (documented at lines 44-52 of `PlayerStateCoordinator.ts`). When Phase 3 moves position reconciliation into the coordinator, the background context coordinator will perform reconciliation independently from the UI context coordinator. This is acceptable because both coordinators observe the same native player and DB, and the background context only runs during background playback. But it must be explicitly accounted for: the background coordinator should NOT write to `useAppStore` (no React/Zustand context in Headless JS).

### Phase 4: Sleep timer write path

The sleep timer (`player.sleepTimer` in playerSlice) is currently written by playerSlice actions directly (`setSleepTimer()`, `setSleepTimerChapter()`, `cancelSleepTimer()`). These are user-initiated writes from UI. If Phase 4 makes playerSlice fully read-only, these writes need a home. Options: (a) sleep timer moves to coordinator context as a new StateContext field, (b) sleep timer retains a direct playerSlice write path since it is UI state not player execution state. Option (b) is lower risk — sleep timer does not participate in the race conditions being fixed. Design decision needed before Phase 4 implementation begins.

### Phase 4: `updateNowPlayingMetadata()` trigger

Currently called by `PlayerService.updateNowPlayingMetadata()` and by `playerSlice.updateNowPlayingMetadata()`. After Phase 4, the coordinator bridge must trigger this after chapter changes. The bridge's `syncToStore()` can call this after updating `currentChapter` in the store. Ensure it is called at the right frequency — currently it is debounced to avoid hammering TrackPlayer on every position tick.

---

## Sources

- Direct codebase analysis of:
  - `/Users/clay/Code/github/abs-react-native/src/services/coordinator/PlayerStateCoordinator.ts` — Phase 2 execution scaffolding, `observerMode` flag, context update logic
  - `/Users/clay/Code/github/abs-react-native/src/services/coordinator/transitions.ts` — transition matrix
  - `/Users/clay/Code/github/abs-react-native/src/services/PlayerService.ts` — legacy position reconciliation (3 separate algorithms), 1640-line service as Phase 5 reduction target
  - `/Users/clay/Code/github/abs-react-native/src/stores/slices/playerSlice.ts` — `isRestoringState` flag, direct mutation methods targeted for Phase 4
  - `/Users/clay/Code/github/abs-react-native/src/services/PlayerBackgroundService.ts` — direct store mutations, remote control handlers, Android Headless JS context concern
  - `/Users/clay/Code/github/abs-react-native/src/services/ProgressService.ts` — `startSessionLocks` mutex, sync logic
  - `/Users/clay/Code/github/abs-react-native/.planning/PROJECT.md` — requirements, constraints, out-of-scope list
  - `/Users/clay/Code/github/abs-react-native/.planning/research/STACK.md` — position reconciliation priority order, Zustand bridge pattern
  - `/Users/clay/Code/github/abs-react-native/.planning/codebase/CONCERNS.md` — known bugs (duplicate session creation), fragile areas, tech debt
  - `/Users/clay/Code/github/abs-react-native/docs/plans/state-machine-migration.md` — success metrics, phase definitions, testing strategy
  - `/Users/clay/Code/github/abs-react-native/docs/architecture/player-state-machine.md` — design decisions, NATIVE\_\* event contract

All findings are HIGH confidence — source code is ground truth.

---

_Feature research for: abs-react-native state machine migration (Phases 2–5)_
_Researched: 2026-02-16_
