# Stack Research: v1.1 Bug Fixes & Polish

**Project:** abs-react-native (SideShelf) — v1.1 milestone
**Researched:** 2026-02-20
**Confidence:** HIGH for items 1-4 (source code verified); MEDIUM for item 5 (domain pattern)

---

## Executive Decision Summary

Five targeted questions, five direct answers:

1. **iCloud exclusion native module** — The native Objective-C code (`NSURLIsExcludedFromBackupKey` + `setResourceValue:forKey:error:`) is correct. The bug is that `withExcludeFromBackup` is NOT registered in `app.config.js`. Add it to `plugins:`. Two secondary concerns: the file must exist before calling `setResourceValue`, and legacy `NativeModules` access works under the New Architecture interop layer in Expo SDK 54 / RN 0.81 but needs migration before SDK 55.
2. **RNTP metadata for skip forward/back** — Use `updateNowPlayingMetadata()`, not `updateMetadataForTrack()`. The former updates the lock screen display only (no queue mutation); the latter mutates the underlying track object and has a known Android artwork bug in 4.1.1/4.1.2.
3. **Expo Router cross-tab navigation** — `router.push("/(tabs)/series")` works from any tab, including the More screen. The existing `navigateToTabDetail()` helper in `src/lib/navigation.ts` handles the case where the tab's index needs to be in the stack first. No API additions needed.
4. **Loading skeleton UI** — Use `react-native-shimmer-placeholder` with the already-installed `expo-linear-gradient`. No new native module needed. `createShimmerPlaceholder(LinearGradient)` gives a component-level shimmer with `visible` prop.
5. **Download orphan repair** — Pattern is already implemented in `DownloadService.repairDownloadStatus()`. The gap is scheduling: it only runs on demand. Add a startup scan that walks all DB records marked as `downloaded` and runs `verifyFileExists()` against each.

---

## Area 1: iCloud Backup Exclusion Native Module

### What the module does (verified correct)

The Objective-C implementation in `plugins/excludeFromBackup/ios/ICloudBackupExclusion.m` uses the correct iOS API:

```objc
BOOL success = [fileURL setResourceValue:@YES
                                  forKey:NSURLIsExcludedFromBackupKey
                                   error:&error];
```

`NSURLIsExcludedFromBackupKey` is the Apple-documented key for excluding files from iCloud backup. `NSURL setResourceValue:forKey:error:` is the correct method to set it. Apple's QA1719 documents this as the official approach. The Objective-C code is correct.

Confidence: HIGH (Apple Developer Documentation, confirmed against source)

### Root Cause of "Not Working"

The plugin (`withExcludeFromBackup`) is **not registered in `app.config.js`**. The `plugins:` array in `app.config.js` contains `expo-router`, `expo-splash-screen`, `expo-font`, and `expo-web-browser` — but NOT `withExcludeFromBackup`. Without registration, `expo prebuild` never copies the `.m`/`.h` files into `ios/SideShelf/Modules/` and never adds them to the Xcode project. The TypeScript wrapper finds `NativeModules.ICloudBackupExclusion` as `null` at runtime.

**Fix:** Add the plugin to `app.config.js`:

```js
const withExcludeFromBackup = require('./plugins/excludeFromBackup/withExcludeFromBackup');

// In plugins array:
withExcludeFromBackup,
```

Then run `expo prebuild --clean` to regenerate the `ios/` directory with the module compiled in.

### Secondary Concern 1: File Must Exist Before Setting Attribute

`setResourceValue:forKey:error:` fails if the file does not yet exist on disk. Apple documentation states the resource value can only be set on an existing filesystem path. The current code in `DownloadService.ts` calls `setExcludeFromBackup()` after the download completes — which is correct timing. No change needed here; but callers that call it proactively on paths that don't exist yet will get a silent failure.

Confidence: HIGH (Apple Developer Documentation confirms requirement)

### Secondary Concern 2: New Architecture Compatibility

The module uses the legacy bridge pattern (`RCT_EXPORT_MODULE`, `RCTBridgeModule`, `NativeModules`). In Expo SDK 54 (React Native 0.81), the New Architecture interop layer is active by default (`newArchEnabled: true` in `app.config.js`). The interop layer supports legacy `RCT_EXPORT_MODULE` modules through a compatibility shim — confirmed as working in 0.81.

**Important:** SDK 54 is the last version where the legacy architecture is supported. SDK 55 will require migration to a TurboModule. For this milestone, the legacy module is fine. Flag for migration before any SDK 55 upgrade.

Confidence: MEDIUM (Expo changelog + React Native new architecture docs; not directly tested on this codebase)

Sources:

- Apple Developer Documentation: https://developer.apple.com/documentation/foundation/nsurlisexcludedfrombackupkey
- Expo SDK 54 changelog: https://expo.dev/changelog/sdk-54
- React Native New Architecture interop: https://docs.expo.dev/guides/new-architecture/

---

## Area 2: react-native-track-player — updateNowPlayingMetadata for Skip Controls

### Two distinct APIs (verified from installed source)

Source verified from `/node_modules/react-native-track-player/src/trackPlayer.ts`:

**`updateMetadataForTrack(trackIndex, metadata)`**

- Updates metadata on the underlying track object in the queue.
- Required when you want the track's title/artist/artwork to persist in the queue across track changes.
- Has a known bug in 4.1.1/4.1.2: clears artwork on Android (GitHub Issue #2287).
- `TrackMetadataBase` fields: `title`, `album`, `artist`, `duration`, `artwork`, `description`, `genre`, `date`, `rating`, `isLiveStream`.

**`updateNowPlayingMetadata(metadata)`**

- Updates the lock screen / Now Playing Center display only.
- Does NOT mutate the track object in the queue.
- Accepts `NowPlayingMetadata`, which extends `TrackMetadataBase` with one additional field: `elapsedTime?: number`.
- `elapsedTime` is iOS-only: sets the elapsed time scrubber position in the Now Playing Center independently of the native player's actual position.

```typescript
// From NowPlayingMetadata.ts (installed source):
export interface NowPlayingMetadata extends TrackMetadataBase {
  elapsedTime?: number;
}
```

Confidence: HIGH (verified from installed node_modules source)

### Current Usage Assessment

The existing code in `playerSlice.updateNowPlayingMetadata()` calls `TrackPlayer.updateMetadataForTrack()` (not `updateNowPlayingMetadata()`). This is intentional — it updates the queue track metadata so chapter title/duration shows correctly. However, it carries the Android artwork bug risk.

For the chapter-progress use case (showing chapter elapsed time in the lock screen scrubber), `updateNowPlayingMetadata()` with `elapsedTime` is the right call. The `elapsedTime` property on `NowPlayingMetadata` is NOT available on `TrackMetadataBase` (used by `updateMetadataForTrack`). The current code works around this via `@ts-ignore`.

### When to Call After Skip

After a skip forward/backward, the Now Playing Center metadata (chapter title, duration, elapsed time) goes stale because the position has changed and a chapter boundary may have been crossed. The correct pattern:

1. Dispatch `SEEK` event (already done in `handleRemoteJumpForward/Backward`)
2. After seek resolves, call `updateNowPlayingMetadata()` with updated `elapsedTime` and possibly updated `title` (if chapter boundary crossed)

The coordinator's `syncToStore` bridge is the correct place to trigger metadata refresh after a SEEK event resolves, since it has access to the updated chapter context.

### Capability Configuration

Skip forward/backward capabilities are already configured in `trackPlayerConfig.ts`:

```typescript
capabilities: [
  Capability.JumpBackward,
  Capability.JumpForward,
  // ...
],
forwardJumpInterval: forwardInterval,
backwardJumpInterval: backwardInterval,
```

`configureTrackPlayer()` is called after `updateMetadataForTrack()` in `updateNowPlayingMetadata()`. This is defensive — capabilities shouldn't need refreshing after metadata updates. It's safe to keep but not strictly necessary on every metadata update.

Confidence: HIGH (verified from installed RNTP source and existing codebase)

Sources:

- RNTP source (installed): `/node_modules/react-native-track-player/src/trackPlayer.ts`
- RNTP NowPlayingMetadata type: `/node_modules/react-native-track-player/src/interfaces/NowPlayingMetadata.ts`
- RNTP Android artwork bug: https://github.com/doublesymmetry/react-native-track-player/issues/2287

---

## Area 3: Expo Router — Cross-Tab Navigation from More Screen

### How It Works

Expo Router uses file-based routing. Tabs are defined by directories under `src/app/(tabs)/`. From any screen, `router.push("/(tabs)/series")` navigates to the Series tab's index screen and switches the active tab.

The existing `navigateToTabDetail()` helper in `src/lib/navigation.ts` already handles the correct pattern for navigating to a detail route within an uninitialized tab:

```typescript
export function navigateToTabDetail(router: Router, tabPath: string, detailPath: string): void {
  router.push(tabPath as Href); // Push index first (initializes stack)
  setImmediate(() => {
    router.push(detailPath as Href); // Then push detail
  });
}
```

Convenience wrappers `navigateToSeries()` and `navigateToAuthor()` are already defined.

Confidence: HIGH (verified from existing codebase source)

### The More Screen Navigation Pattern

The More screen's `hiddenTabsData` mechanism already handles navigating to hidden tabs:

```typescript
onPress: () => router.push(`/${tab.name}`);
```

This means `router.push("/series")` and `router.push("/authors")` are already in use when those tabs are hidden. This is valid Expo Router usage — `router.push` to a tab path switches the active tab and renders the tab's index screen.

### Known Limitation

When navigating from More → a tab's nested route (e.g., a specific series), directly pushing the dynamic route without first pushing the index makes that dynamic route the stack root in the target tab, preventing back navigation to the list. This is exactly what `navigateToTabDetail()` was built to solve.

No new APIs needed. The pattern is already implemented.

Confidence: HIGH (verified from codebase; consistent with Expo Router docs)

Sources:

- Expo Router navigation docs: https://docs.expo.dev/router/basics/navigation/
- Expo Router nesting navigators: https://docs.expo.dev/router/advanced/nesting-navigators/
- Existing: `src/lib/navigation.ts`

---

## Area 4: Loading Skeleton / Shimmer UI

### Recommendation: react-native-shimmer-placeholder with expo-linear-gradient

**Why:** `expo-linear-gradient` is already in `package.json` as a first-party Expo package with no additional native module install required. `react-native-shimmer-placeholder` wraps any LinearGradient component via a factory function, meaning zero new native dependencies.

Install:

```bash
npm install react-native-shimmer-placeholder
```

No `expo prebuild --clean` required. No Pods changes. Pure JS with existing `expo-linear-gradient` native layer.

**Usage pattern:**

```typescript
import { createShimmerPlaceholder } from 'react-native-shimmer-placeholder';
import { LinearGradient } from 'expo-linear-gradient';

const ShimmerPlaceholder = createShimmerPlaceholder(LinearGradient);

// In component:
<ShimmerPlaceholder
  visible={isLoaded}
  style={{ width: 200, height: 20, borderRadius: 4 }}
>
  <Text>{title}</Text>
</ShimmerPlaceholder>
```

When `visible={false}`, renders the animated shimmer. When `visible={true}`, renders children.

### Alternatives Considered

| Option                                           | Why Not                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Moti skeleton                                    | Requires `moti` package (~40KB); uses `react-native-reanimated` worklets — adds complexity for a loading indicator |
| react-native-fast-shimmer (Callstack)            | Uses `react-native-svg` for gradients — new native dependency; overkill for this use case                          |
| Hand-rolled with expo-linear-gradient + Animated | Feasible but fragile; `react-native-shimmer-placeholder` is maintained and handles animation lifecycle correctly   |
| react-native-skeleton-placeholder                | Different lib, requires `react-native-linear-gradient` (not the Expo version) — native install required            |

### What NOT to use

Do not reach for `moti` or `react-native-reanimated`-based skeletons. `react-native-reanimated` is already installed (v4.1.1), but adding Moti creates a large dependency for a shimmer effect that `react-native-shimmer-placeholder` handles with zero native overhead.

Confidence: HIGH for approach (expo-linear-gradient already installed, shimmer-placeholder verified with it); MEDIUM for specific library version (npm registry verified, not tested in this repo yet)

Sources:

- react-native-shimmer-placeholder GitHub: https://github.com/tomzaku/react-native-shimmer-placeholder
- Callstack fast-shimmer comparison: https://www.callstack.com/blog/performant-and-cross-platform-shimmers-in-react-native-apps

---

## Area 5: react-native-background-downloader — Orphaned Download Record Detection

### Current State (existing implementation)

`DownloadService.repairDownloadStatus(libraryItemId)` is already implemented and correct:

1. Queries DB for all audio files of a library item where `downloadStatus = 'downloaded'`
2. Calls `verifyFileExists(file.downloadInfo.downloadPath)` for each
3. If missing at stored path, tries `getDownloadPath(libraryItemId, file.filename)` (current container)
4. If found at new path, calls `markAudioFileAsDownloaded()` with corrected path
5. Returns count of repaired files

The logic is sound. The gap is **trigger**: `repairDownloadStatus` is only called on-demand from the storage diagnostics screen, not proactively.

### Recommended Pattern: Startup Scan

Add a startup reconciliation pass in `DownloadService.initialize()` that walks all records in the `audio_files` table where `downloadStatus = 'downloaded'` and verifies each file exists on disk. This is the standard pattern for file-backed databases (similar to what iOS Photos, Podcasts, and Safari offline reader use internally).

```typescript
// Pseudocode for startup scan
private async reconcileDownloadedFiles(): Promise<void> {
  const allDownloaded = await getAudioFilesWithStatus('downloaded'); // new DB query
  for (const file of allDownloaded) {
    const exists = await verifyFileExists(file.downloadInfo.downloadPath);
    if (!exists) {
      // Try iOS container path repair first
      await this.repairDownloadStatus(file.libraryItemId);
      // If still missing after repair, mark as not-downloaded
      const stillMissing = await verifyFileExists(file.downloadInfo.downloadPath);
      if (stillMissing) {
        await markAudioFileAsNotDownloaded(file.id);
      }
    }
  }
}
```

The DB helper query (`getAudioFilesWithStatus`) is the only missing piece — `audio_files` table and schema already exist.

### Known Pattern: iOS Container Path Migration

iOS changes the app container path on reinstall and some updates. `DownloadService.repairDownloadStatus()` already handles this by comparing the stored path against `getDownloadPath(libraryItemId, filename)` which constructs the current-container path. This is the correct approach.

### What NOT to Add

Do not add a background file watcher or `NSFilePresenter` observer. The downloads directory is under the app container which only this app writes to. A scan-on-launch is sufficient and avoids background thread complexity.

Confidence: MEDIUM (pattern derived from existing implementation; "startup scan" is domain standard but not documented as a RNBD-specific pattern)

Sources:

- Existing: `src/services/DownloadService.ts` (lines 462-606)
- Existing: `src/lib/fileSystem.ts` (`verifyFileExists`)

---

## Stack Impact Summary

| Area                   | New Dependency                     | New Native Module                           | Config Change                 |
| ---------------------- | ---------------------------------- | ------------------------------------------- | ----------------------------- |
| iCloud exclusion       | None                               | None (exists, unregistered)                 | `app.config.js` plugins array |
| RNTP metadata          | None                               | None                                        | None                          |
| Expo Router navigation | None                               | None                                        | None                          |
| Skeleton/shimmer UI    | `react-native-shimmer-placeholder` | None (uses existing `expo-linear-gradient`) | None                          |
| Download orphan repair | None                               | None                                        | None                          |

**Total new native installs required: 0**
**Total new packages required: 1** (`react-native-shimmer-placeholder`, JS-only)

---

## Installation

```bash
# The only new package needed for this milestone:
npm install react-native-shimmer-placeholder

# No expo prebuild needed for shimmer-placeholder.
# DO need expo prebuild --clean after fixing app.config.js:
npm run ios  # which runs expo prebuild --clean && expo run:ios
```

---

## Versions Verified

| Package                          | Installed Version | Relevant API                                                 | Confidence                      |
| -------------------------------- | ----------------- | ------------------------------------------------------------ | ------------------------------- |
| react-native-track-player        | 4.1.2             | `updateNowPlayingMetadata`, `NowPlayingMetadata.elapsedTime` | HIGH (source read)              |
| expo-linear-gradient             | 14.x (via expo)   | Used by shimmer-placeholder                                  | HIGH (package.json)             |
| expo-router                      | ~6.0.14           | `router.push("/(tabs)/series")` cross-tab                    | HIGH (source + docs)            |
| expo                             | 54.0.21           | New Architecture interop for legacy modules                  | MEDIUM (Expo docs)              |
| react-native                     | 0.81.5            | NativeModules interop layer active                           | MEDIUM (RN docs)                |
| react-native-shimmer-placeholder | 2.x (latest)      | `createShimmerPlaceholder(LinearGradient)`                   | MEDIUM (npm, not yet installed) |

---

## What NOT to Add

| Do Not Add                       | Why                                             | Use Instead                                          |
| -------------------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| `moti`                           | Large dep (~40KB), complex for shimmer use case | `react-native-shimmer-placeholder`                   |
| `react-native-fast-shimmer`      | Requires `react-native-svg` (new native dep)    | `react-native-shimmer-placeholder`                   |
| `@shopify/react-native-skia`     | Extreme overkill for skeleton UI                | `react-native-shimmer-placeholder`                   |
| TurboModule for iCloud exclusion | Not needed for SDK 54 target                    | Fix plugin registration first, migrate before SDK 55 |
| `NSFilePresenter` file watcher   | Background complexity, not needed               | Startup reconciliation scan                          |
| XState                           | Existing coordinator is correct                 | Keep custom FSM                                      |

---

_Stack research for: abs-react-native v1.1 Bug Fixes & Polish milestone_
_Researched: 2026-02-20_
