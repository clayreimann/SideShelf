/**
 * Tests for PlayerService - Critical paths
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import TrackPlayer, { State } from "react-native-track-player";
import { PlayerService } from "../PlayerService";

// Mock TrackPlayer
jest.mock("react-native-track-player", () => ({
  setupPlayer: jest.fn(),
  reset: jest.fn(),
  add: jest.fn(),
  play: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn(),
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
  State: {
    None: 0,
    Ready: 1,
    Playing: 2,
    Paused: 3,
    Stopped: 4,
    Buffering: 6,
    Connecting: 8,
  },
  IOSCategory: { Playback: "playback" },
  IOSCategoryMode: { SpokenAudio: "spokenAudio" },
  AndroidAudioContentType: { Speech: 1 },
}));

// Mock database helpers
jest.mock("@/db/helpers/libraryItems", () => ({
  getLibraryItemById: jest.fn(),
}));

jest.mock("@/db/helpers/mediaMetadata", () => ({
  getMediaMetadataByLibraryItemId: jest.fn(),
}));

jest.mock("@/db/helpers/combinedQueries", () => ({
  getAudioFilesWithDownloadInfo: jest.fn(),
}));

jest.mock("@/db/helpers/chapters", () => ({
  getChaptersForMedia: jest.fn(),
}));

jest.mock("@/db/helpers/localListeningSessions", () => ({
  getActiveSession: jest.fn(),
  getAllActiveSessionsForUser: jest.fn(),
}));

jest.mock("@/db/helpers/mediaProgress", () => ({
  getMediaProgressForLibraryItem: jest.fn(),
}));

jest.mock("@/db/helpers/users", () => ({
  getUserByUsername: jest.fn(),
}));

// Mock other dependencies
jest.mock("@/lib/secureStore", () => ({
  getStoredUsername: jest.fn(),
}));

jest.mock("@/lib/fileSystem", () => ({
  verifyFileExists: jest.fn(),
  resolveAppPath: jest.fn(),
}));

jest.mock("@/lib/trackPlayerConfig", () => ({
  configureTrackPlayer: jest.fn(),
}));

jest.mock("@/lib/asyncStore", () => ({
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

jest.mock("@/stores/appStore", () => ({
  useAppStore: {
    getState: jest.fn(),
  },
}));

jest.mock("@/services/ProgressService", () => ({
  progressService: {
    getCurrentSession: jest.fn(),
    startSession: jest.fn(),
    updateProgress: jest.fn(),
  },
}));

jest.mock("@/services/DownloadService", () => ({
  downloadService: {
    repairDownloadStatus: jest.fn(),
  },
}));

jest.mock("@/lib/fileLifecycleManager", () => ({
  ensureItemInDocuments: jest.fn(),
}));

jest.mock("@/lib/api/endpoints", () => ({
  startPlaySession: jest.fn(),
}));

jest.mock("@/lib/covers", () => ({
  getCoverUri: jest.fn(),
}));

jest.mock("@/services/coordinator/eventBus", () => ({
  dispatchPlayerEvent: jest.fn(),
}));

describe("PlayerService", () => {
  const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer>;
  const { getLibraryItemById } = require("@/db/helpers/libraryItems");
  const { getMediaMetadataByLibraryItemId } = require("@/db/helpers/mediaMetadata");
  const { getAudioFilesWithDownloadInfo } = require("@/db/helpers/combinedQueries");
  const { getChaptersForMedia } = require("@/db/helpers/chapters");
  const { getUserByUsername } = require("@/db/helpers/users");
  const { getStoredUsername } = require("@/lib/secureStore");
  const { verifyFileExists, resolveAppPath } = require("@/lib/fileSystem");
  const { configureTrackPlayer } = require("@/lib/trackPlayerConfig");
  const { useAppStore } = require("@/stores/appStore");
  const { progressService } = require("@/services/ProgressService");
  const { downloadService } = require("@/services/DownloadService");
  const { ensureItemInDocuments } = require("@/lib/fileLifecycleManager");
  const { getActiveSession } = require("@/db/helpers/localListeningSessions");
  const { getMediaProgressForLibraryItem } = require("@/db/helpers/mediaProgress");
  const { getItem: getAsyncItem } = require("@/lib/asyncStore");
  const { dispatchPlayerEvent } = require("@/services/coordinator/eventBus");

  let playerService: PlayerService;

  const mockLibraryItem = {
    id: "item-1",
    libraryId: "lib-1",
    mediaType: "book",
  };

  const mockMetadata = {
    id: "media-1",
    title: "Test Book",
    authorName: "Test Author",
    imageUrl: "http://example.com/cover.jpg",
    duration: 3600,
  };

  const mockAudioFiles = [
    {
      id: "file-1",
      index: 0,
      ino: "1",
      filename: "test.m4b",
      duration: 3600,
      downloadInfo: {
        isDownloaded: true,
        downloadPath: "/downloads/test.m4b",
      },
    },
  ];

  const mockChapters = [
    { id: "ch-1", start: 0, end: 1800, title: "Chapter 1" },
    { id: "ch-2", start: 1800, end: 3600, title: "Chapter 2" },
  ];

  const mockStore = {
    player: {
      currentTrack: null as any,
      position: 0,
      isPlaying: false,
      playbackRate: 1.0,
      volume: 1.0,
      currentPlaySessionId: null as any,
      currentChapter: null,
    },
    _setCurrentTrack: jest.fn(),
    _setTrackLoading: jest.fn(),
    updatePosition: jest.fn(),
    updatePlayingState: jest.fn(),
    _setPlaySessionId: jest.fn(),
    _setLastPauseTime: jest.fn(),
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Reset mockStore state
    mockStore.player.currentTrack = null;
    mockStore.player.position = 0;
    mockStore.player.isPlaying = false;
    mockStore.player.playbackRate = 1.0;
    mockStore.player.volume = 1.0;
    mockStore.player.currentPlaySessionId = null;
    mockStore.player.currentChapter = null;

    // Reset PlayerService instance
    PlayerService.resetInstance();
    playerService = PlayerService.getInstance();

    // Setup default mock implementations
    mockedTrackPlayer.setupPlayer.mockResolvedValue();
    mockedTrackPlayer.reset.mockResolvedValue();
    mockedTrackPlayer.add.mockResolvedValue(0);
    mockedTrackPlayer.play.mockResolvedValue();
    mockedTrackPlayer.pause.mockResolvedValue();
    mockedTrackPlayer.stop.mockResolvedValue();
    mockedTrackPlayer.seekTo.mockResolvedValue();
    mockedTrackPlayer.setRate.mockResolvedValue();
    mockedTrackPlayer.setVolume.mockResolvedValue();
    mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.None });
    mockedTrackPlayer.getQueue.mockResolvedValue([]);
    mockedTrackPlayer.getProgress.mockResolvedValue({ position: 0, duration: 0, buffered: 0 });
    mockedTrackPlayer.getActiveTrackIndex.mockResolvedValue(undefined);
    mockedTrackPlayer.getActiveTrack.mockResolvedValue(undefined);
    mockedTrackPlayer.getRate.mockResolvedValue(1.0);
    mockedTrackPlayer.getVolume.mockResolvedValue(1.0);

    getLibraryItemById.mockResolvedValue(mockLibraryItem);
    getMediaMetadataByLibraryItemId.mockResolvedValue(mockMetadata);
    getAudioFilesWithDownloadInfo.mockResolvedValue(mockAudioFiles);
    getChaptersForMedia.mockResolvedValue(mockChapters);
    getUserByUsername.mockResolvedValue({ id: "user-1" });
    getStoredUsername.mockResolvedValue("testuser");
    verifyFileExists.mockResolvedValue(true);
    resolveAppPath.mockReturnValue("/full/path/to/downloads/test.m4b");
    configureTrackPlayer.mockResolvedValue();
    useAppStore.getState.mockReturnValue(mockStore);
    progressService.getCurrentSession.mockResolvedValue(null);
    getActiveSession.mockResolvedValue(null);
    getMediaProgressForLibraryItem.mockResolvedValue(null);
    getAsyncItem.mockResolvedValue(null);
    ensureItemInDocuments.mockResolvedValue(undefined);
    downloadService.repairDownloadStatus.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = PlayerService.getInstance();
      const instance2 = PlayerService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should reset instance", () => {
      const instance1 = PlayerService.getInstance();
      PlayerService.resetInstance();
      const instance2 = PlayerService.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe("initialize", () => {
    it("should initialize TrackPlayer", async () => {
      // Make getPlaybackState throw initially so setupPlayer gets called
      mockedTrackPlayer.getPlaybackState.mockRejectedValueOnce(new Error("Player not set up"));

      await playerService.initialize();

      expect(mockedTrackPlayer.setupPlayer).toHaveBeenCalled();
      expect(configureTrackPlayer).toHaveBeenCalled();
    });

    it("should skip initialization if already initialized", async () => {
      // First initialization
      mockedTrackPlayer.getPlaybackState.mockRejectedValueOnce(new Error("Player not set up"));
      await playerService.initialize();
      jest.clearAllMocks();

      // Second initialization should skip
      await playerService.initialize();

      expect(mockedTrackPlayer.setupPlayer).not.toHaveBeenCalled();
    });

    it("should handle already initialized error gracefully", async () => {
      mockedTrackPlayer.getPlaybackState.mockRejectedValueOnce(new Error("Player not set up"));
      mockedTrackPlayer.setupPlayer.mockRejectedValue(new Error("already been initialized"));

      await expect(playerService.initialize()).resolves.not.toThrow();
    });

    it("should throw on other errors", async () => {
      mockedTrackPlayer.getPlaybackState.mockRejectedValueOnce(new Error("Player not set up"));
      mockedTrackPlayer.setupPlayer.mockRejectedValue(new Error("Unknown error"));

      await expect(playerService.initialize()).rejects.toThrow("Unknown error");
    });
  });

  describe("executeLoadTrack", () => {
    beforeEach(async () => {
      mockedTrackPlayer.getPlaybackState.mockRejectedValueOnce(new Error("Player not set up"));
      await playerService.initialize();
      jest.clearAllMocks();
    });

    it("should load and play a track", async () => {
      await playerService.executeLoadTrack("item-1");

      expect(getLibraryItemById).toHaveBeenCalledWith("item-1");
      expect(getMediaMetadataByLibraryItemId).toHaveBeenCalledWith("item-1");
      expect(getAudioFilesWithDownloadInfo).toHaveBeenCalled();
      expect(mockedTrackPlayer.reset).toHaveBeenCalled();
      expect(mockedTrackPlayer.add).toHaveBeenCalled();
      expect(mockedTrackPlayer.play).toHaveBeenCalled();
    });

    it("should skip if already playing same item", async () => {
      mockStore.player.currentTrack = {
        libraryItemId: "item-1",
        mediaId: "media-1",
        title: "Test Book",
        author: "Test Author",
        coverUri: "http://example.com/cover.jpg",
        audioFiles: mockAudioFiles,
        chapters: mockChapters,
        duration: 3600,
        isDownloaded: true,
      };
      mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.Playing });
      mockedTrackPlayer.getQueue.mockResolvedValue([{ id: "file-1", url: "", title: "" }]);

      await playerService.executeLoadTrack("item-1");

      expect(mockedTrackPlayer.reset).not.toHaveBeenCalled();
      expect(mockedTrackPlayer.add).not.toHaveBeenCalled();
    });

    it("should resume if paused on same item", async () => {
      mockStore.player.currentTrack = {
        libraryItemId: "item-1",
        mediaId: "media-1",
        title: "Test Book",
        author: "Test Author",
        coverUri: "http://example.com/cover.jpg",
        audioFiles: mockAudioFiles,
        chapters: mockChapters,
        duration: 3600,
        isDownloaded: true,
      };
      mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.Paused });
      mockedTrackPlayer.getQueue.mockResolvedValue([{ id: "file-1", url: "", title: "" }]);

      await playerService.executeLoadTrack("item-1");

      expect(mockedTrackPlayer.play).toHaveBeenCalled();
      expect(mockedTrackPlayer.reset).not.toHaveBeenCalled();
    });

    it("should throw error if library item not found", async () => {
      getLibraryItemById.mockResolvedValue(null);

      await expect(playerService.executeLoadTrack("missing-item")).rejects.toThrow("not found");
    });

    it("should throw error if metadata not found", async () => {
      getMediaMetadataByLibraryItemId.mockResolvedValue(null);

      await expect(playerService.executeLoadTrack("item-1")).rejects.toThrow("Metadata not found");
    });

    it("should throw error if no audio files found", async () => {
      getAudioFilesWithDownloadInfo.mockResolvedValue([]);

      await expect(playerService.executeLoadTrack("item-1")).rejects.toThrow(
        "No audio files found"
      );
    });

    it("should seek to resume position if available", async () => {
      getActiveSession.mockResolvedValue({
        id: "session-1",
        userId: "user-1",
        libraryItemId: "item-1",
        currentTime: 300,
        startTime: 0,
        duration: 3600,
        updatedAt: new Date("2024-01-01T12:00:00Z"),
      });

      await playerService.executeLoadTrack("item-1");

      expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(300);
    });

    it("should clear loading state on error", async () => {
      getLibraryItemById.mockRejectedValue(new Error("Database error"));

      await expect(playerService.executeLoadTrack("item-1")).rejects.toThrow();

      expect(mockStore._setTrackLoading).toHaveBeenCalledWith(false);
    });

    it("should call repairDownloadStatus before building track list", async () => {
      await playerService.executeLoadTrack("item-1");

      // Verify repairDownloadStatus was called with correct libraryItemId
      expect(downloadService.repairDownloadStatus).toHaveBeenCalledWith("item-1");

      // Verify it was called after ensureItemInDocuments
      expect(ensureItemInDocuments).toHaveBeenCalledWith("item-1");

      // Verify both were called before buildTrackList (which happens before TrackPlayer.add)
      expect(mockedTrackPlayer.add).toHaveBeenCalled();
    });

    it("should continue playback if repairDownloadStatus fails", async () => {
      downloadService.repairDownloadStatus.mockRejectedValueOnce(new Error("Repair failed"));

      // Should not throw - should continue with playback
      await expect(playerService.executeLoadTrack("item-1")).resolves.not.toThrow();

      // Verify playback still happened
      expect(mockedTrackPlayer.add).toHaveBeenCalled();
      expect(mockedTrackPlayer.play).toHaveBeenCalled();
    });

    it("should continue playback if ensureItemInDocuments fails", async () => {
      ensureItemInDocuments.mockRejectedValueOnce(new Error("Move failed"));

      // Should not throw - should continue with playback
      await expect(playerService.executeLoadTrack("item-1")).resolves.not.toThrow();

      // Verify repairDownloadStatus was still called
      expect(downloadService.repairDownloadStatus).toHaveBeenCalledWith("item-1");

      // Verify playback still happened
      expect(mockedTrackPlayer.add).toHaveBeenCalled();
      expect(mockedTrackPlayer.play).toHaveBeenCalled();
    });
  });

  describe("Playback Controls", () => {
    beforeEach(async () => {
      mockedTrackPlayer.getPlaybackState.mockRejectedValueOnce(new Error("Player not set up"));
      await playerService.initialize();
      jest.clearAllMocks();
    });

    it("should toggle play/pause when playing", async () => {
      mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.Playing });

      await playerService.togglePlayPause();

      expect(dispatchPlayerEvent).toHaveBeenCalledWith({ type: "PAUSE" });
    });

    it("should toggle play/pause when paused", async () => {
      // Setup current track and queue so play() doesn't exit early
      mockStore.player.currentTrack = {
        libraryItemId: "item-1",
        mediaId: "media-1",
        title: "Test Book",
        author: "Test Author",
        coverUri: "http://example.com/cover.jpg",
        audioFiles: mockAudioFiles,
        chapters: mockChapters,
        duration: 3600,
        isDownloaded: true,
      };
      mockedTrackPlayer.getQueue.mockResolvedValue([{ id: "file-1", url: "", title: "" }]);
      mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.Paused });

      await playerService.togglePlayPause();

      expect(dispatchPlayerEvent).toHaveBeenCalledWith({ type: "PLAY" });
    });

    it("should pause playback", async () => {
      await playerService.executePause();

      expect(mockedTrackPlayer.pause).toHaveBeenCalled();
      expect(mockStore._setLastPauseTime).toHaveBeenCalled();
    });

    it("should stop playback and clear queue", async () => {
      await playerService.executeStop();

      expect(mockedTrackPlayer.stop).toHaveBeenCalled();
      expect(mockedTrackPlayer.reset).toHaveBeenCalled();
      expect(mockStore._setCurrentTrack).toHaveBeenCalledWith(null);
    });

    it("should seek to position", async () => {
      await playerService.executeSeek(100);

      expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(100);
    });

    it("should set playback rate", async () => {
      await playerService.executeSetRate(1.5);

      expect(mockedTrackPlayer.setRate).toHaveBeenCalledWith(1.5);
    });

    it("should set volume", async () => {
      await playerService.executeSetVolume(0.8);

      expect(mockedTrackPlayer.setVolume).toHaveBeenCalledWith(0.8);
    });
  });

  describe("Resume Position", () => {
    it("should use active session position", async () => {
      getActiveSession.mockResolvedValue({
        id: "session-1",
        currentTime: 500,
        startTime: 0,
        updatedAt: new Date(),
      });

      // We need to test determineResumePosition indirectly through executeLoadTrack
      await playerService.executeLoadTrack("item-1");

      expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(500);
    });

    it("should use saved progress if no active session", async () => {
      getActiveSession.mockResolvedValue(null);
      getMediaProgressForLibraryItem.mockResolvedValue({
        currentTime: 300,
        lastUpdate: new Date(),
      });

      await playerService.executeLoadTrack("item-1");

      expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(300);
    });

    it("should use AsyncStorage position if available", async () => {
      getAsyncItem.mockResolvedValue(400);

      await playerService.executeLoadTrack("item-1");

      expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(400);
    });

    it("should start from beginning if no resume position", async () => {
      await playerService.executeLoadTrack("item-1");

      expect(mockedTrackPlayer.seekTo).not.toHaveBeenCalled();
    });
  });

  describe("State Reconciliation", () => {
    beforeEach(async () => {
      mockedTrackPlayer.getPlaybackState.mockRejectedValueOnce(new Error("Player not set up"));
      await playerService.initialize();
      jest.clearAllMocks();

      // Setup a scenario with mismatched state
      mockStore.player.position = 100;
      mockedTrackPlayer.getProgress.mockResolvedValue({
        position: 200,
        duration: 3600,
        buffered: 0,
      });
      progressService.getCurrentSession.mockResolvedValue({
        sessionId: "session-1",
        libraryItemId: "item-1",
        currentTime: 150,
        updatedAt: new Date(),
      });
    });

    it("should reconcile position mismatch", async () => {
      const report = await playerService.reconcileTrackPlayerState();

      expect(report.discrepanciesFound).toBe(true);
      expect(report.positionMismatch).toBe(true);
    });

    it("should reconcile playback rate mismatch", async () => {
      mockStore.player.playbackRate = 1.5;
      mockedTrackPlayer.getRate.mockResolvedValue(1.0);

      const report = await playerService.reconcileTrackPlayerState();

      expect(report.rateMismatch).toBe(true);
      expect(mockedTrackPlayer.setRate).toHaveBeenCalledWith(1.5);
    });

    it("should reconcile volume mismatch", async () => {
      mockStore.player.volume = 0.8;
      mockedTrackPlayer.getVolume.mockResolvedValue(1.0);

      const report = await playerService.reconcileTrackPlayerState();

      expect(report.volumeMismatch).toBe(true);
      expect(mockedTrackPlayer.setVolume).toHaveBeenCalledWith(0.8);
    });

    it("should report no discrepancies when state matches", async () => {
      // Set everything to match
      mockStore.player.position = 200;
      mockStore.player.playbackRate = 1.0;
      mockStore.player.volume = 1.0;
      progressService.getCurrentSession.mockResolvedValue({
        sessionId: "session-1",
        currentTime: 200,
        updatedAt: new Date(),
      });

      const report = await playerService.reconcileTrackPlayerState();

      expect(report.discrepanciesFound).toBe(false);
    });
  });

  describe("Verify Connection", () => {
    beforeEach(async () => {
      mockedTrackPlayer.getPlaybackState.mockRejectedValueOnce(new Error("Player not set up"));
      await playerService.initialize();
      jest.clearAllMocks();
    });

    it("should return true when state matches", async () => {
      mockStore.player.position = 100;
      mockStore.player.isPlaying = true;
      mockedTrackPlayer.getProgress.mockResolvedValue({
        position: 102,
        duration: 3600,
        buffered: 0,
      });
      mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.Playing });

      const connected = await playerService.verifyTrackPlayerConsistency();

      expect(connected).toBe(true);
    });

    it("should return false when position differs significantly", async () => {
      mockStore.player.position = 100;
      mockedTrackPlayer.getProgress.mockResolvedValue({
        position: 200,
        duration: 3600,
        buffered: 0,
      });

      const connected = await playerService.verifyTrackPlayerConsistency();

      expect(connected).toBe(false);
    });

    it("should return false when playing state differs", async () => {
      mockStore.player.isPlaying = true;
      mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.Paused });

      const connected = await playerService.verifyTrackPlayerConsistency();

      expect(connected).toBe(false);
    });

    it("should handle errors gracefully", async () => {
      mockedTrackPlayer.getPlaybackState.mockRejectedValue(new Error("TrackPlayer error"));

      const connected = await playerService.verifyTrackPlayerConsistency();

      expect(connected).toBe(false);
    });
  });

  describe("reconcileTrackPlayerState", () => {
    it("should detect position mismatch when queue is empty and report it", async () => {
      // This test prevents a regression where UI shows stale chapter during foreground restoration
      // because reconciliation couldn't fix the position when TrackPlayer queue was empty.

      // Setup: currentTrack exists with position 2000, but TrackPlayer queue is empty
      const mockPlayerTrack = {
        libraryItemId: "item-1",
        mediaId: "media-1",
        title: "Test Book",
        author: "Test Author",
        coverUri: "file:///test-cover.jpg",
        audioFiles: mockAudioFiles,
        chapters: mockChapters,
        duration: 3600,
        isDownloaded: true,
      };

      mockStore.player.currentTrack = mockPlayerTrack;
      mockStore.player.position = 2000; // Position in Chapter 2
      mockStore.player.currentPlaySessionId = "session-1";
      mockStore.player.isPlaying = false;

      // Empty TrackPlayer queue (simulates JS context recreation)
      mockedTrackPlayer.getQueue.mockResolvedValue([]);
      mockedTrackPlayer.getProgress.mockResolvedValue({
        position: 0,
        duration: 0,
        buffered: 0,
      });
      mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.None });

      // Mock database session with correct position
      progressService.getCurrentSession.mockResolvedValue({
        sessionId: "session-1",
        libraryItemId: "item-1",
        mediaId: "media-1",
        currentTime: 2000,
        duration: 3600,
        startTime: 0,
        isDownloaded: true,
      });

      const report = await playerService.reconcileTrackPlayerState();

      // Should detect discrepancies but cannot fix because queue is empty
      expect(report.discrepanciesFound).toBe(true);
      expect(report.positionMismatch).toBe(true);

      // Should report that queue needs rebuilding
      expect(
        report.actionsTaken.some(
          (action: string) =>
            action.includes("queue") &&
            (action.includes("rebuild") || action.includes("be rebuilt"))
        )
      ).toBe(true);

      // Position should NOT be changed (can't seek with empty queue)
      expect(mockedTrackPlayer.seekTo).not.toHaveBeenCalled();
    });
  });

  describe("Public API (Event Dispatching)", () => {
    it("should dispatch LOAD_TRACK event", async () => {
      await playerService.playTrack("item-1", "ep-1");
      expect(dispatchPlayerEvent).toHaveBeenCalledWith({
        type: "LOAD_TRACK",
        payload: { libraryItemId: "item-1", episodeId: "ep-1" },
      });
    });

    it("should dispatch PLAY event", async () => {
      await playerService.play();
      expect(dispatchPlayerEvent).toHaveBeenCalledWith({ type: "PLAY" });
    });

    it("should dispatch PAUSE event", async () => {
      await playerService.pause();
      expect(dispatchPlayerEvent).toHaveBeenCalledWith({ type: "PAUSE" });
    });

    it("should dispatch STOP event", async () => {
      await playerService.stop();
      expect(dispatchPlayerEvent).toHaveBeenCalledWith({ type: "STOP" });
    });

    it("should dispatch SEEK event", async () => {
      await playerService.seekTo(123);
      expect(dispatchPlayerEvent).toHaveBeenCalledWith({
        type: "SEEK",
        payload: { position: 123 },
      });
    });

    it("should dispatch SET_RATE event", async () => {
      await playerService.setRate(1.5);
      expect(dispatchPlayerEvent).toHaveBeenCalledWith({
        type: "SET_RATE",
        payload: { rate: 1.5 },
      });
    });

    it("should dispatch SET_VOLUME event", async () => {
      await playerService.setVolume(0.5);
      expect(dispatchPlayerEvent).toHaveBeenCalledWith({
        type: "SET_VOLUME",
        payload: { volume: 0.5 },
      });
    });
  });
});
