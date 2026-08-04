/**
 * PlaybackControlCollaborator
 *
 * Concern group: direct playback control operations.
 * Owns: executePlay, executePause, executeStop, executeSeek, executeSetRate, executeSetVolume.
 *
 * Each method owns exactly one TrackPlayer operation plus any required store side-effects.
 * The coordinator ensures queue is built before calling executePlay via executeRebuildQueue.
 */

import { applySmartRewind, type SmartRewindOutcome } from "@/lib/smartRewind";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/stores/appStore";
import TrackPlayer from "react-native-track-player";
import type { IPlaybackControlCollaborator, IPlayerServiceFacade } from "./types";
import type { DispatchMeta } from "@/types/coordinator";

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
   *
   * @param position The coordinator's current authoritative position (seconds).
   * Task 4c: passed explicitly by the coordinator (context.position) instead of
   * this method reading store.player.position itself. Previously
   * TrackLoadingCollaborator wrote the just-resolved seek position to the store
   * for the SOLE purpose of letting this method read it back — two functions
   * communicating through global state. For streaming tracks,
   * TrackPlayer.getProgress().position returns 0 until the stream buffers to the
   * seekTo position, which is why this can't just read TrackPlayer directly
   * (applySmartRewind accepts an optional currentPosition for exactly this).
   */
  async executePlay(position: number, meta?: DispatchMeta): Promise<SmartRewindOutcome | null> {
    try {
      const store = useAppStore.getState();

      // Start playback first to establish audio session in "playing" state,
      // then apply smart rewind while already playing.
      // Calling seekTo() on a paused track before play() can trigger a
      // spurious iOS RemotePause ~200ms later (observed in trace seq 175, 233).
      await TrackPlayer.play();
      const smartRewindOutcome = meta?.skipSmartRewind ? null : await applySmartRewind(position);

      // Clear pause time since we're resuming
      store._setLastPauseTime(null);
      return smartRewindOutcome;
    } catch (error) {
      // Loading-state recovery is owned by the coordinator now (Task 3b/3c):
      // this rejection propagates to the coordinator's executeTransition catch
      // block, which dispatches NATIVE_ERROR; the coordinator's NATIVE_ERROR
      // handler clears context.isLoadingTrack, and its store bridge pushes that
      // to the store. A direct store._setTrackLoading(false) write here was
      // dead — it ran before that subsequent syncStateToStore call, which
      // re-pushed context.isLoadingTrack (still true) right back over it.
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
