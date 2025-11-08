/**
 * Mock factory for react-native-track-player
 *
 * This factory provides reusable mock implementations to eliminate
 * duplication across test files.
 */

export enum State {
  None = 0,
  Ready = 1,
  Playing = 2,
  Paused = 3,
  Stopped = 4,
  Buffering = 6,
  Connecting = 8,
}

export interface MockTrackPlayerOptions {
  /** Initial playback state (default: State.None) */
  initialState?: State;
  /** Initial queue of tracks (default: []) */
  initialQueue?: any[];
  /** Initial playback position in seconds (default: 0) */
  initialPosition?: number;
  /** Initial track duration in seconds (default: 0) */
  initialDuration?: number;
  /** Initial playback rate (default: 1.0) */
  initialRate?: number;
  /** Initial volume (default: 1.0) */
  initialVolume?: number;
  /** Override any specific mock functions */
  overrides?: Partial<MockTrackPlayer>;
}

export interface MockTrackPlayer {
  setupPlayer: jest.Mock;
  reset: jest.Mock;
  add: jest.Mock;
  play: jest.Mock;
  pause: jest.Mock;
  stop: jest.Mock;
  seekTo: jest.Mock;
  setRate: jest.Mock;
  setVolume: jest.Mock;
  getPlaybackState: jest.Mock;
  getQueue: jest.Mock;
  getProgress: jest.Mock;
  getActiveTrackIndex: jest.Mock;
  getActiveTrack: jest.Mock;
  getRate: jest.Mock;
  getVolume: jest.Mock;
  updateMetadataForTrack: jest.Mock;
  addEventListener: jest.Mock;
  registerPlaybackService: jest.Mock;
  State: typeof State;
  Event: Record<string, string>;
  IOSCategory: { Playback: string };
  IOSCategoryMode: { SpokenAudio: string };
  AndroidAudioContentType: { Speech: number };
}

/**
 * Create a comprehensive mock TrackPlayer with configurable defaults
 *
 * @example
 * // Basic usage with defaults
 * const mockTrackPlayer = createMockTrackPlayer();
 * jest.mock('react-native-track-player', () => mockTrackPlayer);
 *
 * @example
 * // With custom initial state
 * const mockTrackPlayer = createMockTrackPlayer({
 *   initialState: State.Playing,
 *   initialQueue: [mockTrack],
 *   initialPosition: 300
 * });
 *
 * @example
 * // With method overrides
 * const mockTrackPlayer = createMockTrackPlayer({
 *   overrides: {
 *     play: jest.fn().mockRejectedValue(new Error('Playback failed'))
 *   }
 * });
 */
export function createMockTrackPlayer(options: MockTrackPlayerOptions = {}): MockTrackPlayer {
  const {
    initialState = State.None,
    initialQueue = [],
    initialPosition = 0,
    initialDuration = 0,
    initialRate = 1.0,
    initialVolume = 1.0,
    overrides = {},
  } = options;

  return {
    // Playback control methods
    setupPlayer: jest.fn().mockResolvedValue(undefined),
    reset: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(0),
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    seekTo: jest.fn().mockResolvedValue(undefined),
    setRate: jest.fn().mockResolvedValue(undefined),
    setVolume: jest.fn().mockResolvedValue(undefined),

    // State query methods
    getPlaybackState: jest.fn().mockResolvedValue({ state: initialState }),
    getQueue: jest.fn().mockResolvedValue(initialQueue),
    getProgress: jest.fn().mockResolvedValue({
      position: initialPosition,
      duration: initialDuration,
      buffered: 0,
    }),
    getActiveTrackIndex: jest.fn().mockResolvedValue(initialQueue.length > 0 ? 0 : null),
    getActiveTrack: jest.fn().mockResolvedValue(initialQueue[0] ?? null),
    getRate: jest.fn().mockResolvedValue(initialRate),
    getVolume: jest.fn().mockResolvedValue(initialVolume),

    // Metadata and events
    updateMetadataForTrack: jest.fn().mockResolvedValue(undefined),
    addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    registerPlaybackService: jest.fn(),

    // Enums and constants
    State: {
      None: 0,
      Ready: 1,
      Playing: 2,
      Paused: 3,
      Stopped: 4,
      Buffering: 6,
      Connecting: 8,
    },
    Event: {
      RemotePlay: "remote-play",
      RemotePause: "remote-pause",
      RemoteStop: "remote-stop",
      RemoteNext: "remote-next",
      RemotePrevious: "remote-previous",
      RemoteSeek: "remote-seek",
      RemoteDuck: "remote-duck",
      RemoteJumpForward: "remote-jump-forward",
      RemoteJumpBackward: "remote-jump-backward",
      PlaybackState: "playback-state",
      PlaybackProgressUpdated: "playback-progress-updated",
      PlaybackActiveTrackChanged: "playback-active-track-changed",
      PlaybackError: "playback-error",
    },
    IOSCategory: { Playback: "playback" },
    IOSCategoryMode: { SpokenAudio: "spokenAudio" },
    AndroidAudioContentType: { Speech: 1 },

    // Apply any custom overrides
    ...overrides,
  };
}

/**
 * Create a minimal mock with only essential methods
 *
 * Useful for tests that don't need full TrackPlayer functionality,
 * such as slice tests that only interact with a few methods.
 *
 * @example
 * const mockTrackPlayer = createMinimalMockTrackPlayer();
 * jest.mock('react-native-track-player', () => mockTrackPlayer);
 */
export function createMinimalMockTrackPlayer(): Partial<MockTrackPlayer> {
  return {
    getQueue: jest.fn().mockResolvedValue([]),
    seekTo: jest.fn().mockResolvedValue(undefined),
    getActiveTrackIndex: jest.fn().mockResolvedValue(null),
    getActiveTrack: jest.fn().mockResolvedValue(null),
    updateMetadataForTrack: jest.fn().mockResolvedValue(undefined),
  };
}
