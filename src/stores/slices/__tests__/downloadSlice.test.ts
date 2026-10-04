/**
 * Regression tests for the Home "Downloaded" shelf not refreshing when a download
 * completes mid-session.
 *
 * completeDownload() (fired from a download's progress callback once status reaches
 * "completed") only ever updated downloadSlice's own downloadedItems set. Nothing told
 * homeSlice — which owns the data actually rendered in the Home screen's "Downloaded"
 * shelf — that a new item had finished downloading. homeSlice's cached `downloaded`
 * array (and lastFetchTime) stays stale until the 5-minute cache window lapses or the
 * app is relaunched, which is why only a fresh launch ever picked up new downloads.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { createDownloadSlice, type DownloadSlice } from "../downloadSlice";

jest.mock("@/db/client", () => ({
  db: {
    selectDistinct: jest.fn(() => ({
      from: jest.fn(() => ({
        innerJoin: jest.fn(() => ({
          innerJoin: jest.fn(() => ({
            innerJoin: jest.fn(() => ({
              where: jest.fn(() => Promise.resolve([])),
            })),
          })),
        })),
      })),
    })),
  },
}));

jest.mock("@/services/DownloadService", () => ({
  downloadService: {
    initialize: jest.fn(),
    getActiveDownloadIds: jest.fn(() => []),
    subscribeToProgress: jest.fn(),
    getCurrentProgress: jest.fn(),
    isLibraryItemDownloaded: jest.fn(),
    startDownload: jest.fn(),
    deleteDownloadedLibraryItem: jest.fn(),
  },
}));

const { downloadService } = require("@/services/DownloadService");

function makeProgress(itemId: string, status: "downloading" | "completed") {
  return {
    libraryItemId: itemId,
    totalFiles: 1,
    downloadedFiles: status === "completed" ? 1 : 0,
    currentFile: "track1.mp3",
    fileProgress: status === "completed" ? 1 : 0.5,
    totalProgress: status === "completed" ? 1 : 0.5,
    bytesDownloaded: 0,
    totalBytes: 0,
    fileBytesDownloaded: 0,
    fileTotalBytes: 0,
    downloadSpeed: 0,
    speedSampleCount: 0,
    status,
  };
}

describe("DownloadSlice — Home downloaded-shelf reconciliation", () => {
  let store: UseBoundStore<StoreApi<DownloadSlice>>;
  let refreshSection: jest.Mock<(section: string, userId: string) => Promise<void>>;

  beforeEach(() => {
    jest.clearAllMocks();
    store = create<DownloadSlice>()((set, get) => ({ ...createDownloadSlice(set, get) }));

    refreshSection = jest
      .fn<(section: string, userId: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    // downloadSlice and homeSlice are combined into one app store in production; attach
    // a stub the same way the real store would provide it, so we can verify the wiring.
    (store as any).setState((state: any) => ({ ...state, refreshSection }));
  });

  it("refreshes the home downloaded section when a new download completes", async () => {
    downloadService.startDownload.mockImplementation(
      async (itemId: string, onProgress: (p: unknown) => void) => {
        onProgress(makeProgress(itemId, "downloading"));
        onProgress(makeProgress(itemId, "completed"));
      }
    );

    await store.getState().startDownload("item-1");

    expect(store.getState().downloads.downloadedItems.has("item-1")).toBe(true);
    expect(refreshSection).toHaveBeenCalledWith("downloaded", expect.anything());
  });

  it("does not refresh home when a download errors instead of completing", async () => {
    downloadService.startDownload.mockImplementation(
      async (itemId: string, onProgress: (p: unknown) => void) => {
        onProgress({ ...makeProgress(itemId, "downloading"), status: "error", error: "boom" });
      }
    );

    await store.getState().startDownload("item-1");

    expect(refreshSection).not.toHaveBeenCalled();
  });
});
