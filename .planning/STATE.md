# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-20)

**Core value:** The coordinator owns player state — services execute its commands and report reality back, not the other way around.
**Current focus:** Milestone v1.1 — Phase 7: Download Tracking (next)

## Current Position

Phase: 7 of 9 in progress (v1.1: Download Tracking — Plan 1 of 3 complete)
Next: Phase 7, Plan 02 — Download Status Indicators
Status: Phase 7 Plan 01 complete; ready for Plan 02
Last activity: 2026-02-23 — Phase 7 Plan 01 complete (reconciliation scan wired, partiallyDownloadedItems Set added)

Progress: [████████░░] ~73% (v1.0 complete; Phase 6 complete; Phase 7 Plan 01 complete)

## Performance Metrics

**Velocity (v1.0):**

- Total plans completed: 16 (Phases 2–5 including 03.1)
- Average duration: not tracked
- Total execution time: ~1 month

**By Phase (v1.0):**

| Phase | Plans | Status   |
| ----- | ----- | -------- |
| 2     | 2/2   | Complete |
| 3     | 2/2   | Complete |
| 03.1  | 2/2   | Complete |
| 4     | 3/3   | Complete |
| 5     | 6/6   | Complete |

_v1.1 metrics will be tracked per phase_

| Phase 07 P01 | 3 min | 3 tasks | 3 files |

## Accumulated Context

### Decisions (v1.0 — carried forward)

Decisions are logged in PROJECT.md Key Decisions table.

- [Phase 1]: Keep custom FSM over XState — production-validated, XState adds 16.7 kB with no functional gain
- [Phase 1]: observerMode flag preserved as instant rollback (v1.0 done; flag survives as safety net)
- [Phase 05, Plan 06]: startSessionLocks mutex removed — coordinator serial queue + BGS existingSession guard provide equivalent protection
- [Phase 3.1]: shouldOpenOnLongPress on MenuView — short press = skip action; skip action itself untested — SKIP-01 in v1.1

### Decisions (v1.1)

- [Phase 6, Plan 01]: Use require() (no extension) for withExcludeFromBackup in app.config.js — CommonJS, Node resolves .js before .ts
- [Phase 6, Plan 01]: Pass withExcludeFromBackup as bare function reference (not array) — plugin takes no options
- [Phase 6, Plan 01]: Best-effort iCloud exclusion — warn on failure, never throw; download/repair correctness is independent of backup exclusion
- [Phase 6, Plan 02]: Normalize file:// URLs before passing to [NSURL fileURLWithPath:] — strip scheme and decodeURIComponent in TypeScript wrapper, not Obj-C
- [Phase 7, Plan 01]: isDownloadActive covers both active and paused downloads (paused items stay in activeDownloads Map) — single guard sufficient for reconciliation scan
- [Phase 7, Plan 01]: Dynamic import of appStore inside runDownloadReconciliationScan to avoid circular dependency with DownloadService

### v1.1 Research Findings (high-confidence)

- iCloud exclusion: one-line config fix (`withExcludeFromBackup` absent from `app.config.js`); Obj-C module exists and is correct
- Download reconciliation: `isLibraryItemDownloaded` has a `// TODO` for stale-record clearing — implement it; guard with `isDownloadActive` check
- Now playing metadata: `updateNowPlayingMetadata` needed on same-chapter seeks; coordinator bridge is the only correct call site
- Expo Router tab navigation: `router.push` vs `router.navigate` behavior needs hands-on verification before coding (Expo 54 / Router v3)

### Pending Todos

None.

### Blockers/Concerns

- [Phase 8]: Android `updateMetadataForTrack` artwork bug (#2287) needs device test before marking PLR work complete
- [Phase 9]: Expo Router tab navigation API needs hands-on verification on Expo 54 build before writing More screen fix

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed Phase 7 Plan 01 (07-01-PLAN.md: reconciliation scan, partiallyDownloadedItems, removeDownloadedItem)
Resume file: None
