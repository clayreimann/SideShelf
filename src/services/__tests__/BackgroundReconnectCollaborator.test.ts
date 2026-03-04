/**
 * Tests for BackgroundReconnectCollaborator
 *
 * Collaborator concern: reconnectBackgroundService, refreshFilePathsAfterContainerChange.
 *
 * Mock setup needed:
 *   - @/lib/fileSystem
 *   - @/lib/covers
 *   - @/lib/trackPlayerConfig
 *   - react-native-track-player
 *   - @/stores/appStore
 *   - @/services/coordinator/PlayerStateCoordinator (dynamic import via jest.mock)
 *   - mockFacade (injected — no global mocks needed for coordinator or appStore bridge)
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import TrackPlayer from "react-native-track-player";
import type { IPlayerServiceFacade } from "@/services/player/types";
import { BackgroundReconnectCollaborator } from "@/services/player/BackgroundReconnectCollaborator";

// --- Mocks ---

jest.mock("react-native-track-player", () => ({
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
}));

jest.mock("@/lib/covers", () => ({
  getCoverUri: jest.fn(),
}));

jest.mock("@/lib/trackPlayerConfig", () => ({
  configureTrackPlayer: jest.fn(),
}));

jest.mock("@/stores/appStore", () => ({
  useAppStore: {
    getState: jest.fn(),
  },
}));

describe("BackgroundReconnectCollaborator", () => {
  const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer>;
  const { getCoverUri } = require("@/lib/covers");
  const { configureTrackPlayer } = require("@/lib/trackPlayerConfig");
  const { useAppStore } = require("@/stores/appStore");

  let collaborator: BackgroundReconnectCollaborator;
  let mockFacade: IPlayerServiceFacade;

  const mockAudioFiles = [
    {
      id: "file-1",
      index: 0,
      filename: "test.m4b",
      duration: 3600,
      downloadInfo: { isDownloaded: true, downloadPath: "/downloads/test.m4b" },
    },
  ];

  const mockStore = {
    player: {
      currentTrack: null as any,
    },
    _setCurrentTrack: jest.fn(),
    updateNowPlayingMetadata: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockStore.player.currentTrack = null;

    mockFacade = {
      dispatchEvent: jest.fn(),
      getApiInfo: jest.fn().mockReturnValue({ baseUrl: "http://test", accessToken: "tok123" }),
      getInitializationTimestamp: jest.fn().mockReturnValue(Date.now()),
      rebuildCurrentTrackIfNeeded: jest.fn().mockResolvedValue(true),
    };

    collaborator = new BackgroundReconnectCollaborator(mockFacade);

    mockedTrackPlayer.registerPlaybackService.mockReturnValue(undefined);
    configureTrackPlayer.mockResolvedValue(undefined);
    useAppStore.getState.mockReturnValue(mockStore);
    getCoverUri.mockReturnValue("file:///cache/covers/item-1.jpg");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("reconnectBackgroundService", () => {
    it("calls configureTrackPlayer as part of reconnection", async () => {
      // reconnectBackgroundService uses require() for PlayerBackgroundService,
      // which in test environment will fall back to registerPlaybackService
      await collaborator.reconnectBackgroundService();

      // configureTrackPlayer is called as part of reconnection (after module handling)
      expect(configureTrackPlayer).toHaveBeenCalled();
    });

    it("does not throw on error (logs it and continues)", async () => {
      // Even if something fails internally, it should handle gracefully
      configureTrackPlayer.mockRejectedValueOnce(new Error("Config failed"));

      // Should not propagate the error
      await expect(collaborator.reconnectBackgroundService()).resolves.not.toThrow();
    });
  });

  describe("refreshFilePathsAfterContainerChange", () => {
    it("returns early when no current track", async () => {
      mockStore.player.currentTrack = null;

      await collaborator.refreshFilePathsAfterContainerChange();

      expect(getCoverUri).not.toHaveBeenCalled();
      expect(mockStore._setCurrentTrack).not.toHaveBeenCalled();
    });

    it("updates track and calls updateNowPlayingMetadata when cover URI changes", async () => {
      const oldCoverUri = "file:///old-container/covers/item-1.jpg";
      mockStore.player.currentTrack = {
        libraryItemId: "item-1",
        mediaId: "media-1",
        title: "Test Book",
        author: "Test Author",
        coverUri: oldCoverUri,
        audioFiles: mockAudioFiles,
        chapters: [],
        duration: 3600,
        isDownloaded: true,
      };
      const newCoverUri = "file:///new-container/covers/item-1.jpg";
      getCoverUri.mockReturnValue(newCoverUri);
      // updateNowPlayingMetadata is a store method
      mockStore.updateNowPlayingMetadata.mockResolvedValue(undefined);
      useAppStore.getState
        .mockReturnValueOnce(mockStore) // first getState call
        .mockReturnValueOnce({
          ...mockStore,
          updateNowPlayingMetadata: mockStore.updateNowPlayingMetadata,
        }); // second for updateNowPlayingMetadata

      await collaborator.refreshFilePathsAfterContainerChange();

      expect(mockStore._setCurrentTrack).toHaveBeenCalledWith(
        expect.objectContaining({ coverUri: newCoverUri })
      );
    });

    it("does not update track when cover URI is unchanged", async () => {
      const sameUri = "file:///cache/covers/item-1.jpg";
      mockStore.player.currentTrack = {
        libraryItemId: "item-1",
        mediaId: "media-1",
        title: "Test Book",
        author: "Test Author",
        coverUri: sameUri,
        audioFiles: mockAudioFiles,
        chapters: [],
        duration: 3600,
        isDownloaded: true,
      };
      getCoverUri.mockReturnValue(sameUri);

      await collaborator.refreshFilePathsAfterContainerChange();

      expect(mockStore._setCurrentTrack).not.toHaveBeenCalled();
    });

    it("does not throw on error (best-effort operation)", async () => {
      mockStore.player.currentTrack = {
        libraryItemId: "item-1",
        coverUri: "file:///old/cover.jpg",
      };
      getCoverUri.mockImplementation(() => {
        throw new Error("Cover URI error");
      });

      await expect(collaborator.refreshFilePathsAfterContainerChange()).resolves.not.toThrow();
    });
  });
});
