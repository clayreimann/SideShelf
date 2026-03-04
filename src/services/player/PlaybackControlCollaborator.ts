/**
 * PlaybackControlCollaborator
 *
 * Concern group: direct playback control operations.
 * Owns: executePlay, executePause, executeStop, executeSeek, executeSetRate, executeSetVolume.
 *
 * Each method owns exactly one TrackPlayer operation plus any required store side-effects.
 * executePlay delegates the track-rebuild check to facade.rebuildCurrentTrackIfNeeded()
 * (implemented by ProgressRestoreCollaborator, exposed on the facade interface).
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
   * Rebuilds the queue if needed, applies smart rewind, then starts playback.
   */
  async executePlay(): Promise<void> {
    const prepared = await this.facade.rebuildCurrentTrackIfNeeded();
    if (!prepared) {
      log.warn("Playback request ignored: no track available after restoration");
      return;
    }

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
