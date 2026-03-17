/**
 * Tests for ProgressRestoreCollaborator
 *
 * Collaborator concern: restorePlayerServiceFromSession, syncPositionFromDatabase,
 *                        rebuildCurrentTrackIfNeeded.
 *
 * Mock setup needed:
 *   - @/db/helpers/localListeningSessions
 *   - @/db/helpers/mediaProgress
 *   - @/db/helpers/users
 *   - @/db/helpers/libraryItems
 *   - @/db/helpers/mediaMetadata
 *   - @/db/helpers/combinedQueries
 *   - @/db/helpers/chapters
 *   - @/lib/secureStore
 *   - @/services/ProgressService
 *   - react-native-track-player
 *   - @/stores/appStore
 *   - mockFacade.dispatchEvent (injected)
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import TrackPlayer, { State } from "react-native-track-player";
import type { IPlayerServiceFacade } from "@/services/player/types";
import { ProgressRestoreCollaborator } from "@/services/player/ProgressRestoreCollaborator";

// --- Mocks ---

jest.mock("react-native-track-player", () => ({
  getPlaybackState: jest.fn(),
  getQueue: jest.fn(),
  seekTo: jest.fn(),
  setRate: jest.fn(),
  setVolume: jest.fn(),
  reset: jest.fn(),
  add: jest.fn(),
  State: {
    None: 0,
    Ready: 1,
    Playing: 2,
    Paused: 3,
    Stopped: 4,
    Buffering: 6,
    Connecting: 8,
  },
}));

jest.mock("@/db/helpers/localListeningSessions", () => ({
  getAllActiveSessionsForUser: jest.fn(),
}));

jest.mock("@/db/helpers/mediaProgress", () => ({
  getMediaProgressForItem: jest.fn(),
}));

jest.mock("@/db/helpers/users", () => ({
  getUserByUsername: jest.fn(),
}));

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

jest.mock("@/lib/secureStore", () => ({
  getStoredUsername: jest.fn(),
}));

jest.mock("@/lib/covers", () => ({
  getCoverUri: jest.fn().mockReturnValue("file:///cache/cover.jpg"),
}));

jest.mock("@/services/ProgressService", () => ({
  progressService: {
    getCurrentSession: jest.fn(),
  },
}));

jest.mock("@/stores/appStore", () => ({
  useAppStore: {
    getState: jest.fn(),
  },
}));

jest.mock("@/lib/api/endpoints", () => ({
  startPlaySession: jest.fn(),
}));

jest.mock("@/lib/fileSystem", () => ({
  resolveAppPath: jest.fn().mockReturnValue("/full/path/test.m4b"),
  verifyFileExists: jest.fn().mockResolvedValue(true),
}));

describe("ProgressRestoreCollaborator", () => {
  const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer>;
  const { getAllActiveSessionsForUser } = require("@/db/helpers/localListeningSessions");
  const { getUserByUsername } = require("@/db/helpers/users");
  const { getLibraryItemById } = require("@/db/helpers/libraryItems");
  const { getMediaMetadataByLibraryItemId } = require("@/db/helpers/mediaMetadata");
  const { getAudioFilesWithDownloadInfo } = require("@/db/helpers/combinedQueries");
  const { getChaptersForMedia } = require("@/db/helpers/chapters");
  const { getStoredUsername } = require("@/lib/secureStore");
  const { progressService } = require("@/services/ProgressService");
  const { useAppStore } = require("@/stores/appStore");
  let collaborator: ProgressRestoreCollaborator;
  let mockFacade: IPlayerServiceFacade;

  const mockAudioFiles = [
    {
      id: "file-1",
      index: 0,
      ino: "1",
      filename: "test.m4b",
      duration: 3600,
      downloadInfo: { isDownloaded: true, downloadPath: "/downloads/test.m4b" },
    },
  ];

  const mockStore = {
    player: {
      currentTrack: null as any,
      playbackRate: 1.0,
      volume: 1.0,
    },
    _setCurrentTrack: jest.fn(),
    _setTrackLoading: jest.fn(),
    _setPlaySessionId: jest.fn(),
    _setLastPauseTime: jest.fn(),
    updatePosition: jest.fn(),
    _updateCurrentChapter: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockStore.player.currentTrack = null;
    mockStore.player.playbackRate = 1.0;
    mockStore.player.volume = 1.0;

    mockFacade = {
      dispatchEvent: jest.fn(),
      getApiInfo: jest.fn().mockReturnValue({ baseUrl: "http://test", accessToken: "tok123" }),
      getInitializationTimestamp: jest.fn().mockReturnValue(Date.now()),
    };

    collaborator = new ProgressRestoreCollaborator(mockFacade);

    mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.None });
    mockedTrackPlayer.getQueue.mockResolvedValue([]);
    mockedTrackPlayer.seekTo.mockResolvedValue();
    mockedTrackPlayer.setRate.mockResolvedValue();
    mockedTrackPlayer.setVolume.mockResolvedValue();
    mockedTrackPlayer.reset.mockResolvedValue();
    mockedTrackPlayer.add.mockResolvedValue(0);

    useAppStore.getState.mockReturnValue(mockStore);
    getStoredUsername.mockResolvedValue("testuser");
    getUserByUsername.mockResolvedValue({ id: "user-1" });
    progressService.getCurrentSession.mockResolvedValue(null);
    getAllActiveSessionsForUser.mockResolvedValue([]);
    getLibraryItemById.mockResolvedValue({
      id: "item-1",
      libraryId: "lib-1",
      mediaType: "book",
    });
    getMediaMetadataByLibraryItemId.mockResolvedValue({
      id: "media-1",
      title: "Test Book",
      authorName: "Test Author",
      imageUrl: "http://example.com/cover.jpg",
    });
    getAudioFilesWithDownloadInfo.mockResolvedValue(mockAudioFiles);
    getChaptersForMedia.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("restorePlayerServiceFromSession", () => {
    it("returns early when no username found", async () => {
      getStoredUsername.mockResolvedValue(null);

      await collaborator.restorePlayerServiceFromSession();

      expect(mockStore._setCurrentTrack).not.toHaveBeenCalled();
    });

    it("returns early when user not found in DB", async () => {
      getUserByUsername.mockResolvedValue(null);

      await collaborator.restorePlayerServiceFromSession();

      expect(mockStore._setCurrentTrack).not.toHaveBeenCalled();
    });

    it("returns early when no active sessions found", async () => {
      getAllActiveSessionsForUser.mockResolvedValue([]);
      progressService.getCurrentSession.mockResolvedValue(null);

      await collaborator.restorePlayerServiceFromSession();

      expect(mockStore._setCurrentTrack).not.toHaveBeenCalled();
    });

    it("restores track from most recent active session", async () => {
      const now = new Date();
      getAllActiveSessionsForUser.mockResolvedValue([
        { libraryItemId: "item-1", updatedAt: now, currentTime: 300 },
      ]);
      progressService.getCurrentSession.mockResolvedValue({
        libraryItemId: "item-1",
        currentTime: 300,
      });

      await collaborator.restorePlayerServiceFromSession();

      expect(mockStore._setCurrentTrack).toHaveBeenCalledWith(
        expect.objectContaining({ libraryItemId: "item-1" })
      );
    });

    it("does not call _setCurrentTrack if library item not found", async () => {
      getAllActiveSessionsForUser.mockResolvedValue([
        { libraryItemId: "item-1", updatedAt: new Date(), currentTime: 0 },
      ]);
      progressService.getCurrentSession.mockResolvedValue({
        libraryItemId: "item-1",
        currentTime: 0,
      });
      getLibraryItemById.mockResolvedValue(null);

      await collaborator.restorePlayerServiceFromSession();

      expect(mockStore._setCurrentTrack).not.toHaveBeenCalled();
    });
  });

  describe("syncPositionFromDatabase", () => {
    it("returns early when no current track", async () => {
      mockStore.player.currentTrack = null;

      await collaborator.syncPositionFromDatabase();

      expect(mockStore.updatePosition).not.toHaveBeenCalled();
    });

    it("syncs position from active session when not playing", async () => {
      mockStore.player.currentTrack = {
        libraryItemId: "item-1",
        mediaId: "media-1",
        title: "Test Book",
        author: "Test Author",
        coverUri: "http://example.com/cover.jpg",
        audioFiles: mockAudioFiles,
        chapters: [],
        duration: 3600,
        isDownloaded: true,
      };
      mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.Paused });
      progressService.getCurrentSession.mockResolvedValue({
        libraryItemId: "item-1",
        currentTime: 500,
      });

      await collaborator.syncPositionFromDatabase();

      expect(mockStore.updatePosition).toHaveBeenCalledWith(500);
      expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(500);
    });

    it("updates store but does not seek when actively playing", async () => {
      mockStore.player.currentTrack = {
        libraryItemId: "item-1",
        mediaId: "media-1",
        title: "Test Book",
        author: "Test Author",
        coverUri: "http://example.com/cover.jpg",
        audioFiles: mockAudioFiles,
        chapters: [],
        duration: 3600,
        isDownloaded: true,
      };
      mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.Playing });
      progressService.getCurrentSession.mockResolvedValue({
        libraryItemId: "item-1",
        currentTime: 500,
      });

      await collaborator.syncPositionFromDatabase();

      expect(mockStore.updatePosition).toHaveBeenCalledWith(500);
      expect(mockedTrackPlayer.seekTo).not.toHaveBeenCalled();
    });
  });

  describe("restorePlayerServiceFromSession: additional branches", () => {
    it("uses currentTrack.libraryItemId from store to skip getAllActiveSessionsForUser", async () => {
      mockStore.player.currentTrack = {
        libraryItemId: "item-1",
        mediaId: "media-1",
        title: "Test Book",
        author: "Test Author",
        coverUri: "http://example.com/cover.jpg",
        audioFiles: mockAudioFiles,
        chapters: [],
        duration: 3600,
        isDownloaded: true,
      };
      progressService.getCurrentSession.mockResolvedValue({
        libraryItemId: "item-1",
        currentTime: 200,
      });

      await collaborator.restorePlayerServiceFromSession();

      expect(getAllActiveSessionsForUser).not.toHaveBeenCalled();
      expect(mockStore._setCurrentTrack).toHaveBeenCalled();
    });

    it("returns early when getCurrentSession returns null after session lookup", async () => {
      getAllActiveSessionsForUser.mockResolvedValue([
        { libraryItemId: "item-1", updatedAt: new Date(), currentTime: 0 },
      ]);
      progressService.getCurrentSession.mockResolvedValue(null);

      await collaborator.restorePlayerServiceFromSession();

      expect(mockStore._setCurrentTrack).not.toHaveBeenCalled();
    });

    it("does not call _setCurrentTrack if metadata not found", async () => {
      getAllActiveSessionsForUser.mockResolvedValue([
        { libraryItemId: "item-1", updatedAt: new Date(), currentTime: 0 },
      ]);
      progressService.getCurrentSession.mockResolvedValue({
        libraryItemId: "item-1",
        currentTime: 0,
      });
      getMediaMetadataByLibraryItemId.mockResolvedValue(null);

      await collaborator.restorePlayerServiceFromSession();

      expect(mockStore._setCurrentTrack).not.toHaveBeenCalled();
    });

    it("does not call _setCurrentTrack if no audio files found", async () => {
      getAllActiveSessionsForUser.mockResolvedValue([
        { libraryItemId: "item-1", updatedAt: new Date(), currentTime: 0 },
      ]);
      progressService.getCurrentSession.mockResolvedValue({
        libraryItemId: "item-1",
        currentTime: 0,
      });
      getAudioFilesWithDownloadInfo.mockResolvedValue([]);

      await collaborator.restorePlayerServiceFromSession();

      expect(mockStore._setCurrentTrack).not.toHaveBeenCalled();
    });

    it("restores streaming track (no downloaded files)", async () => {
      const streamingAudioFiles = [
        {
          ...mockAudioFiles[0],
          downloadInfo: { isDownloaded: false, downloadPath: null },
        },
      ];
      getAllActiveSessionsForUser.mockResolvedValue([
        { libraryItemId: "item-1", updatedAt: new Date(), currentTime: 0 },
      ]);
      progressService.getCurrentSession.mockResolvedValue({
        libraryItemId: "item-1",
        currentTime: 0,
      });
      getAudioFilesWithDownloadInfo.mockResolvedValue(streamingAudioFiles);

      await collaborator.restorePlayerServiceFromSession();

      expect(mockStore._setCurrentTrack).toHaveBeenCalledWith(
        expect.objectContaining({ isDownloaded: false })
      );
    });
  });

  describe("syncPositionFromDatabase: additional branches", () => {
    it("returns early when no username found", async () => {
      mockStore.player.currentTrack = {
        libraryItemId: "item-1",
        audioFiles: mockAudioFiles,
      };
      getStoredUsername.mockResolvedValue(null);

      await collaborator.syncPositionFromDatabase();

      expect(mockStore.updatePosition).not.toHaveBeenCalled();
    });

    it("returns early when user not found in DB", async () => {
      mockStore.player.currentTrack = {
        libraryItemId: "item-1",
        audioFiles: mockAudioFiles,
      };
      getUserByUsername.mockResolvedValue(null);

      await collaborator.syncPositionFromDatabase();

      expect(mockStore.updatePosition).not.toHaveBeenCalled();
    });

    it("returns early when no session found for current track", async () => {
      mockStore.player.currentTrack = {
        libraryItemId: "item-1",
        audioFiles: mockAudioFiles,
      };
      progressService.getCurrentSession.mockResolvedValue(null);

      await collaborator.syncPositionFromDatabase();

      expect(mockStore.updatePosition).not.toHaveBeenCalled();
    });

    it("throws on DB error", async () => {
      mockStore.player.currentTrack = {
        libraryItemId: "item-1",
        audioFiles: mockAudioFiles,
      };
      progressService.getCurrentSession.mockRejectedValue(new Error("DB error"));

      await expect(collaborator.syncPositionFromDatabase()).rejects.toThrow("DB error");
    });
  });
});
