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

jest.mock("react-native-device-info", () => ({
  getSystemName: jest.fn(() => "iOS"),
  getSystemVersion: jest.fn(() => "17.0"),
  getModel: jest.fn(() => "iPhone"),
  getDeviceType: jest.fn(() => "Handset"),
  getVersion: jest.fn(() => "1.0.0"),
  getApplicationName: jest.fn(() => "SideShelf"),
}));

import { apiClientService } from "@/services/ApiClientService";
import { getItem, saveItem } from "@/lib/secureStore";
import { extractTokensFromAuthResponse } from "@/db/helpers/tokens";
import { apiFetch } from "@/lib/api/api";

let mockFetch: jest.SpiedFunction<typeof fetch>;

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

function resourceResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null, forEach: () => undefined },
    clone() {
      return this;
    },
    text: async () => "",
  } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("ApiClientService", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSaveItem.mockResolvedValue(undefined);
    // Seed a valid authenticated session before each test
    await apiClientService.setBaseUrl("http://test.example.com");
    await apiClientService.setTokens("initial-access", "initial-refresh", "alice");
    mockSaveItem.mockClear();
    mockFetch = jest.spyOn(global, "fetch");
    mockFetch.mockReset();
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
    it("clears tokens and returns rejected when refresh is rejected with 401", async () => {
      mockFetch.mockResolvedValue(jsonResponse(401, {}));

      const result = await apiClientService.handleUnauthorized();

      expect(result).toEqual({ status: "rejected" });
      expect(apiClientService.getAccessToken()).toBeNull();
      expect(apiClientService.getRefreshToken()).toBeNull();
      expect(mockSaveItem).toHaveBeenCalledWith("abs.accessToken", null);
      expect(mockSaveItem).toHaveBeenCalledWith("abs.refreshToken", null);
    });

    it("clears tokens and returns rejected when refresh is rejected with 403", async () => {
      mockFetch.mockResolvedValue(jsonResponse(403, {}));

      const result = await apiClientService.handleUnauthorized();

      expect(result).toEqual({ status: "rejected" });
      expect(apiClientService.getAccessToken()).toBeNull();
      expect(apiClientService.getRefreshToken()).toBeNull();
    });

    it("does NOT clear tokens and returns transient on a 5xx response", async () => {
      mockFetch.mockResolvedValue(jsonResponse(500, {}));

      const result = await apiClientService.handleUnauthorized();

      expect(result).toMatchObject({ status: "transient" });
      // Session survives — tokens are untouched for a later retry
      expect(apiClientService.getAccessToken()).toBe("initial-access");
      expect(apiClientService.getRefreshToken()).toBe("initial-refresh");
      expect(mockSaveItem).not.toHaveBeenCalledWith("abs.accessToken", null);
      expect(mockSaveItem).not.toHaveBeenCalledWith("abs.refreshToken", null);
    });

    it("does NOT clear tokens and returns transient when fetch throws (network offline)", async () => {
      mockFetch.mockRejectedValue(new TypeError("Network request failed"));

      const result = await apiClientService.handleUnauthorized();

      expect(result).toMatchObject({ status: "transient" });
      expect(apiClientService.getAccessToken()).toBe("initial-access");
      expect(apiClientService.getRefreshToken()).toBe("initial-refresh");
      expect(mockSaveItem).not.toHaveBeenCalledWith("abs.accessToken", null);
      expect(mockSaveItem).not.toHaveBeenCalledWith("abs.refreshToken", null);
    });

    it("does NOT clear tokens and returns transient when fetch aborts (timeout)", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      mockFetch.mockRejectedValue(abortError);

      const result = await apiClientService.handleUnauthorized();

      expect(result).toMatchObject({ status: "transient" });
      expect(apiClientService.getAccessToken()).toBe("initial-access");
      expect(apiClientService.getRefreshToken()).toBe("initial-refresh");
    });

    it("sets new tokens and returns refreshed on a successful refresh", async () => {
      mockFetch.mockResolvedValue(jsonResponse(200, { fake: true }));
      mockExtractTokens.mockReturnValue({
        accessToken: "new-access",
        refreshToken: "new-refresh",
      });

      const result = await apiClientService.handleUnauthorized();

      expect(result).toEqual({ status: "refreshed" });
      expect(apiClientService.getAccessToken()).toBe("new-access");
      expect(apiClientService.getRefreshToken()).toBe("new-refresh");
    });

    it("clears tokens and returns rejected immediately when there is no refresh token to send", async () => {
      // Simulate legacy/token-only auth: no refresh token stored
      await apiClientService.setTokens("legacy-access", null);
      mockFetch.mockClear();

      const result = await apiClientService.handleUnauthorized();

      expect(result).toEqual({ status: "rejected" });
      expect(apiClientService.getAccessToken()).toBeNull();
      // No network call should be attempted — there is nothing to refresh with
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("treats a malformed successful refresh response as a terminal rejection", async () => {
      mockFetch.mockResolvedValue({
        ...jsonResponse(200, {}),
        json: async () => {
          throw new SyntaxError("invalid JSON");
        },
      });

      await expect(apiClientService.handleUnauthorized()).resolves.toEqual({
        status: "rejected",
      });
      expect(apiClientService.getAccessToken()).toBeNull();
      expect(apiClientService.getRefreshToken()).toBeNull();
    });

    it("does not clear newer credentials when an older refresh later returns 401", async () => {
      const response = deferred<Response>();
      mockFetch.mockReturnValue(response.promise);

      const refresh = apiClientService.handleUnauthorized();
      await apiClientService.setTokens("new-login-access", "new-login-refresh", "alice");
      response.resolve(jsonResponse(401, {}));

      await expect(refresh).resolves.toMatchObject({ status: "stale" });
      expect(apiClientService.getAccessToken()).toBe("new-login-access");
      expect(apiClientService.getRefreshToken()).toBe("new-login-refresh");
      expect(mockSaveItem).not.toHaveBeenCalledWith("abs.accessToken", null);
    });

    it("lets a newer login deterministically win disk and memory while old refresh writes are pending", async () => {
      const oldWrite = deferred<void>();
      mockExtractTokens.mockReturnValue({
        accessToken: "rotated-old-access",
        refreshToken: "rotated-old-refresh",
      });
      mockFetch.mockResolvedValue(jsonResponse(200, {}));
      mockSaveItem.mockImplementation(async (key, value) => {
        if (key === "abs.accessToken" && value === "rotated-old-access") await oldWrite.promise;
      });

      const refresh = apiClientService.handleUnauthorized();
      await Promise.resolve();
      await Promise.resolve();
      const login = apiClientService.setTokens("new-login-access", "new-login-refresh", "alice");
      expect(apiClientService.getAccessToken()).toBe("new-login-access");
      oldWrite.resolve();

      await expect(refresh).resolves.toMatchObject({ status: "stale" });
      await login;
      expect(apiClientService.getAccessToken()).toBe("new-login-access");
      expect(apiClientService.getRefreshToken()).toBe("new-login-refresh");
      expect(mockSaveItem.mock.calls.slice(-2)).toEqual([
        ["abs.accessToken", "new-login-access"],
        ["abs.refreshToken", "new-login-refresh"],
      ]);
    });

    it("lets logout win disk and memory while old refresh writes are pending", async () => {
      const oldWrite = deferred<void>();
      mockExtractTokens.mockReturnValue({
        accessToken: "rotated-old-access",
        refreshToken: "rotated-old-refresh",
      });
      mockFetch.mockResolvedValue(jsonResponse(200, {}));
      mockSaveItem.mockImplementation(async (key, value) => {
        if (key === "abs.accessToken" && value === "rotated-old-access") await oldWrite.promise;
      });

      const refresh = apiClientService.handleUnauthorized();
      await Promise.resolve();
      await Promise.resolve();
      const logout = apiClientService.clearTokens();
      expect(apiClientService.getAccessToken()).toBeNull();
      oldWrite.resolve();

      await expect(refresh).resolves.toMatchObject({ status: "stale" });
      await logout;
      expect(apiClientService.getAccessToken()).toBeNull();
      expect(mockSaveItem.mock.calls.slice(-2)).toEqual([
        ["abs.accessToken", null],
        ["abs.refreshToken", null],
      ]);
    });

    it("lets a server switch restore current credentials after old refresh writes finish", async () => {
      const oldWrite = deferred<void>();
      mockExtractTokens.mockReturnValue({
        accessToken: "rotated-old-access",
        refreshToken: "rotated-old-refresh",
      });
      mockFetch.mockResolvedValue(jsonResponse(200, {}));
      mockSaveItem.mockImplementation(async (key, value) => {
        if (key === "abs.accessToken" && value === "rotated-old-access") await oldWrite.promise;
      });

      const refresh = apiClientService.handleUnauthorized();
      await Promise.resolve();
      await Promise.resolve();
      const serverSwitch = apiClientService.setBaseUrl("http://new.example.com");
      oldWrite.resolve();

      await expect(refresh).resolves.toMatchObject({ status: "stale" });
      await serverSwitch;
      expect(apiClientService.getBaseUrl()).toBe("http://new.example.com");
      expect(apiClientService.getAccessToken()).toBe("initial-access");
      expect(mockSaveItem.mock.calls.slice(-3)).toEqual([
        ["abs.serverUrl", "http://new.example.com"],
        ["abs.accessToken", "initial-access"],
        ["abs.refreshToken", "initial-refresh"],
      ]);
    });
  });

  it("advances the auth generation for explicit same-user reauthentication but not transient refresh failure", async () => {
    const initialGeneration = apiClientService.getAuthGeneration();
    await apiClientService.setTokens("same-access", "same-refresh", "alice");
    expect(apiClientService.getAuthGeneration()).toBe(initialGeneration + 1);

    mockFetch.mockRejectedValue(new TypeError("Network request failed"));
    const beforeFailure = apiClientService.getAuthGeneration();
    await expect(apiClientService.handleUnauthorized()).resolves.toMatchObject({
      status: "transient",
    });
    expect(apiClientService.getAuthGeneration()).toBe(beforeFailure);
  });

  it.each([
    ["refresh 5xx", () => Promise.resolve(jsonResponse(503, { secret: "not logged" }))],
    ["refresh network rejection", () => Promise.reject(new TypeError("Network request failed"))],
  ])(
    "surfaces %s through apiFetch as transient while preserving authentication",
    async (_name, refreshResult) => {
      mockFetch.mockResolvedValueOnce(resourceResponse(401)).mockImplementationOnce(refreshResult);

      await expect(apiFetch("/api/session/local")).rejects.toMatchObject({
        name: "TransientTokenRefreshError",
      });
      expect(apiClientService.getAccessToken()).toBe("initial-access");
      expect(apiClientService.getRefreshToken()).toBe("initial-refresh");
    }
  );

  it("returns the terminal resource 401 and clears auth when no refresh credential exists", async () => {
    await apiClientService.setTokens("legacy-access", null, "alice");
    mockFetch.mockResolvedValue(resourceResponse(401));

    const response = await apiFetch("/api/session/local");

    expect(response.status).toBe(401);
    expect(apiClientService.getAccessToken()).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
