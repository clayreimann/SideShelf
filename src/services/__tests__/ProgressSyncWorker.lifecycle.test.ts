/* eslint-disable import/first -- Jest mock factories require initialized mock variables. */
import type { PendingProgressSync } from "@/db/helpers/progressSyncOutbox";

const mockGetNextEligibleProgressSync = jest.fn();
const mockFetchNetInfo = jest.fn();
const mockLogError = jest.fn();

jest.mock("@/db/helpers/progressSyncOutbox", () => ({
  getNextEligibleProgressSync: (...args: unknown[]) => mockGetNextEligibleProgressSync(...args),
}));

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: (...args: unknown[]) => mockFetchNetInfo(...args) },
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    forTag: () => ({
      error: (...args: unknown[]) => mockLogError(...args),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { ProgressSyncWorker } from "@/services/ProgressSyncWorker";

const PENDING = {} as PendingProgressSync;

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

class TestProgressSyncWorker extends ProgressSyncWorker {
  deliver = jest.fn<Promise<"stop" | "continue">, [PendingProgressSync]>(() =>
    Promise.resolve("stop")
  );

  protected override _deliverPending(pending: PendingProgressSync): Promise<"stop" | "continue"> {
    return this.deliver(pending);
  }

  scheduleWakeAt(when: Date): void {
    this._scheduleWakeAt(when);
  }
}

describe("ProgressSyncWorker lifecycle", () => {
  let worker: TestProgressSyncWorker;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
    mockGetNextEligibleProgressSync.mockReset();
    mockGetNextEligibleProgressSync.mockResolvedValue(null);
    mockFetchNetInfo.mockReset();
    mockFetchNetInfo.mockResolvedValue({ isConnected: true, type: "wifi" });
    worker = new TestProgressSyncWorker();
    mockLogError.mockReset();
  });

  afterEach(() => {
    worker.stop();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it("starts an authentication drain immediately before the first periodic interval", async () => {
    worker.start("user-1");
    await flushPromises();

    expect(mockGetNextEligibleProgressSync).toHaveBeenCalledWith("user-1", expect.any(Date));

    jest.advanceTimersByTime(119_999);
    await flushPromises();
    expect(mockGetNextEligibleProgressSync).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1);
    await flushPromises();
    expect(mockGetNextEligibleProgressSync).toHaveBeenCalledTimes(2);
  });

  it("keeps the existing generation and periodic timer on an idempotent same-user start", async () => {
    worker.start("user-1");
    worker.start("user-1");
    await flushPromises();

    expect(mockGetNextEligibleProgressSync).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);
  });

  it("clears periodic, live-progress, and retry wakes on stop", async () => {
    worker.start("user-1");
    await flushPromises();

    worker.requestDrain("progress");
    await flushPromises();
    worker.scheduleWakeAt(new Date(Date.now() + 30_000));

    expect(jest.getTimerCount()).toBe(2);
    worker.stop();

    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(["wifi", "ethernet"])(
    "uses a 15-second live-progress cadence on %s",
    async (networkType) => {
      mockFetchNetInfo.mockResolvedValue({ isConnected: true, type: networkType });
      worker.start("user-1");
      await flushPromises();
      mockGetNextEligibleProgressSync.mockClear();

      worker.requestDrain("progress");
      await flushPromises();
      jest.advanceTimersByTime(14_999);
      await flushPromises();
      expect(mockGetNextEligibleProgressSync).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      await flushPromises();
      expect(mockGetNextEligibleProgressSync).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["cellular", "unknown"])(
    "uses a 60-second live-progress cadence on %s networks",
    async (networkType) => {
      mockFetchNetInfo.mockResolvedValue({ isConnected: true, type: networkType });
      worker.start("user-1");
      await flushPromises();
      mockGetNextEligibleProgressSync.mockClear();

      worker.requestDrain("progress");
      await flushPromises();
      jest.advanceTimersByTime(59_999);
      await flushPromises();
      expect(mockGetNextEligibleProgressSync).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      await flushPromises();
      expect(mockGetNextEligibleProgressSync).toHaveBeenCalledTimes(1);
    }
  );

  it("replaces a later live-progress wake with an immediate retry drain", async () => {
    worker.start("user-1");
    await flushPromises();
    mockGetNextEligibleProgressSync.mockClear();

    worker.requestDrain("progress");
    await flushPromises();
    worker.scheduleWakeAt(new Date(Date.now()));
    await flushPromises();

    expect(jest.getTimerCount()).toBe(1);
    expect(mockGetNextEligibleProgressSync).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(15_000);
    await flushPromises();
    expect(mockGetNextEligibleProgressSync).toHaveBeenCalledTimes(1);
  });

  it("replaces a later live-progress wake with an earlier retry wake", async () => {
    worker.start("user-1");
    await flushPromises();
    mockGetNextEligibleProgressSync.mockClear();

    worker.requestDrain("progress");
    await flushPromises();
    worker.scheduleWakeAt(new Date(Date.now() + 5_000));

    jest.advanceTimersByTime(4_999);
    await flushPromises();
    expect(mockGetNextEligibleProgressSync).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await flushPromises();
    expect(mockGetNextEligibleProgressSync).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(10_000);
    await flushPromises();
    expect(mockGetNextEligibleProgressSync).toHaveBeenCalledTimes(1);
  });

  it("does not select work when drainNow is called while disabled", async () => {
    await worker.drainNow();

    expect(mockGetNextEligibleProgressSync).not.toHaveBeenCalled();
  });

  it("allows one in-flight drain and coalesces concurrent triggers into one follow-up pass", async () => {
    const firstDelivery = deferred<"stop" | "continue">();
    mockGetNextEligibleProgressSync.mockResolvedValueOnce(PENDING).mockResolvedValue(null);
    worker.deliver.mockReturnValueOnce(firstDelivery.promise);

    worker.start("user-1");
    await flushPromises();
    expect(worker.deliver).toHaveBeenCalledTimes(1);

    worker.requestDrain("foreground");
    worker.requestDrain("network");
    worker.requestDrain("manual");
    firstDelivery.resolve("stop");
    await flushPromises();
    await flushPromises();

    expect(worker.deliver).toHaveBeenCalledTimes(1);
    expect(mockGetNextEligibleProgressSync).toHaveBeenCalledTimes(2);
  });

  it("returns immediately from requestDrain and shares the in-flight drainNow promise", async () => {
    const delivery = deferred<"stop" | "continue">();
    mockGetNextEligibleProgressSync.mockResolvedValueOnce(PENDING).mockResolvedValue(null);
    worker.deliver.mockReturnValueOnce(delivery.promise);

    worker.start("user-1");
    await flushPromises();
    const firstDrain = worker.drainNow();

    expect(worker.requestDrain("manual")).toBeUndefined();
    expect(worker.drainNow()).toBe(firstDrain);

    delivery.resolve("stop");
    await firstDrain;
    await flushPromises();
    expect(worker.deliver).toHaveBeenCalledTimes(1);
    expect(mockGetNextEligibleProgressSync).toHaveBeenCalledTimes(2);
  });

  it("preserves drainNow rejection while the fire-and-forget owner logs it", async () => {
    const selection = deferred<PendingProgressSync | null>();
    const failure = new Error("direct drain failed");
    mockGetNextEligibleProgressSync.mockReturnValueOnce(selection.promise);
    worker.start("user-1");
    await flushPromises();

    const directDrain = worker.drainNow();
    const rejection = expect(directDrain).rejects.toBe(failure);
    selection.reject(failure);

    await rejection;
    expect(mockLogError).toHaveBeenCalledWith(
      expect.stringContaining("Progress drain failed"),
      failure
    );
  });

  it("awaits the follow-up pass requested behind an active drain", async () => {
    const firstDelivery = deferred<"stop" | "continue">();
    const followUpSelection = deferred<PendingProgressSync | null>();
    mockGetNextEligibleProgressSync
      .mockResolvedValueOnce(PENDING)
      .mockReturnValueOnce(followUpSelection.promise);
    worker.deliver.mockReturnValueOnce(firstDelivery.promise);

    worker.start("user-1");
    await flushPromises();

    let settled = false;
    const recovery = worker.requestDrainAndWait("foreground").then(() => {
      settled = true;
    });
    firstDelivery.resolve("stop");
    await flushPromises();
    await flushPromises();

    expect(mockGetNextEligibleProgressSync).toHaveBeenCalledTimes(2);
    expect(settled).toBe(false);

    followUpSelection.resolve(null);
    await recovery;
    expect(settled).toBe(true);
  });

  it("rejects an awaitable request when its active drain fails and logs the background rejection", async () => {
    const selection = deferred<PendingProgressSync | null>();
    const failure = new Error("selection failed");
    mockGetNextEligibleProgressSync.mockReturnValueOnce(selection.promise).mockResolvedValue(null);
    worker.start("user-1");
    await flushPromises();

    const recovery = worker.requestDrainAndWait("foreground");
    const rejection = expect(recovery).rejects.toBe(failure);
    selection.reject(failure);

    await rejection;
    expect(mockLogError).toHaveBeenCalledWith(
      expect.stringContaining("Progress drain failed"),
      failure
    );
  });

  it("rejects an awaitable request when its queued follow-up pass fails", async () => {
    const firstDelivery = deferred<"stop" | "continue">();
    const failure = new Error("follow-up failed");
    mockGetNextEligibleProgressSync.mockResolvedValueOnce(PENDING).mockRejectedValueOnce(failure);
    worker.deliver.mockReturnValueOnce(firstDelivery.promise);
    worker.start("user-1");
    await flushPromises();

    const recovery = worker.requestDrainAndWait("network");
    firstDelivery.resolve("stop");

    await expect(recovery).rejects.toBe(failure);
  });

  it("releases an old-generation waiter without waiting for replacement-user work", async () => {
    const oldDelivery = deferred<"stop" | "continue">();
    mockGetNextEligibleProgressSync.mockResolvedValueOnce(PENDING);
    worker.deliver.mockReturnValueOnce(oldDelivery.promise);
    worker.start("user-1");
    await flushPromises();

    const oldRecovery = worker.requestDrainAndWait("network");
    worker.start("user-2");

    await expect(oldRecovery).resolves.toBeUndefined();
    expect(worker.deliver).toHaveBeenCalledTimes(1);

    oldDelivery.resolve("stop");
    await flushPromises();
  });

  it("stops the old generation and drains only the replacement user after identity changes", async () => {
    const oldDelivery = deferred<"stop" | "continue">();
    mockGetNextEligibleProgressSync.mockResolvedValueOnce(PENDING).mockResolvedValueOnce(null);
    worker.deliver.mockReturnValueOnce(oldDelivery.promise);

    worker.start("user-1");
    await flushPromises();
    worker.start("user-2");
    oldDelivery.resolve("continue");
    await flushPromises();
    await flushPromises();

    expect(mockGetNextEligibleProgressSync.mock.calls.map(([userId]) => userId)).toEqual([
      "user-1",
      "user-2",
    ]);
  });

  it("does not select the next row after stop while a row is in flight", async () => {
    const delivery = deferred<"stop" | "continue">();
    mockGetNextEligibleProgressSync.mockResolvedValue(PENDING);
    worker.deliver.mockReturnValue(delivery.promise);

    worker.start("user-1");
    await flushPromises();
    expect(worker.deliver).toHaveBeenCalledTimes(1);

    worker.stop();
    delivery.resolve("continue");
    await flushPromises();
    await flushPromises();

    expect(mockGetNextEligibleProgressSync).toHaveBeenCalledTimes(1);
  });
});
