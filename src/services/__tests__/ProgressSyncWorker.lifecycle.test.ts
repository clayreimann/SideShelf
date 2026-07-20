/* eslint-disable import/first -- Jest mock factories require initialized mock variables. */
import type { PendingProgressSync } from "@/db/helpers/progressSyncOutbox";

const mockGetNextEligibleProgressSync = jest.fn();
const mockFetchNetInfo = jest.fn();

jest.mock("@/db/helpers/progressSyncOutbox", () => ({
  getNextEligibleProgressSync: (...args: unknown[]) => mockGetNextEligibleProgressSync(...args),
}));

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: (...args: unknown[]) => mockFetchNetInfo(...args) },
}));

import { ProgressSyncWorker } from "@/services/ProgressSyncWorker";

const PENDING = {} as PendingProgressSync;

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
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
