/**
 * Tests for ProgressService — Brief H: named constants, wall-clock throttle,
 * hot-path session cache, lifecycle (initialize/shutdown), dispatch source.
 *
 * Behavioral coverage:
 *  1. Wall-clock throttling of SESSION_UPDATED dispatch (was media-position % 10)
 *  2. Staleness boundary in updateProgress (just under / just over PAUSE_TIMEOUT)
 *  3. Staleness unification in startSession (12-min-old session resumes; the old
 *     10-minute inline literal would have ended it)
 *  4. Active-session cache in updateProgress (one query per session, invalidated
 *     on end / rehydrate / stale detection)
 *  5. initialize()/shutdown() idempotent lifecycle for periodic background sync
 *  6. dispatchPlayerEvent source metadata is "progress_service"
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { LocalListeningSessionRow } from "@/db/schema/localData";

// --- DB helper mocks ---

jest.mock("@/db/helpers/localListeningSessions", () => ({
  getAllActiveSessionsForUser: jest.fn(),
  endStaleListeningSession: jest.fn(),
  endListeningSession: jest.fn(),
  getActiveSession: jest.fn(),
  getListeningSession: jest.fn(),
  getUnsyncedSessions: jest.fn(),
  markSessionAsSynced: jest.fn(),
  recordSyncFailure: jest.fn(),
  resetSessionListeningTime: jest.fn(),
  startListeningSession: jest.fn(),
  updateServerSessionId: jest.fn(),
  updateSessionListeningTime: jest.fn(),
  updateSessionProgress: jest.fn(),
}));

jest.mock("@/db/helpers/libraryItems", () => ({
  getLibraryItemById: jest.fn(),
}));

jest.mock("@/db/helpers/users", () => ({
  getUserByUsername: jest.fn(),
}));

jest.mock("@/db/helpers/mediaProgress", () => ({
  getMediaProgressForLibraryItem: jest.fn(),
  marshalMediaProgressFromApi: jest.fn(),
  marshalMediaProgressFromAuthResponse: jest.fn(),
  upsertMediaProgress: jest.fn(),
}));

jest.mock("@/db/helpers/mediaMetadata", () => ({
  getMediaMetadataByLibraryItemId: jest.fn(),
}));

// --- Other dependency mocks ---

jest.mock("@/lib/secureStore", () => ({
  getStoredUsername: jest.fn(),
}));

jest.mock("@/lib/api/endpoints", () => ({
  closeSession: jest.fn(),
  createLocalSession: jest.fn(),
  fetchMe: jest.fn(),
  fetchMediaProgress: jest.fn(),
  syncSession: jest.fn(),
}));

jest.mock("@/services/coordinator/eventBus", () => ({
  dispatchPlayerEvent: jest.fn(),
}));

jest.mock("@react-native-community/netinfo", () => ({
  default: { fetch: jest.fn() },
}));

// --- Imports (after mocks) ---

import {
  endListeningSession,
  endStaleListeningSession,
  getActiveSession,
  getAllActiveSessionsForUser,
  startListeningSession,
  updateSessionListeningTime,
  updateSessionProgress,
} from "@/db/helpers/localListeningSessions";
import { getLibraryItemById } from "@/db/helpers/libraryItems";
import { getMediaProgressForLibraryItem } from "@/db/helpers/mediaProgress";
import { getUserByUsername } from "@/db/helpers/users";
import { getStoredUsername } from "@/lib/secureStore";
import { dispatchPlayerEvent } from "@/services/coordinator/eventBus";
import { progressService } from "@/services/ProgressService";

// --- Typed mock helpers ---

const mockGetActiveSession = getActiveSession as jest.MockedFunction<typeof getActiveSession>;
const mockGetAllActiveSessions = getAllActiveSessionsForUser as jest.MockedFunction<
  typeof getAllActiveSessionsForUser
>;
const mockEndListeningSession = endListeningSession as jest.MockedFunction<
  typeof endListeningSession
>;
const mockEndStaleListeningSession = endStaleListeningSession as jest.MockedFunction<
  typeof endStaleListeningSession
>;
const mockStartListeningSession = startListeningSession as jest.MockedFunction<
  typeof startListeningSession
>;
const mockUpdateSessionProgress = updateSessionProgress as jest.MockedFunction<
  typeof updateSessionProgress
>;
const mockUpdateSessionListeningTime = updateSessionListeningTime as jest.MockedFunction<
  typeof updateSessionListeningTime
>;
const mockGetLibraryItemById = getLibraryItemById as jest.MockedFunction<typeof getLibraryItemById>;
const mockGetUserByUsername = getUserByUsername as jest.MockedFunction<typeof getUserByUsername>;
const mockGetMediaProgress = getMediaProgressForLibraryItem as jest.MockedFunction<
  typeof getMediaProgressForLibraryItem
>;
const mockGetStoredUsername = getStoredUsername as jest.MockedFunction<typeof getStoredUsername>;
const mockDispatch = dispatchPlayerEvent as jest.MockedFunction<typeof dispatchPlayerEvent>;

// --- Fixtures ---

const NOW = new Date("2026-01-01T12:00:00Z");
const USER_ID = "user-1";
const ITEM_ID = "item-1";

function makeSession(overrides: Partial<LocalListeningSessionRow>): LocalListeningSessionRow {
  return {
    id: "session-1",
    userId: USER_ID,
    libraryItemId: ITEM_ID,
    mediaId: "media-1",
    episodeId: null,
    sessionStart: new Date(NOW.getTime() - 3600_000),
    sessionEnd: null,
    startTime: 0,
    endTime: null,
    currentTime: 300,
    duration: 3600,
    timeListening: 300,
    playbackRate: 1.0,
    volume: 1.0,
    isSynced: false,
    syncAttempts: 0,
    lastSyncAttempt: null,
    lastSyncTime: null,
    serverSessionId: null,
    syncError: null,
    createdAt: new Date(NOW.getTime() - 3600_000),
    updatedAt: new Date(NOW.getTime() - 1000), // 1 s ago — fresh, actively playing
    ...overrides,
  };
}

function sessionUpdatedDispatches() {
  return mockDispatch.mock.calls.filter(([event]) => event.type === "SESSION_UPDATED");
}

// --- Setup ---

describe("ProgressService — hot path, throttle, staleness, lifecycle", () => {
  let syncSpy: jest.SpiedFunction<typeof progressService.syncSessionToServer>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);

    // Reset service-internal state (session cache, throttle timestamps, interval)
    progressService.shutdown();

    mockGetStoredUsername.mockResolvedValue("alice");
    mockGetUserByUsername.mockResolvedValue({
      id: USER_ID,
      username: "alice",
    } as ReturnType<typeof getUserByUsername> extends Promise<infer T> ? T : never);
    mockUpdateSessionProgress.mockResolvedValue(undefined);
    mockUpdateSessionListeningTime.mockResolvedValue(undefined);
    mockEndListeningSession.mockResolvedValue(undefined);
    mockEndStaleListeningSession.mockResolvedValue(undefined);

    syncSpy = jest
      .spyOn(progressService, "syncSessionToServer")
      .mockResolvedValue(undefined) as jest.SpiedFunction<
      typeof progressService.syncSessionToServer
    >;
  });

  afterEach(() => {
    progressService.shutdown();
    jest.useRealTimers();
    jest.resetAllMocks();
    syncSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // 1. Wall-clock throttle for SESSION_UPDATED dispatch
  // ---------------------------------------------------------------------------
  describe("wall-clock throttling of SESSION_UPDATED", () => {
    it("dispatches on the first tick, suppresses within 10s wall time even at %10 media positions, dispatches again after 10s at non-%10 positions", async () => {
      const session = makeSession({});
      mockGetActiveSession.mockResolvedValue(session);

      // Tick 1 at media position 10 — first tick, dispatches
      await progressService.updateProgress(USER_ID, ITEM_ID, 10);
      expect(sessionUpdatedDispatches()).toHaveLength(1);
      expect(sessionUpdatedDispatches()[0][0]).toEqual({
        type: "SESSION_UPDATED",
        payload: { position: 10 },
      });

      // Tick 2: only 1 s of wall time later, but media position 20 (%10 === 0).
      // Position-based throttling would fire here; wall-clock must NOT.
      jest.setSystemTime(new Date(NOW.getTime() + 1000));
      await progressService.updateProgress(USER_ID, ITEM_ID, 20);
      expect(sessionUpdatedDispatches()).toHaveLength(1);

      // Tick 3: 11 s of wall time after tick 1, media position 21 (%10 !== 0).
      // Position-based throttling would NOT fire; wall-clock must.
      jest.setSystemTime(new Date(NOW.getTime() + 11_000));
      await progressService.updateProgress(USER_ID, ITEM_ID, 21);
      expect(sessionUpdatedDispatches()).toHaveLength(2);
      expect(sessionUpdatedDispatches()[1][0]).toEqual({
        type: "SESSION_UPDATED",
        payload: { position: 21 },
      });

      // Per-tick DB write frequency must be unchanged: every tick writes
      expect(mockUpdateSessionProgress).toHaveBeenCalledTimes(3);
    });

    it("tags SESSION_UPDATED dispatches with source progress_service", async () => {
      mockGetActiveSession.mockResolvedValue(makeSession({}));
      await progressService.updateProgress(USER_ID, ITEM_ID, 10);

      const [, meta] = sessionUpdatedDispatches()[0];
      expect(meta).toEqual({ source: "progress_service" });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Staleness boundary in updateProgress (PAUSE_TIMEOUT = 15 min)
  // ---------------------------------------------------------------------------
  describe("updateProgress staleness boundary", () => {
    it("updates normally when the session is just under 15 minutes old", async () => {
      const session = makeSession({
        updatedAt: new Date(NOW.getTime() - (15 * 60 * 1000 - 1000)), // 14m59s ago
      });
      mockGetActiveSession.mockResolvedValue(session);

      await progressService.updateProgress(USER_ID, ITEM_ID, 310);

      expect(mockUpdateSessionProgress).toHaveBeenCalledWith(session.id, 310, undefined, undefined);
      expect(mockEndStaleListeningSession).not.toHaveBeenCalled();
    });

    it("ends the stale session at its last position when just over 15 minutes old", async () => {
      // No username → skips new-session creation, isolating the stale-end path
      mockGetStoredUsername.mockResolvedValue(null);
      const session = makeSession({
        updatedAt: new Date(NOW.getTime() - (15 * 60 * 1000 + 1000)), // 15m01s ago
      });
      mockGetActiveSession.mockResolvedValue(session);

      await progressService.updateProgress(USER_ID, ITEM_ID, 310);

      // Stale session ends at ITS last position (300), not the incoming one (310)
      expect(mockEndStaleListeningSession).toHaveBeenCalledWith(session.id, 300);
      expect(mockUpdateSessionProgress).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Staleness unification in startSession (was inline 10 min, now PAUSE_TIMEOUT)
  // ---------------------------------------------------------------------------
  describe("startSession staleness unification", () => {
    beforeEach(() => {
      mockGetLibraryItemById.mockResolvedValue({
        id: ITEM_ID,
        mediaType: "book",
        libraryId: "lib-1",
      } as ReturnType<typeof getLibraryItemById> extends Promise<infer T> ? T : never);
      mockGetMediaProgress.mockResolvedValue(null);
      mockStartListeningSession.mockResolvedValue("new-session-id");
    });

    it("resumes (does not end) a 12-minute-old session — under the unified 15-minute staleness cutoff", async () => {
      const existing = makeSession({
        id: "existing-session",
        currentTime: 300,
        updatedAt: new Date(NOW.getTime() - 12 * 60 * 1000), // 12 min ago
      });
      mockGetAllActiveSessions.mockResolvedValue([existing]);

      await progressService.startSession("alice", ITEM_ID, "media-1", 100, 3600);

      // Not stale under the unified 15-min cutoff: session is resumed from its
      // position (300), not ended and restarted from the startTime argument (100)
      expect(mockEndListeningSession).not.toHaveBeenCalled();
      expect(mockStartListeningSession).toHaveBeenCalledWith(
        USER_ID,
        ITEM_ID,
        "media-1",
        300, // resume from active session, not the 100 startTime argument
        3600,
        1.0,
        1.0
      );
    });

    it("ends a 16-minute-old session as stale and starts from saved progress fallback", async () => {
      const existing = makeSession({
        id: "existing-session",
        currentTime: 300,
        updatedAt: new Date(NOW.getTime() - 16 * 60 * 1000), // 16 min ago — stale
      });
      mockGetAllActiveSessions.mockResolvedValue([existing]);

      await progressService.startSession("alice", ITEM_ID, "media-1", 100, 3600);

      expect(mockEndListeningSession).toHaveBeenCalledWith("existing-session", 300);
      expect(mockStartListeningSession).toHaveBeenCalledWith(
        USER_ID,
        ITEM_ID,
        "media-1",
        100, // no saved progress → falls back to the startTime argument
        3600,
        1.0,
        1.0
      );
    });

    it("tags SESSION_CREATED with source progress_service", async () => {
      mockGetAllActiveSessions.mockResolvedValue([]);

      await progressService.startSession("alice", ITEM_ID, "media-1", 100, 3600);

      const created = mockDispatch.mock.calls.find(([event]) => event.type === "SESSION_CREATED");
      expect(created).toBeDefined();
      expect(created![1]).toEqual({ source: "progress_service" });
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Active-session cache in updateProgress
  // ---------------------------------------------------------------------------
  describe("active-session cache", () => {
    it("queries getActiveSession once for consecutive ticks of the same item", async () => {
      mockGetActiveSession.mockResolvedValue(makeSession({}));

      await progressService.updateProgress(USER_ID, ITEM_ID, 301);
      jest.setSystemTime(new Date(NOW.getTime() + 1000));
      await progressService.updateProgress(USER_ID, ITEM_ID, 302);
      jest.setSystemTime(new Date(NOW.getTime() + 2000));
      await progressService.updateProgress(USER_ID, ITEM_ID, 303);

      expect(mockGetActiveSession).toHaveBeenCalledTimes(1);
      // Every tick still writes (crash-recovery guarantee)
      expect(mockUpdateSessionProgress).toHaveBeenCalledTimes(3);
    });

    it("re-queries after endCurrentSession invalidates the cache", async () => {
      mockGetActiveSession.mockResolvedValue(makeSession({}));

      await progressService.updateProgress(USER_ID, ITEM_ID, 301); // query 1, cached
      await progressService.endCurrentSession(USER_ID, ITEM_ID); // query 2 (direct) + invalidate
      jest.setSystemTime(new Date(NOW.getTime() + 1000));
      await progressService.updateProgress(USER_ID, ITEM_ID, 302); // query 3 (cache miss)

      expect(mockGetActiveSession).toHaveBeenCalledTimes(3);
    });

    it("re-queries after forceRehydrateSession invalidates the cache", async () => {
      mockGetActiveSession.mockResolvedValue(makeSession({}));
      mockGetAllActiveSessions.mockResolvedValue([]);

      await progressService.updateProgress(USER_ID, ITEM_ID, 301); // query 1, cached
      await progressService.forceRehydrateSession(); // invalidates
      jest.setSystemTime(new Date(NOW.getTime() + 1000));
      await progressService.updateProgress(USER_ID, ITEM_ID, 302); // query 2 (cache miss)

      expect(mockGetActiveSession).toHaveBeenCalledTimes(2);
    });

    it("does not serve a cached session for a different user/item", async () => {
      mockGetActiveSession.mockResolvedValue(makeSession({}));

      await progressService.updateProgress(USER_ID, ITEM_ID, 301);
      mockGetActiveSession.mockResolvedValue(
        makeSession({ id: "session-2", libraryItemId: "item-2" })
      );
      await progressService.updateProgress(USER_ID, "item-2", 50);

      expect(mockGetActiveSession).toHaveBeenCalledTimes(2);
      expect(mockGetActiveSession).toHaveBeenLastCalledWith(USER_ID, "item-2");
    });

    it("keeps the cached position current so consecutive ticks see the previous write", async () => {
      mockGetActiveSession.mockResolvedValue(makeSession({ currentTime: 300 }));

      await progressService.updateProgress(USER_ID, ITEM_ID, 301);
      jest.setSystemTime(new Date(NOW.getTime() + 1000));
      // A >= 30 s jump from the CACHED position (301) would be logged; more
      // importantly the stale check must use the cached updatedAt (1 s ago),
      // not the original row's — this write must go through, not stale-out.
      await progressService.updateProgress(USER_ID, ITEM_ID, 302);

      expect(mockUpdateSessionProgress).toHaveBeenLastCalledWith(
        "session-1",
        302,
        undefined,
        undefined
      );
      expect(mockEndStaleListeningSession).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 5. initialize()/shutdown() lifecycle
  // ---------------------------------------------------------------------------
  describe("periodic sync lifecycle", () => {
    it("does not run periodic sync before initialize() is called", async () => {
      const syncUnsyncedSpy = jest
        .spyOn(progressService, "syncUnsyncedSessions")
        .mockResolvedValue(undefined);

      jest.advanceTimersByTime(10 * 60 * 1000);
      expect(syncUnsyncedSpy).not.toHaveBeenCalled();

      syncUnsyncedSpy.mockRestore();
    });

    it("initialize() is idempotent — double init yields a single interval", async () => {
      const syncUnsyncedSpy = jest
        .spyOn(progressService, "syncUnsyncedSessions")
        .mockResolvedValue(undefined);

      progressService.initialize();
      progressService.initialize(); // second call must be a no-op

      jest.advanceTimersByTime(120_000);
      expect(syncUnsyncedSpy).toHaveBeenCalledTimes(1);

      syncUnsyncedSpy.mockRestore();
    });

    it("shutdown() stops periodic sync and is idempotent", async () => {
      const syncUnsyncedSpy = jest
        .spyOn(progressService, "syncUnsyncedSessions")
        .mockResolvedValue(undefined);

      progressService.initialize();
      jest.advanceTimersByTime(120_000);
      expect(syncUnsyncedSpy).toHaveBeenCalledTimes(1);

      progressService.shutdown();
      progressService.shutdown(); // second call must not throw
      jest.advanceTimersByTime(240_000);
      expect(syncUnsyncedSpy).toHaveBeenCalledTimes(1);

      syncUnsyncedSpy.mockRestore();
    });

    it("initialize() after shutdown() restarts periodic sync", async () => {
      const syncUnsyncedSpy = jest
        .spyOn(progressService, "syncUnsyncedSessions")
        .mockResolvedValue(undefined);

      progressService.initialize();
      progressService.shutdown();
      progressService.initialize();
      jest.advanceTimersByTime(120_000);
      expect(syncUnsyncedSpy).toHaveBeenCalledTimes(1);

      syncUnsyncedSpy.mockRestore();
    });
  });
});
