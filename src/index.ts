/**
 * Main application entry point
 *
 * This file handles the initialization of all singleton services and
 * background services that need to be set up before the app starts.
 *
 * Services initialized here:
 * - React Native Track Player (RNTP)
 * - Download Service
 * - Other future singleton services
 */

// Import crypto polyfill for React Native (required for UUID generation)
import "react-native-get-random-values";

import {
  getFullVersionString,
  getPreviousVersion,
  hasAppBeenUpdated,
  saveCurrentVersion,
} from "@/lib/appVersion";
import { performPeriodicCleanup } from "@/lib/fileLifecycleManager";
import { logger } from "@/lib/logger";
import { dispatchPlayerEvent } from "@/services/coordinator/eventBus";
import { getCoordinator } from "@/services/coordinator/PlayerStateCoordinator";
import { playerService } from "@/services/PlayerService";
import { progressService } from "@/services/ProgressService";
import { useAppStore } from "@/stores/appStore";
import { getCurrentUser } from "@/utils/userHelpers";
import TrackPlayer from "react-native-track-player";

const log = logger.forTag("App");

// Ensure that the coordinator is initialized on app startup
const coordinator = getCoordinator();
export { coordinator };
/**
 * Initialize all singleton services
 *
 * This function should be called once at app startup, before any
 * components are rendered. It sets up all the background services
 * and singletons that the app depends on.
 */
export async function initializeApp(): Promise<void> {
  // Use console.log for this initial message since logger isn't initialized yet
  console.log("[App] Starting application initialization...");

  try {
    // In development mode, log that we're handling hot-reload
    if (__DEV__) {
      console.log("[App] Development mode: handling potential hot-reload scenario");
    }

    // Initialize logger first to load persisted settings (disabled tags)
    await logger.initialize();
    log.info("Logger initialized and settings loaded");

    // Initialize logger slice and subscribe to count updates
    const loggerSlice = useAppStore.getState().logger;
    await loggerSlice.initialize();

    // Subscribe logger to count updates so store stays in sync
    logger.subscribeToCountUpdates(() => {
      useAppStore.getState().logger.updateErrorCounts();
    });

    // Trigger initial purge on app start
    logger.manualTrim();

    // Check if app has been updated
    const appUpdated = await hasAppBeenUpdated();
    if (appUpdated) {
      const previousVersion = await getPreviousVersion();
      const currentVersion = getFullVersionString();

      if (previousVersion) {
        log.info(
          `App updated from ${previousVersion.version} (${previousVersion.buildNumber}) to ${currentVersion}`
        );
      } else {
        log.info(`First run - version ${currentVersion}`);
      }

      // Perform any update-specific cleanup or migration here
      await handleAppUpdate();

      // Save the new version
      await saveCurrentVersion();
    } else {
      log.info(`Starting app version ${getFullVersionString()}`);
    }

    // Initialize React Native Track Player
    await initializeTrackPlayer();

    // Restore persisted player state on cold boot
    try {
      // Notify coordinator that app is starting state restoration
      dispatchPlayerEvent({ type: "APP_FOREGROUNDED" });

      await useAppStore.getState().restorePersistedState();
      log.info("Player state restored from persistence");

      // Rehydrate ProgressService session from database (explicit call, no longer in constructor)
      await progressService.rehydrateActiveSession();
      log.info("ProgressService session rehydrated");

      // Restore PlayerService state from ProgressService session
      await playerService.restorePlayerServiceFromSession();
    } catch (error) {
      log.error("Failed to restore persisted player state", error as Error);
      // Don't throw - continue initialization even if state restoration fails
    }

    // Initialize other services here as needed
    // await downloadService.initialize();
    // await otherService.initialize();

    log.info("Application initialization completed successfully");
  } catch (error) {
    log.error("Failed to initialize application", error as Error);
    throw error;
  }
}

/**
 * Handle app update logic
 * This is called when the app version changes
 */
async function handleAppUpdate(): Promise<void> {
  try {
    log.info("Handling app update...");

    // Note: Module cache clearing (require.cache) is not available in React Native
    // React Native handles module hot-reloading differently than Node.js
    // Any update-specific logic can go here
    // For example: database migrations, cache cleanup, etc.

    // Run file lifecycle cleanup (move stale items to Caches)
    try {
      const user = await getCurrentUser();
      if (user) {
        log.info("Running periodic file cleanup...");
        const results = await performPeriodicCleanup(user.id);
        log.info(
          `File cleanup complete: ${results.movedItems.length} items moved to Caches, ${results.errors.length} errors`
        );
      }
    } catch (error) {
      log.error("Error running file cleanup:", error as Error);
      // Continue - don't block app update on cleanup failure
    }

    log.info("App update handling complete");
  } catch (error) {
    log.error("Error handling app update", error as Error);
    // Don't throw - we want the app to continue even if update handling fails
  }
}

/**
 * Initialize React Native Track Player
 *
 * Sets up RNTP with the background service and initializes
 * the player service singleton.
 */
async function initializeTrackPlayer(): Promise<void> {
  try {
    log.info("Initializing React Native Track Player...");

    // Register the playback service for background audio
    // This is safe to call multiple times
    TrackPlayer.registerPlaybackService(() => require("@/services/PlayerBackgroundService"));

    // Initialize the player service singleton
    await playerService.initialize();

    log.info("React Native Track Player initialized successfully");
  } catch (error) {
    log.error("Failed to initialize React Native Track Player", error as Error);

    // In development mode, don't throw the error to prevent app crashes during hot-reload
    if (__DEV__) {
      log.warn("Continuing despite track player initialization error (development mode)");
      return;
    }

    throw error;
  }
}

/**
 * Re-export commonly used services for convenience
 */
export { playerService } from "@/services/PlayerService";
export { progressService as unifiedProgressService } from "@/services/ProgressService";

// Future service exports will go here:
// export { downloadService } from '@/services/DownloadService';
// export { libraryBackgroundDownloadService } from '@/services/LibraryBackgroundDownloadService';
