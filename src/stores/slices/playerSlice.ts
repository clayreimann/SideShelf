/**
 * Player slice for Zustand store
 *
 * This slice manages audio player state including:
 * - Current track and playback state
 * - Chapter information
 * - Progress and timing
 * - Loading states
 */

import { ASYNC_KEYS, saveItem } from '@/lib/asyncStore';
import type { CurrentChapter, PlayerTrack } from '@/types/player';
import type { SliceCreator } from '@/types/store';

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
    const { getItem, ASYNC_KEYS } = await import('@/lib/asyncStore');
    const { logger } = await import('@/lib/logger');
    const log = logger.forTag('PlayerSlice');

    const store = get();
    if (!store.player.currentTrack) {
      const track = await getItem(ASYNC_KEYS.currentTrack);
      if (track) {
        store._setCurrentTrack(track);
        log.info('Restored currentTrack from AsyncStorage');
      } else {
        log.info('No currentTrack found in AsyncStorage');
      }
    }
    const playbackRate = await getItem(ASYNC_KEYS.playbackRate);
    if (playbackRate !== null && playbackRate !== undefined) {
      store._setPlaybackRate(playbackRate);
      log.info('Restored playbackRate from AsyncStorage');
    }
    const volume = await getItem(ASYNC_KEYS.volume);
    if (volume !== null && volume !== undefined) {
      store._setVolume(volume);
      log.info('Restored volume from AsyncStorage');
    }
    const position = await getItem(ASYNC_KEYS.position);
    if (position !== null && position !== undefined) {
      store.updatePosition(position);
      log.info(`Restored position from AsyncStorage: ${position}s`);

      // Try to apply position to TrackPlayer if possible
      // This is a best-effort attempt - if TrackPlayer isn't ready, it will fail silently
      try {
        const TrackPlayer = await import('react-native-track-player');
        const queue = await TrackPlayer.default.getQueue();
        if (queue.length > 0) {
          await TrackPlayer.default.seekTo(position);
          log.info(`Applied restored position to TrackPlayer: ${position}s`);
        }
      } catch (error) {
        // Ignore errors - TrackPlayer might not be ready yet
        log.info('Could not apply position to TrackPlayer (player may not be ready)');
      }
    }
    const isPlaying = await getItem(ASYNC_KEYS.isPlaying);
    if (isPlaying !== null && isPlaying !== undefined) {
      store.updatePlayingState(isPlaying);
      log.info('Restored isPlaying from AsyncStorage');
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
    isModalVisible: false,
    loading: {
      isLoadingTrack: false,
      isSeeking: false,
    },
    initialized: false,
  },

  // Actions
  initializePlayerSlice: async () => {
    const { logger } = await import('@/lib/logger');
    const log = logger.forTag('PlayerSlice');
    log.info('Initializing player slice');
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
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        position,
      },
    }));
    saveItem(ASYNC_KEYS.position, position);
    // Update current chapter
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
    const { currentTrack } = state.player;

    if (!currentTrack || !currentTrack.chapters.length) {
      return;
    }

    // Find the current chapter based on position
    const currentChapter = currentTrack.chapters.find(
      (chapter) => position >= chapter.start && position < chapter.end
    );

    if (currentChapter) {
      const positionInChapter = position - currentChapter.start;
      const chapterDuration = currentChapter.end - currentChapter.start;

      set((state: PlayerSlice) => ({
        ...state,
        player: {
          ...state.player,
          currentChapter: {
            chapter: currentChapter,
            positionInChapter,
            chapterDuration,
          },
        },
      }));
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
});
