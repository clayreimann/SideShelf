# Phase 11: useEffect Cleanup + State Centralization - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate redundant mount-time DB fetches and AsyncStorage reads by moving shared state into Zustand slices. Slices must handle persistence, reset boundaries, and data freshness correctly. No new user-facing features — behavior should be equivalent or better. Requirements: STATE-01–03, EFFECT-01–06.

</domain>

<decisions>
## Implementation Decisions

### viewMode persistence

- Persists across app restarts — backed by AsyncStorage via Zustand persist middleware
- Global preference — one viewMode setting for all library screens (not per-library)
- Default value for new installs: list view
- Migration from existing AsyncStorage: start fresh — do NOT read the old value; existing users reset to list view on first upgrade

### State reset boundaries

- **Explicit logout**: clear all user-specific Zustand slice data (userId, library items, progress entries, series/author data) AND wipe the backing SQLite tables (media items, progress, etc.) — keep preferences (viewMode)
- **Server switch**: same reset behavior as explicit logout
- **Token expiry / forced re-login**: do NOT clear slice data — preserve existing state so the user is back in their session after re-authenticating
- DB wipe on logout happens **asynchronously** — navigate to login screen first, then clean up in the background
- There is an existing logout flow in the app; hook the new slice resets and DB wipe into it

### Cached data freshness (stale-while-revalidate pattern)

- Series progress data, tags data, and other slice-backed queries all follow the same pattern: show cached data immediately, fire a background re-fetch on every navigation to the relevant screen
- No time-based staleness threshold — refresh on every navigation
- Author/series navigation IDs: Claude decides the error handling (data is expected to be present locally from library sync)
- Background fetch triggers on every screen navigation — no time-gating

### Hydration failure handling

- viewMode AsyncStorage failure: silently fall back to list view default — log the error, do not surface to user
- userId unavailable at startup: redirect to login (follow existing auth guard pattern)
- DB-backed slice data (library items, progress, series): show a loading/skeleton state until the initial DB query completes — treat unknown as loading, not empty
- Whether slice data is guaranteed available before component render: Claude decides based on root layout and store initialization structure

### Cold-start / navigation rehydration

- Goal: screens that used to re-fetch on every mount should instead read from their slice (showing cached DB data) and fire a background stale-while-revalidate network fetch if needed
- Screens manage their own loading state — no pre-population of slices before routing begins
- Pattern to establish across all affected screens: load cached DB data → show immediately → background refresh if network fetch exists
- True deep-link support (URL → specific screen) is a **deferred goal**, not a requirement for this phase

</decisions>

<specifics>
## Specific Ideas

- The stale-while-revalidate pattern should be established consistently across all affected screens — series detail, logs, logger settings — so future screens have a clear template to follow
- The token-expiry vs. explicit-logout distinction is important: users who are force-reauthenticated (expired tokens) should not lose their cached library data

</specifics>

<deferred>
## Deferred Ideas

- True deep-link support (open app from URL to specific book/series) — future phase; this phase focuses on cold-start rehydration only

</deferred>

---

_Phase: 11-useeffect-cleanup-state-centralization_
_Context gathered: 2026-03-03_
