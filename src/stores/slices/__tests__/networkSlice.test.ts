/**
 * Tests for networkSlice — drain pending bookmark ops on network restore
 *
 * Task 3: drainPendingBookmarkOps fires when network transitions to connected+reachable
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { createNetworkSlice, NetworkSlice } from "../networkSlice";

// ---------------------------------------------------------------------------
// Mock NetInfo
// ---------------------------------------------------------------------------
jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => jest.fn()), // returns unsubscribe fn
  fetch: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Mock ApiClientService
// ---------------------------------------------------------------------------
jest.mock("@/services/ApiClientService", () => ({
  apiClientService: {
    getBaseUrl: jest.fn(() => "http://localhost:13378"),
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------
const NetInfo = require("@react-native-community/netinfo");

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeNetState(overrides: Record<string, unknown> = {}): any {
  return {
    type: "wifi",
    isConnected: true,
    isInternetReachable: true,
    details: null,
    ...overrides,
  };
}

/**
 * Creates a store that merges NetworkSlice with a mock drainPendingBookmarkOps.
 * This simulates how the real AppStore combines all slices via get().
 */
function makeStore() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const drain = jest.fn<() => Promise<void>>().mockResolvedValue(undefined as any);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const store = create<any>()((set, get) => ({
    drainPendingBookmarkOps: drain,
    ...createNetworkSlice(set, get),
  }));

  return { store: store as UseBoundStore<StoreApi<NetworkSlice>>, drain };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();

  // Default: fetch returns connected state
  NetInfo.fetch.mockResolvedValue(makeNetState());
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("NetworkSlice — drainPendingBookmarkOps on restore", () => {
  it("drainPendingBookmarkOps is called when network transitions from disconnected to connected+reachable", async () => {
    const { store, drain } = makeStore();

    // Mock server ping to succeed (server reachable)
    (global as Record<string, unknown>).fetch = jest.fn().mockResolvedValue({ ok: true });

    // Start in disconnected state
    await store
      .getState()
      ._updateNetworkState(makeNetState({ isConnected: false, isInternetReachable: false }));

    // Reset drain call count
    drain.mockClear();

    // Transition to connected+reachable
    await store
      .getState()
      ._updateNetworkState(makeNetState({ isConnected: true, isInternetReachable: true }));

    // Wait for async checkServerReachability + drain to fire
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(drain).toHaveBeenCalledTimes(1);
  });

  it("drainPendingBookmarkOps is NOT called when network remains disconnected", async () => {
    const { store, drain } = makeStore();

    (global as Record<string, unknown>).fetch = jest.fn().mockResolvedValue({ ok: true });

    // Start disconnected
    await store
      .getState()
      ._updateNetworkState(makeNetState({ isConnected: false, isInternetReachable: false }));
    drain.mockClear();

    // Stay disconnected
    await store
      .getState()
      ._updateNetworkState(makeNetState({ isConnected: false, isInternetReachable: false }));

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(drain).not.toHaveBeenCalled();
  });

  it("drainPendingBookmarkOps is NOT called when already connected (no transition — prevents duplicate drain on periodic checks)", async () => {
    const { store, drain } = makeStore();

    (global as Record<string, unknown>).fetch = jest.fn().mockResolvedValue({ ok: true });

    // Start connected
    await store
      .getState()
      ._updateNetworkState(makeNetState({ isConnected: true, isInternetReachable: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    drain.mockClear();

    // Update again while still connected (no transition)
    await store
      .getState()
      ._updateNetworkState(makeNetState({ isConnected: true, isInternetReachable: true }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Drain should NOT be called again for the second update
    expect(drain).not.toHaveBeenCalled();
  });
});
