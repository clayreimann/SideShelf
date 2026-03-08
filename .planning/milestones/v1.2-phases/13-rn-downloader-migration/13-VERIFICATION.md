---
phase: 13-rn-downloader-migration
verified: 2026-03-08T00:00:00Z
status: passed
score: 5/5 must-haves verified
human_verification:
  - test: "Run smoke test from docs/investigation/rnbd-fork-diff.md Section 9 on device/simulator after native rebuild"
    expected: "After force-killing the app mid-download and relaunching, the download resumes correctly — progress is non-zero and download eventually completes. Item does not appear stuck at 0% with no activity."
    why_human: "Restart recovery requires a native iOS URLSession environment — cannot be verified by unit tests alone. The post-summary fixes (5241187, 281cbdf, 475d1c5) address known restart issues found during smoke testing, but end-to-end behavior requires a device run with a real native rebuild."
  - test: "Confirm native rebuild completes cleanly: run 'npm run ios' and verify the app launches without build errors"
    expected: "expo prebuild --clean completes, Xcode compiles without errors, app installs on simulator/device. mainline plugin patches AppDelegate.swift (handleEventsForBackgroundURLSession present)."
    why_human: "Native plugin patching (AppDelegate.swift) and MMKV Gradle dependency require an actual prebuild — this cannot be verified from source analysis alone. The mainline Expo plugin has not yet been rebuilt since 8a2e112."
---

# Phase 13: RN Downloader Migration Verification Report

**Phase Goal:** The custom spike-event-queue fork is replaced by mainline @kesha-antonov/react-native-background-downloader@4.5.3; downloads continue to work correctly including restart recovery and iCloud exclusion

**Verified:** 2026-03-06

**Status:** human_needed

**Re-verification:** Yes — smoke test on 2026-03-08 found two bugs; both fixed in commit a564b8e

---

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                          | Status                                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fork diff spike documented — API surface changes and task.metadata persistence documented                      | VERIFIED                                    | `docs/investigation/rnbd-fork-diff.md` exists (415 lines, 10 sections). All 4 breaking API changes documented with exact before/after snippets. task.metadata MMKV persistence analyzed in Section 3 and Open Question Q3.                                                                                                                                                                     |
| 2   | package.json references mainline @kesha-antonov/react-native-background-downloader@4.5.3 — custom fork removed | VERIFIED                                    | `package.json` line 41: `"@kesha-antonov/react-native-background-downloader": "^4.5.3"`. No `clayreimann` or `spike-event-queue` string anywhere in package.json.                                                                                                                                                                                                                              |
| 3   | DownloadService.ts uses mainline API — no fork-only API calls remain                                           | VERIFIED                                    | Lines 35-39: named imports `setConfig`, `getExistingDownloadTasks`, `createDownloadTask`. Line 90: `setConfig({...})`. Line 96: `await getExistingDownloadTasks()`. Line 545: `createDownloadTask({...})`. Line 589: `task.start()`. Lines 392/409/430: `void task.pause/resume/stop()`. Zero occurrences of `RNBackgroundDownloader`, `checkForExistingDownloads`, or `download(` (fork API). |
| 4   | Restart recovery works with mainline task IDs and metadata format                                              | VERIFIED (automated) / NEEDS HUMAN (device) | Unit tests pass: `initialize() re-attaches progress, done, and error handlers to restored tasks` (49/49 green). Post-summary commits 5241187, 281cbdf, 475d1c5 add: concurrent-init mutex, DONE-on-restore completion path, Zustand state sync for restored downloads, and progress seeding. Implementation is substantive and wired. End-to-end device smoke test still required.             |
| 5   | iCloud exclusion withExcludeFromBackup plugin applies correctly post-migration                                 | VERIFIED                                    | `plugins/excludeFromBackup/withExcludeFromBackup.ts` contains zero references to `@kesha-antonov/react-native-background-downloader`. `setExcludeFromBackup` is called in DownloadService at lines 311, 354, 804, 837 — covering both new downloads and restored tasks. Test `done() handler calls setExcludeFromBackup with the download path` passes.                                        |

**Score:** 5/5 truths verified (4 fully automated, 1 requires device run)

---

### Required Artifacts

| Artifact                                         | Expected                                          | Status   | Details                                                                                                                                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/investigation/rnbd-fork-diff.md`           | Complete API surface diff and migration guidance  | VERIFIED | 415 lines, 10 sections. All required content confirmed: API diff table (14 rows), 4 call site before/after snippets, event queue analysis, iCloud plugin independence, smoke test checklist. Commit e31daa2.                                                                     |
| `package.json`                                   | Mainline 4.5.3 dependency, fork removed           | VERIFIED | Line 41: `"^4.5.3"`. No fork URL traces. Commits 8a2e112.                                                                                                                                                                                                                        |
| `src/services/DownloadService.ts`                | Mainline API usage                                | VERIFIED | Named imports wired. All 5 required changes implemented. Additional restart-recovery logic in `restoreExistingDownloads()` (line 740+). `initializePromise` mutex (line 59). `getActiveDownloadIds()` (line 450). Commits cf2abec, 5241187, 281cbdf, a708d26.                    |
| `src/__tests__/setup.ts`                         | Updated Jest mock matching mainline named exports | VERIFIED | Lines 135-141: `createDownloadTask`, `getExistingDownloadTasks`, `setConfig`, `completeHandler`, `default: undefined`. Commit b2ef01e.                                                                                                                                           |
| `src/services/__tests__/DownloadService.test.ts` | Startup reconciliation unit tests                 | VERIFIED | 49 tests pass. Covers: initialize() calls getExistingDownloadTasks, re-attaches handlers to restored tasks, startDownload calls createDownloadTask with correct shape, task.start() ordered after handlers, done() handler calls setExcludeFromBackup. Commits b2ef01e, a708d26. |
| `app.config.js`                                  | Mainline Expo plugin registration                 | VERIFIED | Lines 62-64: `withExcludeFromBackup` then `["@kesha-antonov/react-native-background-downloader", {}]` then `"expo-router"`. Correct position confirmed. Commit 8a2e112.                                                                                                          |

---

### Key Link Verification

| From                                             | To                                                  | Via                                                         | Status | Details                                                                                                                                                                                                        |
| ------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/services/DownloadService.ts`                | `@kesha-antonov/react-native-background-downloader` | Named imports                                               | WIRED  | Lines 35-39: `import { setConfig, getExistingDownloadTasks, createDownloadTask }`. No default import. `import type { DownloadTask }` on line 39.                                                               |
| `src/services/DownloadService.ts`                | Mainline download creation                          | `createDownloadTask()` + `task.start()`                     | WIRED  | Line 545: `createDownloadTask({...})`. Line 589: `task.start()`. Comment on line 559 enforces handler-before-start ordering.                                                                                   |
| `src/services/DownloadService.ts`                | Restart recovery                                    | `getExistingDownloadTasks()` + `restoreExistingDownloads()` | WIRED  | Line 96: `await getExistingDownloadTasks()`. Line 100: `await this.restoreExistingDownloads(existingTasks)`. Line 740: `restoreExistingDownloads` handles DONE-on-restore (line 829) and re-attaches handlers. |
| `src/stores/slices/downloadSlice.ts`             | `DownloadService`                                   | `getActiveDownloadIds()` + `subscribeToProgress()`          | WIRED  | Lines 123-138: `initializeDownloads()` calls `getActiveDownloadIds()` and subscribes to each restored ID. Ensures Zustand state reflects native restored tasks.                                                |
| `app.config.js`                                  | `@kesha-antonov/react-native-background-downloader` | Expo plugin registration                                    | WIRED  | Line 63: `["@kesha-antonov/react-native-background-downloader", {}]`. Position: after withExcludeFromBackup, before expo-router.                                                                               |
| `src/services/__tests__/DownloadService.test.ts` | `src/services/DownloadService.ts`                   | Jest import                                                 | WIRED  | Line 20: `import { DownloadService } from "../DownloadService"`. 49 tests all pass.                                                                                                                            |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                      | Status    | Evidence                                                                                                                                                 |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DWNLD-01    | 13-01       | Fork diff spike completed — API vs mainline 4.5.3 documented, task.metadata persistence verified | SATISFIED | `docs/investigation/rnbd-fork-diff.md` committed at e31daa2. Marked `[x]` in REQUIREMENTS.md line 42.                                                    |
| DWNLD-02    | 13-02       | package.json migrated to mainline 4.5.3                                                          | SATISFIED | `package.json` line 41 confirmed. Marked `[x]` in REQUIREMENTS.md line 43.                                                                               |
| DWNLD-03    | 13-02       | DownloadService.ts API calls updated to mainline interface                                       | SATISFIED | All renamed methods verified in DownloadService.ts. Marked `[x]` in REQUIREMENTS.md line 44.                                                             |
| DWNLD-04    | 13-02       | withExcludeFromBackup plugin behavior verified post-migration                                    | SATISFIED | Plugin has zero downloader dependency (confirmed by grep). iCloud exclusion wired at 4 call sites. Test passes. Marked `[x]` in REQUIREMENTS.md line 45. |

No orphaned requirements found. All DWNLD-01 through DWNLD-04 are claimed by plan frontmatter and confirmed in REQUIREMENTS.md traceability table (lines 98-101) with status Complete.

---

### Anti-Patterns Found

| File                              | Line | Pattern                                              | Severity | Impact                                                                                                                                                                                                                         |
| --------------------------------- | ---- | ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/services/DownloadService.ts` | 527  | `// TODO: Delete existing file before redownloading` | Info     | Pre-existing pattern unrelated to Phase 13. Force redownload path logs and throws "File already exists" instead of deleting. Not a regression — this TODO predates the migration and does not affect normal download behavior. |

No blocker or warning anti-patterns found in migration-modified files. The TODO at line 527 is pre-existing and out of scope for Phase 13.

---

### Post-Summary Commits (Restart Recovery Hardening)

The SUMMARY was finalized at commit f470773 but four additional fix commits landed on the branch after checkpoint submission. These are real fixes from actual smoke testing, not regressions:

| Commit    | Description                                                           | Impact on Goal                                                                             |
| --------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `5241187` | Concurrent init mutex + DONE-on-restore completion path               | Critical: prevents double-init race; handles downloads that completed while app was killed |
| `281cbdf` | Sync Zustand state with restored downloads via getActiveDownloadIds() | Critical: without this, UI showed isDownloading=false even though download was active      |
| `a708d26` | Reconnect progress callback when download already active              | Moderate: handles post-relaunch UI state reconnect without throwing                        |
| `475d1c5` | Seed Zustand activeDownloads immediately on restore                   | Moderate: prevents UI flicker when lastProgressUpdate is null on relaunch                  |

These commits strengthen restart recovery (Success Criterion 4) and are all committed, tested (732 passing), and on the branch. They represent the phase executor finding and fixing real integration issues during smoke testing, which is the intended workflow.

---

### Human Verification Required

#### ✓ Post-Smoke-Test Fixes (2026-03-08)

Two bugs discovered during smoke testing and fixed in commit `a564b8e`:

1. **No auto-resume after restart**: `restoreExistingDownloads()` never called `task.resume()`. RNBD mainline v4 returns restored tasks paused at the JS layer — native download runs but events don't flow until `resume()` is called. User had to manually pause then resume to unblock.

2. **iCloud exclusion "No such file or directory"**: Done handlers passed the `file://` URI (with `%20` encoding) to `setExcludeFromBackup`. Since `downloadAudioFile()` decodes the path before passing to RNBD, files land with actual spaces. `normalizePath()` only strips `file://` without decoding, so `setxattr` received a path that doesn't exist.

Both fixes verified by the user and accepted.

---

#### 1. Restart Recovery Smoke Test (device/simulator with native rebuild)

**Test:** Run `npm run ios` to do a clean native prebuild. Then: start a download on a library item, confirm progress appears in UI, force-kill the app (swipe up in App Switcher), wait 3 seconds, relaunch, navigate to the same item.

**Expected:** Download is in-progress (progress > 0%) with activity continuing toward 100%, OR already completed. Item does NOT show as not-downloading with 0% and no activity.

**Why human:** A native URLSession background download environment is required. Unit tests mock the downloader layer and cannot verify that iOS actually resumes the background URL session after process kill, or that MMKV metadata survives the kill. The post-summary fix commits address the known Zustand/DownloadService state sync issues found during smoke testing, but the full end-to-end path requires a device run.

#### 2. Native Rebuild Validation

**Test:** Run `npm run ios` (expo prebuild --clean && expo run:ios). Verify the build succeeds without errors related to MMKV, AppDelegate, or the downloader package.

**Expected:** Build completes. App launches. AppDelegate.swift (in the generated ios/ directory) contains `handleEventsForBackgroundURLSession`. No MMKV version conflict errors in the build log.

**Why human:** The mainline Expo plugin patches AppDelegate.swift during prebuild. This cannot be verified from source analysis — it requires running prebuild against the actual native environment. The project has `newArchEnabled: true` (Expo 54 + RN 0.81.5) and mainline 4.5.3 TurboModule compatibility needs a live build confirmation.

---

### Gaps Summary

No automated gaps found. All 5 observable truths are satisfied by the codebase. The two human verification items are standard integration-testing steps that always follow a native package migration — they are not deficiencies in the implementation.

The phase is feature-complete at the JS layer. The native rebuild is a user action explicitly documented in the SUMMARY as required post-plan work.

---

_Verified: 2026-03-06_
_Verifier: Claude (gsd-verifier)_
