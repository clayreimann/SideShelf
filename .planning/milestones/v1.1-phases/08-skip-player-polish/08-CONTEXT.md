# Phase 8: Skip & Player Polish - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix skip button short-tap interaction (SKIP-01, SKIP-02), persist skip intervals across app restarts (PLR-01, PLR-02), and fix popover player display bugs (cover art missing + stale chapter progress after app update). The "Player Polish" portion covers these two display regressions. Adding new player features or UI surfaces is out of scope.

</domain>

<decisions>
## Implementation Decisions

### Lock Screen / Now Playing Sync

- Call `updateNowPlayingMetadata` after every SEEK_COMPLETE event — no "only if changed" optimization; correctness over micro-efficiency
- Single call with all current fields together (position + chapter title + artwork) — no partial updates that could leave an inconsistent lock screen state
- No debounce on skip-triggered metadata updates — every skip produces exactly one lock screen refresh; rapid taps each update the display
- Android `updateMetadataForTrack` artwork bug (#2287): include a device-test task in the plan; if the bug reproduces on device, document as a known upstream issue but do not block the phase on a fix we can't make in TS

### Popover Player Display Bugs

- Both bugs (cover art missing, chapter progress stale until play) are treated as a single investigation — likely share a root cause in the initialization path after an iOS app update (path migration or coordinator state not yet propagated when the popover mounts)
- Expected behavior: correct chapter and cover art show **immediately** when the popover opens, before any user interaction — coordinator state must be read synchronously on mount
- Claude should investigate whether full-screen player is also affected (user was unsure) — fix should cover both surfaces if they share the same source

### Claude's Discretion

- Which coordinator event or state subscription the popover should read from on mount
- Whether cover art URL staleness is a coordinator bridge gap or a React component binding issue
- Exact call site for `updateNowPlayingMetadata` within the coordinator event handler (after state update vs after TrackPlayer seek resolves)

</decisions>

<specifics>
## Specific Ideas

- The chapter progress stale-until-play behavior suggests the popover is not subscribed to coordinator state on mount — it only gets fresh data when a PLAY event fires and the coordinator bridge runs `syncToStore()`
- Cover art likely uses a URL derived from the library item — if the item path changed during app update and the URL wasn't refreshed, the image would 404 silently

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 08-skip-player-polish_
_Context gathered: 2026-02-27_
