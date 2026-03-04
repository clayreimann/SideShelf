/**
 * Tests for logger slice
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { createLoggerSlice, LoggerSlice } from "../loggerSlice";

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock logger module — note: getAllTags is SYNCHRONOUS
jest.mock("@/lib/logger", () => ({
  getErrorCount: jest.fn(),
  getWarningCount: jest.fn(),
  getErrorCountSince: jest.fn(),
  getWarningCountSince: jest.fn(),
  getAllTags: jest.fn(),
}));

describe("LoggerSlice", () => {
  let store: UseBoundStore<StoreApi<LoggerSlice>>;

  const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
  const {
    getErrorCount,
    getWarningCount,
    getErrorCountSince,
    getWarningCountSince,
    getAllTags,
  } = require("@/lib/logger");

  beforeEach(() => {
    store = create<LoggerSlice>()((set, get) => ({
      ...createLoggerSlice(set, get),
    }));

    jest.clearAllMocks();

    // Setup default mock implementations
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedAsyncStorage.setItem.mockResolvedValue();
    mockedAsyncStorage.removeItem.mockResolvedValue();
    getErrorCount.mockReturnValue(0);
    getWarningCount.mockReturnValue(0);
    getErrorCountSince.mockReturnValue(0);
    getWarningCountSince.mockReturnValue(0);
    getAllTags.mockReturnValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Initial State", () => {
    it("should have correct initial state", () => {
      const state = store.getState();

      expect(state.logger.errorCount).toBe(0);
      expect(state.logger.warningCount).toBe(0);
      expect(state.logger.errorsAcknowledgedTimestamp).toBeNull();
      expect(state.logger.initialized).toBe(false);
    });

    it("availableTags defaults to [] in initial state", () => {
      const state = store.getState();
      expect(state.logger.availableTags).toEqual([]);
    });
  });

  describe("initialize", () => {
    it("should load error counts on initialization", async () => {
      getErrorCount.mockReturnValue(3);
      getWarningCount.mockReturnValue(1);

      await store.getState().logger.initialize();

      const state = store.getState();
      expect(state.logger.errorCount).toBe(3);
      expect(state.logger.warningCount).toBe(1);
      expect(state.logger.initialized).toBe(true);
    });

    it("initialize populates availableTags via getAllTags()", async () => {
      getAllTags.mockReturnValue(["PlayerService", "DownloadService", "App"]);

      await store.getState().logger.initialize();

      const state = store.getState();
      expect(getAllTags).toHaveBeenCalled();
      expect(state.logger.availableTags).toEqual(["PlayerService", "DownloadService", "App"]);
    });

    it("should skip initialization if already initialized", async () => {
      getAllTags.mockReturnValue(["tag-1"]);
      await store.getState().logger.initialize();

      jest.clearAllMocks();
      getAllTags.mockReturnValue(["tag-2"]);

      await store.getState().logger.initialize();

      // Should not re-populate
      expect(getAllTags).not.toHaveBeenCalled();
    });

    it("should load acknowledgment timestamp from AsyncStorage", async () => {
      const timestamp = Date.now() - 1000;
      mockedAsyncStorage.getItem.mockResolvedValue(timestamp.toString());

      await store.getState().logger.initialize();

      // If no errors since then, timestamp stays
      const state = store.getState();
      expect(state.logger.errorsAcknowledgedTimestamp).toBe(timestamp);
    });
  });

  describe("refreshAvailableTags", () => {
    it("refreshAvailableTags updates availableTags synchronously", () => {
      getAllTags.mockReturnValue(["NewTag1", "NewTag2"]);

      store.getState().logger.refreshAvailableTags();

      expect(getAllTags).toHaveBeenCalled();
      expect(store.getState().logger.availableTags).toEqual(["NewTag1", "NewTag2"]);
    });

    it("refreshAvailableTags replaces old tags with new tags", async () => {
      // First initialize with some tags
      getAllTags.mockReturnValue(["OldTag"]);
      await store.getState().logger.initialize();
      expect(store.getState().logger.availableTags).toEqual(["OldTag"]);

      // Now refresh with new tags
      getAllTags.mockReturnValue(["NewTag1", "NewTag2", "NewTag3"]);
      store.getState().logger.refreshAvailableTags();

      expect(store.getState().logger.availableTags).toEqual(["NewTag1", "NewTag2", "NewTag3"]);
    });

    it("refreshAvailableTags with empty tags sets empty array", () => {
      getAllTags.mockReturnValue([]);

      store.getState().logger.refreshAvailableTags();

      expect(store.getState().logger.availableTags).toEqual([]);
    });
  });

  describe("updateErrorCounts", () => {
    it("should update error and warning counts from logger", () => {
      getErrorCount.mockReturnValue(5);
      getWarningCount.mockReturnValue(2);

      store.getState().logger.updateErrorCounts();

      const state = store.getState();
      expect(state.logger.errorCount).toBe(5);
      expect(state.logger.warningCount).toBe(2);
    });
  });

  describe("acknowledgeErrors", () => {
    it("should set acknowledgment timestamp", async () => {
      const before = Date.now();
      await store.getState().logger.acknowledgeErrors();
      const after = Date.now();

      const state = store.getState();
      expect(state.logger.errorsAcknowledgedTimestamp).toBeGreaterThanOrEqual(before);
      expect(state.logger.errorsAcknowledgedTimestamp).toBeLessThanOrEqual(after);
    });
  });

  describe("resetErrorAcknowledgment", () => {
    it("should clear acknowledgment timestamp", async () => {
      await store.getState().logger.acknowledgeErrors();
      expect(store.getState().logger.errorsAcknowledgedTimestamp).not.toBeNull();

      await store.getState().logger.resetErrorAcknowledgment();
      expect(store.getState().logger.errorsAcknowledgedTimestamp).toBeNull();
    });
  });
});
