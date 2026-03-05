# RNBD Fork Diff: `spike-event-queue` (3.2.6) vs Mainline (4.5.3)

**Author:** Phase 13 Research / Plan 13-01
**Date:** 2026-03-05
**Status:** Final — permanent record for 13-02 executor
**Confidence:** HIGH (based on direct source inspection of fork node_modules and mainline CDN source)

---

## 1. Summary

This document captures the complete API surface difference between the currently-installed fork of `@kesha-antonov/react-native-background-downloader` (branch `clayreimann/react-native-background-downloader#spike-event-queue`, version 3.2.6) and the mainline release targeting version 4.5.3. The migration consists of four breaking changes that affect `DownloadService.ts`:

1. **Start download:** `RNBackgroundDownloader.download(opts)` (auto-starts) → `createDownloadTask(opts)` + explicit `.start()` call after handler registration.
2. **Recover existing:** `RNBackgroundDownloader.checkForExistingDownloads()` → `getExistingDownloadTasks()`.
3. **Import style:** Default export (`import RNBackgroundDownloader from '...'`) → named exports only (`import { createDownloadTask, getExistingDownloadTasks, setConfig } from '...'`).
4. **Async pause/resume/stop:** Previously synchronous `void` methods → now return `Promise<void>`; fire-and-forget still works but `void` prefix should be added to calls that do not await.

No other DownloadService call sites require changes. Event shapes, task state strings, metadata format, and the iCloud exclusion plugin are all unaffected.

---

## 2. Fork vs Mainline: Complete API Diff Table

| Concept                  | Fork (3.2.6, installed)                                                                                   | Mainline (4.5.3, target)                                                                                                | DownloadService Impact                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Start download**       | `RNBackgroundDownloader.download(opts)` — returns task, auto-starts immediately                           | `createDownloadTask(opts)` — returns task, **then call `.start()`**                                                     | 1 call site in `downloadAudioFile()` (~line 520). Handlers must be registered BEFORE `.start()`.                                            |
| **Recover existing**     | `RNBackgroundDownloader.checkForExistingDownloads()` → `Promise<DownloadTask[]>`                          | `getExistingDownloadTasks()` → `Promise<DownloadTask[]>`                                                                | 1 call site in `initialize()` (~line 86). Rename only — behavior identical.                                                                 |
| **Set global config**    | `RNBackgroundDownloader.setConfig({ progressInterval, isLogsEnabled })`                                   | `setConfig({ progressInterval, isLogsEnabled, ...moreOptional })`                                                       | 1 call site in `initialize()` (~line 80). Same shape; mainline adds optional fields. Named function call replaces method on default object. |
| **Default export**       | `export default { download, checkForExistingDownloads, setConfig, ... }`                                  | Named exports only — no default object                                                                                  | Import statement changes (~lines 34–36). `import RNBackgroundDownloader from '...'` breaks at runtime in mainline.                          |
| **Event: begin**         | `task.begin(data => ...)` — `data: { expectedBytes, headers }`                                            | Same callback shape: `{ expectedBytes, headers }`                                                                       | No change to handler body.                                                                                                                  |
| **Event: progress**      | `task.progress(data => ...)` — `data: { bytesDownloaded, bytesTotal }`                                    | Same callback shape: `{ bytesDownloaded, bytesTotal }`                                                                  | No change to handler body.                                                                                                                  |
| **Event: done**          | `task.done(data => ...)` — `data: { bytesDownloaded, bytesTotal }`                                        | `{ bytesDownloaded, bytesTotal, location }` — adds `location` field                                                     | Extra `location` field is unused by DownloadService; safe to ignore. No change needed.                                                      |
| **Event: error**         | `task.error(data => ...)` — `data: { error, errorCode }`                                                  | Same callback shape: `{ error, errorCode }`                                                                             | No change to handler body.                                                                                                                  |
| **task.state values**    | `'PENDING' \| 'DOWNLOADING' \| 'PAUSED' \| 'DONE' \| 'FAILED' \| 'STOPPED'`                               | Same string set                                                                                                         | DownloadService checks `task.state === 'DONE'` (~line 1004) — unchanged and compatible.                                                     |
| **task.metadata**        | Parsed from JSON string stored natively via MMKV on `download()` call                                     | Same mechanism (JSON.stringify on write, JSON.parse on read) via MMKV                                                   | No change in format. `{ libraryItemId, audioFileId, filename }` persists across app kills identically.                                      |
| **task.pause()**         | Synchronous — returns `void`                                                                              | `async pause(): Promise<void>`                                                                                          | DownloadService calls without await (~line 375). Fire-and-forget is safe; add `void` prefix to acknowledge intentional discard.             |
| **task.resume()**        | Synchronous — returns `void`                                                                              | `async resume(): Promise<void>`                                                                                         | DownloadService calls without await (~line 393). Same — add `void` prefix.                                                                  |
| **task.stop()**          | Synchronous — returns `void`                                                                              | `async stop(): Promise<void>`                                                                                           | DownloadService calls without await (~line 413). Same — add `void` prefix.                                                                  |
| **iOS event delivery**   | Native `pendingEvents` buffer; queues events when `hasListeners = false`; flushes on `startObserving`     | `initWithDisabledObservation` — bypasses listener count gate; events always emit without queuing                        | Functionally equivalent. No events are dropped in either approach. No JS-level event queue needed in DownloadService.                       |
| **New Architecture**     | Not supported — Old Architecture bridge only                                                              | TurboModule + NativeEventEmitter dual path; autodetects at runtime                                                      | `newArchEnabled: true` already set in `app.config.js`. Mainline handles TurboModule path automatically.                                     |
| **Expo plugin**          | None bundled with fork                                                                                    | `app.plugin.js` bundled — patches AppDelegate for `handleEventsForBackgroundURLSession` and adds MMKV Gradle dependency | Must register plugin in `app.config.js` plugins array. Without it, background downloads do not call the iOS completion handler.             |
| **AppDelegate patching** | Fork had no plugin; `ios/SideShelf/AppDelegate.swift` does NOT have `handleEventsForBackgroundURLSession` | Mainline plugin adds this Swift method and bridging header import                                                       | Critical for iOS background download completion. Mainline plugin handles this automatically on `expo prebuild`.                             |
| **MMKV version**         | Fork podspec: `~> 2.0.2`                                                                                  | Mainline plugin default: `2.2.4` (configurable via `mmkvVersion` option)                                                | Minor version bump. JSON string format is compatible. No `mmkvVersion` override needed unless the build fails.                              |

---

## 3. DownloadService Call Site Mapping

### Call Site A: `initialize()` — `setConfig` (~line 80)

**Method:** `DownloadService.initialize()`

**Current fork code:**

```typescript
RNBackgroundDownloader.setConfig({
  progressInterval: this.config.progressInterval,
  isLogsEnabled: false,
});
```

**Required mainline replacement:**

```typescript
setConfig({
  progressInterval: this.config.progressInterval,
  isLogsEnabled: false,
});
```

**Rationale:** `setConfig` is now a named export. The call shape is identical. `RNBackgroundDownloader.` prefix is removed.

---

### Call Site B: `initialize()` — `checkForExistingDownloads` (~line 86)

**Method:** `DownloadService.initialize()`

**Current fork code:**

```typescript
const existingTasks = await RNBackgroundDownloader.checkForExistingDownloads();
```

**Required mainline replacement:**

```typescript
const existingTasks = await getExistingDownloadTasks();
```

**Rationale:** Renamed to `getExistingDownloadTasks` in mainline v4. Behavior identical — returns `Promise<DownloadTask[]>` of tasks that survived an app kill, with `task.metadata` already parsed from MMKV.

---

### Call Site C: `downloadAudioFile()` — `download` → `createDownloadTask` + `.start()` (~line 520)

**Method:** `DownloadService.downloadAudioFile()` (private)

**Current fork code:**

```typescript
const task = RNBackgroundDownloader.download({
  id: `${libraryItemId}_${audioFile.id}`,
  url: downloadUrl,
  destination: destPath,
  headers: {
    Authorization: `Bearer ${token}`,
  },
  metadata: {
    libraryItemId,
    audioFileId: audioFile.id,
    filename: audioFile.filename,
  },
})
  .begin((data) => {
    log.info(`Download begin for ${audioFile.filename}: ${JSON.stringify(data)}`);
  })
  .progress((data) => {
    // ... progress handling
    onProgress?.(taskInfo, data.bytesDownloaded, data.bytesTotal);
  })
  .done((data) => {
    log.info(`*** DOWNLOAD DONE EVENT FIRED *** ${audioFile.filename}: ${JSON.stringify(data)}`);
  })
  .error((data) => {
    log.info(`*** DOWNLOAD ERROR EVENT FIRED ***: ${JSON.stringify(data)}`);
  });
```

**Required mainline replacement:**

```typescript
const task = createDownloadTask({
  id: `${libraryItemId}_${audioFile.id}`,
  url: downloadUrl,
  destination: destPath,
  headers: {
    Authorization: `Bearer ${token}`,
  },
  metadata: {
    libraryItemId,
    audioFileId: audioFile.id,
    filename: audioFile.filename,
  },
});

// CRITICAL: Register ALL handlers BEFORE calling task.start()
// The `begin` event fires immediately on start and will be missed if handlers register after.
task
  .begin((data) => {
    log.info(`Download begin for ${audioFile.filename}: ${JSON.stringify(data)}`);
  })
  .progress((data) => {
    // ... progress handling
    onProgress?.(taskInfo, data.bytesDownloaded, data.bytesTotal);
  })
  .done((data) => {
    log.info(`*** DOWNLOAD DONE EVENT FIRED *** ${audioFile.filename}: ${JSON.stringify(data)}`);
  })
  .error((data) => {
    log.info(`*** DOWNLOAD ERROR EVENT FIRED ***: ${JSON.stringify(data)}`);
  });

task.start(); // REQUIRED — mainline does not auto-start on createDownloadTask()
```

**Rationale:** Mainline separates task creation from initiation. Failing to call `.start()` means downloads never begin — no error is thrown, downloads silently do nothing. Handlers must precede `.start()` to avoid missing the `begin` event (which fires immediately on start).

---

### Call Site D: Import Statement (~lines 34–36)

**Current fork code:**

```typescript
import RNBackgroundDownloader, {
  DownloadTask,
} from "@kesha-antonov/react-native-background-downloader";
```

**Required mainline replacement:**

```typescript
import {
  setConfig,
  getExistingDownloadTasks,
  createDownloadTask,
} from "@kesha-antonov/react-native-background-downloader";
import type { DownloadTask } from "@kesha-antonov/react-native-background-downloader";
```

**Rationale:** Mainline v4 exports named functions only. Importing the default object resolves to `undefined` at runtime — all `RNBackgroundDownloader.*` calls throw `TypeError: Cannot read property 'download' of undefined`.

---

### Async Method Sites: `pause`, `resume`, `stop` (fire-and-forget)

These three call sites do not require await but should add `void` to acknowledge intentional Promise discard.

**`pauseDownload()` (~line 375):**

```typescript
// Before:
taskInfo.task.pause();
// After:
void taskInfo.task.pause();
```

**`resumeDownload()` (~line 393):**

```typescript
// Before:
taskInfo.task.resume();
// After:
void taskInfo.task.resume();
```

**`cancelDownload()` (~line 413):**

```typescript
// Before:
taskInfo.task.stop();
// After:
void taskInfo.task.stop();
```

**Rationale:** Mainline returns `Promise<void>` from these methods. The existing fire-and-forget pattern is functionally correct — pause/resume/stop are best-effort operations where the native layer handles sequencing. Adding `void` silences TypeScript's "Promise returned from method is not used" warnings and makes the intent explicit.

---

## 4. Event Queue Analysis

### Fork behavior: `spike-event-queue` / `pendingEvents` buffer

The fork's defining feature is a native iOS `pendingEvents` array. When the RCTEventEmitter's `hasListeners` is `false` (i.e., no JS subscribers have called `startObserving`), native download events are pushed into `pendingEvents` rather than being emitted. When `startObserving` is finally called (triggering `hasListeners = true`), the buffer is flushed in order.

This solves a specific race condition: if a background download completes or progresses before the JS thread has attached listeners after an app cold start, events would otherwise be silently dropped. The fork prevents this with the buffer.

### Mainline behavior: `initWithDisabledObservation`

Mainline 4.5.3 takes a different approach. It initializes the native module with `initWithDisabledObservation`, which bypasses the `hasListeners` gate entirely. This means events are always emitted regardless of whether JS has called `startObserving`. There is no buffer because none is needed — events are never gated.

### Conclusion

Both approaches are functionally equivalent for DownloadService's use case: no download events are dropped in either architecture. The fork added the buffer as a defensive measure; mainline solves the same problem at the native initialization level. **No JS-level event queue is needed in DownloadService.** The plan to add queuing only if integration tests reveal ordering issues remains correct.

---

## 5. iCloud Exclusion Independence (DWNLD-04)

**File:** `plugins/excludeFromBackup/withExcludeFromBackup.ts`

**Imports in the plugin:**

```typescript
import { ConfigPlugin, withDangerousMod, withXcodeProject } from "@expo/config-plugins";
import * as fs from "fs";
import * as path from "path";
```

**Confirmed:** The `withExcludeFromBackup` plugin uses exclusively `@expo/config-plugins` primitives (`withDangerousMod`, `withXcodeProject`) to copy native Objective-C source files (`ICloudBackupExclusion.h`, `ICloudBackupExclusion.m`) and register them with the Xcode project. It contains **zero** imports of or references to `@kesha-antonov/react-native-background-downloader`.

The plugin's functionality — copying ObjC files and adding them to Xcode's compile sources — is entirely independent of which downloader package is installed. Plugin registration order in `app.config.js` does not affect either plugin's behavior.

**DWNLD-04 verdict: SAFE.** The iCloud exclusion behavior is completely unchanged after the package swap. No changes to `withExcludeFromBackup.ts` are required.

---

## 6. Expo Plugin Registration

The mainline package bundles an `app.plugin.js` that must be explicitly registered in `app.config.js`. The fork had no bundled plugin; this is a new registration.

**Required `app.config.js` change (plugins array):**

```javascript
plugins: [
  withExcludeFromBackup,          // custom plugin — unchanged, independent of downloader
  [
    "@kesha-antonov/react-native-background-downloader",
    {
      // mmkvVersion: "2.2.4"       // optional; this is already the default
      // skipMmkvDependency: false   // set true only if react-native-mmkv is already in project
    },
  ],
  "expo-router",                  // existing — no change
  // ... rest of existing plugins unchanged
],
```

**Position:** After `withExcludeFromBackup`, before `"expo-router"`.

**What the mainline plugin does:**

- **iOS:** Adds `handleEventsForBackgroundURLSession` to `AppDelegate.swift` via Swift modification. Also adds the necessary bridging header import. This method is required by iOS to call the background URL session completion handler — without it, iOS may cancel or throttle background download sessions when the app is not in the foreground.
- **Android:** Adds MMKV Gradle dependency (`com.tencent:mmkv-shared:2.2.4`) to the Android build. MMKV is the native key-value store used to persist task metadata across process deaths.

**New Architecture compatibility:** `newArchEnabled: true` is already set in `app.config.js`. The mainline 4.5.3 uses a TurboModule + NativeEventEmitter dual-path that autodetects at runtime which architecture is active. No additional configuration is required.

**Rebuild requirement:** After registering the plugin and swapping the package, a full native rebuild is mandatory:

```bash
npm run ios   # runs expo prebuild --clean && expo run:ios
```

Running the Metro bundler alone is insufficient — the AppDelegate patch is a native code change.

---

## 7. Files to Update

| File                              | Change Required                                                                                                                                         | Notes                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `package.json`                    | Replace fork URL with `@kesha-antonov/react-native-background-downloader@4.5.3`                                                                         | Remove `clayreimann/react-native-background-downloader#spike-event-queue`                            |
| `src/services/DownloadService.ts` | Import statement (Call Site D) + `setConfig` call (A) + `getExistingDownloadTasks` call (B) + `createDownloadTask` + `.start()` (C) + 3 `void` prefixes | 7 total changes across 4 logical sites                                                               |
| `src/__tests__/setup.ts`          | Update Jest mock: `download` → `createDownloadTask`, `checkForExistingDownloads` → `getExistingDownloadTasks`, add `setConfig`                          | Existing mock will cause test failures if not updated                                                |
| `app.config.js`                   | Add mainline plugin registration (see Section 6)                                                                                                        | New entry — no existing entry to replace                                                             |
| `jest.config.js`                  | Verify `transformIgnorePatterns` still includes the package name                                                                                        | Package name is unchanged (`@kesha-antonov/react-native-background-downloader`) — no change expected |

**Files that do NOT require changes:**

| File                                                                      | Reason                                                   |
| ------------------------------------------------------------------------- | -------------------------------------------------------- |
| `plugins/excludeFromBackup/withExcludeFromBackup.ts`                      | No downloader package dependency (see Section 5)         |
| `src/lib/iCloudBackupExclusion.ts`                                        | Uses `NativeModules` directly — no downloader dependency |
| `src/types/services.ts`                                                   | Defines project types only — no package import           |
| `ios/Pods/Local Podspecs/react-native-background-downloader.podspec.json` | Auto-regenerated by `expo prebuild --clean`              |
| `ios/build/generated/autolinking/autolinking.json`                        | Auto-regenerated by `expo prebuild --clean`              |
| `package-lock.json`                                                       | Auto-regenerated by `npm install`                        |

---

## 8. In-Flight Download Migration

**Completed downloads (files on disk):** Untouched. The downloaded audio files are stored in the app's Documents directory. The package swap does not modify the filesystem.

**In-progress fork-era downloads:** If the app is updated while a download is in progress (or if `getExistingDownloadTasks()` returns no matching task because MMKV was cleared between installs), the following occurs:

1. `DownloadService.initialize()` calls `getExistingDownloadTasks()` — returns empty array (no fork tasks).
2. The DB still has `isDownloaded = false` for the audio file.
3. The item appears in the UI as not-downloading (no active task in `activeDownloads` map).
4. The user can simply tap Download again to re-queue.

**The existing repair/reconciliation flow handles this correctly.** No special migration code is needed. No one-time migration flag (AsyncStorage key) is required — the existing state mismatch path is the correct behavior.

**Beta acceptability:** The app is in beta with no users in the wild. Cancelling any fork-era in-progress downloads is acceptable. If any items appear stuck after migration, the user (developer) can simply re-download.

---

## 9. Smoke Test Checklist

Execute after completing Plan 13-02 to verify restart recovery works with mainline:

1. Build and install the app with mainline 4.5.3 (`npm run ios`).
2. Log in to a local Audiobookshelf server.
3. Navigate to a library item that has not been downloaded.
4. Tap Download — confirm the progress indicator appears and percentage increases.
5. While the download is in progress (not yet complete), force-kill the app: swipe up from the App Switcher to terminate the process.
6. Wait approximately 3 seconds.
7. Relaunch the app.
8. Navigate to the same library item.
9. **Expected:** The download is either still in-progress (showing progress > 0%) with activity continuing toward 100%, OR it has already completed (item shows as downloaded).
10. **Failure:** Download is stuck at 0% with no activity, or the item appears as not-downloading with no progress retained.

If step 9 fails, the first debug step is to verify `getExistingDownloadTasks()` is returning the restored task (add a log line in `initialize()`), and check whether `task.metadata` is populated on the returned tasks.

---

## 10. Open Questions (for 13-02 Executor)

### Q1: Does the mainline Expo plugin work with `newArchEnabled: true` and Expo 54?

**What is known:** Mainline 4.5.3 uses `initWithDisabledObservation` which indicates awareness of bridge observation changes introduced with New Architecture. The plugin source (`plugin/build/index.js`) uses standard Expo plugin APIs compatible with Expo 54.

**What is uncertain:** Whether the TurboModule path in mainline 4.5.3 has been tested against the specific combination of Expo 54 + RN 0.81 in production.

**Recommendation:** Register the plugin, perform `expo prebuild --clean`, rebuild, and verify during 13-02 integration. If the TurboModule path encounters issues, the Old Architecture NativeEventEmitter fallback path in the mainline code provides a safety net. Risk is LOW.

---

### Q2: MMKV version conflict risk

**What is known:** Fork uses MMKV `~> 2.0.2` (from its podspec). Mainline plugin defaults to MMKV `2.2.4`. The project does not use `react-native-mmkv` as a direct dependency (confirmed by `package.json`). MMKV stores metadata as JSON strings — format is fully compatible across versions.

**What is uncertain:** Whether the MMKV version bump from `2.0.x` to `2.2.4` introduces any breaking native API changes that might affect the background downloader's internal MMKV usage.

**Recommendation:** Accept the `2.2.4` default — no `mmkvVersion` override needed in the plugin config. If the iOS or Android build fails with MMKV errors, add `"mmkvVersion": "2.0.2"` as a fallback. Risk is LOW.

---

### Q3: Does `task.metadata` survive an app kill with mainline 4.5.3 the same way as fork 3.2.6?

**What is known:** Both fork and mainline use MMKV to persist task metadata as JSON strings at the native layer. `getExistingDownloadTasks()` returns restored tasks with `task.metadata` already parsed. The metadata format used by DownloadService (`{ libraryItemId, audioFileId, filename }`) is a plain JSON object.

**What is uncertain:** MMKV storage is typically cleared on app reinstall (which is acceptable). The key question is whether MMKV persistence survives a force-kill (not a reinstall), which is the restart recovery scenario.

**Recommendation:** Verify via the Smoke Test Checklist (Section 9) during 13-02 testing. If metadata does not survive app kill, a fallback could be added to look up `libraryItemId` from the task `id` string (which is `${libraryItemId}_${audioFileId}`). This is a contingency only — based on source code analysis, MMKV should survive process death.

---

## Sources

- **Installed fork:** `node_modules/@kesha-antonov/react-native-background-downloader/index.ts` — fork API surface (direct file read, HIGH confidence)
- **Installed fork:** `node_modules/@kesha-antonov/react-native-background-downloader/lib/DownloadTask.ts` — fork DownloadTask class
- **Installed fork:** `node_modules/@kesha-antonov/react-native-background-downloader/ios/RNBackgroundDownloader.h/.m` — fork native event queue (`pendingEvents`)
- **Mainline CDN:** `cdn.jsdelivr.net/npm/@kesha-antonov/react-native-background-downloader@4.5.3/src/index.ts` — named exports (HIGH confidence)
- **Mainline CDN:** `cdn.jsdelivr.net/npm/@kesha-antonov/react-native-background-downloader@4.5.3/src/DownloadTask.ts` — async pause/resume/stop, `start()`
- **Mainline CDN:** `cdn.jsdelivr.net/npm/@kesha-antonov/react-native-background-downloader@4.5.3/src/types.ts` — DownloadTask interface, Metadata type
- **Mainline CDN:** `cdn.jsdelivr.net/npm/@kesha-antonov/react-native-background-downloader@4.5.3/ios/RNBackgroundDownloader.mm` — `initWithDisabledObservation`
- **Mainline CDN:** `cdn.jsdelivr.net/npm/@kesha-antonov/react-native-background-downloader@4.5.3/plugin/build/index.js` — Expo plugin (AppDelegate + MMKV Gradle)
- **Project source:** `src/services/DownloadService.ts` — call site line numbers verified by direct read
- **Project source:** `plugins/excludeFromBackup/withExcludeFromBackup.ts` — plugin independence confirmed (zero downloader imports)
- **Project source:** `src/__tests__/setup.ts` — existing Jest mock verified

**Research date:** 2026-03-04 — Valid until 2026-04-04 (stable library)
