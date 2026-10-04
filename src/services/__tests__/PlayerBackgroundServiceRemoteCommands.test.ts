/**
 * Remote lock-screen command regressions.
 *
 * The background service runs headlessly, so these tests invoke its real internal
 * handlers via the established test shim while native boundaries stay mocked.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { waitFor } from "@testing-library/react-native";
import TrackPlayer, { State } from "react-native-track-player";
import { dispatchPlayerEvent } from "@/services/coordinator/eventBus";
import type { PlayerTrack } from "@/types/player";

jest.mock("@/stores/appStore", () => ({
  useAppStore: {
    getState: jest.fn(),
  },
}));

jest.mock("@/services/coordinator/eventBus", () => ({
  dispatchPlayerEvent: jest.fn(),
}));

jest.mock("@/services/coordinator/PlayerStateCoordinator", () => ({
  getCoordinator: jest.fn(),
}));

jest.mock("@/services/ProgressService", () => ({
  progressService: {
    getCurrentSession: jest.fn(),
    updateProgress: jest.fn(),
  },
}));

jest.mock("@/services/PlayerService", () => ({
  playerService: {
    executeSeek: jest.fn(),
    executeSetVolume: jest.fn(),
  },
}));

jest.mock("@/db/helpers/localData", () => ({
  updateAudioFileLastAccessed: jest.fn(),
}));

jest.mock("@/utils/userHelpers", () => ({
  getCurrentUser: jest.fn(),
}));

type RemoteSeekHandler = (event: { position: number }) => Promise<void>;
type RemoteJumpHandler = (event: { interval: number }) => Promise<void>;
type RelativeJumpResolutionMeta = {
  onRelativeSeekResolved?: (position: number) => Promise<void> | void;
};

const currentTrack: PlayerTrack = {
  libraryItemId: "item-1",
  mediaId: "media-1",
  title: "Test Book",
  author: "Test Author",
  coverUri: "file:///test-cover.jpg",
  duration: 3600,
  isDownloaded: true,
  chapters: [
    { id: "ch-1", chapterId: 1, title: "Chapter 1", start: 0, end: 1800, mediaId: "media-1" },
    { id: "ch-2", chapterId: 2, title: "Chapter 2", start: 1800, end: 3600, mediaId: "media-1" },
  ],
  audioFiles: [],
};

describe("PlayerBackgroundService remote commands", () => {
  let handleRemoteSeek: RemoteSeekHandler;
  let handleRemoteJumpForward: RemoteJumpHandler;
  let handleRemoteJumpBackward: RemoteJumpHandler;

  beforeEach(() => {
    jest.clearAllMocks();

    require("@/stores/appStore").useAppStore.getState.mockReturnValue({
      player: { currentTrack },
    });
    require("@/utils/userHelpers").getCurrentUser.mockResolvedValue({ id: "user-1" });
    require("@/services/ProgressService").progressService.getCurrentSession.mockResolvedValue(null);
    require("@/services/ProgressService").progressService.updateProgress.mockResolvedValue(
      undefined
    );
    jest.mocked(TrackPlayer.getProgress).mockResolvedValue({
      position: 1900,
      duration: 3600,
      buffered: 1900,
    });
    jest.mocked(TrackPlayer.getRate).mockResolvedValue(1);
    jest.mocked(TrackPlayer.getVolume).mockResolvedValue(1);
    jest.mocked(TrackPlayer.getPlaybackState).mockResolvedValue({ state: State.Playing });

    const backgroundService = require("@/services/PlayerBackgroundService") as {
      _testHandleRemoteSeek?: RemoteSeekHandler;
      _testHandleRemoteJumpForward?: RemoteJumpHandler;
      _testHandleRemoteJumpBackward?: RemoteJumpHandler;
    };
    handleRemoteSeek = backgroundService._testHandleRemoteSeek!;
    handleRemoteJumpForward = backgroundService._testHandleRemoteJumpForward!;
    handleRemoteJumpBackward = backgroundService._testHandleRemoteJumpBackward!;
  });

  it("converts a chapter-relative remote seek before dispatching and persisting progress", async () => {
    await handleRemoteSeek({ position: 120 });

    expect(TrackPlayer.getProgress).toHaveBeenCalledTimes(1);
    expect(require("@/services/coordinator/eventBus").dispatchPlayerEvent).toHaveBeenCalledWith(
      { type: "SEEK", payload: { position: 1920 } },
      {
        source: "remote_command",
        jump: { surface: "lock_screen", category: "scrub" },
      }
    );
    expect(
      require("@/services/ProgressService").progressService.updateProgress
    ).toHaveBeenCalledWith("user-1", "item-1", 1920, 1, 1, undefined, true);
  });

  it("records remote forward skips as lock-screen forward jumps", async () => {
    await handleRemoteJumpForward({ interval: 30 });

    expect(require("@/services/coordinator/eventBus").dispatchPlayerEvent).toHaveBeenCalledWith(
      { type: "JUMP_FORWARD", payload: { seconds: 30 } },
      expect.objectContaining({
        source: "remote_command",
        jump: { surface: "lock_screen", category: "skip_forward" },
      })
    );
    expect(TrackPlayer.getProgress).not.toHaveBeenCalled();
  });

  it("records remote backward skips as lock-screen backward jumps", async () => {
    await handleRemoteJumpBackward({ interval: 30 });

    expect(require("@/services/coordinator/eventBus").dispatchPlayerEvent).toHaveBeenCalledWith(
      { type: "JUMP_BACKWARD", payload: { seconds: 30 } },
      expect.objectContaining({
        source: "remote_command",
        jump: { surface: "lock_screen", category: "skip_backward" },
      })
    );
    expect(TrackPlayer.getProgress).not.toHaveBeenCalled();
  });

  it("persists the resolved +2:00 target after four rapid forward commands", async () => {
    let resolvedPosition = 100;
    jest.mocked(dispatchPlayerEvent).mockImplementation((event, meta) => {
      if (event.type !== "JUMP_FORWARD") {
        return;
      }
      resolvedPosition += event.payload.seconds;
      const resolutionMeta = meta as typeof meta & RelativeJumpResolutionMeta;
      void resolutionMeta?.onRelativeSeekResolved?.(resolvedPosition);
    });

    await Promise.all([
      handleRemoteJumpForward({ interval: 30 }),
      handleRemoteJumpForward({ interval: 30 }),
      handleRemoteJumpForward({ interval: 30 }),
      handleRemoteJumpForward({ interval: 30 }),
    ]);

    await waitFor(() => {
      expect(
        require("@/services/ProgressService").progressService.updateProgress
      ).toHaveBeenCalledTimes(4);
    });
    expect(
      require("@/services/ProgressService").progressService.updateProgress
    ).toHaveBeenLastCalledWith("user-1", "item-1", 220, 1, 1, undefined, true);
    expect(TrackPlayer.getProgress).not.toHaveBeenCalled();
  });
});
