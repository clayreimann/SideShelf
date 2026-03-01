# Phase 7: Download Tracking - Research

**Researched:** 2026-02-22
**Domain:** Download record reconciliation, filesystem scanning, orphan detection, AppState lifecycle
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Startup scan behavior:**

- Run on every foreground resume (not just cold start) — catches files deleted while app was backgrounded
- Non-blocking background — app loads normally while scan runs asynchronously
- No user-visible indicator; log to console/crash reporter only
- No chunking or throttling — run as a single async operation

**Stale record disposition:**

- When a downloaded file is missing from disk: mark the item as not downloaded (reset status), do NOT delete the DB record
- Preserve listen/play progress — only the download status is cleared, not the user's position
- Handle multi-file items at per-file granularity: clear only the missing files' download status, not the whole item
- Items with some files missing → surface as "partially downloaded" state in the UI, with actions to either re-download the missing pieces or clear the still-present downloaded files

**Active download safety boundary:**

- Active transfers (currently receiving bytes): skip entirely — never scanned
- Paused downloads: skip — user intentionally paused, partial files and records stay intact
- Zombie downloads (state = in-progress, not paused, not receiving data): clear and log
  - Delete the zombie's partial files from disk
  - Reset the DB record to not-downloaded
  - Do NOT attempt to auto-restart — let the user manually re-download

**Storage tab refresh:**

- Storage tab is reactive — auto-updates when DB state changes, no navigation required
- Orphan files (files on disk with no DB record, e.g. item removed from remote library):
  - Show in a separate "Unknown files" section at the bottom of the Storage tab
  - Display: filename + file size
  - User can delete orphan files from this section

### Claude's Discretion

- Exact timing of when the foreground resume scan fires (AppState change event vs app lifecycle hook)
- Internal data structures for tracking per-file download status
- Log verbosity / format for cleared stale/zombie records
- Visual design of the "partially downloaded" badge and its action sheet

### Deferred Ideas (OUT OF SCOPE)

- None — discussion stayed within phase scope
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID    | Description                                                                                          | Research Support                                                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DL-01 | Stale "downloaded" DB records where files no longer exist on disk are cleared on startup             | `detectCleanedUpFiles()` in `fileLifecycleManager.ts` already does this scan; needs to be wired into the foreground-resume hook in `_layout.tsx` (currently only runs on app update) |
| DL-02 | Storage tab accurately reflects all currently downloaded items                                       | Storage tab reads `localAudioFileDownloads` + `localLibraryFileDownloads` reactively via local state; orphan file scanning requires `Directory.list()` from expo-file-system         |
| DL-03 | Download reconciliation scan excludes active in-progress downloads (no partial-file false positives) | `DownloadService.activeDownloads` (a `Map<string, DownloadInfo>`) is the authoritative source of in-flight downloads; scan must query this map before touching any file              |

</phase_requirements>

## Summary

The download tracking phase adds a reconciliation scan that keeps `localAudioFileDownloads` DB records in sync with what is actually on disk. The codebase already has most of the building blocks in place — `detectCleanedUpFiles()` in `fileLifecycleManager.ts` performs the core scan logic, and `clearAudioFileDownloadStatus()` handles the per-file DB update. The primary work is: (1) wire that scan into the foreground-resume AppState handler in `_layout.tsx`, (2) guard the scan against active and paused downloads via `DownloadService.activeDownloads`, (3) add zombie detection for downloads stuck in-progress without active tasks, (4) implement disk-walk orphan detection using `Directory.list()`, and (5) extend the Storage tab to show orphans in an "Unknown files" section with a delete action.

The Storage tab is already reactive to DB changes — it calls `refreshStorageStats()` on mount. Since stale-record clearing writes directly to `localAudioFileDownloads`, the tab auto-updates when the scan runs (no push mechanism needed). The partially-downloaded state needs a new DB query and a UI badge on library items.

The AppState hook at `_layout.tsx` lines 70–177 is the correct injection point for the foreground-resume scan. An identical pattern already exists for the iCloud exclusion scan in `src/index.ts` — fire-and-forget, non-blocking, failures logged but not surfaced.

**Primary recommendation:** Implement a `runDownloadReconciliationScan()` function in `DownloadService` (or a new `src/lib/downloadReconciliation.ts` module), call it fire-and-forget from the `nextAppState === "active"` branch in `_layout.tsx`, and guard every touched item against `DownloadService.activeDownloads` before modifying DB records or files.

## Standard Stack

### Core

| Library               | Version    | Purpose                                                                        | Why Standard                                               |
| --------------------- | ---------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| expo-file-system      | ~19.0.17   | `Directory.list()` for disk walk; `File.exists` / `File.size` for orphan stats | Already the project's filesystem abstraction               |
| react-native AppState | (built-in) | Foreground-resume lifecycle event                                              | Already used in `_layout.tsx` lines 70–177                 |
| Drizzle ORM           | (project)  | Querying `localAudioFileDownloads` and updating download status                | All DB writes must go through helpers in `src/db/helpers/` |

### Supporting

| Library                                           | Version   | Purpose                                            | When to Use                                                          |
| ------------------------------------------------- | --------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| @kesha-antonov/react-native-background-downloader | (project) | `checkForExistingDownloads()` for zombie detection | Query alongside `activeDownloads` map to detect stuck tasks          |
| Zustand `downloadSlice`                           | (project) | Invalidating `downloadedItems` Set after scan      | Call `resetDownloads()` or re-run `initializeDownloads()` after scan |

### Alternatives Considered

| Instead of                             | Could Use                                | Tradeoff                                                                                      |
| -------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| AppState change event in `_layout.tsx` | Expo app lifecycle hook                  | AppState is simpler, already in use, no new dependency                                        |
| Single `Directory.list()` walk         | Iterating `localAudioFileDownloads` rows | DB-first is safer (avoids touching unknown files); disk walk needed only for orphan detection |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure

The reconciliation logic fits in one of two locations:

```
src/
├── lib/
│   └── downloadReconciliation.ts   # New: stale-record scan, orphan scan, zombie detection
├── services/
│   └── DownloadService.ts          # Existing: activeDownloads map used as guard
├── db/
│   └── helpers/
│       └── localData.ts            # Existing: clearAudioFileDownloadStatus(), getAllDownloadedAudioFiles()
└── app/
    └── _layout.tsx                 # Existing: AppState handler, fire-and-forget injection point
```

Alternatively, the scan logic can live inside `DownloadService` as a public method `runReconciliationScan()` if the team prefers keeping download-related logic centralized. Either approach works; the key constraint is that DB writes go through helpers.

### Pattern 1: Fire-and-Forget Scan in AppState Handler

**What:** Mirror the existing `applyICloudExclusionToExistingDownloads()` pattern — define a top-level async function, call it `.catch()` logged, never await it at the call site.

**When to use:** Every foreground resume where the app returns from background.

**Example:**

```typescript
// In src/app/_layout.tsx — inside the "active" branch
} else if (nextAppState === "active") {
  // ... existing restoration logic ...

  // Fire-and-forget reconciliation scan (mirrors iCloud exclusion pattern)
  runDownloadReconciliationScan().catch((error) => {
    log.warn(`Download reconciliation scan failed: ${String(error)}`);
  });
}
```

```typescript
// In src/lib/downloadReconciliation.ts (or DownloadService)
export async function runDownloadReconciliationScan(): Promise<void> {
  const downloadedFiles = await getDownloadedAudioFilesWithLibraryInfo();
  const activeItemIds = new Set(downloadService.getActiveDownloadIds()); // guard

  for (const file of downloadedFiles) {
    if (activeItemIds.has(file.libraryItemId)) continue; // skip active/paused

    const exists = await verifyFileExists(file.downloadPath);
    if (!exists) {
      await clearAudioFileDownloadStatus(file.audioFileId);
      log.info(
        `[ReconciliationScan] Cleared stale record: ${file.filename} (${file.libraryItemId})`
      );
    }
  }
}
```

### Pattern 2: Active Download Guard

**What:** Before touching any record, check `DownloadService.activeDownloads` (the private `Map<string, DownloadInfo>`). Items in this map are either actively transferring or paused — both are exempt from the scan.

**When to use:** Every file checked during the stale scan.

**Key insight:** `DownloadService` exposes `isDownloadActive(libraryItemId)` already. The scan should call this per item. Paused downloads have `downloadInfo.isPaused === true` AND are still in `activeDownloads` — so the single `isDownloadActive()` check covers both active and paused.

```typescript
// Guard: skip active AND paused downloads
if (downloadService.isDownloadActive(file.libraryItemId)) {
  log.debug(`[ReconciliationScan] Skipping active/paused: ${file.libraryItemId}`);
  continue;
}
```

### Pattern 3: Zombie Detection

**What:** A zombie is a download where `DownloadService.activeDownloads` does NOT have the item (so it's not actively tracked), but the background downloader has a task in a non-DONE, non-PAUSED state.

**When to use:** During the reconciliation scan, after checking `localAudioFileDownloads`.

**How to detect:** Call `RNBackgroundDownloader.checkForExistingDownloads()` once per scan. For each returned task, if the corresponding `libraryItemId` is NOT in `activeDownloads` and the task state is not `DONE` or `PAUSED`, it is a zombie.

```typescript
// Zombie detection
const existingTasks = await RNBackgroundDownloader.checkForExistingDownloads();
for (const task of existingTasks) {
  const libraryItemId = task.metadata?.libraryItemId;
  if (!libraryItemId) continue;
  if (downloadService.isDownloadActive(libraryItemId)) continue; // Coordinator owns it

  // Zombie: tracked by system, not tracked by our service
  log.warn(`[ReconciliationScan] Zombie download detected: ${libraryItemId}, stopping task`);
  task.stop();

  // Delete partial files and clear DB records
  // ... per-file deletion using getDownloadsDirectory(libraryItemId) ...
  // ... clearAudioFileDownloadStatus per audio file ...
}
```

### Pattern 4: Orphan File Detection (Disk Walk)

**What:** Walk `downloads/` subdirectories in both Documents and Caches, compare discovered files to known `downloadPath` values in `localAudioFileDownloads`. Files on disk with no DB row are orphans.

**When to use:** When building the Storage tab's "Unknown files" section. This is a heavier operation — run lazily on tab focus, not on every foreground resume.

**Key API:** `Directory.list()` returns `(Directory | File)[]` synchronously. This is available in expo-file-system 19.

```typescript
// Source: expo-file-system ~19.0.17 (verified from node_modules type declarations)
const downloadsDir = new Directory(Paths.document, "downloads");
if (!downloadsDir.exists) return [];

const itemDirs = downloadsDir.list(); // returns Directory[] for each libraryItemId folder
for (const itemDir of itemDirs) {
  if (!(itemDir instanceof Directory)) continue;
  const files = itemDir.list();
  for (const file of files) {
    if (!(file instanceof File)) continue;
    // Check if file.uri is in known download paths
    // If not → orphan
  }
}
```

### Pattern 5: Partial Download UI State

**What:** When some (not all) audio files for a library item have DB records with `isDownloaded = true`, the item is "partially downloaded." The badge needs to distinguish this from fully-downloaded and fully-not-downloaded.

**How to compute:** `DownloadService.getDownloadProgress(libraryItemId)` already returns `{ downloaded, total, progress }` from DB. When `downloaded > 0 && downloaded < total`, the item is partial.

**UI surface:** A visual badge (e.g., "Partial") on the library item card, with an action sheet offering "Re-download missing files" or "Clear downloaded files."

### Anti-Patterns to Avoid

- **Scanning files during active downloads:** Never call `clearAudioFileDownloadStatus` on a file whose `libraryItemId` is in `activeDownloads`. Partial files written mid-transfer will trigger false positives.
- **Running the disk walk on every foreground resume:** The orphan disk walk is O(files on disk) and should only run when the Storage tab is visible, not on every resume.
- **Deleting DB records instead of clearing download status:** Per the locked decision, `clearAudioFileDownloadStatus()` resets the download state while preserving the audio file record and all progress/progress metadata. Never call `db.delete()` on the `audio_files` or `local_audio_file_downloads` tables from scan code.
- **Blocking app startup:** Both the stale scan and zombie check must be fire-and-forget. Any `await` at the call site would delay the app's active UI.
- **Touching paused downloads:** `DownloadService.isDownloadActive(id)` returns `true` for paused downloads. The single guard covers both states.

## Don't Hand-Roll

| Problem                    | Don't Build                            | Use Instead                                                                 | Why                                                                                     |
| -------------------------- | -------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| File existence check       | Custom fs check                        | `verifyFileExists()` in `src/lib/fileSystem.ts`                             | Already handles `resolveAppPath`, iOS container path migration, error swallowing        |
| Download status clear      | Direct `db.delete()`                   | `clearAudioFileDownloadStatus()` in `src/db/helpers/localData.ts`           | Enforces DB helper pattern; correctly removes from `localAudioFileDownloads`            |
| Active download check      | Manual map query                       | `downloadService.isDownloadActive(id)` in `DownloadService.ts`              | Already checks the `activeDownloads` map; single source of truth                        |
| All downloaded files query | Ad-hoc SQL                             | `getDownloadedAudioFilesWithLibraryInfo()` in `src/db/helpers/localData.ts` | Returns audio file ID, filename, download path, library item ID, and title in one query |
| Directory listing          | Legacy `FileSystem.readDirectoryAsync` | `new Directory(path).list()` (expo-file-system 19)                          | New API returns typed `File`/`Directory` objects; legacy API is string-only             |

**Key insight:** `detectCleanedUpFiles()` in `src/lib/fileLifecycleManager.ts` already implements the stale-record scan in full — it iterates `getDownloadedAudioFilesWithLibraryInfo()`, calls `verifyFileExists()`, and calls `clearAudioFileDownloadStatus()`. The only thing missing is the active-download guard and the foreground-resume wiring.

## Common Pitfalls

### Pitfall 1: False Positives During Active Downloads

**What goes wrong:** The scan runs concurrently with a download. The partial file exists on disk but is not yet marked `isDownloaded = true`. The scan sees a DB record with `isDownloaded = true` for a different file in the same item and either clears it, or the disk check for the in-progress file path happens to fail.

**Why it happens:** `startDownload()` sets up `activeDownloads` entry, but file creation races with the disk check.

**How to avoid:** Guard at the `libraryItemId` level — skip the entire item if `downloadService.isDownloadActive(libraryItemId)` returns true. This is O(1) and covers all files in the item.

**Warning signs:** User reports download completing but item still shows "not downloaded."

### Pitfall 2: iOS Container Path Mismatch

**What goes wrong:** `localAudioFileDownloads.downloadPath` stores a path relative to the app base directory (via `toAppRelativePath()`). `verifyFileExists()` calls `resolveAppPath()` to reconstruct the absolute path. If the app base directory changes between launches (iOS container migration), the reconstructed path may differ from what the file checker sees.

**Why it happens:** iOS can change the app container path between versions. `resolveAppPath()` always resolves relative to `Paths.cache` (the current base).

**How to avoid:** Use `verifyFileExists()` directly — it already calls `resolveAppPath()` internally. Do not reconstruct paths manually. The existing `repairDownloadStatus()` in `DownloadService` handles path repair separately.

**Warning signs:** Scan clears records even though files exist; user sees items as "not downloaded" after app update.

### Pitfall 3: Zustand Store Out of Sync After Scan

**What goes wrong:** The reconciliation scan clears `localAudioFileDownloads` rows directly (via `clearAudioFileDownloadStatus`), but the `downloadSlice`'s `downloadedItems` Set is populated at initialization and not automatically updated by DB writes.

**Why it happens:** Zustand store is in-memory; DB changes don't propagate to store automatically.

**How to avoid:** After the scan completes, call `useAppStore.getState().resetDownloads()` followed by `useAppStore.getState().initializeDownloads()` (or a lighter selective update). Because the scan is fire-and-forget, this re-initialization should also be async and non-blocking. The Storage tab reads directly from DB (via `getAllDownloadedAudioFiles()`), so it auto-updates when it re-renders.

**Warning signs:** Library item shows "downloaded" badge in UI after scan cleared the DB record.

### Pitfall 4: Zombie Partial Files Not Cleaned Up

**What goes wrong:** A zombie download's partial file is left on disk even though the DB record is cleared. The Storage tab then shows an orphan file (no DB record but file on disk).

**Why it happens:** The task `stop()` call halts the transfer but does not delete the partial file.

**How to avoid:** After calling `task.stop()`, explicitly delete the partial file using `getDownloadsDirectory(libraryItemId)` and then iterating with `Directory.list()` to find and delete the zombie's file. Or simply delete the entire `downloads/{libraryItemId}/` directory if all tasks for that item were zombies.

**Warning signs:** Storage tab shows "Unknown files" immediately after zombie cleanup.

### Pitfall 5: Orphan Disk Walk Misidentifies In-Progress Files

**What goes wrong:** The disk walk for orphan detection finds a partial file being written during an active download and classifies it as an orphan (no `isDownloaded = true` DB record).

**Why it happens:** `localAudioFileDownloads` only has a row with `isDownloaded = true` after `markAudioFileAsDownloaded()` is called in the completion handler. A file being downloaded has no DB row.

**How to avoid:** For the orphan scan, don't rely on DB rows alone. Cross-reference with `DownloadService.activeDownloads` tasks — if a discovered file's library item ID is actively downloading, skip it as a potential orphan.

## Code Examples

Verified patterns from the existing codebase:

### Stale Record Scan (already exists — `fileLifecycleManager.ts:263`)

```typescript
// Source: src/lib/fileLifecycleManager.ts
export async function detectCleanedUpFiles(): Promise<CleanedUpFile[]> {
  const downloadedFiles = await getDownloadedAudioFilesWithLibraryInfo();

  for (const downloadInfo of downloadedFiles) {
    const exists = await verifyFileExists(downloadInfo.downloadPath);
    if (!exists) {
      await clearAudioFileDownloadStatus(downloadInfo.audioFileId);
    }
  }
  return cleanedFiles;
}
```

**What's missing:** The `activeDownloads` guard before calling `clearAudioFileDownloadStatus`.

### Active Download Guard

```typescript
// Source: src/services/DownloadService.ts — public method isDownloadActive()
public isDownloadActive(libraryItemId: string): boolean {
  return this.activeDownloads.has(libraryItemId);
}
// isPaused items are also in activeDownloads — one check covers both
```

### Foreground Resume Hook Location

```typescript
// Source: src/app/_layout.tsx lines 74–177
const handleAppStateChange = async (nextAppState: AppStateStatus) => {
  if (nextAppState === "active") {
    // ... existing code ...

    // ADD: fire-and-forget reconciliation scan
    runDownloadReconciliationScan().catch((error) => {
      log.warn(`Download reconciliation scan rejected: ${String(error)}`);
    });
  }
};
```

### AppState Registration

```typescript
// Source: src/app/_layout.tsx line 172
const subscription = AppState.addEventListener("change", handleAppStateChange);
// return () => subscription?.remove();
```

### Directory List for Orphan Detection

```typescript
// Source: expo-file-system ~19.0.17 type declarations (verified)
// Directory.list() returns (Directory | File)[] synchronously
const downloadsDir = new Directory(Paths.document, "downloads");
if (downloadsDir.exists) {
  const items = downloadsDir.list();
  for (const item of items) {
    if (item instanceof Directory) {
      const files = item.list();
      for (const file of files) {
        if (file instanceof File) {
          // file.uri, file.size are available
        }
      }
    }
  }
}
```

### Clear Download Status (DB helper)

```typescript
// Source: src/db/helpers/localData.ts
export async function clearAudioFileDownloadStatus(audioFileId: string): Promise<void> {
  await db
    .delete(localAudioFileDownloads)
    .where(eq(localAudioFileDownloads.audioFileId, audioFileId));
}
// This deletes the row entirely from local_audio_file_downloads
// The audio_files row is preserved (contains track metadata)
```

### Storage Tab Data Flow

```typescript
// Source: src/app/(tabs)/more/storage.tsx lines 184–427
// The tab does NOT subscribe to DB changes reactively —
// it loads data on mount via useEffect(() => { refreshStorageStats() }, [])
// To force a refresh after scan: the tab already has a "Refresh" action button
// For reactive update: the Storage tab would need to use a store subscription or
// re-query DB on focus (via useFocusEffect from expo-router)
```

### Partial Download Query

```typescript
// Source: src/services/DownloadService.ts lines 498–515
public async getDownloadProgress(libraryItemId: string): Promise<{ downloaded: number; total: number; progress: number }> {
  const audioFiles = await getAudioFilesWithDownloadInfo(metadata.id);
  const total = audioFiles.length;
  const downloaded = audioFiles.filter(f => f.downloadInfo?.isDownloaded).length;
  // downloaded > 0 && downloaded < total => partially downloaded
}
```

## State of the Art

| Old Approach                                                | Current Approach                                                         | When Changed                        | Impact                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| Download path stored as absolute URI                        | Stored as relative path via `toAppRelativePath()`, resolved at read time | Recent schema change                | Survives iOS container path migrations                                                          |
| Download state in `audio_files` table                       | Separate `local_audio_file_downloads` table                              | Recent refactor (comment in schema) | API updates won't wipe download state                                                           |
| `FileSystem.readDirectoryAsync()` (legacy expo-file-system) | `new Directory(path).list()` (new API)                                   | expo-file-system 19                 | Returns typed `File`/`Directory` objects; legacy string-only API still works but is discouraged |

**Deprecated/outdated:**

- `FileSystem.getInfoAsync()` (legacy): Still works but not used in this codebase; replaced by `new File(path).exists` and `new File(path).size`.
- `FileSystem.readDirectoryAsync()` (legacy): Replaced by `Directory.list()` in expo-file-system 19.

## Open Questions

1. **Where exactly should the reconciliation scan function live?**
   - What we know: `detectCleanedUpFiles()` already exists in `fileLifecycleManager.ts`. It needs the active-download guard added.
   - What's unclear: Whether to extend the existing function or create a new `runDownloadReconciliationScan()` that wraps it with the guard.
   - Recommendation: Extend `detectCleanedUpFiles()` with an `options: { excludeActiveDownloads?: boolean }` parameter, or rename/create a new entry point in `DownloadService` to keep download logic colocated. Either is valid — choose based on whether the team prefers `DownloadService` as the single owner of download logic.

2. **Should the orphan scan run on foreground resume or only on Storage tab focus?**
   - What we know: The disk walk is heavier than the DB-based stale scan. The user decision says foreground resume for the stale scan, but does not address orphan detection timing explicitly.
   - What's unclear: Whether orphan detection runs on every foreground resume (expensive but keeps Storage tab always accurate) or on Storage tab focus (lazy, accurate when viewed).
   - Recommendation: Run orphan detection lazily on Storage tab focus using `useFocusEffect`. The stale scan (DB-based) runs on foreground resume per the locked decision. Orphan detection (disk walk) only matters when the user opens Storage.

3. **Zustand store invalidation after scan**
   - What we know: `downloadSlice.downloadedItems` is populated on `initializeDownloads()` and not automatically updated when DB rows change.
   - What's unclear: The right invalidation strategy — `resetDownloads()` + `initializeDownloads()` re-runs the full batch verification; a targeted removal is faster but requires exposing a new action.
   - Recommendation: Add a `removeDownloadedItem(libraryItemId: string)` action to `downloadSlice` for targeted removal after stale-record clearing, avoiding the full re-initialization.

4. **Partially downloaded state: where is it rendered?**
   - What we know: Library items show a "downloaded" badge currently. The partially-downloaded state requires a new badge variant.
   - What's unclear: Whether to extend `LibraryItem.tsx` directly or add a derived field to `downloadSlice`.
   - Recommendation: Add `partiallyDownloadedItems: Set<string>` to `downloadSlice` alongside `downloadedItems`, populated during `initializeDownloads()` where `downloaded > 0 && downloaded < total`.

## Sources

### Primary (HIGH confidence)

- Codebase direct inspection — `src/services/DownloadService.ts`, `src/lib/fileLifecycleManager.ts`, `src/db/helpers/localData.ts`, `src/app/_layout.tsx`, `src/db/schema/localData.ts`
- `node_modules/expo-file-system/build/ExpoFileSystem.types.d.ts` — verified `Directory.list()` returns `(Directory | File)[]`, synchronous; `File.size`, `File.exists`, `File.uri` all available

### Secondary (MEDIUM confidence)

- Codebase pattern: `applyICloudExclusionToExistingDownloads()` in `src/index.ts` — reference implementation for fire-and-forget background scan

### Tertiary (LOW confidence)

- None used

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — no new packages; all tools verified in codebase and type declarations
- Architecture: HIGH — AppState hook location, DB helper usage, and scan function all verified in source
- Pitfalls: HIGH — active-download guard gap verified directly in `detectCleanedUpFiles()`; path resolution mechanism verified in `fileSystem.ts`; Zustand sync gap verified in `downloadSlice.ts`

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable codebase; re-check if DownloadService or localData schema changes)
