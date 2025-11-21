/**
 * Tests for home slice
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { create } from "zustand";
import { createHomeSlice, HomeSlice } from "../homeSlice";

// Mock database helpers
jest.mock("@/db/helpers/homeScreen", () => ({
  getHomeScreenData: jest.fn(),
  getContinueListeningItems: jest.fn(),
  getDownloadedItems: jest.fn(),
  getListenAgainItems: jest.fn(),
}));

// Mock logger
jest.mock("@/lib/logger", () => ({
  logger: {
    forTag: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    })),
  },
}));

describe("HomeSlice", () => {
  let store: ReturnType<typeof create<HomeSlice>>;

  // Get mocked functions for type safety
  const {
    getHomeScreenData,
    getContinueListeningItems,
    getDownloadedItems,
    getListenAgainItems,
  } = require("@/db/helpers/homeScreen");

  // Mock data
  const mockContinueListeningItems = [
    {
      id: "item-1",
      title: "Book 1",
      mediaType: "book" as const,
      progress: 0.5,
      lastPlayedAt: Date.now(),
    },
    {
      id: "item-2",
      title: "Podcast 1",
      mediaType: "podcast" as const,
      progress: 0.3,
      lastPlayedAt: Date.now() - 1000,
    },
  ];

  const mockDownloadedItems = [
    {
      id: "item-3",
      title: "Downloaded Book",
      mediaType: "book" as const,
      progress: 0,
      lastPlayedAt: null,
    },
  ];

  const mockListenAgainItems = [
    {
      id: "item-4",
      title: "Finished Book",
      mediaType: "book" as const,
      progress: 1,
      lastPlayedAt: Date.now() - 10000,
    },
  ];

  const mockHomeScreenData = {
    continueListening: mockContinueListeningItems,
    downloaded: mockDownloadedItems,
    listenAgain: mockListenAgainItems,
  };

  beforeEach(() => {
    // Reset Date.now() to a fixed timestamp for consistent testing
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2024-01-01T00:00:00Z"));

    // Create a test store
    store = create<HomeSlice>()((set, get) => ({
      ...createHomeSlice(set, get),
    }));

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock implementations
    getHomeScreenData.mockResolvedValue(mockHomeScreenData);
    getContinueListeningItems.mockResolvedValue(mockContinueListeningItems);
    getDownloadedItems.mockResolvedValue(mockDownloadedItems);
    getListenAgainItems.mockResolvedValue(mockListenAgainItems);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe("Initial State", () => {
    it("should have correct initial state", () => {
      const state = store.getState();

      expect(state.home).toEqual({
        continueListening: [],
        downloaded: [],
        listenAgain: [],
        loading: {
          isLoadingHome: false,
          isRefreshingSection: false,
        },
        initialized: false,
        lastFetchTime: null,
        userId: null,
      });
    });
  });

  describe("initializeHome", () => {
    it("should initialize home slice successfully", async () => {
      await store.getState().initializeHome("user-1");

      const state = store.getState();
      expect(state.home.continueListening).toEqual(mockContinueListeningItems);
      expect(state.home.downloaded).toEqual(mockDownloadedItems);
      expect(state.home.listenAgain).toEqual(mockListenAgainItems);
      expect(state.home.initialized).toBe(true);
      expect(state.home.userId).toBe("user-1");
      expect(state.home.lastFetchTime).toBe(Date.now());
      expect(state.home.loading.isLoadingHome).toBe(false);

      expect(getHomeScreenData).toHaveBeenCalledWith("user-1");
    });

    it("should set loading state during initialization", async () => {
      let loadingState: boolean | undefined;

      getHomeScreenData.mockImplementation(async () => {
        loadingState = store.getState().home.loading.isLoadingHome;
        return mockHomeScreenData;
      });

      await store.getState().initializeHome("user-1");

      expect(loadingState).toBe(true);
      expect(store.getState().home.loading.isLoadingHome).toBe(false);
    });

    it("should skip initialization if already initialized with valid cache for same user", async () => {
      // First initialization
      await store.getState().initializeHome("user-1");

      jest.clearAllMocks();

      // Second initialization (should be skipped)
      await store.getState().initializeHome("user-1");

      expect(getHomeScreenData).not.toHaveBeenCalled();
    });

    it("should reinitialize if cache is expired", async () => {
      // First initialization
      await store.getState().initializeHome("user-1");

      jest.clearAllMocks();

      // Advance time beyond cache validity (5 minutes + 1 second)
      jest.advanceTimersByTime(5 * 60 * 1000 + 1000);

      // Second initialization (should not be skipped)
      await store.getState().initializeHome("user-1");

      expect(getHomeScreenData).toHaveBeenCalledWith("user-1");
    });

    it("should reinitialize if user ID changes", async () => {
      // First initialization with user-1
      await store.getState().initializeHome("user-1");

      jest.clearAllMocks();

      // Initialize with different user (should not be skipped)
      await store.getState().initializeHome("user-2");

      expect(getHomeScreenData).toHaveBeenCalledWith("user-2");
      expect(store.getState().home.userId).toBe("user-2");
    });

    it("should handle errors and reset loading state", async () => {
      const error = new Error("Database error");
      getHomeScreenData.mockRejectedValue(error);

      await expect(store.getState().initializeHome("user-1")).rejects.toThrow("Database error");

      const state = store.getState();
      expect(state.home.loading.isLoadingHome).toBe(false);
      // State should remain uninitialized after error
      expect(state.home.initialized).toBe(false);
    });

    it("should update lastFetchTime on successful initialization", async () => {
      const startTime = Date.now();

      await store.getState().initializeHome("user-1");

      const state = store.getState();
      expect(state.home.lastFetchTime).toBe(startTime);
    });

    it("should handle empty data from database", async () => {
      getHomeScreenData.mockResolvedValue({
        continueListening: [],
        downloaded: [],
        listenAgain: [],
      });

      await store.getState().initializeHome("user-1");

      const state = store.getState();
      expect(state.home.continueListening).toEqual([]);
      expect(state.home.downloaded).toEqual([]);
      expect(state.home.listenAgain).toEqual([]);
      expect(state.home.initialized).toBe(true);
    });
  });

  describe("refreshHome", () => {
    beforeEach(async () => {
      // Initialize the slice first
      await store.getState().initializeHome("user-1");
      jest.clearAllMocks();
    });

    it("should refresh home data successfully", async () => {
      const newData = {
        continueListening: [mockContinueListeningItems[0]],
        downloaded: [],
        listenAgain: mockListenAgainItems,
      };
      getHomeScreenData.mockResolvedValue(newData);

      // Advance time to make cache invalid
      jest.advanceTimersByTime(6 * 60 * 1000);

      await store.getState().refreshHome("user-1");

      const state = store.getState();
      expect(state.home.continueListening).toEqual(newData.continueListening);
      expect(state.home.downloaded).toEqual(newData.downloaded);
      expect(state.home.listenAgain).toEqual(newData.listenAgain);
      expect(getHomeScreenData).toHaveBeenCalledWith("user-1");
    });

    it("should skip refresh if cache is still valid and not forcing", async () => {
      await store.getState().refreshHome("user-1");

      expect(getHomeScreenData).not.toHaveBeenCalled();
    });

    it("should force refresh even with valid cache when force is true", async () => {
      await store.getState().refreshHome("user-1", true);

      expect(getHomeScreenData).toHaveBeenCalledWith("user-1");
    });

    it("should refresh if user ID changes", async () => {
      await store.getState().refreshHome("user-2");

      expect(getHomeScreenData).toHaveBeenCalledWith("user-2");
      expect(store.getState().home.userId).toBe("user-2");
    });

    it("should set loading state during refresh", async () => {
      let loadingState: boolean | undefined;

      getHomeScreenData.mockImplementation(async () => {
        loadingState = store.getState().home.loading.isLoadingHome;
        return mockHomeScreenData;
      });

      await store.getState().refreshHome("user-1", true);

      expect(loadingState).toBe(true);
      expect(store.getState().home.loading.isLoadingHome).toBe(false);
    });

    it("should handle errors and reset loading state", async () => {
      const error = new Error("Refresh error");
      getHomeScreenData.mockRejectedValue(error);

      await expect(store.getState().refreshHome("user-1", true)).rejects.toThrow("Refresh error");

      const state = store.getState();
      expect(state.home.loading.isLoadingHome).toBe(false);
    });

    it("should update lastFetchTime on successful refresh", async () => {
      const timeBeforeRefresh = Date.now();
      jest.advanceTimersByTime(1000);

      await store.getState().refreshHome("user-1", true);

      const state = store.getState();
      expect(state.home.lastFetchTime).toBeGreaterThan(timeBeforeRefresh);
    });

    it("should not modify state on error", async () => {
      const stateBefore = store.getState().home;
      getHomeScreenData.mockRejectedValue(new Error("Error"));

      try {
        await store.getState().refreshHome("user-1", true);
      } catch {
        // Expected error
      }

      const stateAfter = store.getState().home;
      // Data should remain unchanged (except loading state)
      expect(stateAfter.continueListening).toEqual(stateBefore.continueListening);
      expect(stateAfter.downloaded).toEqual(stateBefore.downloaded);
      expect(stateAfter.listenAgain).toEqual(stateBefore.listenAgain);
    });
  });

  describe("refreshSection", () => {
    beforeEach(async () => {
      await store.getState().initializeHome("user-1");
      jest.clearAllMocks();
    });

    it("should refresh continueListening section", async () => {
      const newItems = [mockContinueListeningItems[0]];
      getContinueListeningItems.mockResolvedValue(newItems);

      await store.getState().refreshSection("continueListening", "user-1");

      const state = store.getState();
      expect(state.home.continueListening).toEqual(newItems);
      expect(getContinueListeningItems).toHaveBeenCalledWith("user-1");
      expect(state.home.loading.isRefreshingSection).toBe(false);
    });

    it("should refresh downloaded section", async () => {
      const newItems = [
        ...mockDownloadedItems,
        {
          id: "item-5",
          title: "New Download",
          mediaType: "book" as const,
          progress: 0,
          lastPlayedAt: null,
        },
      ];
      getDownloadedItems.mockResolvedValue(newItems);

      await store.getState().refreshSection("downloaded", "user-1");

      const state = store.getState();
      expect(state.home.downloaded).toEqual(newItems);
      expect(getDownloadedItems).toHaveBeenCalled();
      expect(state.home.loading.isRefreshingSection).toBe(false);
    });

    it("should refresh listenAgain section", async () => {
      const newItems = [...mockListenAgainItems, ...mockListenAgainItems];
      getListenAgainItems.mockResolvedValue(newItems);

      await store.getState().refreshSection("listenAgain", "user-1");

      const state = store.getState();
      expect(state.home.listenAgain).toEqual(newItems);
      expect(getListenAgainItems).toHaveBeenCalledWith("user-1");
      expect(state.home.loading.isRefreshingSection).toBe(false);
    });

    it("should set loading state during section refresh", async () => {
      let loadingState: boolean | undefined;

      getContinueListeningItems.mockImplementation(async () => {
        loadingState = store.getState().home.loading.isRefreshingSection;
        return mockContinueListeningItems;
      });

      await store.getState().refreshSection("continueListening", "user-1");

      expect(loadingState).toBe(true);
      expect(store.getState().home.loading.isRefreshingSection).toBe(false);
    });

    it("should handle errors and reset loading state", async () => {
      const error = new Error("Section refresh error");
      getContinueListeningItems.mockRejectedValue(error);

      await expect(
        store.getState().refreshSection("continueListening", "user-1")
      ).rejects.toThrow("Section refresh error");

      const state = store.getState();
      expect(state.home.loading.isRefreshingSection).toBe(false);
    });

    it("should update lastFetchTime on successful section refresh", async () => {
      const timeBeforeRefresh = Date.now();
      jest.advanceTimersByTime(1000);

      await store.getState().refreshSection("continueListening", "user-1");

      const state = store.getState();
      expect(state.home.lastFetchTime).toBeGreaterThan(timeBeforeRefresh);
    });

    it("should handle empty section data", async () => {
      getContinueListeningItems.mockResolvedValue([]);

      await store.getState().refreshSection("continueListening", "user-1");

      const state = store.getState();
      expect(state.home.continueListening).toEqual([]);
      expect(state.home.loading.isRefreshingSection).toBe(false);
    });

    it("should not modify other sections when refreshing one section", async () => {
      const originalDownloaded = store.getState().home.downloaded;
      const originalListenAgain = store.getState().home.listenAgain;

      await store.getState().refreshSection("continueListening", "user-1");

      const state = store.getState();
      expect(state.home.downloaded).toEqual(originalDownloaded);
      expect(state.home.listenAgain).toEqual(originalListenAgain);
    });
  });

  describe("resetHome", () => {
    it("should reset home slice to initial state", async () => {
      // Initialize and modify state
      await store.getState().initializeHome("user-1");

      // Reset
      store.getState().resetHome();

      const state = store.getState();
      expect(state.home.continueListening).toEqual([]);
      expect(state.home.downloaded).toEqual([]);
      expect(state.home.listenAgain).toEqual([]);
      expect(state.home.initialized).toBe(false);
      expect(state.home.lastFetchTime).toBeNull();
      expect(state.home.userId).toBeNull();
      expect(state.home.loading).toEqual({
        isLoadingHome: false,
        isRefreshingSection: false,
      });
    });

    it("should reset even if already in initial state", () => {
      store.getState().resetHome();

      const state = store.getState();
      expect(state.home.initialized).toBe(false);
      expect(state.home.continueListening).toEqual([]);
    });

    it("should reset loading states", async () => {
      // Start a refresh to set loading states
      const promise = store.getState().initializeHome("user-1");

      // Reset while loading (not recommended in practice, but should be safe)
      store.getState().resetHome();

      // Wait for the promise to settle
      try {
        await promise;
      } catch {
        // Ignore errors
      }

      const state = store.getState();
      expect(state.home.loading.isLoadingHome).toBe(false);
      expect(state.home.loading.isRefreshingSection).toBe(false);
    });
  });

  describe("_isHomeCacheValid", () => {
    it("should return false when lastFetchTime is null", () => {
      const isValid = store.getState()._isHomeCacheValid();

      expect(isValid).toBe(false);
    });

    it("should return true when cache is within validity period", async () => {
      await store.getState().initializeHome("user-1");

      // Advance time by 4 minutes (less than 5 minute cache duration)
      jest.advanceTimersByTime(4 * 60 * 1000);

      const isValid = store.getState()._isHomeCacheValid();

      expect(isValid).toBe(true);
    });

    it("should return false when cache has expired", async () => {
      await store.getState().initializeHome("user-1");

      // Advance time by 6 minutes (more than 5 minute cache duration)
      jest.advanceTimersByTime(6 * 60 * 1000);

      const isValid = store.getState()._isHomeCacheValid();

      expect(isValid).toBe(false);
    });

    it("should return true exactly at cache boundary", async () => {
      await store.getState().initializeHome("user-1");

      // Advance time by exactly 5 minutes minus 1ms
      jest.advanceTimersByTime(5 * 60 * 1000 - 1);

      const isValid = store.getState()._isHomeCacheValid();

      expect(isValid).toBe(true);
    });

    it("should return false exactly at cache expiration", async () => {
      await store.getState().initializeHome("user-1");

      // Advance time by exactly 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000);

      const isValid = store.getState()._isHomeCacheValid();

      expect(isValid).toBe(false);
    });
  });

  describe("Cache Behavior", () => {
    it("should use cached data within validity period", async () => {
      await store.getState().initializeHome("user-1");

      jest.clearAllMocks();

      // Advance time by 2 minutes
      jest.advanceTimersByTime(2 * 60 * 1000);

      await store.getState().initializeHome("user-1");
      await store.getState().refreshHome("user-1");

      // Should not fetch new data
      expect(getHomeScreenData).not.toHaveBeenCalled();
    });

    it("should fetch fresh data after cache expiration", async () => {
      await store.getState().initializeHome("user-1");

      jest.clearAllMocks();

      // Advance time by 6 minutes (past expiration)
      jest.advanceTimersByTime(6 * 60 * 1000);

      await store.getState().refreshHome("user-1");

      // Should fetch new data
      expect(getHomeScreenData).toHaveBeenCalledWith("user-1");
    });

    it("should invalidate cache when user changes", async () => {
      await store.getState().initializeHome("user-1");

      jest.clearAllMocks();

      // Change user (even with valid cache)
      await store.getState().refreshHome("user-2");

      // Should fetch new data for new user
      expect(getHomeScreenData).toHaveBeenCalledWith("user-2");
    });

    it("should update cache timestamp after refresh", async () => {
      await store.getState().initializeHome("user-1");

      const firstFetchTime = store.getState().home.lastFetchTime;

      // Advance time by 6 minutes
      jest.advanceTimersByTime(6 * 60 * 1000);

      await store.getState().refreshHome("user-1");

      const secondFetchTime = store.getState().home.lastFetchTime;

      expect(secondFetchTime).toBeGreaterThan(firstFetchTime!);
    });
  });

  describe("Edge Cases", () => {
    it("should handle concurrent initializations", async () => {
      const promise1 = store.getState().initializeHome("user-1");
      const promise2 = store.getState().initializeHome("user-1");

      await Promise.all([promise1, promise2]);

      // Due to race conditions, concurrent calls may both run if they check
      // the initialized state before the first one completes
      expect(getHomeScreenData).toHaveBeenCalled();
      // State should be consistent after both complete
      expect(store.getState().home.initialized).toBe(true);
      expect(store.getState().home.userId).toBe("user-1");
    });

    it("should handle concurrent section refreshes", async () => {
      await store.getState().initializeHome("user-1");

      await Promise.all([
        store.getState().refreshSection("continueListening", "user-1"),
        store.getState().refreshSection("downloaded", "user-1"),
        store.getState().refreshSection("listenAgain", "user-1"),
      ]);

      expect(getContinueListeningItems).toHaveBeenCalledWith("user-1");
      expect(getDownloadedItems).toHaveBeenCalled();
      expect(getListenAgainItems).toHaveBeenCalledWith("user-1");

      // All sections should be updated
      const state = store.getState();
      expect(state.home.continueListening).toEqual(mockContinueListeningItems);
      expect(state.home.downloaded).toEqual(mockDownloadedItems);
      expect(state.home.listenAgain).toEqual(mockListenAgainItems);
    });

    it("should handle refresh after error in initialization", async () => {
      getHomeScreenData.mockRejectedValueOnce(new Error("Init error"));

      try {
        await store.getState().initializeHome("user-1");
      } catch {
        // Expected error
      }

      // Now try to refresh
      getHomeScreenData.mockResolvedValue(mockHomeScreenData);
      await store.getState().refreshHome("user-1", true);

      const state = store.getState();
      expect(state.home.continueListening).toEqual(mockContinueListeningItems);
    });

    it("should handle very large data sets", async () => {
      const largeDataSet = Array.from({ length: 1000 }, (_, i) => ({
        id: `item-${i}`,
        title: `Item ${i}`,
        mediaType: "book" as const,
        progress: Math.random(),
        lastPlayedAt: Date.now() - i * 1000,
      }));

      getHomeScreenData.mockResolvedValue({
        continueListening: largeDataSet,
        downloaded: largeDataSet,
        listenAgain: largeDataSet,
      });

      await store.getState().initializeHome("user-1");

      const state = store.getState();
      expect(state.home.continueListening).toHaveLength(1000);
      expect(state.home.downloaded).toHaveLength(1000);
      expect(state.home.listenAgain).toHaveLength(1000);
    });

    it("should preserve data integrity across multiple operations", async () => {
      // Initialize
      await store.getState().initializeHome("user-1");

      // Refresh a section
      getContinueListeningItems.mockResolvedValue([mockContinueListeningItems[0]]);
      await store.getState().refreshSection("continueListening", "user-1");

      // Force refresh all
      jest.advanceTimersByTime(1000);
      await store.getState().refreshHome("user-1", true);

      // Reset
      store.getState().resetHome();

      // Initialize again
      await store.getState().initializeHome("user-2");

      const state = store.getState();
      expect(state.home.userId).toBe("user-2");
      expect(state.home.continueListening).toEqual(mockContinueListeningItems);
    });

    it("should handle empty user ID", async () => {
      await store.getState().initializeHome("");

      expect(getHomeScreenData).toHaveBeenCalledWith("");
      expect(store.getState().home.userId).toBe("");
    });

    it("should handle special characters in user ID", async () => {
      const specialUserId = "user@test#123!";

      await store.getState().initializeHome(specialUserId);

      expect(getHomeScreenData).toHaveBeenCalledWith(specialUserId);
      expect(store.getState().home.userId).toBe(specialUserId);
    });
  });

  describe("Data Consistency", () => {
    it("should maintain state consistency after partial failure", async () => {
      await store.getState().initializeHome("user-1");

      const stateBefore = { ...store.getState().home };

      // Fail one section refresh
      getContinueListeningItems.mockRejectedValue(new Error("Partial error"));

      try {
        await store.getState().refreshSection("continueListening", "user-1");
      } catch {
        // Expected error
      }

      const stateAfter = store.getState().home;
      // Other sections should remain unchanged
      expect(stateAfter.downloaded).toEqual(stateBefore.downloaded);
      expect(stateAfter.listenAgain).toEqual(stateBefore.listenAgain);
    });

    it("should not lose data when switching between users", async () => {
      // Initialize for user-1
      await store.getState().initializeHome("user-1");
      const user1Data = { ...store.getState().home };

      // Switch to user-2
      const user2Data = {
        continueListening: [mockContinueListeningItems[0]],
        downloaded: [],
        listenAgain: [],
      };
      getHomeScreenData.mockResolvedValue(user2Data);
      await store.getState().initializeHome("user-2");

      const state = store.getState();
      expect(state.home.userId).toBe("user-2");
      expect(state.home.continueListening).toEqual(user2Data.continueListening);

      // Verify user-1 data was properly replaced
      expect(state.home.continueListening).not.toEqual(user1Data.continueListening);
    });
  });

  describe("Performance", () => {
    it("should complete initialization quickly", async () => {
      const start = Date.now();

      await store.getState().initializeHome("user-1");

      const duration = Date.now() - start;

      // Should complete initialization (mocked) almost instantly
      expect(duration).toBeLessThan(100);
    });

    it("should handle rapid successive refreshes", async () => {
      await store.getState().initializeHome("user-1");

      jest.advanceTimersByTime(6 * 60 * 1000);

      // Trigger multiple refreshes in quick succession
      const promises = Array.from({ length: 10 }, () =>
        store.getState().refreshHome("user-1", true)
      );

      await Promise.all(promises);

      // All should complete without error
      const state = store.getState();
      expect(state.home.loading.isLoadingHome).toBe(false);
    });
  });
});
