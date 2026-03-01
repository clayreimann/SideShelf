# Phase 6: iCloud Exclusion - Context

**Gathered:** 2026-02-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Ensure all downloaded audio files on iOS are excluded from iCloud backup. Three surfaces:

1. The native `ICloudBackupExclusion` module is compiled into the build via plugin registration in `app.config.js`
2. Exclusion is applied when a download completes (`DownloadService`)
3. Exclusion is re-applied during `repairDownloadStatus` — the iOS container path migration path — after iOS app updates

Logging improvements, new download UI, or changes to the download manager are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Retroactive exclusion

- Apply the exclusion attribute to ALL existing downloaded files — not just new downloads going forward
- Run on every app startup (not a one-time migration flag); the native call is idempotent so repetition is harmless
- Run async in the background after launch — non-blocking, app starts immediately
- Apply unconditionally — no pre-check of whether exclusion is already set; idempotent native API

### Failure handling

- If `excludeFromBackup()` fails for a specific file (during download completion, startup scan, or repair): **log warning and continue** — exclusion failure is non-fatal
- During the retroactive startup scan: **best-effort** — continue past individual file failures, log each one, don't abort the scan
- If the native module is null at runtime (module not compiled, simulator): **guard + log once** — emit a single warning at the startup check point, then skip silently at all other call sites
- Repair path failures use the same policy as download completion: log warning and continue

### Repair path scope

- Only `repairDownloadStatus` is in scope — no other repair paths need to be covered
- Apply exclusion **inline with the repair loop**, immediately after each file's path is updated — not batched at the end
- Apply exclusion to the **new path only** — the old container path is inaccessible after iOS migration
- No explicit build-time assertion needed for module presence; the guard+log pattern from failure handling serves as runtime verification

### Claude's Discretion

- Where exactly in the startup sequence the background scan is triggered (e.g., after DB is ready, in DownloadService init)
- Exact logger tag / log message format
- Whether to consolidate the module-null guard into a shared utility or inline at each call site

</decisions>

<specifics>
## Specific Ideas

- The "log once if module missing" guard should fire at the startup scan entry point — that's the first place the module is invoked, so any misconfigured build will be caught immediately
- The retroactive scan reads all download records from the DB and calls `excludeFromBackup(filePath)` for each — no new tracking state required

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 06-icloud-exclusion_
_Context gathered: 2026-02-20_
