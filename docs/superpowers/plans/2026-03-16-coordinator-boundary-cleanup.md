# Coordinator Boundary Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all coordinator imports from collaborators — making them pure executors with no state machine awareness — by moving all decision logic into the coordinator.

**Architecture:** Four changes: (1) `reloadTrackPlayerQueue` becomes a pure `executeRebuildQueue` function (no events, no state check); (2) coordinator dispatches PLAY after load via `playIntentOnLoad` context flag; (3) coordinator handles "already playing same item" short-circuit instead of TrackLoadingCollaborator; (4) coordinator performs inline queue rebuild when `queueStatus === 'unknown'` instead of PlaybackControlCollaborator delegating to ProgressRestoreCollaborator.

**Tech Stack:** TypeScript, Jest, react-native-track-player, Zustand, async-lock

---

## File Map

**Modified:**

- `src/types/coordinator.ts` — add `playIntentOnLoad` and `queueStatus` to `StateContext`
- `src/services/player/types.ts` — update `IPlayerServiceFacade`, `ITrackLoadingCollaborator`, `IProgressRestoreCollaborator`
- `src/services/PlayerService.ts` — add `executeRebuildQueue`, `resolveCanonicalPosition`; remove `rebuildCurrentTrackIfNeeded`
- `src/services/player/TrackLoadingCollaborator.ts` — remove coordinator imports; rename `reloadTrackPlayerQueue` → `executeRebuildQueue` (pure); remove short-circuit from `executeLoadTrack`; remove PLAY dispatch; use `facade.resolveCanonicalPosition`
- `src/services/player/PlaybackControlCollaborator.ts` — remove `facade.rebuildCurrentTrackIfNeeded()` call from `executePlay`
- `src/services/player/ProgressRestoreCollaborator.ts` — remove `rebuildCurrentTrackIfNeeded` method; remove `getCoordinator` import
- `src/services/coordinator/PlayerStateCoordinator.ts` — add `playIntentOnLoad`/`queueStatus` to `createInitialContext` and `updateContextFromEvent`; add Change 2/3/4 logic to `executeTransition`

**Test files modified:**

- `src/services/__tests__/TrackLoadingCollaborator.test.ts` — remove coordinator mock; update/add tests
- `src/services/__tests__/PlaybackControlCollaborator.test.ts` — remove `rebuildCurrentTrackIfNeeded` from facade mock and tests
- `src/services/__tests__/ProgressRestoreCollaborator.test.ts` — remove `rebuildCurrentTrackIfNeeded` tests and coordinator mock
- `src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts` — add `executeRebuildQueue`/`resolveCanonicalPosition` to mock; add 4 new test groups; fix EXEC-03 pre-load

---

## Chunk 1: Types and Interfaces

### Task 1: Add `playIntentOnLoad` and `queueStatus` to `StateContext`

**Files:**

- Modify: `src/types/coordinator.ts`

- [ ] **Step 1: Add fields to `StateContext`**

In `StateContext` interface, add after `isLoadingTrack`:

```typescript
/** Set true when LOAD_TRACK arrives; cleared on PAUSE, error, or STOP.
 *  Coordinator uses this to dispatch PLAY after executeLoadTrack completes. */
playIntentOnLoad: boolean;

/** Whether the TrackPlayer queue is known to be populated and valid.
 *  'unknown' after RESTORE_STATE or STOP (queue may have been cleared by OS/BGS).
 *  'valid' after QUEUE_RELOADED (coordinator just rebuilt and confirmed the queue). */
queueStatus: "unknown" | "valid";
```

- [ ] **Step 2: Compile check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: errors only about fields not yet initialized (coordinator.ts). Accept this — next task adds them.

- [ ] **Step 3: Commit**

```bash
git add src/types/coordinator.ts
git commit -m "feat(coordinator): add playIntentOnLoad and queueStatus to StateContext"
```

---

### Task 2: Update `IPlayerServiceFacade` and collaborator interfaces

**Files:**

- Modify: `src/services/player/types.ts`

- [ ] **Step 1: Update `IPlayerServiceFacade`**

Replace the existing `rebuildCurrentTrackIfNeeded` declaration and add new methods. Find:

```typescript
  rebuildCurrentTrackIfNeeded(): Promise<boolean>;
```

Replace with:

```typescript
  /**
   * Rebuild the TrackPlayer queue for the given track.
   * Pure execution: resets queue, builds track list, resolves position.
   * Called only by the coordinator from executeTransition. Throws on failure.
   */
  executeRebuildQueue(track: PlayerTrack): Promise<ResumePositionInfo>;

  /**
   * Resolve the canonical resume position for a library item.
   * Delegates to coordinator.resolveCanonicalPosition() without exposing coordinator.
   */
  resolveCanonicalPosition(libraryItemId: string): Promise<ResumePositionInfo>;
```

- [ ] **Step 2: Update `ITrackLoadingCollaborator`**

Find:

```typescript
  reloadTrackPlayerQueue(track: PlayerTrack): Promise<boolean>;
```

Replace with:

```typescript
  executeRebuildQueue(track: PlayerTrack): Promise<ResumePositionInfo>;
```

- [ ] **Step 3: Add `ResumePositionInfo` import**

Add `ResumePositionInfo` to the import from `@/types/coordinator`:

```typescript
import type { PlayerEvent, ResumePositionInfo } from "@/types/coordinator";
```

- [ ] **Step 4: Remove `rebuildCurrentTrackIfNeeded` from `IProgressRestoreCollaborator`**

Find:

```typescript
  rebuildCurrentTrackIfNeeded(): Promise<boolean>;
```

Delete this line.

- [ ] **Step 5: Compile check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: errors about unimplemented interface members in collaborator/service files — acceptable, next tasks implement them.

- [ ] **Step 6: Commit**

```bash
git add src/services/player/types.ts
git commit -m "refactor(coordinator-boundary): update IPlayerServiceFacade and collaborator interfaces"
```

---

## Chunk 2: Collaborator and Facade Changes

### Task 3: Update `PlayerService` facade

**Files:**

- Modify: `src/services/PlayerService.ts`

- [ ] **Step 1: Add imports**

Add `ResumePositionInfo` to the import from `@/types/coordinator`:

```typescript
import type { PlayerEvent, ResumePositionInfo } from "@/types/coordinator";
```

Add `PlayerTrack` import from `@/types/player`:

```typescript
import type { PlayerTrack } from "@/types/player";
```

Add `getCoordinator` import:

```typescript
import { getCoordinator } from "@/services/coordinator/PlayerStateCoordinator";
```

- [ ] **Step 2: Replace `rebuildCurrentTrackIfNeeded` with `executeRebuildQueue` and `resolveCanonicalPosition`**

Find and delete:

```typescript
  /**
   * Rebuild currentTrack if it's missing but should exist.
   * Delegates to ProgressRestoreCollaborator; exposed on facade so
   * PlaybackControlCollaborator can call it without a direct import.
   */
  async rebuildCurrentTrackIfNeeded(): Promise<boolean> {
    return this.progressRestore.rebuildCurrentTrackIfNeeded();
  }
```

Add in its place:

```typescript
  /**
   * Rebuild the TrackPlayer queue for the given track.
   * Delegates to TrackLoadingCollaborator.executeRebuildQueue (pure execution).
   * Called only by the coordinator from executeTransition.
   */
  async executeRebuildQueue(track: PlayerTrack): Promise<ResumePositionInfo> {
    return this.trackLoading.executeRebuildQueue(track);
  }

  /**
   * Resolve canonical resume position for a library item.
   * Delegates to coordinator without exposing coordinator to collaborators.
   */
  async resolveCanonicalPosition(libraryItemId: string): Promise<ResumePositionInfo> {
    return getCoordinator().resolveCanonicalPosition(libraryItemId);
  }
```

- [ ] **Step 3: Compile check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: errors that `this.trackLoading.executeRebuildQueue` does not exist (TrackLoadingCollaborator still has the old name until Task 4) and ProgressRestoreCollaborator still has `rebuildCurrentTrackIfNeeded`. Both are known transient gaps — acceptable, resolved in Tasks 4–6.

- [ ] **Step 4: Commit**

```bash
git add src/services/PlayerService.ts
git commit -m "refactor(coordinator-boundary): add executeRebuildQueue and resolveCanonicalPosition to PlayerService facade"
```

---

### Task 4 (Change 1): TDD — rename `reloadTrackPlayerQueue` → `executeRebuildQueue` in `TrackLoadingCollaborator`

**Files:**

- Modify: `src/services/__tests__/TrackLoadingCollaborator.test.ts`
- Modify: `src/services/player/TrackLoadingCollaborator.ts`

- [ ] **Step 1: Write failing tests for `executeRebuildQueue`**

In `src/services/__tests__/TrackLoadingCollaborator.test.ts`:

1. Remove the entire `jest.mock("@/services/coordinator/PlayerStateCoordinator", ...)` block and the `__mockResolveCanonicalPosition`, `__mockGetState` variable declarations and usages in `beforeEach`.

2. Add `resolveCanonicalPosition: jest.fn()` to `mockFacade` in the `beforeEach`:

```typescript
mockFacade = {
  dispatchEvent: jest.fn(),
  getApiInfo: jest.fn().mockReturnValue({ baseUrl: "http://test", accessToken: "tok123" }),
  getInitializationTimestamp: jest.fn().mockReturnValue(Date.now()),
  executeRebuildQueue: jest.fn(),
  resolveCanonicalPosition: jest.fn().mockResolvedValue({
    position: 0,
    source: "store",
    authoritativePosition: null,
    asyncStoragePosition: null,
  }),
};
```

3. Find and delete the `describe("reloadTrackPlayerQueue", ...)` block entirely (it tests the old API).

4. Add a new `describe("executeRebuildQueue", ...)` block after `describe("executeLoadTrack", ...)`:

```typescript
describe("executeRebuildQueue", () => {
  const mockTrack: any = {
    libraryItemId: "item-1",
    mediaId: "media-1",
    title: "Test Book",
    author: "Test Author",
    coverUri: "http://example.com/cover.jpg",
    audioFiles: mockAudioFiles,
    chapters: mockChapters,
    duration: 3600,
    isDownloaded: true,
  };

  it("resets queue, builds track list, and returns ResumePositionInfo", async () => {
    const resumeInfo = await collaborator.executeRebuildQueue(mockTrack);

    expect(mockedTrackPlayer.reset).toHaveBeenCalled();
    expect(mockedTrackPlayer.add).toHaveBeenCalled();
    expect(resumeInfo).toEqual({
      position: 0,
      source: "store",
      authoritativePosition: null,
      asyncStoragePosition: null,
    });
  });

  it("seeks to resume position when position > 0", async () => {
    (mockFacade.resolveCanonicalPosition as jest.Mock).mockResolvedValue({
      position: 300,
      source: "activeSession",
      authoritativePosition: 300,
      asyncStoragePosition: null,
    });

    await collaborator.executeRebuildQueue(mockTrack);

    expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(300);
  });

  it("does not seek when position is 0", async () => {
    await collaborator.executeRebuildQueue(mockTrack);

    expect(mockedTrackPlayer.seekTo).not.toHaveBeenCalled();
  });

  it("throws when no playable tracks found", async () => {
    verifyFileExists.mockResolvedValue(false);

    await expect(collaborator.executeRebuildQueue(mockTrack)).rejects.toThrow(
      "No playable sources found"
    );
  });

  it("does not call dispatchEvent (pure execution)", async () => {
    await collaborator.executeRebuildQueue(mockTrack);

    expect(mockFacade.dispatchEvent).not.toHaveBeenCalled();
  });

  it("calls facade.resolveCanonicalPosition instead of coordinator directly", async () => {
    await collaborator.executeRebuildQueue(mockTrack);

    expect(mockFacade.resolveCanonicalPosition).toHaveBeenCalledWith("item-1");
  });

  it("applies playback rate from store when non-default", async () => {
    mockStore.player.playbackRate = 1.5;
    await collaborator.executeRebuildQueue(mockTrack);
    expect(mockedTrackPlayer.setRate).toHaveBeenCalledWith(1.5);
  });

  it("does not apply playback rate when 1.0 (default)", async () => {
    mockStore.player.playbackRate = 1.0;
    await collaborator.executeRebuildQueue(mockTrack);
    expect(mockedTrackPlayer.setRate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
jest src/services/__tests__/TrackLoadingCollaborator.test.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `executeRebuildQueue` not a function on `TrackLoadingCollaborator`.

- [ ] **Step 3: Implement `executeRebuildQueue` in `TrackLoadingCollaborator`**

In `src/services/player/TrackLoadingCollaborator.ts`:

1. Remove these imports at the top:

```typescript
import { getCoordinator } from "@/services/coordinator/PlayerStateCoordinator";
import { PlayerState } from "@/types/coordinator";
```

2. Add `ResumePositionInfo` to the coordinator types import (keep it since it's used for return type). Actually add a new import:

```typescript
import type { ResumePositionInfo } from "@/types/coordinator";
```

3. Replace the entire `reloadTrackPlayerQueue` method with `executeRebuildQueue`:

```typescript
  /**
   * Rebuild TrackPlayer queue for the given track (pure execution).
   * No coordinator imports, no event dispatches, throws on failure.
   * Called only by the coordinator via IPlayerServiceFacade.executeRebuildQueue.
   */
  async executeRebuildQueue(track: PlayerTrack): Promise<ResumePositionInfo> {
    await TrackPlayer.reset();

    const tracks = await this.buildTrackList(track);
    if (tracks.length === 0) {
      log.warn(`No playable sources found while rebuilding queue for ${track.libraryItemId}`);
      throw new Error(
        `No playable sources found while rebuilding queue for ${track.libraryItemId}`
      );
    }

    await TrackPlayer.add(tracks);

    const resumeInfo = await this.facade.resolveCanonicalPosition(track.libraryItemId);

    if (resumeInfo.position > 0) {
      await TrackPlayer.seekTo(resumeInfo.position);
      log.info(
        `Prepared resume position from ${resumeInfo.source}: ${formatTime(resumeInfo.position)}s`
      );
      const store = useAppStore.getState();
      store._updateCurrentChapter(resumeInfo.position);
    } else {
      log.info("Prepared queue with no resume position (starting from beginning)");
    }

    const store = useAppStore.getState();
    if (store.player.playbackRate !== 1.0) {
      await TrackPlayer.setRate(store.player.playbackRate);
      log.info(`Applied stored playback rate: ${store.player.playbackRate}`);
    }

    if (store.player.volume !== 1.0) {
      await TrackPlayer.setVolume(store.player.volume);
      log.info(`Applied stored volume: ${store.player.volume}`);
    }

    return resumeInfo;
  }
```

> **Note on the old `finally` block:** `reloadTrackPlayerQueue` had `finally { if (!success) store._setTrackLoading(false); }`. This is intentionally dropped. `executeRebuildQueue` is pure — it throws on failure and has no store side-effects. The coordinator owns loading state cleanup via `updateContextFromEvent` and its own error handling.

- [ ] **Step 4: Run tests to verify new tests pass**

```bash
jest src/services/__tests__/TrackLoadingCollaborator.test.ts --no-coverage 2>&1 | tail -20
```

Expected: All `executeRebuildQueue` tests PASS. Some `executeLoadTrack` tests may still fail (addressed in Task 5).

- [ ] **Step 5: Commit**

```bash
git add src/services/player/TrackLoadingCollaborator.ts src/services/__tests__/TrackLoadingCollaborator.test.ts
git commit -m "refactor(coordinator-boundary): rename reloadTrackPlayerQueue to executeRebuildQueue (pure execution, no coordinator imports)"
```

---

### Task 5 (Change 3): Remove "already playing" short-circuit and PLAY dispatch from `executeLoadTrack`

**Files:**

- Modify: `src/services/player/TrackLoadingCollaborator.ts`
- Modify: `src/services/__tests__/TrackLoadingCollaborator.test.ts`

- [ ] **Step 1: Update tests first**

In `src/services/__tests__/TrackLoadingCollaborator.test.ts`:

1. Delete these two test cases (they test behavior moving to the coordinator):
   - `"dispatches PLAY and skips reload if same item is already playing with queue"`
   - `"dispatches PLAY and skips reload if same item is paused with queue"`

2. Update the main test `"loads a track, builds queue, and dispatches PLAY via facade"`:

```typescript
it("loads a track, builds queue, and does NOT dispatch PLAY (coordinator handles it)", async () => {
  await collaborator.executeLoadTrack("item-1");

  expect(getLibraryItemById).toHaveBeenCalledWith("item-1");
  expect(getMediaMetadataByLibraryItemId).toHaveBeenCalledWith("item-1");
  expect(getAudioFilesWithDownloadInfo).toHaveBeenCalled();
  expect(mockedTrackPlayer.reset).toHaveBeenCalled();
  expect(mockedTrackPlayer.add).toHaveBeenCalled();
  // Coordinator handles PLAY dispatch — collaborator must NOT dispatch it
  expect(mockFacade.dispatchEvent).not.toHaveBeenCalledWith({ type: "PLAY" });
});
```

3. Add a test verifying `facade.resolveCanonicalPosition` is used (not coordinator directly):

```typescript
it("calls facade.resolveCanonicalPosition to determine resume position", async () => {
  (mockFacade.resolveCanonicalPosition as jest.Mock).mockResolvedValue({
    position: 120,
    source: "activeSession",
    authoritativePosition: 120,
    asyncStoragePosition: null,
  });

  await collaborator.executeLoadTrack("item-1");

  expect(mockFacade.resolveCanonicalPosition).toHaveBeenCalledWith("item-1");
  expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(120);
});
```

- [ ] **Step 2: Run tests to verify new test fails**

```bash
jest src/services/__tests__/TrackLoadingCollaborator.test.ts --no-coverage -t "does NOT dispatch PLAY" 2>&1 | tail -10
```

Expected: FAIL — collaborator currently dispatches PLAY at the end.

- [ ] **Step 3: Clean up `executeLoadTrack`**

In `src/services/player/TrackLoadingCollaborator.ts`:

1. Remove the "Check if already playing this item" block (lines ~80–101):

```typescript
// Check if already playing this item - if so, just resume
const store = useAppStore.getState();
if (store.player.currentTrack?.libraryItemId === libraryItemId) {
  const state = await TrackPlayer.getPlaybackState();
  const queue = await TrackPlayer.getQueue();

  // Only short-circuit if we actually have tracks in the queue
  if (queue.length > 0) {
    if (state.state === State.Playing) {
      log.info("Already playing this item - syncing coordinator state");
      this.facade.dispatchEvent({ type: "PLAY" });
      return;
    } else if (state.state === State.Paused) {
      log.info("Resuming paused playback via coordinator");
      this.facade.dispatchEvent({ type: "PLAY" });
      return;
    }
  } else {
    // Queue is empty even though we have a currentTrack - need to reload
    log.warn("Current track set but queue is empty - reloading track");
  }
}
```

The first `const store = useAppStore.getState();` line moves down to after the data fetching block (it's already used there).

2. Replace the coordinator call at lines ~187–188:

```typescript
const coordinator = getCoordinator();
const resumeInfo = await coordinator.resolveCanonicalPosition(libraryItemId);
```

With:

```typescript
const resumeInfo = await this.facade.resolveCanonicalPosition(libraryItemId);
```

3. Remove the `this.facade.dispatchEvent({ type: "PLAY" })` call and the comment before it near the end of `executeLoadTrack` (around line 212–215):

```typescript
// Dispatch PLAY so the coordinator transitions to PLAYING and calls executePlay().
this.facade.dispatchEvent({ type: "PLAY" });

log.info("Track loaded, PLAY dispatched to coordinator");
```

Replace with:

```typescript
log.info("Track loaded, returning to coordinator");
```

4. Remove the now-unused `State` import from react-native-track-player if only used in the short-circuit block. Check imports:

```typescript
import TrackPlayer, { State, Track } from "react-native-track-player";
```

Change to:

```typescript
import TrackPlayer, { Track } from "react-native-track-player";
```

(Only if `State` is no longer used elsewhere in the file.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
jest src/services/__tests__/TrackLoadingCollaborator.test.ts --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/player/TrackLoadingCollaborator.ts src/services/__tests__/TrackLoadingCollaborator.test.ts
git commit -m "refactor(coordinator-boundary): remove PLAY dispatch and short-circuit from executeLoadTrack"
```

---

### Task 6 (Change 4a): Remove `rebuildCurrentTrackIfNeeded` from `ProgressRestoreCollaborator`

**Files:**

- Modify: `src/services/player/ProgressRestoreCollaborator.ts`
- Modify: `src/services/__tests__/ProgressRestoreCollaborator.test.ts`

- [ ] **Step 1: Update tests**

In `src/services/__tests__/ProgressRestoreCollaborator.test.ts`:

1. Remove the entire `describe("rebuildCurrentTrackIfNeeded", ...)` block (it's the method being deleted).

2. Remove the `jest.mock("@/services/coordinator/PlayerStateCoordinator", ...)` block entirely.

3. Remove `getCoordinator` references from `require` statements in the test file.

4. In `mockFacade`, remove `rebuildCurrentTrackIfNeeded` from the facade mock (it's no longer on the interface).

- [ ] **Step 2: Run tests to verify they still pass (and the deleted tests are gone)**

```bash
jest src/services/__tests__/ProgressRestoreCollaborator.test.ts --no-coverage 2>&1 | tail -20
```

Expected: PASS (the deleted tests are simply gone).

- [ ] **Step 3: Remove `rebuildCurrentTrackIfNeeded` from `ProgressRestoreCollaborator`**

In `src/services/player/ProgressRestoreCollaborator.ts`:

1. Remove the import:

```typescript
import { getCoordinator } from "@/services/coordinator/PlayerStateCoordinator";
```

2. Delete the entire `rebuildCurrentTrackIfNeeded()` method (lines ~278–341).

- [ ] **Step 4: Run tests to verify they pass**

```bash
jest src/services/__tests__/ProgressRestoreCollaborator.test.ts --no-coverage 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Compile check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: Errors about PlaybackControlCollaborator calling non-existent `facade.rebuildCurrentTrackIfNeeded` — addressed in Task 7.

- [ ] **Step 6: Commit**

```bash
git add src/services/player/ProgressRestoreCollaborator.ts src/services/__tests__/ProgressRestoreCollaborator.test.ts
git commit -m "refactor(coordinator-boundary): remove rebuildCurrentTrackIfNeeded from ProgressRestoreCollaborator"
```

---

### Task 7 (Change 4b): Remove `rebuildCurrentTrackIfNeeded` from `PlaybackControlCollaborator.executePlay`

**Files:**

- Modify: `src/services/player/PlaybackControlCollaborator.ts`
- Modify: `src/services/__tests__/PlaybackControlCollaborator.test.ts`

- [ ] **Step 1: Update tests first**

In `src/services/__tests__/PlaybackControlCollaborator.test.ts`:

1. Remove `rebuildCurrentTrackIfNeeded` from the `mockFacade` object. Change:

```typescript
mockFacade = {
  dispatchEvent: jest.fn(),
  getApiInfo: jest.fn().mockReturnValue({ baseUrl: "http://test", accessToken: "tok123" }),
  getInitializationTimestamp: jest.fn().mockReturnValue(Date.now()),
  rebuildCurrentTrackIfNeeded: jest.fn().mockResolvedValue(true),
};
```

To:

```typescript
mockFacade = {
  dispatchEvent: jest.fn(),
  getApiInfo: jest.fn().mockReturnValue({ baseUrl: "http://test", accessToken: "tok123" }),
  getInitializationTimestamp: jest.fn().mockReturnValue(Date.now()),
  executeRebuildQueue: jest.fn(),
  resolveCanonicalPosition: jest.fn(),
};
```

2. Replace the two existing executePlay tests:

Delete:

```typescript
it("calls facade.rebuildCurrentTrackIfNeeded then TrackPlayer.play", async () => {
  ...
  expect(mockFacade.rebuildCurrentTrackIfNeeded).toHaveBeenCalled();
  ...
});

it("does not call TrackPlayer.play when rebuildCurrentTrackIfNeeded returns false", async () => {
  (mockFacade.rebuildCurrentTrackIfNeeded as jest.Mock).mockResolvedValue(false);
  ...
});
```

Add:

```typescript
it("applies smart rewind and calls TrackPlayer.play", async () => {
  await collaborator.executePlay();

  expect(applySmartRewind).toHaveBeenCalled();
  expect(mockedTrackPlayer.play).toHaveBeenCalled();
});

it("does not call facade.rebuildCurrentTrackIfNeeded (coordinator handles queue rebuild)", async () => {
  await collaborator.executePlay();

  expect(mockFacade).not.toHaveProperty("rebuildCurrentTrackIfNeeded");
});
```

- [ ] **Step 2: Run tests to verify the new test fails**

```bash
jest src/services/__tests__/PlaybackControlCollaborator.test.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `executePlay` currently calls `facade.rebuildCurrentTrackIfNeeded`.

- [ ] **Step 3: Remove `rebuildCurrentTrackIfNeeded` call from `executePlay`**

In `src/services/player/PlaybackControlCollaborator.ts`, replace:

```typescript
  async executePlay(): Promise<void> {
    const prepared = await this.facade.rebuildCurrentTrackIfNeeded();
    if (!prepared) {
      log.warn("Playback request ignored: no track available after restoration");
      return;
    }

    try {
      const store = useAppStore.getState();
      // Apply smart rewind (checks enabled setting internally)
      await applySmartRewind();
      // Clear pause time since we're resuming
      store._setLastPauseTime(null);
      await TrackPlayer.play();
    } catch (error) {
      const store = useAppStore.getState();
      store._setTrackLoading(false);
      throw error;
    }
  }
```

With:

```typescript
  async executePlay(): Promise<void> {
    try {
      const store = useAppStore.getState();
      // Apply smart rewind (checks enabled setting internally)
      await applySmartRewind();
      // Clear pause time since we're resuming
      store._setLastPauseTime(null);
      await TrackPlayer.play();
    } catch (error) {
      const store = useAppStore.getState();
      store._setTrackLoading(false);
      throw error;
    }
  }
```

Also update the JSDoc comment at the top of `executePlay`:

```typescript
/**
 * Execute play (Internal - Called by Coordinator).
 * Applies smart rewind, then starts playback.
 * Queue rebuild (if needed) is handled by the coordinator before calling this method.
 */
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
jest src/services/__tests__/PlaybackControlCollaborator.test.ts --no-coverage 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Compile check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: Errors about `playIntentOnLoad`/`queueStatus` not in `createInitialContext` — addressed in Chunk 3.

- [ ] **Step 6: Commit**

```bash
git add src/services/player/PlaybackControlCollaborator.ts src/services/__tests__/PlaybackControlCollaborator.test.ts
git commit -m "refactor(coordinator-boundary): remove rebuildCurrentTrackIfNeeded from executePlay (coordinator handles queue rebuild)"
```

---

## Chunk 3: Coordinator New Behaviors

### Task 8: Initialize `playIntentOnLoad`/`queueStatus` in coordinator and wire `updateContextFromEvent`

**Files:**

- Modify: `src/services/coordinator/PlayerStateCoordinator.ts`
- Modify: `src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts`

- [ ] **Step 1: Write failing tests for context field initialization and updates**

In `src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts`:

1. Add `executeRebuildQueue` and `resolveCanonicalPosition` to the `mockInstance` in the module-level mock:

```typescript
jest.mock("../../PlayerService", () => {
  const { jest } = require("@jest/globals");
  const mockInstance = {
    executeLoadTrack: jest.fn(),
    executePlay: jest.fn(),
    executePause: jest.fn(),
    executeStop: jest.fn(),
    executeSeek: jest.fn(),
    executeSetRate: jest.fn(),
    executeSetVolume: jest.fn(),
    executeRebuildQueue: jest.fn().mockResolvedValue({
      position: 0,
      source: "store",
      authoritativePosition: null,
      asyncStoragePosition: null,
    }),
    resolveCanonicalPosition: jest.fn().mockResolvedValue({
      position: 0,
      source: "store",
      authoritativePosition: null,
      asyncStoragePosition: null,
    }),
  };
  return {
    PlayerService: {
      getInstance: jest.fn(() => mockInstance),
      resetInstance: jest.fn(),
    },
  };
});
```

2. In the `"context updates from events"` describe block, add new tests:

```typescript
it("should initialize playIntentOnLoad=false and queueStatus='unknown' in fresh context", () => {
  const context = coordinator.getContext();
  expect(context.playIntentOnLoad).toBe(false);
  expect(context.queueStatus).toBe("unknown");
});

it("should set playIntentOnLoad=true on LOAD_TRACK", async () => {
  await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "item-1" } });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const context = coordinator.getContext();
  expect(context.playIntentOnLoad).toBe(true);
});

it("should clear playIntentOnLoad=false on PAUSE (even if rejected during LOADING)", async () => {
  // LOAD_TRACK → LOADING (sets playIntentOnLoad=true)
  await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "item-1" } });
  // PAUSE is rejected from LOADING, but updateContextFromEvent still runs
  await coordinator.dispatch({ type: "PAUSE" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const context = coordinator.getContext();
  expect(context.playIntentOnLoad).toBe(false);
});

it("should clear playIntentOnLoad on STOP", async () => {
  await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "item-1" } });
  await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
  await coordinator.dispatch({ type: "PLAY" });
  await coordinator.dispatch({ type: "STOP" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const context = coordinator.getContext();
  expect(context.playIntentOnLoad).toBe(false);
});

it("should set queueStatus='unknown' on RESTORE_STATE", async () => {
  // First set to valid state
  await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "item-1" } });
  await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(coordinator.getContext().queueStatus).toBe("valid");

  // Now restore state — should reset to unknown
  await coordinator.dispatch({
    type: "RESTORE_STATE",
    payload: {
      state: {
        currentTrack: null,
        position: 0,
        playbackRate: 1,
        volume: 1,
        isPlaying: false,
        currentPlaySessionId: null,
      },
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(coordinator.getContext().queueStatus).toBe("unknown");
});

it("should set queueStatus='valid' on QUEUE_RELOADED", async () => {
  await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "item-1" } });
  await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(coordinator.getContext().queueStatus).toBe("valid");
});

it("should set queueStatus='unknown' on STOP", async () => {
  await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "item-1" } });
  await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
  await coordinator.dispatch({ type: "PLAY" });
  await coordinator.dispatch({ type: "STOP" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(coordinator.getContext().queueStatus).toBe("unknown");
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
jest src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts --no-coverage -t "playIntentOnLoad|queueStatus" 2>&1 | tail -20
```

Expected: FAIL — fields not on context.

- [ ] **Step 3: Add fields to `createInitialContext`**

In `src/services/coordinator/PlayerStateCoordinator.ts`, find `createInitialContext()` and add:

```typescript
  private createInitialContext(): StateContext {
    return {
      currentState: PlayerState.IDLE,
      previousState: null,
      currentTrack: null,
      position: 0,
      duration: 0,
      playbackRate: 1,
      volume: 1,
      sessionId: null,
      sessionStartTime: null,
      lastPositionUpdate: 0,
      currentChapter: null,
      isPlaying: false,
      isBuffering: false,
      isSeeking: false,
      preSeekState: null,
      isLoadingTrack: false,
      playIntentOnLoad: false,
      queueStatus: "unknown",
      lastServerSync: null,
      pendingSyncPosition: null,
      lastError: null,
    };
  }
```

- [ ] **Step 4: Add `playIntentOnLoad` and `queueStatus` updates to `updateContextFromEvent`**

In `updateContextFromEvent`, update existing cases and add new ones:

1. Update `case "LOAD_TRACK":`:

```typescript
      case "LOAD_TRACK":
        this.context.isLoadingTrack = true;
        this.context.playIntentOnLoad = true;
        break;
```

2. Update `case "PAUSE":`:

```typescript
      case "PAUSE":
        this.context.isPlaying = false;
        this.context.playIntentOnLoad = false;
        break;
```

3. Update `case "STOP":`:

```typescript
      case "STOP":
        this.context.isPlaying = false;
        this.context.position = 0;
        this.context.currentTrack = null;
        this.context.sessionId = null;
        this.context.sessionStartTime = null;
        this.context.playIntentOnLoad = false;
        this.context.queueStatus = "unknown";
        break;
```

4. Update `case "RESTORE_STATE":` — add `queueStatus = 'unknown'` at the end of the case:

```typescript
      case "RESTORE_STATE": {
        const { state } = event.payload;
        this.context.currentTrack = state.currentTrack;
        this.context.position = state.position;
        this.context.playbackRate = state.playbackRate;
        this.context.volume = state.volume;
        this.context.isPlaying = state.isPlaying;
        this.context.sessionId = state.currentPlaySessionId;
        if (state.currentTrack) {
          this.context.duration = state.currentTrack.duration;
        }
        this.context.queueStatus = "unknown";
        log.debug(
          `[Coordinator] Context updated from RESTORE_STATE: position=${state.position}, track=${state.currentTrack?.title || "none"}`
        );
        break;
      }
```

5. Update `case "QUEUE_RELOADED":`:

```typescript
      case "QUEUE_RELOADED":
        this.context.isLoadingTrack = false;
        this.context.position = event.payload.position;
        this.context.queueStatus = "valid";
        log.debug(
          `[Coordinator] Context updated from QUEUE_RELOADED: position=${event.payload.position}, queueStatus=valid`
        );
        break;
```

6. Update `case "NATIVE_PLAYBACK_ERROR":` and `case "NATIVE_ERROR":` to clear `playIntentOnLoad`:

```typescript
      case "NATIVE_ERROR":
        this.context.lastError = event.payload.error;
        this.context.playIntentOnLoad = false;
        break;

      case "NATIVE_PLAYBACK_ERROR":
        this.context.lastError = new Error(`${event.payload.code}: ${event.payload.message}`);
        this.context.isLoadingTrack = false;
        this.context.playIntentOnLoad = false;
        break;
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
jest src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts --no-coverage -t "playIntentOnLoad|queueStatus" 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 6: Compile check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: Clean (or only existing errors from incomplete tasks).

- [ ] **Step 7: Commit**

```bash
git add src/services/coordinator/PlayerStateCoordinator.ts src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts
git commit -m "feat(coordinator-boundary): add playIntentOnLoad and queueStatus to coordinator context with full updateContextFromEvent wiring"
```

---

### Task 9 (Change 2): Coordinator dispatches PLAY after `executeLoadTrack` completes

**Files:**

- Modify: `src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts`
- Modify: `src/services/coordinator/PlayerStateCoordinator.ts`

- [ ] **Step 1: Write failing tests**

Add a new top-level `describe` block in `PlayerStateCoordinator.test.ts`:

```typescript
describe("Change 2: playIntentOnLoad — coordinator dispatches PLAY after executeLoadTrack", () => {
  let mockPlayerService: {
    executeLoadTrack: ReturnType<typeof jest.fn>;
    executePlay: ReturnType<typeof jest.fn>;
    executeRebuildQueue: ReturnType<typeof jest.fn>;
    resolveCanonicalPosition: ReturnType<typeof jest.fn>;
  };

  beforeEach(() => {
    const { PlayerService } = require("../../PlayerService");
    mockPlayerService = PlayerService.getInstance();
    jest.clearAllMocks();
  });

  it("dispatches PLAY after executeLoadTrack when playIntentOnLoad is true", async () => {
    const dispatchSpy = jest.spyOn(coordinator, "dispatch");

    await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "item-1" } });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // executeLoadTrack should have been called
    expect(mockPlayerService.executeLoadTrack).toHaveBeenCalledWith("item-1", undefined);

    // PLAY should have been dispatched to the coordinator (Change 2)
    const playDispatches = dispatchSpy.mock.calls.filter(([evt]: [any]) => evt.type === "PLAY");
    expect(playDispatches.length).toBeGreaterThan(0);

    dispatchSpy.mockRestore();
  });

  it("does NOT dispatch PLAY if playIntentOnLoad is cleared by PAUSE during LOADING", async () => {
    // PAUSE rejected from LOADING, but updateContextFromEvent still clears playIntentOnLoad
    const dispatchSpy = jest.spyOn(coordinator, "dispatch");

    // Dispatch LOAD_TRACK then PAUSE rapidly
    coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "item-1" } });
    // Note: PAUSE gets queued AFTER LOAD_TRACK and processed when LOAD_TRACK completes
    // updateContextFromEvent(PAUSE) runs even for rejected transitions and clears playIntentOnLoad
    coordinator.dispatch({ type: "PAUSE" });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // PLAY should NOT have been dispatched (playIntentOnLoad was cleared)
    const playDispatches = dispatchSpy.mock.calls.filter(([evt]: [any]) => evt.type === "PLAY");
    // PAUSE clears playIntentOnLoad; no PLAY dispatch
    expect(playDispatches.length).toBe(0);

    dispatchSpy.mockRestore();
  });

  it("eventually calls executePlay after executeLoadTrack (via dispatched PLAY)", async () => {
    await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "item-1" } });
    await new Promise((resolve) => setTimeout(resolve, 150));

    // After LOAD_TRACK → LOADING → auto-PLAY → PLAYING, executePlay should be called
    expect(mockPlayerService.executePlay).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
jest src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts --no-coverage -t "Change 2" 2>&1 | tail -20
```

Expected: FAIL — no PLAY dispatch after executeLoadTrack.

- [ ] **Step 3: Implement Change 2 in `executeTransition`**

In `src/services/coordinator/PlayerStateCoordinator.ts`, in the `executeTransition` method, find the `case PlayerState.LOADING:` block:

```typescript
          case PlayerState.LOADING:
            if (event.type === "LOAD_TRACK") {
              await playerService.executeLoadTrack(
                event.payload.libraryItemId,
                event.payload.episodeId
              );
            }
            break;
```

Replace with:

```typescript
          case PlayerState.LOADING:
            if (event.type === "LOAD_TRACK") {
              await playerService.executeLoadTrack(
                event.payload.libraryItemId,
                event.payload.episodeId
              );
              // Change 2: dispatch PLAY after successful load if intent is still set.
              // playIntentOnLoad is cleared if PAUSE or error arrived during LOADING.
              if (this.context.playIntentOnLoad) {
                dispatchPlayerEvent({ type: "PLAY" });
              }
            }
            break;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
jest src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts --no-coverage -t "Change 2" 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Run full coordinator test suite**

```bash
jest src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts --no-coverage 2>&1 | tail -30
```

Expected: Most pass. Note any EXEC-03 failures — they will be addressed in Task 12.

- [ ] **Step 6: Commit**

```bash
git add src/services/coordinator/PlayerStateCoordinator.ts src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts
git commit -m "feat(coordinator-boundary): coordinator dispatches PLAY after executeLoadTrack via playIntentOnLoad flag"
```

---

### Task 10 (Change 3): Coordinator short-circuits LOAD_TRACK when already PLAYING/PAUSED same item

**Files:**

- Modify: `src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts`
- Modify: `src/services/coordinator/PlayerStateCoordinator.ts`

- [ ] **Step 1: Write failing tests**

Add a new describe block:

```typescript
describe("Change 3: coordinator short-circuits LOAD_TRACK when same item already active", () => {
  let mockPlayerService: {
    executeLoadTrack: ReturnType<typeof jest.fn>;
    executePlay: ReturnType<typeof jest.fn>;
  };
  const mockTrack: any = {
    libraryItemId: "item-1",
    mediaId: "media-1",
    title: "Test",
    duration: 3600,
    audioFiles: [],
    chapters: [],
    isDownloaded: true,
  };

  beforeEach(() => {
    const { PlayerService } = require("../../PlayerService");
    mockPlayerService = PlayerService.getInstance();
    jest.clearAllMocks();
  });

  it("short-circuits executeLoadTrack and dispatches PLAY when same item is PLAYING", async () => {
    // Manually set coordinator to PLAYING state with a known track
    // Use coordinator's internal context via getContext() won't work (read-only)
    // Instead, drive coordinator to PLAYING via LOAD_TRACK → PLAY
    await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "item-1" } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Coordinator should now be PLAYING after auto-PLAY dispatch
    expect(coordinator.getState()).toBe(PlayerState.PLAYING);
    // Force currentTrack on context by simulating NATIVE_TRACK_CHANGED
    await coordinator.dispatch({ type: "NATIVE_TRACK_CHANGED", payload: { track: mockTrack } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    jest.clearAllMocks();
    const executeLoadTrackCallCount = mockPlayerService.executeLoadTrack.mock.calls.length;

    // Now dispatch LOAD_TRACK for the same item while PLAYING
    await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "item-1" } });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // executeLoadTrack should NOT have been called again (short-circuit)
    expect(mockPlayerService.executeLoadTrack).toHaveBeenCalledTimes(0);
    // executePlay should have been called (PLAY dispatched and processed)
    expect(mockPlayerService.executePlay).toHaveBeenCalled();
  });

  it("does NOT short-circuit when LOAD_TRACK is for a different item while PLAYING", async () => {
    await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "item-1" } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await coordinator.dispatch({ type: "NATIVE_TRACK_CHANGED", payload: { track: mockTrack } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    jest.clearAllMocks();

    // Load a different item
    await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "item-2" } });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // executeLoadTrack SHOULD be called (different item, no short-circuit)
    expect(mockPlayerService.executeLoadTrack).toHaveBeenCalledWith("item-2", undefined);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
jest src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts --no-coverage -t "Change 3" 2>&1 | tail -20
```

Expected: FAIL — executeLoadTrack is called even for same item.

- [ ] **Step 3: Implement Change 3 in `executeTransition`**

In `executeTransition`, update the LOADING case to add the short-circuit **before** calling executeLoadTrack:

```typescript
          case PlayerState.LOADING:
            if (event.type === "LOAD_TRACK") {
              // Change 3: short-circuit if same item is already actively playing or paused.
              // previousState is the state before transitioning to LOADING.
              // context.currentTrack reflects the track confirmed by a prior playback cycle —
              // safe to trust in PLAYING and PAUSED. READY is excluded (see spec).
              const { previousState, currentTrack } = this.context;
              const wasActivelyPlayingOrPaused =
                previousState === PlayerState.PLAYING ||
                previousState === PlayerState.PAUSED;
              if (
                wasActivelyPlayingOrPaused &&
                event.payload.libraryItemId === currentTrack?.libraryItemId
              ) {
                log.info(
                  `[Coordinator] Short-circuit: ${event.payload.libraryItemId} already ${previousState} — dispatching PLAY`
                );
                dispatchPlayerEvent({ type: "PLAY" });
                return; // skip executeLoadTrack and playIntentOnLoad check
              }

              await playerService.executeLoadTrack(
                event.payload.libraryItemId,
                event.payload.episodeId
              );
              // Change 2: dispatch PLAY after successful load if intent is still set.
              if (this.context.playIntentOnLoad) {
                dispatchPlayerEvent({ type: "PLAY" });
              }
            }
            break;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
jest src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts --no-coverage -t "Change 3" 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/coordinator/PlayerStateCoordinator.ts src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts
git commit -m "feat(coordinator-boundary): coordinator short-circuits LOAD_TRACK for same item in PLAYING/PAUSED state"
```

---

### Task 11 (Change 4): Coordinator performs inline queue rebuild before `executePlay` when `queueStatus === 'unknown'`

**Files:**

- Modify: `src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts`
- Modify: `src/services/coordinator/PlayerStateCoordinator.ts`

- [ ] **Step 1: Write failing tests**

Add a new describe block:

```typescript
describe("Change 4: coordinator performs inline queue rebuild when queueStatus is unknown", () => {
  let mockPlayerService: {
    executePlay: ReturnType<typeof jest.fn>;
    executeRebuildQueue: ReturnType<typeof jest.fn>;
  };
  const mockResumeInfo = {
    position: 120,
    source: "activeSession" as const,
    authoritativePosition: 120,
    asyncStoragePosition: null,
  };

  beforeEach(() => {
    const { PlayerService } = require("../../PlayerService");
    mockPlayerService = PlayerService.getInstance();
    (mockPlayerService.executeRebuildQueue as jest.Mock).mockResolvedValue(mockResumeInfo);
    jest.clearAllMocks();
  });

  it("calls executeRebuildQueue before executePlay when queueStatus is unknown", async () => {
    // Drive to RESTORING state (sets queueStatus='unknown')
    await coordinator.dispatch({
      type: "RESTORE_STATE",
      payload: {
        state: {
          currentTrack: {
            libraryItemId: "item-1",
            mediaId: "media-1",
            title: "Test",
            duration: 3600,
            audioFiles: [],
            chapters: [],
            isDownloaded: true,
          } as any,
          position: 100,
          playbackRate: 1,
          volume: 1,
          isPlaying: false,
          currentPlaySessionId: null,
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(coordinator.getContext().queueStatus).toBe("unknown");
    jest.clearAllMocks();

    // Dispatch PLAY — queueStatus is unknown, should trigger inline rebuild
    await coordinator.dispatch({ type: "PLAY" });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockPlayerService.executeRebuildQueue).toHaveBeenCalled();
    expect(mockPlayerService.executePlay).toHaveBeenCalled();
  });

  it("sets queueStatus to 'valid' after inline rebuild completes", async () => {
    await coordinator.dispatch({
      type: "RESTORE_STATE",
      payload: {
        state: {
          currentTrack: {
            libraryItemId: "item-1",
            mediaId: "media-1",
            title: "Test",
            duration: 3600,
            audioFiles: [],
            chapters: [],
            isDownloaded: true,
          } as any,
          position: 100,
          playbackRate: 1,
          volume: 1,
          isPlaying: false,
          currentPlaySessionId: null,
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    jest.clearAllMocks();

    await coordinator.dispatch({ type: "PLAY" });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(coordinator.getContext().queueStatus).toBe("valid");
  });

  it("skips executeRebuildQueue when queueStatus is valid", async () => {
    // Drive coordinator to LOADING → QUEUE_RELOADED → READY (queueStatus becomes valid)
    await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "item-1" } });
    await new Promise((resolve) => setTimeout(resolve, 100));
    // After LOAD_TRACK+playIntentOnLoad PLAY, we're in PLAYING with queueStatus='valid'
    // (QUEUE_RELOADED from the full load flow sets it — but mocked executeLoadTrack doesn't do that)
    // Force queueStatus='valid' via QUEUE_RELOADED
    await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    jest.clearAllMocks();

    // Drive to PAUSED then dispatch PLAY (queueStatus still valid)
    await coordinator.dispatch({ type: "PAUSE" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    jest.clearAllMocks();

    await coordinator.dispatch({ type: "PLAY" });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockPlayerService.executeRebuildQueue).not.toHaveBeenCalled();
    expect(mockPlayerService.executePlay).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
jest src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts --no-coverage -t "Change 4" 2>&1 | tail -20
```

Expected: FAIL — coordinator doesn't call executeRebuildQueue.

- [ ] **Step 3: Implement Change 4 in `executeTransition`**

In `executeTransition`, update the PLAYING case:

```typescript
          case PlayerState.PLAYING:
            // Only call executePlay when actually transitioning into PLAYING
            if (event.type === "PLAY") {
              // Change 4: Inline queue rebuild if queueStatus is unknown.
              // This handles the RESTORE_STATE and STOP paths where the OS may have
              // cleared the TrackPlayer queue. Direct context mutations are used
              // (not dispatchPlayerEvent) because PLAYING/PAUSED reject RELOAD_QUEUE
              // via the transition table — bypassing the queue preserves POS-03 guard.
              if (this.context.queueStatus === "unknown" && this.context.currentTrack) {
                const track = this.context.currentTrack;
                this.updateContextFromEvent({
                  type: "RELOAD_QUEUE",
                  payload: { libraryItemId: track.libraryItemId },
                }); // sets isLoadingTrack=true (POS-03 guard)
                try {
                  const resumeInfo = await playerService.executeRebuildQueue(track);
                  this.updateContextFromEvent({
                    type: "QUEUE_RELOADED",
                    payload: { position: resumeInfo.position },
                  }); // sets isLoadingTrack=false, queueStatus='valid'
                } catch (rebuildError) {
                  // Clear loading state and abort — calling executePlay on an empty queue would fail
                  this.context.isLoadingTrack = false;
                  log.error("[Coordinator] Failed to rebuild queue before play", rebuildError as Error);
                  return;
                }
              }
              await playerService.executePlay();
            }
            break;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
jest src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts --no-coverage -t "Change 4" 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/coordinator/PlayerStateCoordinator.ts src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts
git commit -m "feat(coordinator-boundary): coordinator performs inline queue rebuild via queueStatus before executePlay"
```

---

### Task 12: Fix EXEC-03 pre-load regressions and run full test suite

**Files:**

- Modify: `src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts`

**Background:** After Change 2, the EXEC-03 pre-load sequence `LOAD_TRACK → QUEUE_RELOADED → (50ms wait)` now leaves the coordinator in PLAYING state (not READY). The auto-PLAY dispatch processes QUEUE_RELOADED → READY then PLAY → PLAYING. The EXEC-03 tests assume coordinator is in READY state and dispatch PLAY to reach PLAYING.

- [ ] **Step 1: Fix EXEC-03 `beforeEach`**

In the `describe("feedback loop prevention (EXEC-03)", ...)` block, update the `beforeEach`:

```typescript
beforeEach(async () => {
  const { PlayerService } = require("../../PlayerService");
  mockPlayerService = PlayerService.getInstance();
  jest.clearAllMocks();

  // Pre-load to PLAYING state.
  // After Change 2, LOAD_TRACK auto-dispatches PLAY after executeLoadTrack completes,
  // so the coordinator ends up in PLAYING (not READY) after this sequence.
  await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
  await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
  await new Promise((resolve) => setTimeout(resolve, 100));
  // Coordinator is now in PLAYING state
  jest.clearAllMocks();
});
```

- [ ] **Step 2: Fix the first EXEC-03 test ("should not re-dispatch from executePlay")**

The test currently dispatches PLAY from (what was) READY state. Now coordinator is PLAYING, so PLAY is rejected. Update the test to dispatch from PAUSED:

```typescript
it("should not re-dispatch events from within executePlay", async () => {
  // Move to PAUSED first so PLAY → PLAYING is a valid transition
  await coordinator.dispatch({ type: "PAUSE" });
  await new Promise((resolve) => setTimeout(resolve, 50));
  jest.clearAllMocks();

  const dispatchSpy = jest.spyOn(playerEventBus, "dispatch");

  await coordinator.dispatch({ type: "PLAY" });
  await new Promise((resolve) => setTimeout(resolve, 50));

  // execute* methods must not call dispatchPlayerEvent / playerEventBus.dispatch
  expect(dispatchSpy).not.toHaveBeenCalled();
  expect(mockPlayerService.executePlay).toHaveBeenCalledTimes(1);

  dispatchSpy.mockRestore();
});
```

- [ ] **Step 3: Run EXEC-03 tests to verify they pass**

```bash
jest src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts --no-coverage -t "feedback loop prevention" 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 4: Verify `transitions.ts` — confirm RELOAD_QUEUE is not accepted from PLAYING, PAUSED, or READY**

```bash
grep -A5 "\[PlayerState.PLAYING\]" src/services/coordinator/transitions.ts | grep RELOAD_QUEUE
grep -A5 "\[PlayerState.PAUSED\]" src/services/coordinator/transitions.ts | grep RELOAD_QUEUE
grep -A5 "\[PlayerState.READY\]" src/services/coordinator/transitions.ts | grep RELOAD_QUEUE
```

Expected: no output (RELOAD_QUEUE is absent from these states — confirms the coordinator's inline context mutation approach for Change 4 is correct).

- [ ] **Step 5: Run the complete test suite**

```bash
npm test 2>&1 | tail -40
```

Expected: All tests PASS.

If any tests fail, investigate and fix before proceeding.

- [ ] **Step 6: Final compile check**

```bash
npx tsc --noEmit 2>&1
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts
git commit -m "test(coordinator-boundary): fix EXEC-03 pre-load for post-Change-2 PLAYING state and verify transitions table"
```

---

### Task 13: Final verification and cleanup

- [ ] **Step 1: Verify no coordinator imports remain in collaborators**

```bash
grep -rn "getCoordinator\|PlayerStateCoordinator\|PlayerState" src/services/player/
```

Expected: No matches (all coordinator imports removed from collaborators).

- [ ] **Step 2: Verify `dispatchPlayerEvent` not used for decision-driving events in collaborators**

```bash
grep -n "dispatchEvent.*PLAY\|dispatchEvent.*RELOAD_QUEUE\|dispatchEvent.*QUEUE_RELOADED" src/services/player/
```

Expected: No matches.

- [ ] **Step 3: Verify only permitted factual dispatches remain in collaborators**

```bash
grep -n "dispatchEvent" src/services/player/
```

Expected: Only `SEEK_COMPLETE` in `PlaybackControlCollaborator.ts` (the permitted factual dispatch).

- [ ] **Step 4: Run circular import check**

```bash
npx dpdm --circular src/services/player/TrackLoadingCollaborator.ts
npx dpdm --circular src/services/player/ProgressRestoreCollaborator.ts
```

Expected: No circular dependencies.

- [ ] **Step 5: Run full test suite one final time**

```bash
npm test 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 6: Delete `.continue-here.md`**

```bash
rm .continue-here.md
```

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: complete coordinator boundary cleanup refactor

All four changes implemented:
- Change 1: reloadTrackPlayerQueue renamed to executeRebuildQueue (pure execution)
- Change 2: coordinator dispatches PLAY after executeLoadTrack via playIntentOnLoad
- Change 3: coordinator short-circuits LOAD_TRACK when same item already active
- Change 4: coordinator performs inline queue rebuild via queueStatus context field

Collaborators now have zero coordinator imports."
```
