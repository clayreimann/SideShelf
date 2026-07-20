/**
 * Tests for ApiClientService token refresh resilience.
 *
 * Covers Brief A (auth resilience):
 *  - performTokenRefresh must NOT clear tokens on network-level failures
 *    (fetch throw/abort) or 5xx responses from /auth/refresh — those are
 *    transient failures and the session should survive for a later retry.
 *  - performTokenRefresh MUST clear tokens when the server definitively
 *    rejects the refresh (401 or 403 from /auth/refresh).
 *  - setTokens accepts a null refreshToken (legacy server / token-only auth)
 *    and persists that correctly.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

// --- Mocks ---

jest.mock("@/lib/secureStore", () => ({
  getItem: jest.fn(),
  saveItem: jest.fn(),
  SECURE_KEYS: {
    serverUrl: "abs.serverUrl",
    accessToken: "abs.accessToken",
    refreshToken: "abs.refreshToken",
    username: "abs.username",
  },
}));

jest.mock("@/db/helpers/tokens", () => ({
  extractTokensFromAuthResponse: jest.fn(),
}));

import { apiClientService } from "@/services/ApiClientService";
import { getItem, saveItem } from "@/lib/secureStore";
import { extractTokensFromAuthResponse } from "@/db/helpers/tokens";

const mockGetItem = getItem as jest.MockedFunction<typeof getItem>;
const mockSaveItem = saveItem as jest.MockedFunction<typeof saveItem>;
const mockExtractTokens = extractTokensFromAuthResponse as jest.MockedFunction<
  typeof extractTokensFromAuthResponse
>;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("ApiClientService", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSaveItem.mockResolvedValue(undefined);
    // Seed a valid authenticated session before each test
    await apiClientService.setBaseUrl("http://test.example.com");
    await apiClientService.setTokens("initial-access", "initial-refresh", "alice");
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("setTokens", () => {
    it("persists a non-null refreshToken to secure storage", async () => {
      await apiClientService.setTokens("access-1", "refresh-1");
      expect(mockSaveItem).toHaveBeenCalledWith("abs.accessToken", "access-1");
      expect(mockSaveItem).toHaveBeenCalledWith("abs.refreshToken", "refresh-1");
      expect(apiClientService.getRefreshToken()).toBe("refresh-1");
    });

    it("supports a null refreshToken for legacy/token-only auth and deletes the stored key", async () => {
      await apiClientService.setTokens("access-legacy", null, "bob");
      expect(mockSaveItem).toHaveBeenCalledWith("abs.accessToken", "access-legacy");
      expect(mockSaveItem).toHaveBeenCalledWith("abs.refreshToken", null);
      expect(apiClientService.getRefreshToken()).toBeNull();
      expect(apiClientService.getAccessToken()).toBe("access-legacy");
    });
  });

  describe("clearTokens", () => {
    it("clears memory and notifies once even when secure-store persistence fails", async () => {
      const listener = jest.fn();
      const unsubscribe = apiClientService.subscribe(listener);
      mockSaveItem.mockRejectedValueOnce(new Error("secure store failed"));

      await expect(apiClientService.clearTokens()).rejects.toThrow("secure store failed");

      expect(apiClientService.getAccessToken()).toBeNull();
      expect(apiClientService.getRefreshToken()).toBeNull();
      expect(apiClientService.getUsername()).toBeNull();
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });
  });

  describe("performTokenRefresh (via handleUnauthorized)", () => {
    it("clears tokens and returns false when refresh is rejected with 401", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(401, {}));

      const result = await apiClientService.handleUnauthorized();

      expect(result).toBe(false);
      expect(apiClientService.getAccessToken()).toBeNull();
      expect(apiClientService.getRefreshToken()).toBeNull();
      expect(mockSaveItem).toHaveBeenCalledWith("abs.accessToken", null);
      expect(mockSaveItem).toHaveBeenCalledWith("abs.refreshToken", null);
    });

    it("clears tokens and returns false when refresh is rejected with 403", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(403, {}));

      const result = await apiClientService.handleUnauthorized();

      expect(result).toBe(false);
      expect(apiClientService.getAccessToken()).toBeNull();
      expect(apiClientService.getRefreshToken()).toBeNull();
    });

    it("does NOT clear tokens and returns false on a 5xx response", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(500, {}));

      const result = await apiClientService.handleUnauthorized();

      expect(result).toBe(false);
      // Session survives — tokens are untouched for a later retry
      expect(apiClientService.getAccessToken()).toBe("initial-access");
      expect(apiClientService.getRefreshToken()).toBe("initial-refresh");
      expect(mockSaveItem).not.toHaveBeenCalledWith("abs.accessToken", null);
      expect(mockSaveItem).not.toHaveBeenCalledWith("abs.refreshToken", null);
    });

    it("does NOT clear tokens and returns false when fetch throws (network offline)", async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new TypeError("Network request failed"));

      const result = await apiClientService.handleUnauthorized();

      expect(result).toBe(false);
      expect(apiClientService.getAccessToken()).toBe("initial-access");
      expect(apiClientService.getRefreshToken()).toBe("initial-refresh");
      expect(mockSaveItem).not.toHaveBeenCalledWith("abs.accessToken", null);
      expect(mockSaveItem).not.toHaveBeenCalledWith("abs.refreshToken", null);
    });

    it("does NOT clear tokens and returns false when fetch aborts (timeout)", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      (global.fetch as jest.Mock).mockRejectedValue(abortError);

      const result = await apiClientService.handleUnauthorized();

      expect(result).toBe(false);
      expect(apiClientService.getAccessToken()).toBe("initial-access");
      expect(apiClientService.getRefreshToken()).toBe("initial-refresh");
    });

    it("sets new tokens and returns true on a successful refresh", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { fake: true }));
      mockExtractTokens.mockReturnValue({
        accessToken: "new-access",
        refreshToken: "new-refresh",
      });

      const result = await apiClientService.handleUnauthorized();

      expect(result).toBe(true);
      expect(apiClientService.getAccessToken()).toBe("new-access");
      expect(apiClientService.getRefreshToken()).toBe("new-refresh");
    });

    it("clears tokens and returns false immediately when there is no refresh token to send", async () => {
      // Simulate legacy/token-only auth: no refresh token stored
      await apiClientService.setTokens("legacy-access", null);
      (global.fetch as jest.Mock).mockClear();

      const result = await apiClientService.handleUnauthorized();

      expect(result).toBe(false);
      expect(apiClientService.getAccessToken()).toBeNull();
      // No network call should be attempted — there is nothing to refresh with
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
