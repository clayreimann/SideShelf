# Code Duplication Analysis Report

**Date:** 2025-11-14  
**Analyzed By:** Claude Code  
**Scope:** SideShelf codebase - services, stores, components, and database helpers

## Executive Summary

This analysis identified significant code duplication across the SideShelf codebase, with the most severe duplication in:
1. **Store slices** (librarySlice, authorsSlice, seriesSlice, homeSlice) - 70-80% similar code
2. **Database helpers** (libraryItems, authors, series) - Repeated upsert and query patterns
3. **Services** (PlayerService, ProgressService, PlayerBackgroundService) - Repeated user/session fetching patterns
4. **Within-file duplication** - Particularly in services with repeated conditional logic

**Estimated Impact:** Refactoring could eliminate ~30-40% of duplicated code, improving maintainability and reducing bugs.

---

## 1. Cross-File Duplication

### 1.1 Store Slices - SEVERE DUPLICATION (Priority: HIGH)

**Files Affected:**
- `/home/user/SideShelf/src/stores/slices/librarySlice.ts` (726 lines)
- `/home/user/SideShelf/src/stores/slices/authorsSlice.ts` (391 lines)
- `/home/user/SideShelf/src/stores/slices/seriesSlice.ts` (303 lines)
- `/home/user/SideShelf/src/stores/slices/homeSlice.ts` (298 lines)

**Duplication Pattern 1: Initialization Logic**

All slices have nearly identical initialization patterns:

```typescript
// Repeated ~4 times across slices
initializeXXX: async (apiConfigured: boolean, dbInitialized: boolean) => {
    const state = get();
    if (state.XXX.initialized) return;
    
    log.info('Initializing slice...');
    
    set((state) => ({
        ...state,
        XXX: {
            ...state.XXX,
            loading: { ...state.XXX.loading, isInitializing: true }
        }
    }));
    
    try {
        await get()._loadXXXSettingsFromStorage();
        get()._setXXXReady(apiConfigured, dbInitialized);
        
        if (apiConfigured && dbInitialized) {
            await get().refetchXXX();
        }
        
        set((state) => ({
            ...state,
            XXX: { ...state.XXX, initialized: true, loading: { ...state.XXX.loading, isInitializing: false } }
        }));
    } catch (error) {
        // Error handling
    }
}
```

**Lines:** librarySlice:134-222, authorsSlice:113-162, seriesSlice:111-158, homeSlice:120-169  
**Repetitions:** 4 times  
**Suggested Refactoring:** Create `createSliceInitializer` factory function  
**Impact:** High - Eliminates ~150 lines of duplicated code

---

**Duplication Pattern 2: Loading State Management**

```typescript
// Repeated ~4 times
const INITIAL_LOADING_STATES: LoadingStates = {
    isLoadingLibraries: false,
    isLoadingItems: false,
    isSelectingLibrary: false,
    isInitializing: true,
};

// And similar set() patterns for loading states throughout
set((state) => ({
    ...state,
    XXX: {
        ...state.XXX,
        loading: { ...state.XXX.loading, isLoadingItems: true }
    }
}));
```

**Lines:** Throughout all slice files  
**Repetitions:** 20+ occurrences  
**Suggested Refactoring:** Create `createLoadingStateManager` helper  
**Impact:** Medium - Reduces boilerplate and ensures consistent loading state handling

---

**Duplication Pattern 3: AsyncStorage Persistence**

```typescript
// Repeated ~4 times with minor variations
_loadXXXSettingsFromStorage: async () => {
    try {
        const storedSortConfig = await AsyncStorage.getItem(STORAGE_KEYS.sortConfig);
        const updates: Partial<XXXSliceState['XXX']> = {};
        
        if (storedSortConfig) {
            try {
                const parsedSortConfig = JSON.parse(storedSortConfig) as XXXSortConfig;
                updates.sortConfig = parsedSortConfig;
            } catch (parseError) {
                log.error('Failed to parse stored sort config:', parseError);
            }
        }
        
        if (Object.keys(updates).length > 0) {
            set((state) => ({
                ...state,
                XXX: { ...state.XXX, ...updates }
            }));
        }
    } catch (error) {
        log.error('Failed to load from storage:', error);
    }
}
```

**Lines:** librarySlice:676-711, authorsSlice:339-376, seriesSlice:261-288  
**Repetitions:** 3 times  
**Suggested Refactoring:** Create `createStoragePersistence` helper  
**Impact:** Medium - Eliminates ~100 lines

---

**Duplication Pattern 4: Sort Configuration Updates**

```typescript
// Repeated ~3 times
setXXXSortConfig: async (config: XXXSortConfig) => {
    set((state) => ({
        ...state,
        XXX: {
            ...state.XXX,
            sortConfig: config,
            items: sortXXX(state.XXX.rawItems, config)
        }
    }));
    
    try {
        await AsyncStorage.setItem(STORAGE_KEYS.sortConfig, JSON.stringify(config));
    } catch (error) {
        log.error('Failed to save sort config:', error);
    }
}
```

**Lines:** librarySlice:630-647, authorsSlice:289-309, seriesSlice:216-233  
**Repetitions:** 3 times  
**Suggested Refactoring:** Create `createSortConfigManager` factory  
**Impact:** Low-Medium - Eliminates ~50 lines

---

**Duplication Pattern 5: Ready State Checking**

```typescript
// Repeated ~4 times
_setXXXReady: (apiConfigured: boolean, dbInitialized: boolean) => {
    const ready = apiConfigured && dbInitialized;
    log.info(`Setting ready state: ${ready} (api=${apiConfigured}, db=${dbInitialized})`);
    set((state) => ({
        ...state,
        XXX: { ...state.XXX, ready }
    }));
}
```

**Lines:** librarySlice:663-671, authorsSlice:325-334, seriesSlice:249-256  
**Repetitions:** 3 times  
**Suggested Refactoring:** Extract to shared utility  
**Impact:** Low - Simple pattern, but adds up

---

### 1.2 Database Helpers - MODERATE DUPLICATION (Priority: MEDIUM)

**Files Affected:**
- `/home/user/SideShelf/src/db/helpers/libraryItems.ts`
- `/home/user/SideShelf/src/db/helpers/authors.ts`
- `/home/user/SideShelf/src/db/helpers/series.ts`

**Duplication Pattern 1: Upsert Functions**

```typescript
// Repeated ~3 times with minor variations
export async function upsertXXX(row: NewXXXRow): Promise<XXXRow> {
  const result = await db
    .insert(XXXTable)
    .values(row)
    .onConflictDoUpdate({
      target: XXXTable.id,
      set: { /* fields */ },
    })
    .returning();
  return result[0];
}

export async function upsertMultipleXXX(rows: NewXXXRow[]): Promise<void> {
  if (rows.length === 0) return;
  for (const row of rows) {
    await upsertXXX(row);
  }
}
```

**Lines:** libraryItems:43-70, authors:116-142, series:105-132  
**Repetitions:** 3 times (single + batch upsert)  
**Suggested Refactoring:** Create generic `createUpsertHelpers<T>()` factory  
**Impact:** High - More consistent DB operations, easier to add bulk optimization

---

**Duplication Pattern 2: Get By ID**

```typescript
// Repeated ~3+ times
export async function getXXXById(id: string): Promise<XXXRow | null> {
  const result = await db
    .select()
    .from(XXXTable)
    .where(eq(XXXTable.id, id))
    .limit(1);
  return result[0] || null;
}
```

**Lines:** libraryItems:114-122, authors:93-101, series:83-90  
**Repetitions:** 3+ times  
**Suggested Refactoring:** Create `createGetByIdHelper(table)` factory  
**Impact:** Low-Medium - Simple but repeated frequently

---

**Duplication Pattern 3: Transform to Display Format**

```typescript
// Similar pattern repeated across helpers
export function transformXXXToDisplayFormat(items: XXXRow[]): XXXListRow[] {
  return items.map(item => ({
    id: item.id,
    name: item.name,
    // ... other fields
  }));
}
```

**Lines:** libraryItems:transformItemsToDisplayFormat, authors:194-200, series:150-160  
**Repetitions:** 3 times  
**Suggested Refactoring:** Create generic mapper utility or standardize display row format  
**Impact:** Low - Mostly schema-specific logic

---

### 1.3 Service Layer - USER FETCHING PATTERN (Priority: HIGH)

**Files Affected:**
- `/home/user/SideShelf/src/services/PlayerService.ts`
- `/home/user/SideShelf/src/services/ProgressService.ts`
- `/home/user/SideShelf/src/services/PlayerBackgroundService.ts`

**Duplication Pattern: User ID Retrieval**

This pattern is repeated 15+ times across services:

```typescript
// Repeated ~15 times
const username = await getStoredUsername();
if (!username) {
    throw new Error("No authenticated user found");
}

const user = await getUserByUsername(username);
if (!user?.id) {
    throw new Error("User not found in database");
}
```

**Occurrences:**
- PlayerService: Lines 213-222, 599-607, 920-929, 1278-1289
- ProgressService: Lines 244-248, 530-531, 599-607, 734-737
- PlayerBackgroundService: Lines 110-120, 245-248, 299-300, 649-650, 695-696

**Repetitions:** 15+ times  
**Suggested Refactoring:**
```typescript
// Create utility function
async function getCurrentUserId(): Promise<string> {
  const username = await getStoredUsername();
  if (!username) {
    throw new Error("No authenticated user found");
  }
  
  const user = await getUserByUsername(username);
  if (!user?.id) {
    throw new Error("User not found in database");
  }
  
  return user.id;
}

// Or return both
async function getCurrentUser(): Promise<{ username: string; userId: string }> {
  // ...
  return { username, userId: user.id };
}
```

**Impact:** High - Eliminates ~60-75 lines, centralizes authentication logic

---

### 1.4 Service Layer - SESSION FETCHING PATTERN (Priority: MEDIUM)

**Files Affected:**
- `/home/user/SideShelf/src/services/ProgressService.ts`
- `/home/user/SideShelf/src/services/PlayerBackgroundService.ts`

**Duplication Pattern: Session Retrieval with Logging**

```typescript
// Repeated ~10 times
const session = await progressService.getCurrentSession(userId, libraryItemId);
if (session) {
    log.info(`...action... session=${session.sessionId} item=${libraryItemId}`);
}
```

**Lines:** PlayerBackgroundService:132-136, 169-174, 214-219, 275-280, 326-331, 375-380, etc.  
**Repetitions:** 10+ times  
**Suggested Refactoring:** Create helper that combines session fetch with logging  
**Impact:** Medium - Reduces boilerplate, ensures consistent logging

---

### 1.5 Service Layer - LOGGING PATTERNS (Priority: LOW)

**Pattern:** All services use similar logging patterns with `formatTime()`

```typescript
// Repeated throughout services
log.info(`Position: ${formatTime(position)}s`);
log.info(`Session ${sessionId} at position ${formatTime(currentTime)}s`);
```

**Files:** PlayerService (106 log calls), ProgressService (82 log calls), PlayerBackgroundService (62 log calls), DownloadService (52 log calls)  
**Impact:** Low - Already fairly DRY, but could standardize log message formats

---

## 2. Within-File Duplication

### 2.1 PlayerService - TRACK BUILDING (Priority: MEDIUM)

**File:** `/home/user/SideShelf/src/services/PlayerService.ts`

**Pattern: Repeated Position Validation Logic**

```typescript
// Lines 328-346 in playTrack()
const resumeInfo = await this.determineResumePosition(libraryItemId);
if (resumeInfo.authoritativePosition !== null && 
    resumeInfo.asyncStoragePosition !== resumeInfo.authoritativePosition) {
    await saveItem(ASYNC_KEYS.position, resumeInfo.authoritativePosition);
    log.info(`Synced AsyncStorage position...`);
}

if (resumeInfo.position > 0) {
    store.updatePosition(resumeInfo.position);
    await TrackPlayer.seekTo(resumeInfo.position);
    log.info(`Resuming playback from ${resumeInfo.source}...`);
}

// Lines 525-552 in reloadTrackPlayerQueue() - NEARLY IDENTICAL
const resumeInfo = await this.determineResumePosition(track.libraryItemId);
if (resumeInfo.authoritativePosition !== null && 
    resumeInfo.asyncStoragePosition !== resumeInfo.authoritativePosition) {
    await saveItem(ASYNC_KEYS.position, resumeInfo.authoritativePosition);
    log.info(`Synced AsyncStorage position...`);
}

if (resumeInfo.position > 0) {
    await TrackPlayer.seekTo(resumeInfo.position);
    const updatedStore = useAppStore.getState();
    updatedStore.updatePosition(resumeInfo.position);
    log.info(`Prepared resume position from ${resumeInfo.source}...`);
    // ...
}
```

**Lines:** 328-346, 525-552  
**Repetitions:** 2 times (40+ lines duplicated)  
**Suggested Refactoring:** Extract to `applyResumePosition(resumeInfo, updateStore)` method  
**Impact:** Medium - Eliminates ~40 lines, ensures consistency

---

**Pattern: Playback Settings Application**

```typescript
// Lines 349-360 in playTrack()
const currentPlaybackRate = store.player.playbackRate;
const currentVolume = store.player.volume;

if (currentPlaybackRate !== 1.0) {
    await TrackPlayer.setRate(currentPlaybackRate);
    log.info(`Applied playback rate from store: ${currentPlaybackRate}`);
}

if (currentVolume !== 1.0) {
    await TrackPlayer.setVolume(currentVolume);
    log.info(`Applied volume from store: ${currentVolume}`);
}

// Lines 554-563 in reloadTrackPlayerQueue() - NEARLY IDENTICAL
const updatedStore = useAppStore.getState();
if (updatedStore.player.playbackRate !== 1.0) {
    await TrackPlayer.setRate(updatedStore.player.playbackRate);
    log.info(`Applied stored playback rate: ${updatedStore.player.playbackRate}`);
}

if (updatedStore.player.volume !== 1.0) {
    await TrackPlayer.setVolume(updatedStore.player.volume);
    log.info(`Applied stored volume: ${updatedStore.player.volume}`);
}
```

**Lines:** 349-360, 554-563  
**Repetitions:** 2 times  
**Suggested Refactoring:** Extract to `applyPlaybackSettings()` method  
**Impact:** Low-Medium - Eliminates ~20 lines

---

### 2.2 ProgressService - SESSION VALIDATION (Priority: MEDIUM)

**File:** `/home/user/SideShelf/src/services/ProgressService.ts`

**Pattern: Stale Session Checking**

```typescript
// Lines 163-164
const sessionAge = Date.now() - session.updatedAt.getTime();
const isStale = sessionAge > this.PAUSE_TIMEOUT;

// Lines 319-320 - IDENTICAL
const sessionAge = Date.now() - existingSession.updatedAt.getTime();
const isStale = sessionAge > 10 * 60 * 1000; // 10 minutes

// Lines 513-514 - IDENTICAL
const sessionAge = Date.now() - session.updatedAt.getTime();
const isStale = sessionAge > this.PAUSE_TIMEOUT;
```

**Repetitions:** 3 times  
**Suggested Refactoring:** Extract to `isSessionStale(session, timeoutMs)` helper  
**Impact:** Low - Simple but repeated

---

**Pattern: User/Library Item Validation**

```typescript
// Repeated throughout ProgressService
if (!userId || !libraryItemId) {
    log.info('Missing userId or libraryItemId');
    return;
}

const session = await getActiveSession(userId, libraryItemId);
if (!session) {
    log.info('No active session found');
    return;
}
```

**Repetitions:** 5+ times  
**Suggested Refactoring:** Create `validateAndGetSession(userId, libraryItemId)` helper  
**Impact:** Medium - Reduces duplication and ensures consistent validation

---

### 2.3 DownloadService - PROGRESS UPDATE PATTERN (Priority: LOW)

**File:** `/home/user/SideShelf/src/services/DownloadService.ts`

**Pattern: Download Info Retrieval and Update**

```typescript
// Similar pattern repeated in pauseDownload, resumeDownload, cancelDownload
const downloadInfo = this.activeDownloads.get(libraryItemId);
if (downloadInfo) {
    downloadInfo.tasks.forEach((taskInfo) => {
        taskInfo.task.pause();  // or resume() or stop()
    });
    // ... update state
}
```

**Lines:** 323-334, 340-351, 357-369  
**Repetitions:** 3 times  
**Suggested Refactoring:** Extract to `withDownloadInfo(libraryItemId, action)` helper  
**Impact:** Low - Minor cleanup

---

## 3. Database Query Duplication

### 3.1 Repeated Subqueries (Priority: MEDIUM)

**Files Affected:**
- `/home/user/SideShelf/src/db/helpers/libraryItems.ts`

**Pattern: Narrator and Series Aggregation Subqueries**

```typescript
// Lines 206-214 in getLibraryItemsByAuthor()
const narratorsSubquery = db
    .select({
        mediaId: mediaNarrators.mediaId,
        narratorNames: sql<string | null>`GROUP_CONCAT(${mediaNarrators.narratorName}, ', ')`.as('narrator_names'),
    })
    .from(mediaNarrators)
    .groupBy(mediaNarrators.mediaId)
    .as('narrators_agg');

const seriesSubquery = db
    .select({
        mediaId: mediaSeries.mediaId,
        seriesNames: sql<string | null>`GROUP_CONCAT(${series.name}, ', ')`.as('series_names'),
    })
    .from(mediaSeries)
    .leftJoin(series, eq(mediaSeries.seriesId, series.id))
    .groupBy(mediaSeries.mediaId)
    .as('series_agg');

// Lines 300-318 in getLibraryItemsForList() - EXACT DUPLICATE
// (Same subqueries repeated)
```

**Lines:** 206-224, 300-318 (and likely more)  
**Repetitions:** 2+ times  
**Suggested Refactoring:** Extract to reusable query builders:
```typescript
function createNarratorsSubquery() { /* ... */ }
function createSeriesSubquery() { /* ... */ }
```
**Impact:** Medium - Ensures consistency across queries

---

## 4. Recommended Refactoring Priorities

### Priority 1: HIGH IMPACT
1. **Store Slice Factory Functions** (Eliminates ~300-400 lines)
   - `createSliceInitializer()`
   - `createStoragePersistence()`
   - `createLoadingStateManager()`

2. **User Authentication Helper** (Eliminates ~60-75 lines)
   - `getCurrentUserId()` / `getCurrentUser()`

3. **Database Upsert Helpers** (Improves consistency)
   - `createUpsertHelpers<T>(table, updateFields)`

### Priority 2: MEDIUM IMPACT
1. **PlayerService Position Management** (Eliminates ~60 lines)
   - `applyResumePosition()`
   - `applyPlaybackSettings()`

2. **Session Validation Helpers** (Improves consistency)
   - `validateAndGetSession()`
   - `isSessionStale()`

3. **Database Query Builders** (Ensures consistency)
   - `createNarratorsSubquery()`
   - `createSeriesSubquery()`

### Priority 3: LOW IMPACT
1. **Minor Service Helpers**
   - Logging standardization
   - Download info retrieval patterns

---

## 5. Estimated Benefits

### Code Reduction
- **Total Duplicated Lines:** ~800-1000 lines
- **Potential Reduction:** ~30-40% of duplicated code
- **Net Benefit:** ~300-400 fewer lines to maintain

### Maintainability
- **Consistency:** Centralized logic easier to update
- **Bug Reduction:** Single source of truth for common patterns
- **Testing:** Shared utilities can be unit tested once

### Developer Experience
- **Onboarding:** Easier to understand common patterns
- **Feature Development:** Less boilerplate when adding new slices/helpers
- **Code Review:** Faster reviews with less repetitive code

---

## 6. Implementation Recommendations

### Phase 1: Critical Refactoring (Week 1-2)
1. Create `/src/lib/storeHelpers/` for slice factories
2. Create `/src/lib/authHelpers.ts` for user authentication
3. Refactor one slice (e.g., authorsSlice) as proof of concept
4. Add comprehensive tests for new utilities

### Phase 2: Service Layer (Week 3-4)
1. Extract PlayerService position management
2. Create ProgressService validation helpers
3. Add integration tests

### Phase 3: Database Layer (Week 5-6)
1. Create generic database helpers
2. Extract query builders
3. Ensure backward compatibility

### Testing Strategy
- Unit test all new utilities
- Integration test refactored slices
- Regression test critical paths (playback, downloads, sync)

---

## Appendix: File-by-File Summary

### Services
| File | Lines | Duplication Type | Severity |
|------|-------|-----------------|----------|
| PlayerService.ts | 1453 | Position validation, user fetching | HIGH |
| ProgressService.ts | 1111 | Session validation, user fetching | HIGH |
| PlayerBackgroundService.ts | 945 | User/session fetching | MEDIUM |
| DownloadService.ts | 972 | Download info patterns | LOW |

### Store Slices
| File | Lines | Duplication Type | Severity |
|------|-------|-----------------|----------|
| librarySlice.ts | 726 | Init, loading, storage, sort | HIGH |
| authorsSlice.ts | 391 | Init, loading, storage, sort | HIGH |
| seriesSlice.ts | 303 | Init, loading, storage, sort | HIGH |
| homeSlice.ts | 298 | Init, loading, caching | MEDIUM |

### Database Helpers
| File | Lines | Duplication Type | Severity |
|------|-------|-----------------|----------|
| libraryItems.ts | ~500 | Upsert, getById, queries | MEDIUM |
| authors.ts | ~200 | Upsert, getById, transform | MEDIUM |
| series.ts | ~200 | Upsert, getById, transform | MEDIUM |

---

**End of Report**
