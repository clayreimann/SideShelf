/**
 * PlaybackControlCollaborator
 *
 * Concern group: direct playback control operations.
 * Owns: executePlay, executePause, executeStop, executeSeek, executeSetRate, executeSetVolume.
 *
 * Each method owns exactly one TrackPlayer operation plus any required store side-effects.
 * The coordinator ensures queue is built before calling executePlay via executeRebuildQueue.
 */

import { applySmartRewind } from "@/lib/smartRewind";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/stores/appStore";
import TrackPlayer from "react-native-track-player";
import type { IPlaybackControlCollaborator, IPlayerServiceFacade } from "./types";

const log = logger.forTag("PlayerService");

/**
 * Handles direct TrackPlayer playback control operations.
 */
export class PlaybackControlCollaborator implements IPlaybackControlCollaborator {
  constructor(private facade: IPlayerServiceFacade) {}

  /**
   * Execute play (Internal - Called by Coordinator).
   * Applies smart rewind and starts playback. The coordinator ensures the
   * queue is already built before calling this method.
   */
  async executePlay(): Promise<void> {
    try {
      const store = useAppStore.getState();

      // Apply smart rewind (checks enabled setting internally)
      await applySmartRewind();

      // Clear pause time since we're resuming
      store._setLastPauseTime(null);
      await TrackPlayer.play();
    } catch (error) {
      const store = useAppStore.getState();
      store._setTrackLoading(false);
      throw error;
    }
  }

  /**
   * Execute pause (Internal - Called by Coordinator).
   */
  async executePause(): Promise<void> {
    const store = useAppStore.getState();
    const pauseTime = Date.now();
    store._setLastPauseTime(pauseTime);
    log.info(`Pausing playback at ${new Date(pauseTime).toISOString()}`);
    await TrackPlayer.pause();
  }

  /**
   * Execute stop (Internal - Called by Coordinator).
   * Coordinator bridge handles clearing currentTrack and sessionId via syncStateToStore.
   */
  async executeStop(): Promise<void> {
    // PlayerBackgroundService will handle ending the session
    await TrackPlayer.stop();
    await TrackPlayer.reset();
    // store._setCurrentTrack(null) removed: STOP event sets context.currentTrack=null,
    //   coordinator bridge syncs via syncStateToStore
    // store._setPlaySessionId(null) removed: STOP event sets context.sessionId=null,
    //   coordinator bridge syncs via syncStateToStore
  }

  /**
   * Execute seek (Internal - Called by Coordinator).
   */
  async executeSeek(position: number): Promise<void> {
    await TrackPlayer.seekTo(position);
    this.facade.dispatchEvent({ type: "SEEK_COMPLETE" });
  }

  /**
   * Execute set rate (Internal - Called by Coordinator).
   */
  async executeSetRate(rate: number): Promise<void> {
    await TrackPlayer.setRate(rate);
  }

  /**
   * Execute set volume (Internal - Called by Coordinator).
   */
  async executeSetVolume(volume: number): Promise<void> {
    await TrackPlayer.setVolume(volume);
  }
}
