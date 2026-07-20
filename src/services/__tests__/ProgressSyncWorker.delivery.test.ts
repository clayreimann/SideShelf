/* eslint-disable import/first -- Jest mock factories require initialized mock variables. */
import type { PendingProgressSync } from "@/db/helpers/progressSyncOutbox";
import type { ApiMediaProgress } from "@/types/api";

const mockGetNextEligibleProgressSync = jest.fn();
const mockAcknowledgeProgressSyncRevision = jest.fn();
const mockRecordProgressSyncFailure = jest.fn();
const mockTerminallyResolveProgressSyncRevision = jest.fn();
const mockGetLibraryItemById = jest.fn();
const mockCreateLocalSession = jest.fn();
const mockFetchMediaProgress = jest.fn();
const mockSyncSession = jest.fn();
const mockMarshalMediaProgressFromApi = jest.fn();
const mockUpsertMediaProgress = jest.fn();
const mockFetchNetInfo = jest.fn();
const mockClearTokens = jest.fn();

jest.mock("@/db/helpers/progressSyncOutbox", () => ({
  getNextEligibleProgressSync: (...args: unknown[]) => mockGetNextEligibleProgressSync(...args),
  acknowledgeProgressSyncRevision: (...args: unknown[]) =>
    mockAcknowledgeProgressSyncRevision(...args),
  recordProgressSyncFailure: (...args: unknown[]) => mockRecordProgressSyncFailure(...args),
  terminallyResolveProgressSyncRevision: (...args: unknown[]) =>
    mockTerminallyResolveProgressSyncRevision(...args),
}));

jest.mock("@/db/helpers/libraryItems", () => ({
  getLibraryItemById: (...args: unknown[]) => mockGetLibraryItemById(...args),
}));

jest.mock("@/db/helpers/mediaProgress", () => ({
  marshalMediaProgressFromApi: (...args: unknown[]) => mockMarshalMediaProgressFromApi(...args),
  upsertMediaProgress: (...args: unknown[]) => mockUpsertMediaProgress(...args),
}));

jest.mock("@/lib/api/endpoints", () => {
  const actual = jest.requireActual<typeof import("@/lib/api/endpoints")>("@/lib/api/endpoints");
  return {
    ...actual,
    createLocalSession: (...args: unknown[]) => mockCreateLocalSession(...args),
    fetchMediaProgress: (...args: unknown[]) => mockFetchMediaProgress(...args),
    syncSession: (...args: unknown[]) => mockSyncSession(...args),
  };
});

jest.mock("@/lib/logger", () => ({
  logger: {
    forTag: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: (...args: unknown[]) => mockFetchNetInfo(...args) },
}));

jest.mock("@/services/ApiClientService", () => ({
  apiClientService: { clearTokens: (...args: unknown[]) => mockClearTokens(...args) },
}));

import { ApiResponseError } from "@/lib/api/endpoints";
import {
  calculateProgressRetryDelay,
  ProgressSyncWorker,
  type ProgressSyncTrigger,
} from "@/services/ProgressSyncWorker";

const NOW = new Date("2026-07-20T12:00:00.000Z");
const SESSION_ID_1 = "11111111-1111-4111-8111-111111111111";
const SESSION_ID_2 = "22222222-2222-4222-8222-222222222222";

const SERVER_PROGRESS: ApiMediaProgress = {
  id: "progress-1",
  libraryItemId: "item-1",
  duration: 3600,
  progress: 0.04,
  currentTime: 145,
  isFinished: false,
  hideFromContinueListening: false,
  lastUpdate: NOW.getTime(),
  startedAt: NOW.getTime() - 60_000,
  finishedAt: null,
};

function makePending(
  overrides: {
    session?: Partial<PendingProgressSync["session"]>;
    outbox?: Partial<PendingProgressSync["outbox"]>;
    sentRevision?: number;
  } = {}
): PendingProgressSync {
  const session = {
    id: SESSION_ID_1,
    userId: "user-1",
    libraryItemId: "item-1",
    mediaId: "media-1",
    sessionStart: new Date("2026-07-20T11:59:00.000Z"),
    sessionEnd: null,
    startTime: 100,
    endTime: null,
    currentTime: 145,
    duration: 3600,
    timeListening: 45,
    playbackRate: 1,
    volume: 1,
    isSynced: false,
    syncAttempts: 0,
    lastSyncAttempt: null,
    lastSyncTime: null,
    serverSessionId: null,
    syncError: null,
    createdAt: new Date("2026-07-20T11:59:00.000Z"),
    updatedAt: new Date("2026-07-20T12:00:00.000Z"),
    ...overrides.session,
  };
  const outbox = {
    sessionId: session.id,
    userId: session.userId,
    desiredRevision: 1,
    acknowledgedRevision: 0,
    attemptCount: 0,
    lastAttemptAt: null,
    nextAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    terminalReason: null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...overrides.outbox,
  };
  return {
    session,
    outbox,
    sentRevision: overrides.sentRevision ?? outbox.desiredRevision,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function apiError(status: number, retryAfter?: number): ApiResponseError {
  return new ApiResponseError({
    message: `HTTP ${status}`,
    status,
    retryAfter,
    responseBody: "redacted",
  });
}

describe("ProgressSyncWorker delivery", () => {
  let worker: ProgressSyncWorker;
  let pendingRows: PendingProgressSync[];

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    jest.clearAllMocks();
    pendingRows = [];
    mockGetNextEligibleProgressSync.mockImplementation(async (userId: string) => {
      const index = pendingRows.findIndex(
        (pending) => pending.outbox.userId === userId && pending.session.userId === userId
      );
      return index === -1 ? null : pendingRows.splice(index, 1)[0];
    });
    mockAcknowledgeProgressSyncRevision.mockResolvedValue(undefined);
    mockRecordProgressSyncFailure.mockResolvedValue(undefined);
    mockTerminallyResolveProgressSyncRevision.mockResolvedValue(undefined);
    mockGetLibraryItemById.mockResolvedValue({
      id: "item-1",
      libraryId: "library-1",
      mediaType: "book",
    });
    mockCreateLocalSession.mockResolvedValue({ id: SESSION_ID_1, duplicate: false });
    mockFetchMediaProgress.mockResolvedValue(SERVER_PROGRESS);
    mockMarshalMediaProgressFromApi.mockReturnValue({ id: "progress-1", userId: "user-1" });
    mockUpsertMediaProgress.mockResolvedValue(undefined);
    mockFetchNetInfo.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: "wifi",
    });
    mockClearTokens.mockResolvedValue(undefined);
    worker = new ProgressSyncWorker(() => 0.5);
  });

  afterEach(() => {
    worker.stop();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  async function startAndDrain(userId = "user-1"): Promise<void> {
    worker.start(userId);
    await worker.drainNow();
  }

  it("uploads ordered same-item sessions as absolute snapshots and never uses additive sync", async () => {
    pendingRows.push(
      makePending(),
      makePending({
        session: {
          id: SESSION_ID_2,
          currentTime: 210,
          timeListening: 80,
          createdAt: new Date("2026-07-20T11:59:30.000Z"),
          updatedAt: new Date("2026-07-20T12:00:01.000Z"),
        },
        outbox: { sessionId: SESSION_ID_2 },
      })
    );

    await startAndDrain();

    expect(mockCreateLocalSession.mock.calls.map(([params]) => params.sessionId)).toEqual([
      SESSION_ID_1,
      SESSION_ID_2,
    ]);
    expect(mockCreateLocalSession).toHaveBeenNthCalledWith(1, {
      sessionId: SESSION_ID_1,
      userId: "user-1",
      libraryId: "library-1",
      libraryItemId: "item-1",
      startTime: 100,
      currentTime: 145,
      timeListening: 45,
      duration: 3600,
      episodeId: undefined,
      startedAt: new Date("2026-07-20T11:59:00.000Z").getTime(),
      updatedAt: NOW.getTime(),
    });
    expect(mockSyncSession).not.toHaveBeenCalled();
  });

  it("selects and sends only rows owned by the enabled user", async () => {
    pendingRows.push(
      makePending({
        session: { userId: "user-2" },
        outbox: { userId: "user-2" },
      }),
      makePending()
    );

    await startAndDrain("user-1");

    expect(mockGetNextEligibleProgressSync).toHaveBeenCalledWith("user-1", expect.any(Date));
    expect(mockCreateLocalSession).toHaveBeenCalledTimes(1);
    expect(mockCreateLocalSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1" })
    );
    expect(pendingRows).toHaveLength(1);
  });

  it("acknowledges captured revision N before sending a revision N+1 written in flight", async () => {
    const upload = deferred<{ id: string; duplicate: boolean }>();
    const first = makePending({ sentRevision: 1, outbox: { desiredRevision: 1 } });
    const second = makePending({
      sentRevision: 2,
      session: { currentTime: 146, timeListening: 46 },
      outbox: { desiredRevision: 2 },
    });
    pendingRows.push(first);
    mockCreateLocalSession
      .mockReturnValueOnce(upload.promise)
      .mockResolvedValueOnce({ id: SESSION_ID_1, duplicate: false });

    worker.start("user-1");
    const drain = worker.drainNow();
    await flushPromises();
    pendingRows.push(second);
    upload.resolve({ id: SESSION_ID_1, duplicate: false });
    await drain;

    expect(mockAcknowledgeProgressSyncRevision.mock.calls.map(([, revision]) => revision)).toEqual([
      1, 2,
    ]);
    expect(mockCreateLocalSession.mock.calls.map(([params]) => params.currentTime)).toEqual([
      145, 146,
    ]);
  });

  it("retries an unacknowledged row after restart with the same stable UUID", async () => {
    const pending = makePending();
    pendingRows.push(pending);
    mockCreateLocalSession.mockRejectedValueOnce(new Error("request timed out"));

    await startAndDrain();
    worker.stop();

    pendingRows.push(makePending({ outbox: { attemptCount: 1 } }));
    worker = new ProgressSyncWorker(() => 0.5);
    mockCreateLocalSession.mockResolvedValueOnce({ id: SESSION_ID_1, duplicate: true });
    await startAndDrain();

    expect(mockCreateLocalSession.mock.calls.map(([params]) => params.sessionId)).toEqual([
      SESSION_ID_1,
      SESSION_ID_1,
    ]);
    expect(mockAcknowledgeProgressSyncRevision).toHaveBeenCalledTimes(1);
  });

  it.each<ProgressSyncTrigger>([
    "authentication",
    "network",
    "foreground",
    "periodic",
    "pause",
    "end",
    "manual",
    "progress",
  ])("never calls additive sync for the %s trigger", async (trigger) => {
    if (trigger === "progress") {
      worker.start("user-1");
      await worker.drainNow();
      pendingRows.push(makePending());
      worker.requestDrain(trigger);
      jest.advanceTimersByTime(15_000);
      await flushPromises();
      await worker.drainNow();
    } else {
      pendingRows.push(makePending());
      worker.start("user-1");
      worker.requestDrain(trigger);
      await worker.drainNow();
    }

    expect(mockSyncSession).not.toHaveBeenCalled();
  });

  it("acknowledges before reconciling and upserts server progress for the captured user", async () => {
    pendingRows.push(makePending());

    await startAndDrain();

    expect(mockAcknowledgeProgressSyncRevision).toHaveBeenCalledWith(
      SESSION_ID_1,
      1,
      expect.any(Date)
    );
    expect(mockAcknowledgeProgressSyncRevision.mock.invocationCallOrder[0]).toBeLessThan(
      mockFetchMediaProgress.mock.invocationCallOrder[0]
    );
    expect(mockFetchMediaProgress).toHaveBeenCalledWith("item-1");
    expect(mockMarshalMediaProgressFromApi).toHaveBeenCalledWith(SERVER_PROGRESS, "user-1");
    expect(mockUpsertMediaProgress).toHaveBeenCalledWith([{ id: "progress-1", userId: "user-1" }]);
  });

  it("retries failed reconciliation on a later drain without replaying the accepted upload", async () => {
    const pending = makePending({ session: { mediaId: "episode-1" } });
    let acknowledged = false;
    mockGetLibraryItemById.mockResolvedValue({
      id: "item-1",
      libraryId: "library-1",
      mediaType: "podcast",
    });
    mockGetNextEligibleProgressSync.mockImplementation(async () => (acknowledged ? null : pending));
    mockAcknowledgeProgressSyncRevision.mockImplementation(async () => {
      acknowledged = true;
    });
    mockFetchMediaProgress.mockRejectedValue(new Error("refresh failed"));

    await startAndDrain();
    mockFetchMediaProgress.mockResolvedValue(SERVER_PROGRESS);
    worker.requestDrain("manual");
    await worker.drainNow();

    expect(mockCreateLocalSession).toHaveBeenCalledTimes(1);
    expect(mockAcknowledgeProgressSyncRevision).toHaveBeenCalledTimes(1);
    expect(mockRecordProgressSyncFailure).not.toHaveBeenCalled();
    expect(mockFetchMediaProgress).toHaveBeenCalledTimes(2);
    expect(mockFetchMediaProgress).toHaveBeenNthCalledWith(1, "item-1", "episode-1");
    expect(mockFetchMediaProgress).toHaveBeenNthCalledWith(2, "item-1", "episode-1");
    expect(mockUpsertMediaProgress).toHaveBeenCalledTimes(1);
  });

  it("does not start queued reconciliation while stopped", async () => {
    pendingRows.push(makePending());
    mockFetchMediaProgress.mockRejectedValueOnce(new Error("refresh failed"));

    await startAndDrain();
    worker.stop();
    mockFetchMediaProgress.mockResolvedValue(SERVER_PROGRESS);
    await worker.drainNow();

    expect(mockCreateLocalSession).toHaveBeenCalledTimes(1);
    expect(mockFetchMediaProgress).toHaveBeenCalledTimes(1);
    expect(mockUpsertMediaProgress).not.toHaveBeenCalled();

    worker.start("user-1");
    await worker.drainNow();
    expect(mockFetchMediaProgress).toHaveBeenCalledTimes(2);
    expect(mockUpsertMediaProgress).toHaveBeenCalledTimes(1);
  });

  it("clears tokens and stops when post-ack reconciliation rejects authentication", async () => {
    pendingRows.push(makePending(), makePending({ session: { id: SESSION_ID_2 } }));
    mockFetchMediaProgress.mockRejectedValueOnce(apiError(401));

    await startAndDrain();

    expect(mockAcknowledgeProgressSyncRevision).toHaveBeenCalledTimes(1);
    expect(mockClearTokens).toHaveBeenCalledTimes(1);
    expect(mockCreateLocalSession).toHaveBeenCalledTimes(1);
    expect(mockRecordProgressSyncFailure).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("acknowledges an accepted in-flight revision after stop without reconciling or selecting next", async () => {
    const upload = deferred<{ id: string; duplicate: boolean }>();
    pendingRows.push(makePending());
    mockCreateLocalSession.mockReturnValueOnce(upload.promise);

    worker.start("user-1");
    const drain = worker.drainNow();
    await flushPromises();
    expect(mockCreateLocalSession).toHaveBeenCalledTimes(1);

    worker.stop();
    upload.resolve({ id: SESSION_ID_1, duplicate: false });
    await drain;

    expect(mockAcknowledgeProgressSyncRevision).toHaveBeenCalledWith(
      SESSION_ID_1,
      1,
      expect.any(Date)
    );
    expect(mockFetchMediaProgress).not.toHaveBeenCalled();
    expect(mockGetNextEligibleProgressSync).toHaveBeenCalledTimes(1);
  });

  it.each([
    { isConnected: false, isInternetReachable: false, type: "none" },
    { isConnected: true, isInternetReachable: false, type: "wifi" },
  ])("retains an offline row without recording an attempt for %#", async (network) => {
    pendingRows.push(makePending());
    mockFetchNetInfo.mockResolvedValue(network);

    await startAndDrain();

    expect(mockCreateLocalSession).not.toHaveBeenCalled();
    expect(mockRecordProgressSyncFailure).not.toHaveBeenCalled();
    expect(mockAcknowledgeProgressSyncRevision).not.toHaveBeenCalled();
  });

  it("retains a row unchanged when network preflight itself is unreachable", async () => {
    pendingRows.push(makePending());
    mockFetchNetInfo.mockRejectedValue(new Error("network state unavailable"));

    await startAndDrain();

    expect(mockCreateLocalSession).not.toHaveBeenCalled();
    expect(mockRecordProgressSyncFailure).not.toHaveBeenCalled();
  });

  it.each([401, 403])(
    "stops on HTTP %i without attempt diagnostics or a follow-up request",
    async (status) => {
      pendingRows.push(makePending(), makePending({ session: { id: SESSION_ID_2 } }));
      mockCreateLocalSession.mockRejectedValueOnce(apiError(status));

      await startAndDrain();
      mockGetNextEligibleProgressSync.mockClear();
      await worker.drainNow();

      expect(mockCreateLocalSession).toHaveBeenCalledTimes(1);
      expect(mockClearTokens).toHaveBeenCalledTimes(1);
      expect(mockRecordProgressSyncFailure).not.toHaveBeenCalled();
      expect(mockGetNextEligibleProgressSync).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    }
  );

  it("honors Retry-After for HTTP 429 and schedules the durable wake", async () => {
    pendingRows.push(makePending({ outbox: { attemptCount: 3 } }));
    mockCreateLocalSession.mockRejectedValueOnce(apiError(429, 60_000));

    await startAndDrain();

    expect(mockRecordProgressSyncFailure).toHaveBeenCalledWith(
      SESSION_ID_1,
      NOW,
      new Date(NOW.getTime() + 60_000),
      "HTTP 429"
    );
    expect(jest.getTimerCount()).toBe(2);
  });

  it("uses computed backoff for HTTP 429 without a valid Retry-After", async () => {
    pendingRows.push(makePending({ outbox: { attemptCount: 1 } }));
    mockCreateLocalSession.mockRejectedValueOnce(apiError(429));

    await startAndDrain();

    expect(mockRecordProgressSyncFailure).toHaveBeenCalledWith(
      SESSION_ID_1,
      NOW,
      new Date(NOW.getTime() + 30_000),
      "HTTP 429"
    );
  });

  it.each([
    ["timeout", new Error("request timed out")],
    ["HTTP 500", apiError(500)],
    ["HTTP 503", apiError(503)],
  ])("backs off and records a transient %s failure", async (_label, error) => {
    pendingRows.push(makePending({ outbox: { attemptCount: 0 } }));
    mockCreateLocalSession.mockRejectedValueOnce(error);

    await startAndDrain();

    expect(mockRecordProgressSyncFailure).toHaveBeenCalledWith(
      SESSION_ID_1,
      NOW,
      new Date(NOW.getTime() + 15_000),
      error instanceof Error ? error.message : String(error)
    );
    expect(mockAcknowledgeProgressSyncRevision).not.toHaveBeenCalled();
  });

  it("terminally resolves a remote 404 as media_missing", async () => {
    pendingRows.push(makePending());
    mockCreateLocalSession.mockRejectedValueOnce(apiError(404));

    await startAndDrain();

    expect(mockTerminallyResolveProgressSyncRevision).toHaveBeenCalledWith(
      SESSION_ID_1,
      1,
      "media_missing",
      NOW,
      "HTTP 404"
    );
    expect(mockRecordProgressSyncFailure).not.toHaveBeenCalled();
  });

  it("terminally resolves a missing local library-item relation without a request", async () => {
    pendingRows.push(makePending());
    mockGetLibraryItemById.mockResolvedValue(null);

    await startAndDrain();

    expect(mockTerminallyResolveProgressSyncRevision).toHaveBeenCalledWith(
      SESSION_ID_1,
      1,
      "local_media_missing",
      NOW,
      expect.stringContaining("item-1")
    );
    expect(mockCreateLocalSession).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid session ID", { session: { id: "not-a-uuid" } }],
    ["invalid user ID", { session: { userId: " " }, outbox: { userId: " " } }],
    ["invalid position", { session: { currentTime: Number.NaN } }],
    ["invalid duration", { session: { duration: Number.POSITIVE_INFINITY } }],
    ["invalid listening time", { session: { timeListening: -1 } }],
    ["invalid start timestamp", { session: { sessionStart: new Date(Number.NaN) } }],
    ["invalid update timestamp", { session: { updatedAt: new Date(Number.NaN) } }],
  ] as const)("terminally resolves %s as malformed_local_data", async (_label, overrides) => {
    pendingRows.push(makePending(overrides));
    const sessionOverrides: Partial<PendingProgressSync["session"]> = overrides.session;

    await startAndDrain(sessionOverrides.userId ?? "user-1");

    expect(mockTerminallyResolveProgressSyncRevision).toHaveBeenCalledWith(
      expect.any(String),
      1,
      "malformed_local_data",
      NOW,
      expect.any(String)
    );
    expect(mockCreateLocalSession).not.toHaveBeenCalled();
  });

  it("terminally resolves fewer than five seconds of meaningful listening as too_short", async () => {
    pendingRows.push(makePending({ session: { timeListening: 4.999 } }));

    await startAndDrain();

    expect(mockTerminallyResolveProgressSyncRevision).toHaveBeenCalledWith(
      SESSION_ID_1,
      1,
      "too_short",
      NOW,
      expect.stringContaining("4.999")
    );
    expect(mockCreateLocalSession).not.toHaveBeenCalled();
  });
});

describe("calculateProgressRetryDelay", () => {
  it("starts at 15 seconds and applies the lower and upper jitter boundaries", () => {
    expect(calculateProgressRetryDelay(0, () => 0)).toBe(12_000);
    expect(calculateProgressRetryDelay(0, () => 1)).toBe(18_000);
  });

  it("doubles consecutive failures and hard-caps the jittered delay at 15 minutes", () => {
    expect(calculateProgressRetryDelay(1, () => 0.5)).toBe(30_000);
    expect(calculateProgressRetryDelay(100, () => 0)).toBe(720_000);
    expect(calculateProgressRetryDelay(100, () => 1)).toBe(900_000);
  });

  it("uses a valid Retry-After exactly without jitter", () => {
    expect(calculateProgressRetryDelay(5, () => 0, 75_000)).toBe(75_000);
  });
});
