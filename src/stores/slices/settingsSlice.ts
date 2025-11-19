/**
 * Settings slice for Zustand store
 *
 * This slice manages app settings/preferences including:
 * - Jump forward/backward intervals
 * - Smart rewind on resume
 * - Automatic persistence to storage
 */

import {
  getAutoQueueNextItemEnabled,
  getDiagnosticsEnabled,
  getHomeLayout,
  getJumpBackwardInterval,
  getJumpForwardInterval,
  getSmartRewindEnabled,
  setAutoQueueNextItemEnabled,
  setDiagnosticsEnabled,
  setHomeLayout,
  setJumpBackwardInterval,
  setJumpForwardInterval,
  setSmartRewindEnabled,
} from "@/lib/appSettings";
import { logger } from "@/lib/logger";
import { configureTrackPlayer } from "@/lib/trackPlayerConfig";
import type { SliceCreator } from "@/types/store";

// Create cached sublogger for this slice
const log = logger.forTag("SettingsSlice");

/**
 * Settings slice state interface - scoped under 'settings' to avoid conflicts
 */
export interface SettingsSliceState {
  settings: {
    /** Jump forward interval in seconds */
    jumpForwardInterval: number;
    /** Jump backward interval in seconds */
    jumpBackwardInterval: number;
    /** Whether smart rewind on resume is enabled */
    smartRewindEnabled: boolean;
    /** Home screen layout preference */
    homeLayout: "list" | "cover";
    /** Whether diagnostics/developer mode is enabled */
    diagnosticsEnabled: boolean;
    /** Whether auto-queue next item is enabled */
    autoQueueNextItemEnabled: boolean;
    /** Whether the slice has been initialized */
    initialized: boolean;
    /** Whether settings are currently being loaded */
    isLoading: boolean;
  };
}

/**
 * Settings slice actions interface
 */
export interface SettingsSliceActions {
  // Public methods
  /** Initialize the slice by loading settings from storage */
  initializeSettings: () => Promise<void>;
  /** Update jump forward interval */
  updateJumpForwardInterval: (seconds: number) => Promise<void>;
  /** Update jump backward interval */
  updateJumpBackwardInterval: (seconds: number) => Promise<void>;
  /** Toggle smart rewind on resume */
  updateSmartRewindEnabled: (enabled: boolean) => Promise<void>;
  /** Update home screen layout preference */
  updateHomeLayout: (layout: "list" | "cover") => Promise<void>;
  /** Toggle diagnostics/developer mode */
  updateDiagnosticsEnabled: (enabled: boolean) => Promise<void>;
  /** Toggle auto-queue next item */
  updateAutoQueueNextItemEnabled: (enabled: boolean) => Promise<void>;
  /** Reset the slice to initial state */
  resetSettings: () => void;
}

/**
 * Combined settings slice interface
 */
export interface SettingsSlice extends SettingsSliceState, SettingsSliceActions {}

/**
 * Default settings values
 */
const DEFAULT_SETTINGS = {
  jumpForwardInterval: 30,
  jumpBackwardInterval: 15,
  smartRewindEnabled: true,
  homeLayout: "list" as const,
  diagnosticsEnabled: false,
  autoQueueNextItemEnabled: true,
};

/**
 * Initial state
 */
const initialState: SettingsSliceState = {
  settings: {
    ...DEFAULT_SETTINGS,
    initialized: false,
    isLoading: false,
  },
};

/**
 * Create the settings slice
 */
export const createSettingsSlice: SliceCreator<SettingsSlice> = (set, get) => ({
  // Initial state
  ...initialState,

  /**
   * Initialize the slice by loading settings from storage
   */
  initializeSettings: async () => {
    const state = get();

    if (state.settings.initialized) {
      log.debug("Settings already initialized, skipping");
      return;
    }

    log.info("Initializing settings slice...");

    set((state: SettingsSlice) => ({
      ...state,
      settings: {
        ...state.settings,
        isLoading: true,
      },
    }));

    try {
      // Load all settings from storage in parallel
      const [
        jumpForward,
        jumpBackward,
        smartRewind,
        homeLayout,
        diagnosticsEnabled,
        autoQueueNextItemEnabled,
      ] = await Promise.all([
        getJumpForwardInterval(),
        getJumpBackwardInterval(),
        getSmartRewindEnabled(),
        getHomeLayout(),
        getDiagnosticsEnabled(),
        getAutoQueueNextItemEnabled(),
      ]);

      set((state: SettingsSlice) => ({
        ...state,
        settings: {
          jumpForwardInterval: jumpForward,
          jumpBackwardInterval: jumpBackward,
          smartRewindEnabled: smartRewind,
          homeLayout: homeLayout,
          diagnosticsEnabled: diagnosticsEnabled,
          autoQueueNextItemEnabled: autoQueueNextItemEnabled,
          initialized: true,
          isLoading: false,
        },
      }));

      log.info(
        `Settings loaded successfully: jumpForward=${jumpForward}, jumpBackward=${jumpBackward}, smartRewind=${smartRewind}, homeLayout=${homeLayout}, diagnostics=${diagnosticsEnabled}, autoQueueNextItem=${autoQueueNextItemEnabled}`
      );
    } catch (error) {
      log.error("Failed to load settings", error as Error);

      // Use defaults on error
      set((state: SettingsSlice) => ({
        ...state,
        settings: {
          ...DEFAULT_SETTINGS,
          initialized: true,
          isLoading: false,
        },
      }));
    }
  },

  /**
   * Update jump forward interval
   */
  updateJumpForwardInterval: async (seconds: number) => {
    log.info(`Updating jump forward interval to ${seconds}s`);

    // Capture previous value BEFORE optimistic update
    const previousValue = get().settings.jumpForwardInterval;

    // Optimistic update
    set((state: SettingsSlice) => ({
      ...state,
      settings: {
        ...state.settings,
        jumpForwardInterval: seconds,
      },
    }));

    try {
      // Persist to storage
      await setJumpForwardInterval(seconds);

      // Reconfigure TrackPlayer with new interval
      await configureTrackPlayer();

      log.info(`Jump forward interval updated to ${seconds}s`);
    } catch (error) {
      log.error("Failed to update jump forward interval", error as Error);

      // Revert on error
      set((state: SettingsSlice) => ({
        ...state,
        settings: {
          ...state.settings,
          jumpForwardInterval: previousValue,
        },
      }));

      throw error;
    }
  },

  /**
   * Update jump backward interval
   */
  updateJumpBackwardInterval: async (seconds: number) => {
    log.info(`Updating jump backward interval to ${seconds}s`);

    // Capture previous value BEFORE optimistic update
    const previousValue = get().settings.jumpBackwardInterval;

    // Optimistic update
    set((state: SettingsSlice) => ({
      ...state,
      settings: {
        ...state.settings,
        jumpBackwardInterval: seconds,
      },
    }));

    try {
      // Persist to storage
      await setJumpBackwardInterval(seconds);

      // Reconfigure TrackPlayer with new interval
      await configureTrackPlayer();

      log.info(`Jump backward interval updated to ${seconds}s`);
    } catch (error) {
      log.error("Failed to update jump backward interval", error as Error);

      // Revert on error
      set((state: SettingsSlice) => ({
        ...state,
        settings: {
          ...state.settings,
          jumpBackwardInterval: previousValue,
        },
      }));

      throw error;
    }
  },

  /**
   * Toggle smart rewind on resume
   */
  updateSmartRewindEnabled: async (enabled: boolean) => {
    log.info(`${enabled ? "Enabling" : "Disabling"} smart rewind`);

    // Capture previous value BEFORE optimistic update
    const previousValue = get().settings.smartRewindEnabled;

    // Optimistic update
    set((state: SettingsSlice) => ({
      ...state,
      settings: {
        ...state.settings,
        smartRewindEnabled: enabled,
      },
    }));

    try {
      // Persist to storage
      await setSmartRewindEnabled(enabled);

      log.info(`Smart rewind ${enabled ? "enabled" : "disabled"}`);
    } catch (error) {
      log.error("Failed to update smart rewind setting", error as Error);

      // Revert on error
      set((state: SettingsSlice) => ({
        ...state,
        settings: {
          ...state.settings,
          smartRewindEnabled: previousValue,
        },
      }));

      throw error;
    }
  },

  /**
   * Update home screen layout preference
   */
  updateHomeLayout: async (layout: "list" | "cover") => {
    log.info(`Updating home layout to ${layout}`);

    // Capture previous value BEFORE optimistic update
    const previousValue = get().settings.homeLayout;

    // Optimistic update
    set((state: SettingsSlice) => ({
      ...state,
      settings: {
        ...state.settings,
        homeLayout: layout,
      },
    }));

    try {
      // Persist to storage
      await setHomeLayout(layout);

      log.info(`Home layout updated to ${layout}`);
    } catch (error) {
      log.error("Failed to update home layout setting", error as Error);

      // Revert on error
      set((state: SettingsSlice) => ({
        ...state,
        settings: {
          ...state.settings,
          homeLayout: previousValue,
        },
      }));

      throw error;
    }
  },

  /**
   * Toggle diagnostics/developer mode
   */
  updateDiagnosticsEnabled: async (enabled: boolean) => {
    log.info(`${enabled ? "Enabling" : "Disabling"} diagnostics mode`);

    // Capture previous value BEFORE optimistic update
    const previousValue = get().settings.diagnosticsEnabled;

    // Optimistic update
    set((state: SettingsSlice) => ({
      ...state,
      settings: {
        ...state.settings,
        diagnosticsEnabled: enabled,
      },
    }));

    try {
      // Persist to storage
      await setDiagnosticsEnabled(enabled);

      log.info(`Diagnostics mode ${enabled ? "enabled" : "disabled"}`);
    } catch (error) {
      log.error("Failed to update diagnostics setting", error as Error);

      // Revert on error
      set((state: SettingsSlice) => ({
        ...state,
        settings: {
          ...state.settings,
          diagnosticsEnabled: previousValue,
        },
      }));

      throw error;
    }
  },

  /**
   * Toggle auto-queue next item
   */
  updateAutoQueueNextItemEnabled: async (enabled: boolean) => {
    log.info(`${enabled ? "Enabling" : "Disabling"} auto-queue next item`);

    // Capture previous value BEFORE optimistic update
    const previousValue = get().settings.autoQueueNextItemEnabled;

    // Optimistic update
    set((state: SettingsSlice) => ({
      ...state,
      settings: {
        ...state.settings,
        autoQueueNextItemEnabled: enabled,
      },
    }));

    try {
      // Persist to storage
      await setAutoQueueNextItemEnabled(enabled);

      log.info(`Auto-queue next item ${enabled ? "enabled" : "disabled"}`);
    } catch (error) {
      log.error("Failed to update auto-queue next item setting", error as Error);

      // Revert on error
      set((state: SettingsSlice) => ({
        ...state,
        settings: {
          ...state.settings,
          autoQueueNextItemEnabled: previousValue,
        },
      }));

      throw error;
    }
  },

  /**
   * Reset the slice to initial state
   */
  resetSettings: () => {
    log.info("Resetting settings slice");
    set((state: SettingsSlice) => ({
      ...state,
      settings: {
        ...DEFAULT_SETTINGS,
        initialized: false,
        isLoading: false,
      },
    }));
  },
});
