import { act, render } from "@testing-library/react-native";
import React from "react";
import { AppState, Text } from "react-native";

const mockUseAuth = jest.fn();
const mockUseNetwork = jest.fn();
const mockStart = jest.fn();
const mockStop = jest.fn();
const mockRequestDrain = jest.fn();
const mockDrainNow = jest.fn();
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
    requestDrain: (...args: unknown[]) => mockRequestDrain(...args),
    drainNow: (...args: unknown[]) => mockDrainNow(...args),
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
    mockDrainNow.mockResolvedValue(undefined);
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
    mockDrainNow.mockImplementation(async () => {
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

  it("orders foreground outbound drain before inbound refresh only while authenticated", async () => {
    const order: string[] = [];
    auth = { authStatus: "authenticated", userId: "user-1" };
    mockDrainNow.mockImplementation(async () => {
      order.push("drain");
    });
    mockRefreshAll.mockImplementation(async () => {
      order.push("refresh");
    });
    render(<ProgressSyncProvider />);
    await act(async () => Promise.resolve());
    order.length = 0;
    mockRequestDrain.mockClear();

    act(() => appStateListener?.("active"));
    await act(async () => Promise.resolve());

    expect(mockRequestDrain).toHaveBeenCalledWith("foreground");
    expect(order).toEqual(["drain", "refresh"]);
  });

  it("recovers only on disconnected-to-connected transitions", async () => {
    auth = { authStatus: "authenticated", userId: "user-1" };
    network = { isConnected: false, initialized: true };
    const view = render(<ProgressSyncProvider />);
    await act(async () => Promise.resolve());
    mockRequestDrain.mockClear();
    mockRefreshAll.mockClear();

    network = { isConnected: true, initialized: true };
    view.rerender(<ProgressSyncProvider />);
    await act(async () => Promise.resolve());

    expect(mockRequestDrain).toHaveBeenCalledWith("network");
    expect(mockRefreshAll).toHaveBeenCalledTimes(1);
  });
});
