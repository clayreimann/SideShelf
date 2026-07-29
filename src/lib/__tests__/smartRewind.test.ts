import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import TrackPlayer from "react-native-track-player";
import { applySmartRewind } from "../smartRewind";

jest.mock("@/lib/appSettings", () => ({
  calculateSmartRewindTime: jest.fn(),
  getSmartRewindEnabled: jest.fn(),
}));

jest.mock("@/stores/appStore", () => ({
  useAppStore: {
    getState: jest.fn(),
  },
}));

jest.mock("react-native-track-player", () => ({
  getProgress: jest.fn(),
  seekTo: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    forTag: () => ({ info: jest.fn(), error: jest.fn() }),
  },
}));

jest.mock("@/lib/trace", () => ({
  trace: {
    startSpan: jest.fn(() => ({})),
    endSpan: jest.fn(),
    recordError: jest.fn(),
  },
}));

describe("applySmartRewind", () => {
  const { calculateSmartRewindTime, getSmartRewindEnabled } = require("@/lib/appSettings");
  const { useAppStore } = require("@/stores/appStore");
  const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer>;
  const store = {
    player: {
      lastPauseTime: Date.now() - 30 * 60 * 1000,
      currentTrack: null,
    },
    updatePosition: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    store.player.lastPauseTime = Date.now() - 30 * 60 * 1000;
    getSmartRewindEnabled.mockResolvedValue(true);
    calculateSmartRewindTime.mockReturnValue(30);
    mockedTrackPlayer.seekTo.mockResolvedValue();
    useAppStore.getState.mockReturnValue(store);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns the exact 30-second seek outcome after applying smart rewind", async () => {
    await expect(applySmartRewind(100)).resolves.toEqual({ fromPosition: 100, toPosition: 70 });
    expect(mockedTrackPlayer.seekTo).toHaveBeenCalledWith(70);
  });
});
