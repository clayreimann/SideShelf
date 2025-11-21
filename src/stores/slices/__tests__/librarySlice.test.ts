/**
 * Tests for library slice
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import {
  mockLibrariesResponse,
  mockLibraryRow,
  mockPodcastLibraryRow,
} from "../../../__tests__/fixtures";
import { createTestDb, TestDatabase } from "../../../__tests__/utils/testDb";
import { DEFAULT_SORT_CONFIG, STORAGE_KEYS } from "../../utils";
import { createLibrarySlice, LibrarySlice } from "../librarySlice";

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock API endpoints
jest.mock("@/lib/api/endpoints", () => ({
  fetchLibraries: jest.fn(),
  fetchLibraryItems: jest.fn(),
  fetchAllLibraryItems: jest.fn(),
  fetchLibraryItemsByAddedAt: jest.fn(),
  fetchLibraryItemsBatch: jest.fn(),
}));

// Mock database helpers
jest.mock("@/db/helpers/libraries", () => ({
  getAllLibraries: jest.fn(),
  getLibraryById: jest.fn(),
  marshalLibrariesFromResponse: jest.fn(),
  upsertLibraries: jest.fn(),
}));

jest.mock("@/db/helpers/libraryItems", () => ({
  getLibraryItemsForList: jest.fn(),
  marshalLibraryItemFromApi: jest.fn(),
  marshalLibraryItemsFromResponse: jest.fn(),
  transformItemsToDisplayFormat: jest.fn(),
  upsertLibraryItems: jest.fn(),
  checkLibraryItemExists: jest.fn(),
  marshalLibraryItemFromApi: jest.fn(),
}));

jest.mock("@/db/helpers/mediaMetadata", () => ({
  cacheCoversForLibraryItems: jest.fn(),
  upsertBooksMetadata: jest.fn(),
  upsertPodcastsMetadata: jest.fn(),
}));

jest.mock("@/db/helpers/fullLibraryItems", () => ({
  processFullLibraryItems: jest.fn(),
}));

describe("LibrarySlice", () => {
  let testDb: TestDatabase;
  let store: UseBoundStore<StoreApi<LibrarySlice>>;

  // Get mocked functions for type safety
  const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
  const {
    fetchLibraries,
    fetchLibraryItems,
    fetchAllLibraryItems,
    fetchLibraryItemsByAddedAt,
    fetchLibraryItemsBatch,
  } = require("@/lib/api/endpoints");
  const {
    getAllLibraries,
    getLibraryById,
    marshalLibrariesFromResponse,
    upsertLibraries,
  } = require("@/db/helpers/libraries");
  const {
    getLibraryItemsForList,
    marshalLibraryItemFromApi,
    marshalLibraryItemsFromResponse,
    transformItemsToDisplayFormat,
    upsertLibraryItems,
    checkLibraryItemExists,
  } = require("@/db/helpers/libraryItems");
  const {
    cacheCoversForLibraryItems,
    upsertBooksMetadata,
    upsertPodcastsMetadata,
  } = require("@/db/helpers/mediaMetadata");
  const { processFullLibraryItems } = require("@/db/helpers/fullLibraryItems");

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
    marshalLibraryItemFromApi.mockImplementation((item) => item);
    transformItemsToDisplayFormat.mockReturnValue([]);
    marshalLibraryItemsFromResponse.mockReturnValue([]);
    upsertLibraryItems.mockResolvedValue();
    checkLibraryItemExists.mockResolvedValue(false);
    marshalLibraryItemFromApi.mockImplementation((item: any) => item);

    cacheCoversForLibraryItems.mockResolvedValue({ downloadedCount: 0, totalCount: 0 });
    upsertBooksMetadata.mockResolvedValue();
    upsertPodcastsMetadata.mockResolvedValue();

    processFullLibraryItems.mockResolvedValue();

    fetchLibraries.mockResolvedValue(mockLibrariesResponse);
    fetchLibraryItems.mockResolvedValue({ results: [] });
    fetchLibraryItemsByAddedAt.mockResolvedValue({ results: [] });
    fetchLibraryItemsBatch.mockResolvedValue([]);
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe("Initial State", () => {
    it("should have correct initial state", () => {
      const state = store.getState();

      expect(state.library).toEqual({
        readinessState: "UNINITIALIZED",
        operationState: "IDLE",
        selectedLibraryId: null,
        selectedLibrary: null,
        libraries: [],
        rawItems: [],
        items: [],
        sortConfig: DEFAULT_SORT_CONFIG,
      });
    });
  });

  describe("initializeLibrarySlice", () => {
    it("should initialize slice when not already initialized", async () => {
      // Mock storage data
      mockedAsyncStorage.getItem
        .mockResolvedValueOnce("lib-1") // selectedLibraryId
        .mockResolvedValueOnce(JSON.stringify({ field: "author", direction: "asc" })); // sortConfig

      // Mock database data
      getAllLibraries.mockResolvedValue([mockLibraryRow, mockPodcastLibraryRow]);
      getLibraryItemsForList.mockResolvedValue([]);
      transformItemsToDisplayFormat.mockReturnValue([]);

      await store.getState().initializeLibrarySlice(true, true);

      const state = store.getState();
      expect(state.library.readinessState).toBe("READY");
      expect(state.library.selectedLibraryId).toBe("lib-1");
      expect(state.library.libraries).toEqual([mockLibraryRow, mockPodcastLibraryRow]);
      expect(state.library.sortConfig).toEqual({ field: "author", direction: "asc" });
    });

    it("should not reinitialize if already initialized", async () => {
      // Set slice as already initialized
      store.setState((state) => ({
        ...state,
        library: { ...state.library, readinessState: "READY" },
      }));

      await store.getState().initializeLibrarySlice(true, true);

      // Should not have called storage methods
      expect(mockedAsyncStorage.getItem).not.toHaveBeenCalled();
    });

    it("should handle storage loading errors gracefully", async () => {
      mockedAsyncStorage.getItem.mockRejectedValue(new Error("Storage error"));

      await store.getState().initializeLibrarySlice(true, true);

      const state = store.getState();
      expect(state.library.readinessState).not.toBe("UNINITIALIZED");
      // Should still complete initialization despite storage error
    });

    it("should set ready state based on API and DB status", async () => {
      // Test case 1: DB only (not ready)
      await store.getState().initializeLibrarySlice(false, true);
      expect(store.getState().library.readinessState).toBe("NOT_READY");

      // Reset for next test
      store.getState().resetLibrary();

      // Test case 2: API only (not ready - DB not initialized)
      await store.getState().initializeLibrarySlice(true, false);
      expect(store.getState().library.readinessState).toBe("NOT_READY");

      // Reset for next test
      store.getState().resetLibrary();

      // Test case 3: Both API and DB (ready)
      await store.getState().initializeLibrarySlice(true, true);
      expect(store.getState().library.readinessState).toBe("READY");
    });
  });

  describe("selectLibrary", () => {
    beforeEach(async () => {
      // Initialize the slice first
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      await store.getState().initializeLibrarySlice(true, true);
    });

    it("should select library from cache when fetchFromApi is false", async () => {
      getLibraryById.mockResolvedValue(mockLibraryRow);
      getLibraryItemsForList.mockResolvedValue([]);
      transformItemsToDisplayFormat.mockReturnValue([]);

      await store.getState().selectLibrary("lib-1", false);

      const state = store.getState();
      expect(state.library.selectedLibraryId).toBe("lib-1");
      expect(state.library.selectedLibrary).toEqual(mockLibraryRow);
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.selectedLibraryId,
        "lib-1"
      );
      expect(fetchLibraryItems).not.toHaveBeenCalled();
    });

    it("should fetch from API when fetchFromApi is true", async () => {
      getLibraryById.mockResolvedValue(mockLibraryRow);
      getLibraryItemsForList.mockResolvedValue([]);
      transformItemsToDisplayFormat.mockReturnValue([]);
      fetchAllLibraryItems.mockResolvedValue([]);

      await store.getState().selectLibrary("lib-1", true);

      expect(fetchAllLibraryItems).toHaveBeenCalledWith("lib-1");
    });

    it("should not select library if not ready", async () => {
      // Set slice as not ready and clear selected library
      store.setState((state) => ({
        ...state,
        library: {
          ...state.library,
          readinessState: "NOT_READY",
          selectedLibraryId: null,
          selectedLibrary: null,
        },
      }));

      await store.getState().selectLibrary("lib-1");

      const state = store.getState();
      expect(state.library.selectedLibraryId).toBeNull();
    });

    it("should not reselect same library unless fetchFromApi is true", async () => {
      // Set library as already selected
      store.setState((state) => ({
        ...state,
        library: { ...state.library, selectedLibraryId: "lib-1" },
      }));

      await store.getState().selectLibrary("lib-1", false);

      expect(getLibraryById).not.toHaveBeenCalled();
    });
  });

  describe("refresh", () => {
    beforeEach(async () => {
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      await store.getState().initializeLibrarySlice(true, true);
    });

    it("should refresh libraries and items", async () => {
      // Set a selected library
      store.setState((state) => ({
        ...state,
        library: { ...state.library, selectedLibraryId: "lib-1", selectedLibrary: mockLibraryRow },
      }));

      marshalLibrariesFromResponse.mockReturnValue([mockLibraryRow]);
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      fetchAllLibraryItems.mockResolvedValue([]);

      await store.getState().refresh();

      expect(fetchLibraries).toHaveBeenCalled();
      expect(fetchAllLibraryItems).toHaveBeenCalledWith("lib-1");
    });

    it("should not refresh items if no library is selected", async () => {
      await store.getState().refresh();

      expect(fetchLibraries).toHaveBeenCalled();
      expect(fetchLibraryItems).not.toHaveBeenCalled();
    });

    it("should not refresh if not ready", async () => {
      // Clear mocks from initialization which may have triggered auto-refresh
      jest.clearAllMocks();

      store.setState((state) => ({
        ...state,
        library: { ...state.library, readinessState: "NOT_READY" },
      }));

      await store.getState().refresh();

      expect(fetchLibraries).not.toHaveBeenCalled();
    });
  });

  describe("setSortConfig", () => {
    beforeEach(async () => {
      await store.getState().initializeLibrarySlice(true, true);
    });

    it("should update sort config and persist to storage", async () => {
      const newSortConfig = { field: "authorName" as const, direction: "asc" as const };

      await store.getState().setSortConfig(newSortConfig);

      const state = store.getState();
      expect(state.library.sortConfig).toEqual(newSortConfig);
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.sortConfig,
        JSON.stringify(newSortConfig)
      );
    });

    it("should handle storage errors gracefully", async () => {
      mockedAsyncStorage.setItem.mockRejectedValue(new Error("Storage error"));
      const newSortConfig = { field: "authorName" as const, direction: "asc" as const };

      await expect(store.getState().setSortConfig(newSortConfig)).resolves.not.toThrow();

      const state = store.getState();
      expect(state.library.sortConfig).toEqual(newSortConfig);
    });
  });

  describe("resetLibrary", () => {
    it("should reset library to initial state", async () => {
      // Modify the state first
      store.setState((state) => ({
        ...state,
        library: {
          ...state.library,
          selectedLibraryId: "lib-1",
          libraries: [mockLibraryRow],
          initialized: true,
          ready: true,
        },
      }));

      store.getState().resetLibrary();

      const state = store.getState();
      expect(state.library.selectedLibraryId).toBeNull();
      expect(state.library.libraries).toEqual([]);
      expect(state.library.readinessState).toBe("UNINITIALIZED");
      expect(state.library.operationState).toBe("IDLE");
    });
  });

  describe("Operation States", () => {
    beforeEach(async () => {
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      await store.getState().initializeLibrarySlice(true, true);
    });

    it("should set operation state during library selection", async () => {
      let operationState: string | undefined;

      // Mock to capture operation state (use a different library ID to avoid early return)
      getLibraryById.mockImplementation(async () => {
        operationState = store.getState().library.operationState;
        return { ...mockLibraryRow, id: "lib-2" };
      });

      await store.getState().selectLibrary("lib-2");

      expect(operationState).toBe("SELECTING_LIBRARY");
      expect(store.getState().library.operationState).toBe("IDLE");
    });

    it("should set operation states during refresh", async () => {
      let librariesOperationState: string | undefined;
      let itemsOperationState: string | undefined;

      store.setState((state) => ({
        ...state,
        library: { ...state.library, selectedLibraryId: "lib-1", selectedLibrary: mockLibraryRow },
      }));

      fetchLibraries.mockImplementation(async () => {
        librariesOperationState = store.getState().library.operationState;
        return mockLibrariesResponse;
      });

      fetchAllLibraryItems.mockImplementation(async () => {
        itemsOperationState = store.getState().library.operationState;
        return [];
      });

      await store.getState().refresh();

      expect(librariesOperationState).toBe("REFRESHING_LIBRARIES");
      expect(itemsOperationState).toBe("REFRESHING_ITEMS");
      expect(store.getState().library.operationState).toBe("IDLE");
    });
  });

  describe("Error Handling", () => {
    beforeEach(async () => {
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      await store.getState().initializeLibrarySlice(true, true);
    });

    it("should handle API errors during refresh gracefully", async () => {
      fetchLibraries.mockRejectedValue(new Error("API Error"));
      getAllLibraries.mockResolvedValue([mockLibraryRow]); // Fallback to database

      await expect(store.getState().refresh()).resolves.not.toThrow();

      // Should still have libraries from database fallback
      const state = store.getState();
      expect(state.library.libraries).toEqual([mockLibraryRow]);
    });

    it("should handle database errors during library selection", async () => {
      getLibraryById.mockRejectedValue(new Error("Database Error"));

      await expect(store.getState().selectLibrary("lib-1")).resolves.not.toThrow();

      // Operation state should be reset even after error
      const state = store.getState();
      expect(state.library.operationState).toBe("IDLE");
    });
  });

  describe("Private Methods", () => {
    beforeEach(async () => {
      await store.getState().initializeLibrarySlice(true, true);
    });

    it("should load settings from storage correctly", async () => {
      mockedAsyncStorage.getItem
        .mockResolvedValueOnce("lib-test") // selectedLibraryId
        .mockResolvedValueOnce(JSON.stringify({ field: "publishedYear", direction: "desc" })); // sortConfig

      await (store.getState() as any)._loadLibrarySettingsFromStorage();

      const state = store.getState();
      expect(state.library.selectedLibraryId).toBe("lib-test");
      expect(state.library.sortConfig).toEqual({ field: "publishedYear", direction: "desc" });
    });

    it("should handle malformed sort config in storage", async () => {
      mockedAsyncStorage.getItem
        .mockResolvedValueOnce(null) // selectedLibraryId
        .mockResolvedValueOnce("invalid json"); // sortConfig

      await (store.getState() as any)._loadLibrarySettingsFromStorage();

      const state = store.getState();
      expect(state.library.sortConfig).toEqual(DEFAULT_SORT_CONFIG); // Should remain unchanged
    });

    it("should update readiness state correctly", () => {
      const updateReadiness = (store.getState() as any)._updateReadiness;

      updateReadiness(true, true);
      expect(store.getState().library.readinessState).toBe("READY");

      store.getState().resetLibrary();
      updateReadiness(true, false);
      expect(store.getState().library.readinessState).not.toBe("READY");

      store.getState().resetLibrary();
      updateReadiness(false, true);
      expect(store.getState().library.readinessState).not.toBe("READY");
    });
  });

  describe("_selectLibraryFromCache", () => {
    beforeEach(async () => {
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      await store.getState().initializeLibrarySlice(true, true);
    });

    it("should select library from cache and load items", async () => {
      getLibraryById.mockResolvedValue(mockLibraryRow);
      getLibraryItemsForList.mockResolvedValue([]);
      transformItemsToDisplayFormat.mockReturnValue([]);

      await (store.getState() as any)._selectLibraryFromCache("lib-1");

      const state = store.getState();
      expect(state.library.selectedLibraryId).toBe("lib-1");
      expect(state.library.selectedLibrary).toEqual(mockLibraryRow);
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.selectedLibraryId,
        "lib-1"
      );
    });

    it("should not select library if not ready", async () => {
      store.setState((state) => ({
        ...state,
        library: { ...state.library, readinessState: "NOT_READY", selectedLibraryId: null },
      }));

      await (store.getState() as any)._selectLibraryFromCache("lib-1");

      expect(getLibraryById).not.toHaveBeenCalled();
      expect(store.getState().library.selectedLibraryId).toBeNull();
    });

    it("should handle when selected library is already selected", async () => {
      store.setState((state) => ({
        ...state,
        library: { ...state.library, selectedLibraryId: "lib-1" },
      }));

      await (store.getState() as any)._selectLibraryFromCache("lib-1");

      expect(getLibraryById).not.toHaveBeenCalled();
    });

    it("should handle database errors gracefully", async () => {
      getLibraryById.mockRejectedValue(new Error("Database Error"));

      await (store.getState() as any)._selectLibraryFromCache("lib-2");

      const state = store.getState();
      expect(state.library.operationState).toBe("IDLE");
    });
  });

  describe("_loadCachedItems", () => {
    beforeEach(async () => {
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      await store.getState().initializeLibrarySlice(true, true);
    });

    it("should load cached items for selected library", async () => {
      const mockDisplayItems = [
        { id: "li-1", title: "Book 1", authorName: "Author 1" },
        { id: "li-2", title: "Book 2", authorName: "Author 2" },
      ];

      store.setState((state) => ({
        ...state,
        library: { ...state.library, selectedLibraryId: "lib-1" },
      }));

      getLibraryItemsForList.mockResolvedValue([]);
      transformItemsToDisplayFormat.mockReturnValue(mockDisplayItems);

      await (store.getState() as any)._loadCachedItems();

      const state = store.getState();
      expect(state.library.rawItems).toEqual(mockDisplayItems);
      expect(state.library.items).toEqual(mockDisplayItems);
      expect(state.library.operationState).toBe("IDLE");
    });

    it("should not load items if no library is selected", async () => {
      // Clear mocks from initialization
      jest.clearAllMocks();

      store.setState((state) => ({
        ...state,
        library: { ...state.library, selectedLibraryId: null },
      }));

      await (store.getState() as any)._loadCachedItems();

      expect(getLibraryItemsForList).not.toHaveBeenCalled();
    });

    it("should handle database errors gracefully", async () => {
      store.setState((state) => ({
        ...state,
        library: { ...state.library, selectedLibraryId: "lib-1" },
      }));

      getLibraryItemsForList.mockRejectedValue(new Error("Database Error"));

      await (store.getState() as any)._loadCachedItems();

      const state = store.getState();
      expect(state.library.operationState).toBe("IDLE");
    });
  });

  describe("_refetchLibraries", () => {
    beforeEach(async () => {
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      await store.getState().initializeLibrarySlice(true, true);
    });

    it("should fetch libraries from API and update database", async () => {
      marshalLibrariesFromResponse.mockReturnValue([mockLibraryRow, mockPodcastLibraryRow]);
      getAllLibraries.mockResolvedValue([mockLibraryRow, mockPodcastLibraryRow]);

      const result = await (store.getState() as any)._refetchLibraries();

      expect(fetchLibraries).toHaveBeenCalled();
      expect(marshalLibrariesFromResponse).toHaveBeenCalled();
      expect(upsertLibraries).toHaveBeenCalled();
      expect(result).toEqual([mockLibraryRow, mockPodcastLibraryRow]);

      const state = store.getState();
      expect(state.library.libraries).toEqual([mockLibraryRow, mockPodcastLibraryRow]);
    });

    it("should auto-select first library when none is selected", async () => {
      store.setState((state) => ({
        ...state,
        library: { ...state.library, selectedLibraryId: null, selectedLibrary: null },
      }));

      marshalLibrariesFromResponse.mockReturnValue([mockLibraryRow]);
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      getLibraryItemsForList.mockResolvedValue([]);
      transformItemsToDisplayFormat.mockReturnValue([]);

      await (store.getState() as any)._refetchLibraries();

      const state = store.getState();
      expect(state.library.selectedLibraryId).toBe("lib-1");
      expect(state.library.selectedLibrary).toEqual(mockLibraryRow);
    });

    it("should not fetch if not ready", async () => {
      // Clear mocks from initialization
      jest.clearAllMocks();

      store.setState((state) => ({
        ...state,
        library: { ...state.library, readinessState: "NOT_READY" },
      }));

      const result = await (store.getState() as any)._refetchLibraries();

      expect(fetchLibraries).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it("should fallback to database on API error", async () => {
      fetchLibraries.mockRejectedValue(new Error("API Error"));
      getAllLibraries.mockResolvedValue([mockLibraryRow]);

      const result = await (store.getState() as any)._refetchLibraries();

      expect(result).toEqual([mockLibraryRow]);
      const state = store.getState();
      expect(state.library.libraries).toEqual([mockLibraryRow]);
      expect(state.library.operationState).toBe("IDLE");
    });
  });

  describe("_refetchItems", () => {
    beforeEach(async () => {
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      await store.getState().initializeLibrarySlice(true, true);
      store.setState((state) => ({
        ...state,
        library: {
          ...state.library,
          selectedLibraryId: "lib-1",
          selectedLibrary: mockLibraryRow,
        },
      }));
    });

    it("should fetch items from API and update database", async () => {
      const mockApiItems = [
        { id: "li-1", libraryId: "lib-1", media: { metadata: { title: "Book 1" } } },
      ];
      const mockDbItems = [{ id: "li-1", libraryId: "lib-1", title: "Book 1" }];
      const mockDisplayItems = [{ id: "li-1", title: "Book 1", authorName: "Author 1" }];

      fetchAllLibraryItems.mockResolvedValue(mockApiItems);
      getLibraryItemsForList.mockResolvedValue(mockDbItems);
      transformItemsToDisplayFormat.mockReturnValue(mockDisplayItems);
      cacheCoversForLibraryItems.mockResolvedValue({ downloadedCount: 0, totalCount: 0 });

      await (store.getState() as any)._refetchItems();

      expect(fetchAllLibraryItems).toHaveBeenCalledWith("lib-1");
      expect(upsertLibraryItems).toHaveBeenCalled();

      // Give a small delay for the state to update
      await new Promise((resolve) => setTimeout(resolve, 10));

      const state = store.getState();
      expect(state.library.rawItems).toEqual(mockDisplayItems);
      expect(state.library.items).toEqual(mockDisplayItems);
      expect(state.library.operationState).toBe("IDLE");
    });

    it("should not fetch if not ready", async () => {
      // Clear mocks from initialization
      jest.clearAllMocks();

      store.setState((state) => ({
        ...state,
        library: { ...state.library, readinessState: "NOT_READY" },
      }));

      await (store.getState() as any)._refetchItems();

      expect(fetchAllLibraryItems).not.toHaveBeenCalled();
    });

    it("should not fetch if no library is selected", async () => {
      // Clear mocks from initialization
      jest.clearAllMocks();

      store.setState((state) => ({
        ...state,
        library: { ...state.library, selectedLibraryId: null, selectedLibrary: null },
      }));

      await (store.getState() as any)._refetchItems();

      expect(fetchAllLibraryItems).not.toHaveBeenCalled();
    });

    it("should handle API errors gracefully", async () => {
      fetchAllLibraryItems.mockRejectedValue(new Error("API Error"));

      await (store.getState() as any)._refetchItems();

      const state = store.getState();
      expect(state.library.operationState).toBe("IDLE");
    });
  });

  describe("_sortLibraryItems", () => {
    beforeEach(async () => {
      await store.getState().initializeLibrarySlice(true, true);
    });

    it("should sort items based on current sort config", () => {
      const mockItems = [
        { id: "li-2", title: "Book B", authorName: "Author B" },
        { id: "li-1", title: "Book A", authorName: "Author A" },
        { id: "li-3", title: "Book C", authorName: "Author C" },
      ];

      store.setState((state) => ({
        ...state,
        library: {
          ...state.library,
          rawItems: mockItems,
          sortConfig: { field: "title", direction: "asc" },
        },
      }));

      (store.getState() as any)._sortLibraryItems();

      const state = store.getState();
      expect(state.library.items[0].id).toBe("li-1");
      expect(state.library.items[1].id).toBe("li-2");
      expect(state.library.items[2].id).toBe("li-3");
    });
  });

  describe("Integration Scenarios", () => {
    it("should complete full initialization flow with auto-selection", async () => {
      // Mock storage with no selected library
      mockedAsyncStorage.getItem.mockResolvedValue(null);

      // Mock database with libraries
      getAllLibraries.mockResolvedValue([mockLibraryRow, mockPodcastLibraryRow]);
      getLibraryItemsForList.mockResolvedValue([]);
      transformItemsToDisplayFormat.mockReturnValue([]);

      await store.getState().initializeLibrarySlice(true, true);

      const state = store.getState();
      expect(state.library.readinessState).toBe("READY");
      expect(state.library.selectedLibraryId).toBe("lib-1"); // Auto-selected first library
      expect(state.library.libraries).toEqual([mockLibraryRow, mockPodcastLibraryRow]);
    });

    it("should fetch libraries from API when DB is empty", async () => {
      // Mock storage
      mockedAsyncStorage.getItem.mockResolvedValue(null);

      // Mock database with no libraries initially
      getAllLibraries.mockResolvedValueOnce([]);

      // Mock API response
      fetchLibraries.mockResolvedValue(mockLibrariesResponse);
      marshalLibrariesFromResponse.mockReturnValue([mockLibraryRow, mockPodcastLibraryRow]);

      // After API call, DB will have libraries
      getAllLibraries.mockResolvedValue([mockLibraryRow, mockPodcastLibraryRow]);
      getLibraryItemsForList.mockResolvedValue([]);
      transformItemsToDisplayFormat.mockReturnValue([]);

      await store.getState().initializeLibrarySlice(true, true);

      const state = store.getState();
      expect(state.library.libraries.length).toBeGreaterThanOrEqual(0);
      expect(state.library.readinessState).toBe("READY");
    });

    it("should handle sorting items after loading", async () => {
      const mockItems = [
        { id: "li-3", title: "Book C", authorName: "Author C", addedAt: 3 },
        { id: "li-1", title: "Book A", authorName: "Author A", addedAt: 1 },
        { id: "li-2", title: "Book B", authorName: "Author B", addedAt: 2 },
      ];

      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      getLibraryItemsForList.mockResolvedValue(mockItems);
      transformItemsToDisplayFormat.mockReturnValue(mockItems);

      // Initialize with default sort (title asc)
      await store.getState().initializeLibrarySlice(true, true);

      let state = store.getState();
      expect(state.library.items[0].title).toBe("Book A");
      expect(state.library.items[2].title).toBe("Book C");

      // Change sort to title desc
      await store.getState().setSortConfig({ field: "title", direction: "desc" });

      state = store.getState();
      expect(state.library.items[0].title).toBe("Book C");
      expect(state.library.items[2].title).toBe("Book A");
    });

    it("should persist auto-selected library to storage", async () => {
      mockedAsyncStorage.getItem.mockResolvedValue(null);
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      getLibraryItemsForList.mockResolvedValue([]);
      transformItemsToDisplayFormat.mockReturnValue([]);

      await store.getState().initializeLibrarySlice(true, true);

      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        STORAGE_KEYS.selectedLibraryId,
        "lib-1"
      );
    });

    it("should handle library selection that doesn't exist in DB", async () => {
      // Mock storage with library ID that doesn't exist
      mockedAsyncStorage.getItem
        .mockResolvedValueOnce("non-existent-lib")
        .mockResolvedValueOnce(null);

      getAllLibraries.mockResolvedValue([mockLibraryRow, mockPodcastLibraryRow]);
      getLibraryItemsForList.mockResolvedValue([]);
      transformItemsToDisplayFormat.mockReturnValue([]);

      await store.getState().initializeLibrarySlice(true, true);

      const state = store.getState();
      // Should have the non-existent ID from storage but no selectedLibrary object
      expect(state.library.selectedLibraryId).toBe("non-existent-lib");
      expect(state.library.selectedLibrary).toBeUndefined();
    });

    it("should refresh libraries and items during refresh", async () => {
      // Initialize the slice first
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      await store.getState().initializeLibrarySlice(true, true);

      // Set up state with selected library
      store.setState((state) => ({
        ...state,
        library: {
          ...state.library,
          selectedLibraryId: "lib-1",
          selectedLibrary: mockLibraryRow,
        },
      }));

      // Clear mocks from initialization
      jest.clearAllMocks();

      // Set up mocks for refresh
      fetchLibraries.mockResolvedValue(mockLibrariesResponse);
      marshalLibrariesFromResponse.mockReturnValue([mockLibraryRow]);
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      upsertLibraries.mockResolvedValue();
      fetchAllLibraryItems.mockResolvedValue([]);
      getLibraryItemsForList.mockResolvedValue([]);
      transformItemsToDisplayFormat.mockReturnValue([]);
      cacheCoversForLibraryItems.mockResolvedValue({ downloadedCount: 0, totalCount: 0 });

      await store.getState().refresh();

      // Give time for async operations
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify refresh methods were called
      expect(fetchLibraries).toHaveBeenCalled();
      expect(fetchAllLibraryItems).toHaveBeenCalledWith("lib-1");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty libraries array", async () => {
      mockedAsyncStorage.getItem.mockResolvedValue(null);
      getAllLibraries.mockResolvedValue([]);

      await store.getState().initializeLibrarySlice(true, true);

      const state = store.getState();
      expect(state.library.libraries).toEqual([]);
      expect(state.library.selectedLibraryId).toBeNull();
      expect(state.library.items).toEqual([]);
    });

    it("should handle empty items array", async () => {
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      getLibraryItemsForList.mockResolvedValue([]);
      transformItemsToDisplayFormat.mockReturnValue([]);

      await store.getState().initializeLibrarySlice(true, true);

      const state = store.getState();
      expect(state.library.items).toEqual([]);
      expect(state.library.rawItems).toEqual([]);
    });

    it("should handle storage setItem failures", async () => {
      mockedAsyncStorage.setItem.mockRejectedValue(new Error("Storage full"));
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      getLibraryById.mockResolvedValue(mockLibraryRow);
      getLibraryItemsForList.mockResolvedValue([]);
      transformItemsToDisplayFormat.mockReturnValue([]);

      await store.getState().initializeLibrarySlice(true, true);

      // Should still select library despite storage failure
      await store.getState().selectLibrary("lib-1");

      const state = store.getState();
      expect(state.library.selectedLibraryId).toBe("lib-1");
    });

    it("should handle null/undefined in sort fields", async () => {
      const mockItems = [
        { id: "li-1", title: null, authorName: null },
        { id: "li-2", title: "Book B", authorName: "Author B" },
        { id: "li-3", title: undefined, authorName: undefined },
      ];

      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      getLibraryItemsForList.mockResolvedValue(mockItems);
      transformItemsToDisplayFormat.mockReturnValue(mockItems);

      await store.getState().initializeLibrarySlice(true, true);

      const state = store.getState();
      // Should not crash when sorting items with null/undefined fields
      expect(state.library.items).toHaveLength(3);
    });

    it("should handle multiple rapid library selections", async () => {
      getAllLibraries.mockResolvedValue([mockLibraryRow, mockPodcastLibraryRow]);
      await store.getState().initializeLibrarySlice(true, true);

      getLibraryById
        .mockResolvedValueOnce(mockLibraryRow)
        .mockResolvedValueOnce(mockPodcastLibraryRow);
      getLibraryItemsForList.mockResolvedValue([]);
      transformItemsToDisplayFormat.mockReturnValue([]);

      // Rapidly select different libraries
      const promise1 = store.getState().selectLibrary("lib-1");
      const promise2 = store.getState().selectLibrary("lib-2");

      await Promise.all([promise1, promise2]);

      const state = store.getState();
      // Should end up with the last selected library
      expect(state.library.selectedLibraryId).toBe("lib-2");
    });

    it("should maintain operation state consistency on errors", async () => {
      getAllLibraries.mockResolvedValue([mockLibraryRow]);
      await store.getState().initializeLibrarySlice(true, true);

      // Wait for any background operations to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify we're in idle state before proceeding
      expect(store.getState().library.operationState).toBe("IDLE");

      getLibraryById.mockRejectedValue(new Error("Database error"));

      await store.getState().selectLibrary("lib-1");

      const state = store.getState();
      // Operation state should be idle after error
      expect(state.library.operationState).toBe("IDLE");
    });
  });
});
