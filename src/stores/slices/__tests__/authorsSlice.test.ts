/**
 * Tests for authors slice
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { DEFAULT_AUTHOR_SORT_CONFIG, STORAGE_KEYS } from "../../utils";
import { createAuthorsSlice, AuthorsSlice } from "../authorsSlice";

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock database helpers
jest.mock("@/db/helpers/authors", () => ({
  getAllAuthors: jest.fn(),
  transformAuthorsToDisplayFormat: jest.fn(),
}));

// Mock author images
jest.mock("@/lib/authorImages", () => ({
  cacheAuthorImageIfMissing: jest.fn(),
}));

describe("AuthorsSlice", () => {
  let store: UseBoundStore<StoreApi<AuthorsSlice>>;

  // Get mocked functions for type safety
  const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
  const { getAllAuthors, transformAuthorsToDisplayFormat } = require("@/db/helpers/authors");
  const { cacheAuthorImageIfMissing } = require("@/lib/authorImages");

  // Mock author data
  const mockAuthors = [
    { id: "author-1", name: "Author One", imageUrl: "http://example.com/author1.jpg" },
    { id: "author-2", name: "Author Two", imageUrl: null },
    { id: "author-3", name: "Another Author", imageUrl: "http://example.com/author3.jpg" },
  ];

  const mockDisplayAuthors = [
    {
      id: "author-1",
      name: "Author One",
      imageUrl: "http://example.com/author1.jpg",
      cachedImageUri: null,
      numBooks: 5,
    },
    {
      id: "author-2",
      name: "Author Two",
      imageUrl: null,
      cachedImageUri: null,
      numBooks: 3,
    },
    {
      id: "author-3",
      name: "Another Author",
      imageUrl: "http://example.com/author3.jpg",
      cachedImageUri: null,
      numBooks: 8,
    },
  ];

  beforeEach(() => {
    // Create a test store
    store = create<AuthorsSlice>()((set, get) => ({
      ...createAuthorsSlice(set, get),
    }));

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock implementations
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedAsyncStorage.setItem.mockResolvedValue();
    getAllAuthors.mockResolvedValue([]);
    transformAuthorsToDisplayFormat.mockReturnValue([]);
    cacheAuthorImageIfMissing.mockResolvedValue({ uri: "", wasDownloaded: false });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Initial State", () => {
    it("should have correct initial state", () => {
      const state = store.getState();

      expect(state.authors).toEqual({
        authors: [],
        rawItems: [],
        items: [],
        sortConfig: DEFAULT_AUTHOR_SORT_CONFIG,
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

  describe("initializeAuthors", () => {
    it("should skip initialization if already initialized", async () => {
      // First initialization
      getAllAuthors.mockResolvedValue(mockAuthors);
      transformAuthorsToDisplayFormat.mockReturnValue(mockDisplayAuthors);
      await store.getState().initializeAuthors(true, true);

      jest.clearAllMocks();

      // Second initialization
      await store.getState().initializeAuthors(true, true);

      expect(getAllAuthors).not.toHaveBeenCalled();
    });

    it("should load settings from storage before fetching data", async () => {
      const sortConfig = { field: "name" as const, direction: "desc" as const };
      mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify(sortConfig));

      getAllAuthors.mockResolvedValue(mockAuthors);
      transformAuthorsToDisplayFormat.mockReturnValue(mockDisplayAuthors);

      await store.getState().initializeAuthors(true, true);

      const state = store.getState();
      expect(state.authors.sortConfig).toEqual(sortConfig);
    });

    it("should set ready state based on API and DB initialization", async () => {
      await store.getState().initializeAuthors(true, true);
      expect(store.getState().authors.ready).toBe(true);

      store.getState().resetAuthors();
      await store.getState().initializeAuthors(false, true);
      expect(store.getState().authors.ready).toBe(false);

      store.getState().resetAuthors();
      await store.getState().initializeAuthors(true, false);
      expect(store.getState().authors.ready).toBe(false);
    });

    it("should fetch authors when API and DB are ready", async () => {
      getAllAuthors.mockResolvedValue(mockAuthors);
      transformAuthorsToDisplayFormat.mockReturnValue(mockDisplayAuthors);

      await store.getState().initializeAuthors(true, true);

      expect(getAllAuthors).toHaveBeenCalled();
      const state = store.getState();
      expect(state.authors.authors).toEqual(mockAuthors);
    });

    it("should not fetch authors when not ready", async () => {
      await store.getState().initializeAuthors(false, false);

      expect(getAllAuthors).not.toHaveBeenCalled();
    });

    it("should set initialized to true after completion", async () => {
      getAllAuthors.mockResolvedValue(mockAuthors);
      transformAuthorsToDisplayFormat.mockReturnValue(mockDisplayAuthors);

      await store.getState().initializeAuthors(true, true);

      const state = store.getState();
      expect(state.authors.initialized).toBe(true);
      expect(state.authors.loading.isInitializing).toBe(false);
    });

    it("should handle initialization errors gracefully", async () => {
      getAllAuthors.mockRejectedValue(new Error("Database error"));

      await store.getState().initializeAuthors(true, true);

      const state = store.getState();
      expect(state.authors.loading.isInitializing).toBe(false);
    });
  });

  describe("refetchAuthors", () => {
    beforeEach(async () => {
      // Initialize the slice
      await store.getState().initializeAuthors(true, true);
      jest.clearAllMocks();
    });

    it("should fetch authors from database", async () => {
      getAllAuthors.mockResolvedValue(mockAuthors);
      transformAuthorsToDisplayFormat.mockReturnValue(mockDisplayAuthors);

      const result = await store.getState().refetchAuthors();

      expect(getAllAuthors).toHaveBeenCalled();
      expect(result).toEqual(mockAuthors);
      expect(store.getState().authors.authors).toEqual(mockAuthors);
    });

    it("should set loading state during fetch", async () => {
      let loadingDuringFetch: boolean | undefined;

      getAllAuthors.mockImplementation(async () => {
        loadingDuringFetch = store.getState().authors.loading.isLoadingItems;
        return mockAuthors;
      });

      transformAuthorsToDisplayFormat.mockReturnValue(mockDisplayAuthors);

      await store.getState().refetchAuthors();

      expect(loadingDuringFetch).toBe(true);
      expect(store.getState().authors.loading.isLoadingItems).toBe(false);
    });

    it("should transform and sort authors", async () => {
      getAllAuthors.mockResolvedValue(mockAuthors);
      transformAuthorsToDisplayFormat.mockReturnValue(mockDisplayAuthors);

      await store.getState().refetchAuthors();

      expect(transformAuthorsToDisplayFormat).toHaveBeenCalledWith(mockAuthors);
      const state = store.getState();
      expect(state.authors.rawItems).toEqual(mockDisplayAuthors);
      expect(state.authors.items.length).toBeGreaterThan(0);
    });

    it("should cache author images for authors without cached images", async () => {
      getAllAuthors.mockResolvedValue(mockAuthors);
      transformAuthorsToDisplayFormat.mockReturnValue(mockDisplayAuthors);
      cacheAuthorImageIfMissing.mockResolvedValue({
        uri: "file:///cached-image.jpg",
        wasDownloaded: true,
      });

      await store.getState().refetchAuthors();

      expect(cacheAuthorImageIfMissing).toHaveBeenCalledTimes(3); // All 3 authors need caching
    });

    it("should skip caching for authors with cached images", async () => {
      const authorsWithCache = mockDisplayAuthors.map((author) => ({
        ...author,
        cachedImageUri: "file:///cached.jpg",
      }));

      getAllAuthors.mockResolvedValue(mockAuthors);
      transformAuthorsToDisplayFormat.mockReturnValue(authorsWithCache);

      await store.getState().refetchAuthors();

      expect(cacheAuthorImageIfMissing).not.toHaveBeenCalled();
    });

    it("should update display items with cached image URIs", async () => {
      getAllAuthors.mockResolvedValue(mockAuthors);
      transformAuthorsToDisplayFormat.mockReturnValue(mockDisplayAuthors);
      cacheAuthorImageIfMissing.mockResolvedValue({
        uri: "file:///cached-image.jpg",
        wasDownloaded: true,
      });

      await store.getState().refetchAuthors();

      const state = store.getState();
      const authorsWithImages = state.authors.rawItems.filter((item) => item.cachedImageUri);
      expect(authorsWithImages.length).toBeGreaterThan(0);
    });

    it("should handle caching errors gracefully", async () => {
      getAllAuthors.mockResolvedValue(mockAuthors);
      transformAuthorsToDisplayFormat.mockReturnValue(mockDisplayAuthors);
      cacheAuthorImageIfMissing.mockRejectedValue(new Error("Image cache error"));

      await expect(store.getState().refetchAuthors()).resolves.not.toThrow();
    });

    it("should not set cachedImageUri when image download fails (offline scenario)", async () => {
      getAllAuthors.mockResolvedValue(mockAuthors);
      // Create fresh mock data without cached images
      const freshDisplayAuthors = mockDisplayAuthors.map((author) => ({
        ...author,
        cachedImageUri: null,
      }));
      transformAuthorsToDisplayFormat.mockReturnValue(freshDisplayAuthors);
      // Simulate offline failure - empty URI returned
      cacheAuthorImageIfMissing.mockResolvedValue({
        uri: "",
        wasDownloaded: false,
      });

      await store.getState().refetchAuthors();

      const state = store.getState();
      // cachedImageUri should remain null when download fails
      state.authors.items.forEach((author) => {
        expect(author.cachedImageUri).toBeNull();
      });
    });

    it("should return empty array when not ready", async () => {
      // Reset to not ready
      store.getState().resetAuthors();

      const result = await store.getState().refetchAuthors();

      expect(result).toEqual([]);
      expect(getAllAuthors).not.toHaveBeenCalled();
    });

    it("should return empty array on database error", async () => {
      getAllAuthors.mockRejectedValue(new Error("Database error"));

      const result = await store.getState().refetchAuthors();

      expect(result).toEqual([]);
    });
  });

  describe("setAuthorsSortConfig", () => {
    beforeEach(async () => {
      // Initialize with some data
      getAllAuthors.mockResolvedValue(mockAuthors);
      transformAuthorsToDisplayFormat.mockReturnValue(mockDisplayAuthors);
      await store.getState().initializeAuthors(true, true);
      jest.clearAllMocks();
    });

    it("should update sort config and re-sort items", async () => {
      const newSortConfig = { field: "name" as const, direction: "desc" as const };

      await store.getState().setAuthorsSortConfig(newSortConfig);

      const state = store.getState();
      expect(state.authors.sortConfig).toEqual(newSortConfig);
    });

    it("should persist sort config to AsyncStorage", async () => {
      const newSortConfig = { field: "name" as const, direction: "asc" as const };

      await store.getState().setAuthorsSortConfig(newSortConfig);

      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        `${STORAGE_KEYS.sortConfig}_authors`,
        JSON.stringify(newSortConfig)
      );
    });

    it("should handle storage errors gracefully", async () => {
      mockedAsyncStorage.setItem.mockRejectedValue(new Error("Storage error"));
      const newSortConfig = { field: "numBooks" as const, direction: "desc" as const };

      await expect(store.getState().setAuthorsSortConfig(newSortConfig)).resolves.not.toThrow();

      // Sort config should still be updated in state
      expect(store.getState().authors.sortConfig).toEqual(newSortConfig);
    });

    it("should re-sort existing items with new config", async () => {
      const initialItems = store.getState().authors.items;
      const newSortConfig = { field: "name" as const, direction: "desc" as const };

      await store.getState().setAuthorsSortConfig(newSortConfig);

      const newItems = store.getState().authors.items;
      // Items should be re-sorted (may be in different order)
      expect(newItems.length).toBe(initialItems.length);
    });
  });

  describe("resetAuthors", () => {
    it("should reset slice to initial state", async () => {
      // Initialize and modify state
      getAllAuthors.mockResolvedValue(mockAuthors);
      transformAuthorsToDisplayFormat.mockReturnValue(mockDisplayAuthors);
      await store.getState().initializeAuthors(true, true);
      await store.getState().setAuthorsSortConfig({ field: "name", direction: "desc" });

      // Reset
      store.getState().resetAuthors();

      const state = store.getState();
      expect(state.authors.authors).toEqual([]);
      expect(state.authors.rawItems).toEqual([]);
      expect(state.authors.items).toEqual([]);
      expect(state.authors.initialized).toBe(false);
      expect(state.authors.ready).toBe(false);
      expect(state.authors.sortConfig).toEqual(DEFAULT_AUTHOR_SORT_CONFIG);
    });
  });

  describe("_setAuthorsReady", () => {
    it("should set ready to true when both API and DB are initialized", () => {
      store.getState()._setAuthorsReady(true, true);
      expect(store.getState().authors.ready).toBe(true);
    });

    it("should set ready to false when API is not initialized", () => {
      store.getState()._setAuthorsReady(false, true);
      expect(store.getState().authors.ready).toBe(false);
    });

    it("should set ready to false when DB is not initialized", () => {
      store.getState()._setAuthorsReady(true, false);
      expect(store.getState().authors.ready).toBe(false);
    });

    it("should set ready to false when both are not initialized", () => {
      store.getState()._setAuthorsReady(false, false);
      expect(store.getState().authors.ready).toBe(false);
    });
  });

  describe("_loadAuthorsSettingsFromStorage", () => {
    it("should load sort config from storage", async () => {
      const sortConfig = { field: "name" as const, direction: "desc" as const };
      mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify(sortConfig));

      await store.getState()._loadAuthorsSettingsFromStorage();

      const state = store.getState();
      expect(state.authors.sortConfig).toEqual(sortConfig);
    });

    it("should handle missing storage data", async () => {
      mockedAsyncStorage.getItem.mockResolvedValue(null);

      await expect(store.getState()._loadAuthorsSettingsFromStorage()).resolves.not.toThrow();

      const state = store.getState();
      expect(state.authors.sortConfig).toEqual(DEFAULT_AUTHOR_SORT_CONFIG);
    });

    it("should handle invalid JSON in storage", async () => {
      mockedAsyncStorage.getItem.mockResolvedValue("invalid json{");

      await expect(store.getState()._loadAuthorsSettingsFromStorage()).resolves.not.toThrow();

      const state = store.getState();
      expect(state.authors.sortConfig).toEqual(DEFAULT_AUTHOR_SORT_CONFIG);
    });

    it("should handle storage errors", async () => {
      mockedAsyncStorage.getItem.mockRejectedValue(new Error("Storage error"));

      await expect(store.getState()._loadAuthorsSettingsFromStorage()).resolves.not.toThrow();
    });
  });
});
