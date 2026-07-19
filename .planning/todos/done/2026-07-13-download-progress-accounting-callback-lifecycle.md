---
created: 2026-07-13T00:00:00.000Z
title: Download progress accounting and callback lifecycle fixes
area: downloads
brief: G
priority: P3
depends_on: []
files:
  - src/services/DownloadService.ts
  - src/lib/fileSystem.ts
---

## Problem

Found in a full-app review (2026-07-13). Three defects in
`src/services/DownloadService.ts`. All are UI/progress-reporting bugs — DB
download state is correct — but users see a jumpy or lying progress bar on
multi-file books, and force-redownload doesn't actually redownload.

1. **Wrong file counting on restore.** `handleTaskProgress` line ~983:
   `const isAlreadyCounted = alreadyDownloadedFiles > 0; // Simplified check`
   — when _some but not all_ files were previously downloaded, every DONE
   task is skipped from the `downloadedFiles` count (the boolean shortcut
   treats "any files already downloaded" as "this task was already
   counted"). Progress over/undercounts after app-kill restore.

2. **Concurrent downloads underreport bytes.** In `startDownload`, the
   closure variable `totalBytesDownloaded` only advances when a file
   _completes_ (inside `task.done`). The aggregate passed to
   `updateProgress` (line ~261: `totalBytesDownloaded + fileBytesDownloaded`)
   counts in-flight bytes for only the currently-reporting file. With 3
   files downloading concurrently, bytes in flight on the other 2 are
   invisible — the bar jumps at each file completion.

3. **Lifecycle bugs:**
   - `rewireProgressCallbacks` (line ~160) calls
     `downloadInfo.progressCallbacks.clear()` before re-subscribing one — a
     second live subscriber is silently dropped.
   - `downloadAudioFile` line ~539: `forceRedownload` has a TODO and never
     deletes the existing file — a "redownload corrupt file" action can
     effectively no-op (behavior depends on downloader overwrite semantics).

## Solution

**1+2. Unified per-task byte tracking:**

- Add per-task in-flight byte tracking (e.g. `Map<taskId, bytesDownloaded>`
  or a field on `DownloadTaskInfo`) updated from each task's progress
  callback.
- Compute aggregate progress in ONE place as:
  `sum(sizes of files already downloaded per DB) + sum(completed task bytes)
  - sum(in-flight bytes)` — used by BOTH the fresh-download path
(`startDownload`) and the restored path (`handleTaskProgress`), replacing
    both existing calculations.
- Fix per-task counted-ness on restore using task identity: a task counts as
  downloaded iff its state is DONE or its DB row
  (`local_audio_file_downloads`) is marked downloaded — never the aggregate
  `alreadyDownloadedFiles > 0` shortcut.
- Note: `handleTaskProgress` currently hits the DB on every progress event
  to count downloaded files — with the new tracking, fetch DB state once per
  restore and keep it in `DownloadInfo` instead.

**3. Lifecycle:**

- `rewireProgressCallbacks`: check its call sites first. If clear-all is
  genuinely intended by the single caller, rename to make that explicit and
  document; otherwise remove only the callback being replaced.
- `forceRedownload`: delete the existing file before creating the task,
  using the file utilities in `src/lib/fileSystem.ts`. Respect the
  percent-decoding handling documented in the surrounding comments
  (file:// URI vs decoded POSIX path — this is a real iOS pitfall the code
  already documents; keep paths consistent with the existing
  `decodeURIComponent(...replace(/^file:\/\//, ""))` pattern).

## Verification

- Unit tests with the mocked `@kesha-antonov/react-native-background-downloader`
  (global mocks live in `src/__tests__/setup.ts`):
  - two concurrent in-flight tasks → aggregate bytes = sum of both
  - restore with 1-of-3 files already downloaded → reports exactly 1
    completed file, not 0 or 2
  - `forceRedownload` deletes the pre-existing file before task creation
  - two subscribers + rewire → the untouched subscriber still receives
    updates (or the documented clear-all behavior is asserted)
- Manual: download a multi-file audiobook; progress advances monotonically
  without jumps at file boundaries.
- `npm test` fully green.

## Out of scope

- Download speed smoothing (`speedTracker`) internals.
- `DownloadRepairCollaborator` / container-path repair.
- Changing concurrency or downloader configuration.
