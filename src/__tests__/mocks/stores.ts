/**
 * Mock factories for Zustand store slices
 *
 * These factories provide reusable mock implementations for store slices,
 * making it easy to create test doubles with sensible defaults.
 */

export interface MockPlayerSliceOptions {
  /** Override player state properties */
  state?: Partial<MockPlayerSlice["player"]>;
  /** Override action methods */
  methods?: Partial<Omit<MockPlayerSlice, "player">>;
}

export interface MockPlayerSlice {
  player: {
    currentTrack: any | null;
    position: number;
    isPlaying: boolean;
    playbackRate: number;
    volume: number;
    currentPlaySessionId: string | null;
    currentChapter: any | null;
    lastPauseTime: number | null;
    isModalVisible: boolean;
    loading: {
      isLoadingTrack: boolean;
      isSeeking: boolean;
    };
    initialized: boolean;
    sleepTimer: {
      endTime: number | null;
      type: string | null;
      chapterTarget: string | null;
    };
  };
  _setCurrentTrack: jest.Mock;
  _setTrackLoading: jest.Mock;
  updatePosition: jest.Mock;
  updatePlayingState: jest.Mock;
  _setPlaySessionId: jest.Mock;
  _setLastPauseTime: jest.Mock;
  setModalVisible: jest.Mock;
  _setSeeking: jest.Mock;
  _setPlaybackRate: jest.Mock;
  _setVolume: jest.Mock;
  _updateCurrentChapter: jest.Mock;
  setSleepTimer: jest.Mock;
  setSleepTimerChapter: jest.Mock;
  cancelSleepTimer: jest.Mock;
  getSleepTimerRemaining: jest.Mock;
  updateNowPlayingMetadata: jest.Mock;
  restorePersistedState: jest.Mock;
  initializePlayerSlice: jest.Mock;
}

/**
 * Create a mock player slice with sensible defaults
 *
 * @example
 * const mockStore = createMockPlayerSlice();
 * useAppStore.getState.mockReturnValue(mockStore);
 *
 * @example
 * // With custom state
 * const mockStore = createMockPlayerSlice({
 *   state: {
 *     position: 300,
 *     isPlaying: true
 *   }
 * });
 */
export function createMockPlayerSlice(options: MockPlayerSliceOptions = {}): MockPlayerSlice {
  const { state = {}, methods = {} } = options;

  return {
    player: {
      currentTrack: null,
      position: 0,
      isPlaying: false,
      playbackRate: 1.0,
      volume: 1.0,
      currentPlaySessionId: null,
      currentChapter: null,
      lastPauseTime: null,
      isModalVisible: false,
      loading: {
        isLoadingTrack: false,
        isSeeking: false,
      },
      initialized: false,
      sleepTimer: {
        endTime: null,
        type: null,
        chapterTarget: null,
      },
      ...state,
    },
    _setCurrentTrack: jest.fn(),
    _setTrackLoading: jest.fn(),
    updatePosition: jest.fn(),
    updatePlayingState: jest.fn(),
    _setPlaySessionId: jest.fn(),
    _setLastPauseTime: jest.fn(),
    setModalVisible: jest.fn(),
    _setSeeking: jest.fn(),
    _setPlaybackRate: jest.fn(),
    _setVolume: jest.fn(),
    _updateCurrentChapter: jest.fn(),
    setSleepTimer: jest.fn(),
    setSleepTimerChapter: jest.fn(),
    cancelSleepTimer: jest.fn(),
    getSleepTimerRemaining: jest.fn(),
    updateNowPlayingMetadata: jest.fn(),
    restorePersistedState: jest.fn(),
    initializePlayerSlice: jest.fn(),
    ...methods,
  };
}

export interface MockLibrarySliceOptions {
  state?: Partial<MockLibrarySlice["library"]>;
  methods?: Partial<Omit<MockLibrarySlice, "library">>;
}

export interface MockLibrarySlice {
  library: {
    libraries: any[];
    libraryItems: any[];
    selectedLibraryId: string | null;
    sortConfig: { field: string; direction: string };
    loading: {
      isLoadingLibraries: boolean;
      isLoadingItems: boolean;
      isSelectingLibrary: boolean;
    };
    initialized: boolean;
    ready: boolean;
  };
  initializeLibrarySlice: jest.Mock;
  selectLibrary: jest.Mock;
  refresh: jest.Mock;
  updateSortConfig: jest.Mock;
  fetchLibraries: jest.Mock;
  fetchLibraryItems: jest.Mock;
}

/**
 * Create a mock library slice with sensible defaults
 *
 * @example
 * const mockStore = createMockLibrarySlice();
 */
export function createMockLibrarySlice(options: MockLibrarySliceOptions = {}): MockLibrarySlice {
  const { state = {}, methods = {} } = options;

  return {
    library: {
      libraries: [],
      libraryItems: [],
      selectedLibraryId: null,
      sortConfig: { field: "title", direction: "asc" },
      loading: {
        isLoadingLibraries: false,
        isLoadingItems: false,
        isSelectingLibrary: false,
      },
      initialized: false,
      ready: false,
      ...state,
    },
    initializeLibrarySlice: jest.fn(),
    selectLibrary: jest.fn(),
    refresh: jest.fn(),
    updateSortConfig: jest.fn(),
    fetchLibraries: jest.fn(),
    fetchLibraryItems: jest.fn(),
    ...methods,
  };
}

export interface MockSettingsSliceOptions {
  state?: Partial<MockSettingsSlice["settings"]>;
  methods?: Partial<Omit<MockSettingsSlice, "settings">>;
}

export interface MockSettingsSlice {
  settings: {
    jumpForwardInterval: number;
    jumpBackwardInterval: number;
    smartRewindEnabled: boolean;
    homeLayout: "list" | "cover";
    initialized: boolean;
    isLoading: boolean;
  };
  initializeSettings: jest.Mock;
  updateJumpForwardInterval: jest.Mock;
  updateJumpBackwardInterval: jest.Mock;
  updateSmartRewindEnabled: jest.Mock;
  updateHomeLayout: jest.Mock;
  resetSettings: jest.Mock;
}

/**
 * Create a mock settings slice with sensible defaults
 *
 * @example
 * const mockStore = createMockSettingsSlice();
 */
export function createMockSettingsSlice(options: MockSettingsSliceOptions = {}): MockSettingsSlice {
  const { state = {}, methods = {} } = options;

  return {
    settings: {
      jumpForwardInterval: 30,
      jumpBackwardInterval: 15,
      smartRewindEnabled: true,
      homeLayout: "list",
      initialized: false,
      isLoading: false,
      ...state,
    },
    initializeSettings: jest.fn(),
    updateJumpForwardInterval: jest.fn(),
    updateJumpBackwardInterval: jest.fn(),
    updateSmartRewindEnabled: jest.fn(),
    updateHomeLayout: jest.fn(),
    resetSettings: jest.fn(),
    ...methods,
  };
}
