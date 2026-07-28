/**
 * Regression tests for the Home downloaded shelf.
 */

import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import * as homeScreenHelpers from "@/db/helpers/homeScreen";
import { downloadService } from "@/services/DownloadService";
import { createHomeSlice, type HomeSlice } from "../homeSlice";

jest.mock("@/db/helpers/homeScreen", () => ({
  getContinueListeningItems: jest.fn(),
  getDownloadedItems: jest.fn(),
  getHomeScreenData: jest.fn(),
  getListenAgainItems: jest.fn(),
}));

jest.mock("@/services/DownloadService", () => ({
  downloadService: {
    isLibraryItemDownloaded: jest.fn(),
  },
}));

const downloadedCandidates = [
  { id: "complete-book", title: "Complete" },
  { id: "partial-book", title: "Partial" },
];

describe("HomeSlice downloaded shelf", () => {
  let store: UseBoundStore<StoreApi<HomeSlice>>;

  beforeEach(() => {
    jest.clearAllMocks();
    store = create<HomeSlice>()((set, get) => ({ ...createHomeSlice(set, get) }));

    homeScreenHelpers.getContinueListeningItems.mockResolvedValue([]);
    homeScreenHelpers.getDownloadedItems.mockResolvedValue(downloadedCandidates);
    homeScreenHelpers.getListenAgainItems.mockResolvedValue([]);
    homeScreenHelpers.getHomeScreenData.mockResolvedValue({
      continueListening: [],
      downloaded: downloadedCandidates,
      listenAgain: [],
    });
    downloadService.isLibraryItemDownloaded.mockImplementation(
      async (libraryItemId: string) => libraryItemId === "complete-book"
    );
  });

  it("initialization excludes incomplete downloaded candidates", async () => {
    await store.getState().initializeHome("user-1");

    expect(store.getState().home.downloaded).toEqual([{ id: "complete-book", title: "Complete" }]);
  });

  it("whole-home refresh excludes incomplete downloaded candidates", async () => {
    await store.getState().refreshHome("user-1", true);

    expect(store.getState().home.downloaded).toEqual([{ id: "complete-book", title: "Complete" }]);
  });

  it("downloaded-section refresh excludes incomplete downloaded candidates", async () => {
    await store.getState().refreshSection("downloaded", "user-1");

    expect(store.getState().home.downloaded).toEqual([{ id: "complete-book", title: "Complete" }]);
  });
});
