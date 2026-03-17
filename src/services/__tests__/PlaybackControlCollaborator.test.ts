/**
 * Tests for PlaybackControlCollaborator
 *
 * Collaborator concern: executePlay, executePause, executeStop,
 *                        executeSeek, executeSetRate, executeSetVolume.
 *
 * Mock setup needed:
 *   - react-native-track-player
 *   - @/lib/smartRewind
 *   - @/stores/appStore
 *   - mockFacade.dispatchEvent (injected)
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import TrackPlayer from "react-native-track-player";
import type { IPlayerServiceFacade } from "@/services/player/types";
import { PlaybackControlCollaborator } from "@/services/player/PlaybackControlCollaborator";

// --- Mocks ---

jest.mock("react-native-track-player", () => ({
  play: jest.fn(),
  pause: jest.fn(),
  stop: jest.fn(),
  reset: jest.fn(),
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

jest.mock("@/lib/smartRewind", () => ({
  applySmartRewind: jest.fn(),
}));

jest.mock("@/stores/appStore", () => ({
  useAppStore: {
    getState: jest.fn(),
  },
}));

jest.mock("@/services/coordinator/eventBus", () => ({
  dispatchPlayerEvent: jest.fn(),
}));

describe("PlaybackControlCollaborator", () => {
  const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer>;
  const { applySmartRewind } = require("@/lib/smartRewind");
  const { useAppStore } = require("@/stores/appStore");

  let collaborator: PlaybackControlCollaborator;
  let mockFacade: IPlayerServiceFacade;

  const mockStore = {
    player: {
      currentTrack: null as any,
    },
    _setLastPauseTime: jest.fn(),
    _setTrackLoading: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockStore.player.currentTrack = null;

    mockFacade = {
      dispatchEvent: jest.fn(),
      getApiInfo: jest.fn().mockReturnValue({ baseUrl: "http://test", accessToken: "tok123" }),
      getInitializationTimestamp: jest.fn().mockReturnValue(Date.now()),
      executeRebuildQueue: jest.fn(),
      resolveCanonicalPosition: jest.fn().mockResolvedValue({
        position: 0,
        source: "store",
        authoritativePosition: null,
        asyncStoragePosition: null,
      }),
    };

    collaborator = new PlaybackControlCollaborator(mockFacade);

    mockedTrackPlayer.play.mockResolvedValue();
    mockedTrackPlayer.pause.mockResolvedValue();
    mockedTrackPlayer.stop.mockResolvedValue();
    mockedTrackPlayer.reset.mockResolvedValue();
    mockedTrackPlayer.seekTo.mockResolvedValue();
    mockedTrackPlayer.setRate.mockResolvedValue();
    mockedTrackPlayer.setVolume.mockResolvedValue();
    applySmartRewind.mockResolvedValue(undefined);
    useAppStore.getState.mockReturnValue(mockStore);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("executePlay", () => {
    it("applies smart rewind and calls TrackPlayer.play", async () => {
      await collaborator.executePlay();

      expect(applySmartRewind).toHaveBeenCalled();
      expect(mockedTrackPlayer.play).toHaveBeenCalled();
    });

    it("clears last pause time before playing", async () => {
      await collaborator.executePlay();

      expect(mockStore._setLastPauseTime).toHaveBeenCalledWith(null);
    });

    it("clears track loading state on error and rethrows", async () => {
      mockedTrackPlayer.play.mockRejectedValue(new Error("Play failed"));

      await expect(collaborator.executePlay()).rejects.toThrow("Play failed");
      expect(mockStore._setTrackLoading).toHaveBeenCalledWith(false);
    });
  });

  describe("executePause", () => {
    it("calls TrackPlayer.pause and records pause time", async () => {
      await collaborator.executePause();

      expect(mockedTrackPlayer.pause).toHaveBeenCalled();
      expect(mockStore._setLastPauseTime).toHaveBeenCalledWith(expect.any(Number));
    });
  });

  describe("executeStop", () => {
    it("calls TrackPlayer.stop and TrackPlayer.reset", async () => {
      await collaborator.executeStop();

      expect(mockedTrackPlayer.stop).toHaveBeenCalled();
      expect(mockedTrackPlayer.reset).toHaveBeenCalled();
    });

    it("does not call _setCurrentTrack (coordinator bridge handles that)", async () => {
      const mockSetCurrentTrack = jest.fn();
      mockStore._setCurrentTrack = mockSetCurrentTrack;

      await collaborator.executeStop();

      // _setCurrentTrack(null) removed from executeStop — coordinator bridge syncs state
      expect(mockSetCurrentTrack).not.toHaveBeenCalled();
    });
  });

  describe("executeSeek", () => {
    it("calls TrackPlayer.seekTo with the given position", async () => {
      await collaborator.executeSeek(123);

      expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(123);
    });

    it("dispatches SEEK_COMPLETE via facade after seeking", async () => {
      await collaborator.executeSeek(50);

      expect(mockFacade.dispatchEvent).toHaveBeenCalledWith({ type: "SEEK_COMPLETE" });
    });
  });

  describe("executeSetRate", () => {
    it("calls TrackPlayer.setRate with the given rate", async () => {
      await collaborator.executeSetRate(1.5);

      expect(mockedTrackPlayer.setRate).toHaveBeenCalledWith(1.5);
    });
  });

  describe("executeSetVolume", () => {
    it("calls TrackPlayer.setVolume with the given volume", async () => {
      await collaborator.executeSetVolume(0.8);

      expect(mockedTrackPlayer.setVolume).toHaveBeenCalledWith(0.8);
    });
  });
});
