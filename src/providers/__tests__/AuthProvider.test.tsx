/**
 * Tests for AuthProvider
 *
 * PERF-06: concurrent auth reads — apiClientService.initialize and
 * getStoredUsername run concurrently via Promise.all (both read from
 * secure storage; neither depends on the other's result)
 */

import React from "react";
import { View } from "react-native";
import { act, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

// --- Mocks ---

jest.mock("@/providers/DbProvider", () => ({
  useDb: jest.fn(() => ({ initialized: true })),
}));

jest.mock("@/services/ApiClientService", () => ({
  apiClientService: {
    initialize: jest.fn(),
    getBaseUrl: jest.fn(() => null),
    getAccessToken: jest.fn(() => null),
    getRefreshToken: jest.fn(() => null),
    isAuthenticated: jest.fn(() => false),
    subscribe: jest.fn(() => jest.fn()),
    setBaseUrl: jest.fn(),
    setTokens: jest.fn(),
    clearTokens: jest.fn(),
  },
}));

jest.mock("@/lib/secureStore", () => ({
  getStoredUsername: jest.fn(),
  persistUsername: jest.fn(),
}));

jest.mock("@/db/helpers/users", () => ({
  marshalUserFromAuthResponse: jest.fn(),
  upsertUser: jest.fn(),
  getUserByUsername: jest.fn(),
}));

jest.mock("@/db/helpers/tokens", () => ({
  extractTokensFromAuthResponse: jest.fn(),
}));

jest.mock("@/db/helpers/mediaProgress", () => ({
  marshalMediaProgressFromAuthResponse: jest.fn(),
  upsertMediaProgress: jest.fn(),
}));

jest.mock("@/db/helpers/wipeUserData", () => ({
  wipeUserData: jest.fn(),
}));

jest.mock("@/lib/api/endpoints", () => ({
  login: jest.fn(),
}));

jest.mock("@/services/ProgressService", () => ({
  progressService: { fetchServerProgress: jest.fn() },
}));

jest.mock("@/stores/appStore", () => ({
  useAppStore: {
    getState: jest.fn(() => ({
      resetLibrary: jest.fn(),
      resetSeries: jest.fn(),
      resetAuthors: jest.fn(),
      resetItemDetails: jest.fn(),
      resetUserProfile: jest.fn(),
      resetHome: jest.fn(),
    })),
  },
}));

// --- Typed mock helpers (imported after mocks are registered) ---

import { AuthProvider } from "@/providers/AuthProvider";
import { apiClientService } from "@/services/ApiClientService";
import { getStoredUsername, persistUsername } from "@/lib/secureStore";
import { getUserByUsername } from "@/db/helpers/users";

const mockInitialize = apiClientService.initialize as jest.MockedFunction<
  typeof apiClientService.initialize
>;
const mockGetStoredUsername = getStoredUsername as jest.MockedFunction<typeof getStoredUsername>;
const mockPersistUsername = persistUsername as jest.MockedFunction<typeof persistUsername>;
const mockGetUserByUsername = getUserByUsername as jest.MockedFunction<typeof getUserByUsername>;

// --- Tests ---

describe("AuthProvider", () => {
  describe("PERF-06: concurrent auth reads", () => {
    it("calls apiClientService.initialize and getStoredUsername concurrently via Promise.all", async () => {
      // Make initialize() hang indefinitely — if getStoredUsername is called sequentially
      // (i.e., awaited after initialize), it would never be reached.
      let resolveInit!: () => void;
      const initPromise = new Promise<void>((resolve) => {
        resolveInit = resolve;
      });
      mockInitialize.mockReturnValue(initPromise);
      mockGetStoredUsername.mockResolvedValue(null);
      mockPersistUsername.mockResolvedValue(undefined);

      render(
        <AuthProvider>
          <View />
        </AuthProvider>
      );

      // Flush microtasks so the useEffect async body begins executing
      await act(async () => {
        await Promise.resolve();
      });

      // getStoredUsername was called even though initialize() has not resolved yet
      // → proves both are started concurrently via Promise.all, not sequentially
      expect(mockGetStoredUsername).toHaveBeenCalled();
      expect(mockInitialize).toHaveBeenCalled();

      // Resolve to avoid dangling promise warnings
      resolveInit();
    });

    it("getUserByUsername is called after Promise.all resolves (not concurrent)", async () => {
      mockInitialize.mockResolvedValue(undefined);
      mockGetStoredUsername.mockResolvedValue("alice");
      mockPersistUsername.mockResolvedValue(undefined);
      mockGetUserByUsername.mockResolvedValue({
        id: "user-1",
        username: "alice",
        serverUrl: null,
        createdAt: null,
        updatedAt: null,
      });

      render(
        <AuthProvider>
          <View />
        </AuthProvider>
      );

      await act(async () => {
        // Allow the full async chain (Promise.all → getUserByUsername) to settle
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // getUserByUsername is called with the username from getStoredUsername,
      // confirming it runs only after Promise.all resolves (not concurrently with it)
      expect(mockGetUserByUsername).toHaveBeenCalledWith("alice");
    });
  });
});
