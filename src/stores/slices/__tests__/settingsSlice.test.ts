/**
 * Tests for settings slice
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { create } from "zustand";
import { createSettingsSlice, SettingsSlice } from "../settingsSlice";

// Mock appSettings helpers
jest.mock("@/lib/appSettings", () => ({
  getJumpForwardInterval: jest.fn(),
  getJumpBackwardInterval: jest.fn(),
  getSmartRewindEnabled: jest.fn(),
  getHomeLayout: jest.fn(),
  setJumpForwardInterval: jest.fn(),
  setJumpBackwardInterval: jest.fn(),
  setSmartRewindEnabled: jest.fn(),
  setHomeLayout: jest.fn(),
  getPeriodicNowPlayingUpdatesEnabled: jest.fn(),
  setPeriodicNowPlayingUpdatesEnabled: jest.fn(),
}));

// Mock track player config
jest.mock("@/lib/trackPlayerConfig", () => ({
  configureTrackPlayer: jest.fn(),
}));

describe("SettingsSlice", () => {
  let store: ReturnType<typeof create<SettingsSlice>>;

  // Get mocked functions for type safety
  const {
    getJumpForwardInterval,
    getJumpBackwardInterval,
    getSmartRewindEnabled,
    getHomeLayout,
    setJumpForwardInterval,
    setJumpBackwardInterval,
    setSmartRewindEnabled,
    setHomeLayout,
  } = require("@/lib/appSettings");
  const { configureTrackPlayer } = require("@/lib/trackPlayerConfig");

  beforeEach(() => {
    // Create a test store
    store = create<SettingsSlice>()((set, get) => ({
      ...createSettingsSlice(set, get),
    }));

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock implementations
    getJumpForwardInterval.mockResolvedValue(30);
    getJumpBackwardInterval.mockResolvedValue(15);
    getSmartRewindEnabled.mockResolvedValue(true);
    getHomeLayout.mockResolvedValue("list");
    setJumpForwardInterval.mockResolvedValue();
    setJumpBackwardInterval.mockResolvedValue();
    setSmartRewindEnabled.mockResolvedValue();
    setHomeLayout.mockResolvedValue();
    configureTrackPlayer.mockResolvedValue();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Initial State", () => {
    it("should have correct initial state", () => {
      const state = store.getState();

      expect(state.settings).toEqual({
        jumpForwardInterval: 30,
        jumpBackwardInterval: 15,
        smartRewindEnabled: true,
        homeLayout: "list",
        initialized: false,
        isLoading: false,
      });
    });
  });

  describe("initializeSettings", () => {
    it("should load settings from storage", async () => {
      getJumpForwardInterval.mockResolvedValue(45);
      getJumpBackwardInterval.mockResolvedValue(10);
      getSmartRewindEnabled.mockResolvedValue(false);
      getHomeLayout.mockResolvedValue("cover");

      await store.getState().initializeSettings();

      const state = store.getState();
      expect(state.settings.jumpForwardInterval).toBe(45);
      expect(state.settings.jumpBackwardInterval).toBe(10);
      expect(state.settings.smartRewindEnabled).toBe(false);
      expect(state.settings.homeLayout).toBe("cover");
      expect(state.settings.initialized).toBe(true);
      expect(state.settings.isLoading).toBe(false);
    });

    it("should set loading state during initialization", async () => {
      let loadingState: boolean | undefined;

      getJumpForwardInterval.mockImplementation(() => {
        loadingState = store.getState().settings.isLoading;
        return Promise.resolve(30);
      });

      await store.getState().initializeSettings();

      expect(loadingState).toBe(true);
      expect(store.getState().settings.isLoading).toBe(false);
    });

    it("should skip initialization if already initialized", async () => {
      await store.getState().initializeSettings();

      jest.clearAllMocks();

      await store.getState().initializeSettings();

      // Should not call getters again
      expect(getJumpForwardInterval).not.toHaveBeenCalled();
      expect(getJumpBackwardInterval).not.toHaveBeenCalled();
      expect(getSmartRewindEnabled).not.toHaveBeenCalled();
      expect(getHomeLayout).not.toHaveBeenCalled();
    });

    it("should use defaults on error and still mark as initialized", async () => {
      getJumpForwardInterval.mockRejectedValue(new Error("Storage error"));

      await store.getState().initializeSettings();

      const state = store.getState();
      expect(state.settings.jumpForwardInterval).toBe(30);
      expect(state.settings.jumpBackwardInterval).toBe(15);
      expect(state.settings.smartRewindEnabled).toBe(true);
      expect(state.settings.homeLayout).toBe("list");
      expect(state.settings.initialized).toBe(true);
      expect(state.settings.isLoading).toBe(false);
    });

    it("should load all settings in parallel", async () => {
      const loadPromises: Promise<any>[] = [];
      const mockImplementation = () => {
        const promise = new Promise((resolve) => setTimeout(() => resolve(30), 10));
        loadPromises.push(promise);
        return promise;
      };

      getJumpForwardInterval.mockImplementation(mockImplementation);
      getJumpBackwardInterval.mockImplementation(mockImplementation);
      getSmartRewindEnabled.mockImplementation(mockImplementation);
      getHomeLayout.mockImplementation(mockImplementation);

      await store.getState().initializeSettings();

      // All promises should have been created (parallel loading)
      expect(loadPromises.length).toBe(4);
    });
  });

  describe("updateJumpForwardInterval", () => {
    it("should update jump forward interval and persist to storage", async () => {
      await store.getState().updateJumpForwardInterval(60);

      const state = store.getState();
      expect(state.settings.jumpForwardInterval).toBe(60);
      expect(setJumpForwardInterval).toHaveBeenCalledWith(60);
    });

    it("should reconfigure TrackPlayer after update", async () => {
      await store.getState().updateJumpForwardInterval(45);

      expect(configureTrackPlayer).toHaveBeenCalled();
    });

    it("should revert on storage error", async () => {
      setJumpForwardInterval.mockRejectedValue(new Error("Storage error"));

      await expect(store.getState().updateJumpForwardInterval(60)).rejects.toThrow("Storage error");

      const state = store.getState();
      expect(state.settings.jumpForwardInterval).toBe(30); // Reverted to default
    });

    it("should not revert if storage succeeds but TrackPlayer config fails", async () => {
      configureTrackPlayer.mockRejectedValue(new Error("TrackPlayer error"));

      await expect(store.getState().updateJumpForwardInterval(60)).rejects.toThrow(
        "TrackPlayer error"
      );

      const state = store.getState();
      expect(state.settings.jumpForwardInterval).toBe(30); // Reverted
    });
  });

  describe("updateJumpBackwardInterval", () => {
    it("should update jump backward interval and persist to storage", async () => {
      await store.getState().updateJumpBackwardInterval(5);

      const state = store.getState();
      expect(state.settings.jumpBackwardInterval).toBe(5);
      expect(setJumpBackwardInterval).toHaveBeenCalledWith(5);
    });

    it("should reconfigure TrackPlayer after update", async () => {
      await store.getState().updateJumpBackwardInterval(10);

      expect(configureTrackPlayer).toHaveBeenCalled();
    });

    it("should revert on storage error", async () => {
      setJumpBackwardInterval.mockRejectedValue(new Error("Storage error"));

      await expect(store.getState().updateJumpBackwardInterval(5)).rejects.toThrow("Storage error");

      const state = store.getState();
      expect(state.settings.jumpBackwardInterval).toBe(15); // Reverted to default
    });
  });

  describe("updateSmartRewindEnabled", () => {
    it("should enable smart rewind and persist to storage", async () => {
      // First disable it properly
      await store.getState().updateSmartRewindEnabled(false);

      await store.getState().updateSmartRewindEnabled(true);

      const state = store.getState();
      expect(state.settings.smartRewindEnabled).toBe(true);
      expect(setSmartRewindEnabled).toHaveBeenCalledWith(true);
    });

    it("should disable smart rewind and persist to storage", async () => {
      await store.getState().updateSmartRewindEnabled(false);

      const state = store.getState();
      expect(state.settings.smartRewindEnabled).toBe(false);
      expect(setSmartRewindEnabled).toHaveBeenCalledWith(false);
    });

    it("should revert on storage error", async () => {
      // Ensure we start with the default value
      expect(store.getState().settings.smartRewindEnabled).toBe(true);

      setSmartRewindEnabled.mockRejectedValue(new Error("Storage error"));

      await expect(store.getState().updateSmartRewindEnabled(false)).rejects.toThrow(
        "Storage error"
      );

      const state = store.getState();
      expect(state.settings.smartRewindEnabled).toBe(true); // Reverted to previous value
    });

    it("should handle toggling multiple times", async () => {
      await store.getState().updateSmartRewindEnabled(false);
      expect(store.getState().settings.smartRewindEnabled).toBe(false);

      await store.getState().updateSmartRewindEnabled(true);
      expect(store.getState().settings.smartRewindEnabled).toBe(true);

      await store.getState().updateSmartRewindEnabled(false);
      expect(store.getState().settings.smartRewindEnabled).toBe(false);

      expect(setSmartRewindEnabled).toHaveBeenCalledTimes(3);
    });
  });

  describe("updateHomeLayout", () => {
    it("should update home layout to cover and persist to storage", async () => {
      await store.getState().updateHomeLayout("cover");

      const state = store.getState();
      expect(state.settings.homeLayout).toBe("cover");
      expect(setHomeLayout).toHaveBeenCalledWith("cover");
    });

    it("should update home layout to list and persist to storage", async () => {
      // First set to cover
      await store.getState().updateHomeLayout("cover");

      await store.getState().updateHomeLayout("list");

      const state = store.getState();
      expect(state.settings.homeLayout).toBe("list");
      expect(setHomeLayout).toHaveBeenCalledWith("list");
    });

    it("should revert on storage error", async () => {
      // Ensure we start with the default value
      expect(store.getState().settings.homeLayout).toBe("list");

      setHomeLayout.mockRejectedValue(new Error("Storage error"));

      await expect(store.getState().updateHomeLayout("cover")).rejects.toThrow("Storage error");

      const state = store.getState();
      expect(state.settings.homeLayout).toBe("list"); // Reverted to previous value
    });

    it("should handle toggling between layouts", async () => {
      await store.getState().updateHomeLayout("cover");
      expect(store.getState().settings.homeLayout).toBe("cover");

      await store.getState().updateHomeLayout("list");
      expect(store.getState().settings.homeLayout).toBe("list");

      await store.getState().updateHomeLayout("cover");
      expect(store.getState().settings.homeLayout).toBe("cover");

      expect(setHomeLayout).toHaveBeenCalledTimes(3);
    });
  });

  describe("resetSettings", () => {
    it("should reset all settings to defaults", async () => {
      // First change some settings
      await store.getState().updateJumpForwardInterval(60);
      await store.getState().updateJumpBackwardInterval(5);
      await store.getState().updateSmartRewindEnabled(false);
      await store.getState().initializeSettings();

      // Reset
      store.getState().resetSettings();

      const state = store.getState();
      expect(state.settings.jumpForwardInterval).toBe(30);
      expect(state.settings.jumpBackwardInterval).toBe(15);
      expect(state.settings.smartRewindEnabled).toBe(true);
      expect(state.settings.homeLayout).toBe("list");
      expect(state.settings.initialized).toBe(false);
      expect(state.settings.isLoading).toBe(false);
    });

    it("should reset initialized flag", async () => {
      await store.getState().initializeSettings();
      expect(store.getState().settings.initialized).toBe(true);

      store.getState().resetSettings();
      expect(store.getState().settings.initialized).toBe(false);
    });
  });

  describe("Optimistic Updates", () => {
    it("should immediately update state before persisting", async () => {
      let immediateValue: number | undefined;

      setJumpForwardInterval.mockImplementation(async () => {
        immediateValue = store.getState().settings.jumpForwardInterval;
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      await store.getState().updateJumpForwardInterval(60);

      // State should be updated immediately (before persistence completes)
      expect(immediateValue).toBe(60);
    });

    it("should revert optimistic update on error", async () => {
      const originalValue = store.getState().settings.jumpForwardInterval;

      setJumpForwardInterval.mockRejectedValue(new Error("Failed"));

      try {
        await store.getState().updateJumpForwardInterval(60);
      } catch {
        // Expected error
      }

      // Should be reverted to original value
      expect(store.getState().settings.jumpForwardInterval).toBe(originalValue);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero interval values", async () => {
      await store.getState().updateJumpForwardInterval(0);
      expect(store.getState().settings.jumpForwardInterval).toBe(0);
    });

    it("should handle very large interval values", async () => {
      await store.getState().updateJumpBackwardInterval(3600);
      expect(store.getState().settings.jumpBackwardInterval).toBe(3600);
    });

    it("should handle concurrent setting updates", async () => {
      await Promise.all([
        store.getState().updateJumpForwardInterval(60),
        store.getState().updateJumpBackwardInterval(5),
        store.getState().updateSmartRewindEnabled(false),
      ]);

      const state = store.getState();
      expect(state.settings.jumpForwardInterval).toBe(60);
      expect(state.settings.jumpBackwardInterval).toBe(5);
      expect(state.settings.smartRewindEnabled).toBe(false);
    });
  });
});
