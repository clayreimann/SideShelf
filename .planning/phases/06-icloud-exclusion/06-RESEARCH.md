# Phase 6: iCloud Exclusion - Research

**Researched:** 2026-02-20
**Domain:** iOS native module registration via Expo Config Plugin + iCloud backup exclusion
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- Apply the exclusion attribute to ALL existing downloaded files — not just new downloads going forward
- Run on every app startup (not a one-time migration flag); the native call is idempotent so repetition is harmless
- Run async in the background after launch — non-blocking, app starts immediately
- Use an Expo Config Plugin to register a native module that wraps the iOS `setSkipBackupAttribute` API
- The module is a simple, focused wrapper — it accepts a file path and sets `NSURLIsExcludedFromBackupKey = true`
- Log failures but do not throw or surface errors to the user — iCloud exclusion is best-effort
- Silent failure is acceptable (better than crashing downloads)

### Claude's Discretion

- Exact TypeScript interface shape for the native module (method names, argument types)
- Whether retroactive scan uses the DB or scans the filesystem directly (either is fine)
- Expo config plugin implementation details (withXcodeProject vs other approach)
- Where in app startup the retroactive scan fires (root layout, provider, or service init)
- Test strategy for native module integration

### Deferred Ideas (OUT OF SCOPE)

- Android support (not needed — Android doesn't use iCloud)
- Exposing the exclusion status in the UI
- Download progress UI improvements
- Any changes to the download manager or queue beyond the exclusion call
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                 | Research Support                                                                               |
| ------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ICLD-01 | iCloud exclusion plugin is registered in `app.config.js` and compiled into the app build    | Plugin JS file exists and is correct; only `app.config.js` registration is missing             |
| ICLD-02 | Downloaded files are excluded from iCloud backup at download completion                     | `setExcludeFromBackup` is already called in DownloadService on completion; verify completeness |
| ICLD-03 | iCloud exclusion is re-applied to files during download path repair (app update migrations) | `repairDownloadStatus` does NOT currently call `setExcludeFromBackup`; gap identified          |

</phase_requirements>

## Summary

This phase has substantial existing infrastructure. The native Objective-C module (`ICloudBackupExclusion.h/.m`), the Expo Config Plugin (`withExcludeFromBackup.js`), and the TypeScript wrapper (`src/lib/iCloudBackupExclusion.ts`) are all fully written. The `DownloadService` already calls `setExcludeFromBackup` in two places at download completion (both the normal completion path and the "file already exists" early return). The work required is narrow: register the plugin in `app.config.js`, add the exclusion call to `repairDownloadStatus`, and implement the retroactive startup scan.

Three specific gaps must be closed: (1) the plugin is not registered in `app.config.js` so the native module never compiles into the Xcode project — `NativeModules.ICloudBackupExclusion` resolves to null at runtime; (2) `repairDownloadStatus` repairs the DB path for relocated files but never calls `setExcludeFromBackup` on the corrected path, meaning iOS app updates silently re-enable backup for migrated files; (3) no retroactive startup scan exists to cover files that were downloaded before this feature landed.

The retroactive scan should use the DB (not filesystem scan) because `getAllDownloadedAudioFiles()` from `src/db/helpers/localData.ts` already provides the full list of downloaded paths with resolved absolute paths. Firing it from `initializeApp()` in `src/index.ts` is the correct location — it fits the existing pattern for background startup work and runs before any UI is shown.

**Primary recommendation:** Three targeted changes to existing code — register plugin in `app.config.js`, add `setExcludeFromBackup` call inside `repairDownloadStatus`, and add a background startup scan in `initializeApp()`.

## Current State Inventory

This is critical context for the planner. The following already exists and must NOT be rebuilt:

| File                                                           | Status           | Notes                                                                                                          |
| -------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `plugins/excludeFromBackup/ios/ICloudBackupExclusion.h`        | DONE             | Obj-C header, RCTBridgeModule conformance                                                                      |
| `plugins/excludeFromBackup/ios/ICloudBackupExclusion.m`        | DONE             | `setExcludeFromBackup` + `isExcludedFromBackup` methods, `NSURLIsExcludedFromBackupKey`                        |
| `plugins/excludeFromBackup/withExcludeFromBackup.js`           | DONE             | Config plugin using `withDangerousMod` + `withXcodeProject` + `IOSConfig.XcodeUtils.addBuildSourceFileToGroup` |
| `plugins/excludeFromBackup/withExcludeFromBackup.ts`           | DONE (alternate) | TypeScript version of same plugin; the `.js` version is what `app.config.js` should require                    |
| `src/lib/iCloudBackupExclusion.ts`                             | DONE             | TS wrapper: `setExcludeFromBackup()`, `isExcludedFromBackup()`, `isICloudBackupExclusionAvailable()`           |
| `src/services/DownloadService.ts` — completion handler         | DONE             | Calls `setExcludeFromBackup(downloadPath)` after `markAudioFileAsDownloaded`                                   |
| `src/services/DownloadService.ts` — "file already exists" path | DONE             | Also calls `setExcludeFromBackup` for the early-return case                                                    |
| `src/services/DownloadService.ts` — `restoreExistingDownloads` | DONE             | Calls `setExcludeFromBackup` in restored task `.done()` handler                                                |
| `app.config.js` — plugin registration                          | **MISSING**      | The `plugins` array does not include `withExcludeFromBackup`                                                   |
| `DownloadService.repairDownloadStatus` — iCloud exclusion      | **MISSING**      | Repairs DB path but does not call `setExcludeFromBackup` on repaired path                                      |
| Retroactive startup scan                                       | **MISSING**      | No code scans existing downloads on startup to apply exclusion                                                 |

## Standard Stack

### Core (no new dependencies needed)

| Library                        | Version                              | Purpose                                                                                  | Notes                                              |
| ------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `@expo/config-plugins`         | `^54.0.1` (pinned with expo 54.0.21) | Config plugin API for `withDangerousMod`, `withXcodeProject`, `IOSConfig.XcodeUtils`     | Already in project                                 |
| `react-native` `NativeModules` | bundled                              | JS bridge to native Obj-C module                                                         | Already used in `src/lib/iCloudBackupExclusion.ts` |
| `src/db/helpers/localData`     | —                                    | `getAllDownloadedAudioFiles()` returns all downloaded paths with resolved absolute paths | Already used throughout app                        |

**No new npm packages are required for this phase.**

### Expo Config Plugin API (HIGH confidence — verified in project)

The `.js` plugin uses the verified API:

- `withDangerousMod(config, ["ios", async (config) => { ... }])` — copies native source files during prebuild
- `withXcodeProject(config, (config) => { ... })` — registers files with the Xcode project
- `IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName, project })` — adds to compile sources, with `project.hasFile(path)` guard to prevent duplicates on re-runs

All three are verified present in the installed `@expo/config-plugins` package (expo 54.0.21).

## Architecture Patterns

### Recommended File Structure (no new files needed)

```
plugins/
└── excludeFromBackup/
    ├── ios/
    │   ├── ICloudBackupExclusion.h   # EXISTS - do not change
    │   └── ICloudBackupExclusion.m   # EXISTS - do not change
    ├── withExcludeFromBackup.js      # EXISTS - do not change
    └── withExcludeFromBackup.ts      # EXISTS - unused (app.config.js uses .js)
src/
└── lib/
    └── iCloudBackupExclusion.ts     # EXISTS - do not change
app.config.js                        # MODIFY: add plugin registration
src/services/DownloadService.ts      # MODIFY: add exclusion to repairDownloadStatus
src/index.ts                         # MODIFY: add retroactive startup scan
```

### Pattern 1: Plugin Registration in app.config.js

**What:** Add `withExcludeFromBackup` to the `plugins` array in `app.config.js`. Use `require()` since `app.config.js` is CommonJS.

**When to use:** One-time change; required for ICLD-01.

```javascript
// app.config.js — add to the plugins array
const withExcludeFromBackup = require("./plugins/excludeFromBackup/withExcludeFromBackup");

// Inside module.exports = ({ config }) => { ... }
plugins: [
  withExcludeFromBackup, // <-- add this as the FIRST plugin (before expo-router)
  "expo-router",
  // ... rest of existing plugins
];
```

The plugin is a function reference, not a string — pass it directly, not as `[withExcludeFromBackup]`.

### Pattern 2: iCloud Exclusion After Path Repair

**What:** After `repairDownloadStatus` finds a file at `expectedPath` and updates the DB, call `setExcludeFromBackup(expectedPath)`. Errors are logged but not thrown.

**When to use:** Inside `repairDownloadStatus` in `DownloadService.ts`, in the branch where `existsAtExpectedPath === true`. Matches the existing error-handling pattern in the completion handler.

```typescript
// Source: existing DownloadService.ts completion handler pattern
if (existsAtExpectedPath) {
  await markAudioFileAsDownloaded(file.id, expectedPath);
  repairedCount++;

  // Re-apply iCloud exclusion after path repair
  try {
    await setExcludeFromBackup(expectedPath);
    log.info(`iCloud exclusion re-applied after path repair: ${file.filename}`);
  } catch (error) {
    log.error(
      `Failed to re-apply iCloud exclusion after repair for ${file.filename}:`,
      error as Error
    );
    // Continue - path is repaired, exclusion failure is non-blocking
  }
}
```

### Pattern 3: Retroactive Startup Scan

**What:** On every app startup, fetch all downloaded file paths from DB and call `setExcludeFromBackup` on each. Run as a fire-and-forget background task (no `await`). Call is idempotent — safe to repeat.

**When to use:** Inside `initializeApp()` in `src/index.ts`, after DB initialization (logger is initialized before this runs). Fire without awaiting so startup is non-blocking.

**Use DB-based approach** (not filesystem scan): `getAllDownloadedAudioFiles()` from `src/db/helpers/localData` returns resolved absolute paths for all downloaded files. This is faster than a filesystem walk and covers exactly the right set of files.

```typescript
// Source: src/db/helpers/localData.ts pattern
import { getAllDownloadedAudioFiles } from "@/db/helpers/localData";
import { setExcludeFromBackup } from "@/lib/iCloudBackupExclusion";

async function applyICloudExclusionToExistingDownloads(): Promise<void> {
  try {
    const downloadedFiles = await getAllDownloadedAudioFiles();
    if (downloadedFiles.length === 0) {
      log.info("No downloaded files to apply iCloud exclusion to");
      return;
    }

    log.info(`Applying iCloud exclusion to ${downloadedFiles.length} existing downloaded files`);
    let successCount = 0;
    let errorCount = 0;

    for (const file of downloadedFiles) {
      try {
        await setExcludeFromBackup(file.downloadPath);
        successCount++;
      } catch (error) {
        errorCount++;
        log.error(`Failed to apply iCloud exclusion to ${file.downloadPath}:`, error as Error);
      }
    }

    log.info(`iCloud exclusion scan complete: ${successCount} succeeded, ${errorCount} failed`);
  } catch (error) {
    log.error("Failed to run iCloud exclusion startup scan:", error as Error);
  }
}

// Inside initializeApp(), after logger is initialized:
// Fire and forget - non-blocking
applyICloudExclusionToExistingDownloads().catch((error) => {
  log.error("iCloud exclusion startup scan failed:", error as Error);
});
```

### Anti-Patterns to Avoid

- **Awaiting the startup scan in initializeApp()**: The scan is potentially slow (one syscall per file). It MUST be fire-and-forget to keep startup non-blocking.
- **Using `require()` with the `.ts` plugin file**: `app.config.js` is CommonJS. Use the `.js` version of the plugin, not the `.ts` one.
- **Wrapping the plugin in an array with options**: `withExcludeFromBackup` takes no options — pass it as a bare function reference, not `[withExcludeFromBackup, {}]`.
- **Re-applying exclusion to files that failed the repair**: Only call `setExcludeFromBackup` on the repaired path (`existsAtExpectedPath === true` branch). Not on the `clearAudioFileDownloadStatus` branch.
- **Filesystem scan instead of DB query**: `getAllDownloadedAudioFiles()` is already available and returns resolved paths. No need to walk the filesystem directory.

## Don't Hand-Roll

| Problem                 | Don't Build                  | Use Instead                                                              | Why                                             |
| ----------------------- | ---------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------- |
| Native module           | Custom module from scratch   | `plugins/excludeFromBackup/ios/ICloudBackupExclusion.m` (already exists) | Complete, tested implementation                 |
| TS wrapper              | Custom NativeModules wrapper | `src/lib/iCloudBackupExclusion.ts` (already exists)                      | Complete with platform guards                   |
| Xcode file registration | Manual `.pbxproj` editing    | `withExcludeFromBackup.js` config plugin (already exists)                | Handles duplicate detection, group creation     |
| Downloaded file list    | Filesystem walk              | `getAllDownloadedAudioFiles()` from `localData.ts`                       | DB is authoritative; paths are already resolved |

**Key insight:** The entire iCloud exclusion stack is already implemented. The planner should treat this phase as wiring existing components together, not building anything new.

## Common Pitfalls

### Pitfall 1: Plugin File Format Mismatch

**What goes wrong:** `app.config.js` is CommonJS. If you `require()` the `.ts` file directly, Node.js will fail to parse it (TypeScript syntax). The `.js` compiled version must be used.
**Why it happens:** The project has both `withExcludeFromBackup.ts` and `withExcludeFromBackup.js`. The `.ts` file exists for editor support; the `.js` file is what the runtime consumes.
**How to avoid:** `require('./plugins/excludeFromBackup/withExcludeFromBackup')` — without extension, Node resolves to `.js` first.
**Warning signs:** Prebuild fails with a syntax error mentioning TypeScript keywords (`interface`, `export`, type annotations).

### Pitfall 2: Duplicate Xcode Registration on Re-runs

**What goes wrong:** Running `expo prebuild` multiple times adds the native source files to the Xcode project multiple times, causing build errors.
**Why it happens:** `withXcodeProject` runs on every prebuild.
**How to avoid:** The existing `withExcludeFromBackup.js` already guards with `if (!project.hasFile(path))` before calling `addBuildSourceFileToGroup`. This is already handled — do not remove these guards.
**Warning signs:** Xcode project has duplicate `ICloudBackupExclusion.m` entries; build errors about redefined symbols.

### Pitfall 3: NativeModules.ICloudBackupExclusion is Null Without Rebuild

**What goes wrong:** Adding the plugin to `app.config.js` does not take effect until after `expo prebuild --clean` and a native rebuild. Development builds using Expo Go or a stale binary will still see `null`.
**Why it happens:** Native module registration requires compilation into the Xcode project.
**How to avoid:** Verify with a device build after `expo prebuild --clean`. The existing `isICloudBackupExclusionAvailable()` guard in `src/lib/iCloudBackupExclusion.ts` handles the null case correctly.
**Warning signs:** `NativeModules.ICloudBackupExclusion` is null in a simulator build; `isICloudBackupExclusionAvailable()` returns false.

### Pitfall 4: Startup Scan Blocks App Launch

**What goes wrong:** If the startup scan is awaited in `initializeApp()`, a large library (hundreds of downloaded files) will delay app startup proportionally.
**Why it happens:** `NSURLIsExcludedFromBackupKey` is a filesystem attribute write — it involves I/O.
**How to avoid:** The startup scan MUST be fire-and-forget. Wrap in `.catch()` not `await`.
**Warning signs:** App startup noticeably slower after adding the scan; splash screen stays up longer.

### Pitfall 5: repairDownloadStatus Already Exists at Two Call Sites

**What goes wrong:** The planner might think `repairDownloadStatus` needs a new call site. It is already called from `LibraryItemDetail.tsx` and `PlayerService.ts`. The only change needed is inside the existing function body.
**Why it happens:** Misreading the task as "add a new caller" vs "modify the existing callee".
**How to avoid:** Edit `repairDownloadStatus` internals, not its call sites.

## Code Examples

Verified patterns from the existing codebase:

### Existing completion handler pattern (model for repairDownloadStatus)

```typescript
// Source: src/services/DownloadService.ts lines 282-294
task.done((data) => {
  const downloadPath = getDownloadPath(libraryItemId, audioFile.filename, "documents");
  markAudioFileAsDownloaded(audioFile.id, downloadPath, "documents").then(async () => {
    log.info(`File marked as downloaded, applying iCloud exclusion`);

    // Apply iCloud backup exclusion
    try {
      await setExcludeFromBackup(downloadPath);
      log.info(`iCloud exclusion applied to ${audioFile.filename}`);
    } catch (error) {
      log.error(`Failed to set iCloud exclusion for ${audioFile.filename}:`, error as Error);
      // Continue anyway - file is downloaded, just not excluded from backup
    }
  });
});
```

### getAllDownloadedAudioFiles return shape

```typescript
// Source: src/db/helpers/localData.ts lines 162-172
// Returns LocalAudioFileDownloadRow[] where downloadPath is a RESOLVED absolute path
export async function getAllDownloadedAudioFiles(): Promise<LocalAudioFileDownloadRow[]> {
  const rows = await db
    .select()
    .from(localAudioFileDownloads)
    .where(eq(localAudioFileDownloads.isDownloaded, true));

  return rows.map((row) => ({
    ...row,
    downloadPath: resolveAppPath(row.downloadPath), // absolute path, ready to use
  }));
}
```

### app.config.js plugin array structure

```javascript
// Source: app.config.js lines 59-86 (existing pattern)
plugins: [
  "expo-router",
  ["expo-splash-screen", { /* options */ }],
  ["expo-font", { fonts: [...] }],
  "expo-web-browser",
]
// withExcludeFromBackup is a function (not a string), passes as bare reference
```

### Native module Objective-C implementation

```objc
// Source: plugins/excludeFromBackup/ios/ICloudBackupExclusion.m
RCT_EXPORT_METHOD(setExcludeFromBackup:(NSString *)filePath
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  NSURL *fileURL = [NSURL fileURLWithPath:filePath];
  NSError *error = nil;

  BOOL success = [fileURL setResourceValue:@YES
                                    forKey:NSURLIsExcludedFromBackupKey
                                     error:&error];

  if (success) {
    resolve(@{@"success": @YES, @"path": filePath});
  } else {
    NSString *errorMessage = error ? error.localizedDescription : @"Failed to set exclude from backup attribute";
    reject(@"EXCLUDE_FROM_BACKUP_FAILED", errorMessage, error);
  }
}
```

## State of the Art

| Old Approach                           | Current Approach                            | Status              | Impact                           |
| -------------------------------------- | ------------------------------------------- | ------------------- | -------------------------------- |
| Manual `.pbxproj` editing              | Expo Config Plugin with `withXcodeProject`  | Already implemented | Survives `expo prebuild --clean` |
| One-time migration flag                | Idempotent on-every-startup scan            | Locked decision     | No migration state to manage     |
| FileSystem walk for existing downloads | DB query via `getAllDownloadedAudioFiles()` | Recommended         | Faster, more reliable            |

## Open Questions

1. **Should the startup scan also cover cover image files?**
   - What we know: `getAllDownloadedAudioFiles()` returns audio files only. Cover images are stored in a separate `localCoverCache` table.
   - What's unclear: Whether cover images need iCloud exclusion (they are re-downloadable and relatively small).
   - Recommendation: Out of scope for this phase. CONTEXT.md scope is "downloaded audio files." Covers are separate. Do not expand.

2. **Is `NSURLIsExcludedFromBackupKey` applied recursively to directories?**
   - What we know: The Apple API applies the attribute per-file, not recursively for directories. The native module calls it per-file path.
   - What's unclear: Whether applying to the parent directory (`libraryItemId/` folder) would cover future files.
   - Recommendation: Per-file application is correct and already implemented. Directory-level application is not more reliable. No change needed.

3. **Do files at `existsAtStoredPath` (no repair needed) need exclusion re-applied?**
   - What we know: If the file is at the stored path, it survived the iOS app update with its path intact. Exclusion attributes survive across app launches if the file path is stable.
   - What's unclear: Whether iOS clears the `NSURLIsExcludedFromBackupKey` attribute during app container migrations.
   - Recommendation: The startup scan (locked decision) covers this case. The retroactive scan runs on every startup and will re-apply to files at their existing paths. No additional logic in `repairDownloadStatus` for the "no repair needed" branch.

## Sources

### Primary (HIGH confidence)

- Verified in project: `plugins/excludeFromBackup/` — complete native module and config plugin implementation
- Verified in project: `src/lib/iCloudBackupExclusion.ts` — complete TS wrapper
- Verified in project: `src/services/DownloadService.ts` — existing `setExcludeFromBackup` call sites
- Verified in project: `src/db/helpers/localData.ts` — `getAllDownloadedAudioFiles()` API
- Verified with `node -e` in project: `IOSConfig.XcodeUtils.addBuildSourceFileToGroup` exists
- Verified with `node -e` in project: `withXcodeProject`, `withDangerousMod` are functions

### Secondary (MEDIUM confidence)

- Apple Developer Documentation: `NSURLIsExcludedFromBackupKey` — sets "do not back up" on per-file basis, attribute persists until explicitly cleared
- Expo SDK 54 / `@expo/config-plugins` 54.0.1 — Config plugin API is stable and unchanged from SDK 53

### Tertiary (LOW confidence)

- N/A — all critical claims verified from project source or in-project runtime checks

## Metadata

**Confidence breakdown:**

- Current state inventory: HIGH — inspected every relevant file directly
- Plugin API: HIGH — verified `addBuildSourceFileToGroup`, `withXcodeProject`, `withDangerousMod` in installed package
- Architecture patterns: HIGH — derived from existing code patterns in the same codebase
- Pitfalls: HIGH — sourced from actual code inspection (dual plugin files, existing guard code)
- iOS `NSURLIsExcludedFromBackupKey` behavior: MEDIUM — Apple platform behavior, not verified with device test

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (stable APIs, 30-day window appropriate)
