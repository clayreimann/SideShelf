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
});
