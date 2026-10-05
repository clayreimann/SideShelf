import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

/* eslint-disable import/first -- Jest module mocks must be installed before imports. */

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

import { apiFetch } from "@/lib/api/api";
import { saveItem } from "@/lib/secureStore";
import { apiClientService } from "@/services/ApiClientService";

const mockSaveItem = saveItem as jest.MockedFunction<typeof saveItem>;
let mockFetch: jest.SpiedFunction<typeof fetch>;

function unauthorizedResponse(): Response {
  return {
    ok: false,
    status: 401,
    headers: {
      get: () => null,
      forEach: () => undefined,
    },
    clone() {
      return this;
    },
    text: async () => "Unauthorized",
  } as unknown as Response;
}

describe("ApiClientService and apiFetch auth composition", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockFetch = jest.spyOn(global, "fetch");
    mockSaveItem.mockResolvedValue(undefined);
    await apiClientService.setBaseUrl("http://test.example.com");
    await apiClientService.setTokens("legacy-access", null, "alice");
    mockSaveItem.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("preserves the original 401 without retrying when token cleanup persistence fails", async () => {
    const response = unauthorizedResponse();
    mockFetch.mockResolvedValueOnce(response);
    mockSaveItem.mockRejectedValueOnce(new Error("secure store failed"));

    await expect(apiFetch("/api/session/local", { method: "POST" })).resolves.toBe(response);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(apiClientService.getAccessToken()).toBeNull();
    expect(apiClientService.getRefreshToken()).toBeNull();
    expect(mockSaveItem).toHaveBeenCalledWith("abs.accessToken", null);
    expect(mockSaveItem).toHaveBeenCalledWith("abs.refreshToken", null);
  });
});
