# Milestones

## v1.2 — Tech Cleanup

**Completed:** 2026-03-08
**Phases:** 10–13 (4 phases, 8 plans, 21 tasks)

**Goal:** Reduce technical debt through targeted codebase cleanup — SQLite performance, redundant component state fetches, service file decomposition, and dependency modernization. No user-facing features.

**What shipped:**

- Phase 10: WAL journal mode + 4 FK indexes + DbErrorScreen; batch upserts eliminated N+1 query loops in all DB helpers
- Phase 11: viewMode, progressMap, availableTags, and userId centralized into Zustand slices; redundant mount-time DB fetches removed from 5+ components
- Phase 12: PlayerService decomposed into facade + 4 collaborators (92% coverage); DownloadService decomposed into facade + 2 stateless collaborators (91% coverage)
- Phase 13: Custom RNBD `spike-event-queue` fork replaced by mainline 4.5.3; iCloud exclusion decode bug fixed during migration smoke test

**Key outcomes:**

- 22/22 v1.2 requirements delivered
- 160 files changed, 20,897 insertions, 4,460 deletions
- 7 days execution (Feb 28 → Mar 7); 101 commits
- ~55,702 lines TypeScript/TSX at completion
- No private fork dependencies remaining
- Services properly decomposed with 90%+ coverage maintained

---

## v1.0 — Player State Machine Migration

**Completed:** 2026-02-20
**Phases:** 1–5 (plus 3.1 bug fix insertion)
**Last phase number used:** 5

**Goal:** Migrate the player system from implicit state flags to a fully event-driven coordinator architecture where the coordinator is the single source of truth for all playback state.

**What shipped:**

- Phase 1: Coordinator in observer mode, production-validated (122+ tests, 90%+ coverage, <10ms event processing)
- Phase 2: Coordinator took execution control — services no longer execute playback commands independently
- Phase 3: Canonical position reconciliation — single deterministic algorithm replaces three scattered ones
- Phase 3.1: Runtime bug fixes — seek state recovery, finished-item resume guard, mark-as-unfinished reset, skip button UX
- Phase 4: playerSlice became read-only proxy driven by coordinator bridge (two-tier sync)
- Phase 5: Legacy flags removed (isRestoringState, sessionCreationInProgress, etc.), services simplified to thin execution layers, full lifecycle integration test passing

**Key outcomes:**

- PlayerService reduced from ~1,640 → 1,097 lines
- ProgressService mutex removed (37 lines); serial queue provides equivalent protection
- Coordinator coverage: 92.83%, playerSlice: 91.62%
- observerMode flag preserved for instant rollback

## v1.1 — Bug Fixes & Polish

**Completed:** 2026-02-27
**Phases:** 6–9 (4 phases, 11 plans, ~23 tasks)

**Goal:** Fix six runtime bugs exposed after the coordinator migration and apply five focused polish improvements to downloads, navigation, and the home screen.

**What shipped:**

- Phase 6: iCloud exclusion plugin compiled into Xcode build; file:// URL encoding bug fixed; exclusion applied at download completion and during path repair
- Phase 7: Download reconciliation scan clears stale DB records on startup with active-download guard; partial download badge and action sheet; orphan scanner walks disk for unknown files
- Phase 8: SkipButton refactored to Pressable-outside-MenuView (iOS 18 UIContextMenuInteraction fix); short-tap skip works; lock screen updates after skip via unconditional SEEK_COMPLETE; interval selections persist via Zustand settingsSlice
- Phase 9: More screen Series/Authors navigation fixed via re-export screen pattern; 12 items assigned SF Symbol + Ionicons icons with chevron affordance; home screen cold-start spinner replaced with pulsing skeleton shelves (140×140, 300ms cross-fade); cover art startup repair scan; drag handle on tab reorder rows

**Key outcomes:**

- All 16 v1.1 requirements delivered
- 58 files changed, 6,978+ insertions
- 6 days execution (Feb 22 → Feb 27)

---
