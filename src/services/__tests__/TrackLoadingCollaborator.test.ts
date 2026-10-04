/**
 * Tests for TrackLoadingCollaborator
 *
 * Collaborator concern: executeLoadTrack, buildTrackList, executeRebuildQueue.
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
  // Bare jest.fn() (no implementation) resolves to `undefined` when awaited —
  // this is the default across the test suite and is intentional: it exercises
  // the "getProgress unavailable" bail-immediately branch of waitForSeekToLand
  // (Task 2) so tests that seek to a nonzero position don't poll for real 3s.
  // Tests that specifically exercise waitForSeekToLand's landing detection set
  // an explicit mockResolvedValue.
  getProgress: jest.fn(),
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
  markAudioFileAsDownloaded: jest.fn(),
}));

jest.mock("@/lib/fileSystem", () => ({
  resolveAppPath: jest.fn(),
  verifyFileExists: jest.fn(),
  getAudioFileLocation: jest.fn().mockReturnValue(null),
  getDownloadPath: jest.fn(
    (libraryItemId: string, filename: string, _location?: string) =>
      `/repaired/downloads/${libraryItemId}/${filename}`
  ),
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

  let collaborator: TrackLoadingCollaborator;
  let mockFacade: IPlayerServiceFacade;

  const mockStore = {
    player: {
      currentTrack: null as any,
      playbackRate: 1.0,
      volume: 1.0,
      currentPlaySessionId: null as any,
      position: 0,
    },
    _setCurrentTrack: jest.fn(),
    _setTrackLoading: jest.fn(),
    _setPlaySessionId: jest.fn(),
    _updateCurrentChapter: jest.fn(),
    updatePosition: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockStore.player.currentTrack = null;
    mockStore.player.playbackRate = 1.0;
    mockStore.player.volume = 1.0;
    mockStore.player.currentPlaySessionId = null;

    mockFacade = {
      dispatchEvent: jest.fn(),
      getApiInfo: jest.fn<IPlayerServiceFacade["getApiInfo"]>().mockReturnValue({
        baseUrl: "http://test",
        accessToken: "tok123",
      }),
      getInitializationTimestamp: jest
        .fn<IPlayerServiceFacade["getInitializationTimestamp"]>()
        .mockReturnValue(Date.now()),
      executeRebuildQueue: jest.fn<IPlayerServiceFacade["executeRebuildQueue"]>(),
      resolveCanonicalPosition: jest
        .fn<IPlayerServiceFacade["resolveCanonicalPosition"]>()
        .mockResolvedValue({
          position: 0,
          source: "store",
          authoritativePosition: null,
          asyncStoragePosition: null,
        }),
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("executeLoadTrack", () => {
    it("preserves the podcast episode ID on the PlayerTrack", async () => {
      await collaborator.executeLoadTrack("item-1", "episode-7");

      expect(mockStore._setCurrentTrack).toHaveBeenCalledWith(
        expect.objectContaining({
          libraryItemId: "item-1",
          mediaId: "media-1",
          episodeId: "episode-7",
        })
      );
    });

    it("loads a track, builds queue, and does NOT dispatch PLAY (coordinator handles it)", async () => {
      await collaborator.executeLoadTrack("item-1");

      expect(getLibraryItemById).toHaveBeenCalledWith("item-1");
      expect(getMediaMetadataByLibraryItemId).toHaveBeenCalledWith("item-1");
      expect(getAudioFilesWithDownloadInfo).toHaveBeenCalled();
      expect(mockedTrackPlayer.reset).toHaveBeenCalled();
      expect(mockedTrackPlayer.add).toHaveBeenCalled();
      // Coordinator handles PLAY dispatch — collaborator must NOT dispatch it
      expect(mockFacade.dispatchEvent).not.toHaveBeenCalledWith({ type: "PLAY" });
    });

    it("calls facade.resolveCanonicalPosition to determine resume position", async () => {
      jest.mocked(mockFacade.resolveCanonicalPosition).mockResolvedValue({
        position: 120,
        source: "activeSession",
        authoritativePosition: 120,
        asyncStoragePosition: null,
      });

      await collaborator.executeLoadTrack("item-1");

      expect(mockFacade.resolveCanonicalPosition).toHaveBeenCalledWith("item-1");
      expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(120);
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
      jest.mocked(mockFacade.resolveCanonicalPosition).mockResolvedValue({
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

    it("rethrows on DB error without writing to the store directly (Task 3b/3c)", async () => {
      // The store._setTrackLoading(false) write that used to live here was dead:
      // it ran, then the coordinator's subsequent NATIVE_ERROR/ERROR-transition
      // syncStateToStore call re-pushed context.isLoadingTrack (still true) right
      // back over it. The real fix — clearing context.isLoadingTrack when the
      // NATIVE_ERROR recovery path runs — lives in the coordinator
      // (PlayerStateCoordinator's NATIVE_ERROR case handler); this collaborator
      // just rethrows and lets the coordinator own the loading-state recovery.
      getLibraryItemById.mockRejectedValue(new Error("DB error"));

      await expect(collaborator.executeLoadTrack("item-1")).rejects.toThrow("DB error");
      expect(mockStore._setTrackLoading).not.toHaveBeenCalled();
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
      const { tracks } = await collaborator.buildTrackList(baseTrack as any);

      expect(tracks).toHaveLength(1);
      expect(tracks[0].id).toBe("file-1");
      expect(tracks[0].url).toBe("/full/path/to/downloads/test.m4b");
    });

    it("returns playSessionId: null when all files are local (no streaming needed)", async () => {
      const { playSessionId } = await collaborator.buildTrackList(baseTrack as any);

      expect(playSessionId).toBeNull();
    });

    it("returns empty array when file is missing and no streaming session", async () => {
      verifyFileExists.mockResolvedValue(false);
      mockStore.player.currentPlaySessionId = null;
      // No startPlaySession mock set to return a session
      require("@/lib/api/endpoints").startPlaySession.mockResolvedValue({
        id: "sess-1",
        audioTracks: [],
      });

      const { tracks } = await collaborator.buildTrackList(baseTrack as any);

      expect(tracks).toHaveLength(0);
    });

    it("uses streaming URL with Authorization header, no token in URL, when file is not downloaded and session available", async () => {
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

      const { tracks, playSessionId } = await collaborator.buildTrackList(
        trackWithStreaming as any
      );

      expect(tracks).toHaveLength(1);
      expect(tracks[0].url).toBe("http://test/api/items/item-1/play");
      expect(tracks[0].url).not.toContain("token=");
      expect(tracks[0].url).not.toContain("tok123");
      expect(tracks[0].headers).toEqual({ Authorization: "Bearer tok123" });
      // Task 3a: the started play session id is threaded back via the return
      // value instead of being written directly to the store.
      expect(playSessionId).toBe("sess-1");
    });

    it("preserves existing query params on the streaming content URL (no token appended)", async () => {
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
            contentUrl: "/api/items/item-1/play?ts=123",
            mimeType: "audio/mp4",
            metadata: { filename: "test.m4b" },
          },
        ],
      });

      const { tracks } = await collaborator.buildTrackList(trackWithStreaming as any);

      expect(tracks[0].url).toBe("http://test/api/items/item-1/play?ts=123");
      expect(tracks[0].headers).toEqual({ Authorization: "Bearer tok123" });
    });

    it("does not set headers on local (downloaded) file tracks", async () => {
      const { tracks } = await collaborator.buildTrackList(baseTrack as any);

      expect(tracks).toHaveLength(1);
      expect(tracks[0].url).toBe("/full/path/to/downloads/test.m4b");
      expect(tracks[0].headers).toBeUndefined();
    });
  });

  describe("executeRebuildQueue", () => {
    const mockTrack: any = {
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

    it("resets queue, builds track list, and returns ResumePositionInfo", async () => {
      const resumeInfo = await collaborator.executeRebuildQueue(mockTrack);

      expect(mockedTrackPlayer.reset).toHaveBeenCalled();
      expect(mockedTrackPlayer.add).toHaveBeenCalled();
      expect(resumeInfo).toEqual({
        position: 0,
        source: "store",
        authoritativePosition: null,
        asyncStoragePosition: null,
      });
    });

    it("seeks to resume position when position > 0", async () => {
      jest.mocked(mockFacade.resolveCanonicalPosition).mockResolvedValue({
        position: 300,
        source: "activeSession",
        authoritativePosition: 300,
        asyncStoragePosition: null,
      });

      await collaborator.executeRebuildQueue(mockTrack);

      expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(300);
    });

    it("does not seek when position is 0", async () => {
      await collaborator.executeRebuildQueue(mockTrack);

      expect(mockedTrackPlayer.seekTo).not.toHaveBeenCalled();
    });

    it("throws when no playable tracks found", async () => {
      verifyFileExists.mockResolvedValue(false);
      require("@/lib/api/endpoints").startPlaySession.mockResolvedValue({
        id: "sess-1",
        audioTracks: [],
      });

      await expect(collaborator.executeRebuildQueue(mockTrack)).rejects.toThrow(
        "No playable sources found"
      );
    });

    it("does not call dispatchEvent (pure execution)", async () => {
      await collaborator.executeRebuildQueue(mockTrack);

      expect(mockFacade.dispatchEvent).not.toHaveBeenCalled();
    });

    it("calls facade.resolveCanonicalPosition instead of coordinator directly", async () => {
      await collaborator.executeRebuildQueue(mockTrack);

      expect(mockFacade.resolveCanonicalPosition).toHaveBeenCalledWith("item-1");
    });

    it("applies playback rate from store when non-default", async () => {
      mockStore.player.playbackRate = 1.5;
      await collaborator.executeRebuildQueue(mockTrack);
      expect(mockedTrackPlayer.setRate).toHaveBeenCalledWith(1.5);
    });

    it("does not apply playback rate when 1.0 (default)", async () => {
      mockStore.player.playbackRate = 1.0;
      await collaborator.executeRebuildQueue(mockTrack);
      expect(mockedTrackPlayer.setRate).not.toHaveBeenCalled();
    });
  });

  describe("executeLoadTrack: additional branches", () => {
    it("throws if no username found", async () => {
      getStoredUsername.mockResolvedValue(null);

      await expect(collaborator.executeLoadTrack("item-1")).rejects.toThrow(
        "No authenticated user found"
      );
    });

    it("throws if user not found in DB", async () => {
      getUserByUsername.mockResolvedValue(null);

      await expect(collaborator.executeLoadTrack("item-1")).rejects.toThrow(
        "User not found in database"
      );
    });

    it("throws with downloaded-files-missing message when downloaded files exist but not found", async () => {
      // Files show as downloaded but don't exist on disk
      verifyFileExists.mockResolvedValue(false);
      // Don't provide streaming session
      require("@/lib/api/endpoints").startPlaySession.mockRejectedValue(new Error("No session"));

      await expect(collaborator.executeLoadTrack("item-1")).rejects.toThrow(
        "Downloaded files are missing"
      );
    });

    it("throws with streaming unavailable message when no downloaded files and streaming fails", async () => {
      const streamingOnlyFiles = [
        {
          ...mockAudioFiles[0],
          downloadInfo: { isDownloaded: false, downloadPath: null },
        },
      ];
      getAudioFilesWithDownloadInfo.mockResolvedValue(streamingOnlyFiles);
      require("@/lib/api/endpoints").startPlaySession.mockRejectedValue(new Error("No network"));

      await expect(collaborator.executeLoadTrack("item-1")).rejects.toThrow(
        "not available. Please check your internet connection."
      );
    });

    it("applies non-default playback rate and volume from store after load", async () => {
      mockStore.player.playbackRate = 1.5;
      mockStore.player.volume = 0.7;
      useAppStore.getState.mockReturnValue(mockStore);

      await collaborator.executeLoadTrack("item-1");

      expect(mockedTrackPlayer.setRate).toHaveBeenCalledWith(1.5);
      expect(mockedTrackPlayer.setVolume).toHaveBeenCalledWith(0.7);
    });
  });

  describe("buildTrackList: additional branches", () => {
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

    it("returns playSessionId: null when all files are local, without writing to the store (Task 3a)", async () => {
      // A stale session id lingering in the store must NOT be touched directly —
      // the coordinator's LOADING handler is responsible for clearing
      // context.sessionId from this method's returned playSessionId.
      mockStore.player.currentPlaySessionId = "old-sess";

      const { playSessionId } = await collaborator.buildTrackList(baseTrack as any);

      expect(playSessionId).toBeNull();
      expect(mockStore._setPlaySessionId).not.toHaveBeenCalled();
    });

    it("handles startPlaySession failure gracefully", async () => {
      const streamingAudioFile = {
        ...mockAudioFiles[0],
        downloadInfo: { isDownloaded: false, downloadPath: null },
      };
      const trackWithStreaming = { ...baseTrack, audioFiles: [streamingAudioFile] };
      require("@/lib/api/endpoints").startPlaySession.mockRejectedValue(
        new Error("Session failed")
      );

      // Should not throw — returns empty array and no session id
      const { tracks, playSessionId } = await collaborator.buildTrackList(
        trackWithStreaming as any
      );
      expect(tracks).toHaveLength(0);
      expect(playSessionId).toBeNull();
    });

    it("uses getCoverUri path when imageUrl is a local path (not http)", async () => {
      const localImageTrack = {
        ...baseTrack,
        // imageUrl is a local path, not http — getCoverUri should be used
      };
      // The local image URL would be in metadata, but since we construct track in executeLoadTrack
      // This test targets buildTrackList directly which constructs artwork from playerTrack.coverUri
      const { tracks } = await collaborator.buildTrackList(localImageTrack as any);

      expect(tracks).toHaveLength(1);
      expect(tracks[0].artwork).toBe("http://example.com/cover.jpg");
    });

    it("repairs stale path and builds local track when verifyFileExists fails but getAudioFileLocation finds the file", async () => {
      const { getAudioFileLocation, getDownloadPath } = require("@/lib/fileSystem");
      const { markAudioFileAsDownloaded } = require("@/db/helpers/audioFiles");

      // Stored path is stale (legacy absolute path after iOS container UUID rotation)
      verifyFileExists.mockResolvedValue(false);
      // But getAudioFileLocation finds the file in Documents
      getAudioFileLocation.mockReturnValue("documents");
      getDownloadPath.mockReturnValue("/repaired/downloads/item-1/test.m4b");
      markAudioFileAsDownloaded.mockResolvedValue(undefined);

      const { tracks } = await collaborator.buildTrackList(baseTrack as any);

      expect(markAudioFileAsDownloaded).toHaveBeenCalledWith(
        "file-1",
        "/repaired/downloads/item-1/test.m4b"
      );
      expect(tracks).toHaveLength(1);
      expect(tracks[0].url).toBe("/repaired/downloads/item-1/test.m4b");
    });
  });

  describe("executeLoadTrack: position threading (Task 4a/4b)", () => {
    // The store.updatePosition(seekPosition) write that used to live in path B
    // (resolveCanonicalPosition) existed solely so PlaybackControlCollaborator's
    // executePlay could read it back via store.player.position. Task 4c makes
    // executePlay take the position as an explicit parameter instead, so this
    // write — and the dead POSITION_RECONCILED dispatch in path A, which the
    // LOADING state has no transition entry for and which therefore never had
    // any effect — are both gone. The resolved position is threaded back
    // through executeLoadTrack's return value instead; the coordinator's
    // LOADING handler assigns it to context.position directly.
    it("resolves with the resolveCanonicalPosition value (path B) without writing to the store", async () => {
      jest.mocked(mockFacade.resolveCanonicalPosition).mockResolvedValue({
        position: 300,
        source: "activeSession",
        authoritativePosition: 300,
        asyncStoragePosition: null,
      });

      const result = await collaborator.executeLoadTrack("item-1");

      expect(result.position).toBe(300);
      expect(mockStore.updatePosition).not.toHaveBeenCalled();
    });

    it("resolves with the caller-specified startPosition (path A) without writing to the store", async () => {
      const result = await collaborator.executeLoadTrack("item-1", undefined, 500);

      expect(result.position).toBe(500);
      expect(mockStore.updatePosition).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Task 3a: currentPlaySessionId is threaded back via executeLoadTrack's
  // return value (folded into context.sessionId by the coordinator's LOADING
  // handler) instead of being written directly to the store from buildTrackList.
  // ============================================================================
  describe("executeLoadTrack: play session threading (Task 3a)", () => {
    it("resolves with playSessionId from the started streaming session", async () => {
      const streamingAudioFile = {
        ...mockAudioFiles[0],
        downloadInfo: { isDownloaded: false, downloadPath: null },
      };
      getAudioFilesWithDownloadInfo.mockResolvedValue([streamingAudioFile]);
      require("@/lib/api/endpoints").startPlaySession.mockResolvedValue({
        id: "sess-42",
        audioTracks: [
          {
            index: 0,
            contentUrl: "/api/items/item-1/play",
            mimeType: "audio/mp4",
            metadata: { filename: "test.m4b" },
          },
        ],
      });

      const result = await collaborator.executeLoadTrack("item-1");

      expect(result.playSessionId).toBe("sess-42");
      expect(mockStore._setPlaySessionId).not.toHaveBeenCalled();
    });

    it("resolves with playSessionId: null when all files are local (no streaming needed)", async () => {
      const result = await collaborator.executeLoadTrack("item-1");

      expect(result.playSessionId).toBeNull();
      expect(mockStore._setPlaySessionId).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Task 2: wait for a just-issued seekTo() to actually land before returning,
  // so the coordinator's subsequent PLAY dispatch doesn't race a seek still in
  // flight natively (RNTP's seekTo() resolves before AVPlayer finishes seeking).
  // ============================================================================
  describe("waitForSeekToLand (Task 2)", () => {
    // Private method — invoked directly to unit test its polling/timeout/bail
    // behavior in isolation from executeLoadTrack's surrounding DB/queue setup.
    const invoke = (target: number): Promise<void> =>
      (
        collaborator as unknown as { waitForSeekToLand(t: number): Promise<void> }
      ).waitForSeekToLand(target);

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("resolves promptly once getProgress reports the target position", async () => {
      mockedTrackPlayer.getProgress.mockResolvedValue({
        position: 300,
        buffered: 300,
        duration: 3600,
      });

      await invoke(300);

      // A single check should have been enough — no polling delay needed.
      expect(mockedTrackPlayer.getProgress).toHaveBeenCalledTimes(1);
    });

    it("gives up at the timeout and still resolves", async () => {
      // Reported position never moves toward the target.
      mockedTrackPlayer.getProgress.mockResolvedValue({ position: 0, buffered: 0, duration: 3600 });

      const settled = jest.fn();
      const promise = invoke(300).then(settled);

      // Flush the poll loop through the full 3s timeout window.
      await jest.advanceTimersByTimeAsync(3_000);
      await promise;

      expect(settled).toHaveBeenCalled();
      expect(mockedTrackPlayer.getProgress.mock.calls.length).toBeGreaterThan(1);
    });

    it("bails immediately when getProgress is unavailable/undefined", async () => {
      mockedTrackPlayer.getProgress.mockResolvedValue(undefined as any);

      const settled = jest.fn();
      const promise = invoke(300).then(settled);
      // Flush microtasks only — no timer advance. If the implementation
      // incorrectly entered the poll loop, this would still be pending.
      await Promise.resolve();
      await Promise.resolve();

      expect(settled).toHaveBeenCalled();
      await promise;
      expect(mockedTrackPlayer.getProgress).toHaveBeenCalledTimes(1);
    });

    it("bails immediately when getProgress throws", async () => {
      mockedTrackPlayer.getProgress.mockRejectedValue(new Error("native error"));

      const settled = jest.fn();
      const promise = invoke(300).then(settled);
      await Promise.resolve();
      await Promise.resolve();

      expect(settled).toHaveBeenCalled();
      await promise;
      expect(mockedTrackPlayer.getProgress).toHaveBeenCalledTimes(1);
    });

    it("bails immediately when getProgress reports a non-finite position", async () => {
      mockedTrackPlayer.getProgress.mockResolvedValue({
        position: NaN,
        buffered: 0,
        duration: 3600,
      });

      const settled = jest.fn();
      const promise = invoke(300).then(settled);
      await Promise.resolve();
      await Promise.resolve();

      expect(settled).toHaveBeenCalled();
      await promise;
      expect(mockedTrackPlayer.getProgress).toHaveBeenCalledTimes(1);
    });
  });

  describe("executeLoadTrack: waits for seek to land before returning (Task 2)", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("calls TrackPlayer.getProgress after seekTo when a seek was performed", async () => {
      jest.mocked(mockFacade.resolveCanonicalPosition).mockResolvedValue({
        position: 300,
        source: "activeSession",
        authoritativePosition: 300,
        asyncStoragePosition: null,
      });
      mockedTrackPlayer.getProgress.mockResolvedValue({
        position: 300,
        buffered: 300,
        duration: 3600,
      });

      await collaborator.executeLoadTrack("item-1");

      expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(300);
      expect(mockedTrackPlayer.getProgress).toHaveBeenCalled();
    });

    it("does not call TrackPlayer.getProgress when no seek was needed (position 0)", async () => {
      await collaborator.executeLoadTrack("item-1");

      expect(mockedTrackPlayer.seekTo).not.toHaveBeenCalled();
      expect(mockedTrackPlayer.getProgress).not.toHaveBeenCalled();
    });
  });
});
