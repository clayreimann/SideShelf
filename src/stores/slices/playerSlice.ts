/**
 * Player slice for Zustand store
 *
 * This slice manages audio player state including:
 * - Current track and playback state
 * - Chapter information
 * - Progress and timing
 * - Loading states
 */

import { getUserByUsername } from "@/db/helpers/users";
import { ASYNC_KEYS, getItem as getAsyncItem, saveItem } from "@/lib/asyncStore";
import { formatTime } from "@/lib/helpers/formatters";
import { logger } from "@/lib/logger";
import { getStoredUsername } from "@/lib/secureStore";
import { configureTrackPlayer } from "@/lib/trackPlayerConfig";
import { progressService } from "@/services/ProgressService";
import type { CurrentChapter, PlayerTrack } from "@/types/player";
import type { SliceCreator } from "@/types/store";
import TrackPlayer from "react-native-track-player";

const log = logger.forTag("PlayerSlice");

/**
 * Player slice state interface - scoped under 'player' to avoid conflicts
 */
export interface PlayerSliceState {
  player: {
    /** Currently loaded track */
    currentTrack: PlayerTrack | null;
    /** Whether audio is currently playing */
    isPlaying: boolean;
    /** Current playback position in seconds */
    position: number;
    /** Current chapter information */
    currentChapter: CurrentChapter | null;
    /** Playback rate (1.0 = normal speed) */
    playbackRate: number;
    /** Volume (0.0 to 1.0) */
    volume: number;
    /** Current play session ID (for streaming sessions) */
    currentPlaySessionId: string | null;
    /** Timestamp of last pause (for smart rewind) */
    lastPauseTime: number | null;
    /** Whether the full-screen modal is visible */
    isModalVisible: boolean;
    /** Loading states */
    loading: {
      /** Whether a track is being loaded */
      isLoadingTrack: boolean;
      /** Whether seeking is in progress */
      isSeeking: boolean;
    };
    /** Whether the player has been initialized */
    initialized: boolean;
    /** Whether we're currently restoring state (prevents premature chapter updates) */
    isRestoringState: boolean;
  };
}

/**
 * Player slice actions interface
 *
 * This interface contains ONLY internal mutators for use by services.
 * All player control actions should go through PlayerService directly.
 */
export interface PlayerSliceActions {
  /** Restore persisted player state from AsyncStorage */
  restorePersistedState: () => Promise<void>;
  // Initialization
  /** Initialize the player slice */
  initializePlayerSlice: () => Promise<void>;

  // UI-only action
  /** Show/hide full-screen modal */
  setModalVisible: (visible: boolean) => void;

  // Internal mutators (used by PlayerBackgroundService)
  /** Update current position (called by PlayerBackgroundService) */
  updatePosition: (position: number) => void;
  /** Update playing state (called by PlayerBackgroundService) */
  updatePlayingState: (isPlaying: boolean) => void;
  /** Set current track (called by PlayerBackgroundService) */
  _setCurrentTrack: (track: PlayerTrack | null) => void;
  /** Set loading state for track */
  _setTrackLoading: (loading: boolean) => void;
  /** Set seeking state */
  _setSeeking: (seeking: boolean) => void;
  /** Update current chapter based on position */
  _updateCurrentChapter: (position: number) => void;
  /** Update playback rate in store */
  _setPlaybackRate: (rate: number) => void;
  /** Update volume in store */
  _setVolume: (volume: number) => void;
  /** Set current play session ID (for streaming sessions) */
  _setPlaySessionId: (sessionId: string | null) => void;
  /** Set last pause time (for smart rewind) */
  _setLastPauseTime: (timestamp: number | null) => void;
  /** Update now playing metadata with chapter information */
  updateNowPlayingMetadata: () => Promise<void>;
  /** Set isRestoringState flag to prevent UI jumping during state restoration */
  setIsRestoringState: (isRestoring: boolean) => void;
}

/**
 * Combined player slice interface
 */
export interface PlayerSlice extends PlayerSliceState, PlayerSliceActions {}

/**
 * Create player slice
 */
export const createPlayerSlice: SliceCreator<PlayerSlice> = (set, get) => ({
  restorePersistedState: async () => {
    // Set flag to prevent premature chapter updates during state restoration
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        isRestoringState: true,
      },
    }));

    const store = get();
    const restored: string[] = [];
    const notFound: string[] = [];

    // Restore from AsyncStorage first
    if (!store.player.currentTrack) {
      const track = await getAsyncItem(ASYNC_KEYS.currentTrack);
      if (track) {
        store._setCurrentTrack(track);
        restored.push(`currentTrack`);
      } else {
        notFound.push(`currentTrack`);
      }
    }

    const playbackRate = await getAsyncItem(ASYNC_KEYS.playbackRate);
    if (playbackRate !== null && playbackRate !== undefined) {
      store._setPlaybackRate(playbackRate);
      restored.push(`playbackRate=${playbackRate}`);
    } else {
      notFound.push(`playbackRate`);
    }

    const volume = await getAsyncItem(ASYNC_KEYS.volume);
    if (volume !== null && volume !== undefined) {
      store._setVolume(volume);
      restored.push(`volume=${volume}`);
    } else {
      notFound.push(`volume`);
    }

    const asyncStoragePosition = await getAsyncItem(ASYNC_KEYS.position);
    if (asyncStoragePosition !== null && asyncStoragePosition !== undefined) {
      store.updatePosition(asyncStoragePosition);
      restored.push(`position=${formatTime(asyncStoragePosition)}s`);
    } else {
      notFound.push(`position`);
    }

    const isPlaying = await getAsyncItem(ASYNC_KEYS.isPlaying);
    if (isPlaying !== null && isPlaying !== undefined) {
      store.updatePlayingState(isPlaying);
      restored.push(`isPlaying=${isPlaying}`);
    } else {
      notFound.push(`isPlaying`);
    }

    const currentPlaySessionId = await getAsyncItem(ASYNC_KEYS.currentPlaySessionId);
    if (currentPlaySessionId !== null && currentPlaySessionId !== undefined) {
      store._setPlaySessionId(currentPlaySessionId);
      restored.push(`currentPlaySessionId`);
    } else {
      notFound.push(`currentPlaySessionId`);
    }

    // Log consolidated summary
    log.info(
      `State restoration from AsyncStorage: restored=[${restored.join(", ")}], notFound=[${notFound.join(", ")}]`
    );

    // Reconcile with ProgressService database (source of truth)
    let dbReconciliationSummary: string[] = [];
    try {
      // Need userId and libraryItemId to get session - skip if not available
      const username = await getStoredUsername();
      if (!username) {
        dbReconciliationSummary.push("skipped (no username)");
      } else {
        const user = await getUserByUsername(username);
        if (!user?.id) {
          dbReconciliationSummary.push("skipped (user not found)");
        } else {
          const libraryItemId = store.player.currentTrack?.libraryItemId;
          if (!libraryItemId) {
            dbReconciliationSummary.push("skipped (no currentTrack)");
          } else {
            const dbSession = await progressService.getCurrentSession(user.id, libraryItemId);

            if (dbSession) {
              dbReconciliationSummary.push(`found session for ${libraryItemId}`);

              // Check if position should be updated from DB session
              // DB session position is authoritative
              if (dbSession.currentTime !== store.player.position) {
                const positionDiff = Math.abs(dbSession.currentTime - store.player.position);
                if (positionDiff > 1) {
                  // Only update if difference is significant (>1s)
                  dbReconciliationSummary.push(
                    `position updated: ${formatTime(store.player.position)}s -> ${formatTime(dbSession.currentTime)}s`
                  );
                  store.updatePosition(dbSession.currentTime);
                } else {
                  dbReconciliationSummary.push(`position match (diff=${positionDiff}s)`);
                }
              } else {
                dbReconciliationSummary.push(`position match`);
              }

              // Check if currentTrack should be updated from DB session
              const currentTrackLibraryItemId = store.player.currentTrack?.libraryItemId;
              if (
                !currentTrackLibraryItemId ||
                currentTrackLibraryItemId !== dbSession.libraryItemId
              ) {
                dbReconciliationSummary.push(
                  `track mismatch: AsyncStorage=${currentTrackLibraryItemId || "none"}, DB=${dbSession.libraryItemId}`
                );
                // Note: We can't fully restore PlayerTrack here without loading metadata/files
                // The track will be restored by PlayerService.restorePlayerServiceFromSession() or playTrack()
              } else {
                dbReconciliationSummary.push(`track match`);
              }
            } else {
              dbReconciliationSummary.push("no active session found");
            }
          }
        }
      }
    } catch (error) {
      dbReconciliationSummary.push(`error: ${(error as Error).message}`);
      log.error("Failed to reconcile with ProgressService", error as Error);
      // Continue with AsyncStorage values if reconciliation fails
    }

    if (dbReconciliationSummary.length > 0) {
      log.info(`DB reconciliation: ${dbReconciliationSummary.join(", ")}`);
    }

    // Try to apply position to TrackPlayer if possible
    // This is a best-effort attempt - if TrackPlayer isn't ready, it will fail silently
    if (store.player.position > 0) {
      try {
        const queue = await TrackPlayer.getQueue();
        if (queue.length > 0) {
          await TrackPlayer.seekTo(store.player.position);
          log.info(
            `Applied restored position to TrackPlayer: ${formatTime(store.player.position)}s`
          );
        }
      } catch (error) {
        // Ignore errors - TrackPlayer might not be ready yet
        log.info("Could not apply position to TrackPlayer (player may not be ready)");
      }
    }

    // Clear the restoration flag and update chapter with final position
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        isRestoringState: false,
      },
    }));

    // Now update the chapter with the correct position
    if (store.player.currentTrack && store.player.position > 0) {
      store._updateCurrentChapter(store.player.position);
    }
  },
  // Initial scoped state
  player: {
    currentTrack: null,
    isPlaying: false,
    position: 0,
    currentChapter: null,
    playbackRate: 1.0,
    volume: 1.0,
    currentPlaySessionId: null,
    lastPauseTime: null,
    isModalVisible: false,
    loading: {
      isLoadingTrack: false,
      isSeeking: false,
    },
    initialized: false,
    isRestoringState: false,
  },

  // Actions
  initializePlayerSlice: async () => {
    log.info("Initializing player slice");
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        initialized: true,
      },
    }));
  },

  setModalVisible: (visible: boolean) => {
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        isModalVisible: visible,
      },
    }));
  },

  updatePosition: (position: number) => {
    const state = get() as PlayerSlice;
    // Position is always absolute (book position in seconds), not chapter-relative
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        position,
      },
    }));
    saveItem(ASYNC_KEYS.position, position);
    // Update current chapter (calculates chapter-relative position internally)
    state._updateCurrentChapter(position);
  },

  updatePlayingState: (isPlaying: boolean) => {
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        isPlaying,
      },
    }));
    saveItem(ASYNC_KEYS.isPlaying, isPlaying);
  },

  _setCurrentTrack: (track: PlayerTrack | null) => {
    const state = get() as PlayerSlice;
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        currentTrack: track,
        position: track ? state.player.position : 0,
        currentChapter: null,
      },
    }));
    // Persist current track to AsyncStorage
    saveItem(ASYNC_KEYS.currentTrack, track);
    // Update current chapter if we have a track
    if (track) {
      state._updateCurrentChapter(state.player.position);
    }
  },

  _setTrackLoading: (loading: boolean) => {
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        loading: {
          ...state.player.loading,
          isLoadingTrack: loading,
        },
      },
    }));
  },

  _setSeeking: (seeking: boolean) => {
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        loading: {
          ...state.player.loading,
          isSeeking: seeking,
        },
      },
    }));
  },

  _updateCurrentChapter: (position: number) => {
    const state = get() as PlayerSlice;
    const { currentTrack, currentChapter, isRestoringState } = state.player;

    // Skip chapter updates during state restoration to prevent UI jumping
    // The correct chapter will be set after restoration completes
    if (isRestoringState) {
      log.debug("Skipping chapter update during state restoration");
      return;
    }

    if (!currentTrack || !currentTrack.chapters.length) {
      log.info(
        `Cannot update current chapter hasTrack=${!!currentTrack} hasChapters=${currentTrack?.chapters?.length ?? 0}`
      );
      return;
    }

    const chapters = currentTrack.chapters;
    const previousChapter = currentChapter?.chapter;

    // Keep prior chapter if position still within its bounds
    const chapterStillValid =
      previousChapter && position >= previousChapter.start && position < previousChapter.end
        ? previousChapter
        : undefined;

    let resolvedChapter =
      chapterStillValid ??
      chapters.find((chapter) => position >= chapter.start && position < chapter.end);

    if (!resolvedChapter) {
      // Clamp to closest chapter when outside known ranges
      resolvedChapter =
        position >= chapters[chapters.length - 1].end ? chapters[chapters.length - 1] : chapters[0];
    }

    const hasChapterChanged = previousChapter?.id !== resolvedChapter.id;
    const chapterDuration = Math.max(0, resolvedChapter.end - resolvedChapter.start);
    const rawPositionInChapter = position - resolvedChapter.start;
    const positionInChapter = Math.max(0, Math.min(chapterDuration, rawPositionInChapter));

    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        currentChapter: {
          chapter: resolvedChapter,
          positionInChapter,
          chapterDuration,
        },
      },
    }));

    if (hasChapterChanged) {
      log.info(
        `Current chapter updated: "${resolvedChapter.title}" (${formatTime(resolvedChapter.start)}s - ${formatTime(resolvedChapter.end)}s)`
      );
    }
  },

  _setPlaybackRate: (rate: number) => {
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        playbackRate: rate,
      },
    }));
    saveItem(ASYNC_KEYS.playbackRate, rate);
  },

  _setVolume: (volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        volume: clampedVolume,
      },
    }));
    saveItem(ASYNC_KEYS.volume, clampedVolume);
  },

  _setPlaySessionId: (sessionId: string | null) => {
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        currentPlaySessionId: sessionId,
      },
    }));
    saveItem(ASYNC_KEYS.currentPlaySessionId, sessionId);
  },

  _setLastPauseTime: (timestamp: number | null) => {
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        lastPauseTime: timestamp,
      },
    }));
    // Note: lastPauseTime is not persisted - it's ephemeral state for smart rewind
  },

  setIsRestoringState: (isRestoring: boolean) => {
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        isRestoringState: isRestoring,
      },
    }));
  },

  /**
   * Update now playing metadata with chapter information
   *
   * Updates the now playing center with:
   * - Title: Current chapter title
   * - Album: Book title
   * - Duration: Chapter duration (so progress bar shows chapter progress)
   * - Elapsed time: Chapter-relative position (resets to 0 at start of each chapter)
   *
   * Note: TrackPlayer's actual playback position is always absolute (book position),
   * but we set elapsedTime to chapter-relative position so the now playing center
   * shows progress within the current chapter.
   */
  updateNowPlayingMetadata: async () => {
    try {
      const state = get();
      const { currentTrack, currentChapter } = state.player;
      if (!currentTrack || !currentChapter) {
        log.debug("Skipping now playing metadata update - missing track or chapter");
        return;
      }

      log.debug(
        `Updating now playing metadata for track=${currentTrack.libraryItemId} chapter=${currentChapter.chapter.id}`
      );

      // Use chapter-relative position for elapsed time
      // positionInChapter is calculated as: absolutePosition - chapter.start
      const chapterElapsedTime = currentChapter.positionInChapter;
      const chapterDuration = currentChapter.chapterDuration;
      const chapterTitle = currentChapter.chapter.title;
      const bookTitle = currentTrack.title;
      const author = currentTrack.author;

      // Get the active track index to update its metadata
      const activeTrackIndex = await TrackPlayer.getActiveTrackIndex();
      if (activeTrackIndex === undefined || activeTrackIndex === null || activeTrackIndex < 0) {
        log.warn("Cannot update now playing metadata - no active track index");
        return;
      }

      const activeTrack = await TrackPlayer.getActiveTrack();
      // Update now playing metadata with chapter info
      // TrackPlayer will use this for the lock screen and notification controls
      await TrackPlayer.updateMetadataForTrack(activeTrackIndex, {
        title: chapterTitle,
        artist: author,
        album: bookTitle,
        // Always set artwork when available to ensure it displays
        artwork: currentTrack.coverUri || undefined,
        duration: chapterDuration,
        // @ts-ignore - elapsedTime is used by iOS native code (Metadata.swift) but not in TypeScript types
        elapsedTime: chapterElapsedTime,
      });

      // Double check that we don't lose the trackplayer controls on the lock screen
      await configureTrackPlayer();

      log.debug(
        `Updated now playing: chapter="${chapterTitle}" elapsed=${formatTime(chapterElapsedTime)}/${formatTime(chapterDuration)}`
      );
    } catch (error) {
      log.error("Failed to update now playing metadata:", error as Error);
    }
  },
});
