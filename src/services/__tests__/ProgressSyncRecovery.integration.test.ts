/* eslint-disable import/first -- Jest mock factories require initialized mock variables. */
import type { ApiMediaProgress } from "@/types/api";

const mockCreateLocalSession = jest.fn();
const mockFetchMediaProgress = jest.fn();
const mockGetDeviceInfo = jest.fn();
const mockSyncSession = jest.fn();
const mockFetchNetInfo = jest.fn();
const mockClearTokens = jest.fn();

jest.mock("@/lib/api/endpoints", () => {
  const actual = jest.requireActual<typeof import("@/lib/api/endpoints")>("@/lib/api/endpoints");
  return {
    ...actual,
    createLocalSession: (...args: unknown[]) => mockCreateLocalSession(...args),
    fetchMediaProgress: (...args: unknown[]) => mockFetchMediaProgress(...args),
    getDeviceInfo: (...args: unknown[]) => mockGetDeviceInfo(...args),
    syncSession: (...args: unknown[]) => mockSyncSession(...args),
  };
});

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: (...args: unknown[]) => mockFetchNetInfo(...args) },
}));

jest.mock("@/services/ApiClientService", () => ({
  apiClientService: { clearTokens: (...args: unknown[]) => mockClearTokens(...args) },
}));

import { createTestDb, type TestDatabase } from "@/__tests__/utils/testDb";
import {
  applyLocalPlaybackTick,
  endListeningSession,
  startListeningSession,
} from "@/db/helpers/localListeningSessions";
import { getProgressSyncDiagnostics, getProgressSyncOutbox } from "@/db/helpers/progressSyncOutbox";
import { wipeUserData } from "@/db/helpers/wipeUserData";
import { libraries } from "@/db/schema/libraries";
import { libraryItems } from "@/db/schema/libraryItems";
import { localListeningSessions, progressSyncOutbox } from "@/db/schema/localData";
import { mediaMetadata } from "@/db/schema/mediaMetadata";
import { users } from "@/db/schema/users";
import { ProgressSyncWorker } from "@/services/ProgressSyncWorker";
import { v4 as uuidv4 } from "uuid";

const NOW = new Date("2026-07-20T12:00:00.000Z");
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "user-1";
const ITEM_ID = "item-1";
const MEDIA_ID = "media-1";
const EPISODE_ID = "episode-1";

const SERVER_PROGRESS: ApiMediaProgress = {
  id: "progress-1",
  libraryItemId: ITEM_ID,
  episodeId: EPISODE_ID,
  duration: 3600,
  progress: 0.05,
  currentTime: 180,
  isFinished: false,
  hideFromContinueListening: false,
  lastUpdate: NOW.getTime(),
  startedAt: NOW.getTime() - 60_000,
  finishedAt: null,
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function waitForCallCount(mock: jest.Mock, expected: number): Promise<void> {
  for (let attempt = 0; attempt < 40 && mock.mock.calls.length < expected; attempt += 1) {
    await Promise.resolve();
  }
  expect(mock).toHaveBeenCalledTimes(expected);
}

describe("stale-token progress sync recovery", () => {
  let testDb: TestDatabase;
  let activeWorker: ProgressSyncWorker | null;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    jest.clearAllMocks();
    (uuidv4 as jest.Mock).mockReset().mockReturnValue(SESSION_ID);

    mockCreateLocalSession.mockResolvedValue({ id: SESSION_ID, duplicate: false });
    mockFetchMediaProgress.mockResolvedValue(SERVER_PROGRESS);
    mockGetDeviceInfo.mockResolvedValue({ deviceId: "device-1", clientName: "SideShelf" });
    mockFetchNetInfo.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: "wifi",
    });
    mockClearTokens.mockResolvedValue(undefined);

    testDb = await createTestDb();
    await testDb.db.insert(users).values({ id: USER_ID, username: USER_ID });
    await testDb.db.insert(libraries).values({ id: "library-1", name: "Library" });
    await testDb.db.insert(libraryItems).values({ id: ITEM_ID, libraryId: "library-1" });
    await testDb.db.insert(mediaMetadata).values({
      id: MEDIA_ID,
      libraryItemId: ITEM_ID,
      mediaType: "podcast",
    });
    activeWorker = null;
  });

  afterEach(async () => {
    activeWorker?.stop();
    expect(jest.getTimerCount()).toBe(0);
    await testDb.cleanup();
    jest.useRealTimers();
  });

  it("retains absolute revisions through reauth, restart, an N/N+1 race, and logout", async () => {
    const sessionId = await startListeningSession(
      USER_ID,
      ITEM_ID,
      MEDIA_ID,
      100,
      3600,
      1,
      1,
      EPISODE_ID
    );
    await applyLocalPlaybackTick(sessionId, {
      currentTime: 115,
      listeningTimeDelta: 15,
      playbackRate: 1,
      volume: 1,
    });

    const initialWorker = new ProgressSyncWorker(() => 0.5);
    activeWorker = initialWorker;
    initialWorker.start(USER_ID);
    await initialWorker.drainNow();

    expect(mockCreateLocalSession).toHaveBeenCalledTimes(1);
    expect(mockCreateLocalSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sessionId: SESSION_ID,
        currentTime: 115,
        timeListening: 15,
        episodeId: EPISODE_ID,
      })
    );
    expect(await getProgressSyncOutbox(sessionId)).toMatchObject({
      desiredRevision: 2,
      acknowledgedRevision: 2,
    });

    // Terminal token expiry stops all delivery while playback remains local-first.
    initialWorker.stop();
    activeWorker = null;
    await applyLocalPlaybackTick(sessionId, {
      currentTime: 130,
      listeningTimeDelta: 15,
      playbackRate: 1,
      volume: 1,
    });
    await endListeningSession(sessionId, 130);
    expect(mockCreateLocalSession).toHaveBeenCalledTimes(1);
    expect(await getProgressSyncOutbox(sessionId)).toMatchObject({
      desiredRevision: 4,
      acknowledgedRevision: 2,
    });

    // A fresh worker models a process restart after successful reauthentication.
    const revisionN = deferred<{ id: string; duplicate: boolean }>();
    mockCreateLocalSession.mockImplementationOnce(() => revisionN.promise);
    const restartedWorker = new ProgressSyncWorker(() => 0.5);
    activeWorker = restartedWorker;
    restartedWorker.start(USER_ID);
    await waitForCallCount(mockCreateLocalSession, 2);

    expect(mockCreateLocalSession).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sessionId: SESSION_ID,
        currentTime: 130,
        timeListening: 30,
        episodeId: EPISODE_ID,
      })
    );

    // Revision N+1 is committed in SQLite while revision N is in flight.
    await applyLocalPlaybackTick(sessionId, {
      currentTime: 145,
      listeningTimeDelta: 15,
      playbackRate: 1,
      volume: 1,
    });
    expect(await getProgressSyncOutbox(sessionId)).toMatchObject({
      desiredRevision: 5,
      acknowledgedRevision: 2,
    });

    revisionN.resolve({ id: SESSION_ID, duplicate: false });
    await restartedWorker.drainNow();

    expect(mockCreateLocalSession).toHaveBeenCalledTimes(3);
    expect(mockCreateLocalSession).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        sessionId: SESSION_ID,
        currentTime: 145,
        timeListening: 45,
        episodeId: EPISODE_ID,
      })
    );
    expect(mockCreateLocalSession.mock.calls.map(([payload]) => payload.sessionId)).toEqual([
      SESSION_ID,
      SESSION_ID,
      SESSION_ID,
    ]);
    expect(mockSyncSession).not.toHaveBeenCalled();
    expect(await getProgressSyncOutbox(sessionId)).toMatchObject({
      desiredRevision: 5,
      acknowledgedRevision: 5,
      attemptCount: 0,
      lastError: null,
      terminalReason: null,
    });
    const diagnostics = await getProgressSyncDiagnostics();
    expect(diagnostics).toEqual([
      expect.objectContaining({
        sessionId: SESSION_ID,
        desiredRevision: 5,
        acknowledgedRevision: 5,
        attemptCount: 0,
      }),
    ]);
    expect(diagnostics[0]).not.toHaveProperty("userId");

    restartedWorker.stop();
    activeWorker = null;
    await wipeUserData();
    expect(await testDb.db.select().from(progressSyncOutbox)).toEqual([]);
    expect(await testDb.db.select().from(localListeningSessions)).toEqual([]);
  });
});
