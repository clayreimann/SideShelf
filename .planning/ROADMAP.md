# Roadmap: Audiobookshelf React Native

## Milestones

- ✅ **v1.0 — Player State Machine Migration** — Phases 1–5 (shipped 2026-02-20)
- ✅ **v1.1 — Bug Fixes & Polish** — Phases 6–9 (shipped 2026-02-27)
- 🚧 **v1.2 — Tech Cleanup** — Phases 10–13 (in progress)

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

### 🚧 v1.2 — Tech Cleanup (In Progress)

**Milestone Goal:** Reduce technical debt through a codebase-wide audit of component state patterns, SQL/DB safety, and dependency upgrades (RN Downloader mainline). All work is internal; no user-facing features.

- [x] **Phase 10: DB Quick Wins** - WAL mode, missing indexes, and N+1 upsert fixes in schema and helpers (completed 2026-03-04)
- [x] **Phase 11: useEffect Cleanup + State Centralization** - Eliminate redundant effect-driven fetches and move shared state into Zustand slices (completed 2026-03-04)
- [x] **Phase 12: Service Decomposition** - Split PlayerService and DownloadService into facade + focused collaborators (completed 2026-03-05)
- [ ] **Phase 13: RN Downloader Migration** - Exit the custom fork, adopt mainline 4.5.3 with API adapter

## Phase Details

### Phase 10: DB Quick Wins

**Goal**: Database performance is measurably improved through WAL mode, complete index coverage on all foreign-key query paths, and elimination of N+1 upsert loops
**Depends on**: Nothing (first v1.2 phase; no coordinator or UI changes)
**Requirements**: DB-01, DB-02, DB-03, DB-04, DB-05, DB-06, DB-07
**Success Criteria** (what must be TRUE):

1. WAL pragma and `synchronous=NORMAL` are set on every DB open — confirmed via DB client initialization code
2. Indexes exist on `library_items.library_id`, `media_metadata.library_item_id`, `audio_files.media_id`, and `media_progress(user_id, library_item_id)` — visible in generated migration files
3. `upsertLibraryItems()` executes a single batch `onConflictDoUpdate` call for a 500-item sync (not 1,000 sequential queries)
4. `fullLibraryItems.ts` genre/narrator/tag inserts are batched — no per-item insert loops remain
5. All existing tests pass with no regressions after schema and helper changes

**Plans**: 2 plans

Plans:

- [ ] 10-01-PLAN.md — WAL pragma, blocking DbErrorScreen, and 4 missing indexes via schema + migration (DB-01–05)
- [ ] 10-02-PLAN.md — N+1 batch upsert conversion across all db/helpers/ files + test assertions (DB-06–07)

### Phase 11: useEffect Cleanup + State Centralization

**Goal**: Redundant mount-time DB fetches and AsyncStorage reads are eliminated; shared preference and entity data lives in Zustand slices and survives navigation
**Depends on**: Phase 10
**Requirements**: EFFECT-01, EFFECT-02, EFFECT-03, EFFECT-04, EFFECT-05, EFFECT-06, STATE-01, STATE-02, STATE-03
**Success Criteria** (what must be TRUE):

1. `viewMode` preference persists across library navigations without re-fetching from component state
2. SeriesDetailScreen loads progress for all books in a single query — no per-book DB fetch on mount
3. `userId` is available from `useAuth()` in all consumers — no scattered `getUserByUsername()` DB calls in components
4. Author and series navigation IDs are resolved inside `fetchItemDetails` — no separate component-level useEffect for each item open
5. `MoreScreen` app version is read from a module-scope constant — no `useState` or `useEffect` involved
6. `getAllTags()` is called once via `loggerSlice` — `LogsScreen` and `LoggerSettingsScreen` share the same cached result

**Plans**: 2 plans

Plans:

- [ ] 11-01-PLAN.md — Slice extensions: viewMode in settingsSlice, progressMap in seriesSlice, getOrFetchAuthorById in authorsSlice, availableTags in loggerSlice (STATE-01–03, EFFECT-06)
- [ ] 11-02-PLAN.md — Consumer wiring: userId in useAuth, authorId/seriesId in CachedItemDetails, remove redundant useEffects, logout DB wipe (EFFECT-01–05)

### Phase 12: Service Decomposition

**Goal**: PlayerService and DownloadService are split into a public facade plus focused private collaborators — the coordinator dispatch contract, singleton interface, and all existing tests remain intact
**Depends on**: Phase 11
**Requirements**: DECOMP-01, DECOMP-02
**Success Criteria** (what must be TRUE):

1. PlayerService public interface (`getInstance()`, `dispatchPlayerEvent`, all playback methods) is unchanged — no call sites need updating
2. PlayerService internal concern groups (track loading, playback control, progress restore, path repair, background reconnect) live in separate collaborator files with no import cycles — verified by `dpdm --circular`
3. DownloadService public interface is unchanged — all callers of status queries, lifecycle methods, and repair entry points work without modification
4. DownloadService Status Queries and Repair/Reconciliation groups are extracted to collaborators; Lifecycle + Progress Tracking remain together (share `activeDownloads` Map)
5. Test coverage stays at or above 90% across all modified files

**Plans**: 2 plans

Plans:

- [x] 12-01-PLAN.md — PlayerService facade + 4 collaborators (TrackLoading, PlaybackControl, ProgressRestore, BackgroundReconnect) + 92% coverage (DECOMP-01) — completed 2026-03-04
- [ ] 12-02-PLAN.md — DownloadService facade + 2 collaborators (DownloadStatus, DownloadRepair) + 90% coverage (DECOMP-02)

### Phase 13: RN Downloader Migration

**Goal**: The custom `spike-event-queue` fork is replaced by mainline `@kesha-antonov/react-native-background-downloader@4.5.3`; downloads continue to work correctly including restart recovery and iCloud exclusion
**Depends on**: Phase 12
**Requirements**: DWNLD-01, DWNLD-02, DWNLD-03, DWNLD-04
**Success Criteria** (what must be TRUE):

1. Fork diff spike is documented — API surface changes between fork and mainline 4.5.3 are listed, and `task.metadata` persistence across app restart is verified
2. `package.json` references mainline `@kesha-antonov/react-native-background-downloader@4.5.3` — custom fork removed
3. `DownloadService.ts` uses the mainline API (`getExistingDownloadTasks` and any other renamed methods) — no fork-only API calls remain
4. A download started, then app killed and relaunched, resumes correctly — restart recovery works with mainline task IDs and metadata format
5. iCloud exclusion (`withExcludeFromBackup` plugin) applies correctly post-migration — v1.1 behavior is not regressed

**Plans**: 2 plans

Plans:

- [ ] 13-01-PLAN.md — Fork diff investigation document: API surface diff, call site mapping, event queue analysis, iCloud exclusion independence, smoke test checklist (DWNLD-01)
- [ ] 13-02-PLAN.md — Package swap + DownloadService API migration + startup reconciliation unit tests (DWNLD-02–04)

## Progress

| Phase                                        | Milestone | Plans Complete | Status     | Completed  |
| -------------------------------------------- | --------- | -------------- | ---------- | ---------- |
| 1. Observer Mode                             | v1.0      | -              | Complete   | 2026-02-16 |
| 2. Execution Control                         | v1.0      | 2/2            | Complete   | 2026-02-16 |
| 3. Position Reconciliation                   | v1.0      | 2/2            | Complete   | 2026-02-16 |
| 03.1. Bug Fixes                              | v1.0      | 2/2            | Complete   | 2026-02-18 |
| 4. State Propagation                         | v1.0      | 3/3            | Complete   | 2026-02-19 |
| 5. Cleanup                                   | v1.0      | 6/6            | Complete   | 2026-02-20 |
| 6. iCloud Exclusion                          | v1.1      | 2/2            | Complete   | 2026-02-23 |
| 7. Download Tracking                         | v1.1      | 3/3            | Complete   | 2026-02-23 |
| 8. Skip & Player Polish                      | v1.1      | 3/3            | Complete   | 2026-02-27 |
| 9. Navigation & UI Polish                    | v1.1      | 3/3            | Complete   | 2026-02-27 |
| 10. DB Quick Wins                            | 2/2       | Complete       | 2026-03-04 | -          |
| 11. useEffect Cleanup + State Centralization | 2/2       | Complete       | 2026-03-04 | -          |
| 12. Service Decomposition                    | 2/2       | Complete       | 2026-03-05 | -          |
| 13. RN Downloader Migration                  | 1/2       | In Progress    |            | -          |
