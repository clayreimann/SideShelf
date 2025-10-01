/**
 * Player slice for Zustand store
 *
 * This slice manages audio player state including:
 * - Current track and playback state
 * - Chapter information
 * - Progress and timing
 * - Loading states
 */

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
 */
export interface PlayerSliceActions {
  // Public methods
  /** Initialize the player slice */
  initializePlayerSlice: () => Promise<void>;
  /** Load and play a track */
  playTrack: (track: PlayerTrack) => Promise<void>;
  /** Toggle play/pause */
  togglePlayPause: () => Promise<void>;
  /** Pause playback */
  pause: () => Promise<void>;
  /** Resume playback */
  play: () => Promise<void>;
  /** Seek to a specific position in seconds */
  seekTo: (position: number) => Promise<void>;
  /** Skip forward by seconds (default 30) */
  skipForward: (seconds?: number) => Promise<void>;
  /** Skip backward by seconds (default 15) */
  skipBackward: (seconds?: number) => Promise<void>;
  /** Set playback rate */
  setPlaybackRate: (rate: number) => Promise<void>;
  /** Set volume */
  setVolume: (volume: number) => Promise<void>;
  /** Show/hide full-screen modal */
  setModalVisible: (visible: boolean) => void;
  /** Update current position (called by track player events) */
  updatePosition: (position: number) => void;
  /** Update playing state (called by track player events) */
  updatePlayingState: (isPlaying: boolean) => void;
  /** Clear current track */
  clearTrack: () => void;

  // Private methods (prefixed with _)
  /** Set loading state for track */
  _setTrackLoading: (loading: boolean) => void;
  /** Set seeking state */
  _setSeeking: (seeking: boolean) => void;
  /** Update current chapter based on position */
  _updateCurrentChapter: (position: number) => void;
}

/**
 * Combined player slice interface
 */
export interface PlayerSlice extends PlayerSliceState, PlayerSliceActions {}

/**
 * Create player slice
 */
export const createPlayerSlice: SliceCreator<PlayerSlice> = (set, get) => ({
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
    console.log('[PlayerSlice] Initializing player slice');
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        initialized: true,
      },
    }));
  },

  playTrack: async (track: PlayerTrack) => {
    console.log('[PlayerSlice] Loading track:', track.title);

    const state = get() as PlayerSlice;
    state._setTrackLoading(true);

    try {
      // Set the current track
      set((state: PlayerSlice) => ({
        ...state,
        player: {
          ...state.player,
          currentTrack: track,
          position: 0,
          currentChapter: null,
        },
      }));

      // Update current chapter for position 0
      state._updateCurrentChapter(0);

      // The actual track player setup will be handled by the PlayerService
      console.log('[PlayerSlice] Track loaded successfully');
    } catch (error) {
      console.error('[PlayerSlice] Failed to load track:', error);
    } finally {
      state._setTrackLoading(false);
    }
  },

  togglePlayPause: async () => {
    const state = get() as PlayerSlice;
    if (state.player.isPlaying) {
      await state.pause();
    } else {
      await state.play();
    }
  },

  pause: async () => {
    console.log('[PlayerSlice] Pausing playback');
    // The actual pause will be handled by PlayerService
    // This just updates the state
  },

  play: async () => {
    console.log('[PlayerSlice] Starting playback');
    // The actual play will be handled by PlayerService
    // This just updates the state
  },

  seekTo: async (position: number) => {
    console.log('[PlayerSlice] Seeking to position:', position);

    const state = get() as PlayerSlice;
    state._setSeeking(true);

    try {
      // Update position immediately for UI responsiveness
      set((state: PlayerSlice) => ({
        ...state,
        player: {
          ...state.player,
          position,
        },
      }));

      // Update current chapter
      state._updateCurrentChapter(position);

      // The actual seek will be handled by PlayerService
    } catch (error) {
      console.error('[PlayerSlice] Failed to seek:', error);
    } finally {
      state._setSeeking(false);
    }
  },

  skipForward: async (seconds = 30) => {
    const state = get() as PlayerSlice;
    const newPosition = Math.min(
      state.player.position + seconds,
      state.player.currentTrack?.duration || 0
    );
    await state.seekTo(newPosition);
  },

  skipBackward: async (seconds = 15) => {
    const state = get() as PlayerSlice;
    const newPosition = Math.max(state.player.position - seconds, 0);
    await state.seekTo(newPosition);
  },

  setPlaybackRate: async (rate: number) => {
    console.log('[PlayerSlice] Setting playback rate:', rate);
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        playbackRate: rate,
      },
    }));
    // The actual rate change will be handled by PlayerService
  },

  setVolume: async (volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    console.log('[PlayerSlice] Setting volume:', clampedVolume);
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        volume: clampedVolume,
      },
    }));
    // The actual volume change will be handled by PlayerService
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
  },

  clearTrack: () => {
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        currentTrack: null,
        isPlaying: false,
        position: 0,
        currentChapter: null,
        isModalVisible: false,
      },
    }));
  },

  // Private methods
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
});
