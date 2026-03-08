# Phase 10: DB Quick Wins - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Internal database optimization only: WAL mode + synchronous=NORMAL pragma on every DB open, missing indexes on four foreign-key query paths, and N+1 upsert loop elimination across all db/helpers/. No user-facing features. No coordinator or UI changes.

</domain>

<decisions>
## Implementation Decisions

### Migration failure behavior

- Any failed migration OR any unrecoverable DB error (at any point in the app lifecycle, not just startup) must surface a blocking error screen — not silent continue
- Error screen shows a generic message ("Something went wrong with the database") plus a way to copy/save the full technical error details for debugging
- Full error is persisted to logs using the existing logger's bootstrap code path that does NOT write to SQLite (the logger has a pre-DB initialization path; use that to avoid a circular dependency)
- Recovery action is context-aware: offer a "Reset database" button only when a DB reset would plausibly fix the issue — for errors like disk full, explain the actual cause and omit the reset option

### N+1 upsert audit scope

- Audit ALL files in `src/db/helpers/` for N+1 patterns (not limited to libraryItems.ts and fullLibraryItems.ts from DB-06/07)
- Fix all N+1 patterns found, regardless of whether they were in the original requirements — they're in scope for this phase
- Single transaction for batch upserts — no chunking needed; all-at-once is the target

### Claude's Discretion

- Error handling strategy for partial metadata failures in fullLibraryItems.ts (genre/narrator/tag insert failures within an otherwise-successful item upsert)
- Whether to write new tests for batch helpers and WAL setup (use judgment on where tests add meaningful coverage vs. over-testing infrastructure)
- Exact error screen component design and message wording

</decisions>

<specifics>
## Specific Ideas

- The existing logger has a code path around initialization that skips DB writes — use that path for persisting DB error details to avoid a circular dependency on the erroring DB
- Error screen: copy/share button for the full stack trace so users can submit it as a bug report

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

_Phase: 10-db-quick-wins_
_Context gathered: 2026-03-01_
