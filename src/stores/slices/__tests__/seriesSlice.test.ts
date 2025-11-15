/**
 * Tests for series slice
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { DEFAULT_SERIES_SORT_CONFIG, STORAGE_KEYS } from "../../utils";
import { createSeriesSlice, SeriesSlice } from "../seriesSlice";

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock database helpers
jest.mock("@/db/helpers/series", () => ({
  getAllSeries: jest.fn(),
  transformSeriesToDisplayFormat: jest.fn(),
}));

describe("SeriesSlice", () => {
  let store: ReturnType<typeof create<SeriesSlice>>;

  // Get mocked functions for type safety
  const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
  const { getAllSeries, transformSeriesToDisplayFormat } = require("@/db/helpers/series");

  // Mock series data
  const mockSeries = [
    { id: "series-1", name: "Series One", books: [] },
    { id: "series-2", name: "Series Two", books: [] },
    { id: "series-3", name: "Another Series", books: [] },
  ];

  const mockDisplaySeries = [
    {
      id: "series-1",
      name: "Series One",
      numBooks: 5,
    },
    {
      id: "series-2",
      name: "Series Two",
      numBooks: 3,
    },
    {
      id: "series-3",
      name: "Another Series",
      numBooks: 8,
    },
  ];

  beforeEach(() => {
    // Create a test store
    store = create<SeriesSlice>()((set, get) => ({
      ...createSeriesSlice(set, get),
    }));

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock implementations
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedAsyncStorage.setItem.mockResolvedValue();
    getAllSeries.mockResolvedValue([]);
    transformSeriesToDisplayFormat.mockReturnValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Initial State", () => {
    it("should have correct initial state", () => {
      const state = store.getState();

      expect(state.series).toEqual({
        series: [],
        rawItems: [],
        items: [],
        sortConfig: DEFAULT_SERIES_SORT_CONFIG,
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

  describe("initializeSeries", () => {
    it("should skip initialization if already initialized", async () => {
      // First initialization
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);
      await store.getState().initializeSeries(true, true);

      jest.clearAllMocks();

      // Second initialization
      await store.getState().initializeSeries(true, true);

      expect(getAllSeries).not.toHaveBeenCalled();
    });

    it("should load settings from storage before fetching data", async () => {
      const sortConfig = { field: "name" as const, direction: "desc" as const };
      mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify(sortConfig));

      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);

      await store.getState().initializeSeries(true, true);

      const state = store.getState();
      expect(state.series.sortConfig).toEqual(sortConfig);
    });

    it("should set ready state based on API and DB initialization", async () => {
      await store.getState().initializeSeries(true, true);
      expect(store.getState().series.ready).toBe(true);

      store.getState().resetSeries();
      await store.getState().initializeSeries(false, true);
      expect(store.getState().series.ready).toBe(false);

      store.getState().resetSeries();
      await store.getState().initializeSeries(true, false);
      expect(store.getState().series.ready).toBe(false);
    });

    it("should fetch series when API and DB are ready", async () => {
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);

      await store.getState().initializeSeries(true, true);

      expect(getAllSeries).toHaveBeenCalled();
      const state = store.getState();
      expect(state.series.series).toEqual(mockSeries);
    });

    it("should not fetch series when not ready", async () => {
      await store.getState().initializeSeries(false, false);

      expect(getAllSeries).not.toHaveBeenCalled();
    });

    it("should set initialized to true after completion", async () => {
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);

      await store.getState().initializeSeries(true, true);

      const state = store.getState();
      expect(state.series.initialized).toBe(true);
      expect(state.series.loading.isInitializing).toBe(false);
    });

    it("should handle initialization errors gracefully", async () => {
      getAllSeries.mockRejectedValue(new Error("Database error"));

      await store.getState().initializeSeries(true, true);

      const state = store.getState();
      expect(state.series.loading.isInitializing).toBe(false);
    });
  });

  describe("refetchSeries", () => {
    beforeEach(async () => {
      // Initialize the slice
      await store.getState().initializeSeries(true, true);
      jest.clearAllMocks();
    });

    it("should fetch series from database", async () => {
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);

      const result = await store.getState().refetchSeries();

      expect(getAllSeries).toHaveBeenCalled();
      expect(result).toEqual(mockSeries);
      expect(store.getState().series.series).toEqual(mockSeries);
    });

    it("should set loading state during fetch", async () => {
      let loadingDuringFetch: boolean | undefined;

      getAllSeries.mockImplementation(async () => {
        loadingDuringFetch = store.getState().series.loading.isLoadingItems;
        return mockSeries;
      });

      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);

      await store.getState().refetchSeries();

      expect(loadingDuringFetch).toBe(true);
      expect(store.getState().series.loading.isLoadingItems).toBe(false);
    });

    it("should transform and sort series", async () => {
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);

      await store.getState().refetchSeries();

      expect(transformSeriesToDisplayFormat).toHaveBeenCalledWith(mockSeries);
      const state = store.getState();
      expect(state.series.rawItems).toEqual(mockDisplaySeries);
      expect(state.series.items.length).toBeGreaterThan(0);
    });

    it("should return empty array when not ready", async () => {
      // Reset to not ready
      store.getState().resetSeries();

      const result = await store.getState().refetchSeries();

      expect(result).toEqual([]);
      expect(getAllSeries).not.toHaveBeenCalled();
    });

    it("should return empty array on database error", async () => {
      getAllSeries.mockRejectedValue(new Error("Database error"));

      const result = await store.getState().refetchSeries();

      expect(result).toEqual([]);
    });
  });

  describe("setSeriesSortConfig", () => {
    beforeEach(async () => {
      // Initialize with some data
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);
      await store.getState().initializeSeries(true, true);
      jest.clearAllMocks();
    });

    it("should update sort config and re-sort items", async () => {
      const newSortConfig = { field: "name" as const, direction: "desc" as const };

      await store.getState().setSeriesSortConfig(newSortConfig);

      const state = store.getState();
      expect(state.series.sortConfig).toEqual(newSortConfig);
    });

    it("should persist sort config to AsyncStorage", async () => {
      const newSortConfig = { field: "name" as const, direction: "asc" as const };

      await store.getState().setSeriesSortConfig(newSortConfig);

      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        `${STORAGE_KEYS.sortConfig}_series`,
        JSON.stringify(newSortConfig)
      );
    });

    it("should handle storage errors gracefully", async () => {
      mockedAsyncStorage.setItem.mockRejectedValue(new Error("Storage error"));
      const newSortConfig = { field: "numBooks" as const, direction: "desc" as const };

      await expect(store.getState().setSeriesSortConfig(newSortConfig)).resolves.not.toThrow();

      // Sort config should still be updated in state
      expect(store.getState().series.sortConfig).toEqual(newSortConfig);
    });

    it("should re-sort existing items with new config", async () => {
      const initialItems = store.getState().series.items;
      const newSortConfig = { field: "name" as const, direction: "desc" as const };

      await store.getState().setSeriesSortConfig(newSortConfig);

      const newItems = store.getState().series.items;
      // Items should be re-sorted (may be in different order)
      expect(newItems.length).toBe(initialItems.length);
    });
  });

  describe("resetSeries", () => {
    it("should reset slice to initial state", async () => {
      // Initialize and modify state
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);
      await store.getState().initializeSeries(true, true);
      await store.getState().setSeriesSortConfig({ field: "name", direction: "desc" });

      // Reset
      store.getState().resetSeries();

      const state = store.getState();
      expect(state.series.series).toEqual([]);
      expect(state.series.rawItems).toEqual([]);
      expect(state.series.items).toEqual([]);
      expect(state.series.initialized).toBe(false);
      expect(state.series.ready).toBe(false);
      expect(state.series.sortConfig).toEqual(DEFAULT_SERIES_SORT_CONFIG);
    });
  });

  describe("_setSeriesReady", () => {
    it("should set ready to true when both API and DB are initialized", () => {
      store.getState()._setSeriesReady(true, true);
      expect(store.getState().series.ready).toBe(true);
    });

    it("should set ready to false when API is not initialized", () => {
      store.getState()._setSeriesReady(false, true);
      expect(store.getState().series.ready).toBe(false);
    });

    it("should set ready to false when DB is not initialized", () => {
      store.getState()._setSeriesReady(true, false);
      expect(store.getState().series.ready).toBe(false);
    });

    it("should set ready to false when both are not initialized", () => {
      store.getState()._setSeriesReady(false, false);
      expect(store.getState().series.ready).toBe(false);
    });
  });

  describe("_loadSeriesSettingsFromStorage", () => {
    it("should load sort config from storage", async () => {
      const sortConfig = { field: "name" as const, direction: "desc" as const };
      mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify(sortConfig));

      await store.getState()._loadSeriesSettingsFromStorage();

      const state = store.getState();
      expect(state.series.sortConfig).toEqual(sortConfig);
    });

    it("should handle missing storage data", async () => {
      mockedAsyncStorage.getItem.mockResolvedValue(null);

      await expect(store.getState()._loadSeriesSettingsFromStorage()).resolves.not.toThrow();

      const state = store.getState();
      expect(state.series.sortConfig).toEqual(DEFAULT_SERIES_SORT_CONFIG);
    });

    it("should handle invalid JSON in storage", async () => {
      mockedAsyncStorage.getItem.mockResolvedValue("invalid json{");

      await expect(store.getState()._loadSeriesSettingsFromStorage()).resolves.not.toThrow();

      const state = store.getState();
      expect(state.series.sortConfig).toEqual(DEFAULT_SERIES_SORT_CONFIG);
    });

    it("should handle storage errors", async () => {
      mockedAsyncStorage.getItem.mockRejectedValue(new Error("Storage error"));

      await expect(store.getState()._loadSeriesSettingsFromStorage()).resolves.not.toThrow();
    });
  });

  describe("_sortSeriesItems", () => {
    beforeEach(async () => {
      // Initialize with some data
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);
      await store.getState().initializeSeries(true, true);
      jest.clearAllMocks();
    });

    it("should sort items based on current sort configuration", () => {
      const initialItems = store.getState().series.items;

      // Change sort config without using setSeriesSortConfig
      store.getState().series.sortConfig = { field: "name", direction: "desc" };

      // Now call sort
      store.getState()._sortSeriesItems();

      const newItems = store.getState().series.items;
      expect(newItems.length).toBe(initialItems.length);
    });

    it("should use rawItems as source for sorting", () => {
      // Modify rawItems
      const modifiedRawItems = [
        ...mockDisplaySeries,
        { id: "new-series", name: "New Series", numBooks: 1 },
      ];
      store.getState().series.rawItems = modifiedRawItems;

      store.getState()._sortSeriesItems();

      const sortedItems = store.getState().series.items;
      expect(sortedItems.length).toBe(modifiedRawItems.length);
    });
  });

  describe("Comprehensive Sort Testing", () => {
    const sortTestData = [
      {
        id: "series-1",
        name: "Alpha Series",
        bookCount: 5,
        addedAt: new Date("2023-01-01"),
        updatedAt: new Date("2024-01-01"),
      },
      {
        id: "series-2",
        name: "Beta Series",
        bookCount: 3,
        addedAt: new Date("2023-06-01"),
        updatedAt: new Date("2024-02-01"),
      },
      {
        id: "series-3",
        name: "Gamma Series",
        bookCount: 8,
        addedAt: new Date("2022-01-01"),
        updatedAt: new Date("2023-12-01"),
      },
    ];

    beforeEach(async () => {
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(sortTestData);
      await store.getState().initializeSeries(true, true);
      jest.clearAllMocks();
    });

    it("should sort by name ascending", async () => {
      await store.getState().setSeriesSortConfig({ field: "name", direction: "asc" });
      const items = store.getState().series.items;
      expect(items[0].name).toBe("Alpha Series");
      expect(items[2].name).toBe("Gamma Series");
    });

    it("should sort by name descending", async () => {
      await store.getState().setSeriesSortConfig({ field: "name", direction: "desc" });
      const items = store.getState().series.items;
      expect(items[0].name).toBe("Gamma Series");
      expect(items[2].name).toBe("Alpha Series");
    });

    it("should sort by bookCount ascending", async () => {
      await store.getState().setSeriesSortConfig({ field: "bookCount", direction: "asc" });
      const items = store.getState().series.items;
      expect(items[0].bookCount).toBe(3);
      expect(items[2].bookCount).toBe(8);
    });

    it("should sort by bookCount descending", async () => {
      await store.getState().setSeriesSortConfig({ field: "bookCount", direction: "desc" });
      const items = store.getState().series.items;
      expect(items[0].bookCount).toBe(8);
      expect(items[2].bookCount).toBe(3);
    });

    it("should sort by addedAt ascending", async () => {
      await store.getState().setSeriesSortConfig({ field: "addedAt", direction: "asc" });
      const items = store.getState().series.items;
      expect(items[0].id).toBe("series-3"); // Oldest
      expect(items[2].id).toBe("series-2"); // Newest
    });

    it("should sort by addedAt descending", async () => {
      await store.getState().setSeriesSortConfig({ field: "addedAt", direction: "desc" });
      const items = store.getState().series.items;
      expect(items[0].id).toBe("series-2"); // Newest
      expect(items[2].id).toBe("series-3"); // Oldest
    });

    it("should sort by updatedAt ascending", async () => {
      await store.getState().setSeriesSortConfig({ field: "updatedAt", direction: "asc" });
      const items = store.getState().series.items;
      expect(items[0].id).toBe("series-3"); // Oldest update
      expect(items[2].id).toBe("series-2"); // Newest update
    });

    it("should sort by updatedAt descending", async () => {
      await store.getState().setSeriesSortConfig({ field: "updatedAt", direction: "desc" });
      const items = store.getState().series.items;
      expect(items[0].id).toBe("series-2"); // Newest update
      expect(items[2].id).toBe("series-3"); // Oldest update
    });
  });

  describe("Edge Cases and Data Validation", () => {
    it("should handle empty series array", async () => {
      getAllSeries.mockResolvedValue([]);
      transformSeriesToDisplayFormat.mockReturnValue([]);

      await store.getState().initializeSeries(true, true);
      const result = await store.getState().refetchSeries();

      expect(result).toEqual([]);
      expect(store.getState().series.items).toEqual([]);
    });

    it("should handle series with missing optional fields", async () => {
      const incompleteSeries = [
        { id: "series-1", name: "Series One" },
        { id: "series-2", name: null, bookCount: 5 },
        { id: "series-3" },
      ];
      getAllSeries.mockResolvedValue(incompleteSeries as any);
      transformSeriesToDisplayFormat.mockReturnValue(incompleteSeries as any);

      await store.getState().initializeSeries(true, true);

      expect(store.getState().series.series).toEqual(incompleteSeries);
    });

    it("should handle sorting with null/undefined values", async () => {
      const seriesWithNulls = [
        { id: "1", name: "Alpha", bookCount: null },
        { id: "2", name: null, bookCount: 5 },
        { id: "3", name: "Zeta", bookCount: 10 },
      ];
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(seriesWithNulls as any);

      await store.getState().initializeSeries(true, true);
      await store.getState().setSeriesSortConfig({ field: "name", direction: "asc" });

      // Should not throw error
      expect(store.getState().series.items).toBeDefined();
      expect(store.getState().series.items.length).toBe(3);
    });

    it("should preserve array immutability during sorting", async () => {
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);

      await store.getState().initializeSeries(true, true);
      const originalRawItems = store.getState().series.rawItems;

      await store.getState().setSeriesSortConfig({ field: "name", direction: "desc" });

      // Original array should not be modified
      expect(store.getState().series.rawItems).toBe(originalRawItems);
      expect(store.getState().series.items).not.toBe(originalRawItems);
    });

    it("should handle very large arrays", async () => {
      const largeSeries = Array.from({ length: 1000 }, (_, i) => ({
        id: `series-${i}`,
        name: `Series ${i}`,
        bookCount: i % 100,
        addedAt: new Date(2020, 0, i % 365),
        updatedAt: new Date(2024, 0, i % 365),
      }));

      getAllSeries.mockResolvedValue(largeSeries as any);
      transformSeriesToDisplayFormat.mockReturnValue(largeSeries as any);

      await store.getState().initializeSeries(true, true);

      expect(store.getState().series.items.length).toBe(1000);
      await store.getState().setSeriesSortConfig({ field: "name", direction: "desc" });
      expect(store.getState().series.items.length).toBe(1000);
    });
  });

  describe("Concurrent Operations", () => {
    beforeEach(async () => {
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);
      await store.getState().initializeSeries(true, true);
      jest.clearAllMocks();
    });

    it("should handle multiple refetch calls concurrently", async () => {
      const fetchResults = await Promise.all([
        store.getState().refetchSeries(),
        store.getState().refetchSeries(),
        store.getState().refetchSeries(),
      ]);

      // All calls should succeed
      expect(fetchResults[0]).toEqual(mockSeries);
      expect(fetchResults[1]).toEqual(mockSeries);
      expect(fetchResults[2]).toEqual(mockSeries);
    });

    it("should handle concurrent sort config updates", async () => {
      await Promise.all([
        store.getState().setSeriesSortConfig({ field: "name", direction: "asc" }),
        store.getState().setSeriesSortConfig({ field: "bookCount", direction: "desc" }),
        store.getState().setSeriesSortConfig({ field: "addedAt", direction: "asc" }),
      ]);

      // Final state should be set (one of the configs)
      const finalConfig = store.getState().series.sortConfig;
      expect(finalConfig).toBeDefined();
      expect(["name", "bookCount", "addedAt"]).toContain(finalConfig.field);
    });

    it("should handle refetch during sort config update", async () => {
      const promises = [
        store.getState().refetchSeries(),
        store.getState().setSeriesSortConfig({ field: "name", direction: "desc" }),
      ];

      await Promise.all(promises);

      const state = store.getState();
      expect(state.series.items).toBeDefined();
      expect(state.series.series).toEqual(mockSeries);
    });
  });

  describe("State Consistency", () => {
    it("should maintain consistent state during async operations", async () => {
      let capturedStates: any[] = [];

      getAllSeries.mockImplementation(async () => {
        capturedStates.push({ ...store.getState().series });
        await new Promise((resolve) => setTimeout(resolve, 10));
        capturedStates.push({ ...store.getState().series });
        return mockSeries;
      });

      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);

      await store.getState().initializeSeries(true, true);

      // Verify loading states were consistent
      expect(capturedStates.length).toBeGreaterThan(0);
    });

    it("should not lose data during rapid updates", async () => {
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);

      await store.getState().initializeSeries(true, true);

      // Rapid updates
      for (let i = 0; i < 10; i++) {
        await store.getState().setSeriesSortConfig({
          field: i % 2 === 0 ? "name" : "bookCount",
          direction: i % 2 === 0 ? "asc" : "desc",
        });
      }

      // Data should still be intact
      expect(store.getState().series.series).toEqual(mockSeries);
      expect(store.getState().series.rawItems).toEqual(mockDisplaySeries);
    });

    it("should maintain rawItems and items separately", async () => {
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);

      await store.getState().initializeSeries(true, true);

      const rawItems = store.getState().series.rawItems;
      const items = store.getState().series.items;

      // Should be different arrays (due to sorting)
      expect(rawItems).not.toBe(items);

      // But contain same data
      expect(rawItems.length).toBe(items.length);
    });
  });

  describe("Loading State Transitions", () => {
    it("should set isInitializing during initialization", async () => {
      let isInitializingDuringInit: boolean | undefined;

      getAllSeries.mockImplementation(async () => {
        isInitializingDuringInit = store.getState().series.loading.isInitializing;
        return mockSeries;
      });

      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);

      await store.getState().initializeSeries(true, true);

      expect(isInitializingDuringInit).toBe(true);
      expect(store.getState().series.loading.isInitializing).toBe(false);
    });

    it("should reset isInitializing on error", async () => {
      getAllSeries.mockRejectedValue(new Error("Test error"));

      await store.getState().initializeSeries(true, true);

      expect(store.getState().series.loading.isInitializing).toBe(false);
    });

    it("should set isLoadingItems during refetch", async () => {
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);

      await store.getState().initializeSeries(true, true);

      let isLoadingDuringFetch: boolean | undefined;

      getAllSeries.mockImplementation(async () => {
        isLoadingDuringFetch = store.getState().series.loading.isLoadingItems;
        return mockSeries;
      });

      await store.getState().refetchSeries();

      expect(isLoadingDuringFetch).toBe(true);
      expect(store.getState().series.loading.isLoadingItems).toBe(false);
    });

    it("should reset isLoadingItems on error", async () => {
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);

      await store.getState().initializeSeries(true, true);

      getAllSeries.mockRejectedValue(new Error("Fetch error"));

      await store.getState().refetchSeries();

      expect(store.getState().series.loading.isLoadingItems).toBe(false);
    });

    it("should maintain correct loading states during concurrent operations", async () => {
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);

      await store.getState().initializeSeries(true, true);

      // Start multiple operations
      const promise1 = store.getState().refetchSeries();
      const promise2 = store.getState().refetchSeries();

      await Promise.all([promise1, promise2]);

      // Loading should be false after all complete
      expect(store.getState().series.loading.isLoadingItems).toBe(false);
    });
  });

  describe("Storage Persistence Edge Cases", () => {
    it("should handle AsyncStorage quota exceeded error", async () => {
      mockedAsyncStorage.setItem.mockRejectedValue(new Error("QuotaExceededError"));

      const newSortConfig = { field: "name" as const, direction: "desc" as const };
      await store.getState().setSeriesSortConfig(newSortConfig);

      // Should still update state even if storage fails
      expect(store.getState().series.sortConfig).toEqual(newSortConfig);
    });

    it("should handle corrupted storage data gracefully", async () => {
      mockedAsyncStorage.getItem.mockResolvedValue("{ corrupted json");

      await store.getState()._loadSeriesSettingsFromStorage();

      // Should fall back to default config
      expect(store.getState().series.sortConfig).toEqual(DEFAULT_SERIES_SORT_CONFIG);
    });

    it("should handle partial configuration objects from storage", async () => {
      mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify({ field: "name" }));

      await store.getState()._loadSeriesSettingsFromStorage();

      // Should handle partial config (even though it's invalid, it shouldn't crash)
      expect(store.getState().series.sortConfig).toBeDefined();
    });

    it("should handle storage unavailable error", async () => {
      mockedAsyncStorage.getItem.mockRejectedValue(new Error("Storage unavailable"));
      mockedAsyncStorage.setItem.mockRejectedValue(new Error("Storage unavailable"));

      // Loading should not throw
      await expect(store.getState()._loadSeriesSettingsFromStorage()).resolves.not.toThrow();

      // Setting should not throw
      await expect(
        store.getState().setSeriesSortConfig({ field: "name", direction: "asc" })
      ).resolves.not.toThrow();
    });
  });

  describe("Integration Tests", () => {
    it("should complete full lifecycle: init -> fetch -> sort -> reset", async () => {
      // Initialize
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);
      await store.getState().initializeSeries(true, true);

      expect(store.getState().series.initialized).toBe(true);
      expect(store.getState().series.ready).toBe(true);

      // Fetch
      await store.getState().refetchSeries();
      expect(store.getState().series.series.length).toBeGreaterThan(0);

      // Sort
      await store.getState().setSeriesSortConfig({ field: "name", direction: "desc" });
      expect(store.getState().series.sortConfig.field).toBe("name");

      // Reset
      store.getState().resetSeries();
      expect(store.getState().series.initialized).toBe(false);
      expect(store.getState().series.series).toEqual([]);
    });

    it("should handle reinitialization after reset", async () => {
      // First initialization
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);
      await store.getState().initializeSeries(true, true);

      // Reset
      store.getState().resetSeries();

      // Second initialization
      await store.getState().initializeSeries(true, true);

      expect(store.getState().series.initialized).toBe(true);
      expect(store.getState().series.ready).toBe(true);
    });

    it("should persist and restore sort configuration across resets", async () => {
      const customSortConfig = { field: "bookCount" as const, direction: "desc" as const };

      // Set custom sort config
      await store.getState().setSeriesSortConfig(customSortConfig);

      // Simulate storage persistence
      mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify(customSortConfig));

      // Reset and reinitialize
      store.getState().resetSeries();
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);
      await store.getState().initializeSeries(true, true);

      // Should restore from storage
      expect(store.getState().series.sortConfig).toEqual(customSortConfig);
    });
  });

  describe("Error Recovery", () => {
    it("should recover from database errors on retry", async () => {
      // First call fails
      getAllSeries.mockRejectedValueOnce(new Error("Database connection lost"));
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);

      await store.getState().initializeSeries(true, true);

      // First initialization fails but state should be stable
      expect(store.getState().series.loading.isInitializing).toBe(false);

      // Retry succeeds
      getAllSeries.mockResolvedValue(mockSeries);
      await store.getState().refetchSeries();

      expect(store.getState().series.series).toEqual(mockSeries);
    });

    it("should handle transformation errors gracefully", async () => {
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockImplementation(() => {
        throw new Error("Transformation error");
      });

      await store.getState().initializeSeries(true, true);

      // Should not crash the app
      expect(store.getState().series.initialized).toBe(true);
    });

    it("should maintain state consistency after multiple errors", async () => {
      getAllSeries.mockResolvedValue(mockSeries);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);

      await store.getState().initializeSeries(true, true);

      // Multiple failed refetches
      getAllSeries.mockRejectedValue(new Error("Error 1"));
      await store.getState().refetchSeries();

      getAllSeries.mockRejectedValue(new Error("Error 2"));
      await store.getState().refetchSeries();

      // State should still be valid
      expect(store.getState().series.initialized).toBe(true);
      expect(store.getState().series.loading.isLoadingItems).toBe(false);
    });
  });
});
