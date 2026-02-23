# Architecture Patterns: v1.1 Bug Fixes & Polish

**Domain:** React Native Expo audiobook app — coordinator-driven audio player
**Researched:** 2026-02-20
**Confidence:** HIGH — direct codebase analysis of all relevant files

---

## Context

This document is for the **v1.1 Bug Fixes & Polish** milestone, applied to an app that has
completed Phases 1–5 of the PlayerStateCoordinator migration. The coordinator is fully
operational in execution mode. The bridge (`syncStateToStore` / `syncPositionToStore`) fires
on every allowed event. `playerSlice` is a read-only Zustand proxy. `observerMode` scaffolding
has been removed (Phase 5 done).

The five integration questions answered below all arise from the gap between that completed
architecture and specific runtime behaviors that still need fixing.

---

## Question 1: Now Playing Metadata — Where It Already Lives and the Gap

### What the bridge already does (verified, HIGH confidence)

`syncPositionToStore()` (called on every `NATIVE_PROGRESS_UPDATED`) already calls
`store.updateNowPlayingMetadata()` when `currentChapterId` changes — this is the chapter
boundary detection path (CLEAN-03, PROP-06). It debounces on `lastSyncedChapterId`.

`syncStateToStore()` (called on every other allowed event) also calls
`store.updateNowPlayingMetadata()` when `currentChapterId` differs from `lastSyncedChapterId`.

Both paths share the same `lastSyncedChapterId` instance variable so updates are deduplicated
across the two sync paths.

### The remaining gap (verified, HIGH confidence)

`CHAPTER_CHANGED` is defined in `transitions.ts` as a no-op event (does not advance state,
just updates context). When `CHAPTER_CHANGED` arrives, the coordinator calls
`updateContextFromEvent()` which sets `this.context.currentChapter`. Then, because the event
is allowed, it calls `syncStateToStore(event)`.

However, `syncStateToStore` reads the chapter from `this.context.currentChapter`, not from
the Zustand store. The Zustand field `store.player.currentChapter` is only updated by
`store.updatePosition()` calling `_updateCurrentChapter` synchronously. On a
`CHAPTER_CHANGED` event, `syncStateToStore` does NOT call `store.updatePosition()` (only
`syncPositionToStore` does). So `store.player.currentChapter` may still reflect the old
chapter when the `currentChapterId !== this.lastSyncedChapterId` comparison runs.

Result: `CHAPTER_CHANGED` events that arrive without a concurrent `NATIVE_PROGRESS_UPDATED`
may not trigger `updateNowPlayingMetadata()`, leaving the lock screen showing the previous
chapter title.

**Confirmed root cause from the Phase 4 decision note:** "BGS chapter-change
`updateNowPlayingMetadata` was RETAINED because `CHAPTER_CHANGED` was never dispatched" —
this confirms `CHAPTER_CHANGED` is not dispatched anywhere in the current codebase. The event
type exists in the type system and is handled in `updateContextFromEvent`, but nothing calls
`dispatchPlayerEvent({ type: "CHAPTER_CHANGED" })`. Chapter detection happens positionally
(via the `currentChapterId` check in `syncPositionToStore`) rather than via an explicit event.

### Correct integration point

The positional detection in `syncPositionToStore` is the right mechanism and is already
working correctly for the common case. It fires at ~1Hz via `NATIVE_PROGRESS_UPDATED`. The
chapter boundary will be detected within one second of crossing it.

The gap is when a skip action jumps to a new chapter and the position update arrives, but
`store.player.currentChapter` hasn't updated yet when `syncPositionToStore` does the
comparison. See Question 2 for how the skip path works.

No code changes are needed to `syncStateToStore` or `syncPositionToStore` themselves — the
issue is sequencing. Do not add a parallel `updateNowPlayingMetadata` call path; the
`lastSyncedChapterId` debounce exists specifically to prevent that.

---

## Question 2: Skip Button → Now Playing Metadata — The Seek Completion Path

### Data flow (verified, HIGH confidence)

```
User presses skip button
    ↓
PlayerService.seekTo(position)
    ↓
dispatchPlayerEvent({ type: "SEEK", payload: { position } })
    ↓
Coordinator: PLAYING → SEEKING (context.isSeeking = true)
executeTransition() calls playerService.executeSeek(position)
syncStateToStore(event) fires — updates _setSeeking(true)
    ↓
TrackPlayer.seekTo() completes natively
    ↓
PlayerBackgroundService fires NATIVE_PROGRESS_UPDATED
    ↓
Coordinator: context.isSeeking cleared, context.position = new position
syncPositionToStore() fires:
  1. store.updatePosition(newPosition) — triggers _updateCurrentChapter synchronously
  2. currentChapterId = store.player.currentChapter?.chapter?.id?.toString()
  3. if currentChapterId !== lastSyncedChapterId → updateNowPlayingMetadata()
```

### Does syncPositionToStore call updateNowPlayingMetadata after a skip?

Yes, but only if the skip crossed a chapter boundary. The check is:
`currentChapterId !== this.lastSyncedChapterId`.

If the user skips within the same chapter, `currentChapterId` does not change, so
`updateNowPlayingMetadata` is not called. This is correct — the elapsed time will update
on the next `NATIVE_PROGRESS_UPDATED` cycle regardless, because `updateNowPlayingMetadata`
is called on every chapter change, not every position update.

**The gap for skip-within-chapter:** `updateNowPlayingMetadata` uses `chapterElapsedTime =
currentChapter.positionInChapter`, which is computed from `store.updatePosition()`. After a
seek, the next `syncPositionToStore` call updates the position, which triggers
`_updateCurrentChapter` synchronously, so `positionInChapter` is correct before
`updateNowPlayingMetadata` runs. The elapsed time shown on the lock screen will be accurate
on the next chapter-boundary crossing.

**The gap for skip-that-crosses-a-chapter:** The `updatePosition` call in `syncPositionToStore`
runs first (synchronous), so `store.player.currentChapter` reflects the new chapter before
the `currentChapterId !== lastSyncedChapterId` comparison. This means a chapter-crossing skip
DOES trigger `updateNowPlayingMetadata` correctly.

### Verdict

The existing bridge handles seek → now playing metadata correctly for chapter-crossing skips.
For within-chapter skips, the lock screen elapsed time updates at the chapter boundary, not
immediately. This is acceptable behavior — the elapsed time shown is chapter-relative, and
`NATIVE_PROGRESS_UPDATED` fires within 1 second regardless.

If immediate elapsed-time updates after within-chapter seeks are required, the fix is to call
`updateNowPlayingMetadata()` from `syncStateToStore` when `event.type === "SEEKING"` resolves
(i.e., on the `NATIVE_PROGRESS_UPDATED` that clears the seeking state). This is a targeted
addition to `syncPositionToStore`, not a new call site.

---

## Question 3: Download Tracking Reconciliation

### Where download state lives (verified, HIGH confidence)

**SQLite (Drizzle ORM) — the source of truth:**

- `audioFiles` table tracks `isDownloaded`, `localPath`, `storageLocation` per audio file
- `markAudioFileAsDownloaded()` writes on task completion
- `clearAudioFileDownloadStatus()` is available for deletion

**DownloadService in-memory (`activeDownloads` Map) — transient state:**

- Tracks active download tasks, progress callbacks, speed trackers
- Populated on `startDownload()` or `restoreExistingDownloads()`
- Lost on app restart — rebuilt from `RNBackgroundDownloader.checkForExistingDownloads()`

**Zustand — not used for download state:**
No download state is pushed to the Zustand store. Progress is delivered via callbacks
subscribed to `DownloadService`.

### What causes DB/downloader mismatches

1. **App killed during download:** Task exists in the OS downloader (restored via
   `checkForExistingDownloads` on `initialize()`), but DB still shows `isDownloaded = false`.
   This is handled correctly by `restoreExistingDownloads()` — it rewires task handlers so
   `markAudioFileAsDownloaded` is called on completion.

2. **Completed download not marked in DB:** If `markAudioFileAsDownloaded` fails after task
   completion (DB error), file exists on disk but DB says not downloaded. No reconciliation
   path handles this currently.

3. **File deleted externally or iOS container path changed:** DB shows `isDownloaded = true`,
   but `localPath` is stale. The existing iOS path migration logic in `DownloadService` handles
   container path changes. External deletion is not reconciled.

4. **Download completed but iCloud exclusion failed:** File exists, DB is correct, but the
   file may be backed up. Not a correctness issue, but a data-usage issue.

### Correct reconciliation point

The right place to reconcile is in `DownloadService.initialize()`, which already runs at
app startup (triggered from `TabLayout` `useEffect`). The existing `restoreExistingDownloads`
handles the active-task recovery case.

A startup reconciliation pass that verifies disk-vs-DB consistency should be added to
`initialize()` after `restoreExistingDownloads`. The pass should:

1. Query SQLite for all `audioFiles` where `isDownloaded = true`
2. Call `downloadFileExists(localPath)` for each
3. For files where the file does not exist: call `clearAudioFileDownloadStatus(audioFileId)`

This is a read-then-write pass against SQLite. It belongs in `DownloadService.initialize()`,
not in any UI component. No coordinator events are needed — downloads are not in the player
state machine.

### Component boundaries for download features

| Component                          | Responsibility                    | Notes                                                          |
| ---------------------------------- | --------------------------------- | -------------------------------------------------------------- |
| `DownloadService`                  | All download lifecycle management | Singleton. Owns `activeDownloads` map.                         |
| `SQLite / audioFiles`              | Persistent download state         | One row per audio file.                                        |
| `RNBackgroundDownloader`           | OS-level download tasks           | Survives app restart.                                          |
| `src/lib/iCloudBackupExclusion.ts` | Set NSURLIsExcludedFromBackupKey  | Already called from DownloadService after each file completes. |
| `TabLayout` useEffect              | Service initialization point      | Calls `DownloadService.getInstance().initialize()`             |

---

## Question 4: iCloud Exclusion Native Module

### Current state (verified, HIGH confidence)

The native module wrapper already exists at `src/lib/iCloudBackupExclusion.ts`. It reads
`NativeModules.ICloudBackupExclusion` and provides `setExcludeFromBackup()` and
`isExcludedFromBackup()`. On non-iOS platforms it is a no-op.

`DownloadService.ts` already imports and calls `setExcludeFromBackup(downloadPath)` in two
places:

1. In the `task.done()` handler for new downloads (line 286)
2. In `restoreExistingDownloads()` when a restored task completes (line 955)
3. For files already on disk in `startDownload()` (the "file already exists" catch branch,
   line 329)

The TypeScript wrapper is complete. **The native iOS implementation does not exist** — there
is no `ICloudBackupExclusion.swift` or `.m` file in `ios/SideShelf/`. The module call will
silently no-op on iOS because `NativeModules.ICloudBackupExclusion` will be `null`.

### How a React Native native module fits into Expo bare workflow

In Expo bare workflow (which this project uses), custom native modules are added directly
to the iOS project. There are two patterns:

**Option A: Legacy React Native native module (Obj-C or Swift with `RCT_EXPORT_MODULE`)**

- Add a `.swift` file to `ios/SideShelf/` with `@objc class ICloudBackupExclusion: NSObject`
- Export via `RCT_EXPORT_MODULE()` in Obj-C, bridged from Swift
- Accessed via `NativeModules.ICloudBackupExclusion` — matches what `iCloudBackupExclusion.ts` already expects
- Requires Bridging Header (already exists at `ios/SideShelf/SideShelf-Bridging-Header.h`)

**Option B: Expo Module (Swift, ExpoModulesCore)**

- Create a `modules/icloud-backup-exclusion/` directory
- Define an `ExpoModule` subclass
- Accessed via `requireNativeModule('ICloudBackupExclusion')`
- Requires changing the TypeScript wrapper to use `requireNativeModule` instead of `NativeModules`

**Recommendation: Option A (legacy native module)** because the TypeScript wrapper already
uses `NativeModules.ICloudBackupExclusion`. Option A requires zero changes to the existing
wrapper. A single Swift file in `ios/SideShelf/` is sufficient.

### Call site

The call site is correct as-is — `DownloadService` calls `setExcludeFromBackup` after each
file completes downloading. No changes to the call site are needed. The fix is purely
additive: implement the missing Swift file.

### What the Swift implementation needs to do

```swift
// ios/SideShelf/ICloudBackupExclusion.swift
import Foundation

@objc(ICloudBackupExclusion)
class ICloudBackupExclusion: NSObject {

  @objc func setExcludeFromBackup(
    _ filePath: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    var url = URL(fileURLWithPath: filePath)
    var resourceValues = URLResourceValues()
    resourceValues.isExcludedFromBackup = true
    do {
      try url.setResourceValues(resourceValues)
      resolve(["success": true, "path": filePath])
    } catch {
      reject("ICLOUD_EXCLUDE_ERROR", error.localizedDescription, error)
    }
  }

  @objc func isExcludedFromBackup(
    _ filePath: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    let url = URL(fileURLWithPath: filePath)
    do {
      let values = try url.resourceValues(forKeys: [.isExcludedFromBackupKey])
      resolve(["excluded": values.isExcludedFromBackup ?? false, "path": filePath])
    } catch {
      reject("ICLOUD_CHECK_ERROR", error.localizedDescription, error)
    }
  }

  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
```

A companion Obj-C bridge file is also required to export the module to React Native's bridge.
This is the standard pattern for Swift-in-RN; the Bridging Header already exists.

---

## Question 5: More Screen Routing to Sibling Tabs

### How Expo Router handles tab navigation (verified, HIGH confidence)

The app uses two tab systems simultaneously:

- **Cross-platform fallback**: Expo Router `Tabs` component (from `expo-router`)
- **iOS native**: `NativeTabs` (from `expo-router/unstable-native-tabs`)

Both are rendered in `src/app/(tabs)/_layout.tsx`. The tab routes are:
`home`, `library`, `series`, `authors`, `more`.

### Is `router.push('/series')` the right pattern?

Yes, and it is already used. The `MoreScreen` (`src/app/(tabs)/more/index.tsx`) uses
`router.push(\`/${tab.name}\`)`for hidden tabs — for example,`router.push('/series')` when
Series is in the hidden tabs list. This is the correct pattern.

`router.push('/series')` navigates to the `series` tab route. Because Series is a sibling tab
(defined in `TAB_CONFIG` in `_layout.tsx`), Expo Router resolves the path and switches the
active tab. The tab bar updates to reflect the new selection.

**Important distinction:** `router.push` adds to the navigation stack. `router.replace` would
replace the current screen. For tab navigation from More, `router.push` is correct — it
navigates to the tab and allows the user to go back if needed (though with native tabs the
"back" behavior may vary by platform).

### The hidden tabs pattern

The More screen's purpose is to provide access to tabs the user has hidden from the tab bar
(`hiddenTabs` setting). The routing pattern mirrors how the visible tab buttons work — they
just change the active tab via the tab navigator. `router.push('/series')` accomplishes
this whether the Series tab is visible or hidden.

When a tab is hidden, its route still exists (Expo Router renders it with `href: null` to
hide it from the tab bar but keep it accessible via navigation). `router.push('/series')`
works for both visible and hidden tabs.

### Component boundary

No new components are needed. The routing is UI-only and confined to `MoreScreen`. No
coordinator events, no store writes, no service calls. Pure navigation.

---

## Component Boundaries Summary

### New vs Modified Components

| Component                                            | Status        | What Changes                                          |
| ---------------------------------------------------- | ------------- | ----------------------------------------------------- |
| `ios/SideShelf/ICloudBackupExclusion.swift`          | **NEW**       | Swift native module implementation                    |
| `ios/SideShelf/ICloudBackupExclusionBridge.m`        | **NEW**       | Obj-C bridge to export Swift module                   |
| `src/services/DownloadService.ts`                    | **MODIFIED**  | Add startup reconciliation pass in `initialize()`     |
| `src/services/coordinator/PlayerStateCoordinator.ts` | **NO CHANGE** | Bridge already handles now-playing metadata correctly |
| `src/stores/slices/playerSlice.ts`                   | **NO CHANGE** | `updateNowPlayingMetadata` implementation is correct  |
| `src/lib/iCloudBackupExclusion.ts`                   | **NO CHANGE** | Wrapper already complete and correct                  |
| `src/app/(tabs)/more/index.tsx`                      | **NO CHANGE** | `router.push` pattern already in use                  |

### What the Coordinator Bridge Already Handles (No Fix Needed)

- `updateNowPlayingMetadata` on chapter boundary crossing during normal playback
- `updateNowPlayingMetadata` on chapter-crossing seeks
- `lastSyncedChapterId` deduplication across `syncPositionToStore` and `syncStateToStore`
- `setExcludeFromBackup` call site after download completion (TypeScript side)
- `router.push` for More screen → sibling tab navigation

### What Still Needs to Be Built

1. **Swift native module** for `ICloudBackupExclusion` — the TypeScript wrapper calls into
   a module that does not exist yet in native code
2. **Startup reconciliation in DownloadService** — verify disk files match DB records on
   `initialize()`

---

## Data Flow: Now Playing Metadata (Complete Picture)

```
NATIVE_PROGRESS_UPDATED (fires ~1Hz from TrackPlayer)
    ↓
Coordinator.syncPositionToStore()
    store.updatePosition(position)          ← triggers _updateCurrentChapter synchronously
    currentChapterId = store.player.currentChapter?.chapter?.id?.toString()
    if (currentChapterId !== lastSyncedChapterId):
        lastSyncedChapterId = currentChapterId
        store.updateNowPlayingMetadata()    ← fires on chapter boundary only
            → TrackPlayer.updateMetadataForTrack(index, {
                title: chapterTitle,
                artist: author,
                album: bookTitle,
                duration: chapterDuration,
                elapsedTime: positionInChapter  ← chapter-relative
              })

All other events (PLAY, PAUSE, STOP, SEEK, LOAD_TRACK, etc.)
    ↓
Coordinator.syncStateToStore(event)
    store.updatePlayingState(isPlaying)
    store.updatePosition(position)          ← also triggers _updateCurrentChapter
    store._setTrackLoading(isLoadingTrack)
    store._setSeeking(isSeeking)
    ...
    currentChapterId = this.context.currentChapter?.chapter?.id?.toString()
    if (currentChapterId !== lastSyncedChapterId):
        lastSyncedChapterId = currentChapterId
        store.updateNowPlayingMetadata()    ← fires on structural events when chapter changed
```

---

## Data Flow: Download Lifecycle

```
User initiates download
    ↓
DownloadService.startDownload(libraryItemId)
    cacheCoverIfMissing(libraryItemId)
    for each audioFile:
        RNBackgroundDownloader.download(url, path, metadata)
        task.done():
            markAudioFileAsDownloaded(audioFileId, path, 'documents')  ← SQLite write
            setExcludeFromBackup(path)                                  ← iCloud exclusion
                → ICloudBackupExclusion.setExcludeFromBackup()          ← NATIVE MODULE (missing)
            updateProgress(filename, bytes, total, 'completed')

App restart (download was in-flight)
    ↓
TabLayout useEffect → DownloadService.initialize()
    RNBackgroundDownloader.checkForExistingDownloads()
    restoreExistingDownloads(tasks)
        for each task: rewire .done() → markAudioFileAsDownloaded + setExcludeFromBackup
    [NEEDED] reconcileDownloadedFiles()    ← new: verify SQLite 'isDownloaded' vs disk
        getAudioFilesMarkedAsDownloaded()
        for each: verifyFileExists(localPath)
        if missing: clearAudioFileDownloadStatus(audioFileId)
```

---

## Build Order Recommendation

Build order that respects existing architecture constraints:

**Step 1: Swift native module** (no dependencies, self-contained)

- `ios/SideShelf/ICloudBackupExclusion.swift`
- `ios/SideShelf/ICloudBackupExclusionBridge.m`
- Test: call `isExcludedFromBackup` on a known download path
- No TypeScript changes needed

**Step 2: DownloadService startup reconciliation** (depends on Step 1 being in place)

- Modify `DownloadService.initialize()` to add reconciliation pass after `restoreExistingDownloads`
- Use existing `verifyFileExists` and `clearAudioFileDownloadStatus` helpers
- Test: mark a file as downloaded in DB, delete from disk, verify reconciliation clears DB record

**Step 3: Now playing metadata verification** (diagnostic, no code changes)

- Add test coverage for `syncPositionToStore` chapter-boundary detection
- Verify `lastSyncedChapterId` debounce works correctly across a seek that crosses chapters
- If within-chapter seek elapsed-time immediacy is needed, add targeted fix to `syncPositionToStore`

**Step 4: More screen routing** (no code changes needed)

- Existing `router.push` pattern is correct
- Verify visually on iOS native tabs and cross-platform Tabs that hidden-tab navigation works

---

## Anti-Patterns to Avoid in This Milestone

### Do not add a new updateNowPlayingMetadata call path

The coordinator bridge has two call sites for `updateNowPlayingMetadata` (in
`syncPositionToStore` and `syncStateToStore`), both guarded by `lastSyncedChapterId`. Adding
a third call site (e.g., directly in `executeSeek` or in a SEEK event handler) would break
the deduplication and potentially cause rapid-fire calls during seeks.

### Do not write download state to Zustand

Downloads have no Zustand state currently, and they should not gain any. Progress is
delivered via callbacks subscribed directly to `DownloadService`. Adding Zustand for download
progress would require a new slice and create a second source of truth. The callback pattern
is sufficient.

### Do not implement iCloud exclusion as an Expo Module (Option B) without changing the wrapper

The existing `iCloudBackupExclusion.ts` uses `NativeModules.ICloudBackupExclusion`. If the
native implementation uses `ExpoModulesCore`, the wrapper must change to use
`requireNativeModule`. Either implementation works, but they are not interchangeable. Option
A (legacy native module) requires zero TypeScript changes.

### Do not dispatch CHAPTER_CHANGED from PlayerBackgroundService

`CHAPTER_CHANGED` exists in the type system but is currently never dispatched. Chapter
detection happens positionally in `syncPositionToStore`. Dispatching `CHAPTER_CHANGED` from
BGS would require implementing chapter boundary detection in BGS AND would require the
coordinator's `syncStateToStore` to handle it differently (it currently reads chapter from
`this.context.currentChapter`, not `store.player.currentChapter`). The existing positional
detection is simpler and correct.

---

## Sources

All findings based on direct codebase analysis (HIGH confidence):

- `src/services/coordinator/PlayerStateCoordinator.ts` — complete bridge implementation (lines 680–758)
- `src/services/DownloadService.ts` — download lifecycle, `restoreExistingDownloads`, iCloud call sites
- `src/lib/iCloudBackupExclusion.ts` — TypeScript wrapper (complete), native module gap
- `src/stores/slices/playerSlice.ts` — `updateNowPlayingMetadata` implementation (lines 576–627)
- `src/app/(tabs)/_layout.tsx` — tab configuration, routing
- `src/app/(tabs)/more/index.tsx` — hidden tab routing pattern (line 142)
- `src/services/coordinator/transitions.ts` — `CHAPTER_CHANGED` as no-op event (line 161)
- `src/types/coordinator.ts` — `CHAPTER_CHANGED` event type definition
- Project MEMORY.md — Phase 4 Plan 02 decision re: BGS chapter-change retention
