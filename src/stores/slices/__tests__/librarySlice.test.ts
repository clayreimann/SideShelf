/**
 * Tests for library slice
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
    mockLibrariesResponse,
    mockLibraryRow,
    mockPodcastLibraryRow
} from '../../../__tests__/fixtures';
import { createTestDb, TestDatabase } from '../../../__tests__/utils/testDb';
import { DEFAULT_SORT_CONFIG, STORAGE_KEYS } from '../../utils';
import { createLibrarySlice, LibrarySlice } from '../librarySlice';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock API endpoints
jest.mock('@/lib/api/endpoints', () => ({
  fetchLibraries: jest.fn(),
  fetchLibraryItems: jest.fn(),
}));

// Mock database helpers
jest.mock('@/db/helpers/libraries', () => ({
  getAllLibraries: jest.fn(),
  getLibraryById: jest.fn(),
  marshalLibrariesFromResponse: jest.fn(),
  upsertLibraries: jest.fn(),
}));

jest.mock('@/db/helpers/libraryItems', () => ({
  getLibraryItemsForList: jest.fn(),
  marshalLibraryItemsFromResponse: jest.fn(),
  transformItemsToDisplayFormat: jest.fn(),
  upsertLibraryItems: jest.fn(),
}));

jest.mock('@/db/helpers/mediaMetadata', () => ({
  cacheCoversForLibraryItems: jest.fn(),
  upsertBooksMetadata: jest.fn(),
  upsertPodcastsMetadata: jest.fn(),
}));

describe('LibrarySlice', () => {
  let testDb: TestDatabase;
  let store: ReturnType<typeof create<LibrarySlice>>;

  // Get mocked functions for type safety
  const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
  const { fetchLibraries, fetchLibraryItems } = require('@/lib/api/endpoints');
  const {
    getAllLibraries,
    getLibraryById,
    marshalLibrariesFromResponse,
    upsertLibraries,
  } = require('@/db/helpers/libraries');
  const {
    getLibraryItemsForList,
    marshalLibraryItemsFromResponse,
    transformItemsToDisplayFormat,
    upsertLibraryItems,
  } = require('@/db/helpers/libraryItems');
  const {
    cacheCoversForLibraryItems,
    upsertBooksMetadata,
    upsertPodcastsMetadata,
  } = require('@/db/helpers/mediaMetadata');

  beforeEach(async () => {
    testDb = await createTestDb();

    // Create a test store
    store = create<LibrarySlice>()((set, get) => ({
      ...createLibrarySlice(set, get),
    }));

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock implementations
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedAsyncStorage.setItem.mockResolvedValue();

    getAllLibraries.mockResolvedValue([]);
    getLibraryById.mockResolvedValue(null);
    marshalLibrariesFromResponse.mockReturnValue([]);
    upsertLibraries.mockResolvedValue();

    getLibraryItemsForList.mockResolvedValue([]);
    transformItemsToDisplayFormat.mockReturnValue([]);
    marshalLibraryItemsFromResponse.mockReturnValue([]);
    upsertLibraryItems.mockResolvedValue();

    cacheCoversForLibraryItems.mockResolvedValue({ downloadedCount: 0, totalCount: 0 });
    upsertBooksMetadata.mockResolvedValue();
    upsertPodcastsMetadata.mockResolvedValue();

    fetchLibraries.mockResolvedValue(mockLibrariesResponse);
    fetchLibraryItems.mockResolvedValue({ results: [] });
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = store.getState();

      expect(state.library).toEqual({
        selectedLibraryId: null,
        selectedLibrary: null,
        libraries: [],
        rawItems: [],
        items: [],
        sortConfig: DEFAULT_SORT_CONFIG,
        loading: {
          isLoadingLibraries: false,
          isLoadingItems: false,
          isSelectingLibrary: false,
          isInitializing: true,
        },
        initialized: false,
        ready: false,
      });
    });
  });

  describe('initializeLibrarySlice', () => {
    it('should initialize slice when not already initialized', async () => {
      // Mock storage data
      mockedAsyncStorage.getItem
        .mockResolvedValueOnce('lib-1') // selectedLibraryId
        .mockResolvedValueOnce(JSON.stringify({ field: 'author', direction: 'asc' })); // sortConfig

      // Mock database data
      getAllLibraries.mockResolvedValue([mockLibraryRow, mockPodcastLibraryRow]);
      getLibraryItemsForList.mockResolvedValue([]);
      transformItemsToDisplayFormat.mockReturnValue([]);

      await store.getState().initializeLibrarySlice(true, true);

      const state = store.getState();
      expect(state.library.initialized).toBe(true);
      expect(state.library.ready).toBe(true);
      expect(state.library.selectedLibraryId).toBe('lib-1');
      expect(state.library.libraries).toEqual([mockLibraryRow, mockPodcastLibraryRow]);
      expect(state.library.sortConfig).toEqual({ field: 'author', direction: 'asc' });
      expect(state.library.loading.isInitializing).toBe(false);
    });

    it('should not reinitialize if already initialized', async () => {
      // Set slice as already initialized
      store.setState(state => ({
        ...state,
        library: { ...state.library, initialized: true }
      }));

      await store.getState().initializeLibrarySlice(true, true);

      // Should not have called storage methods
      expect(mockedAsyncStorage.getItem).not.toHaveBeenCalled();
    });

    it('should handle storage loading errors gracefully', async () => {
      mockedAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      await store.getState().initializeLibrarySlice(true, true);

      const state = store.getState();
      expect(state.library.loading.isInitializing).toBe(false);
      // Should still complete initialization despite storage error
    });

    it('should set ready state based on API and DB status', async () => {
      await store.getState().initializeLibrarySlice(false, true);
      expect(store.getState().library.ready).toBe(false);

      await store.getState().initializeLibrarySlice(true, false);
      expect(store.getState().library.ready).toBe(false);

      await store.getState().initializeLibrarySlice(true, true);
      expect(store.getState().library.ready).toBe(true);
    });
  });

  describe('selectLibrary', () => {
    beforeEach(async () => {
      // Initialize the slice first
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      await store.getState().initializeLibrarySlice(true, true);
    });

    it('should select library from cache when fetchFromApi is false', async () => {
      getLibraryById.mockResolvedValue(mockLibraryRow);
      getLibraryItemsForList.mockResolvedValue([]);
      transformItemsToDisplayFormat.mockReturnValue([]);

      await store.getState().selectLibrary('lib-1', false);

      const state = store.getState();
      expect(state.library.selectedLibraryId).toBe('lib-1');
      expect(state.library.selectedLibrary).toEqual(mockLibraryRow);
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.selectedLibraryId, 'lib-1');
      expect(fetchLibraryItems).not.toHaveBeenCalled();
    });

    it('should fetch from API when fetchFromApi is true', async () => {
      getLibraryById.mockResolvedValue(mockLibraryRow);
      getLibraryItemsForList.mockResolvedValue([]);
      transformItemsToDisplayFormat.mockReturnValue([]);
      fetchLibraryItems.mockResolvedValue({ results: [] });

      await store.getState().selectLibrary('lib-1', true);

      expect(fetchLibraryItems).toHaveBeenCalledWith('lib-1');
    });

    it('should not select library if not ready', async () => {
      // Set slice as not ready
      store.setState(state => ({
        ...state,
        library: { ...state.library, ready: false }
      }));

      await store.getState().selectLibrary('lib-1');

      const state = store.getState();
      expect(state.library.selectedLibraryId).toBeNull();
    });

    it('should not reselect same library unless fetchFromApi is true', async () => {
      // Set library as already selected
      store.setState(state => ({
        ...state,
        library: { ...state.library, selectedLibraryId: 'lib-1' }
      }));

      await store.getState().selectLibrary('lib-1', false);

      expect(getLibraryById).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    beforeEach(async () => {
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      await store.getState().initializeLibrarySlice(true, true);
    });

    it('should refresh libraries and items', async () => {
      // Set a selected library
      store.setState(state => ({
        ...state,
        library: { ...state.library, selectedLibraryId: 'lib-1', selectedLibrary: mockLibraryRow }
      }));

      marshalLibrariesFromResponse.mockReturnValue([mockLibraryRow]);
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      fetchLibraryItems.mockResolvedValue({ results: [] });

      await store.getState().refresh();

      expect(fetchLibraries).toHaveBeenCalled();
      expect(fetchLibraryItems).toHaveBeenCalledWith('lib-1');
    });

    it('should not refresh items if no library is selected', async () => {
      await store.getState().refresh();

      expect(fetchLibraries).toHaveBeenCalled();
      expect(fetchLibraryItems).not.toHaveBeenCalled();
    });

    it('should not refresh if not ready', async () => {
      store.setState(state => ({
        ...state,
        library: { ...state.library, ready: false }
      }));

      await store.getState().refresh();

      expect(fetchLibraries).not.toHaveBeenCalled();
    });
  });

  describe('setSortConfig', () => {
    beforeEach(async () => {
      await store.getState().initializeLibrarySlice(true, true);
    });

    it('should update sort config and persist to storage', async () => {
      const newSortConfig = { field: 'author' as const, direction: 'asc' as const };

      await store.getState().setSortConfig(newSortConfig);

      const state = store.getState();
      expect(state.library.sortConfig).toEqual(newSortConfig);
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.sortConfig,
        JSON.stringify(newSortConfig)
      );
    });

    it('should handle storage errors gracefully', async () => {
      mockedAsyncStorage.setItem.mockRejectedValue(new Error('Storage error'));
      const newSortConfig = { field: 'author' as const, direction: 'asc' as const };

      await expect(store.getState().setSortConfig(newSortConfig)).resolves.not.toThrow();

      const state = store.getState();
      expect(state.library.sortConfig).toEqual(newSortConfig);
    });
  });

  describe('resetLibrary', () => {
    it('should reset library to initial state', async () => {
      // Modify the state first
      store.setState(state => ({
        ...state,
        library: {
          ...state.library,
          selectedLibraryId: 'lib-1',
          libraries: [mockLibraryRow],
          initialized: true,
          ready: true,
        }
      }));

      store.getState().resetLibrary();

      const state = store.getState();
      expect(state.library.selectedLibraryId).toBeNull();
      expect(state.library.libraries).toEqual([]);
      expect(state.library.initialized).toBe(false);
      expect(state.library.ready).toBe(false);
    });
  });

  describe('Loading States', () => {
    beforeEach(async () => {
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      await store.getState().initializeLibrarySlice(true, true);
    });

    it('should set loading states during library selection', async () => {
      let loadingState: boolean | undefined;

      // Mock to capture loading state
      getLibraryById.mockImplementation(async () => {
        loadingState = store.getState().library.loading.isSelectingLibrary;
        return mockLibraryRow;
      });

      await store.getState().selectLibrary('lib-1');

      expect(loadingState).toBe(true);
      expect(store.getState().library.loading.isSelectingLibrary).toBe(false);
    });

    it('should set loading states during refresh', async () => {
      let librariesLoadingState: boolean | undefined;
      let itemsLoadingState: boolean | undefined;

      store.setState(state => ({
        ...state,
        library: { ...state.library, selectedLibraryId: 'lib-1', selectedLibrary: mockLibraryRow }
      }));

      fetchLibraries.mockImplementation(async () => {
        librariesLoadingState = store.getState().library.loading.isLoadingLibraries;
        return mockLibrariesResponse;
      });

      fetchLibraryItems.mockImplementation(async () => {
        itemsLoadingState = store.getState().library.loading.isLoadingItems;
        return { results: [] };
      });

      await store.getState().refresh();

      expect(librariesLoadingState).toBe(true);
      expect(itemsLoadingState).toBe(true);
      expect(store.getState().library.loading.isLoadingLibraries).toBe(false);
      expect(store.getState().library.loading.isLoadingItems).toBe(false);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      await store.getState().initializeLibrarySlice(true, true);
    });

    it('should handle API errors during refresh gracefully', async () => {
      fetchLibraries.mockRejectedValue(new Error('API Error'));
      getAllLibraries.mockResolvedValue([mockLibraryRow]); // Fallback to database

      await expect(store.getState().refresh()).resolves.not.toThrow();

      // Should still have libraries from database fallback
      const state = store.getState();
      expect(state.library.libraries).toEqual([mockLibraryRow]);
    });

    it('should handle database errors during library selection', async () => {
      getLibraryById.mockRejectedValue(new Error('Database Error'));

      await expect(store.getState().selectLibrary('lib-1')).resolves.not.toThrow();

      // Loading state should be reset even after error
      const state = store.getState();
      expect(state.library.loading.isSelectingLibrary).toBe(false);
    });
  });

  describe('Private Methods', () => {
    beforeEach(async () => {
      await store.getState().initializeLibrarySlice(true, true);
    });

    it('should load settings from storage correctly', async () => {
      mockedAsyncStorage.getItem
        .mockResolvedValueOnce('lib-test') // selectedLibraryId
        .mockResolvedValueOnce(JSON.stringify({ field: 'publishedYear', direction: 'desc' })); // sortConfig

      await (store.getState() as any)._loadLibrarySettingsFromStorage();

      const state = store.getState();
      expect(state.library.selectedLibraryId).toBe('lib-test');
      expect(state.library.sortConfig).toEqual({ field: 'publishedYear', direction: 'desc' });
    });

    it('should handle malformed sort config in storage', async () => {
      mockedAsyncStorage.getItem
        .mockResolvedValueOnce(null) // selectedLibraryId
        .mockResolvedValueOnce('invalid json'); // sortConfig

      await (store.getState() as any)._loadLibrarySettingsFromStorage();

      const state = store.getState();
      expect(state.library.sortConfig).toEqual(DEFAULT_SORT_CONFIG); // Should remain unchanged
    });

    it('should set ready state correctly', () => {
      const setReady = (store.getState() as any)._setLibraryReady;

      expect(setReady(true, true)).toBe(true);
      expect(setReady(true, false)).toBe(false);
      expect(setReady(false, true)).toBe(false);
      expect(setReady(false, false)).toBe(false);
    });
  });
});
