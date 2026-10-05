# Streaming Despite Downloaded Content — Legacy Absolute Path Bug

**Status:** Fixed (2026-03-25)
**Symptom:** A downloaded book always played via streaming. Every play session logged `Got streaming tracks: 1` and the trace span `player.load.build_track_list` showed `localCount: 0, streamingCount: 1`. `DownloadStatusCollaborator` correctly verified the file on disk at startup, but playback ignored it.

**Secondary symptom:** Position jumped to 0:00 immediately on play before snapping back (or requiring a manual scrub). This was a consequence of the streaming bug — not an independent race.

---

## Root Cause Chain

### Layer 1 — Legacy absolute paths become stale after iOS container UUID rotation

Old downloads stored absolute paths like:

```
file:///var/mobile/Containers/Data/Application/28E50F99-A1B2-.../Documents/downloads/item/file.mp3
```

After iOS updates or reinstalls, the UUID in the container path changes. The stored path no longer resolves. `verifyFileExists()` uses `resolveAppPath()` which returns legacy absolute paths unchanged — so `new File(oldPath).exists` returns `false`.

### Layer 2 — `DownloadRepairCollaborator.repairDownloadStatus` used the wrong default location

The repair collaborator was called from `executeLoadTrack` (before `getAudioFilesWithDownloadInfo`) to fix stale paths. Its fallback was:

```typescript
const expectedPath = getDownloadPath(libraryItemId, file.filename); // defaults to "caches"
```

But the file was in **Documents** (moved there by `ensureItemInDocuments`). Both checks failed:

- `verifyFileExists(legacyAbsPath)` → false (UUID changed)
- `verifyFileExists(cachesPath)` → false (file is in Documents, not Caches)

Result: `clearAudioFileDownloadStatus(file.id)` was called — the download record was wiped. `getAudioFilesWithDownloadInfo` then returned `downloadInfo: undefined`, and `buildTrackList` fell back to streaming.

`ensureItemInDocuments` ran first and correctly found the file in Documents (using `getAudioFileLocation` which checks both locations), but it did not update the stored path — it only moves files, it doesn't repair stale references.

### Why `DownloadStatusCollaborator` saw it correctly at startup

`DownloadStatusCollaborator` uses `getAudioFileLocation(libraryItemId, filename)` — which constructs fresh paths via `Paths.document` / `Paths.cache` regardless of the stored path. So it always found the file. The repair collaborator was checking the stored path first, then a hardcoded Caches path — never checking Documents by filename.

---

## Fix

**`DownloadRepairCollaborator.repairDownloadStatus`** (`src/services/download/DownloadRepairCollaborator.ts`):

Replace the single-location expected-path check with `getAudioFileLocation`:

```typescript
// Before — checks Caches only (wrong default)
const expectedPath = getDownloadPath(libraryItemId, file.filename);
const existsAtExpectedPath = await verifyFileExists(expectedPath);

// After — checks both Documents and Caches via current container paths
const foundLocation = getAudioFileLocation(libraryItemId, file.filename);
if (foundLocation !== null) {
  const expectedPath = getDownloadPath(libraryItemId, file.filename, foundLocation);
  await markAudioFileAsDownloaded(file.id, expectedPath); // repair
} else {
  await clearAudioFileDownloadStatus(file.id); // truly gone
}
```

**`TrackLoadingCollaborator.buildTrackList`** (`src/services/player/TrackLoadingCollaborator.ts`):

Same defensive fix applied to `buildTrackList`'s own "clear on missing" loop (used by `executeRebuildQueue` which does not run `repairDownloadStatus`). A `repairedPaths: Map<audioFileId, repairedPath>` was added so the second loop (URL resolution) uses the corrected path instead of resolving the stale stored path.

---

## Secondary Fix — Smart Rewind Position Jump

Because Bug A forced streaming, `applySmartRewind()` (called with no argument in `executePlay`) read `TrackPlayer.getProgress().position` which returns 0 before the stream buffers to the seekTo position.

**Trace evidence:** `player.play.smart_rewind` span showed `positionBeforeMs: 0, positionAfterMs: 0` (correct value: ~20,956,626 ms). User scrubbed back manually.

**`applySmartRewind(currentPosition?: number)`** was explicitly designed for this — JSDoc: "If provided, uses this instead of reading from TrackPlayer. This prevents race conditions when TrackPlayer hasn't finished seeking yet." — but its only caller never passed it.

Two changes:

1. **`TrackLoadingCollaborator.executeLoadTrack` (path B)**: after `resolveCanonicalPosition`, sync the resolved position to the store so `executePlay` can read it:

   ```typescript
   store.updatePosition(seekPosition);
   ```

2. **`PlaybackControlCollaborator.executePlay`**: read store position before `TrackPlayer.play()`:
   ```typescript
   const currentPosition = store.player.position; // read before play()
   await TrackPlayer.play();
   await applySmartRewind(currentPosition);
   ```

---

## Key Diagnostic Helpers

| Helper                                          | Behavior                                                                                   | Safe for stale paths?                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `getAudioFileLocation(libraryItemId, filename)` | Checks both Docs and Caches by constructing fresh paths via `Paths.document`/`Paths.cache` | ✅ Yes — always current                         |
| `verifyFileExists(storedPath)`                  | Calls `resolveAppPath` then `File.exists`. For legacy absolutes, returns path unchanged    | ⚠️ No — fails if UUID rotated                   |
| `getDownloadPath(id, name, location?)`          | Builds path for a given location. Defaults to `"caches"` if location omitted               | ⚠️ Only correct if location matches actual file |

**Rule:** When checking whether a downloaded file still exists, use `getAudioFileLocation` (by filename) rather than verifying a stored path. Only use `verifyFileExists` when you have a path you know is current (e.g., newly constructed via `getDownloadPath`).

---

## Also Added

- **Skip gesture instrumentation** (`player.ui.skip` trace events in `FullScreenPlayer` and `ConsolidatedPlayerControls`): captures `direction`, `fromPositionMs`, `targetPositionMs`, `intervalSeconds`. Distinguishes skip-button vs. scrub SEEKs in future trace dumps.
- **`pruneTraceDumps()`** in `traceDump.ts`: keeps the 30 most-recent dumps within the last 7 days. Called fire-and-forget from `writeDumpToDisk` and on app foreground in `_layout.tsx`.

---

## Third Bug — Spurious PAUSE from Queue-Rebuild Pre-Play iOS State Sequence

**Status:** Fixed (2026-03-25)

**Symptom:** After a LOAD_TRACK that triggers the queue-rebuild path (i.e. `queueStatus === "unknown"`), the machine immediately goes to PAUSED instead of PLAYING. The player appears to start then instantly pause — the play button shows the wrong state and the user must tap play again.

---

### Root Cause Chain

1. `LOAD_TRACK` arrives → machine transitions to LOADING → `executeLoadTrack` starts.
2. Inside `executeLoadTrack`, `queueStatus` is `"unknown"` (post-RESTORE_STATE or post-STOP), so `executeRebuildQueue` runs inline before `executePlay`.
3. `executeRebuildQueue` calls `TrackPlayer.add(tracks)` then `TrackPlayer.seekTo(position)`.
4. iOS emits native state events synchronously from those calls: **Buffering → Ready → Paused** — before `executePlay()` has had a chance to run.
5. The `NATIVE_STATE_CHANGED(State.Paused)` event arrives while the machine is already in `PLAYING` (the coordinator optimistically transitions on `LOAD_TRACK` → auto-PLAY).
6. The PAUSE-dispatch condition fires:
   ```typescript
   // Before fix — no hasReachedPlayingState guard
   if (
     this.context.currentState === PlayerState.PLAYING &&
     event.payload.state !== State.Playing &&
     event.payload.state !== State.Buffering &&
     event.payload.state !== State.Ready
   ) {
     dispatchPlayerEvent({ type: "PAUSE" }, { source: "native_player" });
   }
   ```
7. The queued PAUSE is processed after NATIVE_STATE_CHANGED completes (AsyncLock). `executePlay` runs too, but the PAUSE is processed first (or interleaved), leaving the machine in PAUSED.

---

### Fix

Added `hasReachedPlayingState: boolean` to `StateContext`. The flag is:

- Set `true` when `NATIVE_STATE_CHANGED(State.Playing)` fires (native playback has actually begun).
- Reset to `false` on `LOAD_TRACK`, `RESTORE_STATE`, `RELOAD_QUEUE`, and `STOP`.

The PAUSE-dispatch condition now requires the flag:

```typescript
// After fix — hasReachedPlayingState guard added
if (
  this.context.currentState === PlayerState.PLAYING &&
  this.context.hasReachedPlayingState && // NEW: only after native play confirmed
  event.payload.state !== State.Playing &&
  event.payload.state !== State.Buffering &&
  event.payload.state !== State.Ready
) {
  dispatchPlayerEvent({ type: "PAUSE" }, { source: "native_player" });
}
```

This means the pre-play Buffering→Ready→Paused sequence is ignored. Once `State.Playing` fires (confirming real playback started), subsequent external pauses (lock screen, audio focus loss) correctly trigger the auto-pause.

---

### Files Modified

- `src/types/coordinator.ts` — added `hasReachedPlayingState: boolean` to `StateContext` with JSDoc
- `src/services/coordinator/PlayerStateCoordinator.ts`:
  - `createInitialContext()`: added `hasReachedPlayingState: false`
  - `updateContextFromEvent()` `NATIVE_STATE_CHANGED` case: sets flag to `true` on `State.Playing`; adds flag to PAUSE dispatch condition
  - `updateContextFromEvent()` `LOAD_TRACK` case: resets flag to `false`
  - `updateContextFromEvent()` `RESTORE_STATE` case: resets flag to `false`
  - `updateContextFromEvent()` `RELOAD_QUEUE` case: resets flag to `false`
  - `updateContextFromEvent()` `STOP` case: resets flag to `false`
- `src/services/coordinator/__tests__/PlayerStateCoordinator.test.ts`:
  - "lock screen pause" test: added `NATIVE_STATE_CHANGED(State.Playing)` before the `State.Paused` dispatch
  - "multiple lock screen interactions" test: same
  - Added new regression test: "should NOT dispatch PAUSE when State.Paused fires before native play starts (queue rebuild path)"
