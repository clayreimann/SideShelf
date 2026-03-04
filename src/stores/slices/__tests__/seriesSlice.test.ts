/**
 * Tests for series slice
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create, type StoreApi, type UseBoundStore } from "zustand";
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

jest.mock("@/db/helpers/mediaProgress", () => ({
  getMediaProgressForItems: jest.fn(),
}));

describe("SeriesSlice", () => {
  let store: UseBoundStore<StoreApi<SeriesSlice>>;

  // Get mocked functions for type safety
  const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
  const { getAllSeries, transformSeriesToDisplayFormat } = require("@/db/helpers/series");
  const { getMediaProgressForItems } = require("@/db/helpers/mediaProgress");

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
      description: null,
      addedAt: null,
      updatedAt: null,
      bookCount: 5,
      firstBookCoverUrl: null,
    },
    {
      id: "series-2",
      name: "Series Two",
      description: null,
      addedAt: null,
      updatedAt: null,
      bookCount: 3,
      firstBookCoverUrl: null,
    },
    {
      id: "series-3",
      name: "Another Series",
      description: null,
      addedAt: null,
      updatedAt: null,
      bookCount: 8,
      firstBookCoverUrl: null,
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
    getMediaProgressForItems.mockResolvedValue({});
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
        progressMap: {},
        progressMapSeriesId: null,
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
      const newSortConfig = { field: "bookCount" as const, direction: "desc" as const };

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
        { id: "new-series", name: "New Series", description: null, addedAt: null, updatedAt: null, bookCount: 1, firstBookCoverUrl: null },
      ];
      store.getState().series.rawItems = modifiedRawItems;

      store.getState()._sortSeriesItems();

      const sortedItems = store.getState().series.items;
      expect(sortedItems.length).toBe(modifiedRawItems.length);
    });
  });

  describe("fetchSeriesProgress", () => {
    const mockSeriesWithBooks = [
      {
        id: "series-1",
        name: "Series One",
        books: [
          { libraryItemId: "item-1" },
          { libraryItemId: "item-2" },
          { libraryItemId: "item-3" },
        ],
      },
    ];

    const mockProgressRow = {
      id: "progress-1",
      userId: "user-1",
      libraryItemId: "item-1",
      episodeId: null,
      duration: 3600,
      progress: 0.5,
      currentTime: 1800,
      isFinished: false,
      hideFromContinueListening: false,
      lastUpdate: new Date("2024-01-01"),
      startedAt: new Date("2024-01-01"),
      finishedAt: null,
    };

    beforeEach(async () => {
      getAllSeries.mockResolvedValue(mockSeriesWithBooks);
      transformSeriesToDisplayFormat.mockReturnValue(mockDisplaySeries);
      await store.getState().initializeSeries(true, true);
      jest.clearAllMocks();
      getMediaProgressForItems.mockResolvedValue({});
    });

    it("fetchSeriesProgress calls getMediaProgressForItems with correct args", async () => {
      getMediaProgressForItems.mockResolvedValue({});

      await store.getState().fetchSeriesProgress("series-1", "user-1");

      expect(getMediaProgressForItems).toHaveBeenCalledWith(
        ["item-1", "item-2", "item-3"],
        "user-1"
      );
    });

    it("fetchSeriesProgress sets progressMap and progressMapSeriesId in state", async () => {
      const progressMap = { "item-1": mockProgressRow };
      getMediaProgressForItems.mockResolvedValue(progressMap);

      await store.getState().fetchSeriesProgress("series-1", "user-1");

      const state = store.getState();
      expect(state.series.progressMap).toEqual(progressMap);
      expect(state.series.progressMapSeriesId).toBe("series-1");
    });

    it("fetchSeriesProgress with empty libraryItemIds sets empty progressMap", async () => {
      getAllSeries.mockResolvedValue([{ id: "series-empty", name: "Empty", books: [] }]);
      await store.getState().refetchSeries();
      getMediaProgressForItems.mockResolvedValue({});

      await store.getState().fetchSeriesProgress("series-empty", "user-1");

      const state = store.getState();
      expect(state.series.progressMap).toEqual({});
      expect(state.series.progressMapSeriesId).toBe("series-empty");
    });

    it("progressMap is keyed by libraryItemId", async () => {
      const progressMap = {
        "item-1": { ...mockProgressRow, libraryItemId: "item-1" },
        "item-2": { ...mockProgressRow, id: "progress-2", libraryItemId: "item-2" },
      };
      getMediaProgressForItems.mockResolvedValue(progressMap);

      await store.getState().fetchSeriesProgress("series-1", "user-1");

      const state = store.getState();
      expect(Object.keys(state.series.progressMap)).toEqual(["item-1", "item-2"]);
      expect(state.series.progressMap["item-1"].libraryItemId).toBe("item-1");
    });
  });
});
