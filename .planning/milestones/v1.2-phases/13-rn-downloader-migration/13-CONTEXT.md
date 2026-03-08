# Phase 13: RN Downloader Migration - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the custom `spike-event-queue` fork of `@kesha-antonov/react-native-background-downloader` with mainline 4.5.3. Downloads must continue working correctly: restart recovery, iCloud exclusion, and progress tracking. No new download features — this is a library swap only.

**Hard constraint:** Plan 13-01 (spike) must fully complete and produce documentation before Plan 13-02 (package swap) begins.

</domain>

<decisions>
## Implementation Decisions

### Spike output (Plan 13-01)

- Spike form: Claude decides (analysis doc and/or proof-of-concept — whatever produces most confidence)
- Output document lives in `docs/investigation/` in the repo — permanent record
- If the spike reveals a blocker (API incompatibility, behavioral regression), the spike document must describe the required changes and workaround before 13-02 starts. **Not a hard halt** — beta status means aggressive changes (e.g., wiping in-progress downloads) are acceptable

**Required questions the spike must answer:**

1. Full API surface diff — every method DownloadService calls, mapped from fork API to mainline API
2. iCloud exclusion compatibility — confirm `withExcludeFromBackup` Expo plugin works with the mainline package reference
3. Event queue behavior difference — confirm whether mainline event delivery differs from the fork's spike-event-queue behavior (ordering, batching)

- `task.metadata` persistence is NOT a spike gate — it will be validated during 13-02 integration

### In-flight download migration

- Completed downloads (files on disk) are **untouched** — migration only affects in-progress/queued state
- If there's a DB/downloader state mismatch on first launch with mainline (DB says downloading, mainline has no task), **route through the existing repair/reconciliation flow** — no special case needed
- Whether a one-time migration flag (AsyncStorage key) is needed: **Claude's Discretion** — Claude determines if the existing repair flow is sufficient or if an explicit "post-migration cleanup" pass is warranted
- App is in beta — cancelling and wiping any fork-era in-progress downloads is acceptable if needed

### API adapter

- **No adapter layer** — DownloadService is updated to call mainline API directly
- Event queuing: **add only if needed** — if integration tests reveal ordering/race issues from mainline event delivery, add a simple queue then. Don't add preemptively.
- Fork package reference: **completely removed** from package.json and lockfile — no comment traces
- **Researcher must audit all imports** of the fork package across the codebase — DownloadService is the likely only consumer, but confirm all files, including Expo plugin config

### Regression verification

- Automated test coverage: **maintain pre-migration level** — whatever coverage % existed before, match or exceed it. No fixed % target.
- Unit tests should cover **DownloadService startup reconciliation logic** — verify that on init, `getExistingDownloadTasks()` is called and in-progress tasks are re-attached correctly (this is the restart recovery critical path)
- iCloud exclusion: **code review only** — confirm plugin config references correct mainline package name. Native behavior is not automatable.
- Smoke test checklist: **include in the investigation doc or plan** — a simple human-executable checklist: start download → kill app → relaunch → confirm resume

### Claude's Discretion

- Spike output form (doc only, or doc + proof-of-concept)
- Whether a one-time migration flag is needed for the fork → mainline transition
- Exact structure of the `docs/investigation/` spike document
- How to handle `task.metadata` format differences if discovered during 13-02

</decisions>

<specifics>
## Specific Ideas

- "This app is still in beta so there are no users in the wild to be detrimentally affected by needing to, say, kill any in progress downloads during a version update" — aggressive cleanup is acceptable
- The fork is named `spike-event-queue` suggesting it added event buffering defensively — mainline may not need it; validate before adding any queue logic

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 13-rn-downloader-migration_
_Context gathered: 2026-03-03_
