/**
 * Tests for AuthProvider — userId in useAuth() (EFFECT-03)
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, renderHook } from "@testing-library/react-native";
import React from "react";
import { AuthProvider, useAuth } from "../AuthProvider";

// Mock dependencies
jest.mock("@/db/helpers/tokens", () => ({
  extractTokensFromAuthResponse: jest.fn(),
}));

jest.mock("@/db/helpers/users", () => ({
  getUserByUsername: jest.fn(),
  marshalUserFromAuthResponse: jest.fn(),
  upsertUser: jest.fn(),
}));

jest.mock("@/db/helpers/mediaProgress", () => ({
  marshalMediaProgressFromAuthResponse: jest.fn(),
  upsertMediaProgress: jest.fn(),
}));

jest.mock("@/lib/api/endpoints", () => ({
  login: jest.fn(),
}));

jest.mock("@/lib/secureStore", () => ({
  getStoredUsername: jest.fn(),
  persistUsername: jest.fn(),
}));

jest.mock("@/providers/DbProvider", () => ({
  useDb: jest.fn(() => ({ initialized: true })),
}));

jest.mock("@/services/ProgressService", () => ({
  progressService: {
    fetchServerProgress: jest.fn(),
  },
}));

jest.mock("@/services/ApiClientService", () => ({
  apiClientService: {
    initialize: jest.fn(),
    getBaseUrl: jest.fn(() => "http://localhost:13378"),
    getAccessToken: jest.fn(() => "test-token"),
    getRefreshToken: jest.fn(() => null),
    isAuthenticated: jest.fn(() => true),
    setBaseUrl: jest.fn(),
    setTokens: jest.fn(),
    clearTokens: jest.fn(),
    subscribe: jest.fn(() => () => {}),
  },
}));

jest.mock("@/db/helpers/wipeUserData", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wipeUserData: jest.fn<() => Promise<void>>().mockResolvedValue(undefined as any),
}));

jest.mock("@/stores/appStore", () => ({
  useAppStore: Object.assign(jest.fn(), {
    getState: jest.fn(() => ({
      resetLibrary: jest.fn(),
      resetSeries: jest.fn(),
      resetAuthors: jest.fn(),
      resetItemDetails: jest.fn(),
      resetUserProfile: jest.fn(),
      resetHome: jest.fn(),
    })),
  }),
}));

const { getUserByUsername, marshalUserFromAuthResponse, upsertUser } = require("@/db/helpers/users");
const {
  marshalMediaProgressFromAuthResponse,
  upsertMediaProgress,
} = require("@/db/helpers/mediaProgress");
const { extractTokensFromAuthResponse } = require("@/db/helpers/tokens");
const { getStoredUsername, persistUsername } = require("@/lib/secureStore");
const { apiClientService } = require("@/services/ApiClientService");
const { login: doLogin } = require("@/lib/api/endpoints");

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthProvider — userId in useAuth()", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: no stored username
    getStoredUsername.mockResolvedValue(null);
    persistUsername.mockResolvedValue(undefined);
    apiClientService.initialize.mockResolvedValue(undefined);
    apiClientService.getBaseUrl.mockReturnValue("http://localhost:13378");
    apiClientService.getAccessToken.mockReturnValue(null);
    apiClientService.getRefreshToken.mockReturnValue(null);
    apiClientService.isAuthenticated.mockReturnValue(false);
    apiClientService.subscribe.mockReturnValue(() => {});
    apiClientService.setTokens.mockResolvedValue(undefined);
    apiClientService.clearTokens.mockResolvedValue(undefined);
    getUserByUsername.mockResolvedValue(null);
    marshalUserFromAuthResponse.mockReturnValue({
      id: "user-id-123",
      username: "testuser",
    });
    upsertUser.mockResolvedValue(undefined);
    extractTokensFromAuthResponse.mockReturnValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    marshalMediaProgressFromAuthResponse.mockReturnValue([]);
    upsertMediaProgress.mockResolvedValue(undefined);
    doLogin.mockResolvedValue({
      user: { id: "user-id-123", username: "testuser" },
      userToken: "access-token",
      token: "access-token",
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("userId is null before login", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    // Wait for initialization to complete
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.userId).toBeNull();
  });

  it("useAuth() returns userId after login", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    // Wait for initialization
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    await act(async () => {
      await result.current.login({
        serverUrl: "http://localhost:13378",
        username: "testuser",
        password: "password",
      });
    });

    expect(result.current.userId).toBe("user-id-123");
  });

  it("userId is populated from DB during initialize when username exists", async () => {
    getStoredUsername.mockResolvedValue("testuser");
    apiClientService.getAccessToken.mockReturnValue("stored-token");
    apiClientService.isAuthenticated.mockReturnValue(true);
    getUserByUsername.mockResolvedValue({ id: "user-id-456", username: "testuser" });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(result.current.userId).toBe("user-id-456");
  });

  it("logout resets userId to null", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    // Wait for initialization
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Login first
    await act(async () => {
      await result.current.login({
        serverUrl: "http://localhost:13378",
        username: "testuser",
        password: "password",
      });
    });

    expect(result.current.userId).toBe("user-id-123");

    // Now logout
    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.userId).toBeNull();
  });
});
