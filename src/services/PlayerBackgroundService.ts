/**
 * Track Player Background Service
 *
 * This service is required by react-native-track-player to handle
 * background playback events and remote control events.
 * Handles comprehensive progress syncing with 30s intervals and immediate sync on pause/duck.
 */

import { useAppStore } from '@/stores/appStore';
import TrackPlayer, { Event, State } from 'react-native-track-player';
import { unifiedProgressService } from './UnifiedProgressService';

module.exports = async function() {
  let lastActiveTrackId: string | null = null;

  // Track if we've already set up listeners to prevent duplicates during hot reload
  if (global.__playerBackgroundServiceInitialized) {
    console.log('[PlayerBackgroundService] Already initialized, skipping duplicate setup');
    return;
  }

  console.log('[PlayerBackgroundService] Setting up event listeners');
  global.__playerBackgroundServiceInitialized = true;

  // Store event listener subscriptions for cleanup
  const subscriptions: Array<{ remove: () => void }> = [];

  // Clean up on hot reload
  if (module.hot) {
    module.hot.dispose(() => {
      console.log('[PlayerBackgroundService] Cleaning up for hot reload');
      // Remove all event listeners
      subscriptions.forEach(subscription => {
        try {
          subscription.remove();
        } catch (error) {
          console.warn('[PlayerBackgroundService] Error removing subscription:', error);
        }
      });
      subscriptions.length = 0; // Clear the array
      global.__playerBackgroundServiceInitialized = false;
    });
  }

  // Remote control event handlers
  subscriptions.push(TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    await TrackPlayer.play();
  }));

  subscriptions.push(TrackPlayer.addEventListener(Event.RemotePause, async () => {
    await TrackPlayer.pause();
  }));

  subscriptions.push(TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    await TrackPlayer.stop();
    // End session when stopped
    await unifiedProgressService.endCurrentSession();
  }));

  subscriptions.push(TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext()));

  subscriptions.push(TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious()));

  subscriptions.push(TrackPlayer.addEventListener(Event.RemoteSeek, async (event) => {
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
          undefined, // chapterId - would need to be passed from main service
          state.state === State.Playing
        );

        // Update the store with new position after seek
        const store = useAppStore.getState();
        store.updatePosition(event.position);
      }
    } catch (error) {
      console.error('[PlayerBackgroundService] Seek progress update error:', error);
    }
  }));

  // Handle duck events (when other apps need audio focus)
  subscriptions.push(TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
    try {
      if (event.permanent) {
        await TrackPlayer.pause();
        await unifiedProgressService.handleDuck(true);
      } else {
        if (event.paused) {
          await TrackPlayer.pause();
          await unifiedProgressService.handleDuck(true);
        } else {
          await TrackPlayer.play();
          await unifiedProgressService.handleDuck(false);
        }
      }
    } catch (error) {
      console.error('[PlayerBackgroundService] Duck event error:', error);
    }
  }));

  // Handle playback state changes
  subscriptions.push(TrackPlayer.addEventListener(Event.PlaybackState, async (event) => {
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

        await unifiedProgressService.updateProgress(
          progress.position,
          playbackRate,
          volume,
          undefined, // chapterId - would need to be passed from main service
          isPlaying
        );

        // Update the store with current position and playing state
        const store = useAppStore.getState();
        store.updatePosition(progress.position);
        store.updatePlayingState(isPlaying);
      }
    } catch (error) {
      console.error('[PlayerBackgroundService] Playback state change error:', error);
    }
  }));

  // Handle progress updates for background sync
  subscriptions.push(TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, async (event) => {
    try {
      // Get current session info
      const currentSession = unifiedProgressService.getCurrentSession();
      if (currentSession) {
        const playbackRate = await TrackPlayer.getRate();
        const volume = await TrackPlayer.getVolume();
        const state = await TrackPlayer.getPlaybackState();

        // Update session progress (this will handle 30s sync timing and immediate pause sync)
        await unifiedProgressService.updateProgress(
          event.position,
          playbackRate,
          volume,
          undefined, // chapterId - would need to be passed from main service
          state.state === State.Playing
        );

        // Update the store with current position (this fixes the UI updates)
        const store = useAppStore.getState();
        store.updatePosition(event.position);
      }
    } catch (error) {
      // Silently handle errors in background service to avoid crashes
      console.error('[PlayerBackgroundService] Progress update error:', error);
    }
  }));

  // Handle active track changes
  subscriptions.push(TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (event) => {
    try {
      // Avoid processing duplicate events
      const currentActiveTrack = await TrackPlayer.getActiveTrack();
      if (!currentActiveTrack || currentActiveTrack.id === lastActiveTrackId) {
        return;
      }

      lastActiveTrackId = currentActiveTrack.id;
      console.log('[PlayerBackgroundService] Active track changed:', event);

      // Update store position when track changes
      const store = useAppStore.getState();
      store.updatePosition(0); // Reset position for new track

    } catch (error) {
      console.error('[PlayerBackgroundService] Active track change error:', error);
    }
  }));

  // Handle playback errors
  subscriptions.push(TrackPlayer.addEventListener(Event.PlaybackError, async (event) => {
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
  }));
};
