# Project Retrospective

_A living document updated after each milestone. Lessons feed forward into future planning._

---

## Milestone: v1.2 — Tech Cleanup

**Shipped:** 2026-03-08
**Phases:** 4 | **Plans:** 8 | **Tasks:** 21 | **Commits:** 101

### What Was Built

- WAL journal mode + `synchronous=NORMAL` + 4 FK indexes in SQLite; `DbErrorScreen` blocking error UI with context-aware recovery
- Batch upserts across all DB helpers — eliminated N+1 loops in library sync, genres, narrators, tags
- Zustand state centralization: `viewMode`, `progressMap`, `availableTags`, and `userId` moved from component effects into slices; redundant mount effects removed from 5+ components
- PlayerService decomposed: facade + `TrackLoadingCollaborator`, `PlaybackControlCollaborator`, `ProgressRestoreCollaborator`, `BackgroundReconnectCollaborator` — 92% test coverage
- DownloadService decomposed: facade + `DownloadStatusCollaborator`, `DownloadRepairCollaborator` (stateless) — 91% test coverage
- Custom RNBD `spike-event-queue` fork replaced by mainline 4.5.3; iCloud exclusion decode bug (`%20` paths) fixed during smoke test

### What Worked

- **Spike-first for Phase 13**: The investigation document (13-01) made 13-02 deterministic. API diff from source inspection alone — no proof-of-concept needed — was the right call.
- **Stateless collaborators for DownloadService**: Simpler than the PlayerService pattern (which needs callbacks). No facade reference needed because collaborators query DB/filesystem directly.
- **TDD RED→GREEN discipline**: All plan tasks followed test-first, even when pre-commit hooks blocked the RED commit. Proceeding to GREEN before first commit worked cleanly.
- **forceExit in jest.config**: Fixing the `@react-native-community/netinfo` timer issue at config level rather than mocking it was the right call — no test behavior change.
- **Yolo mode throughout**: 100% approval-gate bypass + parallel agent use kept execution velocity high. 7 days for 4 phases with no rollbacks.

### What Was Inefficient

- **Plan 11-02 was 90 min** — significantly longer than other plans (avg ~20 min). The logout/wipeUserData subtask involved FK ordering analysis and AuthProvider imperative call pattern — complexity not visible at planning time.
- **Missing gsd-tools `one_liner` fields**: SUMMARY files don't have standardized `one_liner` extraction points, so the CLI archived empty accomplishments. Had to fill MILESTONES.md manually.
- **No milestone audit**: Skipped `/gsd:audit-milestone` — audit would have caught the iCloud decode bug earlier (was found during 13-02 smoke test, not audit).

### Patterns Established

- **Facade + stateless collaborators**: For services with no shared mutable state between collaborators, stateless collaborators (no facade reference, query DB directly) are simpler than the PlayerService pattern (which needs callbacks via facade interface).
- **`IFacade` in `types.ts`**: Both the facade and all collaborators import from `types.ts` — prevents any collaborator from importing from the facade directly, breaking circular dep risk at the import graph level.
- **`execSync` for SQLite pragmas**: WAL and `synchronous=NORMAL` must run on the raw SQLite handle before Drizzle wraps it. Set inside the `getSQLiteDb()` `if(!sqliteDb)` guard so they apply to every open.
- **Handlers-before-`.start()` invariant**: RNBD event handlers must be registered before calling `.start()`. Documented with `// CRITICAL:` comment inline.

### Key Lessons

1. **Investigate before planning, always.** Phase 13's spike-first approach eliminated all uncertainty before a single line of production code was written. Cost: 10 min. Saved: potential dead-end implementation.
2. **Monolith complexity is invisible until you try to test it.** PlayerService and DownloadService weren't obviously problematic until coverage analysis revealed how many concerns were entangled. Decomposition revealed the structure that was always there — it just wasn't named.
3. **Batch at the DB layer, not the application layer.** N+1 loops in library sync were a DB helper problem, not a service problem. Moving to `onConflictDoUpdate` batch operations required changing only the helper — no callers changed.
4. **State centralization pays off in test simplicity.** Moving `userId` into `useAuth()` eliminated repeated `getUserByUsername()` calls across 5+ components — each of which had its own async loading state. The Zustand slice version has zero loading state.

### Cost Observations

- Model mix: ~100% sonnet (balanced profile throughout)
- Sessions: ~8 focused execution sessions
- Notable: v1.2 had the highest file-change ratio of any milestone (160 files, 4 phases) — purely internal changes with zero user-facing features. The GSD workflow handled pure refactoring as well as it handles feature work.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases        | Key Change                                                          |
| --------- | -------- | ------------- | ------------------------------------------------------------------- |
| v1.0      | ~20      | 6 (incl 03.1) | Initial coordinator architecture — observer mode validation first   |
| v1.1      | ~6       | 4             | Faster execution; parallel agents introduced                        |
| v1.2      | ~8       | 4             | Spike-first for external dependency; stateless collaborator pattern |

### Cumulative Quality

| Milestone | New Tests          | Coverage (key files)                   | Zero-Dep Additions |
| --------- | ------------------ | -------------------------------------- | ------------------ |
| v1.0      | 122+               | 92.83% coordinator, 91.62% playerSlice | 0                  |
| v1.1      | ~30                | Maintained 90%+                        | 0                  |
| v1.2      | 142 (29+8+67+33+5) | 92% PlayerService, 91% DownloadService | 0                  |

### Top Lessons (Verified Across Milestones)

1. **Verify before you execute.** Observer mode (v1.0), spike investigation (v1.3 Phase 13) — validate assumptions before committing to implementation.
2. **Interfaces at boundaries prevent coupling.** `IPlayerServiceFacade` (v1.2) and the event bus (v1.0) both solved the same problem: collaborators that need to call each other without importing each other.
3. **90%+ coverage is a forcing function for good design.** The coverage requirement has consistently surfaced hidden coupling and untestable patterns before they became production bugs.
