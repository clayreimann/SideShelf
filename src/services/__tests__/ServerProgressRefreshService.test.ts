import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";

jest.mock("@/lib/api/endpoints", () => ({
  fetchMe: jest.fn(),
  fetchMediaProgress: jest.fn(),
}));

jest.mock("@/db/helpers/mediaProgress", () => ({
  marshalMediaProgressFromApi: jest.fn(),
  marshalMediaProgressFromAuthResponse: jest.fn(),
  upsertMediaProgress: jest.fn(),
}));

jest.mock("@/db/helpers/localListeningSessions", () => ({
  getActiveSession: jest.fn(),
  reconcileSessionPositionFromServer: jest.fn(),
}));

jest.mock("@/services/ApiClientService", () => ({
  apiClientService: { getAuthGeneration: jest.fn(), isAuthenticated: jest.fn() },
}));

import {
  marshalMediaProgressFromApi,
  marshalMediaProgressFromAuthResponse,
  upsertMediaProgress,
} from "@/db/helpers/mediaProgress";
import {
  getActiveSession,
  reconcileSessionPositionFromServer,
} from "@/db/helpers/localListeningSessions";
import { fetchMe, fetchMediaProgress } from "@/lib/api/endpoints";
import { serverProgressRefreshService } from "@/services/ServerProgressRefreshService";
import { apiClientService } from "@/services/ApiClientService";

const mockFetchMe = fetchMe as jest.MockedFunction<typeof fetchMe>;
const mockFetchMediaProgress = fetchMediaProgress as jest.MockedFunction<typeof fetchMediaProgress>;
const mockMarshalAuth = marshalMediaProgressFromAuthResponse as jest.MockedFunction<
  typeof marshalMediaProgressFromAuthResponse
>;
const mockMarshalItem = marshalMediaProgressFromApi as jest.MockedFunction<
  typeof marshalMediaProgressFromApi
>;
const mockUpsert = upsertMediaProgress as jest.MockedFunction<typeof upsertMediaProgress>;
const mockGetActiveSession = getActiveSession as jest.MockedFunction<typeof getActiveSession>;
const mockReconcile = reconcileSessionPositionFromServer as jest.MockedFunction<
  typeof reconcileSessionPositionFromServer
>;
const mockGetAuthGeneration = apiClientService.getAuthGeneration as jest.MockedFunction<
  typeof apiClientService.getAuthGeneration
>;
const mockIsAuthenticated = apiClientService.isAuthenticated as jest.MockedFunction<
  typeof apiClientService.isAuthenticated
>;

describe("ServerProgressRefreshService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsert.mockResolvedValue(undefined);
    mockReconcile.mockResolvedValue(undefined);
    mockGetAuthGeneration.mockReturnValue(1);
    mockIsAuthenticated.mockReturnValue(true);
  });

  it("refreshes all server progress into the local database", async () => {
    const response = { id: "user-1", mediaProgress: [] };
    const marshaled = [{ id: "progress-1" }];
    mockFetchMe.mockResolvedValue(response as unknown as Awaited<ReturnType<typeof fetchMe>>);
    mockMarshalAuth.mockReturnValue(
      marshaled as ReturnType<typeof marshalMediaProgressFromAuthResponse>
    );

    await serverProgressRefreshService.refreshAll();

    expect(mockMarshalAuth).toHaveBeenCalledWith(response);
    expect(mockUpsert).toHaveBeenCalledWith(marshaled);
  });

  it("does not fetch or mutate when retained identity is not authenticated", async () => {
    mockIsAuthenticated.mockReturnValue(false);

    await serverProgressRefreshService.refreshAll();
    await serverProgressRefreshService.forceResyncPosition("user-1", "item-1");

    expect(mockFetchMe).not.toHaveBeenCalled();
    expect(mockFetchMediaProgress).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("does not write a fetched response after its authenticated identity becomes stale", async () => {
    let resolveFetch!: (value: Awaited<ReturnType<typeof fetchMe>>) => void;
    mockFetchMe.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    mockMarshalAuth.mockReturnValue([{ id: "progress-1" }] as ReturnType<
      typeof marshalMediaProgressFromAuthResponse
    >);
    let current = true;

    const refresh = serverProgressRefreshService.refreshAll(() => current);
    current = false;
    resolveFetch({ id: "user-1", mediaProgress: [] } as unknown as Awaited<
      ReturnType<typeof fetchMe>
    >);
    await refresh;

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("automatically discards a refresh response after logout, server switch, or same-user reauth", async () => {
    let resolveFetch!: (value: Awaited<ReturnType<typeof fetchMe>>) => void;
    mockFetchMe.mockReturnValue(new Promise((resolve) => (resolveFetch = resolve)));
    mockMarshalAuth.mockReturnValue([{ id: "progress-1" }] as ReturnType<
      typeof marshalMediaProgressFromAuthResponse
    >);

    const refresh = serverProgressRefreshService.refreshAll();
    mockGetAuthGeneration.mockReturnValue(2);
    resolveFetch({ id: "user-1", mediaProgress: [] } as unknown as Awaited<
      ReturnType<typeof fetchMe>
    >);
    await refresh;

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("force-resyncs one item through the non-dirty reconciliation helper", async () => {
    const response = { libraryItemId: "item-1", currentTime: 450 };
    const marshaled = { id: "progress-1" };
    mockFetchMediaProgress.mockResolvedValue(
      response as Awaited<ReturnType<typeof fetchMediaProgress>>
    );
    mockMarshalItem.mockReturnValue(marshaled as ReturnType<typeof marshalMediaProgressFromApi>);
    mockGetActiveSession.mockResolvedValue({ id: "session-1" } as Awaited<
      ReturnType<typeof getActiveSession>
    >);

    await serverProgressRefreshService.forceResyncPosition("user-1", "item-1");

    expect(mockFetchMediaProgress).toHaveBeenCalledWith("item-1");
    expect(mockMarshalItem).toHaveBeenCalledWith(response, "user-1");
    expect(mockUpsert).toHaveBeenCalledWith([marshaled]);
    expect(mockGetActiveSession).toHaveBeenCalledWith("user-1", "item-1");
    expect(mockReconcile).toHaveBeenCalledWith("session-1", 450);
  });

  it("updates stored progress without reconciling when there is no active session", async () => {
    const response = { libraryItemId: "item-1", currentTime: 450 };
    mockFetchMediaProgress.mockResolvedValue(
      response as Awaited<ReturnType<typeof fetchMediaProgress>>
    );
    mockMarshalItem.mockReturnValue({} as ReturnType<typeof marshalMediaProgressFromApi>);
    mockGetActiveSession.mockResolvedValue(null);

    await serverProgressRefreshService.forceResyncPosition("user-1", "item-1");

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("does not repopulate progress when force-resync returns after auth generation changes", async () => {
    let resolveFetch!: (value: Awaited<ReturnType<typeof fetchMediaProgress>>) => void;
    mockFetchMediaProgress.mockReturnValue(new Promise((resolve) => (resolveFetch = resolve)));
    mockMarshalItem.mockReturnValue({ id: "progress-1" } as ReturnType<
      typeof marshalMediaProgressFromApi
    >);

    const refresh = serverProgressRefreshService.forceResyncPosition("user-1", "item-1");
    mockGetAuthGeneration.mockReturnValue(2);
    resolveFetch({ libraryItemId: "item-1", currentTime: 450 } as Awaited<
      ReturnType<typeof fetchMediaProgress>
    >);
    await refresh;

    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockGetActiveSession).not.toHaveBeenCalled();
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("rechecks auth generation between force-resync mutation boundaries", async () => {
    mockFetchMediaProgress.mockResolvedValue({
      libraryItemId: "item-1",
      currentTime: 450,
    } as Awaited<ReturnType<typeof fetchMediaProgress>>);
    mockMarshalItem.mockReturnValue({ id: "progress-1" } as ReturnType<
      typeof marshalMediaProgressFromApi
    >);
    mockUpsert.mockImplementation(async () => {
      mockGetAuthGeneration.mockReturnValue(2);
    });

    await serverProgressRefreshService.forceResyncPosition("user-1", "item-1");

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockGetActiveSession).not.toHaveBeenCalled();
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it("permits only inbound progress endpoints", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../ServerProgressRefreshService.ts"),
      "utf8"
    );

    expect(source).toMatch(
      /import\s+\{\s*fetchMe,\s*fetchMediaProgress\s*\}\s+from\s+"@\/lib\/api\/endpoints"/
    );
    expect(source).not.toMatch(/\b(?:createLocalSession|syncSession|closeSession)\b/);
  });

  it("migrates every previous production refresh caller to the inbound owner", () => {
    const callerPaths = [
      "../../providers/ProgressSyncProvider.tsx",
      "../../app/(tabs)/home/index.tsx",
      "../../components/library/LibraryItemDetail.tsx",
    ];

    for (const callerPath of callerPaths) {
      const source = readFileSync(path.resolve(__dirname, callerPath), "utf8");
      expect(source).not.toMatch(/progressService\.(?:fetchServerProgress|forceResyncPosition)/);
      expect(source).toContain("serverProgressRefreshService");
    }

    for (const formerLifecycleOwner of [
      "../../providers/AuthProvider.tsx",
      "../../app/_layout.tsx",
    ]) {
      const source = readFileSync(path.resolve(__dirname, formerLifecycleOwner), "utf8");
      expect(source).not.toMatch(/progressService\.(?:fetchServerProgress|forceResyncPosition)/);
      expect(source).not.toContain("serverProgressRefreshService");
    }
  });
});
