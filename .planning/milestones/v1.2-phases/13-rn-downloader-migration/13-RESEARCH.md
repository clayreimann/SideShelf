# Phase 13: RN Downloader Migration - Research

**Researched:** 2026-03-04
**Domain:** @kesha-antonov/react-native-background-downloader (fork 3.2.6 → mainline 4.5.3)
**Confidence:** HIGH

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Phase boundary**: Replace the custom `spike-event-queue` fork with mainline 4.5.3 — no new download features
- **Hard sequence constraint**: Plan 13-01 (spike) must fully complete before Plan 13-02 (package swap) begins
- **Spike required questions**:
  1. Full API surface diff — every method DownloadService calls, mapped from fork API to mainline API
  2. iCloud exclusion compatibility — confirm `withExcludeFromBackup` plugin works with the mainline package reference
  3. Event queue behavior difference — confirm whether mainline event delivery differs from the fork's `spike-event-queue` behavior (ordering, batching)
- **No adapter layer** — DownloadService is updated to call mainline API directly
- **Fork completely removed** from package.json and lockfile — no comment traces
- **Audit all imports** of the fork package across the codebase (confirmed: DownloadService.ts is the only runtime consumer, but check Expo plugin config, jest config, etc.)
- **Event queuing**: add only if needed — do not add preemptively
- **In-flight migration**: completed downloads on disk untouched; DB/downloader state mismatch routes through existing repair/reconciliation flow
- **No special-case migration** unless existing repair flow proves insufficient (Claude's Discretion)
- **Cancelling/wiping fork-era in-progress downloads** is acceptable if needed (beta app)
- **Test coverage**: maintain pre-migration level (currently ~25% overall; DownloadService has 0% coverage — must write startup reconciliation unit tests)
- **iCloud exclusion**: code review only — plugin config references correct mainline package name; native behavior not automatable
- **Smoke test checklist**: start download → kill app → relaunch → confirm resume (include in investigation doc or plan)

### Claude's Discretion

- Spike output form (analysis doc only, or doc + proof-of-concept)
- Whether a one-time migration flag is needed for fork → mainline transition
- Exact structure of the `docs/investigation/` spike document
- How to handle `task.metadata` format differences if discovered during 13-02

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>

## Phase Requirements

| ID       | Description                                                                                                                | Research Support                                                                                 |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| DWNLD-01 | Fork diff spike completed — fork API vs mainline 4.5.3 documented, `task.metadata` persistence across app restart verified | API surface diff table in Standard Stack section; metadata persistence analysis in Code Examples |
| DWNLD-02 | `package.json` migrated to mainline `@kesha-antonov/react-native-background-downloader@4.5.3`                              | Package swap instructions, Expo plugin registration, MMKV dependency                             |
| DWNLD-03 | `DownloadService.ts` API calls updated to mainline interface (`getExistingDownloadTasks` and renamed methods)              | Complete API diff table, call-site-by-call-site mapping in Architecture Patterns                 |
| DWNLD-04 | `withExcludeFromBackup` plugin behavior verified post-migration (v1.1 iCloud exclusion fix must not regress)               | Plugin independence analysis in Architecture Patterns; iCloud exclusion unchanged                |

</phase_requirements>

---

## Summary

The current codebase pins `@kesha-antonov/react-native-background-downloader` to a custom GitHub fork (`clayreimann/react-native-background-downloader#spike-event-queue`) at version 3.2.6. The mainline target is 4.5.3, a major version jump that changes the primary entry point from `download()` to `createDownloadTask()`, renames `checkForExistingDownloads()` to `getExistingDownloadTasks()`, makes `.start()` an explicit call rather than implicit (task auto-starts in v3), and introduces TurboModule support for New Architecture. These are the four breaking changes DownloadService must adapt to.

The fork's defining feature — `spike-event-queue` — is a native iOS `pendingEvents` buffer that queues native events when JS listeners are not yet attached (`hasListeners = false`) and flushes them on `startObserving`. The mainline 4.5.3 takes a different approach: it uses `initWithDisabledObservation` (bypassing the listener count gate entirely), meaning events always emit without queuing. This is architecturally equivalent for the use case: no events will be dropped. The fork's event queue is no longer needed.

The `withExcludeFromBackup` plugin is a completely custom Expo plugin implemented in `plugins/excludeFromBackup/` using only `@expo/config-plugins` — it is entirely independent of the downloader package reference. The mainline 4.5.3 has its own bundled Expo plugin (`app.plugin.js`) that handles `handleEventsForBackgroundURLSession` AppDelegate integration and MMKV Gradle dependency — capabilities the fork handled manually or not at all. Registering the mainline plugin in `app.config.js` replaces the need for any custom AppDelegate patching.

**Primary recommendation:** Plan 13-01 produces `docs/investigation/rnbd-fork-diff.md` as an analysis document (no proof-of-concept needed — the diff is fully deterministic from source inspection). Plan 13-02 swaps the package, registers the mainline Expo plugin, updates DownloadService to the v4 API (4 call sites, plus `.start()` call addition), and writes startup reconciliation unit tests. No migration flag is needed: the existing DB repair/reconciliation flow handles any fork-era in-progress downloads correctly.

---

## Standard Stack

### Core

| Library                                           | Version | Purpose                                      | Why Standard                                                                |
| ------------------------------------------------- | ------- | -------------------------------------------- | --------------------------------------------------------------------------- |
| @kesha-antonov/react-native-background-downloader | 4.5.3   | Background file downloads on iOS and Android | Mainline; active maintenance, New Architecture support, bundled Expo plugin |

### Fork vs Mainline: Complete API Diff

This is the authoritative diff table for DWNLD-01 and DWNLD-03.

| Concept                  | Fork (3.2.6, installed)                                                            | Mainline (4.5.3, target)                                                    | DownloadService Impact                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Start download**       | `RNBackgroundDownloader.download(opts)` — returns task, auto-starts                | `createDownloadTask(opts)` — returns task, **then call `.start()`**         | 1 call site in `downloadAudioFile()`                                                   |
| **Recover existing**     | `RNBackgroundDownloader.checkForExistingDownloads()`                               | `getExistingDownloadTasks()`                                                | 1 call site in `initialize()`                                                          |
| **Set global config**    | `RNBackgroundDownloader.setConfig({progressInterval, isLogsEnabled})`              | `setConfig({progressInterval, isLogsEnabled, ...more})`                     | 1 call site in `initialize()` — same shape, more optional fields                       |
| **Default export**       | `export default { download, checkForExistingDownloads, setConfig, ... }`           | Named exports only (no default object)                                      | Import statement changes                                                               |
| **Event: begin**         | `data` shape: `{ expectedBytes, headers }`                                         | `{ expectedBytes, headers }` — same                                         | No change                                                                              |
| **Event: progress**      | `data` shape: `{ bytesDownloaded, bytesTotal }`                                    | `{ bytesDownloaded, bytesTotal }` — same                                    | No change                                                                              |
| **Event: done**          | `data` shape: `{ bytesDownloaded, bytesTotal }`                                    | `{ bytesDownloaded, bytesTotal, location }`                                 | `done()` handler receives extra `location` — unused by DownloadService, safe to ignore |
| **Event: error**         | `data` shape: `{ error, errorCode }`                                               | `{ error, errorCode }` — same                                               | No change                                                                              |
| **task.state values**    | `'PENDING' \| 'DOWNLOADING' \| 'PAUSED' \| 'DONE' \| 'FAILED' \| 'STOPPED'`        | Same set                                                                    | DownloadService checks `task.state === 'DONE'` — unchanged                             |
| **task.metadata**        | Parsed from JSON string stored natively via MMKV                                   | Same mechanism (JSON.stringify on write, JSON.parse on read)                | No change in format                                                                    |
| **task.pause()**         | Synchronous                                                                        | `async pause(): Promise<void>`                                              | DownloadService calls `task.pause()` but does not await — works but review             |
| **task.resume()**        | Synchronous                                                                        | `async resume(): Promise<void>`                                             | Same — review                                                                          |
| **task.stop()**          | Synchronous                                                                        | `async stop(): Promise<void>`                                               | Same — review                                                                          |
| **iOS event delivery**   | Native `pendingEvents` buffer flushes on `startObserving`                          | `initWithDisabledObservation` — events always emit                          | Functionally equivalent; no JS-level queue needed                                      |
| **New Architecture**     | Not supported                                                                      | TurboModule + NativeEventEmitter dual path                                  | `newArchEnabled: true` in app.config.js — mainline handles it                          |
| **Expo plugin**          | None bundled with fork                                                             | `app.plugin.js` — patches AppDelegate for background sessions + MMKV Gradle | Must register plugin in app.config.js                                                  |
| **AppDelegate patching** | Fork had no plugin; AppDelegate did not have `handleEventsForBackgroundURLSession` | Mainline plugin adds this method in Swift                                   | Critical for background download completion on iOS                                     |
| **MMKV version**         | `~> 2.0.2` (from podspec)                                                          | Plugin defaults to MMKV 2.2.4 (configurable)                                | May need `mmkvVersion` option in plugin config                                         |

### Import Changes

**Fork (current):**

```typescript
import RNBackgroundDownloader, {
  DownloadTask,
} from "@kesha-antonov/react-native-background-downloader";

// Usage:
RNBackgroundDownloader.setConfig({...})
RNBackgroundDownloader.checkForExistingDownloads()
RNBackgroundDownloader.download({...})
```

**Mainline (target):**

```typescript
import {
  setConfig,
  getExistingDownloadTasks,
  createDownloadTask,
} from "@kesha-antonov/react-native-background-downloader";
import type { DownloadTask } from "@kesha-antonov/react-native-background-downloader";

// Usage:
setConfig({...})
getExistingDownloadTasks()
const task = createDownloadTask({...})
task.start()  // NEW: explicit start required
```

### Installation

```bash
# Remove fork
npm uninstall @kesha-antonov/react-native-background-downloader

# Install mainline
npm install @kesha-antonov/react-native-background-downloader@4.5.3

# After package change, rebuild native (required)
npm run ios  # runs expo prebuild --clean && expo run:ios
```

---

## Architecture Patterns

### Recommended Project Structure (unchanged)

The phase does not change project structure. DownloadService.ts remains in `src/services/`. Tests go in a new `src/services/__tests__/DownloadService.test.ts`.

### Pattern 1: createDownloadTask + explicit start

**What:** Mainline 4.5.3 separates task creation from task initiation.
**When to use:** Always — there is no other download initiation API.

```typescript
// Source: npm @kesha-antonov/react-native-background-downloader@4.5.3 src/index.ts
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

// Register event handlers BEFORE calling start()
task
  .begin((data) => { ... })
  .progress((data) => { ... })
  .done((data) => { ... })
  .error((data) => { ... });

task.start(); // explicit — not needed in fork
```

**Critical:** Handlers must be registered before `start()` to avoid missing the `begin` event. The `progress`, `done`, and `error` events are safe to register after start because they buffer internally.

### Pattern 2: getExistingDownloadTasks (restart recovery)

**What:** Call on app init to re-attach to downloads that survived an app kill.
**When to use:** In `DownloadService.initialize()`, replacing `checkForExistingDownloads()`.

```typescript
// Source: npm @kesha-antonov/react-native-background-downloader@4.5.3 src/index.ts
const existingTasks = await getExistingDownloadTasks();

// Each task has task.metadata already parsed from MMKV storage
// metadata shape: { libraryItemId, audioFileId, filename }
for (const task of existingTasks) {
  const { libraryItemId, audioFileId, filename } = task.metadata;
  // Re-attach event handlers then call task.resume() if needed
}
```

**Metadata persistence:** The native layer stores metadata via MMKV as a JSON string on download creation. `getExistingDownloadTasks()` returns tasks with `task.metadata` already parsed as a `Record<string, unknown>`. The metadata format used by DownloadService (`{ libraryItemId, audioFileId, filename }`) is preserved across app kills without any changes required.

### Pattern 3: Expo plugin registration (mainline only)

**What:** The mainline bundles an Expo plugin that patches AppDelegate for background URL session handling.
**When to use:** Register in `app.config.js` plugins array.

```javascript
// app.config.js — plugins array
plugins: [
  withExcludeFromBackup, // custom plugin — unchanged, independent
  [
    "@kesha-antonov/react-native-background-downloader",
    {
      // mmkvVersion: "2.2.4"       // optional; defaults to 2.2.4
      // skipMmkvDependency: false   // set true if react-native-mmkv is already in project
    },
  ],
  "expo-router",
  // ... existing plugins
];
```

**What the plugin does:**

- iOS: Adds `handleEventsForBackgroundURLSession` to AppDelegate.swift (Swift path) + bridging header import — this is required for downloads to complete when the app is in the background or killed
- Android: Adds MMKV Gradle dependency (`com.tencent:mmkv-shared:2.2.4`)

**iCloud exclusion plugin independence:** The `withExcludeFromBackup` plugin at `plugins/excludeFromBackup/withExcludeFromBackup.ts` is completely independent of the downloader package. It uses only `@expo/config-plugins` primitives to copy native ObjC files and register them with Xcode. It does not reference the downloader package by name in its implementation. Plugin registration order does not affect either plugin's behavior. DWNLD-04 is confirmed safe: iCloud exclusion behavior is unchanged after migration.

### Pattern 4: pause/resume with async awareness

**What:** In mainline 4.5.3, `task.pause()`, `task.resume()`, and `task.stop()` return `Promise<void>`.
**When to use:** Current DownloadService calls these without await — this is technically safe (fire-and-forget) but review each call site for correctness.

```typescript
// Fork (synchronous)
taskInfo.task.pause(); // void
taskInfo.task.resume(); // void
taskInfo.task.stop(); // void

// Mainline (async — await recommended for correctness)
await taskInfo.task.pause(); // Promise<void>
await taskInfo.task.resume(); // Promise<void>
await taskInfo.task.stop(); // Promise<void>
```

The current implementation calls these in synchronous loops — they should be awaited in the mainline. The `pauseDownload()` and `resumeDownload()` methods would benefit from becoming `async` and awaiting each task operation.

### Anti-Patterns to Avoid

- **Using the default export:** Mainline 4.5.3 does not export a default object. `import RNBackgroundDownloader from '...'` will break. Use named imports.
- **Calling `start()` before registering handlers:** The `begin` event may be missed. Register all handlers, then call `start()`.
- **Registering the mainline plugin and NOT rebuilding native:** The AppDelegate patch requires `expo prebuild --clean && expo run:ios`. Running the metro bundler alone is insufficient.
- **Assuming `task.state === 'DONE'` in pause/resume loops:** The state check pattern in DownloadService (line 1004: `task.task.state === 'DONE'`) is compatible with mainline state values (same strings).

---

## Don't Hand-Roll

| Problem                                | Don't Build                             | Use Instead                              | Why                                                                                      |
| -------------------------------------- | --------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| Background URL session handling        | Custom AppDelegate Swift extension      | Mainline Expo plugin                     | Plugin handles bridging header, ObjC/Swift compatibility, and method injection correctly |
| Metadata persistence across app kill   | AsyncStorage or local DB for task state | `task.metadata` via MMKV                 | Native MMKV persists across process death; JS storage does not run before app kills      |
| Event delivery before listeners attach | JS-level event queue                    | Mainline's `initWithDisabledObservation` | Already solved at native layer; adding JS queue creates timing complexity                |
| Task state recovery                    | Manual task re-construction             | `getExistingDownloadTasks()`             | Returns fully initialized DownloadTask objects with metadata already parsed              |

---

## Common Pitfalls

### Pitfall 1: Missing explicit `.start()` call

**What goes wrong:** Tasks are created but downloads never begin. No error is thrown. The app appears to start a download but nothing happens.
**Why it happens:** Fork auto-started on `download()` call. Mainline separates creation from initiation.
**How to avoid:** Always call `task.start()` after registering event handlers. This is the single most likely source of a broken migration.
**Warning signs:** `downloadBegin` event never fires; progress remains at 0; no native download activity.

### Pitfall 2: Using default import instead of named imports

**What goes wrong:** `import RNBackgroundDownloader from '...'` resolves to `undefined` at runtime in mainline.
**Why it happens:** Mainline exports only named functions, not a default object.
**How to avoid:** Switch to named imports: `import { createDownloadTask, getExistingDownloadTasks, setConfig } from '...'`.
**Warning signs:** `TypeError: RNBackgroundDownloader.download is not a function` or similar.

### Pitfall 3: Forgetting `expo prebuild --clean` after package swap

**What goes wrong:** Native modules are stale. The iOS build has the old MMKV version. The AppDelegate does not have `handleEventsForBackgroundURLSession`. Downloads may not complete in background.
**Why it happens:** Native packages require native rebuild. JavaScript-only packages do not.
**How to avoid:** Always run `npm run ios` (which runs `expo prebuild --clean && expo run:ios`) after changing native dependencies.
**Warning signs:** Build succeeds but downloads stop when app is backgrounded.

### Pitfall 4: Unregistered mainline Expo plugin

**What goes wrong:** `handleEventsForBackgroundURLSession` is never added to AppDelegate. Background downloads do not call the completion handler. iOS may throttle or cancel background sessions.
**Why it happens:** The fork had no bundled plugin; the mainline plugin must be explicitly registered.
**How to avoid:** Add `["@kesha-antonov/react-native-background-downloader", {}]` to `app.config.js` plugins array.
**Warning signs:** Downloads complete in foreground but are unreliable or silently dropped in background.

### Pitfall 5: In-progress fork-era downloads on first launch

**What goes wrong:** DB says a download is in-progress; `getExistingDownloadTasks()` returns no matching task (fork task IDs or state format differs).
**Why it happens:** Fork and mainline may not share the same native task storage if MMKV is cleared between installs, or if the task ID format differs.
**How to avoid:** Existing repair/reconciliation flow handles this: if DB says `isDownloaded=false` but no active task exists, the item appears as not-downloading and can be re-queued. Acceptable for beta. No special migration code needed.
**Warning signs:** Items stuck in a downloading state with no progress after migration.

### Pitfall 6: jest.config.js `transformIgnorePatterns` needs updating

**What goes wrong:** Jest cannot process the mainline's `src/index.ts` entry point (different path from fork's `index.ts`).
**Why it happens:** `jest.config.js` already includes `@kesha-antonov/react-native-background-downloader` in `transformIgnorePatterns` exceptions. However, the mock in `setup.ts` uses `checkForExistingDownloads` — the mock must be updated to `getExistingDownloadTasks`.
**How to avoid:** Update the Jest mock in `src/__tests__/setup.ts` to match mainline API.
**Warning signs:** Tests that reference the mock fail with `checkForExistingDownloads is not a function`.

---

## Code Examples

### Complete DownloadService call site changes

#### initialize() — two changes

```typescript
// BEFORE (fork)
RNBackgroundDownloader.setConfig({
  progressInterval: this.config.progressInterval,
  isLogsEnabled: false,
});
const existingTasks = await RNBackgroundDownloader.checkForExistingDownloads();

// AFTER (mainline)
setConfig({
  progressInterval: this.config.progressInterval,
  isLogsEnabled: false,
});
const existingTasks = await getExistingDownloadTasks();
```

#### downloadAudioFile() — two changes (download → createDownloadTask + .start())

```typescript
// BEFORE (fork)
const task = RNBackgroundDownloader.download({
  id: `${libraryItemId}_${audioFile.id}`,
  url: downloadUrl,
  destination: destPath,
  headers: { Authorization: `Bearer ${token}` },
  metadata: { libraryItemId, audioFileId: audioFile.id, filename: audioFile.filename },
})
  .begin((data) => { ... })
  .progress((data) => { ... })
  .done((data) => { ... })
  .error((data) => { ... });

// AFTER (mainline)
const task = createDownloadTask({
  id: `${libraryItemId}_${audioFile.id}`,
  url: downloadUrl,
  destination: destPath,
  headers: { Authorization: `Bearer ${token}` },
  metadata: { libraryItemId, audioFileId: audioFile.id, filename: audioFile.filename },
});

task
  .begin((data) => { ... })
  .progress((data) => { ... })
  .done((data) => { ... })
  .error((data) => { ... });

task.start(); // explicit start — critical
```

#### cancelDownload() — async stop

```typescript
// BEFORE (fork)
downloadInfo.tasks.forEach((taskInfo) => {
  taskInfo.task.stop();
});

// AFTER (mainline) — fire-and-forget is safe but explicit is cleaner
downloadInfo.tasks.forEach((taskInfo) => {
  void taskInfo.task.stop(); // acknowledge Promise intentionally discarded
});
```

### Updated Jest mock (setup.ts)

```typescript
// BEFORE
jest.mock("@kesha-antonov/react-native-background-downloader", () => ({
  download: jest.fn(),
  checkForExistingDownloads: jest.fn(() => Promise.resolve([])),
}));

// AFTER — must match mainline named export API
jest.mock("@kesha-antonov/react-native-background-downloader", () => ({
  default: undefined, // no default export in mainline
  createDownloadTask: jest.fn(),
  getExistingDownloadTasks: jest.fn(() => Promise.resolve([])),
  setConfig: jest.fn(),
  completeHandler: jest.fn(),
}));
```

### startup reconciliation unit test skeleton (DWNLD-01 requires this)

```typescript
// src/services/__tests__/DownloadService.test.ts
import { getExistingDownloadTasks } from "@kesha-antonov/react-native-background-downloader";
import { DownloadService } from "@/services/DownloadService";

const mockedGetExistingDownloadTasks = getExistingDownloadTasks as jest.MockedFunction<...>;

describe("DownloadService.initialize()", () => {
  it("calls getExistingDownloadTasks on init", async () => {
    mockedGetExistingDownloadTasks.mockResolvedValue([]);
    await downloadService.initialize();
    expect(mockedGetExistingDownloadTasks).toHaveBeenCalledTimes(1);
  });

  it("re-attaches event handlers to restored tasks", async () => {
    const mockTask = {
      metadata: { libraryItemId: "lib-1", audioFileId: "af-1", filename: "file.mp3" },
      state: "DOWNLOADING",
      progress: jest.fn().mockReturnThis(),
      done: jest.fn().mockReturnThis(),
      error: jest.fn().mockReturnThis(),
    };
    mockedGetExistingDownloadTasks.mockResolvedValue([mockTask]);
    await downloadService.initialize();
    expect(mockTask.progress).toHaveBeenCalled();
    expect(mockTask.done).toHaveBeenCalled();
    expect(mockTask.error).toHaveBeenCalled();
  });
});
```

---

## Files to Audit (Complete Import List)

Confirmed by grep across codebase — every file referencing the package:

| File                                                                      | Reference Type                                  | Action Required                                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------ |
| `package.json`                                                            | Dependency declaration (GitHub fork URL)        | Replace with `@kesha-antonov/react-native-background-downloader@4.5.3`         |
| `src/services/DownloadService.ts`                                         | Runtime import + 3 API call sites               | Update import style + 4 API call changes + `.start()` addition                 |
| `src/__tests__/setup.ts`                                                  | Jest mock                                       | Update mock to mainline API (`createDownloadTask`, `getExistingDownloadTasks`) |
| `jest.config.js`                                                          | `transformIgnorePatterns`                       | Already includes the package name — verify it still matches after package swap |
| `app.config.js`                                                           | Plugin registration                             | Add mainline plugin registration                                               |
| `src/types/services.ts`                                                   | No package import — defines project types       | No change                                                                      |
| `src/lib/iCloudBackupExclusion.ts`                                        | No package import — uses NativeModules directly | No change                                                                      |
| `plugins/excludeFromBackup/withExcludeFromBackup.ts`                      | No package import                               | No change                                                                      |
| `ios/Pods/Local Podspecs/react-native-background-downloader.podspec.json` | Generated by CocoaPods                          | Regenerated by `expo prebuild --clean`                                         |
| `ios/build/generated/autolinking/autolinking.json`                        | Generated                                       | Regenerated by prebuild                                                        |
| `package-lock.json`                                                       | Lock file                                       | Regenerated by `npm install`                                                   |

---

## State of the Art

| Old Approach                                     | Current Approach                             | When Changed    | Impact                                              |
| ------------------------------------------------ | -------------------------------------------- | --------------- | --------------------------------------------------- |
| `download()` auto-starts task                    | `createDownloadTask()` + explicit `.start()` | v4.0            | Must add `.start()` call                            |
| `checkForExistingDownloads()`                    | `getExistingDownloadTasks()`                 | v4.0            | Rename only; behavior identical                     |
| Default export object                            | Named exports only                           | v4.0            | Import syntax change                                |
| Synchronous pause/resume/stop                    | Async pause/resume/stop (Promise)            | v4.0            | Fire-and-forget still works; await is cleaner       |
| No bundled Expo plugin                           | `app.plugin.js` included                     | v4.0            | Handles AppDelegate patching automatically          |
| No New Architecture support                      | TurboModule path for iOS New Arch            | v4.x            | `newArchEnabled: true` already set in app.config.js |
| iOS native event buffer (fork's `pendingEvents`) | `initWithDisabledObservation` (always emits) | Mainline design | Events never dropped; no JS queue needed            |

**Deprecated/outdated:**

- `checkForExistingDownloads`: renamed to `getExistingDownloadTasks` in mainline v4
- `download()`: renamed to `createDownloadTask()` in mainline v4
- Default import pattern: mainline v4 uses named exports only

---

## Validation Architecture

### Test Framework

| Property           | Value                                                                  |
| ------------------ | ---------------------------------------------------------------------- |
| Framework          | Jest 29.7 + jest-expo                                                  |
| Config file        | `jest.config.js`                                                       |
| Quick run command  | `jest src/services/__tests__/DownloadService.test.ts --watchAll=false` |
| Full suite command | `npm test`                                                             |

### Phase Requirements → Test Map

| Req ID   | Behavior                                                                 | Test Type   | Automated Command                                                        | File Exists? |
| -------- | ------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------ | ------------ |
| DWNLD-01 | Spike investigation document produced                                    | manual      | N/A — documentation artifact                                             | ❌ Wave 0    |
| DWNLD-02 | package.json references mainline 4.5.3                                   | smoke       | `grep "4.5.3" package.json`                                              | N/A          |
| DWNLD-03 | `initialize()` calls `getExistingDownloadTasks` and re-attaches handlers | unit        | `jest src/services/__tests__/DownloadService.test.ts -t "initialize"`    | ❌ Wave 0    |
| DWNLD-03 | `startDownload()` calls `createDownloadTask` then `.start()`             | unit        | `jest src/services/__tests__/DownloadService.test.ts -t "startDownload"` | ❌ Wave 0    |
| DWNLD-04 | `withExcludeFromBackup` plugin unchanged                                 | code review | N/A — manual review                                                      | N/A          |
| DWNLD-04 | iCloud exclusion applied after download completes                        | unit        | Existing `task.done()` handler coverage in DownloadService test          | ❌ Wave 0    |

### Smoke Test Checklist (human-executable, for investigation doc)

1. Start a download on a library item
2. Observe download progress appears in the UI
3. Force-kill the app (swipe up from app switcher)
4. Relaunch the app
5. Confirm: the download is either still in-progress or completed, not stuck/missing

### Sampling Rate

- **Per task commit:** `jest src/services/__tests__/DownloadService.test.ts --watchAll=false`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/services/__tests__/DownloadService.test.ts` — covers DWNLD-03 (initialize reconciliation, startDownload API call shape, iCloud exclusion application)
- [ ] Updated mock in `src/__tests__/setup.ts` — changes `checkForExistingDownloads` → `getExistingDownloadTasks` and `download` → `createDownloadTask`

---

## Open Questions

1. **Does the mainline Expo plugin work with `newArchEnabled: true` and Expo 54?**
   - What we know: The mainline uses `initWithDisabledObservation` which suggests awareness of bridge observation changes. The plugin has `NativeEventEmitter` fallback for old arch.
   - What's unclear: Whether the TurboModule path in mainline 4.5.3 has been tested against Expo 54 + RN 0.81.
   - Recommendation: Register the plugin, rebuild, and verify during 13-02. If TurboModule path breaks, the old arch path via `NativeEventEmitter` remains.

2. **MMKV version conflict risk**
   - What we know: Fork uses MMKV `~> 2.0.2`; mainline plugin defaults to `2.2.4`. Project does not use `react-native-mmkv` (confirmed by package.json).
   - What's unclear: Whether the MMKV version bump requires any native migration. MMKV is used to store task metadata — format is JSON strings, so format compatibility is not a concern.
   - Recommendation: Accept the default `2.2.4`. No `mmkvVersion` override needed unless the build fails.

3. **Does `task.metadata` survive an app kill with mainline 4.5.3 the same way as fork 3.2.6?**
   - What we know: Both versions use MMKV to persist metadata as JSON strings. `getExistingDownloadTasks()` returns tasks with `task.metadata` already parsed.
   - What's unclear: Whether MMKV storage is cleared on app reinstall (it should be, which is acceptable).
   - Recommendation: Verify during 13-02 integration testing using the restart recovery smoke test. This is the human-verify step for DWNLD-01.

---

## Sources

### Primary (HIGH confidence)

- Installed fork node_modules: `node_modules/@kesha-antonov/react-native-background-downloader/index.ts` — fork API surface (confirmed by direct file read)
- Installed fork node_modules: `node_modules/@kesha-antonov/react-native-background-downloader/lib/DownloadTask.ts` — fork DownloadTask class
- Installed fork node_modules: `node_modules/@kesha-antonov/react-native-background-downloader/ios/RNBackgroundDownloader.h/.m` — fork native event queue (`pendingEvents`)
- jsdelivr CDN: `cdn.jsdelivr.net/npm/@kesha-antonov/react-native-background-downloader@4.5.3/src/index.ts` — mainline exports (`createDownloadTask`, `getExistingDownloadTasks`, `setConfig`, `cleanup`, `directories`)
- jsdelivr CDN: `cdn.jsdelivr.net/npm/@kesha-antonov/react-native-background-downloader@4.5.3/src/DownloadTask.ts` — mainline DownloadTask (state values, async pause/resume/stop, `start()`)
- jsdelivr CDN: `cdn.jsdelivr.net/npm/@kesha-antonov/react-native-background-downloader@4.5.3/src/types.ts` — DownloadTask interface, Metadata type
- jsdelivr CDN: `cdn.jsdelivr.net/npm/@kesha-antonov/react-native-background-downloader@4.5.3/ios/RNBackgroundDownloader.mm` — mainline iOS event delivery (`initWithDisabledObservation`, no pendingEvents buffer)
- jsdelivr CDN: `cdn.jsdelivr.net/npm/@kesha-antonov/react-native-background-downloader@4.5.3/plugin/build/index.js` — mainline Expo plugin (AppDelegate Swift patching, MMKV Gradle dependency)
- Project source: `src/services/DownloadService.ts` — all current API call sites
- Project source: `package.json` — fork reference (`clayreimann/react-native-background-downloader#spike-event-queue`)
- Project source: `app.config.js`, `plugins/excludeFromBackup/withExcludeFromBackup.ts` — plugin independence confirmed
- Project source: `ios/SideShelf/AppDelegate.swift` — no existing `handleEventsForBackgroundURLSession` (mainline plugin must add it)
- Project source: `src/__tests__/setup.ts` — existing Jest mock using old API names

### Secondary (MEDIUM confidence)

- npm registry metadata for v4.5.3: confirms package structure (56 files, `app.plugin.js` included, `src/index.ts` as main)
- GitHub kesha-antonov/react-native-background-downloader tags: confirms v4.5.3 released 2026-02-27

### Tertiary (LOW confidence)

- GitHub commit list for `spike-event-queue` branch: key commit "Event queueing and misc fixes" (Oct 2025) — confirms the fork's defining change was event buffering at native level

---

## Metadata

**Confidence breakdown:**

- API diff table (fork vs mainline): HIGH — based on direct source file reads of both installed fork and mainline CDN
- Architecture patterns (createDownloadTask + start): HIGH — confirmed from CDN source
- iCloud exclusion independence (DWNLD-04): HIGH — confirmed from plugin source code; zero package reference to downloader
- Event queue behavior: HIGH — native source confirms fork uses `pendingEvents` buffer, mainline uses `initWithDisabledObservation`
- Expo plugin behavior: MEDIUM — verified from plugin/build/index.js CDN, not from live build test
- MMKV compatibility: MEDIUM — version bump from 2.0.x to 2.2.4 has no format incompatibility risk (JSON strings)
- task.metadata restart recovery: MEDIUM — mechanism confirmed from code; requires live smoke test to fully verify

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (stable library — 30 days)
