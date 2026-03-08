# Phase 5: Cleanup - Research

**Researched:** 2026-02-19
**Domain:** Coordinator migration cleanup, service simplification, dead code deletion
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Full coordinator migration cleanup — not just the three named flags but everything made redundant: flags (isLoading, isPreparing, sessionCreationInProgress, observerMode, isRestoringState), their guard blocks, helpers that only exist to support them, and any remaining pre-coordinator patterns
- `observerMode` flag is deleted — migration is proven; no production kill-switch needed
- `isRestoringState` is removed in Phase 5 without requiring BGS chapter dispatch to route through coordinator first — coordinator already handles chapter state correctly; the dispatch dependency in the roadmap success criterion is superseded by the coordinator owning all native sync
- Logic deduplication principle: any logic that the coordinator should own should have exactly one copy. If a pattern exists in both coordinator and service, keep only the coordinator version — unless moving it would compromise code clarity or maintainability
- No pre-specified target methods beyond the named flags — researcher audits PlayerService and flags what belongs in coordinator based on responsibilities
- File scope: PlayerService, PlayerBackgroundService, ProgressService, PlayerStateCoordinator and related coordinator files, playerSlice — follow dead code wherever it leads within these five files; do not touch components, hooks, or routes
- PlayerService target: under 1,100 lines (from ~1,640)
- Method: delete dead code + extract to coordinator — any logic the coordinator should own moves there; pure TrackPlayer execution calls stay in PlayerService
- Session mutex (sessionCreationInProgress): verify-first — researcher audits what the coordinator's transition guard actually blocks before committing to removal. Do not remove until the integration test proves no duplicate sessions occur.
- All `updateNowPlayingMetadata` calls move to the coordinator — BGS has zero native metadata writes after Phase 5
- Coordinator owns all native sync: TrackPlayer metadata (artwork, title, artist) AND NowPlaying API updates
- Coordinator detects chapter changes internally via position updates; uses existing `lastSyncedChapterId` debounce pattern (from Phase 4) — calls `updateNowPlayingMetadata` only when `chapter.id` actually changes. No CHAPTER_CHANGED event dispatch; coordinator derives chapter state from position internally.

### Claude's Discretion

- Whether the coordinator detects chapters by boundary-crossing or per-tick with debounce — use whichever is cleaner given the existing code
- Exact restructuring of any helpers that need to move vs. be inlined
- Test structure for chapter detection coverage (whether it lives in the integration test or a dedicated unit test)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID       | Description                                                                                              | Research Support                                                                                                                                                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLEAN-01 | Implicit state flags removed: `isLoading`, `isPreparing`, `sessionCreationInProgress` in services        | Audit confirms: `isLoading`/`isPreparing` do not exist in current code; `sessionCreationInProgress` is the `startSessionLocks` Map in ProgressService; coordinator serial queue is the effective guard                                                          |
| CLEAN-02 | `PlayerService.ts` reduced from ~1640 lines to under 1100 lines                                          | Current count is 1,496 lines; deleting reconciliation methods, reducing callers, removing isRestoringState usage, and simplifying helpers yields ~370+ removable lines                                                                                          |
| CLEAN-03 | `isRestoringState` removed last, only after BGS chapter updates route through coordinator                | `isRestoringState` is in playerSlice + used in PlayerService.reloadTrackPlayerQueue; coordinator chapter detection must land first (in coordinator.syncPositionToStore) before removal is safe                                                                  |
| CLEAN-04 | ProgressService session mutex removed after coordinator serial queue is confirmed as the effective guard | `startSessionLocks` Map in ProgressService is the mutex; coordinator's `async-lock` + serial queue provides the same guarantee at a higher level; the BGS `existingSession` guard (line 751) provides the duplicate-session check; confirm via integration test |
| CLEAN-05 | Integration tests cover full playback flow through coordinator (load → play → pause → seek → stop)       | Existing PROP-01 test covers load → play → progress → pause → stop; seek is tested in isolation; a new integration test combining all five steps is needed                                                                                                      |
| CLEAN-06 | 90%+ test coverage maintained across all modified files                                                  | Existing test suite covers coordinator heavily (2734-line test file); PlayerService (845 lines); need to remove/update tests for deleted methods and add tests for new coordinator chapter detection                                                            |

</phase_requirements>

## Summary

Phase 5 is a pure deletion + consolidation phase. The coordinator migration is complete; Phase 4 wired the store bridge. What remains is removing scaffolding that was temporarily retained during the migration: `observerMode`, `isRestoringState`, legacy reconciliation methods in PlayerService, the ProgressService session mutex, and duplicated now-playing logic in BGS.

The most significant structural change is **moving chapter detection from BGS into the coordinator**. Currently BGS's `handlePlaybackProgressUpdated` reads `store.player.currentChapter` before and after a progress tick to detect chapter boundaries, then calls `store.updateNowPlayingMetadata()` directly. The coordinator already has `lastSyncedChapterId` infrastructure from Phase 4 (`syncStateToStore` PROP-06), but `context.currentChapter` is never populated because CHAPTER_CHANGED is never dispatched. The fix is small: in `syncPositionToStore`, after calling `store.updatePosition()` (which triggers `_updateCurrentChapter` in playerSlice), read `store.player.currentChapter` and compare its ID against `lastSyncedChapterId`.

The second significant work is **eliminating `reconcileTrackPlayerState`, `verifyTrackPlayerConsistency`, `syncPositionFromDatabase`, and `syncStoreWithTrackPlayer`** from PlayerService. These were pre-coordinator workarounds. Their callers in `_layout.tsx` and `index.ts` are outside the five-file scope but will need updating; the planner should note this as a required companion change.

**Primary recommendation:** Delete in dependency order — observerMode first (no dependents), then reconciliation methods (update callers in \_layout/index), then isRestoringState (after chapter detection moves to coordinator), then session mutex (after integration test confirms no duplicate sessions).

## Current File Sizes (Audited)

| File                         | Current Lines | Phase 5 Target                     |
| ---------------------------- | ------------- | ---------------------------------- |
| `PlayerService.ts`           | 1,496         | < 1,100                            |
| `PlayerBackgroundService.ts` | 1,004         | ~850 (chapter detection moves out) |
| `ProgressService.ts`         | 1,215         | ~1,180 (mutex removed)             |
| `PlayerStateCoordinator.ts`  | 1,030         | ~1,070 (chapter detection added)   |
| `playerSlice.ts`             | 738           | ~700 (isRestoringState removed)    |

## Flags and Scaffolding to Delete

### Flag 1: `observerMode` (Coordinator)

**Location:** `PlayerStateCoordinator.ts` lines 91, 106, 186, 195, 294, 720, 749, 890, 901

**Current usage:** Private field + two public methods (`isObserverMode()`, `setObserverMode()`). Guards `executeTransition()` (line 294), `syncPositionToStore()` (line 720), and `syncStateToStore()` (line 749). Included in `exportDiagnostics()` output.

**Why removable:** Migration is production-proven. The kill-switch purpose is moot. Every guard is `if (!this.observerMode)` — removing the flag means always executing (the current production behavior).

**Deletion impact:**

- Remove `private observerMode = false;`
- Remove `isObserverMode()` method (lines 185-187)
- Remove `setObserverMode()` method (lines 194-197)
- Remove `if (!this.observerMode)` guard in `handleEvent()` (lines 293-308 simplify)
- Remove `if (this.observerMode) return;` in both sync methods
- Remove `observerMode` from `exportDiagnostics()` return type and body
- Remove Phase 1/2 comment headers in file JSDoc
- **Tests to update:** 18 references in `PlayerStateCoordinator.test.ts` — delete the entire `describe("observer mode rollback (EXEC-04)")` block (~60 lines) and update `describe("EXEC-05 NATIVE_* context updates")` tests that use `setObserverMode(true)` to remove the mode-toggling setup; simplify `PROP-05` tests that toggle observer mode

**Estimated lines removed from coordinator:** ~25 lines

### Flag 2: `isRestoringState` (playerSlice + PlayerService)

**Location:**

- `playerSlice.ts`: state field (line 58), initial value (line 378), interface declaration (line 58), action `setIsRestoringState` (lines 111, 585-593)
- `PlayerService.reloadTrackPlayerQueue()` (lines 549-584): three `setIsRestoringState` calls

**Current usage:** Set to `true` before `TrackPlayer.add()` during queue rebuild to prevent `_updateCurrentChapter` from firing at position 0. Cleared after `seekTo()` + `_updateCurrentChapter()` is manually called.

**Why removable (with prerequisite):** After chapter detection moves to coordinator's `syncPositionToStore`, the coordinator-owned `isLoadingTrack` flag already guards against premature position-0 writes (see POS-03 in coordinator). `isRestoringState` becomes redundant because:

1. `isLoadingTrack = true` during RELOAD_QUEUE prevents position-0 from overwriting context
2. Chapter detection in coordinator fires on `updatePosition()` only after `isLoadingTrack` clears
3. `_updateCurrentChapter` in playerSlice already has the `isRestoringState` guard — but that guard can be replaced by checking `loading.isLoadingTrack` instead (which the coordinator already manages)

**Prerequisite:** Coordinator chapter detection must be in place first. Test that chapter does not update to "Chapter 1" during queue rebuild.

**Deletion impact:**

- Remove `isRestoringState: boolean` from `PlayerSliceState` interface
- Remove initial value `isRestoringState: false` from player state
- Remove `setIsRestoringState: (isRestoring: boolean) => void` from interface and implementation
- In `_updateCurrentChapter`, replace `isRestoringState` guard with `loading.isLoadingTrack` guard
- In `reloadTrackPlayerQueue`, remove all three `setIsRestoringState` calls and inline the `_updateCurrentChapter(resumeInfo.position)` call directly
- **Tests to update:** `playerSlice.test.ts` has `describe("setIsRestoringState")` block (lines 393-400) — delete; update `_updateCurrentChapter` test at line 266 to use `_setTrackLoading(true)` instead

**Estimated lines removed:** ~25 from playerSlice, ~15 from PlayerService

### Flag 3: `startSessionLocks` mutex (ProgressService) — CLEAN-04

**Location:** `ProgressService.ts` lines 91, 232-258, 449-450

**Current usage:** `Map<string, Promise<void>>` that serializes concurrent `startSession()` calls per library item. If a second call arrives while one is running, it awaits the first, then checks if a session was created and returns early if so.

**Coordinator serial queue analysis:** The coordinator processes ALL events through a single async-lock queue (one `state-transition` lock). A `LOAD_TRACK` event dispatches `executeLoadTrack()` which calls `progressService.startSession()`. The BGS `handleActiveTrackChanged` also calls `startSession()` — but this fires from a TrackPlayer event handler, NOT from the coordinator queue. So the mutex protects against concurrent calls from two distinct code paths: (1) coordinator via `executeLoadTrack` and (2) BGS `NATIVE_TRACK_CHANGED` handler.

**BGS existing guard:** `handleActiveTrackChanged` already checks `progressService.getCurrentSession()` (line 751) and returns early if a session exists. This is the actual duplicate-session guard.

**Risk assessment:** The `startSessionLocks` mutex was added specifically to prevent race conditions when BGS and coordinator both call `startSession()` simultaneously for the same item. With the coordinator serial queue, `executeLoadTrack` and the BGS handler CAN still race because BGS event handlers run outside the coordinator queue. However, the BGS guard at line 751 (`if (existingSession) return`) should prevent the actual duplicate creation.

**Recommendation:** VERIFY before removal. The integration test (CLEAN-05) should demonstrate no duplicate session creation across a full load-to-play cycle before removing the mutex.

**Estimated lines removed:** ~20 from ProgressService

## Methods to Remove from PlayerService

### `reconcileTrackPlayerState()` — Lines 1039-1230 (~192 lines)

**What it does:** Queries TrackPlayer for position, rate, volume, playing state. Compares against store + DB session. Applies corrections.

**Why redundant:** The coordinator bridge (`syncStateToStore`, `syncPositionToStore`) keeps store and TrackPlayer in sync after every event. Position reconciliation is handled by `resolveCanonicalPosition()` on each `LOAD_TRACK`. The `ReconciliationReport` interface (lines 51-58) also becomes dead code.

**External callers that need updating:**

- `_layout.tsx` line 166: `await playerService.reconcileTrackPlayerState()` — replace with no-op or remove the verification block (the coordinator bridge makes manual reconciliation unnecessary)
- `src/index.ts` line 112: `await playerService.reconcileTrackPlayerState()` — remove

**Estimated lines removed:** ~200 (method + interface)

### `verifyTrackPlayerConsistency()` — Lines 981-1033 (~53 lines)

**What it does:** Checks if TrackPlayer track, position, and playing state match store. Returns boolean.

**Why redundant:** Coordinator bridge ensures consistency. This method's only caller is `_layout.tsx` line 162.

**External callers that need updating:**

- `_layout.tsx` line 162: `const isConsistent = await playerService.verifyTrackPlayerConsistency()` — remove (the log and reconcile call that follow can also be removed)

**Estimated lines removed:** ~53

### `syncStoreWithTrackPlayer()` — Lines 1297-1325 (~29 lines)

**What it does:** Queries TrackPlayer for position and current track, updates store directly.

**Why redundant:** Coordinator bridge already syncs store from coordinator context on every event. This was a fallback for when bridge didn't exist.

**External callers that need updating:**

- `_layout.tsx` line 115: `await playerService.syncStoreWithTrackPlayer()` — the coordinator bridge already handles this; remove
- Internal callers in `reconnectBackgroundService()` (lines 1385, 1419, 1427) — if `reconnectBackgroundService` is retained, update those call sites or re-evaluate the method

**Estimated lines removed:** ~29

### `syncPositionFromDatabase()` — Lines 1239-1295 (~57 lines)

**What it does:** Fetches current session from DB, updates store position, seeks TrackPlayer if not playing.

**Current callers:**

- `_layout.tsx` lines 134 and 180: called after `progressService.fetchServerProgress()` to apply server position to TrackPlayer
- `LibraryItemDetail.tsx` line 391: called after marking item as unfinished (out of file scope)

**Why partially redundant:** After server sync, `coordinator.resolveCanonicalPosition()` would return the updated position on the next `LOAD_TRACK`. However, the `_layout.tsx` callers use this to update TrackPlayer position WITHOUT a full reload — this is a "lightweight position resync" that doesn't require reloading the track.

**Assessment:** This method serves a distinct purpose from coordinator's `resolveCanonicalPosition` — it applies a DB position to a running TrackPlayer without triggering a full reload. RETAIN with cleanup (remove direct `store.updatePosition` call, dispatch `POSITION_RECONCILED` instead so coordinator bridge syncs). Alternatively, dispatch a `POSITION_RECONCILED` event directly from `_layout.tsx` after the DB fetch. The simplest approach is to keep this method but have it dispatch `POSITION_RECONCILED` rather than calling `store.updatePosition` directly.

**Estimated lines if simplified:** ~40 lines (remove DB lookups, delegate to coordinator)

### Dead-code accessor methods (if callers confirmed absent)

**`getCurrentPlaySessionId()`** (lines 842-845) and **`clearPlaySessionId()`** (lines 850-853): No external callers found outside the file. Both delegate to store. Can be deleted.

**`getCurrentTrack()`** (lines 858-861): Only internal caller is `syncStoreWithTrackPlayer()` (line 1315, which is being deleted). No external callers found. Can be deleted.

**`getCurrentLibraryItemId()`** (lines 866-870): No external callers found. Delegates to store. Can be deleted.

**Estimated lines removed:** ~30

### `updateNowPlayingMetadata()` wrapper — Lines 641-643 (~3 lines)

**What it does:** One-line wrapper: `await useAppStore.getState().updateNowPlayingMetadata()`.

**Callers:**

- `executeLoadTrack()` line 388: fires after track loads (Phase 5 mandate: coordinator owns this)
- `refreshFilePathsAfterContainerChange()` line 1482: fires after iOS path refresh

**Action:** Remove the wrapper. The `executeLoadTrack()` call should be replaced by coordinator chapter detection (coordinator will detect the chapter via the first NATIVE_PROGRESS_UPDATED). The `refreshFilePathsAfterContainerChange()` call can call `store.updateNowPlayingMetadata()` directly (it already has `store` available).

## Logic to Move to Coordinator

### Chapter Detection + NowPlaying Metadata

**Current location:** `PlayerBackgroundService.handlePlaybackProgressUpdated()` lines 450-468

**Current code pattern:**

```typescript
// Check if chapter changed (non-gated update)
const currentChapter = store.player.currentChapter;
if (previousChapter?.chapter.id !== currentChapter?.chapter.id && currentChapter) {
  await store.updateNowPlayingMetadata();
}

// Periodic now playing metadata updates (gated by setting)
const periodicUpdatesEnabled = await getPeriodicNowPlayingUpdatesEnabled();
if (periodicUpdatesEnabled && Math.floor(event.position) % 2 === 0) {
  await store.updateNowPlayingMetadata();
}
```

**Why it belongs in coordinator:** Coordinator's `syncPositionToStore` (PROP-02 path, runs every second) already calls `store.updatePosition()` which internally calls `_updateCurrentChapter()`. So `store.player.currentChapter` is already updated by the time `syncPositionToStore` could check it. The coordinator's `lastSyncedChapterId` (Phase 4) was designed for this exact pattern but is never triggered because `context.currentChapter` is never set.

**How to move it:** In `syncPositionToStore`, after `store.updatePosition(this.context.position)`, read `store.player.currentChapter` and compare to `lastSyncedChapterId`. If changed, call `store.updateNowPlayingMetadata()`. This replaces both the chapter-change check AND the periodic update — chapter detection on every tick with debounce is cleaner than both approaches combined.

**Coordinator implementation pattern:**

```typescript
private syncPositionToStore(): void {
  if (this.observerMode) return; // will be deleted
  try {
    const store = useAppStore.getState();
    store.updatePosition(this.context.position); // triggers _updateCurrentChapter

    // Chapter detection: check if chapter changed since last sync
    const currentChapterId = store.player.currentChapter?.chapter?.id?.toString() ?? null;
    if (currentChapterId !== null && currentChapterId !== this.lastSyncedChapterId) {
      this.lastSyncedChapterId = currentChapterId;
      store.updateNowPlayingMetadata().catch((err) => {
        log.error("[Coordinator] Failed to update now playing metadata on chapter change", err);
      });
    }
  } catch {
    return; // BGS headless context guard
  }
}
```

**BGS lines to remove after move:** lines 412-414 (previousChapter capture), lines 450-468 (chapter change check + periodic update block). Also remove the `import { getPeriodicNowPlayingUpdatesEnabled }` import if no longer used.

**Note on periodic updates:** The `getPeriodicNowPlayingUpdatesEnabled` setting was a diagnostic/development feature. The coordinator's per-tick chapter detection (debounced by `lastSyncedChapterId`) provides equivalent behavior without a separate settings flag. This is a deduplication win.

**Note on `updateNowPlayingMetadata` in `executeLoadTrack`:** Currently called fire-and-forget at line 388. After coordinator owns chapter detection, this call can be removed entirely — the coordinator will detect the chapter on the first progress tick.

**Estimated lines added to coordinator:** ~10
**Estimated lines removed from BGS:** ~25

## `isRestoringState` Replacement Strategy

**Current flow in `reloadTrackPlayerQueue`:**

1. `setIsRestoringState(true)` — blocks `_updateCurrentChapter` from firing
2. `TrackPlayer.reset()` + `TrackPlayer.add(tracks)` — queue rebuilt at position 0
3. `TrackPlayer.seekTo(resumeInfo.position)` — seek to actual position
4. `_updateCurrentChapter(resumeInfo.position)` — manually compute chapter at correct position
5. `setIsRestoringState(false)` — unblock chapter updates

**After coordinator owns chapter detection:** The coordinator's POS-03 guard (`if (this.context.isLoadingTrack && event.payload.position === 0)`) already blocks the NATIVE_PROGRESS_UPDATED position=0 from overwriting context. And `syncPositionToStore` only calls `store.updatePosition` with whatever `context.position` is — which during loading is the resume position (set by `resolveCanonicalPosition`), not zero.

**Replacement in `_updateCurrentChapter`:** Replace the `isRestoringState` check with `loading.isLoadingTrack` check. When `isLoadingTrack` is true, `_updateCurrentChapter` is skipped. The coordinator clears `isLoadingTrack` via NATIVE_STATE_CHANGED(Playing) or QUEUE_RELOADED.

**Verification:** The existing `backgroundRestoration.integration.test.ts` test "should not display stale chapter after foreground restoration" must continue to pass. After the change, the mechanism shifts from `isRestoringState` to `isLoadingTrack`.

## Dependency Order for Deletions

```
1. observerMode flag                    (no dependents — safe first)
2. Dead accessor methods                (getCurrentPlaySessionId, clearPlaySessionId, getCurrentTrack, getCurrentLibraryItemId)
3. reconcileTrackPlayerState            (update _layout.tsx + index.ts callers)
4. verifyTrackPlayerConsistency         (update _layout.tsx caller)
5. syncStoreWithTrackPlayer             (update _layout.tsx + internal callers)
6. Move chapter detection to coordinator (adds to coordinator, removes from BGS)
7. Remove updateNowPlayingMetadata      wrapper from PlayerService
8. isRestoringState                     (requires #6 to land first — coordinator chapter detection is the replacement)
9. startSessionLocks mutex              (requires integration test to pass first — CLEAN-04)
10. syncPositionFromDatabase             (simplify to dispatch POSITION_RECONCILED rather than delete entirely — callers are out of scope files)
```

## Line Count Projection for PlayerService

| Method/Section                                                                                                   | Lines      | Action |
| ---------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| `ReconciliationReport` interface (lines 51-58)                                                                   | 8          | Delete |
| `reconcileTrackPlayerState` (lines 1039-1230)                                                                    | 192        | Delete |
| `verifyTrackPlayerConsistency` (lines 981-1033)                                                                  | 53         | Delete |
| `syncStoreWithTrackPlayer` (lines 1297-1325)                                                                     | 29         | Delete |
| `getCurrentPlaySessionId` + `clearPlaySessionId` + `getCurrentTrack` + `getCurrentLibraryItemId` (lines 842-870) | 30         | Delete |
| `updateNowPlayingMetadata` wrapper (lines 641-643)                                                               | 3          | Delete |
| `isRestoringState` calls in `reloadTrackPlayerQueue`                                                             | 15         | Delete |
| Duplicate JSDoc comments, stale inline comments                                                                  | ~20        | Delete |
| **Projected total removed**                                                                                      | **~350**   |        |
| **Projected new line count**                                                                                     | **~1,146** |        |

**Note:** The target is < 1,100 lines. The projection of ~1,146 suggests the planner should also look at simplifying `restorePlayerServiceFromSession()` (~94 lines) or `reconcileTrackPlayerState`-adjacent comments/patterns for the remaining gap. Alternatively, the `syncPositionFromDatabase` simplification (delegate to coordinator dispatch) removes ~20 more lines, reaching ~1,126 — close to target. The planner may need to accept ~1,100-1,150 as the practical floor given retained methods.

## Session Mutex Risk Assessment (CLEAN-04)

**Current protection mechanism:** `startSessionLocks` Map in ProgressService + BGS `existingSession` check (line 751 in BGS).

**Coordinator's protection:** Serial event queue (async-lock) ensures only one `executeLoadTrack` runs at a time. But BGS `handleActiveTrackChanged` runs OUTSIDE the coordinator queue — it's a direct TrackPlayer event handler.

**Race condition scenario:**

1. User taps play → coordinator dispatches `LOAD_TRACK` → `executeLoadTrack` → `startSession()`
2. Simultaneously, TrackPlayer fires `NATIVE_TRACK_CHANGED` → BGS `handleActiveTrackChanged` → `startSession()`
3. Without mutex: both calls enter `startSession()` concurrently

**BGS guard effectiveness:** BGS checks `progressService.getCurrentSession()` BEFORE calling `startSession()` (line 751-765). If coordinator's `startSession()` completes first, BGS returns early. This guards the common case.

**Remaining race:** If both check `getCurrentSession()` concurrently and both get null (session not yet created), both will call `startSession()`. The mutex prevents this. The coordinator's serial queue prevents it for coordinator-originated calls, but not for BGS-originated calls that bypass the queue.

**Conclusion:** The mutex in `startSession()` is still doing real work. CLEAN-04 should be gated on the integration test demonstrating no duplicate sessions across a concurrent load-play scenario. The integration test is the gate.

## Integration Test Gaps (CLEAN-05)

**Existing coverage:** PROP-01 test (`PlayerStateCoordinator.test.ts` line 2197) covers: LOAD_TRACK → QUEUE_RELOADED → PLAY → NATIVE_PROGRESS_UPDATED → PAUSE → STOP. This verifies coordinator-to-store bridge at each step.

**Missing for CLEAN-05:** A test covering the full sequence including SEEK: LOAD_TRACK → PLAY → PAUSE → SEEK (while paused) → PLAY → STOP. This should verify:

- `executeLoadTrack` is called
- `executePlay` is called
- `executePause` is called
- `executeSeek` is called with correct position
- Post-seek auto-PLAY dispatch when preSeekState was PLAYING
- `executeStop` is called

**Existing seek tests cover:** Individual SEEK from PLAYING (line 1705), individual SEEK from PAUSED (line 1733), seek state recovery. What's missing is a single end-to-end integration test that strings all five lifecycle phases together.

**Recommendation:** Add one new integration test in `PlayerStateCoordinator.test.ts` in the "execution control" describe block that does the full LOAD → PLAY → PAUSE → SEEK → PLAY → STOP sequence, verifying each `execute*` call in order.

## Common Pitfalls for This Phase

### Pitfall 1: Deleting observerMode tests that cover real behavior

**What goes wrong:** Deleting the observer mode rollback tests (`EXEC-04` describe block) also removes tests that implicitly test execution mode behavior. Some tests in that block verify what DOES happen in execution mode by contrasting with observer mode.
**How to avoid:** Review each `EXEC-04` test individually. Keep tests that verify "execute\* IS called when mode is execution" by converting them to non-mode-toggling tests. Only delete tests that exclusively test the observer mode toggle behavior.

### Pitfall 2: `isRestoringState` removal breaks background restoration test

**What goes wrong:** `backgroundRestoration.integration.test.ts` "should not display stale chapter after foreground restoration" relies on the current `isRestoringState` mechanism preventing chapter updates. If we change the guard to `isLoadingTrack` without updating the test setup, the test passes for the wrong reason or fails.
**How to avoid:** After removing `isRestoringState`, update the test to use `_setTrackLoading(true)` instead of `setIsRestoringState(true)` in the test setup. The behavior must be identical.

### Pitfall 3: BGS chapter detection removal causes lock screen chapter not updating

**What goes wrong:** BGS `handlePlaybackProgressUpdated` is the only thing calling `store.updateNowPlayingMetadata()` on chapter transitions today. If we remove those calls before coordinator chapter detection is in place, lock screen chapter titles stop updating.
**How to avoid:** Implement coordinator chapter detection in `syncPositionToStore` FIRST, write a test proving it fires on chapter changes, then remove the BGS calls. The CLEAN-03 dependency order is: coordinator chapter detection → isRestoringState removal → BGS cleanup.

### Pitfall 4: `syncPositionToStore` chapter detection fires every tick instead of debouncing

**What goes wrong:** `store.player.currentChapter` updates every time `_updateCurrentChapter` runs (every position tick). If the coordinator reads it every tick and compares against `lastSyncedChapterId` but the comparison is done before `updatePosition` propagates through Zustand, the chapter read is stale.
**How to avoid:** Read `store.player.currentChapter` AFTER calling `store.updatePosition()`. Zustand's `set()` is synchronous within the same call, so `updatePosition()` → `_updateCurrentChapter()` → chapter in store — all before the next line in `syncPositionToStore`. The existing PROP-06 pattern in `syncStateToStore` already does this correctly; the same approach works in `syncPositionToStore`.

### Pitfall 5: Periodic now playing updates setting silently disappears

**What goes wrong:** Removing the `getPeriodicNowPlayingUpdatesEnabled` check from BGS means that feature no longer exists. Users who had it enabled won't notice a change, but it becomes a dead settings key.
**How to avoid:** The coordinator's per-tick chapter-change debounce effectively replaces periodic updates. Document in the commit message that this setting is superseded. The setting UI (if any) can be removed in a later pass, but there's no correctness issue leaving the setting key orphaned.

## Code Examples

### Chapter Detection in Coordinator syncPositionToStore

```typescript
// Source: Derived from existing PROP-06 pattern in syncStateToStore (PlayerStateCoordinator.ts:765-770)
private syncPositionToStore(): void {
  try {
    const store = useAppStore.getState();
    store.updatePosition(this.context.position); // triggers _updateCurrentChapter synchronously

    // Detect chapter boundary crossings; debounced by lastSyncedChapterId (PROP-06)
    const currentChapterId = store.player.currentChapter?.chapter?.id?.toString() ?? null;
    if (currentChapterId !== null && currentChapterId !== this.lastSyncedChapterId) {
      this.lastSyncedChapterId = currentChapterId;
      store.updateNowPlayingMetadata().catch((err) => {
        log.error("[Coordinator] Failed to update now playing metadata on chapter change", err);
      });
    }
  } catch {
    return; // BGS headless context guard (PROP-05)
  }
}
```

### isRestoringState replacement in \_updateCurrentChapter

```typescript
// Source: playerSlice.ts _updateCurrentChapter (lines 479-538)
// Replace isRestoringState check with isLoadingTrack check:
_updateCurrentChapter: (position: number) => {
  const state = get() as PlayerSlice;
  const { currentTrack, currentChapter, loading } = state.player;

  // Skip chapter updates while track is loading (prevents position-0 chapter during queue rebuild)
  // Previously guarded by isRestoringState; now uses coordinator-managed isLoadingTrack (CLEAN-03)
  if (loading.isLoadingTrack) {
    return;
  }
  // ... rest of method unchanged
};
```

### observerMode deletion in handleEvent

```typescript
// Source: PlayerStateCoordinator.ts lines 293-308 (current)
// After deletion: always execute (remove the if (!this.observerMode) wrapper)
if (validation.allowed) {
  if (nextState && nextState !== currentState) {
    log.info(`[Coordinator] Transition: ${currentState} --[${event.type}]--> ${nextState}`);
    this.metrics.stateTransitionCount++;
    this.context.previousState = currentState;
    this.context.currentState = nextState;
  }
  // Always execute (observerMode removed)
  await this.executeTransition(event, nextState);
  if (event.type === "NATIVE_PROGRESS_UPDATED") {
    this.syncPositionToStore();
  } else {
    this.syncStateToStore(event);
  }
}
```

## State of the Art

| Old Pattern                                  | Phase 5 Pattern                                      | Rationale                                                                                         |
| -------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| BGS detects chapter changes                  | Coordinator detects chapter in syncPositionToStore   | Single source of truth for native sync                                                            |
| PlayerService.reconcileTrackPlayerState()    | Coordinator bridge is always in sync                 | Serial queue + bridge eliminates reconciliation need                                              |
| observerMode toggle for rollback             | Coordinator always in execution mode                 | Migration proven; no rollback path needed                                                         |
| isRestoringState prevents premature chapters | isLoadingTrack prevents premature positions          | Coordinator-managed flag replaces playerSlice-local flag                                          |
| startSessionLocks mutex                      | BGS existingSession guard + coordinator serial queue | Coordinator queue serializes coordinator-originated calls; BGS guard handles BGS-originated calls |

## Open Questions

1. **syncPositionFromDatabase: delete or simplify?**
   - What we know: called from `_layout.tsx` (after server progress fetch) and `LibraryItemDetail.tsx` (after unfinish); both callers are out of scope files
   - What's unclear: whether dispatching `POSITION_RECONCILED` from `_layout.tsx` directly achieves the same effect (seeking TrackPlayer to the new position requires coordinator to call `executeSeek`)
   - Recommendation: Simplify to dispatch `SEEK` + `POSITION_RECONCILED` via coordinator rather than delete. This preserves the caller contracts without the 57-line implementation.

2. **`reconnectBackgroundService` in PlayerService — keep or delete?**
   - What we know: 99 lines; handles hot-reload/app-update reconnection; called in commented-out code in `_layout.tsx` (line 170)
   - What's unclear: whether it's still needed in production
   - Recommendation: RETAIN. It's not dead code per se (the comment says the call was disabled, not that the feature is dead). It does real work (clears module cache, re-registers playback service). Not a migration artifact.

3. **Can `restorePlayerServiceFromSession` be simplified?**
   - What we know: ~94 lines; builds a full PlayerTrack from DB; only called from `index.ts`
   - What's unclear: whether coordinator's `RESTORE_STATE` event (dispatched by playerSlice.restorePersistedState) can replace this
   - Recommendation: Out of scope for current phase unless it contributes to hitting the 1,100-line target. Flag for future simplification.

## Sources

### Primary (HIGH confidence)

- Direct code audit of all five target files — all findings are from first-party source code
- `src/services/PlayerService.ts` (1,496 lines) — audited fully
- `src/services/PlayerBackgroundService.ts` (1,004 lines) — audited fully
- `src/services/ProgressService.ts` (1,215 lines) — audited fully
- `src/services/coordinator/PlayerStateCoordinator.ts` (1,030 lines) — audited fully
- `src/stores/slices/playerSlice.ts` (738 lines) — audited fully
- `src/services/coordinator/transitions.ts` — audited for state machine definition
- `src/app/_layout.tsx` — audited for external callers
- `src/index.ts` — audited for external callers

### Secondary (MEDIUM confidence)

- Test file analysis (`PlayerStateCoordinator.test.ts` 2,734 lines, `PlayerService.test.ts` 845 lines, integration tests) — sampled for coverage gaps
- `src/__tests__/mocks/services.ts` — checked for mock surface area

## Metadata

**Confidence breakdown:**

- Flag identification: HIGH — all flags directly audited in source
- Line count estimates: HIGH — manually counted from line numbers
- Session mutex risk: MEDIUM — race condition analysis is logical but not empirically verified
- Chapter detection move: HIGH — mechanism is clear from existing PROP-06 pattern
- Integration test gaps: HIGH — sampled test file confirms full-lifecycle-with-seek is missing
- syncPositionFromDatabase disposition: MEDIUM — callers are out of scope; disposition depends on planner's call about touching \_layout.tsx

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (stable codebase, 30-day window)
