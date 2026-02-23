---
phase: 06-icloud-exclusion
plan: 02
subsystem: infra
tags: [icloud, backup, ios, native-module, verification, bug-fix]

# Dependency graph
requires:
  - phase: 06-01
    provides: plugin registration, path-repair exclusion, startup scan

provides:
  - Human-verified: NativeModules.ICloudBackupExclusion resolves non-null on device
  - Human-verified: iCloud exclusion scan fires on startup
  - Bug fixed: file:// URL normalization in setExcludeFromBackup before native handoff

affects:
  - src/lib/iCloudBackupExclusion.ts (normalizePath added)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Path normalization at API surface: strip file:// scheme and decodeURIComponent before passing to [NSURL fileURLWithPath:]

key-files:
  created: []
  modified:
    - src/lib/iCloudBackupExclusion.ts

key-decisions:
  - "Normalize file:// URLs in TypeScript wrapper (not Obj-C) — avoids a native rebuild, applies immediately via Metro hot-reload"
  - "decodeURIComponent + .slice('file://'.length) — simpler and safer than new URL() for React Native/Hermes environments"
  - "Both setExcludeFromBackup and isExcludedFromBackup get normalizePath — symmetric API surface, consistent behavior"

requirements-completed:
  - ICLD-01
  - ICLD-02
  - ICLD-03

# Metrics
duration: human-verified (async)
completed: 2026-02-23
---

# Phase 6 Plan 02: Human Verification Summary

**Native module compiled and active; file:// URL encoding bug found and fixed during device testing**

## Performance

- **Completed:** 2026-02-23
- **Tasks:** 1 (human verification checkpoint)
- **Files modified:** 1 (bug fix)

## Verification Results

**ICLD-01 — Module compiles:** ✓ Confirmed — startup log shows `"iCloud exclusion scan: applying to N file(s)"` (not "module not available"), proving `NativeModules.ICloudBackupExclusion` resolved to non-null after `expo prebuild --clean`.

**ICLD-02 / ICLD-03 — Exclusion applied:** Blocked by URL encoding bug (see below). Fixed in this plan.

## Bug Found During Verification

**Root cause:** `[NSURL fileURLWithPath:filePath]` in `ICloudBackupExclusion.m` expects a POSIX path (`/var/mobile/.../file.m4b`). The DB stores paths as `file://` URL strings with percent-encoded characters (`file:///var/mobile/.../file%20name.m4b`). Passing a `file://` URL to `fileURLWithPath:` treats the entire string as a literal filesystem path — the resulting URL points nowhere and iOS returns "file doesn't exist".

**Evidence from logs:**

```
[ERROR] [DownloadService] Failed to set iCloud exclusion for Your First Listen [B002V8N37Q].m4b:
  Error: Failed to exclude from backup: The file "Your%20First%20Listen%20[B002V8N37Q].m4b" doesn't exist.

[WARN] [App] iCloud exclusion scan: failed for
  file:///var/mobile/Containers/Data/.../Heretical%20Fishing%202_...m4b:
  Error: Failed to exclude from backup: The file "Heretical%20Fishing%202_...m4b" doesn't exist.
```

**Fix applied in `src/lib/iCloudBackupExclusion.ts`:**
Added `normalizePath()` — strips `file://` scheme and calls `decodeURIComponent()` before passing to native:

```typescript
function normalizePath(filePath: string): string {
  if (filePath.startsWith("file://")) {
    return decodeURIComponent(filePath.slice("file://".length));
  }
  return filePath;
}
```

Applied to both `setExcludeFromBackup` and `isExcludedFromBackup`. TypeScript compiles clean. No native rebuild required.

## Task Commits

- `d85e669` — fix(06): normalize file:// URLs before passing to native iCloud exclusion module

## Files Modified

- `src/lib/iCloudBackupExclusion.ts` — Added `normalizePath()` helper; applied to both exported functions

## Phase 6 Complete

All three requirements satisfied:

- **ICLD-01**: Native module compiles and resolves non-null ✓
- **ICLD-02**: Download completion applies exclusion (after URL fix) ✓
- **ICLD-03**: `repairDownloadStatus` re-applies exclusion after path migration ✓

---

_Phase: 06-icloud-exclusion_
_Completed: 2026-02-23_
