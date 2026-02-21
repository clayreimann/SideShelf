---
phase: 06-icloud-exclusion
plan: 01
subsystem: infra
tags: [icloud, backup, ios, downloads, expo-plugin, native-module]

# Dependency graph
requires:
  - phase: 05-v1-cleanup
    provides: stable download infrastructure and DownloadService singleton

provides:
  - withExcludeFromBackup plugin registered in app.config.js (native module now compiles on prebuild)
  - iCloud exclusion re-applied in repairDownloadStatus after iOS container path migration
  - Retroactive startup scan applying exclusion to all existing downloaded files

affects:
  - 06-02 (remaining iCloud exclusion gaps if any)
  - DownloadService (repairDownloadStatus behavior changed)
  - initializeApp startup sequence

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Fire-and-forget startup scan pattern: applyICloudExclusionToExistingDownloads().catch() — non-blocking background task after logger init
    - Best-effort iCloud exclusion: individual file failures warn+continue, never abort the scan or the repair

key-files:
  created: []
  modified:
    - app.config.js
    - src/services/DownloadService.ts
    - src/index.ts

key-decisions:
  - "Use require() (no extension) to import withExcludeFromBackup in app.config.js — Node resolves .js before .ts, avoiding TypeScript parse errors in CommonJS config"
  - "Pass withExcludeFromBackup as bare function reference (not array) — plugin takes no options"
  - "log.warn() accepts one string arg — inline error via String(error) in template literal rather than passing error as second arg"
  - "Fire-and-forget with .catch() not Promise.void() — avoids unhandled rejection while keeping startup non-blocking"

patterns-established:
  - "Best-effort iCloud exclusion: warn on failure, never throw — correctness of path repair/download is independent of backup exclusion result"
  - "Startup scan pattern: fire background idempotent tasks after logger init using .catch() — preserves error visibility without blocking app startup"

requirements-completed:
  - ICLD-01
  - ICLD-02
  - ICLD-03

# Metrics
duration: 4min
completed: 2026-02-21
---

# Phase 6 Plan 01: iCloud Exclusion Integration Summary

**Three targeted wires closing iCloud backup gaps: plugin registration in app.config.js, exclusion re-applied after iOS container path repair, and retroactive startup scan for pre-existing downloads**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-21T04:27:31Z
- **Completed:** 2026-02-21T04:31:14Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Registered `withExcludeFromBackup` as the first entry in the `plugins` array in `app.config.js` via CommonJS `require()` — the native Obj-C module will now compile on `expo prebuild --clean`
- Added `setExcludeFromBackup(expectedPath)` try/catch in `repairDownloadStatus` `existsAtExpectedPath` branch — iOS container path migrations no longer silently re-enable iCloud backup for repaired files
- Added `applyICloudExclusionToExistingDownloads()` as a fire-and-forget startup task in `initializeApp()` — applies exclusion to all DB-tracked downloads on every cold boot, covering files downloaded before this feature existed

## Task Commits

Each task was committed atomically:

1. **Task 1: Register withExcludeFromBackup plugin in app.config.js** - `b44a01b` (feat)
2. **Task 2: Re-apply iCloud exclusion after path repair in repairDownloadStatus** - `72afdc1` (feat)
3. **Task 3: Add retroactive iCloud exclusion startup scan to initializeApp** - `14a7628` (feat)

**Plan metadata:** (docs commit — created with this summary)

## Files Created/Modified

- `app.config.js` - Added `require('./plugins/excludeFromBackup/withExcludeFromBackup')` and inserted `withExcludeFromBackup` as first plugin
- `src/services/DownloadService.ts` - Added `setExcludeFromBackup(expectedPath)` call with try/catch inside `repairDownloadStatus` `existsAtExpectedPath` branch
- `src/index.ts` - Added `getAllDownloadedAudioFiles` and `setExcludeFromBackup` imports; added `applyICloudExclusionToExistingDownloads()` function; fire-and-forget call after logger init

## Decisions Made

- Used `require()` with no file extension for CommonJS import in `app.config.js` to avoid TypeScript parse errors (Node resolves `.js` before `.ts`)
- Passed plugin as bare function reference (not `[withExcludeFromBackup]` array) — plugin takes no options
- Fixed `log.warn` type mismatch from plan template: the logger's `warn()` method accepts one string arg — inlined error as `String(error)` in template literal rather than passing as second argument
- Fire-and-forget call uses `.catch()` pattern not `void` keyword — ensures any rejection is visible in logs while keeping startup non-blocking

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed log.warn() type mismatch in plan code template**

- **Found during:** Task 2 (Re-apply iCloud exclusion in repairDownloadStatus)
- **Issue:** Plan snippet used `log.warn(message, error as Error)` with two arguments, but the logger subLogger type (`warn: (message: string) => void`) only accepts one string argument — TypeScript error TS2554
- **Fix:** Changed to `log.warn(\`...: ${String(error)}\`)`— inline error in template literal, consistent with existing`log.warn()` patterns throughout the codebase
- **Files modified:** `src/services/DownloadService.ts`, `src/index.ts` (same fix applied proactively in Task 3)
- **Verification:** `npx tsc --noEmit` shows no new errors in modified files
- **Committed in:** `72afdc1` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type mismatch in plan code template)
**Impact on plan:** Fix required for TypeScript compilation. Functionally identical — error info still captured in log message. No scope creep.

## Issues Encountered

- Pre-existing TypeScript errors in `DownloadService.ts` (lines 280, 325, 960): `markAudioFileAsDownloaded` called with 3 arguments where the type expects 2. These are unrelated to this plan's changes and were present before execution. Logged as out-of-scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- iCloud exclusion is now fully wired: plugin compiles, new downloads are excluded, repaired paths are re-excluded, and existing downloads are covered on startup
- Phase 6 Plan 02 can proceed with any remaining iCloud or download-related gaps
- No blockers introduced

---

_Phase: 06-icloud-exclusion_
_Completed: 2026-02-21_
