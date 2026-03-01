# Phase 7: Download Tracking - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Keep the app's download records in sync with what is actually on disk: clear stale DB records at startup (and on foreground resume), surface orphan files in the Storage tab, and guard active/paused downloads from being incorrectly cleared. This phase does not add new download capabilities or modify how downloads are initiated.

</domain>

<decisions>
## Implementation Decisions

### Startup scan behavior

- Run on every foreground resume (not just cold start) — catches files deleted while app was backgrounded
- Non-blocking background — app loads normally while scan runs asynchronously
- No user-visible indicator; log to console/crash reporter only
- No chunking or throttling — run as a single async operation

### Stale record disposition

- When a downloaded file is missing from disk: mark the item as **not downloaded** (reset status), do NOT delete the DB record
- Preserve listen/play progress — only the download status is cleared, not the user's position
- Handle multi-file items at per-file granularity: clear only the missing files' download status, not the whole item
- Items with some files missing → surface as "partially downloaded" state in the UI, with actions to either re-download the missing pieces or clear the still-present downloaded files

### Active download safety boundary

- **Active transfers** (currently receiving bytes): skip entirely — never scanned
- **Paused downloads**: skip — user intentionally paused, partial files and records stay intact
- **Zombie downloads** (state = in-progress, not paused, not receiving data): clear and log
  - Delete the zombie's partial files from disk
  - Reset the DB record to not-downloaded
  - Do NOT attempt to auto-restart — let the user manually re-download

### Storage tab refresh

- Storage tab is **reactive** — auto-updates when DB state changes, no navigation required
- **Orphan files** (files on disk with no DB record, e.g. item removed from remote library):
  - Show in a separate **"Unknown files"** section at the bottom of the Storage tab
  - Display: filename + file size
  - User can delete orphan files from this section

### Claude's Discretion

- Exact timing of when the foreground resume scan fires (AppState change event vs app lifecycle hook)
- Internal data structures for tracking per-file download status
- Log verbosity / format for cleared stale/zombie records
- Visual design of the "partially downloaded" badge and its action sheet

</decisions>

<specifics>
## Specific Ideas

- "Partially downloaded" state needs both a UI indicator AND user-facing actions: re-download missing pieces, or clear remaining downloaded files
- Orphan files exist when an item was downloaded then removed from the remote library — user should be able to clean these up
- Zombie download detection: in-progress + not paused + not receiving data = zombie → clear + delete partials + log

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

_Phase: 07-download-tracking_
_Context gathered: 2026-02-22_
