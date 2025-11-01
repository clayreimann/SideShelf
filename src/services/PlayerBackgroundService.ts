/**
 * Track Player Background Service
 *
 * This service is required by react-native-track-player to handle
 * background playback events and remote control events.
 * Handles comprehensive progress syncing using TrackPlayer events.
 */

import { getUserByUsername } from "@/db/helpers/users";
import { formatTime } from "@/lib/helpers/formatters";
import { logger } from "@/lib/logger";
import { getItem, SECURE_KEYS } from "@/lib/secureStore";
import { updateNowPlayingMetadata } from "@/services/playerNowPlaying";
import { progressService } from "@/services/ProgressService";
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

// Create a cached sublogger for this service (more efficient than calling logger.X('tag', ...) each time)
const log = logger.forTag("PlayerBackgroundService");
// Create a diagnostic logger for verbose diagnostic logging
const diagLog = logger.forDiagnostics("PlayerBackgroundService");

function describeRuntimeContext(): string {
  const parts: string[] = [];
  parts.push(typeof globalThis.window === "undefined" ? "no-window" : "window");
  parts.push(
    typeof globalThis.document === "undefined" ? "no-document" : "document"
  );
  try {
    const state = AppState.currentState;
    parts.push(`AppState=${state ?? "unknown"}`);
  } catch {
    parts.push("AppState=unavailable");
  }
  parts.push(
    global.__playerBackgroundServiceInitializedAt !== undefined
      ? `initializedAt=${global.__playerBackgroundServiceInitializedAt}`
      : "initializedAt=none"
  );
  parts.push(__DEV__ ? "dev" : "prod");
  return parts.join(" ");
}

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
  diagLog.info(`RemotePlay received (${describeRuntimeContext()})`);
  await TrackPlayer.play();
}

/**
 * Handle remote pause command
 */
async function handleRemotePause(): Promise<void> {
  diagLog.info(`RemotePause received (${describeRuntimeContext()})`);
  await TrackPlayer.pause();
}

/**
 * Helper to get userId and libraryItemId from playerSlice
 */
async function getUserIdAndLibraryItemId(): Promise<{ userId: string; libraryItemId: string } | null> {
  const store = useAppStore.getState();
  const libraryItemId = store.player.currentTrack?.libraryItemId;
  if (!libraryItemId) {
    return null;
  }

  const username = await getItem(SECURE_KEYS.username);
  if (!username) {
    return null;
  }

  const user = await getUserByUsername(username);
  if (!user?.id) {
    return null;
  }

  return { userId: user.id, libraryItemId };
}

/**
 * Handle remote stop command
 */
async function handleRemoteStop(): Promise<void> {
  diagLog.info(`RemoteStop received (${describeRuntimeContext()})`);
  await TrackPlayer.stop();

  const ids = await getUserIdAndLibraryItemId();
  if (ids) {
    const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
    await progressService.endCurrentSession(ids.userId, ids.libraryItemId);
    if (session) {
      log.info(`Remote stop: session=${session.sessionId} item=${ids.libraryItemId}`);
    }
  }
}

/**
 * Handle remote jump forward command
 */
async function handleRemoteJumpForward(
  event: RemoteJumpForwardEvent
): Promise<void> {
  diagLog.info(
    `RemoteJumpForward received interval=${event.interval} (${describeRuntimeContext()})`
  );
  const progress = await TrackPlayer.getProgress();
  const newPosition = progress.position + event.interval;
  await TrackPlayer.seekTo(newPosition);

  try {
    const ids = await getUserIdAndLibraryItemId();
    if (ids) {
      const playbackRate = await TrackPlayer.getRate();
      const volume = await TrackPlayer.getVolume();
      const state = await TrackPlayer.getPlaybackState();

      await progressService.updateProgress(
        ids.userId,
        ids.libraryItemId,
        newPosition,
        playbackRate,
        volume,
        undefined,
        state.state === State.Playing
      );

      const store = useAppStore.getState();
      store.updatePosition(newPosition);

      const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
      if (session) {
        log.info(`Jump forward: position=${newPosition.toFixed(2)}s session=${session.sessionId} item=${ids.libraryItemId}`);
      }
    }
  } catch (error) {
    const ids = await getUserIdAndLibraryItemId();
    log.error(`Jump forward progress update error: ${(error as Error).message} item=${ids?.libraryItemId || 'unknown'}`, error as Error);
  }
}

/**
 * Handle remote jump backward command
 */
async function handleRemoteJumpBackward(
  event: RemoteJumpBackwardEvent
): Promise<void> {
  diagLog.info(
    `RemoteJumpBackward received interval=${event.interval} (${describeRuntimeContext()})`
  );
  const progress = await TrackPlayer.getProgress();
  const newPosition = Math.max(0, progress.position - event.interval);
  await TrackPlayer.seekTo(newPosition);

  try {
    const ids = await getUserIdAndLibraryItemId();
    if (ids) {
      const playbackRate = await TrackPlayer.getRate();
      const volume = await TrackPlayer.getVolume();
      const state = await TrackPlayer.getPlaybackState();

      await progressService.updateProgress(
        ids.userId,
        ids.libraryItemId,
        newPosition,
        playbackRate,
        volume,
        undefined,
        state.state === State.Playing
      );

      const store = useAppStore.getState();
      store.updatePosition(newPosition);

      const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
      if (session) {
        log.info(`Jump backward: position=${newPosition.toFixed(2)}s session=${session.sessionId} item=${ids.libraryItemId}`);
      }
    }
  } catch (error) {
    const ids = await getUserIdAndLibraryItemId();
    log.error(`Jump backward progress update error: ${(error as Error).message} item=${ids?.libraryItemId || 'unknown'}`, error as Error);
  }
}

/**
 * Handle remote next track command
 */
async function handleRemoteNext(): Promise<void> {
  diagLog.info(`RemoteNext received (${describeRuntimeContext()})`);
  await TrackPlayer.skipToNext();
}

/**
 * Handle remote previous track command
 */
async function handleRemotePrevious(): Promise<void> {
  diagLog.info(`RemotePrevious received (${describeRuntimeContext()})`);
  await TrackPlayer.skipToPrevious();
}

/**
 * Handle remote seek command
 */
async function handleRemoteSeek(event: RemoteSeekEvent): Promise<void> {
  diagLog.info(
    `RemoteSeek received position=${event.position} (${describeRuntimeContext()})`
  );
  await TrackPlayer.seekTo(event.position);

  // Update progress immediately after seek
  try {
    const ids = await getUserIdAndLibraryItemId();
    if (ids) {
      const playbackRate = await TrackPlayer.getRate();
      const volume = await TrackPlayer.getVolume();
      const state = await TrackPlayer.getPlaybackState();

      await progressService.updateProgress(
        ids.userId,
        ids.libraryItemId,
        event.position,
        playbackRate,
        volume,
        undefined,
        state.state === State.Playing
      );

      // Update the store with new position after seek
      const store = useAppStore.getState();
      store.updatePosition(event.position);

      const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
      if (session) {
        log.info(`Seek: position=${formatTime(event.position)}s session=${session.sessionId} item=${ids.libraryItemId}`);
      }
    }
  } catch (error) {
    const ids = await getUserIdAndLibraryItemId();
    log.error(`Seek progress update error: ${(error as Error).message} item=${ids?.libraryItemId || 'unknown'}`, error as Error);
  }
}

/**
 * Handle audio duck events (when other apps need audio focus)
 */
async function handleRemoteDuck(event: RemoteDuckEvent): Promise<void> {
  diagLog.info(
    `RemoteDuck received permanent=${event.permanent} paused=${event.paused} (${describeRuntimeContext()})`
  );
  try {
    const ids = await getUserIdAndLibraryItemId();
    if (ids) {
      if (event.permanent) {
        await TrackPlayer.pause();
        await progressService.handleDuck(ids.userId, ids.libraryItemId, true);
      } else if (event.paused) {
        await TrackPlayer.pause();
        await progressService.handleDuck(ids.userId, ids.libraryItemId, true);
      } else {
        await TrackPlayer.play();
        await progressService.handleDuck(ids.userId, ids.libraryItemId, false);
      }

      const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
      if (session) {
        log.info(`Audio duck: permanent=${event.permanent} paused=${event.paused} session=${session.sessionId} item=${ids.libraryItemId}`);
      }
    }
  } catch (error) {
    const ids = await getUserIdAndLibraryItemId();
    log.error(`Duck event error: ${(error as Error).message} item=${ids?.libraryItemId || 'unknown'}`, error as Error);
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

    const ids = await getUserIdAndLibraryItemId();
    if (ids) {
      const progress = await TrackPlayer.getProgress();
      const playbackRate = await TrackPlayer.getRate();
      const volume = await TrackPlayer.getVolume();
      const isPlaying = event.state === State.Playing;

      // Update the store with current position and playing state
      const store = useAppStore.getState();
      store.updatePosition(progress.position);
      store.updatePlayingState(isPlaying);

      await progressService.updateProgress(
        ids.userId,
        ids.libraryItemId,
        progress.position,
        playbackRate,
        volume,
        undefined,
        isPlaying
      );

      const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
      if (session) {
        log.info(`Playback state changed: ${event.state} session=${session.sessionId} item=${ids.libraryItemId}`);
      }
    }
  } catch (error) {
    const ids = await getUserIdAndLibraryItemId();
    log.error(`Playback state change error: ${(error as Error).message} item=${ids?.libraryItemId || 'unknown'}`, error as Error);
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
    const store = useAppStore.getState();
    const currentTrack = store.player.currentTrack;
    const ids = await getUserIdAndLibraryItemId();

    if (ids) {
      const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);

      if (Math.floor(event.position) % 5 === 0) {
        log.info(`Playback progress updated: position=${formatTime(event.position)} appState=${AppState.currentState} session=${session?.sessionId || 'none'} item=${ids.libraryItemId}`);
      }
      const playbackRate = await TrackPlayer.getRate();
      const volume = await TrackPlayer.getVolume();
      const state = await TrackPlayer.getPlaybackState();
      const isPlaying = state.state === State.Playing;

      // Update session progress (DB is source of truth)
      await progressService.updateProgress(
        ids.userId,
        ids.libraryItemId,
        event.position,
        playbackRate,
        volume,
        undefined,
        isPlaying
      );

      // Sync store position from session (DB is source of truth after updateProgress)
      const updatedSession = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
      const previousChapter = store.player.currentChapter;

      if (updatedSession) {
        // Use session position as source of truth, not TrackPlayer position directly
        // Position is always absolute (book position), not chapter-relative
        store.updatePosition(updatedSession.currentTime);
      } else {
        // Fallback to TrackPlayer position if session not found
        // Position is absolute (book position)
        store.updatePosition(event.position);
      }

      // Check if chapter changed (non-gated update)
      const currentChapter = store.player.currentChapter;
      if (previousChapter?.chapter.id !== currentChapter?.chapter.id && currentChapter) {
        // Chapter changed - update now playing metadata immediately (non-gated)
        await updateNowPlayingMetadata();
      }

      // Periodic now playing metadata updates (gated by setting)
      // Throttle to every 2 seconds to avoid excessive updates
      const { getPeriodicNowPlayingUpdatesEnabled } = await import('@/lib/appSettings');
      const periodicUpdatesEnabled = await getPeriodicNowPlayingUpdatesEnabled();
      if (periodicUpdatesEnabled && Math.floor(event.position) % 2 === 0) {
        await updateNowPlayingMetadata();
      }

      // Check if we should sync to server (uses adaptive intervals based on network type)
      const syncCheck = await progressService.shouldSyncToServer(ids.userId, ids.libraryItemId);
      if (syncCheck.shouldSync) {
        const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
        log.info(`Syncing to server: ${syncCheck.reason} appState=${AppState.currentState} session=${session?.sessionId || 'none'} item=${ids.libraryItemId}`);
        await progressService.syncSessionToServer(ids.userId, ids.libraryItemId);
      }
    } else if (currentTrack) {
      // No session - try to rehydrate from database if TrackPlayer has a track loaded
      log.info(`No session, attempting rehydration: position=${formatTime(event.position)}s appState=${AppState.currentState} item=${currentTrack.libraryItemId}`);
      const state = await TrackPlayer.getPlaybackState();
      const isPlaying = state.state === State.Playing;

      log.info(`Attempting to rehydrate session item=${currentTrack.libraryItemId}`);
      await progressService.forceRehydrateSession(currentTrack.libraryItemId);

      // Try to get session after rehydration
      const rehydratedIds = await getUserIdAndLibraryItemId();
      if (rehydratedIds) {
        const session = await progressService.getCurrentSession(rehydratedIds.userId, rehydratedIds.libraryItemId);
        if (session) {
          log.info(`Session rehydrated successfully, updating progress session=${session.sessionId} item=${rehydratedIds.libraryItemId}`);
          const playbackRate = await TrackPlayer.getRate();
          const volume = await TrackPlayer.getVolume();

          await progressService.updateProgress(
            rehydratedIds.userId,
            rehydratedIds.libraryItemId,
            event.position,
            playbackRate,
            volume,
            undefined,
            isPlaying
          );

          // Sync store position from rehydrated session (DB is source of truth)
          const updatedSession = await progressService.getCurrentSession(rehydratedIds.userId, rehydratedIds.libraryItemId);
          if (updatedSession) {
            store.updatePosition(updatedSession.currentTime);
          }
        } else if (isPlaying) {
          // Rehydration failed but playback is active - start a new session
          log.info(`Rehydration failed but playback is active, starting new session item=${currentTrack.libraryItemId}`);
          const username = await getItem(SECURE_KEYS.username);
          if (username) {
            const playbackRate = await TrackPlayer.getRate();
            const volume = await TrackPlayer.getVolume();
            const sessionId = store.player.currentPlaySessionId;

            try {
              await progressService.startSession(
                username,
                currentTrack.libraryItemId,
                currentTrack.mediaId,
                event.position, // Start at current position
                currentTrack.duration,
                playbackRate,
                volume,
                sessionId || undefined
              );

              // Now update progress with the new session
              const newIds = await getUserIdAndLibraryItemId();
              if (newIds) {
                await progressService.updateProgress(
                  newIds.userId,
                  newIds.libraryItemId,
                  event.position,
                  playbackRate,
                  volume,
                  undefined,
                  isPlaying
                );

                // Sync store position from new session
                const newSession = await progressService.getCurrentSession(newIds.userId, newIds.libraryItemId);
                if (newSession) {
                  store.updatePosition(newSession.currentTime);
                }
              }
            } catch (error) {
              log.error(`Failed to start new session after stale session cleared: ${(error as Error).message} item=${currentTrack.libraryItemId}`);
              // Fallback: update store from TrackPlayer position
              store.updatePosition(event.position);
            }
          } else {
            log.warn(`No username available, cannot start new session item=${currentTrack.libraryItemId}`);
            store.updatePosition(event.position);
          }
        } else {
          log.warn(`Failed to rehydrate session, and playback is not active item=${currentTrack.libraryItemId}`);
          // Fallback: update store from TrackPlayer position if no session
          store.updatePosition(event.position);
        }
      } else {
        log.info(`No current track in playerSlice, cannot rehydrate or start session`);
        // Fallback: update store from TrackPlayer position if no session
        store.updatePosition(event.position);
      }
    } else {
      // No track and no IDs - just update position from TrackPlayer
      store.updatePosition(event.position);
    }
  } catch (error) {
    const ids = await getUserIdAndLibraryItemId();
    const store = useAppStore.getState();
    const currentTrack = store.player.currentTrack;
    log.error(`Progress update error: ${(error as Error).message} item=${ids?.libraryItemId || currentTrack?.libraryItemId || 'unknown'}`, error as Error);
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

    // Get track info from playerSlice and username from secure store
    const store = useAppStore.getState();
    const currentTrack = store.player.currentTrack;
    const username = await getItem(SECURE_KEYS.username);

    log.info(`Active track changed: ${event.track?.title || "unknown"} item=${currentTrack?.libraryItemId || 'unknown'}`);

    if (currentTrack && username) {
      log.info(`Starting session for track: ${currentTrack.title} item=${currentTrack.libraryItemId}`);
      // Start session tracking
      const playbackRate = await TrackPlayer.getRate();
      const volume = await TrackPlayer.getVolume();
      const sessionId = store.player.currentPlaySessionId;

      await progressService.startSession(
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

    // Note: currentTrack is already set by PlayerService.playTrack() in playerSlice
    // so we don't need to set it again here
  } catch (error) {
    const store = useAppStore.getState();
    const currentTrack = store.player.currentTrack;
    log.error(`Active track change error: ${(error as Error).message} item=${currentTrack?.libraryItemId || 'unknown'}`, error as Error);
  }
}

/**
 * Handle playback errors
 */
async function handlePlaybackError(event: PlaybackErrorEvent): Promise<void> {
  try {
    const ids = await getUserIdAndLibraryItemId();
    const store = useAppStore.getState();
    const currentTrack = store.player.currentTrack;
    const itemId = ids?.libraryItemId || currentTrack?.libraryItemId || 'unknown';

    log.error(`Playback error: ${event.code} - ${event.message} item=${itemId}`);

    // End current session on critical playback errors
    if (ids) {
      const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
      log.info(`Ending session due to playback error session=${session?.sessionId || 'none'} item=${ids.libraryItemId}`);
      await progressService.endCurrentSession(ids.userId, ids.libraryItemId);
    }

    // Clear loading state
    store._setTrackLoading(false);
  } catch (error) {
    const ids = await getUserIdAndLibraryItemId();
    const store = useAppStore.getState();
    const currentTrack = store.player.currentTrack;
    log.error(`Error handling playback error: ${(error as Error).message} item=${ids?.libraryItemId || currentTrack?.libraryItemId || 'unknown'}`, error as Error);
  }
}

/**
 * Clean up existing event listeners
 */
function cleanupEventListeners(): void {
  if (global.__playerBackgroundServiceSubscriptions) {
    log.info("Cleaning up existing event listeners");
    diagLog.info(
      `Number of listeners to clean up: ${global.__playerBackgroundServiceSubscriptions.length} (${describeRuntimeContext()})`
    );
    global.__playerBackgroundServiceSubscriptions.forEach((unsub, idx) => {
      try {
        // unsub is already the .remove function, just call it
        if (typeof unsub === "function") {
          unsub();
          diagLog.info(`Cleaned up listener #${idx}`);
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
  diagLog.info(
    `Setting up listeners for events: ${eventTypes.join(
      ", "
    )} (${describeRuntimeContext()})`
  );

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
  diagLog.info(
    `Reconnecting background service: cleaning up and re-setting listeners (${describeRuntimeContext()})`
  );
  cleanupEventListeners();
  global.__playerBackgroundServiceSubscriptions = setupEventListeners();
  diagLog.info(
    `Number of listeners after setup: ${global.__playerBackgroundServiceSubscriptions.length}`
  );
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
  diagLog.info(
    `trackPlayerBackgroundService invoked (${describeRuntimeContext()})`
  );

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
