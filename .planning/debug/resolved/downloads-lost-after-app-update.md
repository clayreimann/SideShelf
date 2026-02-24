---
status: resolved
trigger: "downloads-lost-after-app-update"
created: 2026-02-24T00:00:00Z
updated: 2026-02-24T01:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — getAppBaseDirectory() returns Paths.cache but all downloads go to Documents. toAppRelativePath() computes relative path from caches base, gets ../../Documents/... which starts with ".." so guard rejects it and returns the ABSOLUTE path. Absolute paths are stored in DB. After iOS app update, container UUID changes, all absolute paths break. Reconciliation scan clears all stale DB records. Downloads appear missing.
test: Completed — read fileSystem.ts, localData.ts helper, DownloadService.ts, reconciliation scan
expecting: Fix is to make toAppRelativePath/resolveAppPath aware of both Documents and Caches base directories
next_action: Apply fix to fileSystem.ts

## Symptoms

expected: Downloads persist across app updates and remain playable after updating the app
actual: After an app update, all downloads are marked as orphaned files — they are detected but not linked to library items
errors: No specific error messages, but all downloads show as orphaned after update (observed in logs)
reproduction: Install app with downloads, update app to new version, open app — downloads are gone/orphaned
started: Ongoing issue discovered during phase 7 validation

## Eliminated

- hypothesis: AsyncStorage stores absolute paths
  evidence: No AsyncStorage usage found for download paths; all path storage goes through DB helpers
  timestamp: 2026-02-24

- hypothesis: DB helpers do not convert to relative paths
  evidence: localData.ts helpers DO call toAppRelativePath() before writing to DB — the conversion happens
  timestamp: 2026-02-24

## Evidence

- timestamp: 2026-02-24
  checked: src/lib/fileSystem.ts — getAppBaseDirectory() and toAppRelativePath()
  found: getAppBaseDirectory() ALWAYS returns Paths.cache (line 10). Downloads go to Documents (per DownloadService.ts line 279, 324, 689). toAppRelativePath() with a Documents path computes relative path from caches base = "../../Documents/..." which starts with ".." so guard on line 102 rejects it and returns the ABSOLUTE path unchanged.
  implication: All document-location download paths are stored as absolute paths in the DB

- timestamp: 2026-02-24
  checked: src/db/helpers/localData.ts — markAudioFileAsDownloaded()
  found: Calls toAppRelativePath(downloadPath) before storing — the conversion attempt is there, but toAppRelativePath() fails silently for Documents paths
  implication: DB stores absolute paths for all downloads (they are all in Documents)

- timestamp: 2026-02-24
  checked: src/lib/fileLifecycleManager.ts — runDownloadReconciliationScan()
  found: On foreground resume, calls verifyFileExists() on each stored path. If absolute path is stale (iOS updated container UUID), file is not found, clearAudioFileDownloadStatus() is called, removeDownloadedItem() is called on Zustand store.
  implication: After app update, ALL downloads are cleared because ALL absolute paths are invalid

- timestamp: 2026-02-24
  checked: src/services/DownloadService.ts — repairDownloadStatus()
  found: Attempts to find files at "expected path" using current container's getDownloadPath(). This would work BUT it only runs on demand (LibraryItemDetail mount, PlayerService.executeLoadTrack). The reconciliation scan runs FIRST on foreground resume and clears DB records before repair has a chance to run.
  implication: Repair mechanism exists but is defeated by the reconciliation scan running first

- timestamp: 2026-02-24
  checked: src/services/DownloadService.ts — downloadAudioFile() / startDownload()
  found: All downloads use "documents" storage location (lines 279, 324, 689). The "caches" location is only used for the file lifecycle manager (moving finished items to caches).
  implication: toAppRelativePath() will always fail for freshly downloaded files because they go to Documents

## Resolution

root_cause: |
getAppBaseDirectory() in src/lib/fileSystem.ts returned Paths.cache (hardcoded), but all new
downloads are stored in the Documents directory. When toAppRelativePath() tried to make a
Documents path relative, it computed a path starting with ".." (relative to caches base),
which was rejected by the guard, so the ABSOLUTE path was returned and stored in the DB.
After an iOS app update, the app container UUID changes, making all stored absolute paths
invalid. The reconciliation scan (runDownloadReconciliationScan) ran on foreground resume,
found that none of the stored paths existed, cleared all download DB records and Zustand state,
making all downloads appear as lost. Files were actually still on disk but the DB had no
record of them, so they appeared as orphans.

fix: |
Two-part fix:

1. fileSystem.ts: Replaced the single-base getAppBaseDirectory() with a prefixed scheme.
   toAppRelativePath() now tries Documents first, then Caches, and stores portable prefixed
   paths ("D:downloads/..." or "C:downloads/..."). resolveAppPath() reads the prefix and
   joins with the current container's Documents or Caches directory at runtime, so paths
   are never stale after an iOS app update. Legacy absolute paths (stored before this fix)
   are returned unchanged by resolveAppPath() — backward compatible.
2. fileLifecycleManager.ts: runDownloadReconciliationScan() now attempts path repair before
   clearing stale records. When a stored path is not found, it checks if the file exists at
   getDownloadPath(id, filename, "documents") then "caches". If found, it calls
   updateAudioFileDownloadPath() to migrate the DB record to the new portable path. Only
   if the file truly isn't found anywhere does it clear the record. This handles the
   transition period while old data still uses absolute paths.

verification: |

- npm test: 519 tests pass (5 new), 0 failures, no regressions
- npx tsc --noEmit: only pre-existing errors remain (none in changed files)
- New tests in fileLifecycleManager.test.ts cover: repair-from-documents, repair-from-caches,
  skip-active-downloads, no-clear-when-file-exists, clear-when-truly-missing

files_changed:

- src/lib/fileSystem.ts
- src/lib/fileLifecycleManager.ts
- src/lib/**tests**/fileLifecycleManager.test.ts
