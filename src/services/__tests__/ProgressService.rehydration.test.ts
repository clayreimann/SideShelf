/**
 * Tests for ProgressService.rehydrateActiveSession() — zombie cleanup
 *
 * Regression coverage for: zombie sessions surviving rehydration across boots.
 * When multiple active sessions exist, all non-winners must be closed immediately
 * after winner selection, before any stale check on the winner.
 *
 * Mocks needed:
 *   - @/db/helpers/localListeningSessions  (getAllActiveSessionsForUser, endStaleListeningSession)
 *   - @/db/helpers/libraryItems            (getLibraryItemById)
 *   - @/db/helpers/users                   (getUserByUsername)
 *   - @/db/helpers/mediaProgress           (getMediaProgressForLibraryItem, upsertMediaProgress, etc.)
 *   - @/db/helpers/mediaMetadata           (getMediaMetadataByLibraryItemId)
 *   - @/lib/secureStore                    (getStoredUsername)
 *   - @/lib/api/endpoints                  (various)
 *   - @/services/coordinator/eventBus      (dispatchPlayerEvent)
 *   - @react-native-community/netinfo      (default)
 *   - progressService.syncSessionToServer  (instance spy)
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
  getAllActiveSessionsForUser,
  endStaleListeningSession,
} from "@/db/helpers/localListeningSessions";
import { getLibraryItemById } from "@/db/helpers/libraryItems";
import { getUserByUsername } from "@/db/helpers/users";
import { getStoredUsername } from "@/lib/secureStore";
import { progressService } from "@/services/ProgressService";

// --- Typed mock helpers ---

const mockGetAllActiveSessions = getAllActiveSessionsForUser as jest.MockedFunction<
  typeof getAllActiveSessionsForUser
>;
const mockEndStaleSession = endStaleListeningSession as jest.MockedFunction<
  typeof endStaleListeningSession
>;
const mockGetLibraryItemById = getLibraryItemById as jest.MockedFunction<typeof getLibraryItemById>;
const mockGetUserByUsername = getUserByUsername as jest.MockedFunction<typeof getUserByUsername>;
const mockGetStoredUsername = getStoredUsername as jest.MockedFunction<typeof getStoredUsername>;

// --- Fixtures ---

const NOW = new Date("2026-01-01T12:00:00Z");
const STALE_TIME = new Date("2026-01-01T11:00:00Z"); // 60 min ago — stale
const FRESH_TIME = new Date("2026-01-01T11:59:00Z"); // 1 min ago — fresh

function makeSession(overrides: Partial<LocalListeningSessionRow>): LocalListeningSessionRow {
  return {
    id: "session-id",
    userId: "user-1",
    libraryItemId: "item-1",
    mediaId: "media-1",
    sessionStart: new Date("2026-01-01T10:00:00Z"),
    sessionEnd: null,
    startTime: 0,
    endTime: null,
    currentTime: 100,
    duration: 3600,
    timeListening: 100,
    playbackRate: 1.0,
    volume: 1.0,
    isSynced: false,
    syncAttempts: 0,
    lastSyncAttempt: null,
    lastSyncTime: null,
    serverSessionId: null,
    syncError: null,
    createdAt: new Date("2026-01-01T10:00:00Z"),
    updatedAt: NOW,
    ...overrides,
  };
}

// --- Setup ---

describe("ProgressService.rehydrateActiveSession — zombie cleanup", () => {
  let syncSpy: jest.SpiedFunction<typeof progressService.syncSessionToServer>;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);

    // Common context mocks
    mockGetStoredUsername.mockResolvedValue("alice");
    mockGetUserByUsername.mockResolvedValue({
      id: "user-1",
      username: "alice",
      serverAddress: "http://server",
      token: "tok",
      createdAt: NOW,
      updatedAt: NOW,
    } as ReturnType<typeof getUserByUsername> extends Promise<infer T> ? T : never);

    // Spy on syncSessionToServer so tests don't hit real network code
    syncSpy = jest
      .spyOn(progressService, "syncSessionToServer")
      .mockResolvedValue(undefined) as jest.SpiedFunction<
      typeof progressService.syncSessionToServer
    >;

    mockEndStaleSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Zombie cleanup — winner is stale, loser is brandNew (primary regression)
  // ---------------------------------------------------------------------------
  it("closes zombie loser silently and syncs+closes stale winner", async () => {
    const winner = makeSession({
      id: "winner-session",
      currentTime: 300,
      startTime: 0,
      updatedAt: STALE_TIME, // stale — 60 min ago
    });
    const zombie = makeSession({
      id: "zombie-session",
      currentTime: 0,
      startTime: 0, // brandNew: currentTime === startTime
      updatedAt: new Date(STALE_TIME.getTime() - 1000), // older → loser
    });

    mockGetAllActiveSessions.mockResolvedValue([zombie, winner]); // unsorted input
    // Library item exists for winner path
    mockGetLibraryItemById.mockResolvedValue({
      id: "item-1",
    } as ReturnType<typeof getLibraryItemById> extends Promise<infer T> ? T : never);

    await progressService.rehydrateActiveSession();

    // Zombie must be closed without sync
    expect(syncSpy).not.toHaveBeenCalledWith("user-1", "item-1", "zombie-session");
    expect(mockEndStaleSession).toHaveBeenCalledWith("zombie-session", 0);

    // Winner is stale → synced then closed
    expect(syncSpy).toHaveBeenCalledWith("user-1", "item-1", "winner-session");
    expect(mockEndStaleSession).toHaveBeenCalledWith("winner-session", 300);
  });

  // ---------------------------------------------------------------------------
  // 2. Zombie cleanup — winner is NOT stale → zombie closed, winner preserved
  // ---------------------------------------------------------------------------
  it("closes zombie loser silently and leaves fresh winner active", async () => {
    const winner = makeSession({
      id: "winner-session",
      currentTime: 300,
      startTime: 0,
      updatedAt: FRESH_TIME, // fresh — 1 min ago
    });
    const zombie = makeSession({
      id: "zombie-session",
      currentTime: 0,
      startTime: 0,
      updatedAt: new Date(FRESH_TIME.getTime() - 5000), // older → loser
    });

    mockGetAllActiveSessions.mockResolvedValue([zombie, winner]);
    mockGetLibraryItemById.mockResolvedValue({
      id: "item-1",
    } as ReturnType<typeof getLibraryItemById> extends Promise<infer T> ? T : never);

    await progressService.rehydrateActiveSession();

    // Zombie closed without sync
    expect(syncSpy).not.toHaveBeenCalledWith("user-1", "item-1", "zombie-session");
    expect(mockEndStaleSession).toHaveBeenCalledWith("zombie-session", 0);

    // Winner NOT closed — it's fresh and should stay active
    expect(mockEndStaleSession).not.toHaveBeenCalledWith("winner-session", expect.anything());
  });

  // ---------------------------------------------------------------------------
  // 3. Real-progress loser — should be synced before closing
  // ---------------------------------------------------------------------------
  it("syncs loser with real progress before closing", async () => {
    const winner = makeSession({
      id: "winner-session",
      currentTime: 500,
      startTime: 0,
      updatedAt: STALE_TIME,
    });
    const loserWithProgress = makeSession({
      id: "loser-with-progress",
      currentTime: 200,
      startTime: 50, // currentTime (200) > startTime (50) — real progress
      updatedAt: new Date(STALE_TIME.getTime() - 2000),
    });

    mockGetAllActiveSessions.mockResolvedValue([loserWithProgress, winner]);
    mockGetLibraryItemById.mockResolvedValue({
      id: "item-1",
    } as ReturnType<typeof getLibraryItemById> extends Promise<infer T> ? T : never);

    await progressService.rehydrateActiveSession();

    // Loser with real progress must be synced first
    expect(syncSpy).toHaveBeenCalledWith("user-1", "item-1", "loser-with-progress");
    expect(mockEndStaleSession).toHaveBeenCalledWith("loser-with-progress", 200);
  });

  // ---------------------------------------------------------------------------
  // 4. Single session — no loser cleanup, behavior unchanged
  // ---------------------------------------------------------------------------
  it("does not invoke loser cleanup when only one session exists", async () => {
    const solo = makeSession({
      id: "solo-session",
      currentTime: 100,
      startTime: 0,
      updatedAt: FRESH_TIME,
    });

    mockGetAllActiveSessions.mockResolvedValue([solo]);
    mockGetLibraryItemById.mockResolvedValue({
      id: "item-1",
    } as ReturnType<typeof getLibraryItemById> extends Promise<infer T> ? T : never);

    await progressService.rehydrateActiveSession();

    // No loser cleanup
    expect(mockEndStaleSession).not.toHaveBeenCalled();
    expect(syncSpy).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 5. Three sessions — winner + zombie + real-progress loser
  // ---------------------------------------------------------------------------
  it("handles three sessions: zombie skips sync, real-progress loser syncs, winner wins", async () => {
    const winner = makeSession({
      id: "winner-session",
      currentTime: 600,
      startTime: 0,
      updatedAt: FRESH_TIME,
    });
    const zombie = makeSession({
      id: "zombie-session",
      currentTime: 0,
      startTime: 0,
      updatedAt: new Date(FRESH_TIME.getTime() - 10000),
    });
    const loserWithProgress = makeSession({
      id: "real-progress-loser",
      currentTime: 150,
      startTime: 30,
      updatedAt: new Date(FRESH_TIME.getTime() - 5000),
    });

    // Input unsorted — winner has highest updatedAt
    mockGetAllActiveSessions.mockResolvedValue([zombie, loserWithProgress, winner]);
    mockGetLibraryItemById.mockResolvedValue({
      id: "item-1",
    } as ReturnType<typeof getLibraryItemById> extends Promise<infer T> ? T : never);

    await progressService.rehydrateActiveSession();

    // Zombie: no sync, just end
    expect(syncSpy).not.toHaveBeenCalledWith("user-1", "item-1", "zombie-session");
    expect(mockEndStaleSession).toHaveBeenCalledWith("zombie-session", 0);

    // Real-progress loser: synced then ended
    expect(syncSpy).toHaveBeenCalledWith("user-1", "item-1", "real-progress-loser");
    expect(mockEndStaleSession).toHaveBeenCalledWith("real-progress-loser", 150);

    // Winner: fresh, not ended
    expect(mockEndStaleSession).not.toHaveBeenCalledWith("winner-session", expect.anything());

    // Total endStaleSession calls: exactly the 2 losers
    expect(mockEndStaleSession).toHaveBeenCalledTimes(2);
  });
});
