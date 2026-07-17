/**
 * Tests for apiFetch's 401 handling.
 *
 * Covers Brief A (auth resilience) fix #2: unbounded 401 recursion.
 * A single retry after a successful token refresh is allowed; a second
 * consecutive 401 (e.g. a revoked user, permission-scoped endpoint, or
 * reverse-proxy auth mismatch where /auth/refresh keeps succeeding but the
 * resource keeps 401ing) must be returned to the caller as-is instead of
 * triggering another refresh cycle — otherwise the client hammers the
 * server with an infinite refresh/retry loop.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

// --- Mocks ---

jest.mock("react-native-device-info", () => ({
  getSystemName: jest.fn(() => "iOS"),
  getSystemVersion: jest.fn(() => "17.0"),
  getModel: jest.fn(() => "iPhone"),
  getDeviceType: jest.fn(() => "Handset"),
  getVersion: jest.fn(() => "1.0.0"),
  getApplicationName: jest.fn(() => "SideShelf"),
}));

jest.mock("@/services/ApiClientService", () => ({
  apiClientService: {
    getBaseUrl: jest.fn(() => "http://test.example.com"),
    getAccessToken: jest.fn(() => "access-token"),
    createTimeoutSignal: jest.fn(() => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {}, 30000);
      return { controller, timeoutId };
    }),
    handleUnauthorized: jest.fn(),
  },
}));

import { apiFetch } from "@/lib/api/api";
import { apiClientService } from "@/services/ApiClientService";

const mockHandleUnauthorized = apiClientService.handleUnauthorized as jest.MockedFunction<
  typeof apiClientService.handleUnauthorized
>;

function makeResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: () => null,
    },
    clone() {
      return this;
    },
    text: async () => "",
  } as unknown as Response;
}

describe("apiFetch 401 handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns the response directly when status is not 401", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse(200));

    const res = await apiFetch("/some/path");

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockHandleUnauthorized).not.toHaveBeenCalled();
  });

  it("retries exactly once after a successful refresh on 401", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(makeResponse(401))
      .mockResolvedValueOnce(makeResponse(200));
    mockHandleUnauthorized.mockResolvedValue(true);

    const res = await apiFetch("/some/path");

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(mockHandleUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not trigger a second refresh cycle when the retry also 401s", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(makeResponse(401))
      .mockResolvedValueOnce(makeResponse(401));
    mockHandleUnauthorized.mockResolvedValue(true);

    const res = await apiFetch("/some/path");

    // The second 401 is returned as-is to the caller
    expect(res.status).toBe(401);
    // Only fetched twice: original request + the single allowed retry
    expect(global.fetch).toHaveBeenCalledTimes(2);
    // handleUnauthorized (refresh) was only attempted once, not recursively
    expect(mockHandleUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("returns the original 401 response without retrying when refresh fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse(401));
    mockHandleUnauthorized.mockResolvedValue(false);

    const res = await apiFetch("/some/path");

    expect(res.status).toBe(401);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockHandleUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("simulated server that always 401s does not loop indefinitely even across many calls", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse(401));
    mockHandleUnauthorized.mockResolvedValue(true); // refresh keeps "succeeding"

    const res = await apiFetch("/permission-scoped-resource");

    expect(res.status).toBe(401);
    // Bounded: original request + exactly one retry, never more
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(mockHandleUnauthorized).toHaveBeenCalledTimes(1);
  });
});
