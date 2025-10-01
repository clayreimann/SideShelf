/**
 * Track Player Service
 *
 * This service is required by react-native-track-player to handle
 * background playback events and remote control events.
 * Also handles progress syncing in the background.
 */

import TrackPlayer, { Event } from 'react-native-track-player';
import { sessionTrackingService } from './SessionTrackingService';

module.exports = async function() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());

  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());

  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());

  TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());

  TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());

  TrackPlayer.addEventListener(Event.RemoteSeek, (event) => TrackPlayer.seekTo(event.position));

  // Handle duck events (when other apps need audio focus)
  TrackPlayer.addEventListener(Event.RemoteDuck, async (event) => {
    if (event.permanent) {
      TrackPlayer.pause();
    } else {
      if (event.paused) {
        TrackPlayer.pause();
      } else {
        TrackPlayer.play();
      }
    }
  });

  // Handle progress updates for background sync
  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, async (event) => {
    try {
      // Get current session info
      const currentSession = sessionTrackingService.getCurrentSession();
      if (currentSession) {
        const playbackRate = await TrackPlayer.getRate();
        const volume = await TrackPlayer.getVolume();
        const state = await TrackPlayer.getPlaybackState();

        // Update session progress (this will handle background sync)
        await sessionTrackingService.updateProgress(
          event.position,
          playbackRate,
          volume,
          undefined, // chapterId - would need to be passed from main service
          state.state === 'playing'
        );
      }
    } catch (error) {
      // Silently handle errors in background service
      console.error('[PlayerBackgroundService] Progress update error:', error);
    }
  });
};
