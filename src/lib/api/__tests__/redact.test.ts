/**
 * Tests for redactBody — the credential-scrubbing helper used before any
 * request/response body is written to the logger.
 *
 * Covers Brief D: tokens and passwords must never reach the SQLite-persisted
 * (and exportable-via-Share) log store, even in a /login request body
 * (contains password) or a /login or /api/me response body (contains
 * access/refresh tokens).
 */

import { describe, expect, it } from "@jest/globals";
import { redactBody } from "@/lib/api/redact";

describe("redactBody", () => {
  it("redacts a /login-shaped request body (password) while keeping other fields intact", () => {
    const body = JSON.stringify({ username: "clay", password: "hunter2" });

    const result = redactBody(body);
    const parsed = JSON.parse(result);

    expect(parsed.username).toBe("clay");
    expect(parsed.password).toBe("<redacted>");
    expect(result).not.toContain("hunter2");
  });

  it("redacts a /login-shaped response body (user + tokens) while keeping other fields intact", () => {
    const body = JSON.stringify({
      user: { id: "u1", username: "clay" },
      accessToken: "eyJabc.access.def",
      refreshToken: "eyJabc.refresh.def",
    });

    const result = redactBody(body);
    const parsed = JSON.parse(result);

    expect(parsed.user).toEqual({ id: "u1", username: "clay" });
    expect(parsed.accessToken).toBe("<redacted>");
    expect(parsed.refreshToken).toBe("<redacted>");
    expect(result).not.toContain("eyJabc.access.def");
    expect(result).not.toContain("eyJabc.refresh.def");
  });

  it("redacts a /api/me-shaped response body (nested token field) while keeping other fields intact", () => {
    const body = JSON.stringify({
      id: "u1",
      username: "clay",
      token: "raw-session-token",
      permissions: { download: true, update: false },
    });

    const result = redactBody(body);
    const parsed = JSON.parse(result);

    expect(parsed.id).toBe("u1");
    expect(parsed.username).toBe("clay");
    expect(parsed.token).toBe("<redacted>");
    expect(parsed.permissions).toEqual({ download: true, update: false });
    expect(result).not.toContain("raw-session-token");
  });

  it("redacts sensitive fields nested inside arrays and objects", () => {
    const body = JSON.stringify({
      users: [
        { username: "a", password: "secret-a" },
        { username: "b", password: "secret-b" },
      ],
    });

    const result = redactBody(body);

    expect(result).not.toContain("secret-a");
    expect(result).not.toContain("secret-b");
    expect(result).toContain('"username":"a"');
    expect(result).toContain('"username":"b"');
  });

  it("falls back to a regex-based scrub for non-JSON (form-encoded) bodies", () => {
    const body = "username=clay&password=hunter2&remember=true";

    const result = redactBody(body);

    expect(result).not.toContain("hunter2");
    expect(result).toContain("username=clay");
    expect(result).toContain("remember=true");
    expect(result).toContain("password=<redacted>");
  });

  it("falls back to a regex-based scrub for non-JSON plain text bodies containing a token-shaped field", () => {
    const body = 'plain text error: token: "abc123secret" was invalid';

    const result = redactBody(body);

    expect(result).not.toContain("abc123secret");
  });

  it("passes through non-sensitive plain text unchanged", () => {
    const body = "OK";

    expect(redactBody(body)).toBe("OK");
  });

  it("passes through empty and nullish bodies without throwing", () => {
    expect(redactBody("")).toBe("");
    expect(redactBody(undefined)).toBe("undefined");
    expect(redactBody(null)).toBe("null");
  });
});
