/**
 * Test setup file for Jest
 * This file is run before all tests
 */

import "@testing-library/jest-native/extend-expect";

// expo-sqlite is now mocked by expo-sqlite-mock package

// Mock the database client to use test database instances
// This will be overridden in individual test files when they set up their test databases
let mockDb: any = null;
let mockSQLiteDb: any = null;

jest.mock("@/db/client", () => ({
  getSQLiteDb: jest.fn(() => mockSQLiteDb),
  get db() {
    return mockDb;
  },
  set db(value) {
    mockDb = value;
  },
}));

// Export functions to set the mock database instances
(global as any).setMockDb = (db: any) => {
  mockDb = db;
};

(global as any).setMockSQLiteDb = (sqliteDb: any) => {
  mockSQLiteDb = sqliteDb;
};

jest.mock("expo-file-system", () => ({
  documentDirectory: "file://test-documents/",
  cacheDirectory: "file://test-cache/",
  downloadAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
}));

jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    getAllKeys: jest.fn(),
    multiGet: jest.fn(),
    multiSet: jest.fn(),
    multiRemove: jest.fn(),
  },
}));

// Mock third-party native modules
jest.mock("@kesha-antonov/react-native-background-downloader", () => ({
  download: jest.fn(),
  checkForExistingDownloads: jest.fn(() => Promise.resolve([])),
}));

jest.mock("react-native-track-player", () => ({
  setupPlayer: jest.fn(),
  add: jest.fn(),
  play: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn(),
  reset: jest.fn(),
  seekTo: jest.fn(),
  setRate: jest.fn(),
  setVolume: jest.fn(),
  getPlaybackState: jest.fn(),
  getQueue: jest.fn(),
  getProgress: jest.fn(),
  getActiveTrackIndex: jest.fn(),
  getActiveTrack: jest.fn(),
  getRate: jest.fn(),
  getVolume: jest.fn(),
  updateMetadataForTrack: jest.fn(),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  registerPlaybackService: jest.fn(),
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
}));

// Mock uuid
jest.mock("uuid", () => ({
  v4: jest.fn(() => "mock-uuid-v4"),
}));

// Mock react-native-logs
jest.mock("react-native-logs", () => ({
  logger: {
    createLogger: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
  consoleTransport: jest.fn(),
}));

// Mock logger
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    forTag: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
    forDiagnostics: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

// Mock react-native-device-info
jest.mock("react-native-device-info", () => ({
  getUniqueId: jest.fn(() => "mock-device-id"),
  getVersion: jest.fn(() => "1.0.0"),
  getBuildNumber: jest.fn(() => "1"),
  getSystemName: jest.fn(() => "iOS"),
  getSystemVersion: jest.fn(() => "14.0"),
}));

// Setup test timeout
jest.setTimeout(10000);
