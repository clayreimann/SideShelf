import { beforeEach, describe, expect, it, jest } from "@jest/globals";

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

// Imports follow the explicit Jest mocks above so this module uses mock apiFetch.
// eslint-disable-next-line import/first
import { apiFetch } from "@/lib/api/api";
// eslint-disable-next-line import/first
import { ApiResponseError, createLocalSession, fetchMe } from "@/lib/api/endpoints";

const SESSION_ID = "dc2e6ee5-58e9-4494-a8ef-3c6a1f232b13";

const sessionParams = {
  sessionId: SESSION_ID,
  userId: "user-1",
  libraryId: "library-1",
  libraryItemId: "item-1",
  startTime: 120,
  currentTime: 480,
  timeListening: 360,
  duration: 1_200,
  startedAt: 1_700_000_000_000,
  updatedAt: 1_700_000_360_000,
  deviceInfo: { deviceId: "test-device" },
};

function makeResponse(
  status: number,
  body: string = "",
  headers: Record<string, string> = {}
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name: string) {
        const entry = Object.entries(headers).find(
          ([key]) => key.toLowerCase() === name.toLowerCase()
        );
        return entry?.[1] ?? null;
      },
    },
    clone() {
      return this;
    },
    text: async () => body,
  } as unknown as Response;
}

describe("progress session endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends a stable snapshot and returns an identified local session", async () => {
    (apiFetch as jest.Mock).mockResolvedValue(
      makeResponse(200, JSON.stringify({ id: SESSION_ID }))
    );

    await expect(createLocalSession(sessionParams)).resolves.toEqual({
      id: SESSION_ID,
      duplicate: false,
    });

    const [path, options] = (apiFetch as jest.Mock).mock.calls[0];
    expect(path).toBe("/api/session/local");
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      id: SESSION_ID,
      currentTime: 480,
      timeListening: 360,
    });
  });

  it("accepts an empty successful response as the submitted local session", async () => {
    (apiFetch as jest.Mock).mockResolvedValue(makeResponse(204));

    await expect(createLocalSession(sessionParams)).resolves.toEqual({
      id: SESSION_ID,
      duplicate: false,
    });
  });

  it("accepts a duplicate response only when it identifies the submitted session", async () => {
    (apiFetch as jest.Mock).mockResolvedValue(
      makeResponse(409, JSON.stringify({ id: SESSION_ID }))
    );

    await expect(createLocalSession(sessionParams)).resolves.toEqual({
      id: SESSION_ID,
      duplicate: true,
    });
  });

  it("rejects a duplicate response that identifies another session", async () => {
    (apiFetch as jest.Mock).mockResolvedValue(
      makeResponse(409, JSON.stringify({ id: "a627e2e0-a6b1-42f5-bc17-21a98f44d373" }))
    );

    await expect(createLocalSession(sessionParams)).rejects.toMatchObject({
      name: "ApiResponseError",
      status: 409,
    });
  });

  it.each([
    [401, undefined],
    [404, undefined],
    [429, 60_000],
    [500, undefined],
  ])(
    "preserves HTTP status %i without retaining unredacted response data",
    async (status, retryAfter) => {
      const secret = "leaked-access-token";
      (apiFetch as jest.Mock).mockResolvedValue(
        makeResponse(
          status,
          JSON.stringify({ error: "Request failed", accessToken: secret }),
          status === 429 ? { "Retry-After": "60" } : {}
        )
      );

      try {
        await fetchMe();
        throw new Error("Expected fetchMe to reject");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiResponseError);
        expect(error).toMatchObject({ status, retryAfter });
        expect((error as ApiResponseError).responseBody).not.toContain(secret);
        expect((error as ApiResponseError).responseBody).toContain("<redacted>");
      }
    }
  );

  it("parses an HTTP-date Retry-After as a delay in milliseconds", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-20T12:00:00.000Z"));
    (apiFetch as jest.Mock).mockResolvedValue(
      makeResponse(429, JSON.stringify({ error: "Slow down" }), {
        "Retry-After": "Mon, 20 Jul 2026 12:01:30 GMT",
      })
    );

    await expect(fetchMe()).rejects.toMatchObject({ status: 429, retryAfter: 90_000 });
    jest.useRealTimers();
  });
});
