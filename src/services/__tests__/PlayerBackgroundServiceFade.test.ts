/**
 * TDD RED stubs — Sleep Timer Volume Fade (SLEEP-01)
 *
 * Tests the fade logic that will be added to PlayerBackgroundService.ts's
 * handlePlaybackProgressUpdated function.
 *
 * These tests FAIL in RED state because the fade logic does not yet exist in
 * PlayerBackgroundService. Plans 03/04 will make them GREEN.
 *
 * Mocking strategy:
 *  - useAppStore.getState() returns controllable sleepTimer + player.volume state
 *  - playerService.executeSetVolume is a jest.fn() — only volume-changing call allowed during fade
 *  - TrackPlayer.getPlaybackState() returns State.Playing
 *  - store._setVolume is NOT mocked — test verifies it is NOT called during fade
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import TrackPlayer, { State } from "react-native-track-player";

// --- Mocks ---

jest.mock("@/stores/appStore", () => ({
  useAppStore: {
    getState: jest.fn(),
  },
}));

jest.mock("@/services/PlayerService", () => ({
  playerService: {
    executeSetVolume: jest.fn(),
  },
}));

jest.mock("@/services/coordinator/eventBus", () => ({
  dispatchPlayerEvent: jest.fn(),
}));

jest.mock("@/services/ProgressService", () => ({
  progressService: {
    getCurrentSession: jest.fn().mockResolvedValue(null),
    updateProgress: jest.fn().mockResolvedValue(undefined),
    shouldSyncToServer: jest.fn().mockResolvedValue({ shouldSync: false }),
  },
}));

jest.mock("@/db/helpers/localData", () => ({
  updateAudioFileLastAccessed: jest.fn(),
}));

jest.mock("@/utils/userHelpers", () => ({
  getCurrentUser: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/services/coordinator/PlayerStateCoordinator", () => ({
  getCoordinator: jest.fn(),
}));

// --- Helpers ---

const FADE_WINDOW_SECONDS = 30;

/**
 * Build a mock store state with the given sleep timer and volume settings.
 */
function buildStoreState(overrides: {
  sleepTimerType?: "duration" | "chapter" | null;
  sleepTimerEndTime?: number | null;
  volume?: number;
  currentTrack?: object | null;
  sleepTimerRemaining?: number | null;
  isPlaying?: boolean;
}) {
  const {
    sleepTimerType = "duration",
    sleepTimerEndTime = null,
    volume = 1.0,
    currentTrack = null,
    sleepTimerRemaining = null,
    isPlaying: _isPlaying = true,
  } = overrides;

  return {
    player: {
      volume,
      sleepTimer: {
        type: sleepTimerType,
        endTime: sleepTimerEndTime,
        chapterTarget: null,
      },
      currentTrack,
      currentChapter: null,
      isPlaying: _isPlaying,
      currentPlaySessionId: null,
    },
    getSleepTimerRemaining: jest.fn().mockReturnValue(sleepTimerRemaining),
    cancelSleepTimer: jest.fn(),
    _setVolume: jest.fn(),
    _setLastPauseTime: jest.fn(),
  };
}

describe("sleep timer volume fade", () => {
  let mockUseAppStore: ReturnType<typeof jest.fn>;
  let mockExecuteSetVolume: ReturnType<typeof jest.fn>;
  let mockDispatchPlayerEvent: ReturnType<typeof jest.fn>;
  let handlePlaybackProgressUpdated: (event: {
    position: number;
    duration: number;
    buffered: number;
  }) => Promise<void>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Access mocked modules
    const { useAppStore } = require("@/stores/appStore");
    const { playerService } = require("@/services/PlayerService");
    const { dispatchPlayerEvent } = require("@/services/coordinator/eventBus");

    mockUseAppStore = useAppStore.getState;
    mockExecuteSetVolume = playerService.executeSetVolume;
    mockDispatchPlayerEvent = dispatchPlayerEvent;

    // Reset TrackPlayer mock to return Playing state
    (TrackPlayer.getPlaybackState as ReturnType<typeof jest.fn>).mockResolvedValue({
      state: State.Playing,
    });
    (TrackPlayer.getRate as ReturnType<typeof jest.fn>).mockResolvedValue(1.0);
    (TrackPlayer.getVolume as ReturnType<typeof jest.fn>).mockResolvedValue(1.0);

    // Import the function under test — will fail until fade logic is added
    // This import is deliberately placed here so RED fails at runtime, not at module load
    const bgService = require("@/services/PlayerBackgroundService");
    // The fade handler is not exported directly; we test it by calling the module's
    // registered PlaybackProgressUpdated handler through a thin shim.
    // Plan 03 will export a testable handlePlaybackProgressUpdated function.
    // For now, access via the module's internal export shim:
    handlePlaybackProgressUpdated = bgService._testHandlePlaybackProgressUpdated;
  });

  afterEach(() => {
    jest.resetModules();
  });

  it("test 1 (fade starts): when remaining <= 30s and playing, executeSetVolume is called with value < pre-fade volume", async () => {
    const storeState = buildStoreState({
      sleepTimerType: "duration",
      volume: 1.0,
      sleepTimerRemaining: 20, // 20s remaining — inside 30s fade window
    });
    mockUseAppStore.mockReturnValue(storeState);

    expect(handlePlaybackProgressUpdated).toBeDefined();
    await handlePlaybackProgressUpdated({ position: 100, duration: 3600, buffered: 200 });

    expect(mockExecuteSetVolume).toHaveBeenCalled();
    const calledVolume = mockExecuteSetVolume.mock.calls[0][0] as number;
    expect(calledVolume).toBeLessThan(1.0);
    expect(calledVolume).toBeGreaterThan(0);
  });

  it("test 2 (linear fade): at 15s remaining (50% of 30s window), executeSetVolume called with 50% of pre-fade volume", async () => {
    const preFadeVolume = 1.0;
    const storeState = buildStoreState({
      sleepTimerType: "duration",
      volume: preFadeVolume,
      sleepTimerRemaining: 15, // exactly 50% of fade window
    });
    mockUseAppStore.mockReturnValue(storeState);

    expect(handlePlaybackProgressUpdated).toBeDefined();
    await handlePlaybackProgressUpdated({ position: 100, duration: 3600, buffered: 200 });

    expect(mockExecuteSetVolume).toHaveBeenCalled();
    const calledVolume = mockExecuteSetVolume.mock.calls[0][0] as number;
    expect(calledVolume).toBeCloseTo(preFadeVolume * (15 / FADE_WINDOW_SECONDS), 5);
  });

  it("test 3 (fade cancel): when sleepTimer.type changes to null mid-fade, executeSetVolume restores to pre-fade value", async () => {
    // First tick: enter fade window, capture _preFadeVolume
    const preFadeVolume = 0.8;
    const fadingState = buildStoreState({
      sleepTimerType: "duration",
      volume: preFadeVolume,
      sleepTimerRemaining: 10,
    });
    mockUseAppStore.mockReturnValue(fadingState);

    expect(handlePlaybackProgressUpdated).toBeDefined();
    await handlePlaybackProgressUpdated({ position: 100, duration: 3600, buffered: 200 });

    // Reset calls, then simulate timer cancel (type becomes null)
    mockExecuteSetVolume.mockClear();
    const cancelledState = buildStoreState({
      sleepTimerType: null,
      volume: preFadeVolume,
      sleepTimerRemaining: null,
    });
    mockUseAppStore.mockReturnValue(cancelledState);

    await handlePlaybackProgressUpdated({ position: 101, duration: 3600, buffered: 201 });

    // Should restore to the pre-fade volume
    expect(mockExecuteSetVolume).toHaveBeenCalledWith(preFadeVolume);
  });

  it("test 4 (volume not stored): during fade, store._setVolume is NOT called — visual display does not change", async () => {
    const storeState = buildStoreState({
      sleepTimerType: "duration",
      volume: 1.0,
      sleepTimerRemaining: 20,
    });
    mockUseAppStore.mockReturnValue(storeState);

    expect(handlePlaybackProgressUpdated).toBeDefined();
    await handlePlaybackProgressUpdated({ position: 100, duration: 3600, buffered: 200 });

    // _setVolume on the store should NOT be called during fade
    expect(storeState._setVolume).not.toHaveBeenCalled();
  });

  it("test 5 (chapter timer): uses getSleepTimerRemaining() not sleepTimer.endTime — fade works for chapter-based timers", async () => {
    const storeState = buildStoreState({
      sleepTimerType: "chapter",
      sleepTimerEndTime: null, // chapter timers have no endTime
      volume: 1.0,
      sleepTimerRemaining: 15, // getSleepTimerRemaining returns 15s for chapter-based
    });
    mockUseAppStore.mockReturnValue(storeState);

    expect(handlePlaybackProgressUpdated).toBeDefined();
    await handlePlaybackProgressUpdated({ position: 100, duration: 3600, buffered: 200 });

    // Should still fade even though endTime is null — uses getSleepTimerRemaining
    expect(mockExecuteSetVolume).toHaveBeenCalled();
    const calledVolume = mockExecuteSetVolume.mock.calls[0][0] as number;
    expect(calledVolume).toBeLessThan(1.0);
  });

  it("test 6 (stop restore): when shouldPause fires at timer expiry, executeSetVolume is called with pre-fade volume before PAUSE is dispatched", async () => {
    // First: enter fade window to capture _preFadeVolume
    const preFadeVolume = 1.0;
    const fadingState = buildStoreState({
      sleepTimerType: "duration",
      volume: preFadeVolume,
      sleepTimerEndTime: Date.now() + 5000, // 5s from now
      sleepTimerRemaining: 5,
    });
    mockUseAppStore.mockReturnValue(fadingState);

    expect(handlePlaybackProgressUpdated).toBeDefined();
    await handlePlaybackProgressUpdated({ position: 100, duration: 3600, buffered: 200 });

    // Now simulate timer expiry (shouldPause = true)
    mockExecuteSetVolume.mockClear();
    mockDispatchPlayerEvent.mockClear();

    const expiredState = buildStoreState({
      sleepTimerType: "duration",
      sleepTimerEndTime: Date.now() - 1, // in the past — timer expired
      volume: preFadeVolume,
      sleepTimerRemaining: 0,
    });
    mockUseAppStore.mockReturnValue(expiredState);

    await handlePlaybackProgressUpdated({ position: 105, duration: 3600, buffered: 205 });

    // executeSetVolume should be called with pre-fade volume before PAUSE is dispatched
    const setVolumeCallOrder = mockExecuteSetVolume.mock.invocationCallOrder[0];
    const pauseCallOrder = mockDispatchPlayerEvent.mock.calls.findIndex(
      (args: unknown[]) => (args[0] as { type: string })?.type === "PAUSE"
    );
    expect(mockExecuteSetVolume).toHaveBeenCalledWith(preFadeVolume);
    expect(pauseCallOrder).toBeGreaterThanOrEqual(0);
    // Volume restore happens before (or at same time as) PAUSE dispatch
    const pauseInvocation = mockDispatchPlayerEvent.mock.invocationCallOrder[pauseCallOrder];
    expect(setVolumeCallOrder).toBeLessThanOrEqual(pauseInvocation);
  });

  it("test 7 (no fade when timer inactive): when sleepTimer.type is null, executeSetVolume is not called for fade", async () => {
    const storeState = buildStoreState({
      sleepTimerType: null,
      volume: 1.0,
      sleepTimerRemaining: null,
    });
    mockUseAppStore.mockReturnValue(storeState);

    expect(handlePlaybackProgressUpdated).toBeDefined();
    await handlePlaybackProgressUpdated({ position: 100, duration: 3600, buffered: 200 });

    expect(mockExecuteSetVolume).not.toHaveBeenCalled();
  });

  it("test 8 (outside fade window): when remaining > 30s, no fade occurs — volume not changed", async () => {
    const storeState = buildStoreState({
      sleepTimerType: "duration",
      volume: 1.0,
      sleepTimerRemaining: 60, // 60s remaining — outside 30s fade window
    });
    mockUseAppStore.mockReturnValue(storeState);

    expect(handlePlaybackProgressUpdated).toBeDefined();
    await handlePlaybackProgressUpdated({ position: 100, duration: 3600, buffered: 200 });

    expect(mockExecuteSetVolume).not.toHaveBeenCalled();
  });
});
