# Requirements: Audiobookshelf React Native

**Defined:** 2026-02-28
**Core Value:** The coordinator owns player state — services execute its commands and report reality back, not the other way around.

## v1.2 Requirements

Requirements for the Tech Cleanup milestone. Each maps to roadmap phases starting at Phase 10.

### DB Performance

- [x] **DB-01**: WAL mode + `synchronous=NORMAL` pragmas configured at DB open (~4x write throughput for ProgressService 15s sync writes)
- [x] **DB-02**: Index added on `library_items.library_id`
- [x] **DB-03**: Index added on `media_metadata.library_item_id`
- [x] **DB-04**: Index added on `audio_files.media_id`
- [x] **DB-05**: Composite index added on `media_progress(user_id, library_item_id)`
- [x] **DB-06**: `upsertLibraryItems()` converted from serial for-loop to batch `onConflictDoUpdate`
- [x] **DB-07**: `fullLibraryItems.ts` genre/narrator/tag inserts converted to batch operations

### State Centralization

- [x] **STATE-01**: `viewMode` preference in library index moved to `settingsSlice` (persisted preference, not per-mount local state)
- [x] **STATE-02**: SeriesDetailScreen `progressMap` replaced with bulk store action (eliminates N+1 per-book DB fetch in component)
- [x] **STATE-03**: AuthorDetailScreen author lookup replaced with `getAuthorById` store action (cache-miss DB fetch lives in slice, not component)

### useEffect Cleanup

- [x] **EFFECT-01**: `ConsolidatedPlayerControls` jump interval AsyncStorage reads replaced with `useSettings()` hook (values already in `settingsSlice`)
- [x] **EFFECT-02**: `LibraryItemDetail` mount-time `fetchServerProgress()` removed (already triggered by home screen focus and app foreground)
- [x] **EFFECT-03**: `userId` added to `useAuth()` to eliminate `getUserByUsername()` DB reads scattered across 5+ components
- [x] **EFFECT-04**: Author/series navigation IDs moved into `libraryItemDetailsSlice.fetchItemDetails` (currently a separate component-level useEffect per item open)
- [x] **EFFECT-05**: `MoreScreen` app version reads converted to synchronous module-scope constants (no useEffect or useState needed)
- [x] **EFFECT-06**: `getAllTags()` consolidated into `loggerSlice.availableTags` (currently fetched independently in both LogsScreen and LoggerSettingsScreen)

### Service Decomposition

- [x] **DECOMP-01**: PlayerService concern groups extracted to private collaborators behind public facade (coordinator dispatch contract and singleton interface preserved)
- [x] **DECOMP-02**: DownloadService concern groups extracted to private collaborators behind public facade (status queries, lifecycle, repair separated)

### RN Downloader Migration

- [x] **DWNLD-01**: Fork diff spike completed — fork API vs mainline 4.5.3 documented, `task.metadata` persistence across app restart verified
- [ ] **DWNLD-02**: `package.json` migrated to mainline `@kesha-antonov/react-native-background-downloader@4.5.3`
- [ ] **DWNLD-03**: `DownloadService.ts` API calls updated to mainline interface (all renamed methods, including `checkForExistingDownloads` → `getExistingDownloadTasks`)
- [ ] **DWNLD-04**: `withExcludeFromBackup` plugin behavior verified post-migration (v1.1 iCloud exclusion fix must not regress)

## Future Requirements

### Expo SDK Upgrade

- **EXPO-01**: Expo SDK 55 + React Native 0.83.2 upgrade (New Architecture mandatory)
- **EXPO-02**: RNTP 4.1.2 Android bridgeless compatibility verified on physical device
- **EXPO-03**: `expo-file-system` imports migrated to `/legacy` API
- **EXPO-04**: `withExcludeFromBackup` plugin re-verified post-prebuild

_Deferred: RNTP Android bridgeless compatibility (open issue #2443) is an external gate. Cannot commit until RNTP ships a verified bridgeless-clean 4.x release._

### ProgressService Decomposition

- **DECOMP-03**: ProgressService concern groups extracted to private collaborators behind public facade
  _Deferred: background service contract complexity warrants a standalone phase after DECOMP-01/02 settle._

## Out of Scope

| Feature                                                | Reason                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| RNTP upgrade to 5.x                                    | 5.0-alpha broken on iOS; wait for stable                        |
| Configurable smart-rewind/jump intervals               | UX feature, not tech debt — deferred to features milestone      |
| iOS native intents / Siri shortcuts                    | Features milestone                                              |
| Cloudflare feedback worker                             | Features milestone                                              |
| DIAG-01/02: Coordinator diagnostics to crash reporting | Deferred                                                        |
| Full playerSlice removal                               | Zustand/React integration is valuable; stays as read-only proxy |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status   |
| ----------- | ----- | -------- |
| DB-01       | 10    | Complete |
| DB-02       | 10    | Complete |
| DB-03       | 10    | Complete |
| DB-04       | 10    | Complete |
| DB-05       | 10    | Complete |
| DB-06       | 10    | Complete |
| DB-07       | 10    | Complete |
| STATE-01    | 11    | Complete |
| STATE-02    | 11    | Complete |
| STATE-03    | 11    | Complete |
| EFFECT-01   | 11    | Complete |
| EFFECT-02   | 11    | Complete |
| EFFECT-03   | 11    | Complete |
| EFFECT-04   | 11    | Complete |
| EFFECT-05   | 11    | Complete |
| EFFECT-06   | 11    | Complete |
| DECOMP-01   | 12    | Complete |
| DECOMP-02   | 12    | Complete |
| DWNLD-01    | 13    | Complete |
| DWNLD-02    | 13    | Pending  |
| DWNLD-03    | 13    | Pending  |
| DWNLD-04    | 13    | Pending  |

**Coverage:**

- v1.2 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 (complete)

---

_Requirements defined: 2026-02-28_
_Last updated: 2026-02-28 after roadmap creation (Phases 10–13)_
