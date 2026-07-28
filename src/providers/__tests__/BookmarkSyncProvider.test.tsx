import { act, render } from "@testing-library/react-native";
import { BookmarkSyncProvider } from "@/providers/BookmarkSyncProvider";
import React from "react";

const mockDrainPendingBookmarkOps = jest.fn();
const mockWarn = jest.fn();

let mockAuth: { authStatus: string; userId: string | null };
let mockNetwork: {
  initialized: boolean;
  isConnected: boolean;
  isInternetReachable: boolean | null;
};
let mockActiveUserId: string | null;

jest.mock("@/providers/AuthProvider", () => ({
  useAuth: () => mockAuth,
}));

jest.mock("@/stores/appStore", () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      userProfile: { activeUserId: mockActiveUserId },
      drainPendingBookmarkOps: (...args: unknown[]) => mockDrainPendingBookmarkOps(...args),
    }),
  useNetwork: () => mockNetwork,
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    forTag: () => ({
      warn: (...args: unknown[]) => mockWarn(...args),
    }),
  },
}));

describe("BookmarkSyncProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { authStatus: "signedOut", userId: null };
    mockNetwork = { initialized: true, isConnected: true, isInternetReachable: true };
    mockActiveUserId = null;
    mockDrainPendingBookmarkOps.mockResolvedValue(undefined);
  });

  it("does not deliver pending bookmarks while signed out or reauthentication is required", async () => {
    const view = render(<BookmarkSyncProvider />);
    await act(async () => Promise.resolve());

    mockAuth = { authStatus: "reauthRequired", userId: "user-1" };
    mockActiveUserId = "user-1";
    view.rerender(<BookmarkSyncProvider />);
    await act(async () => Promise.resolve());

    expect(mockDrainPendingBookmarkOps).not.toHaveBeenCalled();
  });

  it("starts delivery only after the authenticated and local identities match", async () => {
    const view = render(<BookmarkSyncProvider />);
    await act(async () => Promise.resolve());

    mockAuth = { authStatus: "authenticated", userId: "user-1" };
    mockActiveUserId = "user-1";
    view.rerender(<BookmarkSyncProvider />);
    await act(async () => Promise.resolve());

    expect(mockDrainPendingBookmarkOps).toHaveBeenCalledTimes(1);
  });

  it("retries delivery after reauthentication succeeds", async () => {
    mockAuth = { authStatus: "authenticated", userId: "user-1" };
    mockActiveUserId = "user-1";
    const view = render(<BookmarkSyncProvider />);
    await act(async () => Promise.resolve());
    mockDrainPendingBookmarkOps.mockClear();

    mockAuth = { authStatus: "reauthRequired", userId: "user-1" };
    view.rerender(<BookmarkSyncProvider />);
    await act(async () => Promise.resolve());
    mockAuth = { authStatus: "authenticated", userId: "user-1" };
    view.rerender(<BookmarkSyncProvider />);
    await act(async () => Promise.resolve());

    expect(mockDrainPendingBookmarkOps).toHaveBeenCalledTimes(1);
  });

  it("retries delivery when network connectivity is restored", async () => {
    mockAuth = { authStatus: "authenticated", userId: "user-1" };
    mockActiveUserId = "user-1";
    mockNetwork = { initialized: true, isConnected: false, isInternetReachable: false };
    const view = render(<BookmarkSyncProvider />);
    await act(async () => Promise.resolve());
    mockDrainPendingBookmarkOps.mockClear();

    mockNetwork = { initialized: true, isConnected: true, isInternetReachable: true };
    view.rerender(<BookmarkSyncProvider />);
    await act(async () => Promise.resolve());

    expect(mockDrainPendingBookmarkOps).toHaveBeenCalledTimes(1);
  });

  it("never delivers pending bookmarks for a mismatched local identity", async () => {
    mockAuth = { authStatus: "authenticated", userId: "user-1" };
    mockActiveUserId = "user-2";
    render(<BookmarkSyncProvider />);
    await act(async () => Promise.resolve());

    expect(mockDrainPendingBookmarkOps).not.toHaveBeenCalled();
  });

  it("catches and logs a failed delivery attempt", async () => {
    mockAuth = { authStatus: "authenticated", userId: "user-1" };
    mockActiveUserId = "user-1";
    mockDrainPendingBookmarkOps.mockRejectedValueOnce(new Error("drain failed"));

    render(<BookmarkSyncProvider />);
    await act(async () => Promise.resolve());

    expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining("drain failed"));
  });
});
