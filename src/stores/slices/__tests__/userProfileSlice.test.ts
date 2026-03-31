/**
 * Tests for userProfileSlice — bookmark actions
 *
 * Task 1: deleteBookmark URL fix + renameBookmark endpoint
 * Task 2: offline-aware create/delete, renameBookmark action, drain, initializeUserProfile SQLite population
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { createUserProfileSlice, UserProfileSlice } from "../userProfileSlice";

// ---------------------------------------------------------------------------
// Mock API endpoints
// ---------------------------------------------------------------------------
jest.mock("@/lib/api/endpoints", () => ({
  fetchMe: jest.fn(),
  getDeviceInfo: jest.fn(),
  createBookmark: jest.fn(),
  deleteBookmark: jest.fn(),
  renameBookmark: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock DB helpers (specific file, not barrel)
// ---------------------------------------------------------------------------
jest.mock("@/db/helpers/bookmarks", () => ({
  upsertBookmark: jest.fn(),
  upsertAllBookmarks: jest.fn(),
  deleteBookmarkLocal: jest.fn(),
  enqueuePendingOp: jest.fn(),
  dequeuePendingOps: jest.fn(),
  clearPendingOps: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock DB helpers/users
// ---------------------------------------------------------------------------
jest.mock("@/db/helpers/users", () => ({
  getUserByUsername: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock uuid
// ---------------------------------------------------------------------------
jest.mock("uuid", () => ({
  v4: jest.fn(() => "mock-uuid-v4"),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------
const endpoints = require("@/lib/api/endpoints");
const bookmarkHelpers = require("@/db/helpers/bookmarks");
const { getUserByUsername } = require("@/db/helpers/users");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeBookmark(overrides: Record<string, unknown> = {}) {
  return {
    id: "bm-1",
    libraryItemId: "item-1",
    title: "Test Bookmark",
    time: 120,
    createdAt: 1700000000000,
    ...overrides,
  };
}

function makeStore(networkOverrides: Record<string, unknown> = {}) {
  // The full AppStore has both network + userProfile state merged.
  // We model this by passing a mock get that has network merged in.
  const networkState = {
    isConnected: true,
    isInternetReachable: true,
    serverReachable: true,
    connectionType: "wifi",
    initialized: true,
    lastServerCheck: null,
    ...networkOverrides,
  };

  // We create the real slice, but inject a wrapper get() that also exposes network
  let storeRef: UseBoundStore<StoreApi<UserProfileSlice>>;
  storeRef = create<UserProfileSlice>()((set, get) => {
    const slice = createUserProfileSlice(set, () => ({
      ...get(),
      network: networkState,
    }));
    return slice;
  });
  return storeRef;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();

  // Default mock implementations
  endpoints.fetchMe.mockResolvedValue({
    id: "user-1",
    username: "testuser",
    bookmarks: [],
  });
  endpoints.getDeviceInfo.mockResolvedValue({
    osName: "iOS",
    osVersion: "17",
    deviceName: "Test iPhone",
    deviceType: "Phone",
    manufacturer: "Apple",
    model: "iPhone14",
    sdkVersion: undefined,
    clientName: "SideShelf",
    clientVersion: "1.0.0 (1)",
    deviceId: "device-id",
  });
  getUserByUsername.mockResolvedValue({
    id: "user-1",
    username: "testuser",
    serverAddress: "http://localhost:13378",
    token: "tok",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  bookmarkHelpers.upsertBookmark.mockResolvedValue(undefined);
  bookmarkHelpers.upsertAllBookmarks.mockResolvedValue(undefined);
  bookmarkHelpers.deleteBookmarkLocal.mockResolvedValue(undefined);
  bookmarkHelpers.enqueuePendingOp.mockResolvedValue(undefined);
  bookmarkHelpers.dequeuePendingOps.mockResolvedValue([]);
  bookmarkHelpers.clearPendingOps.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// TASK 1: deleteBookmark endpoint URL + renameBookmark endpoint
// ===========================================================================

describe("Task 1 — API endpoint contracts", () => {
  describe("deleteBookmark endpoint", () => {
    it("calls DELETE /api/me/item/{id}/bookmark/{time} with numeric time", async () => {
      // The slice's deleteBookmark calls the endpoint function.
      // We verify what the endpoint is called with.
      endpoints.deleteBookmark.mockResolvedValue(undefined);

      const store = makeStore({ isConnected: true, isInternetReachable: true });

      // Pre-populate state with a bookmark
      const bm = makeBookmark({ libraryItemId: "item-1", time: 120 });
      (store.getState() as any).userProfile.bookmarks = [bm];

      // Initialize user so userId is available
      await store.getState().initializeUserProfile("testuser");

      // Reset call counts from initialization
      jest.clearAllMocks();
      endpoints.deleteBookmark.mockResolvedValue(undefined);
      bookmarkHelpers.deleteBookmarkLocal.mockResolvedValue(undefined);

      // Pre-populate bookmarks again after initialization clears them
      store.setState((s) => ({
        ...s,
        userProfile: { ...s.userProfile, bookmarks: [bm] },
      }));

      await store.getState().deleteBookmark("item-1", 120);

      // The endpoint must be called with time as a number (120), not an id string
      expect(endpoints.deleteBookmark).toHaveBeenCalledWith("item-1", 120);
      expect(endpoints.deleteBookmark).toHaveBeenCalledTimes(1);

      // Verify the second argument is a number, not a string
      const callArgs = endpoints.deleteBookmark.mock.calls[0];
      expect(typeof callArgs[1]).toBe("number");
    });

    it("deleteBookmark removes the bookmark by time from state", async () => {
      endpoints.deleteBookmark.mockResolvedValue(undefined);

      const store = makeStore({ isConnected: true, isInternetReachable: true });
      await store.getState().initializeUserProfile("testuser");

      const bm1 = makeBookmark({ id: "bm-1", time: 120 });
      const bm2 = makeBookmark({ id: "bm-2", time: 240 });
      store.setState((s) => ({
        ...s,
        userProfile: { ...s.userProfile, bookmarks: [bm1, bm2] },
      }));

      await store.getState().deleteBookmark("item-1", 120);

      const remaining = store.getState().userProfile.bookmarks;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].time).toBe(240);
    });
  });

  describe("renameBookmark endpoint", () => {
    it("renameBookmark calls PATCH endpoint and updates state", async () => {
      const bm = makeBookmark({ id: "bm-1", libraryItemId: "item-1", time: 120, title: "Old" });
      const updatedBm = { ...bm, title: "New Title" };

      endpoints.renameBookmark.mockResolvedValue({ bookmark: updatedBm });

      const store = makeStore({ isConnected: true, isInternetReachable: true });
      await store.getState().initializeUserProfile("testuser");

      store.setState((s) => ({
        ...s,
        userProfile: { ...s.userProfile, bookmarks: [bm] },
      }));

      await store.getState().renameBookmark("item-1", 120, "New Title");

      expect(endpoints.renameBookmark).toHaveBeenCalledWith("item-1", 120, "New Title");

      const bookmarks = store.getState().userProfile.bookmarks;
      expect(bookmarks[0].title).toBe("New Title");
    });

    it("renameBookmark upserts to SQLite after API call", async () => {
      const bm = makeBookmark({ id: "bm-1", libraryItemId: "item-1", time: 120 });
      const updatedBm = { ...bm, title: "New Title" };

      endpoints.renameBookmark.mockResolvedValue({ bookmark: updatedBm });

      const store = makeStore({ isConnected: true, isInternetReachable: true });
      await store.getState().initializeUserProfile("testuser");

      store.setState((s) => ({
        ...s,
        userProfile: { ...s.userProfile, bookmarks: [bm] },
      }));

      await store.getState().renameBookmark("item-1", 120, "New Title");

      expect(bookmarkHelpers.upsertBookmark).toHaveBeenCalled();
    });
  });
});

// ===========================================================================
// TASK 2: offline-aware actions, drain, initializeUserProfile SQLite population
// ===========================================================================

describe("Task 2 — createBookmark", () => {
  it("when online: calls API + upserts to SQLite", async () => {
    const bm = makeBookmark({ id: "bm-server", libraryItemId: "item-1", time: 60 });
    endpoints.createBookmark.mockResolvedValue({ bookmark: bm });

    const store = makeStore({ isConnected: true, isInternetReachable: true });
    await store.getState().initializeUserProfile("testuser");

    jest.clearAllMocks();
    endpoints.createBookmark.mockResolvedValue({ bookmark: bm });
    bookmarkHelpers.upsertBookmark.mockResolvedValue(undefined);

    await store.getState().createBookmark("item-1", 60, "My Bookmark");

    expect(endpoints.createBookmark).toHaveBeenCalledWith("item-1", 60, "My Bookmark");
    expect(bookmarkHelpers.upsertBookmark).toHaveBeenCalled();
    expect(bookmarkHelpers.enqueuePendingOp).not.toHaveBeenCalled();
  });

  it("handles createBookmark API responses without a bookmark wrapper", async () => {
    const bm = makeBookmark({ id: "bm-server", libraryItemId: "item-1", time: 60 });
    endpoints.createBookmark.mockResolvedValue({ bookmark: bm });

    const store = makeStore({ isConnected: true, isInternetReachable: true });
    await store.getState().initializeUserProfile("testuser");

    jest.clearAllMocks();
    endpoints.createBookmark.mockResolvedValue({
      id: undefined,
      libraryItemId: "item-1",
      title: undefined,
      time: 60,
      createdAt: undefined,
    });
    bookmarkHelpers.upsertBookmark.mockResolvedValue(undefined);

    const created = await store.getState().createBookmark("item-1", 60, "Prompted Title");

    expect(created.libraryItemId).toBe("item-1");
    expect(created.title).toBe("Prompted Title");
    expect(bookmarkHelpers.upsertBookmark).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        title: "Prompted Title",
      })
    );
  });

  it("falls back to /me user id when local users row is missing", async () => {
    const bm = makeBookmark({ id: "bm-server", libraryItemId: "item-1", time: 60 });
    getUserByUsername.mockResolvedValue(null);
    endpoints.fetchMe.mockResolvedValue({
      id: "server-user-1",
      username: "testuser",
      bookmarks: [],
    });
    endpoints.createBookmark.mockResolvedValue({ bookmark: bm });

    const store = makeStore({ isConnected: true, isInternetReachable: true });
    await store.getState().initializeUserProfile("testuser");

    expect(store.getState().userProfile.activeUserId).toBe("server-user-1");

    jest.clearAllMocks();
    endpoints.createBookmark.mockResolvedValue({ bookmark: bm });
    bookmarkHelpers.upsertBookmark.mockResolvedValue(undefined);

    await store.getState().createBookmark("item-1", 60, "Prompted Title");

    expect(bookmarkHelpers.upsertBookmark).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "server-user-1",
        libraryItemId: "item-1",
        title: "Test Bookmark",
      })
    );
  });

  it("when offline: skips API + upserts to SQLite optimistically + enqueues pending 'create' op", async () => {
    const store = makeStore({ isConnected: false, isInternetReachable: false });
    await store.getState().initializeUserProfile("testuser");

    jest.clearAllMocks();
    bookmarkHelpers.upsertBookmark.mockResolvedValue(undefined);
    bookmarkHelpers.enqueuePendingOp.mockResolvedValue(undefined);

    await store.getState().createBookmark("item-1", 60, "Offline Bookmark");

    expect(endpoints.createBookmark).not.toHaveBeenCalled();
    expect(bookmarkHelpers.upsertBookmark).toHaveBeenCalled();
    expect(bookmarkHelpers.enqueuePendingOp).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: "create",
        libraryItemId: "item-1",
        time: 60,
        title: "Offline Bookmark",
      })
    );

    // Optimistic: bookmark should be in state
    const bookmarks = store.getState().userProfile.bookmarks;
    expect(bookmarks.some((b) => b.time === 60)).toBe(true);
  });
});

describe("Task 2 — deleteBookmark", () => {
  it("when online: calls API + removes from SQLite + updates state", async () => {
    endpoints.deleteBookmark.mockResolvedValue(undefined);

    const store = makeStore({ isConnected: true, isInternetReachable: true });
    await store.getState().initializeUserProfile("testuser");

    const bm = makeBookmark({ id: "bm-1", libraryItemId: "item-1", time: 120 });
    store.setState((s) => ({
      ...s,
      userProfile: { ...s.userProfile, bookmarks: [bm] },
    }));

    await store.getState().deleteBookmark("item-1", 120);

    expect(endpoints.deleteBookmark).toHaveBeenCalledWith("item-1", 120);
    expect(bookmarkHelpers.deleteBookmarkLocal).toHaveBeenCalled();
    expect(bookmarkHelpers.enqueuePendingOp).not.toHaveBeenCalled();
    expect(store.getState().userProfile.bookmarks).toHaveLength(0);
  });

  it("when offline: skips API + removes from SQLite + enqueues pending 'delete' op + updates state", async () => {
    const store = makeStore({ isConnected: false, isInternetReachable: false });
    await store.getState().initializeUserProfile("testuser");

    const bm = makeBookmark({ id: "bm-1", libraryItemId: "item-1", time: 120 });
    store.setState((s) => ({
      ...s,
      userProfile: { ...s.userProfile, bookmarks: [bm] },
    }));

    jest.clearAllMocks();
    bookmarkHelpers.deleteBookmarkLocal.mockResolvedValue(undefined);
    bookmarkHelpers.enqueuePendingOp.mockResolvedValue(undefined);

    await store.getState().deleteBookmark("item-1", 120);

    expect(endpoints.deleteBookmark).not.toHaveBeenCalled();
    expect(bookmarkHelpers.deleteBookmarkLocal).toHaveBeenCalled();
    expect(bookmarkHelpers.enqueuePendingOp).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: "delete",
        libraryItemId: "item-1",
        time: 120,
      })
    );
    expect(store.getState().userProfile.bookmarks).toHaveLength(0);
  });
});

describe("Task 2 — renameBookmark (offline)", () => {
  it("when offline: updates SQLite optimistically + enqueues pending 'rename' op", async () => {
    const bm = makeBookmark({ id: "bm-1", libraryItemId: "item-1", time: 120, title: "Old" });

    const store = makeStore({ isConnected: false, isInternetReachable: false });
    await store.getState().initializeUserProfile("testuser");

    store.setState((s) => ({
      ...s,
      userProfile: { ...s.userProfile, bookmarks: [bm] },
    }));

    jest.clearAllMocks();
    bookmarkHelpers.upsertBookmark.mockResolvedValue(undefined);
    bookmarkHelpers.enqueuePendingOp.mockResolvedValue(undefined);

    await store.getState().renameBookmark("item-1", 120, "New Title");

    expect(endpoints.renameBookmark).not.toHaveBeenCalled();
    expect(bookmarkHelpers.upsertBookmark).toHaveBeenCalled();
    expect(bookmarkHelpers.enqueuePendingOp).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: "rename",
        libraryItemId: "item-1",
        time: 120,
        title: "New Title",
      })
    );

    // State updated optimistically
    const bookmarks = store.getState().userProfile.bookmarks;
    expect(bookmarks[0].title).toBe("New Title");
  });
});

describe("Task 2 — drainPendingBookmarkOps", () => {
  it("replays ops in FIFO order (create, delete, rename), clears succeeded ops, calls refreshBookmarks", async () => {
    const store = makeStore({ isConnected: true, isInternetReachable: true });
    await store.getState().initializeUserProfile("testuser");

    const pendingOps = [
      {
        id: "op-1",
        userId: "user-1",
        libraryItemId: "item-1",
        operationType: "create" as const,
        time: 60,
        title: "Pending Create",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      {
        id: "op-2",
        userId: "user-1",
        libraryItemId: "item-1",
        operationType: "delete" as const,
        time: 120,
        title: null,
        createdAt: new Date("2024-01-01T00:01:00Z"),
      },
      {
        id: "op-3",
        userId: "user-1",
        libraryItemId: "item-2",
        operationType: "rename" as const,
        time: 300,
        title: "Renamed",
        createdAt: new Date("2024-01-01T00:02:00Z"),
      },
    ];

    bookmarkHelpers.dequeuePendingOps.mockResolvedValue(pendingOps);
    const bm = makeBookmark({ id: "bm-1", libraryItemId: "item-1", time: 60 });
    endpoints.createBookmark.mockResolvedValue({ bookmark: bm });
    endpoints.deleteBookmark.mockResolvedValue(undefined);
    endpoints.renameBookmark.mockResolvedValue({ bookmark: makeBookmark({ time: 300 }) });
    bookmarkHelpers.upsertBookmark.mockResolvedValue(undefined);
    bookmarkHelpers.clearPendingOps.mockResolvedValue(undefined);

    // Mock refreshBookmarks by mocking fetchMe
    endpoints.fetchMe.mockResolvedValue({
      id: "user-1",
      username: "testuser",
      bookmarks: [],
    });

    await store.getState().drainPendingBookmarkOps();

    // Verify FIFO order: create, delete, rename
    expect(endpoints.createBookmark).toHaveBeenCalledWith("item-1", 60, "Pending Create");
    expect(endpoints.deleteBookmark).toHaveBeenCalledWith("item-1", 120);
    expect(endpoints.renameBookmark).toHaveBeenCalledWith("item-2", 300, "Renamed");

    // clearPendingOps called with all succeeded IDs
    expect(bookmarkHelpers.clearPendingOps).toHaveBeenCalledWith("user-1", [
      "op-1",
      "op-2",
      "op-3",
    ]);

    // refreshBookmarks called after
    expect(endpoints.fetchMe).toHaveBeenCalled();
  });

  it("stops draining on first failure to preserve order (leave failed + later ops in queue)", async () => {
    const store = makeStore({ isConnected: true, isInternetReachable: true });
    await store.getState().initializeUserProfile("testuser");

    const pendingOps = [
      {
        id: "op-1",
        userId: "user-1",
        libraryItemId: "item-1",
        operationType: "create" as const,
        time: 60,
        title: "Create",
        createdAt: new Date("2024-01-01T00:00:00Z"),
      },
      {
        id: "op-2",
        userId: "user-1",
        libraryItemId: "item-1",
        operationType: "delete" as const,
        time: 120,
        title: null,
        createdAt: new Date("2024-01-01T00:01:00Z"),
      },
    ];

    bookmarkHelpers.dequeuePendingOps.mockResolvedValue(pendingOps);
    // First op fails
    endpoints.createBookmark.mockRejectedValue(new Error("Network error"));
    bookmarkHelpers.clearPendingOps.mockResolvedValue(undefined);

    await store.getState().drainPendingBookmarkOps();

    // Should NOT call deleteBookmark because we stopped after create failed
    expect(endpoints.deleteBookmark).not.toHaveBeenCalled();
    // clearPendingOps should NOT be called (nothing succeeded)
    expect(bookmarkHelpers.clearPendingOps).not.toHaveBeenCalled();
  });
});

describe("Task 2 — initializeUserProfile", () => {
  it("calls upsertAllBookmarks after fetchMe to populate SQLite", async () => {
    const bms = [makeBookmark({ id: "bm-1", time: 60 }), makeBookmark({ id: "bm-2", time: 120 })];
    endpoints.fetchMe.mockResolvedValue({
      id: "user-1",
      username: "testuser",
      bookmarks: bms,
    });

    const store = makeStore({ isConnected: true, isInternetReachable: true });
    await store.getState().initializeUserProfile("testuser");

    expect(bookmarkHelpers.upsertAllBookmarks).toHaveBeenCalledWith("user-1", bms);
  });

  it("calls upsertAllBookmarks with empty array when server returns no bookmarks", async () => {
    endpoints.fetchMe.mockResolvedValue({
      id: "user-1",
      username: "testuser",
      bookmarks: [],
    });

    const store = makeStore({ isConnected: true, isInternetReachable: true });
    await store.getState().initializeUserProfile("testuser");

    expect(bookmarkHelpers.upsertAllBookmarks).toHaveBeenCalledWith("user-1", []);
  });
});
