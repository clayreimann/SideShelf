/**
 * Track Player Background Service
 *
 * This service is required by react-native-track-player to handle
 * background playback events and remote control events.
 * Handles comprehensive progress syncing using TrackPlayer events.
 */

import { getItem, SECURE_KEYS } from '@/lib/secureStore';
import { useAppStore } from '@/stores/appStore';
import TrackPlayer, {
  Event,
  PlaybackActiveTrackChangedEvent,
  PlaybackErrorEvent,
  PlaybackProgressUpdatedEvent,
  PlaybackState as PlaybackStateEvent,
  RemoteDuckEvent,
  RemoteSeekEvent,
  State
} from 'react-native-track-player';
import { playerService } from './PlayerService';
import { unifiedProgressService } from './ProgressService';

// Add type definition for the global property
declare global {
  // eslint-disable-next-line no-var
  var __playerBackgroundServiceInitialized: boolean | undefined;
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
    console.error('[PlayerBackgroundService] Seek progress update error:', error);
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
    console.error('[PlayerBackgroundService] Duck event error:', error);
  }
}

/**
 * Handle playback state changes (playing, paused, stopped, etc.)
 */
async function handlePlaybackStateChanged(event: PlaybackStateEvent): Promise<void> {
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
    console.error('[PlayerBackgroundService] Playback state change error:', error);
  }
}

/**
 * Handle playback progress updates (fired every second during playback)
 * This is where we check if periodic sync to server is needed
 */
async function handlePlaybackProgressUpdated(event: PlaybackProgressUpdatedEvent): Promise<void> {
  try {
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
        console.log(`[PlayerBackgroundService] Syncing to server: ${syncCheck.reason}`);
        await unifiedProgressService.syncCurrentSessionToServer();
      }
    }
  } catch (error) {
    console.error('[PlayerBackgroundService] Progress update error:', error);
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
    if (!currentActiveTrack || currentActiveTrack.id === lastActiveTrackId.value) {
      return;
    }

    lastActiveTrackId.value = currentActiveTrack.id;
    console.log('[PlayerBackgroundService] Active track changed:', event);

    // Get track info from PlayerService and username from secure store
    const currentTrack = playerService.getCurrentTrack();
    const username = await getItem(SECURE_KEYS.username);

    if (currentTrack && username) {
      console.log('[PlayerBackgroundService] Starting session for track:', currentTrack.title);
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
    console.error('[PlayerBackgroundService] Active track change error:', error);
  }
}

/**
 * Handle playback errors
 */
async function handlePlaybackError(event: PlaybackErrorEvent): Promise<void> {
  console.error('[PlayerBackgroundService] Playback error:', event);

  try {
    // End current session on critical playback errors
    const currentSession = unifiedProgressService.getCurrentSession();
    if (currentSession) {
      console.log('[PlayerBackgroundService] Ending session due to playback error');
      await unifiedProgressService.endCurrentSession();
    }

    // Clear loading state
    const store = useAppStore.getState();
    store._setTrackLoading(false);
  } catch (error) {
    console.error('[PlayerBackgroundService] Error handling playback error:', error);
  }
}

module.exports = async function() {
  // Track if we've already set up listeners to prevent duplicates during hot reload
  if (global.__playerBackgroundServiceInitialized) {
    console.log('[PlayerBackgroundService] Already initialized, skipping duplicate setup');
    return;
  }

  console.log('[PlayerBackgroundService] Setting up event listeners');
  global.__playerBackgroundServiceInitialized = true;

  // Store event listener subscriptions for cleanup
  const subscriptions: Array<{ remove: () => void }> = [];

  // Use object to store lastActiveTrackId so it can be mutated in the handler
  const lastActiveTrackId = { value: null as string | null };

  // Register remote control event handlers
  subscriptions.push(TrackPlayer.addEventListener(Event.RemotePlay, handleRemotePlay));
  subscriptions.push(TrackPlayer.addEventListener(Event.RemotePause, handleRemotePause));
  subscriptions.push(TrackPlayer.addEventListener(Event.RemoteStop, handleRemoteStop));
  subscriptions.push(TrackPlayer.addEventListener(Event.RemoteNext, handleRemoteNext));
  subscriptions.push(TrackPlayer.addEventListener(Event.RemotePrevious, handleRemotePrevious));
  subscriptions.push(TrackPlayer.addEventListener(Event.RemoteSeek, handleRemoteSeek));
  subscriptions.push(TrackPlayer.addEventListener(Event.RemoteDuck, handleRemoteDuck));

  // Register playback event handlers
  subscriptions.push(TrackPlayer.addEventListener(Event.PlaybackState, handlePlaybackStateChanged));
  subscriptions.push(TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, handlePlaybackProgressUpdated));
  subscriptions.push(TrackPlayer.addEventListener(
    Event.PlaybackActiveTrackChanged,
    (event) => handleActiveTrackChanged(event, lastActiveTrackId)
  ));
  subscriptions.push(TrackPlayer.addEventListener(Event.PlaybackError, handlePlaybackError));
};
