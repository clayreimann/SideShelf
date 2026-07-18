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
  progressService: {
    fetchServerProgress: jest.fn(),
    initialize: jest.fn(),
    shutdown: jest.fn(),
  },
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

import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { apiClientService } from "@/services/ApiClientService";
import { getStoredUsername, persistUsername } from "@/lib/secureStore";
import { getUserByUsername, marshalUserFromAuthResponse, upsertUser } from "@/db/helpers/users";
import { extractTokensFromAuthResponse } from "@/db/helpers/tokens";
import {
  marshalMediaProgressFromAuthResponse,
  upsertMediaProgress,
} from "@/db/helpers/mediaProgress";
import { login as doLogin } from "@/lib/api/endpoints";
import { Text } from "react-native";

const mockInitialize = apiClientService.initialize as jest.MockedFunction<
  typeof apiClientService.initialize
>;
const mockGetStoredUsername = getStoredUsername as jest.MockedFunction<typeof getStoredUsername>;
const mockPersistUsername = persistUsername as jest.MockedFunction<typeof persistUsername>;
const mockGetUserByUsername = getUserByUsername as jest.MockedFunction<typeof getUserByUsername>;
const mockSetTokens = apiClientService.setTokens as jest.MockedFunction<
  typeof apiClientService.setTokens
>;
const mockDoLogin = doLogin as jest.MockedFunction<typeof doLogin>;
const mockExtractTokens = extractTokensFromAuthResponse as jest.MockedFunction<
  typeof extractTokensFromAuthResponse
>;
const mockMarshalUser = marshalUserFromAuthResponse as jest.MockedFunction<
  typeof marshalUserFromAuthResponse
>;
const mockUpsertUser = upsertUser as jest.MockedFunction<typeof upsertUser>;
const mockMarshalMediaProgress = marshalMediaProgressFromAuthResponse as jest.MockedFunction<
  typeof marshalMediaProgressFromAuthResponse
>;
const mockUpsertMediaProgress = upsertMediaProgress as jest.MockedFunction<
  typeof upsertMediaProgress
>;
const mockGetAccessToken = apiClientService.getAccessToken as jest.MockedFunction<
  typeof apiClientService.getAccessToken
>;
const mockSubscribe = apiClientService.subscribe as jest.MockedFunction<
  typeof apiClientService.subscribe
>;

// Consumer that exposes the auth context to the test via a callback ref,
// and renders loginMessage so we can assert on it via getByText/queryByText.
function AuthConsumer({ onReady }: { onReady: (ctx: ReturnType<typeof useAuth>) => void }) {
  const ctx = useAuth();
  onReady(ctx);
  return <Text>{ctx.loginMessage ?? "no-message"}</Text>;
}

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

  describe("login with legacy servers (token-only auth)", () => {
    beforeEach(() => {
      mockInitialize.mockResolvedValue(undefined);
      mockGetStoredUsername.mockResolvedValue(null);
      mockPersistUsername.mockResolvedValue(undefined);
      mockSetTokens.mockResolvedValue(undefined);
      mockUpsertUser.mockResolvedValue(undefined);
      mockUpsertMediaProgress.mockResolvedValue(undefined);
      mockMarshalMediaProgress.mockReturnValue([]);
      mockMarshalUser.mockReturnValue({
        id: "user-1",
        username: "carol",
        serverUrl: "http://legacy.example.com",
        createdAt: null,
        updatedAt: null,
      });
    });

    it("stores the access token with a null refreshToken when the server omits one (no throw)", async () => {
      mockDoLogin.mockResolvedValue({ user: { token: "legacy-access-token" } } as any);
      // Legacy Audiobookshelf servers (< v2.26) return only `user.token`,
      // no refresh token — extractTokensFromAuthResponse models this.
      mockExtractTokens.mockReturnValue({
        accessToken: "legacy-access-token",
        refreshToken: null,
      });

      let ctx: ReturnType<typeof useAuth> | undefined;
      render(
        <AuthProvider>
          <AuthConsumer onReady={(c) => (ctx = c)} />
        </AuthProvider>
      );

      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await ctx!.login({
          serverUrl: "http://legacy.example.com",
          username: "carol",
          password: "pw",
        });
      });

      // No non-null assertion / throw — setTokens is called with refreshToken: null
      expect(mockSetTokens).toHaveBeenCalledWith("legacy-access-token", null, "carol");
    });
  });

  describe("session expired message accuracy", () => {
    beforeEach(() => {
      mockInitialize.mockResolvedValue(undefined);
      mockGetStoredUsername.mockResolvedValue("dave");
      mockPersistUsername.mockResolvedValue(undefined);
      mockGetUserByUsername.mockResolvedValue({
        id: "user-2",
        username: "dave",
        serverUrl: null,
        createdAt: null,
        updatedAt: null,
      });
      (apiClientService.getBaseUrl as jest.Mock).mockReturnValue("http://example.com");
      (apiClientService.getRefreshToken as jest.Mock).mockReturnValue("refresh-1");
    });

    it('does NOT show "Session expired" when the subscription fires but tokens were not cleared (transient failure)', async () => {
      // Authenticated from the start
      mockGetAccessToken.mockReturnValue("access-1");

      const { queryByText } = render(
        <AuthProvider>
          <AuthConsumer onReady={() => {}} />
        </AuthProvider>
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      // Grab the listener AuthProvider registered with the (mocked) service
      const listener = mockSubscribe.mock.calls[mockSubscribe.mock.calls.length - 1][0];

      // Simulate a notifyListeners() tick where the access token is unchanged
      // (e.g. a network-level refresh failure that — per the fix — does NOT
      // clear tokens). getAccessToken() still returns a value.
      act(() => {
        listener();
      });

      expect(queryByText("Session expired")).toBeNull();
    });

    it('shows "Session expired" only when tokens actually transition from present to cleared', async () => {
      mockGetAccessToken.mockReturnValue("access-1");

      const { getByText } = render(
        <AuthProvider>
          <AuthConsumer onReady={() => {}} />
        </AuthProvider>
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const listener = mockSubscribe.mock.calls[mockSubscribe.mock.calls.length - 1][0];

      // Now simulate a genuine rejection: ApiClientService cleared tokens,
      // so getAccessToken() now returns null.
      mockGetAccessToken.mockReturnValue(null);

      act(() => {
        listener();
      });

      expect(getByText("Session expired")).toBeTruthy();
    });
  });
});
