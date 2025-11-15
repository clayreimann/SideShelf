# Implementation Plan: Store Slice Factory Functions

**Priority:** P1 - Critical
**Risk Level:** Low
**Estimated Effort:** 2-3 days
**Impact:** Eliminates 300-400 lines of duplicated code

---

## Overview

Create reusable factory functions to eliminate 70-80% code duplication across store slices (librarySlice, authorsSlice, seriesSlice, homeSlice).

**Current State:**
- 4 slices with nearly identical initialization logic (~150 lines duplicated)
- Repeated loading state management (20+ occurrences)
- Duplicated AsyncStorage persistence (~100 lines)
- Repeated sort configuration updates (~50 lines)

**Target State:**
- Centralized factory functions in `/src/lib/storeHelpers/`
- Each slice uses factories for common patterns
- Consistent behavior across all slices
- Easy to add new slices with minimal boilerplate

---

## Step 1: Create Directory Structure

```bash
mkdir -p src/lib/storeHelpers
```

**Files to create:**
- `src/lib/storeHelpers/index.ts` - Main exports
- `src/lib/storeHelpers/sliceInitializer.ts` - Initialization factory
- `src/lib/storeHelpers/loadingStateManager.ts` - Loading state factory
- `src/lib/storeHelpers/storagePersistence.ts` - AsyncStorage factory
- `src/lib/storeHelpers/sortConfigManager.ts` - Sort config factory
- `src/lib/storeHelpers/types.ts` - Shared types

---

## Step 2: Create Type Definitions

**File:** `src/lib/storeHelpers/types.ts`

```typescript
import { StateCreator } from 'zustand';

/**
 * Standard loading states used across all slices
 */
export interface LoadingStates {
  isLoadingLibraries?: boolean;
  isLoadingItems?: boolean;
  isSelectingLibrary?: boolean;
  isInitializing?: boolean;
  [key: string]: boolean | undefined;
}

/**
 * Configuration for slice initialization
 */
export interface SliceInitConfig<T extends string> {
  sliceName: T;
  logPrefix: string;
  refetchFunction: (apiConfigured: boolean, dbInitialized: boolean) => Promise<void>;
  loadSettingsFunction: () => Promise<void>;
  setReadyFunction: (apiConfigured: boolean, dbInitialized: boolean) => void;
}

/**
 * Storage persistence configuration
 */
export interface StoragePersistenceConfig<T> {
  storageKeys: Record<string, string>;
  parseHandlers: Record<string, (value: string) => any>;
  sliceName: string;
}

/**
 * Sort configuration manager config
 */
export interface SortConfigManagerConfig<T, S> {
  sliceName: string;
  storageKey: string;
  sortFunction: (items: T[], config: S) => T[];
}

/**
 * Generic slice state structure
 */
export interface BaseSliceState<T> {
  initialized: boolean;
  ready: boolean;
  loading: LoadingStates;
  items: T[];
  rawItems: T[];
}
```

---

## Step 3: Implement Slice Initializer Factory

**File:** `src/lib/storeHelpers/sliceInitializer.ts`

```typescript
import { logger } from '@/lib/logger';
import { StateCreator } from 'zustand';
import { SliceInitConfig } from './types';

/**
 * Creates a standardized initialization function for a slice
 *
 * @example
 * const initialize = createSliceInitializer({
 *   sliceName: 'authors',
 *   logPrefix: 'AuthorsSlice',
 *   refetchFunction: get().refetchAuthors,
 *   loadSettingsFunction: get()._loadAuthorsSettingsFromStorage,
 *   setReadyFunction: get()._setAuthorsReady
 * });
 */
export function createSliceInitializer<T extends string>(
  config: SliceInitConfig<T>
) {
  const log = logger.child({ module: config.logPrefix });

  return async (
    get: () => any,
    set: (state: any) => void,
    apiConfigured: boolean,
    dbInitialized: boolean
  ): Promise<void> => {
    const state = get();

    // Check if already initialized
    if (state[config.sliceName]?.initialized) {
      log.info('Already initialized, skipping');
      return;
    }

    log.info('Initializing slice', {
      apiConfigured,
      dbInitialized,
    });

    // Set initializing state
    set((state: any) => ({
      ...state,
      [config.sliceName]: {
        ...state[config.sliceName],
        loading: {
          ...state[config.sliceName].loading,
          isInitializing: true,
        },
      },
    }));

    try {
      // Load persisted settings
      await config.loadSettingsFunction();

      // Set ready state
      config.setReadyFunction(apiConfigured, dbInitialized);

      // Fetch data if ready
      if (apiConfigured && dbInitialized) {
        log.info('API and DB ready, fetching data');
        await config.refetchFunction(apiConfigured, dbInitialized);
      } else {
        log.info('Skipping data fetch', {
          apiConfigured,
          dbInitialized,
        });
      }

      // Mark as initialized
      set((state: any) => ({
        ...state,
        [config.sliceName]: {
          ...state[config.sliceName],
          initialized: true,
          loading: {
            ...state[config.sliceName].loading,
            isInitializing: false,
          },
        },
      }));

      log.info('Initialization complete');
    } catch (error) {
      log.error('Failed to initialize slice', { error });

      // Reset initializing state on error
      set((state: any) => ({
        ...state,
        [config.sliceName]: {
          ...state[config.sliceName],
          loading: {
            ...state[config.sliceName].loading,
            isInitializing: false,
          },
        },
      }));

      throw error;
    }
  };
}

/**
 * Creates a standardized ready state setter
 *
 * @example
 * const setReady = createReadyStateSetter('authors', 'AuthorsSlice');
 */
export function createReadyStateSetter(
  sliceName: string,
  logPrefix: string
) {
  const log = logger.child({ module: logPrefix });

  return (
    set: (state: any) => void,
    apiConfigured: boolean,
    dbInitialized: boolean
  ): void => {
    const ready = apiConfigured && dbInitialized;

    log.info('Setting ready state', {
      ready,
      apiConfigured,
      dbInitialized,
    });

    set((state: any) => ({
      ...state,
      [sliceName]: {
        ...state[sliceName],
        ready,
      },
    }));
  };
}
```

---

## Step 4: Implement Loading State Manager

**File:** `src/lib/storeHelpers/loadingStateManager.ts`

```typescript
import { LoadingStates } from './types';

/**
 * Creates a loading state updater for a specific slice
 *
 * @example
 * const updateLoading = createLoadingStateUpdater('authors');
 * updateLoading(set, { isLoadingItems: true });
 */
export function createLoadingStateUpdater(sliceName: string) {
  return (
    set: (state: any) => void,
    updates: Partial<LoadingStates>
  ): void => {
    set((state: any) => ({
      ...state,
      [sliceName]: {
        ...state[sliceName],
        loading: {
          ...state[sliceName].loading,
          ...updates,
        },
      },
    }));
  };
}

/**
 * Creates initial loading states with sensible defaults
 */
export function createInitialLoadingStates(
  customStates: Partial<LoadingStates> = {}
): LoadingStates {
  return {
    isLoadingLibraries: false,
    isLoadingItems: false,
    isSelectingLibrary: false,
    isInitializing: true,
    ...customStates,
  };
}

/**
 * Higher-order function to wrap async operations with loading states
 *
 * @example
 * const withLoading = createLoadingWrapper('authors', 'isLoadingItems');
 * await withLoading(set, async () => {
 *   await fetchItems();
 * });
 */
export function createLoadingWrapper(
  sliceName: string,
  loadingKey: keyof LoadingStates
) {
  const updateLoading = createLoadingStateUpdater(sliceName);

  return async <T>(
    set: (state: any) => void,
    operation: () => Promise<T>
  ): Promise<T> => {
    try {
      updateLoading(set, { [loadingKey]: true });
      const result = await operation();
      return result;
    } finally {
      updateLoading(set, { [loadingKey]: false });
    }
  };
}
```

---

## Step 5: Implement Storage Persistence Factory

**File:** `src/lib/storeHelpers/storagePersistence.ts`

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/lib/logger';
import { StoragePersistenceConfig } from './types';

/**
 * Creates storage persistence functions for a slice
 *
 * @example
 * const { loadFromStorage, saveToStorage } = createStoragePersistence({
 *   sliceName: 'authors',
 *   storageKeys: {
 *     sortConfig: 'authors:sortConfig',
 *   },
 *   parseHandlers: {
 *     sortConfig: (value) => JSON.parse(value) as AuthorsSortConfig,
 *   },
 * });
 */
export function createStoragePersistence<T>(
  config: StoragePersistenceConfig<T>
) {
  const log = logger.child({ module: `${config.sliceName}:storage` });

  /**
   * Load settings from AsyncStorage
   */
  const loadFromStorage = async (
    set: (state: any) => void
  ): Promise<void> => {
    try {
      const updates: Record<string, any> = {};

      // Load all configured keys
      for (const [key, storageKey] of Object.entries(config.storageKeys)) {
        try {
          const stored = await AsyncStorage.getItem(storageKey);

          if (stored) {
            const parseHandler = config.parseHandlers[key];
            if (parseHandler) {
              updates[key] = parseHandler(stored);
              log.debug(`Loaded ${key} from storage`);
            }
          }
        } catch (parseError) {
          log.error(`Failed to parse stored ${key}`, { error: parseError });
        }
      }

      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        set((state: any) => ({
          ...state,
          [config.sliceName]: {
            ...state[config.sliceName],
            ...updates,
          },
        }));

        log.info('Loaded settings from storage', {
          keys: Object.keys(updates),
        });
      }
    } catch (error) {
      log.error('Failed to load from storage', { error });
    }
  };

  /**
   * Save a single value to AsyncStorage
   */
  const saveToStorage = async (
    key: keyof typeof config.storageKeys,
    value: any
  ): Promise<void> => {
    try {
      const storageKey = config.storageKeys[key as string];
      if (!storageKey) {
        log.warn(`No storage key configured for ${String(key)}`);
        return;
      }

      await AsyncStorage.setItem(storageKey, JSON.stringify(value));
      log.debug(`Saved ${String(key)} to storage`);
    } catch (error) {
      log.error(`Failed to save ${String(key)} to storage`, { error });
    }
  };

  /**
   * Clear a value from AsyncStorage
   */
  const clearFromStorage = async (
    key: keyof typeof config.storageKeys
  ): Promise<void> => {
    try {
      const storageKey = config.storageKeys[key as string];
      if (!storageKey) {
        return;
      }

      await AsyncStorage.removeItem(storageKey);
      log.debug(`Cleared ${String(key)} from storage`);
    } catch (error) {
      log.error(`Failed to clear ${String(key)} from storage`, { error });
    }
  };

  return {
    loadFromStorage,
    saveToStorage,
    clearFromStorage,
  };
}
```

---

## Step 6: Implement Sort Config Manager

**File:** `src/lib/storeHelpers/sortConfigManager.ts`

```typescript
import { logger } from '@/lib/logger';
import { SortConfigManagerConfig } from './types';

/**
 * Creates sort configuration management functions
 *
 * @example
 * const sortManager = createSortConfigManager({
 *   sliceName: 'authors',
 *   storageKey: 'authors:sortConfig',
 *   sortFunction: sortAuthors,
 * });
 */
export function createSortConfigManager<T, S>(
  config: SortConfigManagerConfig<T, S>
) {
  const log = logger.child({ module: `${config.sliceName}:sort` });

  /**
   * Update sort configuration and re-sort items
   */
  const setSortConfig = async (
    get: () => any,
    set: (state: any) => void,
    saveToStorage: (key: string, value: S) => Promise<void>,
    newConfig: S
  ): Promise<void> => {
    const state = get();
    const rawItems = state[config.sliceName]?.rawItems || [];

    log.info('Updating sort configuration', { newConfig });

    // Sort items with new config
    const sortedItems = config.sortFunction(rawItems, newConfig);

    // Update state
    set((state: any) => ({
      ...state,
      [config.sliceName]: {
        ...state[config.sliceName],
        sortConfig: newConfig,
        items: sortedItems,
      },
    }));

    // Persist to storage
    try {
      await saveToStorage('sortConfig', newConfig);
      log.debug('Sort config saved to storage');
    } catch (error) {
      log.error('Failed to save sort config', { error });
    }
  };

  /**
   * Re-sort items with current configuration
   */
  const reapplySortConfig = (
    get: () => any,
    set: (state: any) => void
  ): void => {
    const state = get();
    const slice = state[config.sliceName];

    if (!slice) return;

    const { rawItems, sortConfig } = slice;
    if (!rawItems || !sortConfig) return;

    const sortedItems = config.sortFunction(rawItems, sortConfig);

    set((state: any) => ({
      ...state,
      [config.sliceName]: {
        ...state[config.sliceName],
        items: sortedItems,
      },
    }));
  };

  return {
    setSortConfig,
    reapplySortConfig,
  };
}
```

---

## Step 7: Export All Helpers

**File:** `src/lib/storeHelpers/index.ts`

```typescript
export * from './types';
export * from './sliceInitializer';
export * from './loadingStateManager';
export * from './storagePersistence';
export * from './sortConfigManager';

// Re-export commonly used functions for convenience
export {
  createSliceInitializer,
  createReadyStateSetter,
} from './sliceInitializer';

export {
  createLoadingStateUpdater,
  createInitialLoadingStates,
  createLoadingWrapper,
} from './loadingStateManager';

export {
  createStoragePersistence,
} from './storagePersistence';

export {
  createSortConfigManager,
} from './sortConfigManager';
```

---

## Step 8: Refactor Authors Slice (Proof of Concept)

**File:** `src/stores/slices/authorsSlice.ts`

### Before (Current - ~391 lines)

```typescript
// Current implementation with duplication
initializeAuthors: async (apiConfigured: boolean, dbInitialized: boolean) => {
  const state = get();
  if (state.authors.initialized) return;

  log.info('Initializing authors slice...');

  set((state) => ({
    ...state,
    authors: {
      ...state.authors,
      loading: { ...state.authors.loading, isInitializing: true }
    }
  }));

  // ... rest of initialization logic
}
```

### After (Using Factories - ~250 lines)

```typescript
import { create } from 'zustand';
import {
  createSliceInitializer,
  createReadyStateSetter,
  createLoadingStateUpdater,
  createStoragePersistence,
  createSortConfigManager,
  createInitialLoadingStates,
} from '@/lib/storeHelpers';
import { sortAuthors } from '@/lib/utils/sort';
import type { AuthorsSortConfig } from '@/types/sort';

// Storage persistence setup
const storagePersistence = createStoragePersistence({
  sliceName: 'authors',
  storageKeys: {
    sortConfig: STORAGE_KEYS.AUTHORS_SORT_CONFIG,
  },
  parseHandlers: {
    sortConfig: (value) => JSON.parse(value) as AuthorsSortConfig,
  },
});

// Sort config manager
const sortManager = createSortConfigManager({
  sliceName: 'authors',
  storageKey: STORAGE_KEYS.AUTHORS_SORT_CONFIG,
  sortFunction: sortAuthors,
});

// Loading state updater
const updateLoading = createLoadingStateUpdater('authors');

interface AuthorsSliceState {
  authors: {
    initialized: boolean;
    ready: boolean;
    loading: LoadingStates;
    items: AuthorListRow[];
    rawItems: AuthorListRow[];
    sortConfig: AuthorsSortConfig;
  };

  // Public methods
  initializeAuthors: (apiConfigured: boolean, dbInitialized: boolean) => Promise<void>;
  refetchAuthors: () => Promise<void>;
  setAuthorsSortConfig: (config: AuthorsSortConfig) => Promise<void>;

  // Private methods
  _loadAuthorsSettingsFromStorage: () => Promise<void>;
  _setAuthorsReady: (apiConfigured: boolean, dbInitialized: boolean) => void;
}

const INITIAL_STATE = {
  initialized: false,
  ready: false,
  loading: createInitialLoadingStates(),
  items: [],
  rawItems: [],
  sortConfig: {
    sortBy: 'name' as const,
    sortOrder: 'asc' as const,
  },
};

export const createAuthorsSlice: StateCreator<
  AppStore,
  [],
  [],
  AuthorsSliceState
> = (set, get) => ({
  authors: INITIAL_STATE,

  // Initialize using factory
  initializeAuthors: async (apiConfigured: boolean, dbInitialized: boolean) => {
    const initializer = createSliceInitializer({
      sliceName: 'authors',
      logPrefix: 'AuthorsSlice',
      refetchFunction: get().refetchAuthors,
      loadSettingsFunction: get()._loadAuthorsSettingsFromStorage,
      setReadyFunction: get()._setAuthorsReady,
    });

    await initializer(get, set, apiConfigured, dbInitialized);
  },

  // Refetch authors
  refetchAuthors: async () => {
    const state = get();
    if (!state.authors.ready) {
      log.info('Authors slice not ready, skipping refetch');
      return;
    }

    updateLoading(set, { isLoadingItems: true });

    try {
      log.info('Fetching authors from database');

      const authors = await getAllAuthorsForList();
      const sortedAuthors = sortAuthors(authors, state.authors.sortConfig);

      set((state) => ({
        ...state,
        authors: {
          ...state.authors,
          rawItems: authors,
          items: sortedAuthors,
        },
      }));

      log.info('Successfully loaded authors', { count: authors.length });
    } catch (error) {
      log.error('Failed to fetch authors', { error });
      throw error;
    } finally {
      updateLoading(set, { isLoadingItems: false });
    }
  },

  // Set sort config using factory
  setAuthorsSortConfig: async (config: AuthorsSortConfig) => {
    await sortManager.setSortConfig(
      get,
      set,
      storagePersistence.saveToStorage,
      config
    );
  },

  // Load settings using factory
  _loadAuthorsSettingsFromStorage: async () => {
    await storagePersistence.loadFromStorage(set);
  },

  // Set ready state using factory
  _setAuthorsReady: (apiConfigured: boolean, dbInitialized: boolean) => {
    const setReady = createReadyStateSetter('authors', 'AuthorsSlice');
    setReady(set, apiConfigured, dbInitialized);
  },
});
```

**Line Reduction:** ~391 → ~250 lines (~36% reduction)

---

## Step 9: Testing Strategy

### Unit Tests for Factories

**File:** `src/lib/storeHelpers/__tests__/sliceInitializer.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from '@jest/globals';
import { createSliceInitializer, createReadyStateSetter } from '../sliceInitializer';

describe('createSliceInitializer', () => {
  let mockGet: any;
  let mockSet: any;
  let mockRefetch: any;
  let mockLoadSettings: any;
  let mockSetReady: any;

  beforeEach(() => {
    mockGet = vi.fn();
    mockSet = vi.fn();
    mockRefetch = vi.fn().mockResolvedValue(undefined);
    mockLoadSettings = vi.fn().mockResolvedValue(undefined);
    mockSetReady = vi.fn();
  });

  it('should skip initialization if already initialized', async () => {
    mockGet.mockReturnValue({
      authors: { initialized: true },
    });

    const initializer = createSliceInitializer({
      sliceName: 'authors',
      logPrefix: 'AuthorsSlice',
      refetchFunction: mockRefetch,
      loadSettingsFunction: mockLoadSettings,
      setReadyFunction: mockSetReady,
    });

    await initializer(mockGet, mockSet, true, true);

    expect(mockSet).not.toHaveBeenCalled();
    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it('should initialize when not initialized', async () => {
    mockGet.mockReturnValue({
      authors: { initialized: false, loading: {} },
    });

    const initializer = createSliceInitializer({
      sliceName: 'authors',
      logPrefix: 'AuthorsSlice',
      refetchFunction: mockRefetch,
      loadSettingsFunction: mockLoadSettings,
      setReadyFunction: mockSetReady,
    });

    await initializer(mockGet, mockSet, true, true);

    expect(mockSet).toHaveBeenCalled();
    expect(mockLoadSettings).toHaveBeenCalled();
    expect(mockSetReady).toHaveBeenCalledWith(true, true);
    expect(mockRefetch).toHaveBeenCalledWith(true, true);
  });

  it('should not refetch when API or DB not ready', async () => {
    mockGet.mockReturnValue({
      authors: { initialized: false, loading: {} },
    });

    const initializer = createSliceInitializer({
      sliceName: 'authors',
      logPrefix: 'AuthorsSlice',
      refetchFunction: mockRefetch,
      loadSettingsFunction: mockLoadSettings,
      setReadyFunction: mockSetReady,
    });

    await initializer(mockGet, mockSet, false, true);

    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it('should handle initialization errors', async () => {
    mockGet.mockReturnValue({
      authors: { initialized: false, loading: {} },
    });

    const error = new Error('Test error');
    mockLoadSettings.mockRejectedValue(error);

    const initializer = createSliceInitializer({
      sliceName: 'authors',
      logPrefix: 'AuthorsSlice',
      refetchFunction: mockRefetch,
      loadSettingsFunction: mockLoadSettings,
      setReadyFunction: mockSetReady,
    });

    await expect(
      initializer(mockGet, mockSet, true, true)
    ).rejects.toThrow('Test error');

    // Should reset initializing state
    expect(mockSet).toHaveBeenCalledWith(
      expect.any(Function)
    );
  });
});

describe('createReadyStateSetter', () => {
  it('should set ready to true when both configured', () => {
    const mockSet = vi.fn();
    const setReady = createReadyStateSetter('authors', 'AuthorsSlice');

    setReady(mockSet, true, true);

    expect(mockSet).toHaveBeenCalledWith(expect.any(Function));

    const setterFn = mockSet.mock.calls[0][0];
    const newState = setterFn({ authors: {} });

    expect(newState.authors.ready).toBe(true);
  });

  it('should set ready to false when API not configured', () => {
    const mockSet = vi.fn();
    const setReady = createReadyStateSetter('authors', 'AuthorsSlice');

    setReady(mockSet, false, true);

    const setterFn = mockSet.mock.calls[0][0];
    const newState = setterFn({ authors: {} });

    expect(newState.authors.ready).toBe(false);
  });
});
```

### Integration Tests for Refactored Slice

**File:** `src/stores/slices/__tests__/authorsSlice.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from '@jest/globals';
import { createAuthorsSlice } from '../authorsSlice';
import { getAllAuthorsForList } from '@/db/helpers/authors';

vi.mock('@/db/helpers/authors');

describe('AuthorsSlice (Refactored)', () => {
  let store: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a minimal store for testing
    store = {
      authors: createAuthorsSlice(
        (fn: any) => fn(store),
        () => store,
        {} as any
      ).authors,
    };
  });

  it('should initialize successfully', async () => {
    const slice = createAuthorsSlice(
      (fn: any) => fn(store),
      () => store,
      {} as any
    );

    await slice.initializeAuthors(true, true);

    expect(store.authors.initialized).toBe(true);
  });

  it('should refetch authors', async () => {
    const mockAuthors = [
      { id: '1', name: 'Author 1', numBooks: 5 },
      { id: '2', name: 'Author 2', numBooks: 3 },
    ];

    (getAllAuthorsForList as any).mockResolvedValue(mockAuthors);

    const slice = createAuthorsSlice(
      (fn: any) => {
        store = fn(store);
      },
      () => store,
      {} as any
    );

    store.authors.ready = true;
    await slice.refetchAuthors();

    expect(store.authors.items).toHaveLength(2);
    expect(store.authors.rawItems).toEqual(mockAuthors);
  });
});
```

---

## Step 10: Migration Path

### Phase 1: Create Factories (Week 1, Day 1-2)
- [ ] Create `src/lib/storeHelpers/` directory
- [ ] Implement all factory functions
- [ ] Write comprehensive unit tests
- [ ] Ensure all tests pass
- [ ] Code review

### Phase 2: Refactor Authors Slice (Week 1, Day 3)
- [ ] Refactor `authorsSlice.ts` using factories
- [ ] Update tests
- [ ] Verify functionality in dev environment
- [ ] Test all author-related features
- [ ] Code review

### Phase 3: Refactor Series Slice (Week 1, Day 4)
- [ ] Refactor `seriesSlice.ts` using factories
- [ ] Update tests
- [ ] Verify functionality
- [ ] Code review

### Phase 4: Refactor Library Slice (Week 2, Day 1-2)
- [ ] Refactor `librarySlice.ts` using factories
- [ ] Update tests (most complex slice)
- [ ] Verify functionality
- [ ] Code review

### Phase 5: Refactor Home Slice (Week 2, Day 3)
- [ ] Refactor `homeSlice.ts` using factories
- [ ] Update tests
- [ ] Verify functionality
- [ ] Code review

### Phase 6: Final Testing & Deployment (Week 2, Day 4-5)
- [ ] Run full test suite
- [ ] Manual testing of all features
- [ ] Performance testing
- [ ] Update documentation
- [ ] Merge to main branch

---

## Step 11: Rollback Plan

If issues are discovered:

1. **Immediate Rollback:**
   ```bash
   git revert <commit-hash>
   git push
   ```

2. **Partial Rollback:**
   - Revert individual slice refactorings
   - Keep factory functions for future use

3. **Emergency Fix:**
   - Fix forward if issue is minor
   - Add targeted test coverage
   - Deploy hotfix

---

## Step 12: Success Metrics

### Code Quality
- [ ] Line count reduction: 300-400 lines (target: 35-40%)
- [ ] Test coverage: 90%+ for factories
- [ ] Test coverage: 80%+ for refactored slices
- [ ] No increase in cyclomatic complexity

### Functionality
- [ ] All existing tests pass
- [ ] No regressions in manual testing
- [ ] All features work as before

### Performance
- [ ] No degradation in app startup time
- [ ] No degradation in slice initialization time
- [ ] Memory usage unchanged or improved

### Developer Experience
- [ ] Easier to add new slices
- [ ] Consistent patterns across slices
- [ ] Better code documentation

---

## Risks and Mitigation

### Risk 1: Breaking Changes
**Probability:** Low
**Impact:** High
**Mitigation:**
- Comprehensive test coverage
- Incremental refactoring (one slice at a time)
- Thorough manual testing between slices

### Risk 2: Performance Degradation
**Probability:** Very Low
**Impact:** Medium
**Mitigation:**
- Performance benchmarks before/after
- Factory functions are simple wrappers
- No additional async operations

### Risk 3: Type Safety Issues
**Probability:** Low
**Impact:** Medium
**Mitigation:**
- Strong TypeScript typing for all factories
- Compile-time type checking
- Unit tests for type safety

### Risk 4: AsyncStorage Issues
**Probability:** Low
**Impact:** Medium
**Mitigation:**
- Test storage persistence thoroughly
- Handle parse errors gracefully
- Fallback to defaults on errors

---

## Dependencies

**No new dependencies required** - uses existing packages:
- `zustand` (already in use)
- `@react-native-async-storage/async-storage` (already in use)
- `@/lib/logger` (already in use)

---

## Estimated Timeline

| Phase | Duration | Parallel Work Possible |
|-------|----------|----------------------|
| Create Factories | 1-2 days | No |
| Refactor Authors Slice | 0.5 days | No |
| Refactor Series Slice | 0.5 days | After factories |
| Refactor Library Slice | 1 day | After factories |
| Refactor Home Slice | 0.5 days | After factories |
| Testing & QA | 1 day | No |
| **Total** | **4-5 days** | |

---

## Next Steps

1. **Review this plan** with team
2. **Create feature branch:** `feature/store-slice-factories`
3. **Start with Phase 1:** Create factory functions
4. **Submit PR** after each slice refactoring
5. **Merge incrementally** to reduce risk

---

## References

- Current Implementation: `src/stores/slices/authorsSlice.ts`
- Similar Pattern: `src/stores/slices/seriesSlice.ts`
- Zustand Docs: https://docs.pmnd.rs/zustand/getting-started/introduction
- AsyncStorage API: https://react-native-async-storage.github.io/async-storage/
