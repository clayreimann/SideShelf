---
created: 2026-03-08T02:58:52.648Z
title: Standardize path handling, storage, and persistence across the app
area: general
files:
  - src/lib/fileSystem.ts
  - src/lib/iCloudBackupExclusion.ts
  - src/services/DownloadService.ts
  - src/db/helpers/localData.ts
---

## Problem

Path handling is inconsistent across the codebase, discovered during Phase 13 smoke testing:

1. **Encoding mismatch at iCloud exclusion**: `getDownloadPath()` returns a `file://` URI with percent-encoded characters (e.g. `%20`). `downloadAudioFile()` explicitly decodes to a POSIX path before passing to RNBD, so files land with actual spaces. The `normalizePath()` in `iCloudBackupExclusion.ts` only strips `file://` without decoding — its comment explaining "files are saved with literal %20" is now stale and wrong. Done handlers had to work around this with per-call `decodeURIComponent()` instead of a clean abstraction.

2. **Two path representations in flight at once**: Done handlers need `downloadPathUri` (file:// URI) for `markAudioFileAsDownloaded` and `downloadPathFs` (decoded POSIX path) for `setExcludeFromBackup`. This split is a code smell — callers shouldn't need to know which representation each function expects.

3. **`toAppRelativePath` / `resolveAppPath` boundary unclear**: The stored DB format (`D:downloads/item-id/file.m4b`) is a separate representation. The conversion layer (`toAppRelativePath`, `normalizeFileUri`, `decodeUriPathSegments`) adds another layer of encoding/decoding. It's not always obvious at a call site whether you have a `file://` URI, a POSIX path, or a prefixed relative path.

4. **`markAudioFileAsDownloaded` in `audioFiles.ts` ignores `storageLocation` param**: The wrapper drops the third argument before passing to `localData.ts`, so the storage location always defaults to "caches" even when downloads land in Documents.

The goal is a single, well-defined path type at each layer boundary so there's no ambiguity about encoding or representation.

## Solution

TBD — but likely:

- Define canonical path representations at each boundary (file:// for Expo FS APIs, POSIX for native calls, D:/C: prefix for DB storage)
- Fix `normalizePath` in `iCloudBackupExclusion.ts` to decode percent-encoding, with an updated comment reflecting the current RNBD behavior
- Fix `markAudioFileAsDownloaded` wrapper to pass `storageLocation` through
- Audit all callers of `setExcludeFromBackup`, `markAudioFileAsDownloaded`, `resolveAppPath`, and `toAppRelativePath` for encoding correctness
- Consider a `FilePath` type or builder that makes the representation explicit
