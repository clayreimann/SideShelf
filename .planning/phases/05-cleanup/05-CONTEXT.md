# Phase 5: Cleanup - Context

**Gathered:** 2026-02-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Delete legacy guard flags, redundant reconciliation scaffolding, and coordinator migration artifacts from PlayerService, PlayerBackgroundService, ProgressService, the coordinator, and playerSlice. Move any logic that the coordinator should own (but currently lives in services) into the coordinator. The migration is structurally complete when services are thin execution layers and the coordinator is the single source of state and native sync truth.

</domain>

<decisions>
## Implementation Decisions

### Deletion scope

- Full coordinator migration cleanup — not just the three named flags but everything made redundant: flags (isLoading, isPreparing, sessionCreationInProgress, observerMode, isRestoringState), their guard blocks, helpers that only exist to support them, and any remaining pre-coordinator patterns
- `observerMode` flag is deleted — migration is proven; no production kill-switch needed
- `isRestoringState` is removed in Phase 5 without requiring BGS chapter dispatch to route through coordinator first — coordinator already handles chapter state correctly; the dispatch dependency in the roadmap success criterion is superseded by the coordinator owning all native sync
- Logic deduplication principle: any logic that the coordinator should own should have exactly one copy. If a pattern exists in both coordinator and service, keep only the coordinator version — unless moving it would compromise code clarity or maintainability
- No pre-specified target methods beyond the named flags — researcher audits PlayerService and flags what belongs in coordinator based on responsibilities

### File scope

- Services: PlayerService, PlayerBackgroundService, ProgressService
- Coordinator: PlayerStateCoordinator and related coordinator files
- playerSlice: clean up now that it is a read-only proxy (Phase 4 complete)
- Follow dead code wherever it leads within these five files; do not touch components, hooks, or routes

### Line count target

- PlayerService target: under 1,100 lines (from ~1,640)
- Method: delete dead code + extract to coordinator — any logic the coordinator should own moves there; pure TrackPlayer execution calls stay in PlayerService

### Session mutex (sessionCreationInProgress)

- Verify-first approach: researcher audits what the coordinator's transition guard actually blocks before committing to removal. Do not remove until the integration test proves no duplicate sessions occur.

### Native metadata sync

- All `updateNowPlayingMetadata` calls move to the coordinator — BGS has zero native metadata writes after Phase 5
- Coordinator owns all native sync: TrackPlayer metadata (artwork, title, artist) AND NowPlaying API updates
- Coordinator detects chapter changes internally via position updates; uses existing `lastSyncedChapterId` debounce pattern (from Phase 4) — calls `updateNowPlayingMetadata` only when `chapter.id` actually changes. No CHAPTER_CHANGED event dispatch; coordinator derives chapter state from position internally.

### Claude's Discretion

- Whether the coordinator detects chapters by boundary-crossing or per-tick with debounce — use whichever is cleaner given the existing code
- Exact restructuring of any helpers that need to move vs. be inlined
- Test structure for chapter detection coverage (whether it lives in the integration test or a dedicated unit test)

</decisions>

<specifics>
## Specific Ideas

- "Except for places where it would compromise code clarity or maintainability there should only be 1 copy of any piece of logic" — deduplication is the primary driver of the line reduction, not just deletion
- "The coordinator should own logic for syncing with native interfaces like the track player and now playing API" — this is the architectural north star for where disputed logic belongs
- Coverage is a signal not a gate: "90% of functionality rather than contorting to engineer funky failure modes" — test what matters, don't manufacture edge cases

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 05-cleanup_
_Context gathered: 2026-02-19_
