# Roadmap: Audiobookshelf React Native

## Milestones

- ✅ **v1.0 — Player State Machine Migration** — Phases 1–5 (shipped 2026-02-20)
- ✅ **v1.1 — Bug Fixes & Polish** — Phases 6–9 (shipped 2026-02-27)
- ✅ **v1.2 — Tech Cleanup** — Phases 10–13 (shipped 2026-03-08)
- 🚧 **v1.3 — Beta Polish** — Phases 14–22 (in progress)

## Phases

<details>
<summary>✅ v1.0 — Player State Machine Migration (Phases 1–5) — SHIPPED 2026-02-20</summary>

- [x] Phase 1: Observer Mode (shipped — production-validated) — completed 2026-02-16
- [x] Phase 2: Execution Control (2/2 plans) — completed 2026-02-16
- [x] Phase 3: Position Reconciliation (2/2 plans) — completed 2026-02-16
- [x] Phase 03.1: Fix Coordinator Service Bugs (2/2 plans) — completed 2026-02-18
- [x] Phase 4: State Propagation (3/3 plans) — completed 2026-02-19
- [x] Phase 5: Cleanup (6/6 plans) — completed 2026-02-20

See `.planning/milestones/v1.1-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.1 — Bug Fixes & Polish (Phases 6–9) — SHIPPED 2026-02-27</summary>

- [x] Phase 6: iCloud Exclusion (2/2 plans) — completed 2026-02-23
- [x] Phase 7: Download Tracking (3/3 plans) — completed 2026-02-23
- [x] Phase 8: Skip & Player Polish (3/3 plans) — completed 2026-02-27
- [x] Phase 9: Navigation & UI Polish (3/3 plans) — completed 2026-02-27

See `.planning/milestones/v1.1-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.2 — Tech Cleanup (Phases 10–13) — SHIPPED 2026-03-08</summary>

- [x] Phase 10: DB Quick Wins (2/2 plans) — completed 2026-03-04
- [x] Phase 11: useEffect Cleanup + State Centralization (2/2 plans) — completed 2026-03-04
- [x] Phase 12: Service Decomposition (2/2 plans) — completed 2026-03-05
- [x] Phase 13: RN Downloader Migration (2/2 plans) — completed 2026-03-07

See `.planning/milestones/v1.2-ROADMAP.md` for full phase details.

</details>

### 🚧 v1.3 — Beta Polish (In Progress)

**Milestone Goal:** Ship the app to beta — UI polish on the player and library surfaces, performance improvements from the RN audit, bookmark management, sleep timer volume fade, UI testing infrastructure, and remaining tech debt.

- [x] **Phase 14: Progress Display Format** — User-selectable progress format across all three player surfaces (completed 2026-03-09)
- [ ] **Phase 15: Collapsible Section Redesign** — Reanimated probe: peek-and-fade with UI-thread height animation
- [x] **Phase 16: Full Screen Player Redesign + AirPlay** — Nav bar removal, chevron dismiss, settings UIMenu, AirPlay on all surfaces, Reanimated panel animation (completed 2026-03-11)
- [ ] **Phase 17: Bookmarks** — Add/view/rename/delete with server sync and SQLite offline cache
- [ ] **Phase 18: Sleep Timer Fade + Navigation + Path Standardization** — Volume fade, Series/Authors More tab fix, deep linking, path normalization
- [ ] **Phase 19: Performance Quick Wins** — FlashList, expo-image, TTI measurement, memory leak fixes, orphan reassociation UI
- [ ] **Phase 20: Tree Shaking** — Standalone production bundle optimization requiring TestFlight verification
- [ ] **Phase 21: Maestro UI Testing Infrastructure** — Deep link flows, testID coverage, reusable subflows, regression suite
- [ ] **Phase 22: ProgressService Decomposition** — Facade + collaborator refactor maintaining 90%+ coverage

## Phase Details

### Phase 14: Progress Display Format

**Goal**: Users can choose how playback progress is displayed and see it consistently across all player surfaces
**Depends on**: Nothing (extends existing settingsSlice pattern; no Phase 13 dependencies)
**Requirements**: PROGRESS-01, PROGRESS-02, PROGRESS-03, PROGRESS-04
**Success Criteria** (what must be TRUE):

1. User can open Settings and select a progress display format from three options: time remaining, elapsed / total duration, and percent complete
2. The selected format persists across app restarts
3. Full screen player middle area shows progress in the selected format
4. Floating player shows progress in the selected format
5. Item details player controls show progress in the selected format
   **Plans**: 4 plans

Plans:

- [ ] 14-01-PLAN.md — Progress format utility (TDD: formatProgress helper + ProgressFormat type)
- [ ] 14-02-PLAN.md — Settings data layer (progressFormat in appSettings + settingsSlice)
- [ ] 14-03-PLAN.md — Settings UI + player surfaces (sub-screen, FullScreenPlayer, FloatingPlayer, ConsolidatedPlayerControls)
- [ ] 14-04-PLAN.md — Item details cleanup (MetadataSection inline progress + remove ProgressSection)

### Phase 15: Collapsible Section Redesign

**Goal**: Collapsible sections provide a polished peek-and-fade collapsed state with smooth UI-thread height animations, validating the Reanimated + React Compiler stack before applying it to the more complex FullScreenPlayer
**Depends on**: Nothing (self-contained component refactor; React Compiler + Reanimated probe)
**Requirements**: SECTION-01, SECTION-02, SECTION-03
**Success Criteria** (what must be TRUE):

1. Collapsed sections show approximately the first 100px of content with a bottom fade-to-transparent gradient overlay
2. Tapping to expand or collapse animates the height smoothly on the UI thread (no JS-thread jank)
3. Expanded sections show full content with no fade overlay
4. Content is always mounted (no disappearing-children flash on toggle)
   **Plans**: 3 plans

Plans:

- [ ] 15-01-PLAN.md — Test scaffold for CollapsibleSection (Wave 0, RED state)
- [ ] 15-02-PLAN.md — Rewrite CollapsibleSection with Reanimated + expo-linear-gradient
- [ ] 15-03-PLAN.md — Update DescriptionSection call site + simulator visual verification

### Phase 16: Full Screen Player Redesign + AirPlay

**Goal**: The full screen player has a clean, modern header with chevron dismiss, settings UIMenu, AirPlay, and smooth Reanimated panel animations; AirPlay is available on all three player surfaces
**Depends on**: Phase 15 (Reanimated + React Compiler pattern validated in CollapsibleSection before applying to FullScreenPlayer)
**Requirements**: PLAYER-01, PLAYER-02, PLAYER-03, PLAYER-04, PLAYER-05, PLAYER-06, PERF-11
**Success Criteria** (what must be TRUE):

1. Full screen player has no navigation bar chrome — the area is fully owned by the player UI
2. Tapping the chevron-down button in the upper left dismisses the full screen player
3. A settings button in the header opens a UIMenu containing at minimum: add bookmark, sleep timer, and progress format actions
4. AirPlay route picker button is present in the full screen player header, the floating player, and the item details controls
5. Full screen player panel open/close animation runs on the UI thread via Reanimated
   **Plans**: 4 plans

Plans:

- [ ] 16-01-PLAN.md — Settings data layer (TDD: chapterBarShowRemaining + keepScreenAwake in appSettings + settingsSlice)
- [ ] 16-02-PLAN.md — AirPlay integration (AirPlayButton component + FloatingPlayer + ConsolidatedPlayerControls)
- [ ] 16-03-PLAN.md — FullScreenPlayer redesign (nav chrome removal, custom header, UIMenu gear button, ProgressBar rightLabel)
- [ ] 16-04-PLAN.md — Reanimated chapter panel migration + visual verification checkpoint

### Phase 17: Bookmarks

**Goal**: Users can manage bookmarks for any item — adding at current position, viewing, renaming, deleting — with server sync and local SQLite cache for offline viewing
**Depends on**: Phase 16 (bookmark action lives in the UIMenu settings button established in Phase 16)
**Requirements**: BOOKMARK-01, BOOKMARK-02, BOOKMARK-03, BOOKMARK-04, BOOKMARK-05, BOOKMARK-06
**Success Criteria** (what must be TRUE):

1. User can add a bookmark at the current playback position from the player settings UIMenu, with an optional title prompt
2. Item detail screen lists all bookmarks for that item, showing title and timestamp
3. User can rename a bookmark from the item detail screen
4. User can delete a bookmark from the item detail screen
5. Bookmarks created, renamed, or deleted while online are immediately reflected on the ABS server
6. Bookmarks are visible on the item detail screen when the device is offline (loaded from local SQLite cache)
   **Plans**: 5 plans

Plans:

- [ ] 17-01-PLAN.md — DB schema + helpers + migration (bookmarks + pending_bookmark_ops tables, wipeUserData)
- [ ] 17-02-PLAN.md — Settings data layer (bookmarkTitleMode in appSettings + settingsSlice)
- [ ] 17-03-PLAN.md — API fixes + slice extension + offline sync queue (deleteBookmark fix, renameBookmark, offline-aware actions, drain on network restore)
- [ ] 17-04-PLAN.md — UI layer (BookmarkButton long-press, FullScreenPlayer first-tap + modes, BookmarksSection rewrite, Settings row)
- [ ] 17-05-PLAN.md — Visual verification checkpoint (simulator flow verification)

### Phase 18: Sleep Timer Fade + Navigation + Path Standardization

**Goal**: The sleep timer fades volume gracefully before stopping; Series and Authors navigation works from the More tab; the app responds to sideshelf:// deep links; file paths are stored in a consistent normalized format
**Depends on**: Nothing (sleep timer and navigation are independent; path standardization self-contained)
**Requirements**: SLEEP-01, NAVIGATION-01, NAVIGATION-02, NAVIGATION-03, DEBT-01
**Success Criteria** (what must be TRUE):

1. Playback volume fades linearly to silence over the final 30 seconds before the sleep timer stops playback
2. Volume is restored to its pre-fade value when the sleep timer is cancelled or when the user manually stops playback
3. Tapping a series from the More tab opens the series detail screen
4. Tapping an author from the More tab opens the author detail screen
5. Tapping a sideshelf:// deep link from outside the app navigates to the correct screen
6. File paths written to the database and compared in filesystem operations use a consistent normalized format (POSIX, no file:// prefix)
   **Plans**: 4 plans

Plans:

- [ ] 14-01-PLAN.md — Progress format utility (TDD: formatProgress helper + ProgressFormat type)
- [ ] 14-02-PLAN.md — Settings data layer (progressFormat in appSettings + settingsSlice)
- [ ] 14-03-PLAN.md — Settings UI + player surfaces (sub-screen, FullScreenPlayer, FloatingPlayer, ConsolidatedPlayerControls)
- [ ] 14-04-PLAN.md — Item details cleanup (MetadataSection inline progress + remove ProgressSection)

### Phase 19: Performance Quick Wins + Orphan Reassociation

**Goal**: The library list renders faster via FlashList; cover images cache on disk via expo-image; TTI is measurable; known memory leaks and subscriber leaks are patched; users can associate orphaned files with library items
**Depends on**: Nothing (independent optimizations and a UI addition to existing orphan screen)
**Requirements**: PERF-01, PERF-02, PERF-04, PERF-05, PERF-06, PERF-07, PERF-08, PERF-09, PERF-10, DEBT-02
**Success Criteria** (what must be TRUE):

1. Library item list uses FlashList — grid and list layouts render without layout gaps or item remounting on mode switch
2. Chapter list rows render with memoized renderItem and fixed-height getItemLayout
3. Cover images load from disk cache on second view without a network round-trip
4. A TTI baseline mark fires when the home screen becomes interactive, visible in performance tooling
5. Auth startup reads credentials concurrently (no sequential await chaining)
6. From the orphan management screen, user can associate an orphaned file with a known library item (not only delete it)
   **Plans**: 4 plans

Plans:

- [ ] 14-01-PLAN.md — Progress format utility (TDD: formatProgress helper + ProgressFormat type)
- [ ] 14-02-PLAN.md — Settings data layer (progressFormat in appSettings + settingsSlice)
- [ ] 14-03-PLAN.md — Settings UI + player surfaces (sub-screen, FullScreenPlayer, FloatingPlayer, ConsolidatedPlayerControls)
- [ ] 14-04-PLAN.md — Item details cleanup (MetadataSection inline progress + remove ProgressSection)

### Phase 20: Tree Shaking

**Goal**: Production bundle size is reduced via Expo SDK 54 tree shaking and metro inlineRequires, with all existing Reanimated animations verified working in the production binary
**Depends on**: Phase 15 and Phase 16 (all Reanimated usage must be stable before enabling tree shaking that may strip worklet initialization)
**Requirements**: PERF-03
**Success Criteria** (what must be TRUE):

1. Tree shaking is enabled in the metro config and a production build is submitted to TestFlight
2. All Reanimated animations (CollapsibleSection, FullScreenPlayer panels) work correctly in the TestFlight build
3. The app launches and plays audio without crashes in the TestFlight build
   **Plans**: 4 plans

Plans:

- [ ] 14-01-PLAN.md — Progress format utility (TDD: formatProgress helper + ProgressFormat type)
- [ ] 14-02-PLAN.md — Settings data layer (progressFormat in appSettings + settingsSlice)
- [ ] 14-03-PLAN.md — Settings UI + player surfaces (sub-screen, FullScreenPlayer, FloatingPlayer, ConsolidatedPlayerControls)
- [ ] 14-04-PLAN.md — Item details cleanup (MetadataSection inline progress + remove ProgressSection)

### Phase 21: Maestro UI Testing Infrastructure

**Goal**: Automated UI tests can authenticate, navigate, and test playback flows via Maestro; key interactive elements have testID attributes; flows are decomposed into reusable subflows and a standalone regression suite
**Depends on**: Phase 18 (deep link scheme must be confirmed correct before writing Maestro flows that use openLink)
**Requirements**: TESTING-01, TESTING-02, TESTING-03, TESTING-04, TESTING-05
**Success Criteria** (what must be TRUE):

1. Login screen inputs have testID attributes; a Maestro subflow can authenticate from environment variable credentials without manual intervention
2. The login subflow is idempotent — calling it when already logged in does not fail or log out
3. Key player and library elements have testID attributes enabling Maestro element targeting: play-resume-button, player-done-button, seek-slider, speed-control, download-button, library-search-input
4. Maestro flows are split into reusable subflows (\_login, \_start-playback) and standalone screen flows that can run independently
5. A regression suite of independently executable test files covers library navigation, playback, and download flows
   **Plans**: 4 plans

Plans:

- [ ] 14-01-PLAN.md — Progress format utility (TDD: formatProgress helper + ProgressFormat type)
- [ ] 14-02-PLAN.md — Settings data layer (progressFormat in appSettings + settingsSlice)
- [ ] 14-03-PLAN.md — Settings UI + player surfaces (sub-screen, FullScreenPlayer, FloatingPlayer, ConsolidatedPlayerControls)
- [ ] 14-04-PLAN.md — Item details cleanup (MetadataSection inline progress + remove ProgressSection)

### Phase 22: ProgressService Decomposition

**Goal**: ProgressService is decomposed into a facade and collaborators matching the PlayerService v1.2 pattern, with all background sync timer paths preserved and 90%+ coverage maintained
**Depends on**: Nothing (pure internal refactor; no user-facing changes; can run last without blocking anything)
**Requirements**: DEBT-03
**Success Criteria** (what must be TRUE):

1. ProgressService exists as a facade delegating to SessionTrackingCollaborator and SessionSyncCollaborator
2. Test coverage for all ProgressService files is 90% or above
3. Progress is saved correctly after 5+ minutes of uninterrupted playback (background sync timer path intact)
   **Plans**: 4 plans

Plans:

- [ ] 14-01-PLAN.md — Progress format utility (TDD: formatProgress helper + ProgressFormat type)
- [ ] 14-02-PLAN.md — Settings data layer (progressFormat in appSettings + settingsSlice)
- [ ] 14-03-PLAN.md — Settings UI + player surfaces (sub-screen, FullScreenPlayer, FloatingPlayer, ConsolidatedPlayerControls)
- [ ] 14-04-PLAN.md — Item details cleanup (MetadataSection inline progress + remove ProgressSection)

## Progress

| Phase                                             | Milestone | Plans Complete | Status      | Completed  |
| ------------------------------------------------- | --------- | -------------- | ----------- | ---------- |
| 1. Observer Mode                                  | v1.0      | -              | Complete    | 2026-02-16 |
| 2. Execution Control                              | v1.0      | 2/2            | Complete    | 2026-02-16 |
| 3. Position Reconciliation                        | v1.0      | 2/2            | Complete    | 2026-02-16 |
| 03.1. Bug Fixes                                   | v1.0      | 2/2            | Complete    | 2026-02-18 |
| 4. State Propagation                              | v1.0      | 3/3            | Complete    | 2026-02-19 |
| 5. Cleanup                                        | v1.0      | 6/6            | Complete    | 2026-02-20 |
| 6. iCloud Exclusion                               | v1.1      | 2/2            | Complete    | 2026-02-23 |
| 7. Download Tracking                              | v1.1      | 3/3            | Complete    | 2026-02-23 |
| 8. Skip & Player Polish                           | v1.1      | 3/3            | Complete    | 2026-02-27 |
| 9. Navigation & UI Polish                         | v1.1      | 3/3            | Complete    | 2026-02-27 |
| 10. DB Quick Wins                                 | v1.2      | 2/2            | Complete    | 2026-03-04 |
| 11. useEffect Cleanup + State Centralization      | v1.2      | 2/2            | Complete    | 2026-03-04 |
| 12. Service Decomposition                         | v1.2      | 2/2            | Complete    | 2026-03-05 |
| 13. RN Downloader Migration                       | v1.2      | 2/2            | Complete    | 2026-03-07 |
| 14. Progress Display Format                       | 4/4       | Complete       | 2026-03-09  | -          |
| 15. Collapsible Section Redesign                  | 2/3       | In Progress    |             | -          |
| 16. Full Screen Player Redesign + AirPlay         | 4/4       | Complete       | 2026-03-11  | -          |
| 17. Bookmarks                                     | v1.3      | 0/5            | Not started | -          |
| 18. Sleep Timer Fade + Navigation + Path Std      | v1.3      | 0/TBD          | Not started | -          |
| 19. Performance Quick Wins + Orphan Reassociation | v1.3      | 0/TBD          | Not started | -          |
| 20. Tree Shaking                                  | v1.3      | 0/TBD          | Not started | -          |
| 21. Maestro UI Testing Infrastructure             | v1.3      | 0/TBD          | Not started | -          |
| 22. ProgressService Decomposition                 | v1.3      | 0/TBD          | Not started | -          |
