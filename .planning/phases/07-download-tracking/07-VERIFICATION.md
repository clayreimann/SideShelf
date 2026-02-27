---
phase: 07-download-tracking
verified: 2026-02-23T22:00:00Z
status: human_needed
score: 12/12 must-haves verified
re_verification: false
human_verification:
  - test: "Foreground-resume reconciliation scan fires"
    expected: "After backgrounding the app and returning, logs show '[ReconciliationScan] Starting download reconciliation scan...' and scan completes without error"
    why_human: "AppState.addEventListener behavior cannot be verified by grep — requires a running device"
  - test: "Partial badge appears on cover for item with only some files on disk"
    expected: "After manually deleting one audio file from a multi-file library item and foregrounding the app, the item's cover shows an amber 'Partial' badge in the top-left corner"
    why_human: "Visual rendering requires a running app with real downloaded content"
  - test: "Partial badge action sheet offers 'Re-download missing files' and 'Clear downloaded files'"
    expected: "Tapping 'Partial Download' in the library item detail header menu opens an Alert with both options, and choosing 're-download' restarts the download"
    why_human: "Alert.alert interaction cannot be verified programmatically"
  - test: "Storage tab refreshes on every tab navigation"
    expected: "Navigating away from and back to the Storage tab triggers a fresh scan (logs show refreshStorageStats activity); the 'Unknown files' section appears if orphan files exist"
    why_human: "useFocusEffect tab-focus behavior requires a running navigation context"
  - test: "Orphan file delete removes file from disk and list"
    expected: "Placing a non-DB-tracked file in documents/downloads/test-id/fake.m4b, navigating to Storage, seeing 'fake.m4b' in 'Unknown files', tapping it, confirming Delete, then confirming the file is gone from disk and removed from the list"
    why_human: "File system interaction and list update require a running app"
---

# Phase 7: Download Tracking — Verification Report

**Phase Goal:** The app's awareness of which files are downloaded matches what is actually on disk — stale records from deleted or missing files are cleared on startup, and the reconciliation scan does not corrupt in-progress downloads

**Verified:** 2026-02-23T22:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                             | Status   | Evidence                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | After foregrounding the app, stale DB records for missing files are cleared                                       | VERIFIED | `runDownloadReconciliationScan()` exported from `fileLifecycleManager.ts` lines 317-398; wired fire-and-forget in `_layout.tsx` lines 137-139 (playing branch) and 179-181 (normal branch)          |
| 2   | Active and paused downloads are never touched by the reconciliation scan                                          | VERIFIED | `downloadService.isDownloadActive(libraryItemId)` guard at lines 331-334 (stale scan) and 367-369 (zombie detection) in `fileLifecycleManager.ts`; guard also present in `orphanScanner.ts` line 62 |
| 3   | Zombie downloads (tracked by OS, not by DownloadService) are stopped and their partial files deleted              | VERIFIED | `RNBackgroundDownloader.checkForExistingDownloads()` at line 359; underscore-split parse at lines 363-364; `task.stop()` at line 373; `docsDir.delete()` and `cachesDir.delete()` at lines 377-383  |
| 4   | After the scan runs, the Zustand downloadedItems Set reflects the cleared records                                 | VERIFIED | Dynamic `import('@/stores/appStore')` at line 349; `useAppStore.getState().removeDownloadedItem(libraryItemId)` at line 351                                                                         |
| 5   | A library item with some (not all) files on disk shows a 'Partial' badge instead of the full download badge       | VERIFIED | `CoverImange.tsx` lines 48-54: renders `<View style={styles.partialBadgeContainer}>` when `isPartiallyDownloaded && !isDownloaded`                                                                  |
| 6   | Tapping the partial badge shows an action sheet offering 'Re-download missing files' and 'Clear downloaded files' | VERIFIED | `LibraryItemDetail.tsx` lines 362-384: `handlePartialDownloadAction` calls `Alert.alert("Partially Downloaded", ...)` with "Re-download missing files" and "Clear downloaded files" options         |
| 7   | The partial badge reflects the partiallyDownloadedItems Set from the store (reactive)                             | VERIFIED | `appStore.ts` line 977-979: `isItemPartiallyDownloaded` reads `useAppStore.getState().downloads.partiallyDownloadedItems.has(itemId)`; `CoverImange.tsx` line 22 consumes it                        |
| 8   | The Storage tab refreshes its data every time the user navigates to it                                            | VERIFIED | `storage.tsx` lines 452-456: `useFocusEffect(useCallback(() => { void refreshStorageStats(); }, [refreshStorageStats]))` — no useEffect fallback present                                            |
| 9   | Files on disk with no DB record appear in an 'Unknown files' section at the bottom of the Storage tab             | VERIFIED | `storage.tsx` lines 557-582: section added with `...(orphanFiles.length > 0 ? [{ title: 'Unknown files', data: ... }] : [])`                                                                        |
| 10  | Each orphan file entry shows filename and file size                                                               | VERIFIED | `storage.tsx` line 562: `label: orphan.filename`; line 563: `sublabel: formatBytes(orphan.size)`; renderItem at line 679-682 renders sublabel                                                       |
| 11  | The user can delete an orphan file from the 'Unknown files' section                                               | VERIFIED | `storage.tsx` lines 458-468: `deleteOrphanFile` deletes file from disk via `file.delete()` and filters it from state; Alert with destructive "Delete" action at lines 564-577                       |
| 12  | Orphan scan skips library item directories that have an active download in progress                               | VERIFIED | `orphanScanner.ts` lines 62-65: `if (downloadService.isDownloadActive(libraryItemId)) { continue; }`                                                                                                |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact                                       | Expected                                                                                     | Status   | Details                                                                                                                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/fileLifecycleManager.ts`              | `runDownloadReconciliationScan()` with stale scan + zombie detection + active-download guard | VERIFIED | Substantive 80-line function; exports confirmed; all three operations present                                                                                                           |
| `src/stores/slices/downloadSlice.ts`           | `removeDownloadedItem(id)` action and `partiallyDownloadedItems: Set<string>` in state       | VERIFIED | Interface at lines 66, 34; implementation at lines 357-373; initial state at line 81; populated in `initializeDownloads` at line 180                                                    |
| `src/app/_layout.tsx`                          | Fire-and-forget reconciliation scan in AppState 'active' handler                             | VERIFIED | Import at line 3; two calls at lines 137-139 and 179-181                                                                                                                                |
| `src/stores/appStore.ts`                       | `useDownloads` hook exposes `isItemPartiallyDownloaded` selector                             | VERIFIED | `useCallback` selector at lines 977-980; included in `useMemo` return at line 995 and dep array at line 1011                                                                            |
| `src/components/ui/CoverImange.tsx`            | Partial download badge — shows when `isPartiallyDownloaded` is true                          | VERIFIED | Badge JSX at lines 48-54; StyleSheet entries at lines 70-85                                                                                                                             |
| `src/components/library/LibraryItemDetail.tsx` | Action sheet for partial items with re-download and clear options                            | VERIFIED | `handlePartialDownloadAction` at lines 362-384; "partial" menu action at lines 496-500; wired in `handleMenuAction` at line 462                                                         |
| `src/lib/orphanScanner.ts`                     | `scanForOrphanFiles()` with disk walk, DB comparison, active-download guard                  | VERIFIED | 98-line new file; exports `scanForOrphanFiles` and `OrphanFile`; uses both `getAllDownloadedAudioFiles` and `getAllDownloadedLibraryFiles` (deviation from plan that broadens coverage) |
| `src/app/(tabs)/more/storage.tsx`              | `useFocusEffect` refresh + Unknown files section with delete action                          | VERIFIED | `useFocusEffect` at lines 452-456; `orphanFiles` state at line 185; `scanForOrphanFiles` call at lines 428-433; "Unknown files" section at lines 557-582                                |

### Key Link Verification

| From                                           | To                                   | Via                                                                                | Status | Details                                                                                                         |
| ---------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| `src/app/_layout.tsx`                          | `src/lib/fileLifecycleManager.ts`    | `import runDownloadReconciliationScan`, call in `nextAppState === 'active'` branch | WIRED  | Import at line 3; two `.catch()` fire-and-forget calls at lines 137 and 179                                     |
| `src/lib/fileLifecycleManager.ts`              | `src/services/DownloadService.ts`    | `downloadService.isDownloadActive(libraryItemId)` guard                            | WIRED  | Guard at lines 331 and 367; import at line 31                                                                   |
| `src/lib/fileLifecycleManager.ts`              | `src/stores/appStore.ts`             | dynamic `import('@/stores/appStore')` then `removeDownloadedItem`                  | WIRED  | Dynamic import at line 349; call at line 351                                                                    |
| `src/components/ui/CoverImange.tsx`            | `src/stores/slices/downloadSlice.ts` | `useDownloads().isItemPartiallyDownloaded(libraryItemId)` from store               | WIRED  | Destructured at line 17; computed at line 22; used at line 48                                                   |
| `src/components/library/LibraryItemDetail.tsx` | `src/services/DownloadService.ts`    | `startDownload` for re-download, `deleteDownload` for clearing                     | WIRED  | `startDownload` called in `handlePartialDownloadAction` at line 371; both come from `useDownloads()` at line 62 |
| `src/app/(tabs)/more/storage.tsx`              | `src/lib/orphanScanner.ts`           | `scanForOrphanFiles()` called in `refreshStorageStats`                             | WIRED  | Import at line 30; call at line 429; result stored in `orphanFiles` state at line 430                           |
| `src/lib/orphanScanner.ts`                     | `src/services/DownloadService.ts`    | `downloadService.isDownloadActive(libraryItemId)` guard                            | WIRED  | Import at line 3; guard at line 62                                                                              |

### Requirements Coverage

| Requirement | Source Plans | Description                                                                                          | Status    | Evidence                                                                                                                                                                                   |
| ----------- | ------------ | ---------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DL-01       | 07-01, 07-02 | Stale "downloaded" DB records where files no longer exist on disk are cleared on startup             | SATISFIED | Reconciliation scan (07-01) clears stale records on foreground resume; `partiallyDownloadedItems` Set (07-01/02) tracks partial state visible in UI                                        |
| DL-02       | 07-02, 07-03 | Storage tab accurately reflects all currently downloaded items                                       | SATISFIED | `useFocusEffect` refresh (07-03) triggers on every tab focus; "Unknown files" section (07-03) shows orphan disk files; partial badge in CoverImage (07-02) distinguishes partial from full |
| DL-03       | 07-01        | Download reconciliation scan excludes active in-progress downloads (no partial-file false positives) | SATISFIED | `isDownloadActive` guard in both stale scan loop and zombie detection in `fileLifecycleManager.ts`; same guard in `orphanScanner.ts`                                                       |

No orphaned requirements found — all three DL-xx IDs from REQUIREMENTS.md Phase 7 row are claimed by plans and verified.

### Anti-Patterns Found

| File                              | Line | Pattern                                              | Severity | Impact                                                                                                                                                    |
| --------------------------------- | ---- | ---------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/fileLifecycleManager.ts` | 233  | TS error: `Property 'lastAccessedAt' does not exist` | Info     | Pre-existing error in `shouldMoveToCache` function (not a phase-07 function). Documented in 07-01-SUMMARY.md as pre-existing. No impact on phase-07 goal. |

No TODOs, placeholder returns, or empty implementations found in phase-07 authored code.

### Human Verification Required

#### 1. Foreground-resume reconciliation scan fires

**Test:** Background the app, wait 5 seconds, foreground it, then check device logs for `[ReconciliationScan]` tag entries
**Expected:** Log line "Starting download reconciliation scan..." appears shortly after foregrounding; scan completes with "Reconciliation scan complete" within a few seconds
**Why human:** `AppState.addEventListener` behavior and the fire-and-forget promise resolution cannot be verified by static analysis

#### 2. Partial badge renders on cover for partially-downloaded item

**Test:** Download a multi-file audiobook. Locate one audio file on disk via Files app or device file browser. Delete it manually. Background and foreground the app. Navigate to the library.
**Expected:** The affected item's cover shows an amber "Partial" badge in the top-left corner; the full download badge is absent
**Why human:** Visual rendering, reconciliation scan triggering on foreground, and badge state update all require a running app with real device downloads

#### 3. Partial action sheet offers both management options

**Test:** With a partially-downloaded item (from test 2), navigate to its detail page and open the header menu
**Expected:** A "Partial Download" action is visible. Tapping it opens an Alert titled "Partially Downloaded" with three options: "Re-download missing files", "Clear downloaded files", and "Cancel". Choosing "Re-download missing files" starts a download; choosing "Clear downloaded files" removes existing files.
**Why human:** Alert.alert behavior and download initiation require a running app

#### 4. Storage tab auto-refreshes on tab navigation

**Test:** Navigate to the Storage tab, then navigate to another tab, then return to Storage
**Expected:** The storage stats visibly refresh (loading state or updated values) without requiring a manual "Refresh Stats" tap; if orphan files exist, the "Unknown files" section appears without manual intervention
**Why human:** `useFocusEffect` triggering on tab focus requires a live navigation context

#### 5. Orphan file deletion removes file from disk and list

**Test:** Place a file (e.g., `test.m4b`) inside `<app-documents>/downloads/<any-id>/` on device. Navigate to Storage tab.
**Expected:** A "Unknown files" section appears with `test.m4b` and its size. Tapping the entry shows a "Delete Unknown File" Alert. Confirming "Delete" removes the file from disk and removes the entry from the list without page reload.
**Why human:** File placement on device, section visibility, and Alert interaction require a running app

---

## Notes

**Deviation (07-03 Task 1):** `orphanScanner.ts` uses both `getAllDownloadedAudioFiles()` and `getAllDownloadedLibraryFiles()` to build the known-paths Set, rather than only `getDownloadedAudioFilesWithLibraryInfo()` as specified in the plan. This is a correctness improvement — the plan's approach would have false-positived on PDF/library file downloads. The deviation is documented in 07-03-SUMMARY.md.

**completeDownload removes from partiallyDownloadedItems:** `downloadSlice.ts` line 269-270 clears the partial badge reactively when a re-download completes — no additional work was needed in Plan 07-02 for this behavior.

**Pre-existing TS errors:** All TypeScript errors in the compilation output (`database.ts` mock, `PlayerStateCoordinator` tests, `DownloadService`, `librarySlice` tests, `PlayerStateCoordinator.ts`, `PlayerBackgroundService.ts`, `fileLifecycleManager.ts:233`, `index.tsx`) were pre-existing before phase 07. None originate from phase-07 code. The single error touching a phase-07 file (`fileLifecycleManager.ts:233`) is in the pre-existing `shouldMoveToCache` function, not in `runDownloadReconciliationScan`.

---

_Verified: 2026-02-23T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
