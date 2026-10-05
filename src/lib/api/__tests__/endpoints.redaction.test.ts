/**
 * Tests for endpoints.ts's handleResponseError() redaction (Brief D audit finding).
 *
 * handleResponseError() logs the raw response body via log.error/log.warn on
 * every failed request across the app — including a failed /login — and this
 * path is NOT gated behind the "api:fetch:detailed" tag (it's always on).
 * If a server ever echoes request/session data back in an error body, that
 * body must not land in the SQLite-persisted log store unredacted.
 */

import { describe, expect, it, jest } from "@jest/globals";

jest.mock("@/lib/api/api", () => ({
  apiFetch: jest.fn(),
}));

jest.mock("react-native-device-info", () => ({
  getSystemName: jest.fn(() => "iOS"),
  getSystemVersion: jest.fn(() => "17.0"),
  getModel: jest.fn(() => "iPhone"),
  getDeviceType: jest.fn(() => "Handset"),
  getVersion: jest.fn(() => "1.0.0"),
  getBuildNumber: jest.fn(() => "1"),
  getDeviceName: jest.fn(async () => "Test Device"),
  getManufacturer: jest.fn(async () => "Apple"),
  getDeviceId: jest.fn(() => "device-id"),
}));

import { fetchMe } from "@/lib/api/endpoints";
import { apiFetch } from "@/lib/api/api";
import { logger, type SubLogger } from "@/lib/logger";

function getSubLoggerFor(tag: string): SubLogger {
  const mockForTag = jest.mocked(logger.forTag);
  const calls = mockForTag.mock.calls;
  const idx = calls.findIndex((call) => call[0] === tag);
  if (idx === -1) throw new Error(`logger.forTag was never called with tag "${tag}"`);
  const result = mockForTag.mock.results[idx].value;
  if (!isSubLogger(result))
    throw new Error(`logger.forTag did not return a logger for tag "${tag}"`);
  return result;
}

function isSubLogger(value: unknown): value is SubLogger {
  return (
    typeof value === "object" &&
    value !== null &&
    "debug" in value &&
    "info" in value &&
    "warn" in value &&
    "error" in value
  );
}

const endpointsSubLogger = getSubLoggerFor("api:endpoints");

function makeErrorResponse(body: string): Response {
  return {
    ok: false,
    status: 500,
    clone() {
      return this;
    },
    text: async () => body,
  } as unknown as Response;
}

describe("handleResponseError body redaction", () => {
  it("redacts credential fields in the logged error body while the thrown error is unaffected", async () => {
    const body = JSON.stringify({
      message: "Session invalid",
      accessToken: "leaked-access-token",
      refreshToken: "leaked-refresh-token",
    });
    jest.mocked(apiFetch).mockResolvedValue(makeErrorResponse(body));

    await expect(fetchMe()).rejects.toThrow("Session invalid");

    const loggedMessages = jest
      .mocked(endpointsSubLogger.error)
      .mock.calls.map(([message]) => message);
    const combined = loggedMessages.join("\n");
    expect(combined).not.toContain("leaked-access-token");
    expect(combined).not.toContain("leaked-refresh-token");
    // Non-sensitive context is preserved for debuggability.
    expect(combined).toContain("Session invalid");
  });
});
