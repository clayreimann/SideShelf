---
phase: 13-rn-downloader-migration
plan: 01
subsystem: infra
tags: [react-native-background-downloader, rnbd, downloads, expo-plugin, mmkv]

# Dependency graph
requires: []
provides:
  - "docs/investigation/rnbd-fork-diff.md — complete API surface diff, call site mapping, smoke test checklist"
  - "DWNLD-01 requirement satisfied — 13-02 executor can proceed without additional research"
affects:
  - "13-02 (package swap) — uses rnbd-fork-diff.md as authoritative migration guide"

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - docs/investigation/rnbd-fork-diff.md
  modified: []

key-decisions:
  - "Investigation document is analysis-only (no proof-of-concept) — diff is fully deterministic from source inspection"
  - "No migration flag needed — existing repair/reconciliation flow handles fork-era in-progress downloads"
  - "void prefix on pause/resume/stop is the correct pattern — fire-and-forget is safe, await not required"

patterns-established: []

requirements-completed: [DWNLD-01]

# Metrics
duration: 10min
completed: 2026-03-05
---

# Phase 13 Plan 01: RN Downloader Fork Diff Summary

**Complete API surface diff between fork 3.2.6 and mainline 4.5.3, mapping 4 DownloadService call sites to their mainline equivalents with before/after snippets**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-05T05:05:03Z
- **Completed:** 2026-03-05T05:15:00Z
- **Tasks:** 2 (Task 1: write document, Task 2: human-verify checkpoint — approved)
- **Files modified:** 1

## Accomplishments

- Wrote permanent investigation document `docs/investigation/rnbd-fork-diff.md` with all 10 required sections
- Documented all 4 breaking API changes with exact before/after code snippets (import, setConfig, checkForExistingDownloads→getExistingDownloadTasks, download→createDownloadTask+start)
- Confirmed iCloud exclusion plugin (`withExcludeFromBackup`) is completely independent of the downloader package — DWNLD-04 safe
- Confirmed no JS-level event queue needed: fork's `pendingEvents` buffer vs mainline's `initWithDisabledObservation` are functionally equivalent
- Included human-executable smoke test checklist for restart recovery verification

## Task Commits

Each task was committed atomically:

1. **Task 1: Write fork diff investigation document** - `e31daa2` (docs)
2. **Task 2: Checkpoint — human approval received** — no code changes, checkpoint satisfied

**Plan metadata:** `fd5bf34` (docs: complete RNBD fork diff spike plan)

## Files Created/Modified

- `/Users/clay/Code/github/abs-react-native/docs/investigation/rnbd-fork-diff.md` — Complete API diff investigation document (10 sections, 415 lines)

## Decisions Made

- **Analysis document only (no proof-of-concept):** The API diff is fully deterministic from direct source inspection of fork node_modules and mainline CDN. No live build test needed for the spike.
- **No migration flag needed:** Existing repair/reconciliation flow handles fork-era in-progress downloads. If `getExistingDownloadTasks()` returns empty on first mainline launch, items simply appear as not-downloading and can be re-queued. Beta app — acceptable.
- **`void` prefix on async methods:** `task.pause()`, `task.resume()`, `task.stop()` become async in mainline. Fire-and-forget is correct behavior; `void` prefix makes the intent explicit.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `docs/investigation/rnbd-fork-diff.md` is committed and ready for 13-02 executor reference
- DWNLD-01 requirement satisfied
- 13-02 can proceed immediately after human verification of the document
- Key risk for 13-02: missing `.start()` call after `createDownloadTask()` is the single most likely failure mode

---

_Phase: 13-rn-downloader-migration_
_Completed: 2026-03-05_
