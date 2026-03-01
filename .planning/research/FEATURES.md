# Feature Landscape: v1.2 Tech Cleanup

**Domain:** React Native Expo app — tech debt elimination, not user-facing features
**Researched:** 2026-02-28
**Milestone:** v1.2 Tech Cleanup (state audit, DB audit, file decomposition)

---

## Table Stakes

Tasks required for v1.2 to be a meaningful milestone. Missing = milestone is incomplete.

| Task                                                                 | Why Required                                                                                                                         | Complexity | Notes                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------- |
| Add missing DB indexes on high-traffic foreign keys                  | library_items.library_id and media_metadata.library_item_id have no indexes; hit on every home screen, library list, and play action | Medium     | Schema + migration; zero behavior risk                      |
| Replace N+1 upsert loop in upsertLibraryItems()                      | for loop awaiting one upsertLibraryItem at a time; 500-item sync = 1000 queries                                                      | Low        | Batch INSERT ... ON CONFLICT DO UPDATE                      |
| Replace N+1 series progress fetch in SeriesDetailScreen              | for loop awaiting getMediaProgressForLibraryItem() per book; should be single inArray query                                          | Low        | Already done in seriesSlice for other queries               |
| Replace select-then-insert upsertLibraryItem with onConflictDoUpdate | libraryItems.ts is the only helper still using the 2-query upsert pattern; all other helpers already use onConflictDoUpdate          | Low        | Same pattern as authors.ts, libraries.ts                    |
| State audit: identify and migrate shared local state to Zustand      | progressMap in SeriesDetailScreen and books/author/isLoadingBooks in AuthorDetailScreen are shared data duplicated in local state    | Medium     | ~3 confirmed candidates; must apply decision criteria below |
| Split PlayerService.ts (1,105 lines)                                 | 6 distinct concern groups with separate callers; coordinator dispatch contracts must be preserved                                    | High       | Keep as public facade; extract collaborators                |
| Split ProgressService.ts (1,178 lines)                               | 5 concern groups; background service contract and sync interval timing are fragile                                                   | High       | Most risk here; do in its own phase or subphase             |
| Split DownloadService.ts (1,170 lines)                               | 5 concern groups; background downloader callbacks and iOS path-repair are fragile                                                    | High       | Background task event handlers are the hardest boundary     |

---

## Differentiators

Tasks that improve the codebase materially but are not strictly required for the milestone to count.

| Task                                                                          | Value Proposition                                                                                                                     | Complexity | Notes                                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| WAL mode + synchronous=NORMAL pragma in db/client.ts                          | 4x write throughput on mobile; ProgressService writes every 15s; currently using default rollback journal                             | Low        | 2-line change after SQLite.openDatabaseSync(); no migration needed           |
| Add mediaProgress (userId, libraryItemId) composite index                     | getContinueListeningItems and getListenAgainItems join on both columns without a composite index; full table scan on home screen load | Low        | Schema + 1 migration                                                         |
| Add localListeningSessions (userId) and (isSynced) indexes                    | getUnsyncedSessions() scans on isSynced=false every 15-60s; getActiveSession() filters on userId                                      | Low        | Schema + 1 migration                                                         |
| Add audioFiles (mediaId) index                                                | getAudioFilesWithDownloadInfo() joins from mediaId; called on every play action                                                       | Low        | Schema + 1 migration                                                         |
| Batch upsertGenres/Narrators/Tags in fullLibraryItems.ts                      | for loops inserting one genre/narrator/tag at a time; should be values([...])                                                         | Low        | Minor; only matters on initial full sync                                     |
| Consolidate auth detail loading (books, author info) into authorsSlice action | AuthorDetailScreen fetches from DB on every mount; same data could be cached in authorsSlice with selected author state               | Medium     | Not every loading state needs this; only this screen fetches from DB locally |

---

## Anti-Features

Tasks that seem useful but should be explicitly deferred or rejected.

| Anti-Feature                                                          | Why Avoid                                                                                                                                                               | What to Do Instead                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Moving ALL useState to Zustand                                        | Most local state is legitimately ephemeral: form inputs, sort menus, modal toggles, debug screens; centralizing inflates store and creates unnecessary subscriptions    | Apply the decision criteria below; only migrate the 3 confirmed candidates       |
| Rewriting service files as React hooks                                | PlayerService/DownloadService/ProgressService are singleton classes running outside the React render cycle by design                                                    | Decompose into focused submodules (plain TS classes or functions), not hooks     |
| Switching to a different ORM or DB layer                              | Drizzle is working; schema and helpers are established; ORM change is a milestone-sized rewrite with no user benefit                                                    | Stay on Drizzle; add indexes and fix patterns within existing helpers            |
| Adding pagination to every DB query                                   | Only 3-4 queries are genuinely unbounded (getContinueListeningItems, getListenAgainItems, getLibraryItemsForList); most are already bounded by library membership       | Paginate only the unbounded queries if they prove slow at scale                  |
| Migrating from class singletons to module-level singletons everywhere | Pattern change across all three services simultaneously is high risk; PlayerStateCoordinator already uses getInstance() consistently                                    | Keep getInstance(); split files by concern within the existing class structure   |
| Splitting librarySlice.ts (1,011 lines) now                           | Slice methods are tightly coupled through the same Zustand set() closure; splitting creates circular-dependency risk and requires extracting thunk-like action creators | Monitor; split only if it grows or gains more unrelated responsibilities in v1.2 |

---

## State Audit Decision Criteria

The following rules determine whether a `useState` should move to Zustand. Apply these before migrating anything.

**Centralize if ANY of these are true:**

1. The same data is fetched by useEffect in more than one screen (author detail and series detail both independently fetch from DB)
2. The state is derived from a DB or network query that re-runs on every mount/focus with no caching (not a stable snapshot)
3. The state needs to survive navigation: user navigates away and back and expects consistent data
4. The state drives behavior in a service (e.g., isDownloadingAll affects DownloadService decisions)
5. Two or more components need to read or react to the same state

**Keep local if ALL of these are true:**

1. Used only inside a single component tree that unmounts cleanly when navigated away from
2. Ephemeral UI state: form inputs, sort menu open/close, modal visible, search query, scroll position
3. No other component needs to read or react to it
4. Does not come from a DB or network fetch shared elsewhere

**Confirmed candidates for centralization (v1.2 scope, from codebase audit):**

| Location                       | State                                                         | Problem                                                                                | Where to Move                                                    |
| ------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `series/[seriesId]/index.tsx`  | `progressMap: Map<string, MediaProgressRow>`                  | for-loop fetch per book on mount; seriesSlice has series data already                  | seriesSlice or libraryItemDetailsSlice                           |
| `authors/[authorId]/index.tsx` | `books: LibraryItemDisplayRow[]`, `author`, `isLoadingBooks`  | DB fetch on every mount; authorsSlice already has the author list                      | authorsSlice (add `selectedAuthorBooks` or `authorBooksCache`)   |
| `more/storage.tsx`             | `storageEntries: StorageEntry[]`, `orphanFiles: OrphanFile[]` | Recomputed from disk on every open; more/storage is a DevOps screen, tolerable locally | Acceptable to leave local; reconsider if shared with actions.tsx |

**Confirmed correct as local state (do not move):**

- `baseUrl`, `username`, `password`, `submitting`, `error` in login.tsx — form state, ephemeral, single component
- `showSortMenu` in series/index.tsx and authors/index.tsx — UI toggle, single component
- `viewMode`, `searchQuery` in library/index.tsx — screen-level UI preferences (candidate for settings persistence but not Zustand centralization in v1.2)
- `logs`, `selectedLevel`, `visibleTags`, `searchText` in logs.tsx — debug screen, all local
- `trackPlayerState`, `coordinatorState` in track-player.tsx — diagnostic polling, intentionally ephemeral
- `appVersion` in more/index.tsx — read once on mount, never shared
- `isRefreshing`, `emptyConfirmed`, `skeletonSectionCount` in home/index.tsx — animation/loading UI gating, local is correct

---

## DB/SQL Audit: Patterns to Check

### Missing Indexes (Confirmed from schema audit)

| Table                      | Column(s)                              | Query Context                                                                                                                                                                                  | Severity |
| -------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `library_items`            | `library_id`                           | Every library list query; innerJoin target in 6+ helpers (getLibraryItemsByLibraryId, getLibraryItemsForList, getLibraryItemsByAuthor, cacheCoversForLibraryItems, getMediaMetadataForLibrary) | High     |
| `media_metadata`           | `library_item_id`                      | getMediaMetadataByLibraryItemId — called in PlayerService, ProgressService, DownloadService on every play action                                                                               | High     |
| `audio_files`              | `media_id`                             | getAudioFilesWithDownloadInfo — innerJoin from mediaId; called on every play action                                                                                                            | High     |
| `media_progress`           | `(user_id, library_item_id)` composite | getContinueListeningItems, getListenAgainItems, getMediaProgressForLibraryItem — home screen + series detail                                                                                   | High     |
| `local_listening_sessions` | `user_id`                              | getActiveSession, getAllActiveSessionsForUser — every sync cycle                                                                                                                               | Medium   |
| `local_listening_sessions` | `is_synced`                            | getUnsyncedSessions — full table scan every 15-60s during playback                                                                                                                             | Medium   |

Note: Join table composites (media_authors, media_series, media_genres, media_narrators, media_tags) already have unique indexes from migrations 0005-0006. audioFiles.id, mediaMetadata.id, libraryItems.id are all PKs. The gaps above are the meaningful missing ones.

### N+1 Query Patterns (Confirmed from codebase audit)

| Location                                 | Pattern                                                                    | Recommended Fix                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `libraryItems.ts: upsertLibraryItems()`  | for loop calling `upsertLibraryItem()` sequentially (line 62-67)           | Single `INSERT ... ON CONFLICT DO UPDATE` with values array                       |
| `libraryItems.ts: upsertLibraryItem()`   | SELECT-then-INSERT/UPDATE = 2 round trips per row (line 45-58)             | `INSERT ... ON CONFLICT DO UPDATE` (already used in authors.ts, libraries.ts)     |
| `fullLibraryItems.ts: upsertGenres()`    | for loop inserting one genre at a time (line 54-56)                        | Batch insert with `onConflictDoNothing` values array                              |
| `fullLibraryItems.ts: upsertNarrators()` | for loop inserting one narrator at a time (line 62-64)                     | Same batch pattern                                                                |
| `fullLibraryItems.ts: upsertTags()`      | for loop inserting one tag at a time (line 70-72)                          | Same batch pattern                                                                |
| `series/[seriesId]/index.tsx` useEffect  | for loop awaiting `getMediaProgressForLibraryItem()` per book (line 59-63) | Single query: `getMediaProgressForMultipleItems(bookIds, userId)` using `inArray` |

### SQLite Pragma Gap (Confirmed)

`db/client.ts` opens the database with `SQLite.openDatabaseSync(DB_NAME)` and applies no pragma configuration. This means:

- Default journal mode = DELETE (rollback mode); every write takes a full lock
- ProgressService syncs every 15s and writes 3-4 rows per sync cycle
- Bulk library sync (500 items) writes sequentially without WAL concurrency benefit
- Fix: call `getSQLiteDb().execSync("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")` immediately after the openDatabaseSync call in `getSQLiteDb()`. No migration required. Expo SQLite supports WAL.

---

## Long File Decomposition Patterns

### Decomposition Decision Criteria

Split a file when its method groups satisfy ALL of:

1. Distinct initialization/teardown paths (init vs business logic vs error handling)
2. Independently testable (each group has its own dependency set)
3. Invoked from different callers (coordinator vs UI vs background service vs DB)

Do NOT split if methods share deeply coupled private state that cannot be cleanly partitioned. In that case, add internal section comments and defer the split.

The file-size threshold is a signal, not a trigger. 1,000+ lines is a signal to examine; splitting depends on coupling.

### PlayerService.ts (1,105 lines) — Split Recommended

Method groups identified:

| Submodule            | Approx Lines | Methods                                                                                                                                               | Shared Private State                                                             |
| -------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Init/Lifecycle       | ~150         | initialize, cleanup, resetInstance, printDebugInfo                                                                                                    | `initialized`, `listenersSetup`, `eventSubscriptions`, `initializationTimestamp` |
| Track Loading        | ~300         | executeLoadTrack, buildTrackList, reloadTrackPlayerQueue, rebuildCurrentTrackIfNeeded, getApiInfo                                                     | `cachedApiInfo`                                                                  |
| Playback Control     | ~200         | play, pause, stop, togglePlayPause, executePlay, executePause, executeStop, seekTo, executeSeek, setRate, setVolume, executeSetRate, executeSetVolume | none (reads store)                                                               |
| Progress Restore     | ~200         | restorePlayerServiceFromSession, syncPositionFromDatabase                                                                                             | none                                                                             |
| Path Repair          | ~100         | refreshFilePathsAfterContainerChange                                                                                                                  | none                                                                             |
| Background Reconnect | ~100         | reconnectBackgroundService                                                                                                                            | Metro module cache access                                                        |

**Recommended approach:** Keep `PlayerService` as the public facade (retaining `getInstance()`, `playTrack()`, `togglePlayPause()` etc.) and extract concern groups into private collaborator functions or module-level helpers called by PlayerService. This preserves the coordinator dispatch contract from MEMORY.md (all `dispatchPlayerEvent({ type: "PLAY" })` calls stay in the track-loading concern, specifically inside executeLoadTrack patterns).

**Critical constraint:** The `executeLoadTrack` pattern (dispatches PLAY after TrackPlayer setup rather than calling TrackPlayer.play() directly) must not be split across modules. The LOADING→PLAYING transition depends on this specific dispatch sequence.

### ProgressService.ts (1,178 lines) — Split Recommended (High Risk)

Method groups identified:

| Submodule           | Approx Lines | Methods                                                                                                                                   | Key Dependency          |
| ------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Session Lifecycle   | ~300         | startSession, endCurrentSession, endStaleSession, rehydrateActiveSession, forceRehydrateSession, getCurrentSession, getCurrentUserContext | DB helpers              |
| Server Sync         | ~300         | syncSessionToServer, syncDownloadedSession, syncUnsyncedSessions, forceSyncSessions, shouldSyncToServer                                   | API endpoints           |
| Periodic Sync       | ~120         | startPeriodicSync, syncInterval management, SYNC_INTERVAL constants                                                                       | Calls Server Sync group |
| Progress Tracking   | ~250         | updateProgress, handleDuck, fetchServerProgress, forceResyncPosition                                                                      | Coordinator dispatch    |
| Position Resolution | ~200         | getResumePosition, resolveCanonicalPosition                                                                                               | AsyncStorage + DB       |

**Critical constraints:**

- `syncInterval` and `SYNC_INTERVAL_UNMETERED`/`METERED` constants must remain accessible to the background service
- `MIN_SESSION_DURATION` (5s) and `PAUSE_TIMEOUT` (15min) checks must stay coupled to session lifecycle logic
- The `resolveCanonicalPosition` isFinished guard (from MEMORY.md) must not be separated from the position resolution code path

**Recommendation:** ProgressService is the highest-risk split. Do it in its own phase with dedicated verification, not combined with PlayerService split.

### DownloadService.ts (1,170 lines) — Split Recommended (Medium Risk)

Method groups identified:

| Submodule             | Approx Lines | Methods                                                                                                                                                   | Key Dependency                               |
| --------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Download Lifecycle    | ~350         | startDownload, cancelDownload, pauseDownload, resumeDownload, downloadAudioFile, cleanupDownload                                                          | RNBackgroundDownloader + activeDownloads Map |
| Progress Tracking     | ~200         | subscribeToProgress, unsubscribeFromProgress, updateProgress, notifyProgressCallbacks, triggerProgressUpdate, rewireProgressCallbacks, getCurrentProgress | Callback map (coupled to activeDownloads)    |
| Status Queries        | ~200         | isLibraryItemDownloaded, getDownloadProgress, getDownloadStatus, getDownloadedSize, isDownloadActive                                                      | DB helpers                                   |
| Repair/Reconciliation | ~150         | repairDownloadStatus, restoreExistingDownloads                                                                                                            | File system + DB                             |
| Cleanup/Error         | ~100         | deleteDownloadedLibraryItem, handleTaskCompletion, handleTaskProgress, handleDownloadError                                                                | DB + FS                                      |

**Critical constraint:** `activeDownloads` Map and the progress callback map are shared across Download Lifecycle and Progress Tracking — these two groups cannot be cleanly separated without a shared state object. They should remain in the same owner class, or the Map should be extracted into a shared DownloadStateRegistry module.

**Recommendation:** Split Status Queries and Repair/Reconciliation out first (lowest coupling); leave Lifecycle + Progress Tracking together until the shared state is resolved.

---

## Feature Dependencies

```
WAL pragma → independent (db/client.ts only)
Missing indexes → drizzle:generate + migration
N+1 fix: upsertLibraryItems → independent of index changes
N+1 fix: series progress fetch → needs a new DB helper getMediaProgressForMultipleItems
onConflictDoUpdate in libraryItems → replaces select-then-insert; independent
State audit (progressMap) → needs seriesSlice or libraryItemDetailsSlice to accept progress map
State audit (author books) → needs authorsSlice to accept per-author book cache
PlayerService split → coordinator dispatch contracts stable (confirmed MEMORY.md)
ProgressService split → background service entrypoint must be identified before splitting
DownloadService split → RNBackgroundDownloader callback pattern must be traced before splitting
```

---

## Complexity and Phase Ordering

| Task                                 | Complexity | Risk   | Suggested Phase                    |
| ------------------------------------ | ---------- | ------ | ---------------------------------- |
| WAL pragma                           | Low        | None   | Phase 1 (DB quick wins)            |
| Missing indexes (schema + migration) | Low        | None   | Phase 1 (DB quick wins)            |
| N+1 fixes in helpers + screens       | Low        | Low    | Phase 1 (DB quick wins)            |
| onConflictDoUpdate in libraryItems   | Low        | Low    | Phase 1 (DB quick wins)            |
| State audit (3 confirmed candidates) | Medium     | Low    | Phase 2 (state audit)              |
| PlayerService split                  | High       | Medium | Phase 3 (service decomposition)    |
| ProgressService split                | High       | High   | Phase 4 (separate, verified phase) |
| DownloadService split                | High       | Medium | Phase 3 or Phase 4                 |

---

## Sources

Research informed by:

- Codebase audit of `/Users/clay/Code/github/abs-react-native/src/` (all schema, helpers, services, slices, screens — 50,175 lines TypeScript/TSX)
- Project MEMORY.md (coordinator architecture, executeLoadTrack dispatch pattern, known bug history)
- [SQLite Query Planning — sqlite.org](https://sqlite.org/queryplanner.html) (HIGH confidence, official)
- [Write-Ahead Logging — sqlite.org](https://sqlite.org/wal.html) (HIGH confidence, official)
- [SQLite Optimizations for Ultra High-Performance — PowerSync](https://www.powersync.com/blog/sqlite-optimizations-for-ultra-high-performance) (MEDIUM confidence, practitioner source)
- [Drizzle ORM Indexes & Constraints](https://orm.drizzle.team/docs/indexes-constraints) (HIGH confidence, official)
- [Best practices for SQLite performance — Android Developers](https://developer.android.com/topic/performance/sqlite-performance-best-practices) (HIGH confidence, official)
- [React State Management in 2025 — developerway.com](https://www.developerway.com/posts/react-state-management-2025) (MEDIUM confidence, practitioner)
- [Managing State — React docs](https://react.dev/learn/managing-state) (HIGH confidence, official)
- [Single Responsibility Principle in React — DhiWise](https://www.dhiwise.com/post/building-react-apps-with-the-single-responsibility-principle) (MEDIUM confidence)

---

_Feature research for: abs-react-native v1.2 Tech Cleanup_
_Researched: 2026-02-28_
