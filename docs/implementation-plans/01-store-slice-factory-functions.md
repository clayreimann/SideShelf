# Implementation Plan: Store Slice Factory Functions

**Priority:** P1 | **Risk:** Low | **Effort:** 2-3 days | **Impact:** Eliminates 300-400 lines

---

## Problem

Four store slices (library, authors, series, home) have 70-80% identical code:
- Initialization logic repeated 4 times (~150 lines)
- Loading state management repeated 20+ times
- AsyncStorage persistence repeated 3 times (~100 lines)
- Sort configuration repeated 3 times (~50 lines)

---

## Solution

Create reusable factory functions in `src/lib/storeHelpers/`:

**1. createSliceInitializer(config)**
- Handles: ready state, settings loading, data fetching
- Reduces: ~150 lines across 4 slices

**2. createLoadingStateUpdater(sliceName)**
- Handles: loading state updates with consistent patterns
- Reduces: Boilerplate in 20+ locations

**3. createStoragePersistence(config)**
- Handles: AsyncStorage save/load with error handling
- Reduces: ~100 lines across 3 slices

**4. createSortConfigManager(config)**
- Handles: sort config updates and persistence
- Reduces: ~50 lines across 3 slices

---

## Implementation Steps

### Step 1: Create Directory
```bash
mkdir -p src/lib/storeHelpers
```

### Step 2: Implement Factories

**src/lib/storeHelpers/sliceInitializer.ts**
```typescript
export function createSliceInitializer<T extends string>(config: {
  sliceName: T;
  logPrefix: string;
  refetchFunction: () => Promise<void>;
  loadSettingsFunction: () => Promise<void>;
  setReadyFunction: (api: boolean, db: boolean) => void;
}) {
  return async (get, set, apiConfigured, dbInitialized) => {
    // Check if initialized, set loading state, load settings,
    // set ready, fetch data if ready, mark initialized
  };
}
```

**src/lib/storeHelpers/storagePersistence.ts**
```typescript
export function createStoragePersistence<T>(config: {
  sliceName: string;
  storageKeys: Record<string, string>;
  parseHandlers: Record<string, (value: string) => any>;
}) {
  return {
    loadFromStorage: async (set) => { /* ... */ },
    saveToStorage: async (key, value) => { /* ... */ },
  };
}
```

### Step 3: Refactor Authors Slice (Proof of Concept)

**Before (391 lines):**
```typescript
initializeAuthors: async (apiConfigured, dbInitialized) => {
  const state = get();
  if (state.authors.initialized) return;
  // ... 89 lines of initialization logic
}
```

**After (~250 lines):**
```typescript
initializeAuthors: async (apiConfigured, dbInitialized) => {
  const initializer = createSliceInitializer({
    sliceName: 'authors',
    logPrefix: 'AuthorsSlice',
    refetchFunction: get().refetchAuthors,
    loadSettingsFunction: get()._loadAuthorsSettingsFromStorage,
    setReadyFunction: get()._setAuthorsReady,
  });
  await initializer(get, set, apiConfigured, dbInitialized);
}
```

### Step 4: Apply to Remaining Slices

Repeat pattern for librarySlice, seriesSlice, homeSlice

---

## Testing

### Unit Tests
```typescript
describe('createSliceInitializer', () => {
  it('should skip if already initialized');
  it('should initialize when not initialized');
  it('should not refetch when API/DB not ready');
  it('should handle errors');
});
```

### Integration Tests
Test each refactored slice:
- Initialization flow
- Settings persistence
- Sort configuration
- Loading states

---

## Migration Checklist

**Week 1:**
- [ ] Day 1-2: Create factory functions with tests
- [ ] Day 3: Refactor authorsSlice as proof of concept
- [ ] Day 4: Refactor seriesSlice
- [ ] Day 5: Refactor librarySlice

**Week 2:**
- [ ] Day 1: Refactor homeSlice
- [ ] Day 2: Final testing and deployment

---

## Success Metrics

- [ ] Line count reduced by 300-400 lines
- [ ] Test coverage 90%+ for factories
- [ ] All existing tests pass
- [ ] Consistent patterns across all slices
- [ ] Easy to add new slices (2-4 hours vs 1-2 days)

---

## Rollback Plan

If issues arise:
1. Revert individual slice (keep factories for future)
2. Fix forward if issue is minor
3. Full rollback via git revert if critical

---

## References

- Current: `src/stores/slices/authorsSlice.ts` (391 lines)
- Current: `src/stores/slices/librarySlice.ts` (726 lines)
- Similar: `src/stores/slices/seriesSlice.ts` (303 lines)
