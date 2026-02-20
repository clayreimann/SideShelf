# Pitfalls: v1.1 Bug Fixes & Polish

**Domain:** React Native audiobook app — adding polish and bug fixes to an existing production coordinator architecture
**Researched:** 2026-02-20
**Confidence:** HIGH — grounded in actual codebase analysis and targeted research on each topic area

---

## Critical Pitfalls

### Pitfall 1: iCloud Exclusion Applied Before File Exists

**What goes wrong:**
`NSURLIsExcludedFromBackupKey` is applied via `setExcludeFromBackup(downloadPath)` immediately after the background downloader signals completion. If the native call fires before the OS has flushed the file to disk, `setResourceValue:forKey:error:` fails silently — no exception, `success: false`, no error populated. The attribute is never set, and the file gets backed up to iCloud anyway. This failure is invisible because the DownloadService already catches and swallows the error at `DownloadService.ts:288-294` and continues.

**Why it happens:**
The background downloader's `done` callback fires when the download task finishes, but there can be a brief window between the native callback firing and the file being fully flushed and queryable by the file system. The native module calls `NSURL.setResourceValue` directly on the path without first verifying the file exists via `NSFileManager.fileExistsAtPath`.

**Consequences:**

- Downloaded audio files are silently backed up to iCloud
- Users with large libraries may exhaust iCloud storage
- Apple may reject the app if backup size is excessive

**Prevention:**
In the native Swift implementation, verify file existence with `FileManager.default.fileExists(atPath: url.path)` before calling `url.setResourceValues`. If the file does not exist yet, retry with a short delay (100ms, once) or return an explicit error rather than silently returning `success: false`. On the JS side, log a warning (not just silently continue) when `setExcludeFromBackup` returns `success: false`.

**Detection:**

- Add an `isExcludedFromBackup` verification check after setting: call `isExcludedFromBackup(downloadPath)` and log a warning if `excluded === false`
- Check iCloud backup size via iOS Settings → iCloud → Manage Account Storage
- Look for `Failed to set iCloud exclusion` in logs, but note that the error may not appear if the native module swallows the failure

**Phase to address:** Applies to the iCloud exclusion phase. Low native-side risk if the file always exists when the callback fires in practice, but the silent failure path is unacceptable.

---

### Pitfall 2: iCloud Exclusion Attribute Resets After File Operations

**What goes wrong:**
Apple's documentation states that "some operations commonly made to user documents will cause this property to be reset to false." Specifically, copying a file does not preserve `NSURLIsExcludedFromBackupKey` — the copy starts with the attribute cleared. The app's path repair logic in `repairDownloadStatus` calls `markAudioFileAsDownloaded(file.id, expectedPath)` to update the database with the corrected container path, but it never re-applies the iCloud exclusion to the file at the new path. This means after any container path migration (which happens on every app update for absolute-path-stored files), the exclusion attribute on the physical file at the new path is not set.

**Why it happens:**
`repairDownloadStatus` was written to fix path staleness in the database. It correctly calls `verifyFileExists(expectedPath)` and then `markAudioFileAsDownloaded`. However, it does not call `setExcludeFromBackup(expectedPath)` as part of the repair. The existing `DownloadService.ts:575-579` repair path has no iCloud exclusion step.

**Consequences:**

- After every iOS app container path change, all previously downloaded files lose their backup exclusion
- The attribute is re-applied only when the user re-downloads, not during repair
- Silent backup growth proportional to library size on every app update

**Prevention:**
Add `await setExcludeFromBackup(expectedPath)` immediately after the `markAudioFileAsDownloaded` call in `repairDownloadStatus`. Also consider a startup reconciliation pass that calls `isExcludedFromBackup` on each downloaded file and re-applies the attribute if missing. The `isLibraryItemDownloaded` path already verifies file existence — it is the right hook for this reconciliation.

**Detection:**

- Add logging in `repairDownloadStatus` that verifies exclusion status after repair
- Test by downloading a book, force-killing the app, reinstalling, and checking iCloud backup growth

**Phase to address:** Must be addressed in the same phase as the initial iCloud exclusion implementation — they are one atomic feature.

---

### Pitfall 3: Download Reconciliation Scan Races Active Downloads

**What goes wrong:**
A download state reconciliation scan reads `getAudioFilesWithDownloadInfo` from the DB and compares against disk state. If a download is in progress at the same time (task state = `DOWNLOADING`), the file exists on disk but may be a partial file. The reconciliation scan sees the file as "present on disk" (`verifyFileExists` returns `true` for partial files because the file handle is open), marks it as downloaded, and `markAudioFileAsDownloaded` fires — while the download task is still running. When the task later completes, the `done` handler calls `markAudioFileAsDownloaded` again (idempotent in the DB), but the UI may have already shown a "downloaded" badge prematurely.

**Why it happens:**
The `activeDownloads` Map in `DownloadService` is the source of truth for in-progress downloads, but a reconciliation scan written separately (e.g., triggered at startup) would not check this Map before querying the DB + disk. The existing `isLibraryItemDownloaded` method has a TODO comment (`// TODO: Could mark as not downloaded in database here`) indicating the partial-file case is known but unhandled.

**Consequences:**

- Prematurely marking a partial file as downloaded causes playback failure (audio decoder rejects truncated files)
- If the download task is cancelled after premature marking, the DB shows "downloaded" but the file is partial

**Prevention:**
Before any reconciliation scan, check `downloadService.isDownloadActive(libraryItemId)`. Skip reconciliation for any item with an active download. Alternatively, the scan should compare file size on disk against the expected size from the DB (`audioFiles.size` column) to distinguish partial from complete files. Only mark as downloaded when disk size matches expected size within a small tolerance (e.g., 99% or exact match).

**Detection:**

- Reconciliation fires while a download is active → "downloaded" badge appears → player fails to load
- Look for error logs from TrackPlayer when loading a partial audio file

**Phase to address:** Download tracking reconciliation phase. Guard must be added before the reconciliation scan is triggered at startup.

---

## Moderate Pitfalls

### Pitfall 4: updateNowPlayingMetadata Feedback Loop via configureTrackPlayer

**What goes wrong:**
`updateNowPlayingMetadata` in `playerSlice.ts:576-627` calls `await configureTrackPlayer()` at line 619 as a "double check that we don't lose the trackplayer controls." `configureTrackPlayer` presumably calls `TrackPlayer.updateOptions()` or similar. On some TrackPlayer versions, `updateOptions` or capability updates cause the native player to re-emit a state change event (`NATIVE_STATE_CHANGED`), which flows through the event bus to the coordinator. The coordinator processes `NATIVE_STATE_CHANGED` and calls `syncStateToStore`, which checks if the chapter changed and potentially calls `updateNowPlayingMetadata` again.

**Why it happens:**
`updateNowPlayingMetadata` is called from `syncPositionToStore` and `syncStateToStore` in the coordinator bridge (lines 702-706 and 749-753 of `PlayerStateCoordinator.ts`). The guard is `currentChapterId !== this.lastSyncedChapterId`. After `updateNowPlayingMetadata` runs, `lastSyncedChapterId` is set correctly. The loop breaks because the guard prevents a second call for the same chapter. However, if `configureTrackPlayer()` triggers an event that causes the coordinator to call `syncStateToStore` again for the same chapter _before_ `lastSyncedChapterId` is updated (due to async timing), a second call can slip through.

**Consequences:**

- Rapid-fire lock screen metadata updates causing flicker
- Increased bridge overhead during chapter transitions

**Prevention:**
Set `this.lastSyncedChapterId = currentChapterId` synchronously before the `store.updateNowPlayingMetadata()` call (not after the promise resolves). The current code sets it synchronously at line 702 before the `.catch`, which is correct. Verify that `configureTrackPlayer()` inside `updateNowPlayingMetadata` does not dispatch a player event. If it does, add a second guard: a boolean `_isUpdatingNowPlaying` flag that prevents re-entrant calls.

**Detection:**

- Lock screen album art flickers on chapter change
- `totalEventsProcessed` in coordinator metrics spikes on chapter change (more than one `syncStateToStore` call per chapter crossing)
- Two `NATIVE_STATE_CHANGED` events appear in coordinator transition history within 50ms of a chapter change

**Phase to address:** Metadata + coordinator bridge phase. Verify by monitoring coordinator transition history during chapter crossings in testing.

---

### Pitfall 5: Android Artwork Cleared by updateMetadataForTrack

**What goes wrong:**
There is a confirmed bug in `react-native-track-player` v4.1.1+ (issue #2287) where calling `updateMetadataForTrack` clears the artwork on Android even when `artwork` is passed with a constant value. The `updateNowPlayingMetadata` implementation in `playerSlice.ts:607` calls `TrackPlayer.updateMetadataForTrack(activeTrackIndex, { artwork: currentTrack.coverUri || undefined, ... })`. On Android, this results in the notification and lock screen showing the chapter title but no cover art after the first chapter transition.

**Why it happens:**
Known library bug introduced after v4.1.1-RC06. The JS layer passes artwork correctly but the Android native module does not preserve the existing bitmap when only some metadata fields change.

**Consequences:**

- Android users see no cover art in notifications after chapter 1 ends
- Artwork disappears and does not recover until playback is fully restarted

**Prevention:**
Check the version of `@doublesymmetry/react-native-track-player` installed. If it is v4.1.1+, test artwork persistence on Android during a chapter transition before shipping. Workaround options: (1) call `TrackPlayer.add()` with the track including artwork before calling `updateMetadataForTrack` on Android, (2) use `TrackPlayer.updateNowPlayingMetadata()` instead of `updateMetadataForTrack` for metadata-only updates (does not touch the track object), (3) check if a newer version of the library has resolved the bug.

**Detection:**

- Chapter transition on Android → cover art disappears from notification
- Test specifically on Android physical device or emulator, not just iOS simulator

**Phase to address:** Metadata update phase. Test Android explicitly before marking complete.

---

### Pitfall 6: Expo Router Cross-Tab Navigation Creates History Stack Corruption

**What goes wrong:**
When navigating from the Library tab to the Home tab (or any sibling tab) using `router.push('/(tabs)/home')`, Expo Router adds the home route to the Library tab's stack — it does not switch tabs. The user ends up with the home content rendered inside the Library stack, with a back button that returns to the library, rather than the Home tab being activated. This is a frequent mistake when thinking in "navigate to a page" terms rather than "switch to a tab" terms.

**Why it happens:**
Expo Router's file-based routing treats `/(tabs)/home` as a route within the current navigator context. `router.push` within a tab navigator pushes onto the current tab's stack. To switch tabs, you must use `router.navigate` with the tab's index route, or use the `useRouter` API in a way that targets the tab navigator's tab-switching action rather than the stack's push action. In Expo Router v4, `router.navigate` now behaves identically to `router.push` (it no longer "unwinds" to existing routes), making this worse.

**Consequences:**

- "Home" content appears inside the Library stack with a back button
- The Home tab button appears unselected (because you're not actually on that tab)
- Android physical back button pops back to library instead of staying on home

**Prevention:**
To switch tabs, use `router.navigate` with the exact tab index route path. For this app, the tabs use `NativeTabs` from `expo-router/unstable-native-tabs`. Check whether `NativeTabs.Trigger` navigation, or a direct `router.navigate('/')` to the home index, correctly activates the tab. Use `router.replace` (not `router.push`) when you want to navigate to a tab from within another tab and don't want the original tab to have a back entry. The safe pattern: navigate to the index route of the target tab (`/home` not `/(tabs)/home`), and use `replace` if you want to clear the navigation history.

**Detection:**

- Navigate from Library to Home → Home tab button not highlighted
- Physical back button on Android goes to Library instead of staying on Home
- Navigation history shows Library → Home in the same stack

**Phase to address:** Wherever cross-tab navigation is added. Test on physical Android device (back button behavior) as well as iOS.

---

### Pitfall 7: Skeleton Flash When Content Loads Quickly

**What goes wrong:**
If library data is already in the SQLite cache, `isLoading` transitions from `true` to `false` within a single frame, causing the skeleton to flash briefly before content appears. The flash is more jarring than showing no skeleton at all. This happens with cached data where the DB query resolves in <50ms — the skeleton renders for one frame and then the content replaces it.

**Why it happens:**
The loading state is derived directly from `isLoading` without any minimum display duration. React's reconciliation batches most state updates, but a fast DB query completing synchronously between renders can cause a visible flash, especially on fast devices.

**Consequences:**

- UI glitch that makes the app look broken
- More noticeable on fast devices (where cache hits are common)

**Prevention:**
Use a "minimum display" pattern: do not hide the skeleton until at least 150-200ms have elapsed since it first appeared. Implement with `useRef` to track when the skeleton was first shown, and a `setTimeout` that prevents early dismissal:

```typescript
const skeletonShownAt = useRef<number | null>(null);

useEffect(() => {
  if (isLoading && skeletonShownAt.current === null) {
    skeletonShownAt.current = Date.now();
  }
  if (!isLoading && skeletonShownAt.current !== null) {
    const elapsed = Date.now() - skeletonShownAt.current;
    const remaining = Math.max(0, 150 - elapsed);
    setTimeout(() => setShowSkeleton(false), remaining);
  }
}, [isLoading]);
```

Alternatively: only show skeleton when the first load has no cached data (`items.length === 0 && isLoading`). If items already exist in the store, skip the skeleton and show stale content while refreshing.

**Detection:**

- Enable "Slow down animations" in iOS Simulator (Debug → Slow Animations) and navigate to a tab with cached data — the flash becomes visible at 1/5 speed
- On a physical device with fast storage, tap a tab rapidly after startup

**Phase to address:** Loading skeleton phase. Add the minimum display guard before first demo.

---

### Pitfall 8: Skeleton Animation Memory Leak on Fast Unmount

**What goes wrong:**
If a skeleton component using `Animated.loop` (from React Native's built-in `Animated`) is unmounted while the animation loop is running, the loop callback continues to fire on the interval, causing "Can't perform a React state update on an unmounted component" warnings. With Reanimated v3, the same risk exists with `withRepeat` if `cancelAnimation` is not called in the cleanup function.

**Why it happens:**
`Animated.loop(animation).start()` in a `useEffect` without a cleanup function leaves the loop running after unmount. This is a common mistake because the loop appears to "just work" — the warnings are easy to miss in development.

**Consequences:**

- Warning spam in development
- Potential memory leak if the animation holds a reference to component state
- In rare cases on older Android, continued animations on unmounted views can crash

**Prevention:**
For React Native `Animated`:

```typescript
useEffect(() => {
  const animation = Animated.loop(Animated.sequence([...]));
  animation.start();
  return () => animation.stop(); // cleanup on unmount
}, []);
```

For Reanimated v3 `withRepeat`:

```typescript
useEffect(() => {
  return () => cancelAnimation(sharedValue);
}, []);
```

If using `react-native-reanimated`'s `useSharedValue` + `withRepeat`, call `cancelAnimation(value)` in the cleanup. Prefer Reanimated v3 for skeletons since it runs on the UI thread and does not risk JS-side memory leaks.

**Detection:**

- Navigate to skeleton screen → content loads → navigate away → check for "Can't perform a React state update on an unmounted component" in console
- Use React DevTools Memory tab to check for retained component instances

**Phase to address:** Loading skeleton phase.

---

### Pitfall 9: Skeleton Dimensions Causing Layout Shift

**What goes wrong:**
If skeleton placeholder dimensions do not match the final content dimensions exactly, content appears to "jump" when it loads — the layout shifts. This is particularly bad on list screens where each item changes height, causing the entire list to reflow. In this app's library list, the cover art aspect ratio and title/author text heights must match between skeleton and real content.

**Why it happens:**
Skeleton shapes are often approximated (e.g., a fixed-height rectangle for where a variable-height text block will appear). When the real content renders with different dimensions, React Native recalculates layout and the screen visually jerks.

**Consequences:**

- Jarring visual experience on content load
- Worse on Android where layout recomputation is slightly slower than iOS

**Prevention:**
Pin skeleton item height to the minimum expected content height. Use fixed dimensions derived from the actual content's layout — measure a real list item and copy its exact heights. For the library card: measure the card height when it renders with a one-line vs two-line title, and use the common case. Avoid `numberOfLines={0}` (unconstrained) text in skeletons — it will be the wrong height.

**Detection:**

- Enable "Slow down animations" in iOS Simulator and observe the skeleton→content transition
- Layout shift is most visible when the list scrolls slightly as items load

**Phase to address:** Loading skeleton phase.

---

## Minor Pitfalls

### Pitfall 10: repairDownloadStatus Called Concurrently at Startup

**What goes wrong:**
If `repairDownloadStatus` is triggered at startup and another component also triggers `isLibraryItemDownloaded` for the same item at the same time, both functions call `verifyFileExists` and `markAudioFileAsDownloaded` (or `clearAudioFileDownloadStatus`) independently. Drizzle ORM's `onConflictDoUpdate` handles the DB write idempotently, but the scan can fire log messages for the same file from both code paths within milliseconds, making debugging confusing.

**Prevention:**
Trigger `repairDownloadStatus` once from a single entry point (e.g., the DownloadService `initialize()` method) and guard with the `isInitialized` flag. Avoid calling it from component `useEffect` hooks.

**Phase to address:** Download reconciliation phase.

---

### Pitfall 11: Large Library Performance During Download Scan

**What goes wrong:**
A full reconciliation scan calling `verifyFileExists` (which creates a `new File(path)` from `expo-file-system/next`) for every downloaded audio file in a large library (e.g., 500 audiobooks × 10 files = 5,000 `File.exists` checks) will block the JS thread for several seconds. `File.exists` in `expo-file-system/next` is synchronous.

**Prevention:**
Batch the reconciliation: process 20 items at a time with `Promise.all`, yielding with `await new Promise(r => setTimeout(r, 0))` between batches to allow other JS work to proceed. Or trigger reconciliation at a lower priority — after the user sees the first screen, not during splash/boot.

**Detection:**

- Enable JS thread frame drops monitoring in Flipper
- On a library with 50+ downloaded items, time the startup reconciliation

**Phase to address:** Download reconciliation phase.

---

### Pitfall 12: iCloud Exclusion No-Op on Android

**What goes wrong:**
The `setExcludeFromBackup` function in `iCloudBackupExclusion.ts` returns `{ success: true }` on Android without doing anything. If the caller logs "iCloud exclusion applied" unconditionally, the logs falsely suggest the operation succeeded on Android when nothing happened. This is benign for behavior (Android has no iCloud backup) but creates confusion when reading logs.

**Prevention:**
Log "iCloud exclusion skipped (non-iOS)" on Android paths rather than "iCloud exclusion applied." The current code already guards with `Platform.OS !== 'ios'` but the success return is silent. The fix is in the log message at the call site in `DownloadService.ts:286-291`.

**Phase to address:** iCloud exclusion phase.

---

## Phase-Specific Warnings

| Phase Topic                   | Likely Pitfall                                                               | Mitigation                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| iCloud exclusion              | File doesn't exist at time of `setResourceValue` call                        | Native: check `fileExists` before setting attribute; log warning on `success: false`       |
| iCloud exclusion              | Attribute not re-applied after container path repair                         | Add `setExcludeFromBackup` to `repairDownloadStatus` repair path                           |
| iCloud exclusion              | Android no-op logged as success                                              | Update log message at call site to distinguish platforms                                   |
| Download reconciliation       | Partial file marked as downloaded                                            | Check `downloadService.isDownloadActive()` before reconciling any item                     |
| Download reconciliation       | Large library blocks JS thread                                               | Batch reconciliation with yield between groups; defer after first screen                   |
| Metadata + coordinator bridge | `configureTrackPlayer()` inside `updateNowPlayingMetadata` triggers re-entry | Set `lastSyncedChapterId` before the async call; add re-entrant guard                      |
| Metadata + coordinator bridge | `updateMetadataForTrack` clears artwork on Android                           | Test on physical Android; use `updateNowPlayingMetadata` instead if artwork loss confirmed |
| Expo Router tab navigation    | `router.push` opens route in current tab stack, not as tab switch            | Use `router.navigate` to the index route of the target tab with `replace` semantics        |
| Loading skeletons             | Flash on fast content load                                                   | Minimum display duration (~150ms) before skeleton dismissal                                |
| Loading skeletons             | Animation loop memory leak                                                   | `animation.stop()` or `cancelAnimation()` in `useEffect` cleanup                           |
| Loading skeletons             | Layout shift on skeleton→content transition                                  | Pin skeleton item dimensions to measured real content dimensions                           |

---

## Sources

- Direct code analysis: `/Users/clay/Code/github/abs-react-native/src/services/DownloadService.ts` — iCloud exclusion applied in `done` callback (line 281-294), `repairDownloadStatus` missing exclusion re-application (lines 571-601), partial file detection gap in `isLibraryItemDownloaded` (line 467 TODO)
- Direct code analysis: `/Users/clay/Code/github/abs-react-native/src/lib/iCloudBackupExclusion.ts` — native module wrapper, Android no-op behavior
- Direct code analysis: `/Users/clay/Code/github/abs-react-native/src/services/coordinator/PlayerStateCoordinator.ts` — `syncPositionToStore` chapter guard (lines 695-712), `syncStateToStore` chapter guard (lines 730-758), `lastSyncedChapterId` debounce field
- Direct code analysis: `/Users/clay/Code/github/abs-react-native/src/stores/slices/playerSlice.ts` — `updateNowPlayingMetadata` calls `configureTrackPlayer()` (line 619), `updateMetadataForTrack` call (line 607)
- Direct code analysis: `/Users/clay/Code/github/abs-react-native/src/app/(tabs)/_layout.tsx` — `NativeTabs` usage, tab configuration, existing `router.replace` pattern
- Apple Developer Forums: `NSURLIsExcludedFromBackupKey` silent failure on non-existent files; attribute resets on file copy operations (Apple documentation)
- react-native-track-player issue #2287: `updateMetadataForTrack` clears artwork on Android in v4.1.1+ — [github.com/doublesymmetry/react-native-track-player/issues/2287](https://github.com/doublesymmetry/react-native-track-player/issues/2287)
- Expo Router documentation: `router.push` vs `router.navigate` vs `router.replace` behavior — [docs.expo.dev/router/basics/navigation](https://docs.expo.dev/router/basics/navigation/)
- Expo Router breaking change issue #35212: `router.navigate` in v4 behaves like `router.push` (no longer unwinds) — [github.com/expo/expo/issues/35212](https://github.com/expo/expo/issues/35212)

---

_Pitfalls research for: v1.1 Bug Fixes & Polish milestone_
_Researched: 2026-02-20_
