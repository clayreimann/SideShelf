/**
 * Tests for AuthProvider
 *
 * PERF-06: concurrent auth reads — apiClientService.initialize and
 * getStoredUsername run concurrently via Promise.all (both read from
 * secure storage; neither depends on the other's result)
 */

import React from "react";
import { Text, View } from "react-native";
import { act, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { UserRow } from "@/db/schema/users";

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
import { wipeUserData } from "@/db/helpers/wipeUserData";
function makeUserRow(id: string, username: string): UserRow {
  return {
    id,
    username,
    type: null,
    createdAt: null,
    lastSeen: null,
    hideFromContinueListening: null,
    canDownload: null,
    canUpdate: null,
    canDelete: null,
    canUpload: null,
    canAccessAllLibraries: null,
    canAccessAllTags: null,
    canAccessExplicitContent: null,
  };
}

const mockInitialize = apiClientService.initialize as jest.MockedFunction<
  typeof apiClientService.initialize
>;
const mockGetStoredUsername = getStoredUsername as jest.MockedFunction<typeof getStoredUsername>;
const mockPersistUsername = persistUsername as jest.MockedFunction<typeof persistUsername>;
const mockGetUserByUsername = getUserByUsername as jest.MockedFunction<typeof getUserByUsername>;
const mockSetTokens = apiClientService.setTokens as jest.MockedFunction<
  typeof apiClientService.setTokens
>;
const mockSetBaseUrl = apiClientService.setBaseUrl as jest.MockedFunction<
  typeof apiClientService.setBaseUrl
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
const mockGetBaseUrl = apiClientService.getBaseUrl as jest.MockedFunction<
  typeof apiClientService.getBaseUrl
>;
const mockGetRefreshToken = apiClientService.getRefreshToken as jest.MockedFunction<
  typeof apiClientService.getRefreshToken
>;
const mockClearTokens = apiClientService.clearTokens as jest.MockedFunction<
  typeof apiClientService.clearTokens
>;
const mockWipeUserData = wipeUserData as jest.MockedFunction<typeof wipeUserData>;
const mockSubscribe = apiClientService.subscribe as jest.MockedFunction<
  typeof apiClientService.subscribe
>;

// Consumer that exposes the auth context to the test via a callback ref and
// renders the public session state for behavior assertions.
function AuthConsumer({ onReady }: { onReady: (ctx: ReturnType<typeof useAuth>) => void }) {
  const ctx = useAuth();
  onReady(ctx);
  return <Text testID="auth-status">{ctx.authStatus}</Text>;
}

// --- Tests ---

describe("AuthProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitialize.mockResolvedValue(undefined);
    mockGetStoredUsername.mockResolvedValue(null);
    mockPersistUsername.mockResolvedValue(undefined);
    mockGetUserByUsername.mockResolvedValue(null);
    mockGetBaseUrl.mockReturnValue(null);
    mockGetAccessToken.mockReturnValue(null);
    mockGetRefreshToken.mockReturnValue(null);
    mockClearTokens.mockResolvedValue(undefined);
    mockSetBaseUrl.mockResolvedValue(undefined);
    mockWipeUserData.mockResolvedValue(undefined);
    mockSubscribe.mockImplementation(() => jest.fn());
  });

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
      mockGetUserByUsername.mockResolvedValue(makeUserRow("user-1", "alice"));

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
      mockMarshalUser.mockReturnValue(makeUserRow("user-1", "carol"));
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

  describe("confirmed login identity", () => {
    beforeEach(() => {
      mockSetTokens.mockResolvedValue(undefined);
      mockDoLogin.mockResolvedValue({ user: { token: "access-1" } } as any);
      mockExtractTokens.mockReturnValue({ accessToken: "access-1", refreshToken: "refresh-1" });
      mockMarshalUser.mockReturnValue(makeUserRow("user-new", "new-user"));
      mockMarshalMediaProgress.mockReturnValue([]);
      mockUpsertMediaProgress.mockResolvedValue(undefined);
    });

    it("does not expose authenticated until the login response user is durable", async () => {
      let ctx: ReturnType<typeof useAuth> | undefined;
      let authListener: (() => void) | undefined;
      mockSubscribe.mockImplementation((listener) => {
        authListener = listener;
        return jest.fn();
      });
      const view = render(
        <AuthProvider>
          <AuthConsumer onReady={(value) => (ctx = value)} />
        </AuthProvider>
      );
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

      let resolveUser!: () => void;
      mockUpsertUser.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveUser = resolve;
        })
      );
      mockSetTokens.mockImplementation(async () => {
        mockGetAccessToken.mockReturnValue("access-1");
        authListener?.();
      });

      let loginPromise!: Promise<void>;
      await act(async () => {
        loginPromise = ctx!.login({
          serverUrl: "http://example.com",
          username: "new-user",
          password: "pw",
        });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(view.getByTestId("auth-status").props.children).toBe("signedOut");

      resolveUser();
      await act(async () => loginPromise);
      expect(view.getByTestId("auth-status").props.children).toBe("authenticated");
    });

    it("awaits old-account wipe before persisting a different login user", async () => {
      mockGetStoredUsername.mockResolvedValue("old-user");
      mockGetUserByUsername.mockResolvedValue(makeUserRow("user-old", "old-user"));
      mockGetBaseUrl.mockReturnValue("http://example.com");
      mockGetAccessToken.mockReturnValue("old-access");

      let ctx: ReturnType<typeof useAuth> | undefined;
      render(
        <AuthProvider>
          <AuthConsumer onReady={(value) => (ctx = value)} />
        </AuthProvider>
      );
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

      let resolveWipe!: () => void;
      mockWipeUserData.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveWipe = resolve;
        })
      );
      let loginPromise!: Promise<void>;
      await act(async () => {
        loginPromise = ctx!.login({
          serverUrl: "http://example.com",
          username: "new-user",
          password: "pw",
        });
        await Promise.resolve();
      });

      expect(mockWipeUserData).toHaveBeenCalled();
      expect(mockUpsertUser).not.toHaveBeenCalled();

      resolveWipe();
      await act(async () => loginPromise);
      expect(mockUpsertUser).toHaveBeenCalled();
    });

    it("does not wipe retained data for a same-user reauthentication", async () => {
      mockGetStoredUsername.mockResolvedValue("new-user");
      mockGetUserByUsername.mockResolvedValue(makeUserRow("user-new", "new-user"));
      mockGetBaseUrl.mockReturnValue("http://example.com");

      let ctx: ReturnType<typeof useAuth> | undefined;
      render(
        <AuthProvider>
          <AuthConsumer onReady={(value) => (ctx = value)} />
        </AuthProvider>
      );
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      mockWipeUserData.mockClear();

      await act(async () =>
        ctx!.login({
          serverUrl: "http://example.com",
          username: "new-user",
          password: "pw",
        })
      );

      expect(mockWipeUserData).not.toHaveBeenCalled();
    });

    it("wipes a different response user ID even when the username is unchanged", async () => {
      mockGetStoredUsername.mockResolvedValue("new-user");
      mockGetUserByUsername.mockResolvedValue(makeUserRow("user-old", "new-user"));
      mockGetBaseUrl.mockReturnValue("http://example.com");

      let ctx: ReturnType<typeof useAuth> | undefined;
      render(
        <AuthProvider>
          <AuthConsumer onReady={(value) => (ctx = value)} />
        </AuthProvider>
      );
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      mockWipeUserData.mockClear();
      mockUpsertUser.mockClear();

      await act(async () =>
        ctx!.login({
          serverUrl: "http://example.com",
          username: "new-user",
          password: "pw",
        })
      );

      expect(mockWipeUserData).toHaveBeenCalledTimes(1);
      expect(mockWipeUserData.mock.invocationCallOrder[0]).toBeLessThan(
        mockUpsertUser.mock.invocationCallOrder[0]
      );
    });
  });

  describe("explicit auth status", () => {
    beforeEach(() => {
      mockGetStoredUsername.mockResolvedValue("dave");
      mockGetUserByUsername.mockResolvedValue(makeUserRow("user-2", "dave"));
      mockGetBaseUrl.mockReturnValue("http://example.com");
      mockGetRefreshToken.mockReturnValue("refresh-1");
    });

    it("reports authenticated when stored credentials are usable", async () => {
      mockGetAccessToken.mockReturnValue("access-1");

      const { getByTestId } = render(
        <AuthProvider>
          <AuthConsumer onReady={() => {}} />
        </AuthProvider>
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(getByTestId("auth-status").props.children).toBe("authenticated");
    });

    it("reconstructs reauthRequired after restart when the prior local user remains but tokens are gone", async () => {
      mockGetAccessToken.mockReturnValue(null);
      mockGetRefreshToken.mockReturnValue(null);

      const { getByTestId } = render(
        <AuthProvider>
          <AuthConsumer onReady={() => {}} />
        </AuthProvider>
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(getByTestId("auth-status").props.children).toBe("reauthRequired");
    });

    it("remains authenticated when the subscription fires but tokens were preserved", async () => {
      mockGetAccessToken.mockReturnValue("access-1");

      const { getByTestId } = render(
        <AuthProvider>
          <AuthConsumer onReady={() => {}} />
        </AuthProvider>
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const listener = mockSubscribe.mock.calls[mockSubscribe.mock.calls.length - 1][0];

      act(() => {
        listener();
      });

      expect(getByTestId("auth-status").props.children).toBe("authenticated");
    });

    it("transitions from authenticated to reauthRequired when tokens are terminally cleared", async () => {
      mockGetAccessToken.mockReturnValue("access-1");

      const { getByTestId } = render(
        <AuthProvider>
          <AuthConsumer onReady={() => {}} />
        </AuthProvider>
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const listener = mockSubscribe.mock.calls[mockSubscribe.mock.calls.length - 1][0];
      mockGetAccessToken.mockReturnValue(null);
      mockGetRefreshToken.mockReturnValue(null);

      act(() => {
        listener();
      });

      expect(getByTestId("auth-status").props.children).toBe("reauthRequired");
    });

    it("restarts progress sync after successful reauthentication", async () => {
      mockGetAccessToken.mockReturnValue(null);
      mockGetRefreshToken.mockReturnValue(null);
      mockSetTokens.mockResolvedValue(undefined);
      mockDoLogin.mockResolvedValue({ user: { token: "new-access-token" } } as any);
      mockExtractTokens.mockReturnValue({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
      });
      mockMarshalUser.mockReturnValue(makeUserRow("user-2", "dave"));
      mockMarshalMediaProgress.mockReturnValue([]);
      mockUpsertUser.mockResolvedValue(undefined);
      mockUpsertMediaProgress.mockResolvedValue(undefined);

      let ctx: ReturnType<typeof useAuth> | undefined;
      const { getByTestId } = render(
        <AuthProvider>
          <AuthConsumer onReady={(value) => (ctx = value)} />
        </AuthProvider>
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(getByTestId("auth-status").props.children).toBe("reauthRequired");

      await act(async () => {
        await ctx!.login({
          serverUrl: "http://example.com",
          username: "dave",
          password: "pw",
        });
      });

      const listener = mockSubscribe.mock.calls[mockSubscribe.mock.calls.length - 1][0];
      mockGetAccessToken.mockReturnValue("new-access-token");
      mockGetRefreshToken.mockReturnValue("new-refresh-token");

      act(() => {
        listener();
      });

      expect(getByTestId("auth-status").props.children).toBe("authenticated");
    });

    it("transitions to signedOut on explicit logout instead of reauthRequired", async () => {
      mockGetAccessToken.mockReturnValue("access-1");
      let ctx: ReturnType<typeof useAuth> | undefined;

      const { getByTestId } = render(
        <AuthProvider>
          <AuthConsumer onReady={(value) => (ctx = value)} />
        </AuthProvider>
      );

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      await act(async () => {
        await ctx!.logout();
      });

      expect(getByTestId("auth-status").props.children).toBe("signedOut");
    });
  });

  it("reports signedOut for a user with no established local session", async () => {
    const { getByTestId } = render(
      <AuthProvider>
        <AuthConsumer onReady={() => {}} />
      </AuthProvider>
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(getByTestId("auth-status").props.children).toBe("signedOut");
  });

  it("awaits user-data wipe before completing a server switch", async () => {
    mockGetStoredUsername.mockResolvedValue("alice");
    mockGetUserByUsername.mockResolvedValue(makeUserRow("user-1", "alice"));
    mockGetBaseUrl.mockReturnValue("http://old.example.com");
    mockGetAccessToken.mockReturnValue("access-1");

    let ctx: ReturnType<typeof useAuth> | undefined;
    const view = render(
      <AuthProvider>
        <AuthConsumer onReady={(value) => (ctx = value)} />
      </AuthProvider>
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    let resolveWipe!: () => void;
    mockWipeUserData.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveWipe = resolve;
      })
    );
    let switchPromise!: Promise<void>;
    await act(async () => {
      switchPromise = ctx!.setServerUrl("http://new.example.com");
      await Promise.resolve();
    });

    expect(view.getByTestId("auth-status").props.children).toBe("signedOut");
    expect(mockWipeUserData).toHaveBeenCalled();
    expect(mockSetBaseUrl).not.toHaveBeenCalledWith("http://new.example.com");

    resolveWipe();
    await act(async () => switchPromise);
    expect(mockSetBaseUrl).toHaveBeenCalledWith("http://new.example.com");
  });

  it("still wipes local data when secure credential deletion fails during logout", async () => {
    mockGetStoredUsername.mockResolvedValue("alice");
    mockGetUserByUsername.mockResolvedValue(makeUserRow("user-1", "alice"));
    mockGetBaseUrl.mockReturnValue("http://example.com");
    mockGetAccessToken.mockReturnValue("access-1");

    let ctx: ReturnType<typeof useAuth> | undefined;
    const view = render(
      <AuthProvider>
        <AuthConsumer onReady={(value) => (ctx = value)} />
      </AuthProvider>
    );
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    mockClearTokens.mockRejectedValueOnce(new Error("secure store unavailable"));

    await act(async () => ctx!.logout());

    expect(view.getByTestId("auth-status").props.children).toBe("signedOut");
    expect(mockWipeUserData).toHaveBeenCalled();
  });
});
