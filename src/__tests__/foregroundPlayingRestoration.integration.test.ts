/**
 * Integration test for foreground restoration while actively playing
 *
 * This test verifies that when the app returns to the foreground while
 * TrackPlayer is actively playing, we don't update the TrackPlayer position
 * with potentially stale data from the database. This prevents playback
 * stutters caused by seeking backwards.
 *
 * Background: The DB position updates once per second, so when the app comes
 * to the foreground, the DB position may be 1-2 seconds behind the actual
 * TrackPlayer position. Seeking backwards causes a noticeable stutter.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TrackPlayer, { State } from "react-native-track-player";
import { create } from "zustand";
import { PlayerService } from "../services/PlayerService";
import { progressService } from "../services/ProgressService";
import { createPlayerSlice, PlayerSlice } from "../stores/slices/playerSlice";
import type { PlayerTrack } from "../types/player";

// Note: While setup.ts provides global mocks, we override them here for test-specific control
// This pattern matches other test files in the codebase (e.g., playerSlice.test.ts)

// Mock AsyncStorage
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock TrackPlayer
jest.mock("react-native-track-player", () => ({
  setupPlayer: jest.fn(),
  reset: jest.fn(),
  add: jest.fn(),
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn(),
  getQueue: jest.fn(),
  getProgress: jest.fn(),
  getPlaybackState: jest.fn(),
  getActiveTrackIndex: jest.fn(),
  getActiveTrack: jest.fn(),
  getRate: jest.fn(),
  getVolume: jest.fn(),
  setRate: jest.fn(),
  setVolume: jest.fn(),
  State: {
    None: 0,
    Ready: 1,
    Playing: 2,
    Paused: 3,
    Stopped: 4,
  },
}));

// Mock ProgressService
jest.mock("../services/ProgressService", () => ({
  progressService: {
    getCurrentSession: jest.fn(),
    startSession: jest.fn(),
    updateProgress: jest.fn(),
  },
}));

// Mock database helpers
jest.mock("../db/helpers/users", () => ({
  getUserByUsername: jest.fn(),
}));

jest.mock("../db/helpers/libraryItems", () => ({
  getLibraryItemById: jest.fn(),
}));

jest.mock("../db/helpers/mediaMetadata", () => ({
  getMediaMetadataByLibraryItemId: jest.fn(),
}));

jest.mock("../db/helpers/combinedQueries", () => ({
  getAudioFilesWithDownloadInfo: jest.fn(),
}));

jest.mock("../db/helpers/chapters", () => ({
  getChaptersForMedia: jest.fn(),
}));

jest.mock("../db/helpers/localListeningSessions", () => ({
  getActiveSession: jest.fn(),
  getAllActiveSessionsForUser: jest.fn(),
}));

jest.mock("../db/helpers/mediaProgress", () => ({
  getMediaProgressForLibraryItem: jest.fn(),
}));

// Mock secure store
jest.mock("../lib/secureStore", () => ({
  getStoredUsername: jest.fn(),
}));

// Mock user helpers
jest.mock("../utils/userHelpers", () => ({
  getCurrentUser: jest.fn(),
  requireCurrentUser: jest.fn(),
}));

// Mock file system
jest.mock("../lib/fileSystem", () => ({
  verifyFileExists: jest.fn(),
  resolveAppPath: jest.fn(),
}));

// Mock track player config
jest.mock("../lib/trackPlayerConfig", () => ({
  configureTrackPlayer: jest.fn(),
}));

// Mock covers
jest.mock("../lib/covers", () => ({
  getCoverUri: jest.fn(),
  getCoversDirectory: jest.fn(),
}));

// Mock asyncStore
jest.mock("../lib/asyncStore", () => ({
  ASYNC_KEYS: {
    position: "position",
    currentTrack: "currentTrack",
    playbackRate: "playbackRate",
    volume: "volume",
    isPlaying: "isPlaying",
    currentPlaySessionId: "currentPlaySessionId",
    sleepTimer: "sleepTimer",
  },
  getItem: jest.fn(),
  saveItem: jest.fn(),
}));

// Mock API endpoints
jest.mock("../lib/api/endpoints", () => ({
  startPlaySession: jest.fn(),
}));

// Mock appStore
jest.mock("../stores/appStore", () => ({
  useAppStore: {
    getState: jest.fn(),
  },
}));

describe("Foreground Playing Restoration Integration", () => {
  let store: ReturnType<typeof create<PlayerSlice>>;
  let playerService: PlayerService;

  const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
  const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer>;
  const mockedProgressService = progressService as jest.Mocked<typeof progressService>;
  const { getUserByUsername } = require("../db/helpers/users");
  const { getStoredUsername } = require("../lib/secureStore");
  const { getCurrentUser, requireCurrentUser } = require("../utils/userHelpers");
  const { getLibraryItemById } = require("../db/helpers/libraryItems");
  const { getMediaMetadataByLibraryItemId } = require("../db/helpers/mediaMetadata");
  const { getAudioFilesWithDownloadInfo } = require("../db/helpers/combinedQueries");
  const { getChaptersForMedia } = require("../db/helpers/chapters");
  const { verifyFileExists, resolveAppPath } = require("../lib/fileSystem");
  const { useAppStore } = require("../stores/appStore");

  const mockPlayerTrack: PlayerTrack = {
    libraryItemId: "item-1",
    mediaId: "media-1",
    title: "Test Book",
    author: "Test Author",
    coverUri: "file:///test-cover.jpg",
    audioFiles: [
      {
        id: "file-1",
        index: 0,
        ino: "1",
        filename: "test.m4b",
        tagTitle: "Test Book",
        duration: 7200,
        downloadInfo: {
          isDownloaded: true,
          downloadPath: "/downloads/test.m4b",
        },
      },
    ],
    chapters: [
      { id: "ch-1", start: 0, end: 1800, title: "Chapter 1" },
      { id: "ch-2", start: 1800, end: 3600, title: "Chapter 2" },
      { id: "ch-3", start: 3600, end: 5400, title: "Chapter 3" },
      { id: "ch-4", start: 5400, end: 7200, title: "Chapter 4" },
    ],
    duration: 7200,
    isDownloaded: true,
  };

  beforeEach(() => {
    // Create test store
    store = create<PlayerSlice>()((set, get) => ({
      ...createPlayerSlice(set, get),
    }));

    // Reset PlayerService
    PlayerService.resetInstance();
    playerService = PlayerService.getInstance();

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock implementations
    mockedTrackPlayer.getQueue.mockResolvedValue([]);
    mockedTrackPlayer.getProgress.mockResolvedValue({ position: 0, duration: 0, buffered: 0 });
    mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.None });
    mockedTrackPlayer.setupPlayer.mockResolvedValue();
    mockedTrackPlayer.reset.mockResolvedValue();
    mockedTrackPlayer.add.mockResolvedValue(0);
    mockedTrackPlayer.seekTo.mockResolvedValue();
    mockedTrackPlayer.getRate.mockResolvedValue(1.0);
    mockedTrackPlayer.getVolume.mockResolvedValue(1.0);
    mockedTrackPlayer.setRate.mockResolvedValue();
    mockedTrackPlayer.setVolume.mockResolvedValue();

    getUserByUsername.mockResolvedValue({ id: "user-1", username: "testuser" });
    getStoredUsername.mockResolvedValue("testuser");
    getCurrentUser.mockResolvedValue({ id: "user-1", username: "testuser" });
    requireCurrentUser.mockResolvedValue({ id: "user-1", username: "testuser" });
    getLibraryItemById.mockResolvedValue({ id: "item-1", mediaType: "book" });
    getMediaMetadataByLibraryItemId.mockResolvedValue({
      id: "media-1",
      title: "Test Book",
      authorName: "Test Author",
      duration: 7200,
    });
    getAudioFilesWithDownloadInfo.mockResolvedValue(mockPlayerTrack.audioFiles);
    getChaptersForMedia.mockResolvedValue(mockPlayerTrack.chapters);
    verifyFileExists.mockResolvedValue(true);
    resolveAppPath.mockReturnValue("/full/path/to/downloads/test.m4b");

    // Configure useAppStore mock to return our test store's state
    useAppStore.getState.mockImplementation(() => store.getState());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should not seek TrackPlayer when syncing position from database while actively playing", async () => {
    // Scenario: User is listening in background, app comes to foreground while still playing.
    // TrackPlayer position is at 100s, but DB position is at 98s (due to 1-2s sync lag).
    // We should NOT seek TrackPlayer backwards, as this causes playback stutters.

    const currentTrackPlayerPosition = 100; // Where TrackPlayer actually is
    const staleDbPosition = 98; // Where DB thinks we are (1-2s behind)

    // Setup: TrackPlayer is actively playing
    mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.Playing });
    mockedTrackPlayer.getProgress.mockResolvedValue({
      position: currentTrackPlayerPosition,
      duration: 7200,
      buffered: 0,
    });
    mockedTrackPlayer.getQueue.mockResolvedValue([
      {
        url: "/full/path/to/downloads/test.m4b",
        title: "Test Book",
        artist: "Test Author",
        duration: 7200,
      },
    ]);

    // Setup: Store has current track
    store.getState()._setCurrentTrack(mockPlayerTrack);
    store.getState().updatePosition(currentTrackPlayerPosition);

    // Setup: DB has slightly stale position
    mockedProgressService.getCurrentSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      libraryItemId: "item-1",
      mediaId: "media-1",
      currentTime: staleDbPosition,
      timeListening: 100,
      startedAt: new Date(Date.now() - 100000),
      updatedAt: new Date(Date.now() - 2000), // Updated 2 seconds ago
      displayTitle: "Test Book",
      displayAuthor: "Test Author",
    });

    // Act: Simulate foreground restoration calling syncPositionFromDatabase()
    await playerService.syncPositionFromDatabase();

    // Assert: TrackPlayer.seekTo() should NOT have been called
    expect(mockedTrackPlayer.seekTo).not.toHaveBeenCalled();

    // Assert: Store position SHOULD be updated from DB (for consistency)
    const finalState = store.getState();
    expect(finalState.player.position).toBe(staleDbPosition);

    // Assert: Chapter information should still be updated
    expect(finalState.player.currentChapter).not.toBeNull();
    expect(finalState.player.currentChapter?.chapter.id).toBe("ch-1"); // Position 98s is in Chapter 1 (0-1800s)
  });

  it("should not seek TrackPlayer during reconciliation when actively playing (small difference)", async () => {
    // Scenario: reconcileTrackPlayerState() is called during foreground restoration
    // while TrackPlayer is actively playing with a small position difference (<5s).
    // The reconciliation should not even detect a mismatch.

    const currentTrackPlayerPosition = 100;
    const staleDbPosition = 98;

    // Setup: TrackPlayer is actively playing with a position ahead of DB
    mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.Playing });
    mockedTrackPlayer.getProgress.mockResolvedValue({
      position: currentTrackPlayerPosition,
      duration: 7200,
      buffered: 0,
    });
    mockedTrackPlayer.getQueue.mockResolvedValue([
      {
        url: "/full/path/to/downloads/test.m4b",
        title: "Test Book",
        artist: "Test Author",
        duration: 7200,
      },
    ]);
    mockedTrackPlayer.getActiveTrack.mockResolvedValue({
      url: "/full/path/to/downloads/test.m4b",
      title: "Test Book",
      artist: "Test Author",
    });
    mockedTrackPlayer.getRate.mockResolvedValue(1.0);
    mockedTrackPlayer.getVolume.mockResolvedValue(1.0);

    // Setup: Store has current track and position
    store.getState()._setCurrentTrack(mockPlayerTrack);
    store.getState().updatePosition(staleDbPosition);
    store.getState().updatePlayingState(true);

    // Setup: DB has slightly stale position
    mockedProgressService.getCurrentSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      libraryItemId: "item-1",
      mediaId: "media-1",
      currentTime: staleDbPosition,
      timeListening: 100,
      startedAt: new Date(Date.now() - 100000),
      updatedAt: new Date(Date.now() - 2000), // Updated 2 seconds ago
      displayTitle: "Test Book",
      displayAuthor: "Test Author",
    });

    // Act: Call reconcileTrackPlayerState()
    const report = await playerService.reconcileTrackPlayerState();

    // Assert: TrackPlayer.seekTo() should NOT have been called
    expect(mockedTrackPlayer.seekTo).not.toHaveBeenCalled();

    // Assert: No position adjustment action should be taken
    const positionActions = report.actionsTaken.filter((action) =>
      action.toLowerCase().includes("position")
    );
    expect(positionActions.length).toBe(0);
  });

  it("should not seek TrackPlayer during reconciliation when actively playing (large difference)", async () => {
    // Scenario: reconcileTrackPlayerState() is called with a large position mismatch (>5s)
    // while TrackPlayer is actively playing. Even with a large difference, we should
    // not seek TrackPlayer to avoid stutters.

    const currentTrackPlayerPosition = 100;
    const staleDbPosition = 90; // 10 second difference (>5s threshold)

    // Setup: TrackPlayer is actively playing with a position ahead of DB
    mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.Playing });
    mockedTrackPlayer.getProgress.mockResolvedValue({
      position: currentTrackPlayerPosition,
      duration: 7200,
      buffered: 0,
    });
    mockedTrackPlayer.getQueue.mockResolvedValue([
      {
        url: "/full/path/to/downloads/test.m4b",
        title: "Test Book",
        artist: "Test Author",
        duration: 7200,
      },
    ]);
    mockedTrackPlayer.getActiveTrack.mockResolvedValue({
      url: "/full/path/to/downloads/test.m4b",
      title: "Test Book",
      artist: "Test Author",
    });
    mockedTrackPlayer.getRate.mockResolvedValue(1.0);
    mockedTrackPlayer.getVolume.mockResolvedValue(1.0);

    // Setup: Store has current track and position
    store.getState()._setCurrentTrack(mockPlayerTrack);
    store.getState().updatePosition(staleDbPosition);
    store.getState().updatePlayingState(true);

    // Setup: DB has stale position (10s behind)
    mockedProgressService.getCurrentSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      libraryItemId: "item-1",
      mediaId: "media-1",
      currentTime: staleDbPosition,
      timeListening: 100,
      startedAt: new Date(Date.now() - 100000),
      updatedAt: new Date(Date.now() - 10000), // Updated 10 seconds ago
      displayTitle: "Test Book",
      displayAuthor: "Test Author",
    });

    // Act: Call reconcileTrackPlayerState()
    const report = await playerService.reconcileTrackPlayerState();

    // Assert: TrackPlayer.seekTo() should NOT have been called
    expect(mockedTrackPlayer.seekTo).not.toHaveBeenCalled();

    // Assert: Position mismatch should be detected
    expect(report.positionMismatch).toBe(true);

    // Assert: An action should be taken (store updated) but TrackPlayer not seeked
    const positionActions = report.actionsTaken.filter((action) =>
      action.toLowerCase().includes("seek")
    );
    expect(positionActions.length).toBeGreaterThan(0);
    expect(positionActions[0]).toContain("Did not seek TrackPlayer because it's actively playing");
  });

  it("should still seek TrackPlayer when NOT actively playing", async () => {
    // Scenario: App returns to foreground while paused. In this case,
    // it's safe to sync position from DB without causing stutters.

    const trackPlayerPosition = 95;
    const dbPosition = 100; // DB is ahead (user may have synced from another device)

    // Setup: TrackPlayer is paused
    mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.Paused });
    mockedTrackPlayer.getProgress.mockResolvedValue({
      position: trackPlayerPosition,
      duration: 7200,
      buffered: 0,
    });
    mockedTrackPlayer.getQueue.mockResolvedValue([
      {
        url: "/full/path/to/downloads/test.m4b",
        title: "Test Book",
        artist: "Test Author",
        duration: 7200,
      },
    ]);

    // Setup: Store has current track
    store.getState()._setCurrentTrack(mockPlayerTrack);
    store.getState().updatePosition(trackPlayerPosition);
    store.getState().updatePlayingState(false);

    // Setup: DB has newer position
    mockedProgressService.getCurrentSession.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      libraryItemId: "item-1",
      mediaId: "media-1",
      currentTime: dbPosition,
      timeListening: 100,
      startedAt: new Date(Date.now() - 100000),
      updatedAt: new Date(Date.now() - 1000),
      displayTitle: "Test Book",
      displayAuthor: "Test Author",
    });

    // Act: Simulate foreground restoration calling syncPositionFromDatabase()
    await playerService.syncPositionFromDatabase();

    // Assert: TrackPlayer.seekTo() SHOULD have been called (safe when paused)
    expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(dbPosition);

    // Assert: Store position should be updated
    const finalState = store.getState();
    expect(finalState.player.position).toBe(dbPosition);
  });
});
