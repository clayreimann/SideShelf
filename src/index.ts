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
import 'react-native-get-random-values';

import { logger } from '@/lib/logger';
import { playerService } from '@/services/PlayerService';
import TrackPlayer from 'react-native-track-player';

/**
 * Initialize all singleton services
 *
 * This function should be called once at app startup, before any
 * components are rendered. It sets up all the background services
 * and singletons that the app depends on.
 */
export async function initializeApp(): Promise<void> {
  console.log('[App] Starting application initialization...');

  try {
    // In development mode, log that we're handling hot-reload
    if (__DEV__) {
      console.log('[App] Development mode: handling potential hot-reload scenario');
    }

    // Initialize logger first to load persisted settings (disabled tags)
    await logger.initialize();
    console.log('[App] Logger initialized and settings loaded');

    // Initialize React Native Track Player
    await initializeTrackPlayer();

    // Initialize other services here as needed
    // await downloadService.initialize();
    // await otherService.initialize();

    console.log('[App] Application initialization completed successfully');
  } catch (error) {
    console.error('[App] Failed to initialize application:', error);
    throw error;
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
    console.log('[App] Initializing React Native Track Player...');

    // Register the playback service for background audio
    // This is safe to call multiple times
    TrackPlayer.registerPlaybackService(() => require('@/services/PlayerBackgroundService'));

    // Initialize the player service singleton
    await playerService.initialize();

    console.log('[App] React Native Track Player initialized successfully');
  } catch (error) {
    console.error('[App] Failed to initialize React Native Track Player:', error);

    // In development mode, don't throw the error to prevent app crashes during hot-reload
    if (__DEV__) {
      console.warn('[App] Continuing despite track player initialization error (development mode)');
      return;
    }

    throw error;
  }
}

/**
 * Re-export commonly used services for convenience
 */
export { playerService } from '@/services/PlayerService';
export { unifiedProgressService } from '@/services/ProgressService';

// Future service exports will go here:
// export { downloadService } from '@/services/DownloadService';
// export { libraryBackgroundDownloadService } from '@/services/LibraryBackgroundDownloadService';
