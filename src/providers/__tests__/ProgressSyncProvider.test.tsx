import { act, render } from "@testing-library/react-native";
import React from "react";
import { AppState, Text } from "react-native";

const mockUseAuth = jest.fn();
const mockUseNetwork = jest.fn();
const mockStart = jest.fn();
const mockStop = jest.fn();
const mockRequestDrainAndWait = jest.fn();
const mockRefreshAll = jest.fn();

jest.mock("@/providers/AuthProvider", () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock("@/stores/appStore", () => ({
  useNetwork: () => mockUseNetwork(),
}));

jest.mock("@/services/ProgressSyncWorker", () => ({
  progressSyncWorker: {
    start: (...args: unknown[]) => mockStart(...args),
    stop: (...args: unknown[]) => mockStop(...args),
    requestDrainAndWait: (...args: unknown[]) => mockRequestDrainAndWait(...args),
  },
}));

jest.mock("@/services/ServerProgressRefreshService", () => ({
  serverProgressRefreshService: {
    refreshAll: (...args: unknown[]) => mockRefreshAll(...args),
  },
}));

import { ProgressSyncProvider } from "@/providers/ProgressSyncProvider";

describe("ProgressSyncProvider", () => {
  let appStateListener: ((state: string) => void) | undefined;
  let auth: { authStatus: string; userId: string | null } = {
    authStatus: "signedOut",
    userId: null,
  };
  let network = { isConnected: true, initialized: true };

  beforeEach(() => {
    jest.clearAllMocks();
    auth = { authStatus: "signedOut", userId: null };
    network = { isConnected: true, initialized: true };
    mockUseAuth.mockImplementation(() => auth);
    mockUseNetwork.mockImplementation(() => network);
    mockRequestDrainAndWait.mockResolvedValue(undefined);
    mockRefreshAll.mockResolvedValue(undefined);
    jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
      appStateListener = listener as (state: string) => void;
      return { remove: jest.fn() };
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("starts with the confirmed user and drains before the initial inbound refresh", async () => {
    const order: string[] = [];
    auth = { authStatus: "authenticated", userId: "user-1" };
    mockStart.mockImplementation(() => order.push("start"));
    mockRequestDrainAndWait.mockImplementation(async () => {
      order.push("drain");
    });
    mockRefreshAll.mockImplementation(async () => {
      order.push("refresh");
    });

    render(
      <ProgressSyncProvider>
        <Text>child</Text>
      </ProgressSyncProvider>
    );

    await act(async () => Promise.resolve());

    expect(mockStart).toHaveBeenCalledWith("user-1");
    expect(order).toEqual(["start", "drain", "refresh"]);
  });

  it("stops on terminal expiry and teardown without refreshing while unauthenticated", async () => {
    auth = { authStatus: "authenticated", userId: "user-1" };
    const view = render(<ProgressSyncProvider />);
    await act(async () => Promise.resolve());

    mockStop.mockClear();
    mockRefreshAll.mockClear();
    auth = { authStatus: "reauthRequired", userId: "user-1" };
    view.rerender(<ProgressSyncProvider />);
    await act(async () => Promise.resolve());

    expect(mockStop).toHaveBeenCalled();
    act(() => appStateListener?.("active"));
    await act(async () => Promise.resolve());
    expect(mockRefreshAll).not.toHaveBeenCalled();

    view.unmount();
    expect(mockStop).toHaveBeenCalled();
  });

  it("stops the old identity before starting a different confirmed account", async () => {
    auth = { authStatus: "authenticated", userId: "user-1" };
    const view = render(<ProgressSyncProvider />);
    await act(async () => Promise.resolve());
    mockStart.mockClear();
    mockStop.mockClear();

    auth = { authStatus: "authenticated", userId: "user-2" };
    view.rerender(<ProgressSyncProvider />);
    await act(async () => Promise.resolve());

    expect(mockStop).toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalledWith("user-2");
    expect(mockStop.mock.invocationCallOrder[0]).toBeLessThan(
      mockStart.mock.invocationCallOrder[0]
    );
  });

  it("invalidates an in-flight refresh across logout and same-user reauthentication", async () => {
    let releaseResponse!: () => void;
    const response = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    let staleWrites = 0;
    mockRefreshAll.mockImplementationOnce(async (canCommit: () => boolean) => {
      await response;
      if (canCommit()) staleWrites += 1;
    });
    auth = { authStatus: "authenticated", userId: "user-1" };
    const view = render(<ProgressSyncProvider />);
    await act(async () => Promise.resolve());

    auth = { authStatus: "reauthRequired", userId: "user-1" };
    view.rerender(<ProgressSyncProvider />);
    await act(async () => Promise.resolve());
    auth = { authStatus: "authenticated", userId: "user-1" };
    view.rerender(<ProgressSyncProvider />);
    await act(async () => Promise.resolve());

    releaseResponse();
    await act(async () => response);
    expect(staleWrites).toBe(0);
  });

  it("orders foreground outbound drain before inbound refresh only while authenticated", async () => {
    const order: string[] = [];
    auth = { authStatus: "authenticated", userId: "user-1" };
    mockRequestDrainAndWait.mockImplementation(async () => {
      order.push("drain");
    });
    mockRefreshAll.mockImplementation(async () => {
      order.push("refresh");
    });
    render(<ProgressSyncProvider />);
    await act(async () => Promise.resolve());
    order.length = 0;

    act(() => appStateListener?.("active"));
    await act(async () => Promise.resolve());

    expect(mockRequestDrainAndWait).toHaveBeenCalledWith("foreground");
    expect(order).toEqual(["drain", "refresh"]);
  });

  it("blocks foreground refresh until an overlapping requested drain is fully idle", async () => {
    let releaseDrain!: () => void;
    const queuedDrain = new Promise<void>((resolve) => {
      releaseDrain = resolve;
    });
    auth = { authStatus: "authenticated", userId: "user-1" };
    render(<ProgressSyncProvider />);
    await act(async () => Promise.resolve());
    mockRefreshAll.mockClear();
    mockRequestDrainAndWait.mockReturnValueOnce(queuedDrain);

    act(() => appStateListener?.("active"));
    await act(async () => Promise.resolve());
    expect(mockRefreshAll).not.toHaveBeenCalled();

    releaseDrain();
    await act(async () => queuedDrain);
    expect(mockRefreshAll).toHaveBeenCalledTimes(1);
  });

  it("skips inbound refresh when the requested recovery drain rejects", async () => {
    auth = { authStatus: "authenticated", userId: "user-1" };
    render(<ProgressSyncProvider />);
    await act(async () => Promise.resolve());
    mockRefreshAll.mockClear();
    mockRequestDrainAndWait.mockRejectedValueOnce(new Error("outbound failed"));

    act(() => appStateListener?.("active"));
    await act(async () => Promise.resolve());

    expect(mockRefreshAll).not.toHaveBeenCalled();
  });

  it("recovers only on disconnected-to-connected transitions", async () => {
    auth = { authStatus: "authenticated", userId: "user-1" };
    network = { isConnected: false, initialized: true };
    const view = render(<ProgressSyncProvider />);
    await act(async () => Promise.resolve());
    mockRefreshAll.mockClear();

    network = { isConnected: true, initialized: true };
    view.rerender(<ProgressSyncProvider />);
    await act(async () => Promise.resolve());

    expect(mockRequestDrainAndWait).toHaveBeenCalledWith("network");
    expect(mockRefreshAll).toHaveBeenCalledTimes(1);
  });

  it("blocks network refresh until the recovery drain is fully idle", async () => {
    let releaseDrain!: () => void;
    const queuedDrain = new Promise<void>((resolve) => {
      releaseDrain = resolve;
    });
    auth = { authStatus: "authenticated", userId: "user-1" };
    network = { isConnected: false, initialized: true };
    const view = render(<ProgressSyncProvider />);
    await act(async () => Promise.resolve());
    mockRefreshAll.mockClear();
    mockRequestDrainAndWait.mockReturnValueOnce(queuedDrain);

    network = { isConnected: true, initialized: true };
    view.rerender(<ProgressSyncProvider />);
    await act(async () => Promise.resolve());
    expect(mockRefreshAll).not.toHaveBeenCalled();

    releaseDrain();
    await act(async () => queuedDrain);
    expect(mockRefreshAll).toHaveBeenCalledTimes(1);
  });
});
