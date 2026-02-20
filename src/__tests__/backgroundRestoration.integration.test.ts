/**
 * Integration test for background state restoration
 *
 * This test simulates the full flow of background playback and state restoration
 * when the app returns to the foreground after the JS context is recreated.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TrackPlayer, { State } from "react-native-track-player";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { ASYNC_KEYS } from "../lib/asyncStore";
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
}));

jest.mock("../db/helpers/mediaProgress", () => ({
  getMediaProgressForLibraryItem: jest.fn(),
}));

// Mock secure store
jest.mock("../lib/secureStore", () => ({
  getStoredUsername: jest.fn(),
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

describe("Background Restoration Integration", () => {
  let store: UseBoundStore<StoreApi<PlayerSlice>>;
  let playerService: PlayerService;

  const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
  const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer>;
  const mockedProgressService = progressService as jest.Mocked<typeof progressService>;
  const { getUserByUsername } = require("../db/helpers/users");
  const { getStoredUsername } = require("../lib/secureStore");
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
          downloadedAt: new Date(),
          updatedAt: new Date(),
        },
      } as any,
    ],
    chapters: [
      { id: "ch-1", start: 0, end: 1800, title: "Chapter 1", mediaId: "media-1", chapterId: 0 },
      { id: "ch-2", start: 1800, end: 3600, title: "Chapter 2", mediaId: "media-1", chapterId: 1 },
      { id: "ch-3", start: 3600, end: 5400, title: "Chapter 3", mediaId: "media-1", chapterId: 2 },
      { id: "ch-4", start: 5400, end: 7200, title: "Chapter 4", mediaId: "media-1", chapterId: 3 },
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

    getUserByUsername.mockResolvedValue({ id: "user-1" });
    getStoredUsername.mockResolvedValue("testuser");
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

  it("should not display stale chapter after foreground restoration with JS context recreation", async () => {
    // Scenario: User was listening to Chapter 3 (position 4000s) in background,
    // then app was backgrounded for a long time, JS context was recreated,
    // and now app is foregrounded again.
    //
    // This is a simplified integration test that verifies the key behavior:
    // When restorePersistedState() is called with an empty TrackPlayer queue,
    // the chapter should NOT be calculated.

    const restoredPosition = 4000; // In Chapter 3 (3600-5400)

    // Simulate AsyncStorage having correct position and track
    mockedAsyncStorage.getItem.mockImplementation((key: string) => {
      switch (key) {
        case ASYNC_KEYS.currentTrack:
          return Promise.resolve(JSON.stringify(mockPlayerTrack));
        case ASYNC_KEYS.position:
          return Promise.resolve(JSON.stringify(restoredPosition));
        default:
          return Promise.resolve(null);
      }
    });

    // Simulate empty TrackPlayer queue (JS context was recreated)
    mockedTrackPlayer.getQueue.mockResolvedValue([]);

    // Restore state (simulates what _layout.tsx does on foreground)
    await store.getState().restorePersistedState();

    // Verify the fix: Chapter should be null because queue is empty
    const stateAfterRestoration = store.getState();
    expect(stateAfterRestoration.player.currentChapter).toBeNull();

    // Note: Position and track restoration is verified in playerSlice unit tests.
    // This integration test focuses on the chapter not being prematurely calculated.
  });

  it("should correctly update chapter when queue is rebuilt after restoration", async () => {
    // This test verifies that even though chapter isn't updated while track is loading,
    // it will be correctly updated when the TrackPlayer queue is rebuilt.
    //
    // This simulates the scenario where after restoration (with null chapter),
    // the queue gets rebuilt and chapter is correctly calculated.

    const restoredPosition = 4000; // In Chapter 3 (3600-5400)

    // Setup: Set isLoadingTrack first, then load track and position
    // This simulates the coordinator setting isLoadingTrack=true via RELOAD_QUEUE event
    store.getState()._setTrackLoading(true);
    store.getState()._setCurrentTrack(mockPlayerTrack);
    store.getState().updatePosition(restoredPosition);

    // Chapter should be null during loading
    expect(store.getState().player.currentChapter).toBeNull();

    // Now simulate queue being rebuilt (isLoadingTrack cleared by coordinator)
    store.getState()._setTrackLoading(false);

    // Manually trigger chapter update (simulates what reloadTrackPlayerQueue does)
    store.getState()._updateCurrentChapter(restoredPosition);

    // Now chapter should be correct
    const finalState = store.getState();
    expect(finalState.player.currentChapter).not.toBeNull();
    expect(finalState.player.currentChapter?.chapter).toEqual({
      id: "ch-3",
      start: 3600,
      end: 5400,
      title: "Chapter 3",
      mediaId: "media-1",
      chapterId: 2,
    });
    expect(finalState.player.currentChapter?.positionInChapter).toBe(400); // 4000 - 3600
    expect(finalState.player.currentChapter?.chapterDuration).toBe(1800); // 5400 - 3600
  });
});
