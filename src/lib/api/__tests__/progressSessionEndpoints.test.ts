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
// eslint-disable-next-line import/first
import { logger } from "@/lib/logger";

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

function getSubLoggerFor(tag: string) {
  const calls = (logger.forTag as jest.Mock).mock.calls;
  const idx = calls.findIndex((call) => call[0] === tag);
  if (idx === -1) throw new Error(`logger.forTag was never called with tag "${tag}"`);
  return (logger.forTag as jest.Mock).mock.results[idx].value;
}

const endpointsSubLogger = getSubLoggerFor("api:endpoints");

type BodyConsumption = {
  original: number;
  clones: number[];
};

function makeResponse(
  status: number,
  body: string = "",
  headers: Record<string, string> = {},
  consumption?: BodyConsumption
): Response {
  const makeText = (recordRead: () => void) => {
    let consumed = false;

    return async () => {
      if (consumed) throw new Error("Response body was already consumed");
      consumed = true;
      recordRead();
      return body;
    };
  };
  const response = {
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
      const cloneIndex = consumption?.clones.push(0) ?? 0;
      return {
        ...response,
        text: makeText(() => {
          if (consumption) consumption.clones[cloneIndex - 1]++;
        }),
      } as unknown as Response;
    },
    text: makeText(() => {
      if (consumption) consumption.original++;
    }),
  };

  return response as unknown as Response;
}

describe("progress session endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends a stable snapshot and returns an identified local session", async () => {
    const consumption = { original: 0, clones: [] };
    (apiFetch as jest.Mock).mockResolvedValue(
      makeResponse(200, JSON.stringify({ id: SESSION_ID }), {}, consumption)
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
    expect(consumption).toEqual({ original: 1, clones: [] });
  });

  it("does not include local session identities or request body in info logs", async () => {
    (apiFetch as jest.Mock).mockResolvedValue(makeResponse(204));

    await createLocalSession(sessionParams);

    const messages = (endpointsSubLogger.info as jest.Mock).mock.calls.map(([message]) => message);
    const combined = messages.join("\n");
    expect(combined).not.toContain(SESSION_ID);
    expect(combined).not.toContain(sessionParams.userId);
    expect(combined).not.toContain(sessionParams.libraryId);
    expect(combined).not.toContain(sessionParams.libraryItemId);
    expect(combined).not.toContain(sessionParams.deviceInfo.deviceId);
    expect(combined).not.toContain(JSON.stringify({ id: SESSION_ID }));
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

  it("rejects a successful response that identifies another session", async () => {
    (apiFetch as jest.Mock).mockResolvedValue(
      makeResponse(200, JSON.stringify({ id: "a627e2e0-a6b1-42f5-bc17-21a98f44d373" }), {
        "Retry-After": "60",
      })
    );

    await expect(createLocalSession(sessionParams)).rejects.toMatchObject({
      name: "ApiResponseError",
      status: 200,
      retryAfter: 60_000,
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

  it.each([
    [JSON.stringify({ message: "Explicit JSON message" }), "Explicit JSON message"],
    [JSON.stringify({ error: "JSON error field" }), "JSON error field"],
    [JSON.stringify({}), "Failed to fetch user data"],
    ["password=leaked-password", "password=<redacted>"],
    ["", "Failed to fetch user data"],
  ])("uses the compatible error message for response body %p", async (body, message) => {
    (apiFetch as jest.Mock).mockResolvedValue(makeResponse(500, body));

    await expect(fetchMe()).rejects.toMatchObject({
      name: "ApiResponseError",
      message,
      responseBody: body ? expect.any(String) : "",
    });
  });
});
