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
      position: 0,
    },
    _setLastPauseTime: jest.fn(),
    _setTrackLoading: jest.fn(),
    _setCurrentTrack: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockStore.player.currentTrack = null;

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
    it("calls TrackPlayer.play before applySmartRewind", async () => {
      const callOrder: string[] = [];
      mockedTrackPlayer.play.mockImplementation(async () => {
        callOrder.push("play");
      });
      applySmartRewind.mockImplementation(async () => {
        callOrder.push("applySmartRewind");
      });

      await collaborator.executePlay(0);

      expect(callOrder).toEqual(["play", "applySmartRewind"]);
    });

    it("returns the exact smart rewind outcome for coordinator reconciliation", async () => {
      const outcome = { fromPosition: 100, toPosition: 70 };
      applySmartRewind.mockResolvedValue(outcome);

      await expect(collaborator.executePlay(0)).resolves.toEqual(outcome);
    });

    it("clears last pause time after playing", async () => {
      await collaborator.executePlay(0);

      expect(mockStore._setLastPauseTime).toHaveBeenCalledWith(null);
    });

    it("rethrows when play fails without writing to the store directly (Task 3b/3c)", async () => {
      // The store._setTrackLoading(false) write that used to live here was dead:
      // this rejection propagates up through the coordinator's executeTransition,
      // whose catch block dispatches NATIVE_ERROR — the coordinator's NATIVE_ERROR
      // handler clears context.isLoadingTrack itself, and its store bridge pushes
      // that to the store afterward, re-clobbering any direct write made here.
      mockedTrackPlayer.play.mockRejectedValue(new Error("Play failed"));

      await expect(collaborator.executePlay(0)).rejects.toThrow("Play failed");
      expect(mockStore._setTrackLoading).not.toHaveBeenCalled();
    });

    it("rethrows when applySmartRewind fails without writing to the store directly (Task 3b/3c)", async () => {
      applySmartRewind.mockRejectedValue(new Error("Seek failed"));

      await expect(collaborator.executePlay(0)).rejects.toThrow("Seek failed");
      expect(mockedTrackPlayer.play).toHaveBeenCalled();
      expect(mockStore._setTrackLoading).not.toHaveBeenCalled();
    });

    // Task 4c: executePlay takes the coordinator's current position as an
    // explicit parameter instead of reading store.player.position itself — two
    // functions communicating through global state, untied. The coordinator
    // passes context.position at its executePlay call site.
    it("passes the given position to applySmartRewind to prevent streaming race where TrackPlayer.getProgress returns 0", async () => {
      await collaborator.executePlay(20956);

      expect(applySmartRewind).toHaveBeenCalledWith(20956);
    });

    it("passes 0 to applySmartRewind when position is 0 (beginning of book)", async () => {
      await collaborator.executePlay(0);

      expect(applySmartRewind).toHaveBeenCalledWith(0);
    });

    it("ignores store.player.position entirely — only the explicit parameter is used", async () => {
      mockStore.player.position = 999;

      await collaborator.executePlay(42);

      expect(applySmartRewind).toHaveBeenCalledWith(42);
    });

    it("calls applySmartRewind when no meta is passed (default behavior preserved)", async () => {
      await collaborator.executePlay(0);

      expect(applySmartRewind).toHaveBeenCalled();
    });

    it("does NOT call applySmartRewind when skipSmartRewind is true in meta", async () => {
      await collaborator.executePlay(0, { skipSmartRewind: true });

      expect(applySmartRewind).not.toHaveBeenCalled();
    });

    it("calls applySmartRewind when skipSmartRewind is false in meta (explicit false = same as default)", async () => {
      await collaborator.executePlay(0, { skipSmartRewind: false });

      expect(applySmartRewind).toHaveBeenCalled();
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
