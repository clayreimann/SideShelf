# SideShelf Refactoring Plan

**Generated:** 2025-11-14
**Project:** SideShelf (React Native Audiobook Player)

---

## Executive Summary

Analysis identified critical refactoring opportunities in large functions and duplicated code patterns. Implementing these changes will eliminate 500-700 lines of code and improve maintainability.

**Key Findings:**
- 17 functions over 50 lines requiring breakdown
- ~800-1000 lines of duplicated code
- Largest function: 234 lines (handlePlaybackProgressUpdated)
- Severe duplication in store slices (70-80% similar code)

---

## Critical Issues

### 1. Large Functions (>150 lines)

**PlayerBackgroundService.ts:395-628 - `handlePlaybackProgressUpdated()` (234 lines)**
- Handles 6+ responsibilities: progress tracking, chapter detection, sleep timer, server sync, session rehydration
- Deep nesting, difficult to test

**ProgressService.ts:189-415 - `startSession()` (227 lines)**
- Handles mutex locking, validation, duplicate cleanup, resume logic, server sync
- Complex async flow, high risk for bugs

**PlayerService.ts:205-385 - `playTrack()` (180 lines)**
- User verification, data fetching, queue management, settings application
- 60+ lines duplicated with reloadTrackPlayerQueue()

**PlayerService.ts:1075-1256 - `reconcileTrackPlayerState()` (182 lines)**
- Complex state reconciliation with multiple parallel checks

**LibraryItemDetail.tsx:96-863 - Component (767 lines)**
- Massive component with 6+ useEffect hooks
- Should be 8+ smaller components

### 2. Code Duplication

**Store Slices (HIGH PRIORITY)**
- librarySlice, authorsSlice, seriesSlice, homeSlice have 70-80% identical code
- Initialization logic repeated 4 times (~150 lines)
- Loading state management repeated 20+ times
- AsyncStorage persistence repeated 3 times (~100 lines)
- **Impact:** Could eliminate 300-400 lines with factory functions

**Services**
- User authentication pattern repeated 15+ times (~75 lines)
- Database upsert pattern repeated 3 times across helpers
- Position validation duplicated in PlayerService (~40 lines)

---

## Implementation Plans

### Plan 1: Store Slice Factory Functions
**Priority:** P1 | **Risk:** Low | **Effort:** 2-3 days | **Impact:** Eliminates 300-400 lines

**Approach:**
Create reusable factories in `src/lib/storeHelpers/`:
- `createSliceInitializer()` - Standardized initialization
- `createLoadingStateUpdater()` - Loading state management
- `createStoragePersistence()` - AsyncStorage handling
- `createSortConfigManager()` - Sort configuration

**Migration:** Refactor one slice (authorsSlice) as proof of concept, then apply pattern to remaining slices.

**[Full Plan →](./01-store-slice-factory-functions.md)**

---

### Plan 2: Refactor handlePlaybackProgressUpdated()
**Priority:** P1 | **Risk:** High | **Effort:** 3-4 days | **Impact:** Breaks 234-line function into 15 functions

**Extract Functions:**
- `updatePlaybackProgress()` - Update session and sync store
- `handleChapterChangeIfNeeded()` - Detect chapter transitions
- `updateNowPlayingMetadataIfNeeded()` - Periodic metadata updates
- `checkAndHandleSleepTimer()` - Sleep timer logic
- `syncToServerIfNeeded()` - Server sync coordination
- `attemptSessionRehydration()` - Session recovery

**Result:** Main orchestrator ~40 lines, helpers 10-60 lines each

**[Full Plan →](./03-refactor-handlePlaybackProgressUpdated.md)**

---

### Plan 3: Refactor startSession()
**Priority:** P1 | **Risk:** High | **Effort:** 3-4 days | **Impact:** Breaks 227-line function into 11 functions

**Extract Functions:**
- `acquireStartSessionLock()` - Mutex management
- `validateStartSessionRequest()` - Validation
- `cleanupDuplicateSessions()` - Duplicate detection and cleanup
- `determineResumePosition()` - Multi-source resume logic
- `cleanupOtherActiveSessions()` - Other session cleanup
- `createAndSyncSession()` - Session creation and sync

**Result:** Main orchestrator ~40 lines, average helper ~20 lines

**[Full Plan →](./04-refactor-startSession.md)**

---

### Plan 4: Refactor playTrack()
**Priority:** P1 | **Risk:** High | **Effort:** 2-3 days | **Impact:** Eliminates 60+ lines duplication

**Extract Functions:**
- `loadTrackData()` - Fetch library item, metadata, audio files
- `validateAudioFiles()` - Audio file validation
- `setupPlaybackQueue()` - Queue management
- `applyResumePosition()` - Resume position (shared with reloadTrackPlayerQueue)
- `applyPlaybackSettings()` - Playback rate/volume (shared with reloadTrackPlayerQueue)

**Result:** ~140 lines, 60+ lines deduplication

**[Full Plan →](./05-refactor-playTrack.md)**

---

### Plan 5: Split LibraryItemDetail Component
**Priority:** P3 | **Risk:** Medium | **Effort:** 4-5 days | **Impact:** 30-40% performance improvement

**Extract Components:**
- `LibraryItemHeader` - Cover, title, author, series
- `LibraryItemProgress` - Progress bar with live updates
- `LibraryItemActions` - Play, download, menu buttons
- `LibraryItemMetadata` - Duration, year, genres, tags
- `LibraryItemDescription` - Collapsible description
- `LibraryItemChapters` - Chapter list
- `LibraryItemAudioFiles` - Audio file list
- `LibraryItemMenu` - Actions menu

**Extract Hooks:**
- `useItemDetails()` - Load item and metadata
- `useItemProgress()` - Track playback progress
- `useDownloadState()` - Download state management
- `usePlaybackState()` - Current playback state

**Result:** 767 lines → ~450 lines across files, better performance

**[Full Plan →](./06-split-LibraryItemDetail-component.md)**

---

## Recommended Implementation Order

### Week 1: Foundation
**Store Slice Factory Functions** (2-3 days)
- Low risk, high impact
- Creates reusable patterns
- Can start immediately

### Week 2-3: Services
**playTrack()** (2-3 days) → **handlePlaybackProgressUpdated()** (3-4 days) → **startSession()** (3-4 days)
- Build from simpler to more complex
- Each builds confidence for next
- All share similar refactoring patterns

### Week 4-5: Components (Optional)
**LibraryItemDetail** (4-5 days)
- Can be done independently
- Improves user experience
- Performance gains

---

## Expected Benefits

### Code Quality
- **500-700 lines** eliminated
- **30-40%** reduction in duplication
- **Average function length:** <30 lines
- **Test coverage:** 80%+ target

### Performance
- **Component render time:** 30-40% faster
- **No regression** in startup time
- **Easier optimization** of individual functions

### Maintainability
- **Single responsibility** per function
- **Easier testing** with isolated functions
- **Faster debugging** with clear code paths
- **Better onboarding** for new developers

---

## Risk Mitigation

### High-Risk Refactorings
- handlePlaybackProgressUpdated, startSession, playTrack

**Mitigations:**
- 90%+ test coverage before deployment
- Extensive manual testing
- Monitor error rates post-deployment
- Rollback plan ready

### Low-Risk Refactorings
- Store slice factories, component splitting

**Approach:**
- Standard testing and code review
- Normal deployment process

---

## Timeline

| Refactoring | Effort | Risk | Can Start |
|-------------|--------|------|-----------|
| Store Slice Factories | 2-3 days | Low | ✅ Now |
| playTrack | 2-3 days | High | After factories |
| handlePlaybackProgress | 3-4 days | High | After playTrack |
| startSession | 3-4 days | High | After handlePlayback |
| LibraryItemDetail | 4-5 days | Medium | ✅ Now (independent) |

**Total:** 15-20 days sequential, or 2-3 weeks with parallel work

---

## Implementation Plans

Detailed step-by-step guides for each refactoring:

1. [Store Slice Factory Functions](./01-store-slice-factory-functions.md)
2. [Refactor handlePlaybackProgressUpdated](./03-refactor-handlePlaybackProgressUpdated.md)
3. [Refactor startSession](./04-refactor-startSession.md)
4. [Refactor playTrack](./05-refactor-playTrack.md)
5. [Split LibraryItemDetail Component](./06-split-LibraryItemDetail-component.md)

---

## Getting Started

1. **Review** this plan and individual implementation guides
2. **Start with** Store Slice Factory Functions (lowest risk, highest impact)
3. **Create feature branch** for each refactoring
4. **Follow** step-by-step implementation guide
5. **Test thoroughly** before merging
6. **Monitor** after deployment

---

**Status:** Ready for implementation
**Last Updated:** 2025-11-14
