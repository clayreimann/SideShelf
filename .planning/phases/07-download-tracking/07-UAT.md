---
status: complete
phase: 07-download-tracking
source: 07-01-SUMMARY.md, 07-02-SUMMARY.md, 07-03-SUMMARY.md
started: 2026-02-27T00:00:00Z
updated: 2026-02-27T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Foreground-Resume Reconciliation Scan Fires

expected: Background the app, wait a few seconds, foreground it. Logs show "[ReconciliationScan] Starting download reconciliation scan..." and the scan completes without error. After restarting the app with a previously-downloaded item deleted from disk, the item's download badge is gone.
result: pass

### 2. Partial Badge Renders on Cover for Partially-Downloaded Item

expected: After manually deleting one audio file from a multi-file library item and foregrounding the app, the item's cover shows an amber "Partial" badge in the top-left corner and the full download badge is absent.
result: skipped
reason: No multi-file library items with some files deleted available to test with.

### 3. Partial Action Sheet Offers Both Management Options

expected: With a partially-downloaded item, the detail page header menu shows a "Partial Download" action. Tapping it opens an Alert titled "Partially Downloaded" with "Re-download missing files", "Clear downloaded files", and "Cancel" options. Choosing re-download starts a download; choosing clear removes existing files.
result: skipped
reason: No partially-downloaded items available to test with.

### 4. Storage Tab Auto-Refreshes on Tab Navigation

expected: Navigate to the Storage tab, then to another tab, then back to Storage. The storage stats refresh without a manual "Refresh Stats" tap. If orphan files exist, the "Unknown files" section appears without manual intervention.
result: pass

### 5. Unknown Files Section and Orphan Delete

expected: Place a file inside <app-documents>/downloads/<any-id>/ on device. Navigate to Storage tab. A "Unknown files" section appears showing the filename and size. Tapping the entry and confirming "Delete" removes the file from disk and the list without a page reload.
result: skipped
reason: No orphaned files (files on disk without DB records) available to test with.

## Summary

total: 5
passed: 2
issues: 0
pending: 0
skipped: 3

## Gaps

[none]
