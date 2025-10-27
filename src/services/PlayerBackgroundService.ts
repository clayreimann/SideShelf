/**
 * Track Player Background Service
 *
 * This service is required by react-native-track-player to handle
 * background playback events and remote control events.
 * Handles comprehensive progress syncing using TrackPlayer events.
 */

import { logger } from "@/lib/logger";
import { getItem, SECURE_KEYS } from "@/lib/secureStore";
import { useAppStore } from "@/stores/appStore";
import { AppState } from "react-native";
import TrackPlayer, {
  Event,
  PlaybackActiveTrackChangedEvent,
  PlaybackErrorEvent,
  PlaybackProgressUpdatedEvent,
  PlaybackState as PlaybackStateEvent,
  RemoteDuckEvent,
  RemoteJumpBackwardEvent,
  RemoteJumpForwardEvent,
  RemoteSeekEvent,
  State,
} from "react-native-track-player";
import { playerService } from "./PlayerService";
import { unifiedProgressService } from "./ProgressService";

// Create a cached sublogger for this service (more efficient than calling logger.X('tag', ...) each time)
const log = logger.forTag("PlayerBackgroundService");

// Add type definitions for global properties
declare global {
  // eslint-disable-next-line no-var
  var __playerBackgroundServiceInitializedAt: number | undefined;
  // eslint-disable-next-line no-var
  var __playerBackgroundServiceSubscriptions: Array<() => void> | undefined;
}

/**
 * Handle remote play command
 */
async function handleRemotePlay(): Promise<void> {
  await TrackPlayer.play();
}

/**
 * Handle remote pause command
 */
async function handleRemotePause(): Promise<void> {
  await TrackPlayer.pause();
}

/**
 * Handle remote stop command
 */
async function handleRemoteStop(): Promise<void> {
  await TrackPlayer.stop();
  await unifiedProgressService.endCurrentSession();
}

/**
 * Handle remote jump forward command
 */
async function handleRemoteJumpForward(
  event: RemoteJumpForwardEvent
): Promise<void> {
  const progress = await TrackPlayer.getProgress();
  const newPosition = progress.position + event.interval;
  await TrackPlayer.seekTo(newPosition);

  try {
    const currentSession = unifiedProgressService.getCurrentSession();
    if (currentSession) {
      const playbackRate = await TrackPlayer.getRate();
      const volume = await TrackPlayer.getVolume();
      const state = await TrackPlayer.getPlaybackState();

      await unifiedProgressService.updateProgress(
        newPosition,
        playbackRate,
        volume,
        undefined,
        state.state === State.Playing
      );

      const store = useAppStore.getState();
      store.updatePosition(newPosition);
    }
  } catch (error) {
    log.error("Jump forward progress update error", error as Error);
  }
}

/**
 * Handle remote jump backward command
 */
async function handleRemoteJumpBackward(
  event: RemoteJumpBackwardEvent
): Promise<void> {
  const progress = await TrackPlayer.getProgress();
  const newPosition = Math.max(0, progress.position - event.interval);
  await TrackPlayer.seekTo(newPosition);

  try {
    const currentSession = unifiedProgressService.getCurrentSession();
    if (currentSession) {
      const playbackRate = await TrackPlayer.getRate();
      const volume = await TrackPlayer.getVolume();
      const state = await TrackPlayer.getPlaybackState();

      await unifiedProgressService.updateProgress(
        newPosition,
        playbackRate,
        volume,
        undefined,
        state.state === State.Playing
      );

      const store = useAppStore.getState();
      store.updatePosition(newPosition);
    }
  } catch (error) {
    log.error("Jump backward progress update error", error as Error);
  }
}

/**
 * Handle remote next track command
 */
async function handleRemoteNext(): Promise<void> {
  await TrackPlayer.skipToNext();
}

/**
 * Handle remote previous track command
 */
async function handleRemotePrevious(): Promise<void> {
  await TrackPlayer.skipToPrevious();
}

/**
 * Handle remote seek command
 */
async function handleRemoteSeek(event: RemoteSeekEvent): Promise<void> {
  await TrackPlayer.seekTo(event.position);

  // Update progress immediately after seek
  try {
    const currentSession = unifiedProgressService.getCurrentSession();
    if (currentSession) {
      const playbackRate = await TrackPlayer.getRate();
      const volume = await TrackPlayer.getVolume();
      const state = await TrackPlayer.getPlaybackState();

      await unifiedProgressService.updateProgress(
        event.position,
        playbackRate,
        volume,
        undefined,
        state.state === State.Playing
      );

      // Update the store with new position after seek
      const store = useAppStore.getState();
      store.updatePosition(event.position);
    }
  } catch (error) {
    log.error("Seek progress update error", error as Error);
  }
}

/**
 * Handle audio duck events (when other apps need audio focus)
 */
async function handleRemoteDuck(event: RemoteDuckEvent): Promise<void> {
  try {
    if (event.permanent) {
      await TrackPlayer.pause();
      await unifiedProgressService.handleDuck(true);
    } else if (event.paused) {
      await TrackPlayer.pause();
      await unifiedProgressService.handleDuck(true);
    } else {
      await TrackPlayer.play();
      await unifiedProgressService.handleDuck(false);
    }
  } catch (error) {
    log.error("Duck event error", error as Error);
  }
}

/**
 * Handle playback state changes (playing, paused, stopped, etc.)
 */
async function handlePlaybackStateChanged(
  event: PlaybackStateEvent
): Promise<void> {
  try {
    // Clear loading state when playback actually starts
    if (event.state === State.Playing) {
      const store = useAppStore.getState();
      store._setTrackLoading(false);
    }

    const currentSession = unifiedProgressService.getCurrentSession();
    if (currentSession) {
      const progress = await TrackPlayer.getProgress();
      const playbackRate = await TrackPlayer.getRate();
      const volume = await TrackPlayer.getVolume();
      const isPlaying = event.state === State.Playing;

      // Update the store with current position and playing state
      const store = useAppStore.getState();
      store.updatePosition(progress.position);
      store.updatePlayingState(isPlaying);

      await unifiedProgressService.updateProgress(
        progress.position,
        playbackRate,
        volume,
        undefined,
        isPlaying
      );
    }
  } catch (error) {
    log.error("Playback state change error", error as Error);
  }
}

/**
 * Handle playback progress updates (fired every second during playback)
 * This is where we check if periodic sync to server is needed
 */
async function handlePlaybackProgressUpdated(
  event: PlaybackProgressUpdatedEvent
): Promise<void> {
  try {
    if (Math.floor(event.position) % 5 === 0) {
      log.info(`Playback progress updated: position=${event.position.toFixed(2)}s appState=${AppState.currentState}`);
    }
    const currentSession = unifiedProgressService.getCurrentSession();
    if (currentSession) {
      const playbackRate = await TrackPlayer.getRate();
      const volume = await TrackPlayer.getVolume();
      const state = await TrackPlayer.getPlaybackState();
      const isPlaying = state.state === State.Playing;

      // Update session progress
      await unifiedProgressService.updateProgress(
        event.position,
        playbackRate,
        volume,
        undefined,
        isPlaying
      );

      // Update the store with current position
      const store = useAppStore.getState();
      store.updatePosition(event.position);

      // Check if we should sync to server (uses adaptive intervals based on network type)
      const syncCheck = await unifiedProgressService.shouldSyncToServer();
      if (syncCheck.shouldSync) {
        log.info(`Syncing to server: ${syncCheck.reason} appState=${AppState.currentState}`);
        await unifiedProgressService.syncCurrentSessionToServer();
      }
    }
  } catch (error) {
    log.error("Progress update error", error as Error);
  }
}

/**
 * Handle active track changes
 */
async function handleActiveTrackChanged(
  event: PlaybackActiveTrackChangedEvent,
  lastActiveTrackId: { value: string | null }
): Promise<void> {
  try {
    // Avoid processing duplicate events
    const currentActiveTrack = await TrackPlayer.getActiveTrack();
    if (
      !currentActiveTrack ||
      currentActiveTrack.id === lastActiveTrackId.value
    ) {
      return;
    }

    lastActiveTrackId.value = currentActiveTrack.id;
    log.info(`Active track changed: ${event.track?.title || "unknown"}`);

    // Get track info from PlayerService and username from secure store
    const currentTrack = playerService.getCurrentTrack();
    const username = await getItem(SECURE_KEYS.username);

    if (currentTrack && username) {
      log.info(`Starting session for track: ${currentTrack.title}`);
      // Start session tracking
      const playbackRate = await TrackPlayer.getRate();
      const volume = await TrackPlayer.getVolume();
      const sessionId = playerService.getCurrentPlaySessionId();

      await unifiedProgressService.startSession(
        username,
        currentTrack.libraryItemId,
        currentTrack.mediaId,
        0, // startTime - will be determined by active session or saved progress in ProgressService
        currentTrack.duration,
        playbackRate,
        volume,
        sessionId || undefined
      );
    }

    // Update store position when track changes
    // Note: currentTrack is already set by PlayerService.playTrack()
    // so we don't need to set it again here
    const store = useAppStore.getState();
    if (currentTrack && !store.player.currentTrack) {
      // Only set if not already set (safety fallback)
      if (store._setCurrentTrack) {
        store._setCurrentTrack(currentTrack);
      }
    }
  } catch (error) {
    log.error("Active track change error", error as Error);
  }
}

/**
 * Handle playback errors
 */
async function handlePlaybackError(event: PlaybackErrorEvent): Promise<void> {
  log.error(`Playback error: ${event.code} - ${event.message}`);

  try {
    // End current session on critical playback errors
    const currentSession = unifiedProgressService.getCurrentSession();
    if (currentSession) {
      log.info("Ending session due to playback error");
      await unifiedProgressService.endCurrentSession();
    }

    // Clear loading state
    const store = useAppStore.getState();
    store._setTrackLoading(false);
  } catch (error) {
    log.error("Error handling playback error", error as Error);
  }
}

/**
 * Clean up existing event listeners
 */
function cleanupEventListeners(): void {
  if (global.__playerBackgroundServiceSubscriptions) {
    log.info("Cleaning up existing event listeners");
    log.info(`[DIAG] Number of listeners to clean up: ${global.__playerBackgroundServiceSubscriptions.length}`);
    global.__playerBackgroundServiceSubscriptions.forEach((unsub, idx) => {
      try {
        // unsub is already the .remove function, just call it
        if (typeof unsub === "function") {
          unsub();
          log.info(`[DIAG] Cleaned up listener #${idx}`);
        }
      } catch (error) {
        log.error("Error removing event listener", error as Error);
      }
    });
    global.__playerBackgroundServiceSubscriptions = undefined;
  }
}

/**
 * Setup all event listeners
 */
function setupEventListeners(): Array<() => void> {
  log.info("Setting up event listeners");
  // Diagnostic: log event listener setup
  const eventTypes = [
    'RemotePlay', 'RemotePause', 'RemoteStop', 'RemoteNext', 'RemotePrevious',
    'RemoteSeek', 'RemoteDuck', 'RemoteJumpForward', 'RemoteJumpBackward',
    'PlaybackState', 'PlaybackProgressUpdated', 'PlaybackActiveTrackChanged', 'PlaybackError'
  ];
  log.info(`[DIAG] Setting up listeners for events: ${eventTypes.join(', ')}`);

  // Use object to store lastActiveTrackId so it can be mutated in the handler
  const lastActiveTrackId = { value: null as string | null };

  const subscriptions: Array<() => void> = [];

  // Register remote control event handlers
  subscriptions.push(
    TrackPlayer.addEventListener(Event.RemotePlay, handleRemotePlay).remove
  );
  subscriptions.push(
    TrackPlayer.addEventListener(Event.RemotePause, handleRemotePause).remove
  );
  subscriptions.push(
    TrackPlayer.addEventListener(Event.RemoteStop, handleRemoteStop).remove
  );
  subscriptions.push(
    TrackPlayer.addEventListener(Event.RemoteNext, handleRemoteNext).remove
  );
  subscriptions.push(
    TrackPlayer.addEventListener(Event.RemotePrevious, handleRemotePrevious)
      .remove
  );
  subscriptions.push(
    TrackPlayer.addEventListener(Event.RemoteSeek, handleRemoteSeek).remove
  );
  subscriptions.push(
    TrackPlayer.addEventListener(Event.RemoteDuck, handleRemoteDuck).remove
  );
  subscriptions.push(
    TrackPlayer.addEventListener(
      Event.RemoteJumpForward,
      handleRemoteJumpForward
    ).remove
  );
  subscriptions.push(
    TrackPlayer.addEventListener(
      Event.RemoteJumpBackward,
      handleRemoteJumpBackward
    ).remove
  );

  // Register playback event handlers
  subscriptions.push(
    TrackPlayer.addEventListener(
      Event.PlaybackState,
      handlePlaybackStateChanged
    ).remove
  );
  subscriptions.push(
    TrackPlayer.addEventListener(
      Event.PlaybackProgressUpdated,
      handlePlaybackProgressUpdated
    ).remove
  );
  subscriptions.push(
    TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event) =>
      handleActiveTrackChanged(event, lastActiveTrackId)
    ).remove
  );
  subscriptions.push(
    TrackPlayer.addEventListener(Event.PlaybackError, handlePlaybackError)
      .remove
  );

  return subscriptions;
}

/**
 * Reconnect background service (for external use)
 * This forces a cleanup and re-setup of event listeners
 */
export function reconnectBackgroundService(): void {
  log.info("Forcing reconnection of background service");
  log.info("[DIAG] Reconnecting background service: cleaning up and re-setting listeners");
  cleanupEventListeners();
  global.__playerBackgroundServiceSubscriptions = setupEventListeners();
  log.info(`[DIAG] Number of listeners after setup: ${global.__playerBackgroundServiceSubscriptions.length}`);
  global.__playerBackgroundServiceInitializedAt = Date.now();
}

/**
 * Shutdown the background service and clean up all resources
 * Useful for hot reloads, app updates, or forcing a full re-initialization
 */
export function shutdownBackgroundService(): void {
  log.info("Shutting down background service");
  cleanupEventListeners();
  global.__playerBackgroundServiceSubscriptions = undefined;
  global.__playerBackgroundServiceInitializedAt = undefined;
}

/**
 * Check if the background service is initialized
 */
export function isBackgroundServiceInitialized(): boolean {
  return global.__playerBackgroundServiceInitializedAt !== undefined;
}

/**
 * Main module export - called by TrackPlayer.registerPlaybackService
 * This is the entry point that react-native-track-player calls
 */
async function trackPlayerBackgroundService(): Promise<void> {
  const now = Date.now();

  if (global.__playerBackgroundServiceInitializedAt) {
    const timeSinceInit = now - global.__playerBackgroundServiceInitializedAt;

    // If called within 1 second, skip (duplicate call)
    if (timeSinceInit < 1000) {
      log.debug(
        `Already initialized ${timeSinceInit}ms ago, skipping duplicate setup`
      );
      return;
    }

    // If it's been longer, this likely means the JS context was recreated
    log.warn(
      `Re-initializing after ${Math.round(
        timeSinceInit / 1000
      )}s - possible JS context recreation`
    );
    cleanupEventListeners();
  } else {
    log.info("First-time initialization");
  }

  global.__playerBackgroundServiceSubscriptions = setupEventListeners();
  global.__playerBackgroundServiceInitializedAt = now;

  log.info("Background service initialization complete");
}

// Attach helpers to the exported function so consumers retaining CommonJS access continue to work
const serviceExports = trackPlayerBackgroundService as unknown as {
  reconnectBackgroundService?: typeof reconnectBackgroundService;
  shutdownBackgroundService?: typeof shutdownBackgroundService;
  isBackgroundServiceInitialized?: typeof isBackgroundServiceInitialized;
};

serviceExports.reconnectBackgroundService = reconnectBackgroundService;
serviceExports.shutdownBackgroundService = shutdownBackgroundService;
serviceExports.isBackgroundServiceInitialized = isBackgroundServiceInitialized;

module.exports = trackPlayerBackgroundService;
