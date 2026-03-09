/**
 * Tests for settings slice
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { createSettingsSlice, SettingsSlice } from "../settingsSlice";

// Mock appSettings helpers
jest.mock("@/lib/appSettings", () => ({
  getJumpForwardInterval: jest.fn(),
  getJumpBackwardInterval: jest.fn(),
  getSmartRewindEnabled: jest.fn(),
  getHomeLayout: jest.fn(),
  getDiagnosticsEnabled: jest.fn(),
  getTabOrder: jest.fn(),
  getHiddenTabs: jest.fn(),
  getCustomUpdateUrl: jest.fn(),
  getViewMode: jest.fn(),
  getProgressFormat: jest.fn(),
  setJumpForwardInterval: jest.fn(),
  setJumpBackwardInterval: jest.fn(),
  setSmartRewindEnabled: jest.fn(),
  setHomeLayout: jest.fn(),
  setDiagnosticsEnabled: jest.fn(),
  setTabOrder: jest.fn(),
  setHiddenTabs: jest.fn(),
  setCustomUpdateUrl: jest.fn(),
  setViewMode: jest.fn(),
  setProgressFormat: jest.fn(),
  getPeriodicNowPlayingUpdatesEnabled: jest.fn(),
  setPeriodicNowPlayingUpdatesEnabled: jest.fn(),
}));

// Mock track player config
jest.mock("@/lib/trackPlayerConfig", () => ({
  configureTrackPlayer: jest.fn(),
}));

describe("SettingsSlice", () => {
  let store: UseBoundStore<StoreApi<SettingsSlice>>;

  // Get mocked functions for type safety
  const {
    getJumpForwardInterval,
    getJumpBackwardInterval,
    getSmartRewindEnabled,
    getHomeLayout,
    getDiagnosticsEnabled,
    getTabOrder,
    getHiddenTabs,
    getCustomUpdateUrl,
    getViewMode,
    getProgressFormat,
    setJumpForwardInterval,
    setJumpBackwardInterval,
    setSmartRewindEnabled,
    setHomeLayout,
    setDiagnosticsEnabled,
    setTabOrder,
    setHiddenTabs,
    setCustomUpdateUrl,
    setViewMode,
    setProgressFormat,
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
    getDiagnosticsEnabled.mockResolvedValue(false);
    getTabOrder.mockResolvedValue(["home", "library", "series", "authors", "more"]);
    getHiddenTabs.mockResolvedValue([]);
    getCustomUpdateUrl.mockResolvedValue(null);
    setJumpForwardInterval.mockResolvedValue();
    setJumpBackwardInterval.mockResolvedValue();
    setSmartRewindEnabled.mockResolvedValue();
    setHomeLayout.mockResolvedValue();
    setDiagnosticsEnabled.mockResolvedValue();
    setTabOrder.mockResolvedValue();
    setHiddenTabs.mockResolvedValue();
    setCustomUpdateUrl.mockResolvedValue();
    getViewMode.mockResolvedValue("list");
    setViewMode.mockResolvedValue();
    getProgressFormat.mockResolvedValue("remaining");
    setProgressFormat.mockResolvedValue();
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
        diagnosticsEnabled: false,
        tabOrder: ["home", "library", "series", "authors", "more"],
        hiddenTabs: [],
        customUpdateUrl: null,
        viewMode: "list",
        progressFormat: "remaining",
        initialized: false,
        isLoading: false,
      });
    });

    it("viewMode defaults to 'list' in initial state", () => {
      const state = store.getState();
      expect(state.settings.viewMode).toBe("list");
    });
  });

  describe("initializeSettings", () => {
    it("should load settings from storage", async () => {
      getJumpForwardInterval.mockResolvedValue(45);
      getJumpBackwardInterval.mockResolvedValue(10);
      getSmartRewindEnabled.mockResolvedValue(false);
      getHomeLayout.mockResolvedValue("cover");
      getDiagnosticsEnabled.mockResolvedValue(true);
      getTabOrder.mockResolvedValue(["library", "home", "series", "authors", "more"]);
      getHiddenTabs.mockResolvedValue(["authors"]);
      getCustomUpdateUrl.mockResolvedValue("https://example.com/bundle");

      await store.getState().initializeSettings();

      const state = store.getState();
      expect(state.settings.jumpForwardInterval).toBe(45);
      expect(state.settings.jumpBackwardInterval).toBe(10);
      expect(state.settings.smartRewindEnabled).toBe(false);
      expect(state.settings.homeLayout).toBe("cover");
      expect(state.settings.diagnosticsEnabled).toBe(true);
      expect(state.settings.tabOrder).toEqual(["library", "home", "series", "authors", "more"]);
      expect(state.settings.hiddenTabs).toEqual(["authors"]);
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
      expect(getDiagnosticsEnabled).not.toHaveBeenCalled();
    });

    it("should use defaults on error and still mark as initialized", async () => {
      getJumpForwardInterval.mockRejectedValue(new Error("Storage error"));

      await store.getState().initializeSettings();

      const state = store.getState();
      expect(state.settings.jumpForwardInterval).toBe(30);
      expect(state.settings.jumpBackwardInterval).toBe(15);
      expect(state.settings.smartRewindEnabled).toBe(true);
      expect(state.settings.homeLayout).toBe("list");
      expect(state.settings.diagnosticsEnabled).toBe(false);
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
      getDiagnosticsEnabled.mockImplementation(mockImplementation);

      await store.getState().initializeSettings();

      // All promises should have been created (parallel loading)
      expect(loadPromises.length).toBe(5);
    });

    it("initializeSettings loads viewMode from AsyncStorage via getViewMode()", async () => {
      getViewMode.mockResolvedValue("grid");

      await store.getState().initializeSettings();

      const state = store.getState();
      expect(getViewMode).toHaveBeenCalled();
      expect(state.settings.viewMode).toBe("grid");
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

  describe("updateDiagnosticsEnabled", () => {
    it("should enable diagnostics and persist to storage", async () => {
      // First disable it properly
      await store.getState().updateDiagnosticsEnabled(false);

      await store.getState().updateDiagnosticsEnabled(true);

      const state = store.getState();
      expect(state.settings.diagnosticsEnabled).toBe(true);
      expect(setDiagnosticsEnabled).toHaveBeenCalledWith(true);
    });

    it("should disable diagnostics and persist to storage", async () => {
      await store.getState().updateDiagnosticsEnabled(false);

      const state = store.getState();
      expect(state.settings.diagnosticsEnabled).toBe(false);
      expect(setDiagnosticsEnabled).toHaveBeenCalledWith(false);
    });

    it("should revert on storage error", async () => {
      // Ensure we start with the default value
      expect(store.getState().settings.diagnosticsEnabled).toBe(false);

      setDiagnosticsEnabled.mockRejectedValue(new Error("Storage error"));

      await expect(store.getState().updateDiagnosticsEnabled(true)).rejects.toThrow(
        "Storage error"
      );

      const state = store.getState();
      expect(state.settings.diagnosticsEnabled).toBe(false); // Reverted to previous value
    });

    it("should handle toggling multiple times", async () => {
      await store.getState().updateDiagnosticsEnabled(true);
      expect(store.getState().settings.diagnosticsEnabled).toBe(true);

      await store.getState().updateDiagnosticsEnabled(false);
      expect(store.getState().settings.diagnosticsEnabled).toBe(false);

      await store.getState().updateDiagnosticsEnabled(true);
      expect(store.getState().settings.diagnosticsEnabled).toBe(true);

      expect(setDiagnosticsEnabled).toHaveBeenCalledTimes(3);
    });
  });

  describe("resetSettings", () => {
    it("should reset all settings to defaults", async () => {
      // First change some settings
      await store.getState().updateJumpForwardInterval(60);
      await store.getState().updateJumpBackwardInterval(5);
      await store.getState().updateSmartRewindEnabled(false);
      await store.getState().updateDiagnosticsEnabled(true);
      await store.getState().initializeSettings();

      // Reset
      store.getState().resetSettings();

      const state = store.getState();
      expect(state.settings.jumpForwardInterval).toBe(30);
      expect(state.settings.jumpBackwardInterval).toBe(15);
      expect(state.settings.smartRewindEnabled).toBe(true);
      expect(state.settings.homeLayout).toBe("list");
      expect(state.settings.diagnosticsEnabled).toBe(false);
      expect(state.settings.initialized).toBe(false);
      expect(state.settings.isLoading).toBe(false);
    });

    it("should reset initialized flag", async () => {
      await store.getState().initializeSettings();
      expect(store.getState().settings.initialized).toBe(true);

      store.getState().resetSettings();
      expect(store.getState().settings.initialized).toBe(false);
    });

    it("resetSettings resets viewMode to 'list'", async () => {
      await store.getState().updateViewMode("grid");
      expect(store.getState().settings.viewMode).toBe("grid");

      store.getState().resetSettings();
      expect(store.getState().settings.viewMode).toBe("list");
    });
  });

  describe("updateViewMode", () => {
    it("updateViewMode('grid') updates state and calls setViewMode('grid')", async () => {
      await store.getState().updateViewMode("grid");

      const state = store.getState();
      expect(state.settings.viewMode).toBe("grid");
      expect(setViewMode).toHaveBeenCalledWith("grid");
    });

    it("updateViewMode('list') updates state and calls setViewMode('list')", async () => {
      // First set to grid
      await store.getState().updateViewMode("grid");
      jest.clearAllMocks();
      setViewMode.mockResolvedValue();

      await store.getState().updateViewMode("list");

      const state = store.getState();
      expect(state.settings.viewMode).toBe("list");
      expect(setViewMode).toHaveBeenCalledWith("list");
    });

    it("updateViewMode falls back to 'list' on AsyncStorage error (reverts optimistic update)", async () => {
      setViewMode.mockRejectedValue(new Error("Storage error"));

      await expect(store.getState().updateViewMode("grid")).rejects.toThrow("Storage error");

      const state = store.getState();
      expect(state.settings.viewMode).toBe("list");
    });
  });

  describe("progressFormat", () => {
    describe("initializeSettings", () => {
      it("loads progressFormat from storage via getProgressFormat", async () => {
        getProgressFormat.mockResolvedValue("elapsed");

        await store.getState().initializeSettings();

        expect(getProgressFormat).toHaveBeenCalled();
        expect(store.getState().settings.progressFormat).toBe("elapsed");
      });

      it("defaults to 'remaining' when getProgressFormat returns 'remaining' (storage null fallback handled by appSettings)", async () => {
        getProgressFormat.mockResolvedValue("remaining");

        await store.getState().initializeSettings();

        expect(store.getState().settings.progressFormat).toBe("remaining");
      });
    });

    describe("updateProgressFormat", () => {
      it("optimistically sets progressFormat before persisting", async () => {
        let optimisticValue: string | undefined;

        setProgressFormat.mockImplementation(async () => {
          optimisticValue = store.getState().settings.progressFormat;
          await new Promise((resolve) => setTimeout(resolve, 10));
        });

        await store.getState().updateProgressFormat("elapsed");

        expect(optimisticValue).toBe("elapsed");
        expect(setProgressFormat).toHaveBeenCalledWith("elapsed");
      });

      it("reverts to previous value when setProgressFormat throws", async () => {
        expect(store.getState().settings.progressFormat).toBe("remaining");

        setProgressFormat.mockRejectedValue(new Error("Storage error"));

        await expect(store.getState().updateProgressFormat("elapsed")).rejects.toThrow(
          "Storage error"
        );

        expect(store.getState().settings.progressFormat).toBe("remaining");
      });
    });

    describe("resetSettings", () => {
      it("restores progressFormat to 'remaining'", async () => {
        await store.getState().updateProgressFormat("percent");
        expect(store.getState().settings.progressFormat).toBe("percent");

        store.getState().resetSettings();

        expect(store.getState().settings.progressFormat).toBe("remaining");
      });
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
