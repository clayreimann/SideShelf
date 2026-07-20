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
import { logger } from "@/lib/logger";
import { apiClientService } from "@/services/ApiClientService";

const mockHandleUnauthorized = apiClientService.handleUnauthorized as jest.MockedFunction<
  typeof apiClientService.handleUnauthorized
>;

function makeResponse(
  status: number,
  options?: { body?: string; headers?: Record<string, string> }
): Response {
  const body = options?.body ?? "";
  const headerEntries = Object.entries(options?.headers ?? {});
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key: string) =>
        headerEntries.find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1] ?? null,
      forEach: (cb: (value: string, key: string) => void) => {
        for (const [k, v] of headerEntries) cb(v, k);
      },
    },
    clone() {
      return this;
    },
    text: async () => body,
  } as unknown as Response;
}

/**
 * The mocked logger's forTag() (see src/__tests__/setup.ts) returns a fresh stub
 * object per call. api.ts creates its "api:fetch:detailed" sublogger once, at
 * module-load time — so we capture that same reference here (before any test's
 * jest.clearAllMocks() wipes the forTag mock's call history) to make assertions
 * against the exact sublogger instance apiFetch actually logs through.
 */
function getSubLoggerFor(tag: string) {
  const calls = (logger.forTag as jest.Mock).mock.calls;
  const idx = calls.findIndex((call) => call[0] === tag);
  if (idx === -1) throw new Error(`logger.forTag was never called with tag "${tag}"`);
  return (logger.forTag as jest.Mock).mock.results[idx].value;
}

const detailedSubLogger = getSubLoggerFor("api:fetch:detailed");

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
    mockHandleUnauthorized.mockResolvedValue({ status: "refreshed" });

    const res = await apiFetch("/some/path");

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(mockHandleUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not trigger a second refresh cycle when the retry also 401s", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(makeResponse(401))
      .mockResolvedValueOnce(makeResponse(401));
    mockHandleUnauthorized.mockResolvedValue({ status: "refreshed" });

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
    mockHandleUnauthorized.mockResolvedValue({ status: "rejected" });

    const res = await apiFetch("/some/path");

    expect(res.status).toBe(401);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(mockHandleUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("simulated server that always 401s does not loop indefinitely even across many calls", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse(401));
    mockHandleUnauthorized.mockResolvedValue({ status: "refreshed" }); // refresh keeps "succeeding"

    const res = await apiFetch("/permission-scoped-resource");

    expect(res.status).toBe(401);
    // Bounded: original request + exactly one retry, never more
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(mockHandleUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("throws a transient refresh failure instead of returning the resource 401", async () => {
    const refreshError = new Error("Token refresh temporarily unavailable");
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse(401));
    mockHandleUnauthorized.mockResolvedValue({ status: "transient", error: refreshError });

    await expect(apiFetch("/some/path")).rejects.toBe(refreshError);
  });

  it("throws a stale refresh cancellation instead of returning a terminal 401", async () => {
    const staleError = new Error("Request cancelled after authentication changed");
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse(401));
    mockHandleUnauthorized.mockResolvedValue({ status: "stale", error: staleError });

    await expect(apiFetch("/some/path")).rejects.toBe(staleError);
  });
});

/**
 * Tests for Brief D (logging): lazy evaluation and body/header redaction on the
 * "api:fetch:detailed" logging path.
 *
 * Problem: this path used to build its log strings — including cloning and fully
 * reading the response body — unconditionally, on every single API response in
 * the app, even though the tag is disabled by default (DEFAULT_DISABLED_TAGS in
 * src/lib/logger/index.ts). It also logged raw, unredacted bodies, so a /login or
 * /api/me response (which carries access/refresh tokens) or a /login request
 * (which carries a password) would land in the SQLite-persisted, exportable log
 * store verbatim whenever a user (or a maliciously-crafted deep link, see
 * src/app/_layout.tsx) had detailed logging turned on.
 */
describe("apiFetch detailed logging (api:fetch:detailed)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
    // Explicit default per test — clearAllMocks() clears call history but not a
    // previously-set mockReturnValue, so don't rely on cross-test carryover.
    (logger.isTagEnabled as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("never clones or reads the response body when api:fetch:detailed is disabled", async () => {
    (logger.isTagEnabled as jest.Mock).mockReturnValue(false);
    const cloneSpy = jest.fn(() => ({ text: async () => "should never be read" }));
    const response = {
      ok: true,
      status: 200,
      headers: { get: () => null, forEach: () => {} },
      clone: cloneSpy,
      text: async () => "should never be read",
    } as unknown as Response;
    (global.fetch as jest.Mock).mockResolvedValue(response);

    await apiFetch("/api/me");

    expect(cloneSpy).not.toHaveBeenCalled();
    expect(detailedSubLogger.info).not.toHaveBeenCalled();
  });

  it("does not build the detailed log string (JSON.stringify/redact work) when disabled", async () => {
    (logger.isTagEnabled as jest.Mock).mockReturnValue(false);
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse(200, { body: "{}" }));

    await apiFetch("/api/me", { method: "POST", body: JSON.stringify({ password: "hunter2" }) });

    // Even the *request*-side detailed log (no fetch/clone involved) must be skipped.
    expect(detailedSubLogger.info).not.toHaveBeenCalled();
  });

  it("logs a redacted /login-shaped response body when api:fetch:detailed is enabled", async () => {
    (logger.isTagEnabled as jest.Mock).mockReturnValue(true);
    const responseBody = JSON.stringify({
      user: { id: "u1", username: "clay" },
      accessToken: "eyJ.access.secret",
      refreshToken: "eyJ.refresh.secret",
    });
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse(200, { body: responseBody }));

    await apiFetch("/login", { method: "POST", body: JSON.stringify({ password: "hunter2" }) });

    expect(detailedSubLogger.info).toHaveBeenCalled();
    const loggedMessages = (detailedSubLogger.info as jest.Mock).mock.calls.map((c) => c[0]);
    const combined = loggedMessages.join("\n");

    // Body IS logged (the feature works) but with credentials scrubbed.
    expect(combined).toContain("clay");
    expect(combined).not.toContain("eyJ.access.secret");
    expect(combined).not.toContain("eyJ.refresh.secret");
    expect(combined).not.toContain("hunter2");
  });

  it("redacts the Authorization header in the detailed request log when enabled", async () => {
    (logger.isTagEnabled as jest.Mock).mockReturnValue(true);
    (apiClientService.getAccessToken as jest.Mock).mockReturnValue("bearer-secret-token");
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse(200, { body: "{}" }));

    await apiFetch("/api/me");

    const loggedMessages = (detailedSubLogger.info as jest.Mock).mock.calls.map((c) => c[0]);
    const combined = loggedMessages.join("\n");
    expect(combined).not.toContain("bearer-secret-token");
  });
});
