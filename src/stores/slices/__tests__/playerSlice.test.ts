/**
 * Tests for player slice
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TrackPlayer from "react-native-track-player";
import { create } from "zustand";
import { ASYNC_KEYS } from "../../../lib/asyncStore";
import { progressService } from "../../../services/ProgressService";
import type { PlayerTrack } from "../../../types/player";
import { createPlayerSlice, PlayerSlice } from "../playerSlice";

// Mock AsyncStorage (pattern matches librarySlice.test.ts)
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock TrackPlayer
jest.mock("react-native-track-player", () => ({
  getQueue: jest.fn(),
  seekTo: jest.fn(),
  getActiveTrackIndex: jest.fn(),
  getActiveTrack: jest.fn(),
  updateMetadataForTrack: jest.fn(),
}));

// Mock ProgressService
jest.mock("../../../services/ProgressService", () => ({
  progressService: {
    getCurrentSession: jest.fn(),
  },
}));

// Mock database helpers
jest.mock("../../../db/helpers/users", () => ({
  getUserByUsername: jest.fn(),
}));

// Mock secure store
jest.mock("../../../lib/secureStore", () => ({
  getStoredUsername: jest.fn(),
}));

// Mock track player config
jest.mock("../../../lib/trackPlayerConfig", () => ({
  configureTrackPlayer: jest.fn(),
}));

describe("PlayerSlice", () => {
  let store: ReturnType<typeof create<PlayerSlice>>;

  // Get mocked functions for type safety
  const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
  const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer>;
  const mockedProgressService = progressService as jest.Mocked<typeof progressService>;
  const { getUserByUsername } = require("../../../db/helpers/users");
  const { getStoredUsername } = require("../../../lib/secureStore");
  const { configureTrackPlayer } = require("../../../lib/trackPlayerConfig");

  // Mock player track data
  const mockPlayerTrack: PlayerTrack = {
    libraryItemId: "item-1",
    mediaId: "media-1",
    title: "Test Book",
    author: "Test Author",
    coverUri: "file:///test-cover.jpg",
    audioFiles: [
      {
        id: "file-1",
        index: 0,
        ino: "1",
        filename: "test.m4b",
        tagTitle: "Test Book",
        duration: 3600,
        downloadInfo: {
          isDownloaded: true,
          downloadPath: "/downloads/test.m4b",
        },
      },
    ],
    chapters: [
      { id: "ch-1", start: 0, end: 1800, title: "Chapter 1" },
      { id: "ch-2", start: 1800, end: 3600, title: "Chapter 2" },
    ],
    duration: 3600,
    isDownloaded: true,
  };

  beforeEach(() => {
    // Create a test store
    store = create<PlayerSlice>()((set, get) => ({
      ...createPlayerSlice(set, get),
    }));

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock implementations
    mockedAsyncStorage.getItem.mockResolvedValue(null);
    mockedAsyncStorage.setItem.mockResolvedValue();
    mockedTrackPlayer.getQueue.mockResolvedValue([]);
    mockedTrackPlayer.seekTo.mockResolvedValue();
    mockedTrackPlayer.getActiveTrackIndex.mockResolvedValue(0);
    mockedTrackPlayer.getActiveTrack.mockResolvedValue(null);
    mockedTrackPlayer.updateMetadataForTrack.mockResolvedValue();
    mockedProgressService.getCurrentSession.mockResolvedValue(null);
    getUserByUsername.mockResolvedValue({ id: "user-1" });
    getStoredUsername.mockResolvedValue("testuser");
    configureTrackPlayer.mockResolvedValue();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Initial State", () => {
    it("should have correct initial state", () => {
      const state = store.getState();

      expect(state.player).toEqual({
        currentTrack: null,
        isPlaying: false,
        position: 0,
        currentChapter: null,
        playbackRate: 1.0,
        volume: 1.0,
        currentPlaySessionId: null,
        lastPauseTime: null,
        isModalVisible: false,
        loading: {
          isLoadingTrack: false,
          isSeeking: false,
        },
        initialized: false,
        isRestoringState: false,
        sleepTimer: {
          endTime: null,
          type: null,
          chapterTarget: null,
        },
      });
    });
  });

  describe("initializePlayerSlice", () => {
    it("should set initialized to true", async () => {
      await store.getState().initializePlayerSlice();

      const state = store.getState();
      expect(state.player.initialized).toBe(true);
    });
  });

  describe("setModalVisible", () => {
    it("should update modal visibility", () => {
      store.getState().setModalVisible(true);
      expect(store.getState().player.isModalVisible).toBe(true);

      store.getState().setModalVisible(false);
      expect(store.getState().player.isModalVisible).toBe(false);
    });
  });

  describe("updatePosition", () => {
    it("should update position and save to AsyncStorage", () => {
      store.getState().updatePosition(100);

      const state = store.getState();
      expect(state.player.position).toBe(100);
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        ASYNC_KEYS.position,
        JSON.stringify(100)
      );
    });

    it("should update current chapter when position changes", () => {
      store.getState()._setCurrentTrack(mockPlayerTrack);
      store.getState().updatePosition(100);

      const state = store.getState();
      expect(state.player.currentChapter).not.toBeNull();
      expect(state.player.currentChapter?.chapter.id).toBe("ch-1");
    });

    it("should update to chapter 2 when position crosses chapter boundary", () => {
      store.getState()._setCurrentTrack(mockPlayerTrack);
      store.getState().updatePosition(2000);

      const state = store.getState();
      expect(state.player.currentChapter?.chapter.id).toBe("ch-2");
    });
  });

  describe("updatePlayingState", () => {
    it("should update playing state and save to AsyncStorage", () => {
      store.getState().updatePlayingState(true);

      const state = store.getState();
      expect(state.player.isPlaying).toBe(true);
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        ASYNC_KEYS.isPlaying,
        JSON.stringify(true)
      );
    });
  });

  describe("_setCurrentTrack", () => {
    it("should set current track and save to AsyncStorage", () => {
      store.getState()._setCurrentTrack(mockPlayerTrack);

      const state = store.getState();
      expect(state.player.currentTrack).toEqual(mockPlayerTrack);
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        ASYNC_KEYS.currentTrack,
        JSON.stringify(mockPlayerTrack)
      );
    });

    it("should reset position to 0 when clearing track", () => {
      store.getState()._setCurrentTrack(mockPlayerTrack);
      store.getState().updatePosition(100);
      store.getState()._setCurrentTrack(null);

      const state = store.getState();
      expect(state.player.currentTrack).toBeNull();
      expect(state.player.position).toBe(0);
      expect(state.player.currentChapter).toBeNull();
    });

    it("should update current chapter after setting track", () => {
      store.getState().updatePosition(100);
      store.getState()._setCurrentTrack(mockPlayerTrack);

      const state = store.getState();
      expect(state.player.currentChapter).not.toBeNull();
      expect(state.player.currentChapter?.chapter.id).toBe("ch-1");
    });
  });

  describe("_setTrackLoading", () => {
    it("should update track loading state", () => {
      store.getState()._setTrackLoading(true);
      expect(store.getState().player.loading.isLoadingTrack).toBe(true);

      store.getState()._setTrackLoading(false);
      expect(store.getState().player.loading.isLoadingTrack).toBe(false);
    });
  });

  describe("_setSeeking", () => {
    it("should update seeking state", () => {
      store.getState()._setSeeking(true);
      expect(store.getState().player.loading.isSeeking).toBe(true);

      store.getState()._setSeeking(false);
      expect(store.getState().player.loading.isSeeking).toBe(false);
    });
  });

  describe("_updateCurrentChapter", () => {
    it("should skip update when isRestoringState is true", () => {
      // Set isRestoringState BEFORE setting track (matches restorePersistedState pattern)
      store.getState().setIsRestoringState(true);
      store.getState()._setCurrentTrack(mockPlayerTrack);

      // Chapter should remain null because _setCurrentTrack's internal call to _updateCurrentChapter was skipped
      expect(store.getState().player.currentChapter).toBeNull();

      // Calling _updateCurrentChapter directly should also be skipped
      store.getState()._updateCurrentChapter(2000);

      const state = store.getState();
      // Chapter should still be null
      expect(state.player.currentChapter).toBeNull();
    });

    it("should update to correct chapter based on position", () => {
      store.getState()._setCurrentTrack(mockPlayerTrack);
      store.getState()._updateCurrentChapter(2000);

      const state = store.getState();
      expect(state.player.currentChapter?.chapter.id).toBe("ch-2");
      expect(state.player.currentChapter?.positionInChapter).toBe(200); // 2000 - 1800
    });

    it("should clamp to last chapter when position exceeds duration", () => {
      store.getState()._setCurrentTrack(mockPlayerTrack);
      store.getState()._updateCurrentChapter(4000);

      const state = store.getState();
      expect(state.player.currentChapter?.chapter.id).toBe("ch-2");
    });

    it("should clamp to first chapter when position is negative", () => {
      store.getState()._setCurrentTrack(mockPlayerTrack);
      store.getState()._updateCurrentChapter(-10);

      const state = store.getState();
      expect(state.player.currentChapter?.chapter.id).toBe("ch-1");
    });

    it("should handle track without chapters", () => {
      const trackWithoutChapters = { ...mockPlayerTrack, chapters: [] };
      store.getState()._setCurrentTrack(trackWithoutChapters);
      store.getState()._updateCurrentChapter(100);

      const state = store.getState();
      expect(state.player.currentChapter).toBeNull();
    });
  });

  describe("_setPlaybackRate", () => {
    it("should update playback rate and save to AsyncStorage", () => {
      store.getState()._setPlaybackRate(1.5);

      const state = store.getState();
      expect(state.player.playbackRate).toBe(1.5);
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        ASYNC_KEYS.playbackRate,
        JSON.stringify(1.5)
      );
    });
  });

  describe("_setVolume", () => {
    it("should update volume and save to AsyncStorage", () => {
      store.getState()._setVolume(0.8);

      const state = store.getState();
      expect(state.player.volume).toBe(0.8);
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        ASYNC_KEYS.volume,
        JSON.stringify(0.8)
      );
    });

    it("should clamp volume to 0-1 range", () => {
      store.getState()._setVolume(1.5);
      expect(store.getState().player.volume).toBe(1.0);

      store.getState()._setVolume(-0.5);
      expect(store.getState().player.volume).toBe(0.0);
    });
  });

  describe("_setPlaySessionId", () => {
    it("should update session ID and save to AsyncStorage", () => {
      store.getState()._setPlaySessionId("session-123");

      const state = store.getState();
      expect(state.player.currentPlaySessionId).toBe("session-123");
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        ASYNC_KEYS.currentPlaySessionId,
        JSON.stringify("session-123")
      );
    });

    it("should clear session ID when set to null", () => {
      store.getState()._setPlaySessionId("session-123");
      store.getState()._setPlaySessionId(null);

      const state = store.getState();
      expect(state.player.currentPlaySessionId).toBeNull();
    });
  });

  describe("_setLastPauseTime", () => {
    it("should update last pause time", () => {
      const now = Date.now();
      store.getState()._setLastPauseTime(now);

      const state = store.getState();
      expect(state.player.lastPauseTime).toBe(now);
    });

    it("should not persist to AsyncStorage", () => {
      const now = Date.now();
      store.getState()._setLastPauseTime(now);

      // AsyncStorage should only be called for other items, not lastPauseTime
      expect(mockedAsyncStorage.setItem).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining(String(now))
      );
    });
  });

  describe("setIsRestoringState", () => {
    it("should update isRestoringState flag", () => {
      store.getState().setIsRestoringState(true);
      expect(store.getState().player.isRestoringState).toBe(true);

      store.getState().setIsRestoringState(false);
      expect(store.getState().player.isRestoringState).toBe(false);
    });
  });

  describe("Sleep Timer", () => {
    describe("setSleepTimer", () => {
      it("should set duration-based sleep timer", () => {
        const beforeTime = Date.now();
        store.getState().setSleepTimer(30);
        const afterTime = Date.now();

        const state = store.getState();
        expect(state.player.sleepTimer.type).toBe("duration");
        expect(state.player.sleepTimer.chapterTarget).toBeNull();
        expect(state.player.sleepTimer.endTime).toBeGreaterThanOrEqual(beforeTime + 30 * 60 * 1000);
        expect(state.player.sleepTimer.endTime).toBeLessThanOrEqual(afterTime + 30 * 60 * 1000);
      });

      it("should save sleep timer to AsyncStorage", () => {
        store.getState().setSleepTimer(15);

        expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
          ASYNC_KEYS.sleepTimer,
          expect.stringContaining('"type":"duration"')
        );
      });
    });

    describe("setSleepTimerChapter", () => {
      it("should set chapter-based sleep timer for current chapter", () => {
        store.getState().setSleepTimerChapter("current");

        const state = store.getState();
        expect(state.player.sleepTimer.type).toBe("chapter");
        expect(state.player.sleepTimer.chapterTarget).toBe("current");
        expect(state.player.sleepTimer.endTime).toBeNull();
      });

      it("should set chapter-based sleep timer for next chapter", () => {
        store.getState().setSleepTimerChapter("next");

        const state = store.getState();
        expect(state.player.sleepTimer.type).toBe("chapter");
        expect(state.player.sleepTimer.chapterTarget).toBe("next");
      });
    });

    describe("cancelSleepTimer", () => {
      it("should clear sleep timer state", () => {
        store.getState().setSleepTimer(30);
        store.getState().cancelSleepTimer();

        const state = store.getState();
        expect(state.player.sleepTimer.type).toBeNull();
        expect(state.player.sleepTimer.endTime).toBeNull();
        expect(state.player.sleepTimer.chapterTarget).toBeNull();
      });

      it("should save cleared timer to AsyncStorage", () => {
        store.getState().setSleepTimer(30);
        jest.clearAllMocks();
        store.getState().cancelSleepTimer();

        expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
          ASYNC_KEYS.sleepTimer,
          expect.stringContaining('"type":null')
        );
      });
    });

    describe("getSleepTimerRemaining", () => {
      it("should return remaining time for duration timer", () => {
        const endTime = Date.now() + 60000; // 60 seconds from now
        store.getState().player.sleepTimer = {
          type: "duration",
          endTime,
          chapterTarget: null,
        };

        const remaining = store.getState().getSleepTimerRemaining();
        expect(remaining).toBeGreaterThan(55); // Should be close to 60s
        expect(remaining).toBeLessThanOrEqual(60);
      });

      it("should return null for expired duration timer", () => {
        const endTime = Date.now() - 1000; // 1 second ago
        store.getState().player.sleepTimer = {
          type: "duration",
          endTime,
          chapterTarget: null,
        };

        const remaining = store.getState().getSleepTimerRemaining();
        expect(remaining).toBe(0); // Clamped to 0
      });

      it("should return remaining time for current chapter timer", () => {
        store.getState()._setCurrentTrack(mockPlayerTrack);
        store.getState().updatePosition(100); // Chapter 1, which ends at 1800
        store.getState().player.sleepTimer = {
          type: "chapter",
          endTime: null,
          chapterTarget: "current",
        };

        const remaining = store.getState().getSleepTimerRemaining();
        expect(remaining).toBe(1700); // 1800 - 100
      });

      it("should return remaining time for next chapter timer", () => {
        store.getState()._setCurrentTrack(mockPlayerTrack);
        store.getState().updatePosition(100); // Chapter 1
        store.getState().player.sleepTimer = {
          type: "chapter",
          endTime: null,
          chapterTarget: "next",
        };

        const remaining = store.getState().getSleepTimerRemaining();
        expect(remaining).toBe(3500); // 3600 (ch2 end) - 100
      });

      it("should return null when no timer is set", () => {
        const remaining = store.getState().getSleepTimerRemaining();
        expect(remaining).toBeNull();
      });
    });
  });

  describe("updateNowPlayingMetadata", () => {
    it("should update TrackPlayer metadata with chapter info", async () => {
      store.getState()._setCurrentTrack(mockPlayerTrack);
      store.getState().updatePosition(100);

      mockedTrackPlayer.getActiveTrackIndex.mockResolvedValue(0);
      mockedTrackPlayer.getActiveTrack.mockResolvedValue({ id: "track-1", title: "Test" });

      await store.getState().updateNowPlayingMetadata();

      expect(mockedTrackPlayer.updateMetadataForTrack).toHaveBeenCalledWith(
        0,
        expect.objectContaining({
          title: "Chapter 1",
          artist: "Test Author",
          album: "Test Book",
          artwork: "file:///test-cover.jpg",
          duration: 1800,
          elapsedTime: 100,
        })
      );
    });

    it("should skip update when no track is loaded", async () => {
      await store.getState().updateNowPlayingMetadata();

      expect(mockedTrackPlayer.updateMetadataForTrack).not.toHaveBeenCalled();
    });

    it("should skip update when no chapter is set", async () => {
      const trackWithoutChapters = { ...mockPlayerTrack, chapters: [] };
      store.getState()._setCurrentTrack(trackWithoutChapters);

      await store.getState().updateNowPlayingMetadata();

      expect(mockedTrackPlayer.updateMetadataForTrack).not.toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      store.getState()._setCurrentTrack(mockPlayerTrack);
      store.getState().updatePosition(100);

      mockedTrackPlayer.getActiveTrackIndex.mockRejectedValue(new Error("TrackPlayer error"));

      await expect(store.getState().updateNowPlayingMetadata()).resolves.not.toThrow();
    });

    it("should reconfigure TrackPlayer after metadata update", async () => {
      store.getState()._setCurrentTrack(mockPlayerTrack);
      store.getState().updatePosition(100);

      mockedTrackPlayer.getActiveTrackIndex.mockResolvedValue(0);
      mockedTrackPlayer.getActiveTrack.mockResolvedValue({ id: "track-1", title: "Test" });

      await store.getState().updateNowPlayingMetadata();

      expect(configureTrackPlayer).toHaveBeenCalled();
    });
  });

  describe("restorePersistedState", () => {
    it("should restore state from AsyncStorage", async () => {
      mockedAsyncStorage.getItem.mockImplementation((key: string) => {
        switch (key) {
          case ASYNC_KEYS.currentTrack:
            return Promise.resolve(JSON.stringify(mockPlayerTrack));
          case ASYNC_KEYS.playbackRate:
            return Promise.resolve(JSON.stringify(1.5));
          case ASYNC_KEYS.volume:
            return Promise.resolve(JSON.stringify(0.8));
          case ASYNC_KEYS.position:
            return Promise.resolve(JSON.stringify(300));
          case ASYNC_KEYS.isPlaying:
            return Promise.resolve(JSON.stringify(true));
          case ASYNC_KEYS.currentPlaySessionId:
            return Promise.resolve(JSON.stringify("session-123"));
          default:
            return Promise.resolve(null);
        }
      });

      await store.getState().restorePersistedState();

      const state = store.getState();
      expect(state.player.currentTrack).toEqual(mockPlayerTrack);
      expect(state.player.playbackRate).toBe(1.5);
      expect(state.player.volume).toBe(0.8);
      expect(state.player.position).toBe(300);
      expect(state.player.isPlaying).toBe(true);
      expect(state.player.currentPlaySessionId).toBe("session-123");
    });

    it("should set and clear isRestoringState flag", async () => {
      await store.getState().restorePersistedState();

      // Should be false after restoration completes
      expect(store.getState().player.isRestoringState).toBe(false);
    });

    it("should restore valid sleep timer", async () => {
      const futureTime = Date.now() + 60000;
      const sleepTimer = {
        type: "duration",
        endTime: futureTime,
        chapterTarget: null,
      };

      mockedAsyncStorage.getItem.mockImplementation((key: string) => {
        if (key === ASYNC_KEYS.sleepTimer) {
          return Promise.resolve(JSON.stringify(sleepTimer));
        }
        return Promise.resolve(null);
      });

      await store.getState().restorePersistedState();

      const state = store.getState();
      expect(state.player.sleepTimer.type).toBe("duration");
      expect(state.player.sleepTimer.endTime).toBe(futureTime);
    });

    it("should not restore expired sleep timer", async () => {
      const pastTime = Date.now() - 60000;
      const sleepTimer = {
        type: "duration",
        endTime: pastTime,
        chapterTarget: null,
      };

      mockedAsyncStorage.getItem.mockImplementation((key: string) => {
        if (key === ASYNC_KEYS.sleepTimer) {
          return Promise.resolve(JSON.stringify(sleepTimer));
        }
        return Promise.resolve(null);
      });

      await store.getState().restorePersistedState();

      const state = store.getState();
      // Should not restore expired timer
      expect(state.player.sleepTimer.type).toBeNull();
    });

    it("should reconcile with database session when track is already loaded", async () => {
      // NOTE: Due to a limitation in the current implementation, DB reconciliation
      // only works if currentTrack is already in the store before calling restorePersistedState.
      // This is because restorePersistedState captures `const store = get()` once at the beginning,
      // and later accesses to store.player.currentTrack use that stale reference.
      // To test DB reconciliation, we need to pre-load the track into the store.

      const dbSession = {
        sessionId: "session-db",
        libraryItemId: "item-1",
        mediaId: "media-1",
        startTime: 0,
        currentTime: 500, // Different from AsyncStorage
        duration: 3600,
        isDownloaded: true,
      };

      // Pre-load the track into the store so DB reconciliation can find it
      store.getState()._setCurrentTrack(mockPlayerTrack);

      // Mock AsyncStorage to return position 300
      mockedAsyncStorage.getItem
        .mockResolvedValueOnce(null) // currentTrack (already loaded)
        .mockResolvedValueOnce(null) // playbackRate
        .mockResolvedValueOnce(null) // volume
        .mockResolvedValueOnce(JSON.stringify(300)) // position
        .mockResolvedValueOnce(null) // isPlaying
        .mockResolvedValueOnce(null) // currentPlaySessionId
        .mockResolvedValueOnce(null); // sleepTimer

      mockedProgressService.getCurrentSession.mockResolvedValue(dbSession);

      await store.getState().restorePersistedState();

      // Verify DB reconciliation was called
      expect(getStoredUsername).toHaveBeenCalled();
      expect(getUserByUsername).toHaveBeenCalledWith("testuser");
      expect(mockedProgressService.getCurrentSession).toHaveBeenCalledWith("user-1", "item-1");

      const state = store.getState();
      // Should use DB position (source of truth)
      expect(state.player.position).toBe(500);
    });

    it("should handle DB reconciliation errors gracefully", async () => {
      mockedAsyncStorage.getItem.mockResolvedValue(null);
      mockedProgressService.getCurrentSession.mockRejectedValue(new Error("DB error"));

      await expect(store.getState().restorePersistedState()).resolves.not.toThrow();
    });

    it("should not update chapter during state restoration when TrackPlayer queue is empty", async () => {
      // This test prevents a regression where the UI would show a stale chapter during restoration
      // because the chapter was calculated before the TrackPlayer queue was rebuilt.

      // Mock empty TrackPlayer queue (simulates JS context recreation)
      mockedTrackPlayer.getQueue.mockResolvedValue([]);

      // Mock AsyncStorage with track and position that should be in Chapter 2 (1800-3600s)
      mockedAsyncStorage.getItem.mockImplementation((key: string) => {
        switch (key) {
          case ASYNC_KEYS.currentTrack:
            return Promise.resolve(JSON.stringify(mockPlayerTrack));
          case ASYNC_KEYS.position:
            return Promise.resolve(JSON.stringify(2000)); // Position in Chapter 2
          default:
            return Promise.resolve(null);
        }
      });

      await store.getState().restorePersistedState();

      const state = store.getState();
      // Chapter should NOT be updated during restoration when TrackPlayer queue is empty
      // It will be correctly updated when the queue is rebuilt (e.g., when user presses play)
      expect(state.player.currentChapter).toBeNull();
      expect(state.player.currentTrack).toEqual(mockPlayerTrack);
      expect(state.player.position).toBe(2000);
    });
  });
});
