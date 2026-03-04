/**
 * Tests for TrackLoadingCollaborator
 *
 * Collaborator concern: executeLoadTrack, buildTrackList, reloadTrackPlayerQueue.
 *
 * Mock setup needed (not 13+):
 *   - react-native-track-player
 *   - @/db/helpers/libraryItems
 *   - @/db/helpers/mediaMetadata
 *   - @/db/helpers/combinedQueries
 *   - @/db/helpers/chapters
 *   - @/lib/fileSystem
 *   - @/lib/fileLifecycleManager
 *   - @/lib/trackPlayerConfig
 *   - mockFacade.dispatchEvent / mockFacade.getApiInfo (injected)
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import TrackPlayer, { State } from "react-native-track-player";
import type { IPlayerServiceFacade } from "@/services/player/types";
import { TrackLoadingCollaborator } from "@/services/player/TrackLoadingCollaborator";

// --- Mocks ---

jest.mock("react-native-track-player", () => ({
  reset: jest.fn(),
  add: jest.fn(),
  getPlaybackState: jest.fn(),
  getQueue: jest.fn(),
  seekTo: jest.fn(),
  setRate: jest.fn(),
  setVolume: jest.fn(),
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

jest.mock("@/db/helpers/audioFiles", () => ({
  clearAudioFileDownloadStatus: jest.fn(),
}));

jest.mock("@/lib/fileSystem", () => ({
  resolveAppPath: jest.fn(),
  verifyFileExists: jest.fn(),
}));

jest.mock("@/lib/fileLifecycleManager", () => ({
  ensureItemInDocuments: jest.fn(),
}));

jest.mock("@/lib/trackPlayerConfig", () => ({
  configureTrackPlayer: jest.fn(),
}));

jest.mock("@/lib/covers", () => ({
  getCoverUri: jest.fn().mockReturnValue("file:///cache/cover.jpg"),
}));

jest.mock("@/lib/api/endpoints", () => ({
  startPlaySession: jest.fn(),
}));

jest.mock("@/services/DownloadService", () => ({
  downloadService: {
    repairDownloadStatus: jest.fn(),
  },
}));

jest.mock("@/stores/appStore", () => ({
  useAppStore: {
    getState: jest.fn(),
  },
}));

jest.mock("@/lib/secureStore", () => ({
  getStoredUsername: jest.fn(),
}));

jest.mock("@/db/helpers/users", () => ({
  getUserByUsername: jest.fn(),
}));

jest.mock("@/services/coordinator/PlayerStateCoordinator", () => {
  const { jest } = require("@jest/globals");
  const mockResolveCanonicalPosition = jest.fn();
  const mockCoordinator = {
    resolveCanonicalPosition: mockResolveCanonicalPosition,
  };
  return {
    getCoordinator: jest.fn(() => mockCoordinator),
    __mockResolveCanonicalPosition: mockResolveCanonicalPosition,
  };
});

// --- Test Data ---

const mockLibraryItem = { id: "item-1", libraryId: "lib-1", mediaType: "book" };
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
    downloadInfo: { isDownloaded: true, downloadPath: "/downloads/test.m4b" },
  },
];
const mockChapters = [
  { id: "ch-1", start: 0, end: 1800, title: "Chapter 1" },
  { id: "ch-2", start: 1800, end: 3600, title: "Chapter 2" },
];

describe("TrackLoadingCollaborator", () => {
  const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer>;
  const { getLibraryItemById } = require("@/db/helpers/libraryItems");
  const { getMediaMetadataByLibraryItemId } = require("@/db/helpers/mediaMetadata");
  const { getAudioFilesWithDownloadInfo } = require("@/db/helpers/combinedQueries");
  const { getChaptersForMedia } = require("@/db/helpers/chapters");
  const { verifyFileExists, resolveAppPath } = require("@/lib/fileSystem");
  const { ensureItemInDocuments } = require("@/lib/fileLifecycleManager");
  const { downloadService } = require("@/services/DownloadService");
  const { useAppStore } = require("@/stores/appStore");
  const { getStoredUsername } = require("@/lib/secureStore");
  const { getUserByUsername } = require("@/db/helpers/users");
  const {
    __mockResolveCanonicalPosition,
  } = require("@/services/coordinator/PlayerStateCoordinator");

  let collaborator: TrackLoadingCollaborator;
  let mockFacade: IPlayerServiceFacade;

  const mockStore = {
    player: {
      currentTrack: null as any,
      playbackRate: 1.0,
      volume: 1.0,
      currentPlaySessionId: null as any,
    },
    _setCurrentTrack: jest.fn(),
    _setTrackLoading: jest.fn(),
    _setPlaySessionId: jest.fn(),
    _updateCurrentChapter: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockStore.player.currentTrack = null;
    mockStore.player.playbackRate = 1.0;
    mockStore.player.volume = 1.0;
    mockStore.player.currentPlaySessionId = null;

    mockFacade = {
      dispatchEvent: jest.fn(),
      getApiInfo: jest.fn().mockReturnValue({ baseUrl: "http://test", accessToken: "tok123" }),
      getInitializationTimestamp: jest.fn().mockReturnValue(Date.now()),
      rebuildCurrentTrackIfNeeded: jest.fn().mockResolvedValue(true),
    };

    collaborator = new TrackLoadingCollaborator(mockFacade);

    // Default mock setups
    mockedTrackPlayer.reset.mockResolvedValue();
    mockedTrackPlayer.add.mockResolvedValue(0);
    mockedTrackPlayer.getPlaybackState.mockResolvedValue({ state: State.None });
    mockedTrackPlayer.getQueue.mockResolvedValue([]);
    mockedTrackPlayer.seekTo.mockResolvedValue();
    mockedTrackPlayer.setRate.mockResolvedValue();
    mockedTrackPlayer.setVolume.mockResolvedValue();

    getLibraryItemById.mockResolvedValue(mockLibraryItem);
    getMediaMetadataByLibraryItemId.mockResolvedValue(mockMetadata);
    getAudioFilesWithDownloadInfo.mockResolvedValue(mockAudioFiles);
    getChaptersForMedia.mockResolvedValue(mockChapters);
    verifyFileExists.mockResolvedValue(true);
    resolveAppPath.mockReturnValue("/full/path/to/downloads/test.m4b");
    ensureItemInDocuments.mockResolvedValue(undefined);
    downloadService.repairDownloadStatus.mockResolvedValue(undefined);
    useAppStore.getState.mockReturnValue(mockStore);

    // getStoredUsername + getUserByUsername mocked via jest.mock at module level
    require("@/lib/secureStore").getStoredUsername.mockResolvedValue("testuser");
    require("@/db/helpers/users").getUserByUsername.mockResolvedValue({ id: "user-1" });

    __mockResolveCanonicalPosition.mockResolvedValue({
      position: 0,
      source: "store",
      authoritativePosition: null,
      asyncStoragePosition: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("executeLoadTrack", () => {
    it("loads a track, builds queue, and dispatches PLAY via facade", async () => {
      await collaborator.executeLoadTrack("item-1");

      expect(getLibraryItemById).toHaveBeenCalledWith("item-1");
      expect(getMediaMetadataByLibraryItemId).toHaveBeenCalledWith("item-1");
      expect(getAudioFilesWithDownloadInfo).toHaveBeenCalled();
      expect(mockedTrackPlayer.reset).toHaveBeenCalled();
      expect(mockedTrackPlayer.add).toHaveBeenCalled();
      expect(mockFacade.dispatchEvent).toHaveBeenCalledWith({ type: "PLAY" });
    });

    it("dispatches PLAY and skips reload if same item is already playing with queue", async () => {
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

      await collaborator.executeLoadTrack("item-1");

      expect(mockedTrackPlayer.reset).not.toHaveBeenCalled();
      expect(mockedTrackPlayer.add).not.toHaveBeenCalled();
      expect(mockFacade.dispatchEvent).toHaveBeenCalledWith({ type: "PLAY" });
    });

    it("dispatches PLAY and skips reload if same item is paused with queue", async () => {
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

      await collaborator.executeLoadTrack("item-1");

      expect(mockedTrackPlayer.reset).not.toHaveBeenCalled();
      expect(mockFacade.dispatchEvent).toHaveBeenCalledWith({ type: "PLAY" });
    });

    it("throws if library item not found", async () => {
      getLibraryItemById.mockResolvedValue(null);

      await expect(collaborator.executeLoadTrack("missing-item")).rejects.toThrow("not found");
    });

    it("throws if metadata not found", async () => {
      getMediaMetadataByLibraryItemId.mockResolvedValue(null);

      await expect(collaborator.executeLoadTrack("item-1")).rejects.toThrow("Metadata not found");
    });

    it("throws if no audio files found", async () => {
      getAudioFilesWithDownloadInfo.mockResolvedValue([]);

      await expect(collaborator.executeLoadTrack("item-1")).rejects.toThrow("No audio files found");
    });

    it("seeks to resume position when coordinator provides one", async () => {
      __mockResolveCanonicalPosition.mockResolvedValue({
        position: 300,
        source: "activeSession",
        authoritativePosition: 300,
        asyncStoragePosition: null,
      });

      await collaborator.executeLoadTrack("item-1");

      expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(300);
    });

    it("does not seek when coordinator returns position 0", async () => {
      await collaborator.executeLoadTrack("item-1");

      expect(mockedTrackPlayer.seekTo).not.toHaveBeenCalled();
    });

    it("clears loading state and rethrows on DB error", async () => {
      getLibraryItemById.mockRejectedValue(new Error("DB error"));

      await expect(collaborator.executeLoadTrack("item-1")).rejects.toThrow("DB error");
      expect(mockStore._setTrackLoading).toHaveBeenCalledWith(false);
    });

    it("continues if ensureItemInDocuments fails", async () => {
      ensureItemInDocuments.mockRejectedValueOnce(new Error("Move failed"));

      await expect(collaborator.executeLoadTrack("item-1")).resolves.not.toThrow();
      expect(mockedTrackPlayer.add).toHaveBeenCalled();
    });

    it("continues if repairDownloadStatus fails", async () => {
      downloadService.repairDownloadStatus.mockRejectedValueOnce(new Error("Repair failed"));

      await expect(collaborator.executeLoadTrack("item-1")).resolves.not.toThrow();
      expect(mockedTrackPlayer.add).toHaveBeenCalled();
    });
  });

  describe("buildTrackList", () => {
    const baseTrack = {
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

    it("returns Track[] with local file URLs for downloaded files", async () => {
      const tracks = await collaborator.buildTrackList(baseTrack as any);

      expect(tracks).toHaveLength(1);
      expect(tracks[0].id).toBe("file-1");
      expect(tracks[0].url).toBe("/full/path/to/downloads/test.m4b");
    });

    it("returns empty array when file is missing and no streaming session", async () => {
      verifyFileExists.mockResolvedValue(false);
      mockStore.player.currentPlaySessionId = null;
      // No startPlaySession mock set to return a session
      require("@/lib/api/endpoints").startPlaySession.mockResolvedValue({
        id: "sess-1",
        audioTracks: [],
      });

      const tracks = await collaborator.buildTrackList(baseTrack as any);

      expect(tracks).toHaveLength(0);
    });

    it("uses streaming URL when file is not downloaded and session available", async () => {
      const streamingAudioFile = {
        ...mockAudioFiles[0],
        downloadInfo: { isDownloaded: false, downloadPath: null },
      };
      const trackWithStreaming = { ...baseTrack, audioFiles: [streamingAudioFile] };

      require("@/lib/api/endpoints").startPlaySession.mockResolvedValue({
        id: "sess-1",
        audioTracks: [
          {
            index: 0,
            contentUrl: "/api/items/item-1/play",
            mimeType: "audio/mp4",
            metadata: { filename: "test.m4b" },
          },
        ],
      });

      const tracks = await collaborator.buildTrackList(trackWithStreaming as any);

      expect(tracks).toHaveLength(1);
      expect(tracks[0].url).toContain("http://test");
      expect(tracks[0].url).toContain("token=tok123");
    });
  });

  describe("reloadTrackPlayerQueue", () => {
    const baseTrack = {
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

    it("rebuilds TrackPlayer queue and returns true on success", async () => {
      const result = await collaborator.reloadTrackPlayerQueue(baseTrack as any);

      expect(result).toBe(true);
      expect(mockedTrackPlayer.reset).toHaveBeenCalled();
      expect(mockedTrackPlayer.add).toHaveBeenCalled();
      expect(mockFacade.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "QUEUE_RELOADED" })
      );
    });

    it("returns false when no playable tracks found", async () => {
      verifyFileExists.mockResolvedValue(false);
      require("@/lib/api/endpoints").startPlaySession.mockResolvedValue({
        id: "sess-1",
        audioTracks: [],
      });

      const result = await collaborator.reloadTrackPlayerQueue(baseTrack as any);

      expect(result).toBe(false);
    });

    it("dispatches RELOAD_QUEUE event before building the queue", async () => {
      await collaborator.reloadTrackPlayerQueue(baseTrack as any);

      expect(mockFacade.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "RELOAD_QUEUE" })
      );
    });
  });
});
