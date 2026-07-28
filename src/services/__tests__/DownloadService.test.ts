/**
 * Tests for DownloadService facade
 *
 * Focuses on:
 *   - getInstance() singleton behavior
 *   - initialize() calls getExistingDownloadTasks (mainline API)
 *   - isDownloadActive() / getDownloadStatus() — direct Map reads (NOT delegated)
 *   - subscribeToProgress / unsubscribeFromProgress / getCurrentProgress / rewireProgressCallbacks
 *   - pauseDownload / resumeDownload / cancelDownload
 *   - startDownload error paths
 *   - startDownload() calls createDownloadTask + task.start() (mainline API)
 *   - done() handler applies iCloud exclusion via setExcludeFromBackup
 *   - Delegation: isLibraryItemDownloaded / getDownloadProgress / getDownloadedSize
 *     delegate to statusCollaborator; repairDownloadStatus / deleteDownloadedLibraryItem
 *     delegate to repairCollaborator
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { DownloadInfo, DownloadProgress } from "@/types/services";
import type {
  DoneHandler,
  DownloadTask,
  ErrorHandler,
  ProgressHandler,
} from "@kesha-antonov/react-native-background-downloader";
import { DownloadService } from "../DownloadService";

// --- Mocks ---

jest.mock("@kesha-antonov/react-native-background-downloader", () => ({
  default: undefined,
  createDownloadTask: jest.fn(),
  getExistingDownloadTasks: jest.fn(() => Promise.resolve([])),
  setConfig: jest.fn(),
  completeHandler: jest.fn(),
}));

jest.mock("@/db/helpers/audioFiles", () => ({
  markAudioFileAsDownloaded: jest.fn(),
  clearAudioFileDownloadStatus: jest.fn(),
}));

jest.mock("@/db/helpers/combinedQueries", () => ({
  getAudioFilesWithDownloadInfo: jest.fn(),
}));

jest.mock("@/db/helpers/mediaMetadata", () => ({
  getMediaMetadataByLibraryItemId: jest.fn(),
}));

jest.mock("@/services/ApiClientService", () => ({
  apiClientService: {
    getBaseUrl: jest.fn(() => "http://localhost:13378"),
    getAccessToken: jest.fn(() => "mock-token"),
  },
}));

// Mock collaborator methods stored as module-level spies so we can verify delegation
const mockStatusCollaborator = {
  isLibraryItemDownloaded: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  getDownloadProgress: jest
    .fn<() => Promise<{ downloaded: number; total: number; progress: number }>>()
    .mockResolvedValue({ downloaded: 2, total: 3, progress: 2 / 3 }),
  getDownloadedSize: jest.fn<() => Promise<number>>().mockResolvedValue(1024 * 1024),
};
const mockRepairCollaborator = {
  repairDownloadStatus: jest.fn<() => Promise<number>>().mockResolvedValue(1),
  deleteDownloadedLibraryItem: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

jest.mock("@/services/download/DownloadStatusCollaborator", () => ({
  DownloadStatusCollaborator: jest.fn().mockImplementation(() => mockStatusCollaborator),
}));

jest.mock("@/services/download/DownloadRepairCollaborator", () => ({
  DownloadRepairCollaborator: jest.fn().mockImplementation(() => mockRepairCollaborator),
}));

jest.mock("@/lib/iCloudBackupExclusion", () => ({
  setExcludeFromBackup: jest.fn(),
}));

jest.mock("@/lib/covers", () => ({
  cacheCoverIfMissing: jest.fn(),
}));

jest.mock("@/lib/fileSystem", () => ({
  constructDownloadUrl: jest.fn(() => "http://localhost:13378/download/item-1/file-1"),
  downloadFileExists: jest.fn(() => false),
  deleteDownloadFile: jest.fn(),
  ensureDownloadsDirectory: jest.fn(),
  getDownloadPath: jest.fn(
    (libraryItemId: string, filename: string) => `/documents/downloads/${libraryItemId}/${filename}`
  ),
  getDownloadsDirectory: jest.fn(() => ({
    exists: false,
    delete: jest.fn(),
  })),
  verifyFileExists: jest.fn(),
}));

// Import typed mocks for DB helpers
import { getMediaMetadataByLibraryItemId } from "@/db/helpers/mediaMetadata";
import { getAudioFilesWithDownloadInfo } from "@/db/helpers/combinedQueries";
import { createSpeedTracker } from "@/lib/downloads/speedTracker";
import {
  createDownloadTask,
  getExistingDownloadTasks,
  setConfig,
} from "@kesha-antonov/react-native-background-downloader";

const mockGetMediaMetadataByLibraryItemId = getMediaMetadataByLibraryItemId as jest.MockedFunction<
  typeof getMediaMetadataByLibraryItemId
>;
const mockGetAudioFilesWithDownloadInfo = getAudioFilesWithDownloadInfo as jest.MockedFunction<
  typeof getAudioFilesWithDownloadInfo
>;
const mockCreateDownloadTask = createDownloadTask as jest.MockedFunction<typeof createDownloadTask>;
const mockGetExistingDownloadTasks = getExistingDownloadTasks as jest.MockedFunction<
  typeof getExistingDownloadTasks
>;
const mockSetConfig = setConfig as jest.MockedFunction<typeof setConfig>;

// --- Test helpers ---

/** Reset DownloadService singleton between tests */
function resetSingleton() {
  (DownloadService as any).instance = undefined;
}

/**
 * Inject a fake DownloadInfo entry into the service's activeDownloads Map.
 * This allows testing methods that operate on in-progress downloads without
 * needing to run the full startDownload() lifecycle.
 */
function injectActiveDownload(instance: DownloadService, libraryItemId: string): DownloadInfo {
  const progressCallback = jest.fn();
  const mockTask = {
    pause: jest.fn(),
    resume: jest.fn(),
    stop: jest.fn(),
    state: "DOWNLOADING",
  };
  const speedTracker = createSpeedTracker();
  const downloadInfo: DownloadInfo = {
    tasks: [{ task: mockTask as any, audioFileId: "af-1", filename: "ch1.mp3", size: 1000 }],
    progressCallbacks: new Set([progressCallback]),
    totalBytes: 1000,
    downloadedBytes: 0,
    isPaused: false,
    speedTracker,
    completedFileIds: new Set(),
    completedBytes: 0,
    inFlightBytes: new Map(),
  };
  (instance as any).activeDownloads.set(libraryItemId, downloadInfo);
  return downloadInfo;
}

// --- Tests ---

describe("DownloadService facade", () => {
  beforeEach(() => {
    resetSingleton();
    jest.clearAllMocks();
  });

  afterEach(() => {
    resetSingleton();
  });

  describe("getInstance()", () => {
    it("returns a DownloadService instance", () => {
      const instance = DownloadService.getInstance();
      expect(instance).toBeInstanceOf(DownloadService);
    });

    it("returns the same singleton on subsequent calls", () => {
      const a = DownloadService.getInstance();
      const b = DownloadService.getInstance();
      expect(a).toBe(b);
    });
  });

  describe("initialize()", () => {
    it("calls setConfig and getExistingDownloadTasks (mainline named exports)", async () => {
      const instance = DownloadService.getInstance();
      await instance.initialize();
      expect(mockSetConfig).toHaveBeenCalledTimes(1);
      expect(mockGetExistingDownloadTasks).toHaveBeenCalledTimes(1);
    });

    it("calls getExistingDownloadTasks exactly once", async () => {
      const instance = DownloadService.getInstance();
      await instance.initialize();
      expect(mockGetExistingDownloadTasks).toHaveBeenCalledTimes(1);
    });

    it("completes without error when getExistingDownloadTasks returns empty array", async () => {
      mockGetExistingDownloadTasks.mockResolvedValueOnce([]);
      const instance = DownloadService.getInstance();
      await expect(instance.initialize()).resolves.not.toThrow();
      expect(mockGetExistingDownloadTasks).toHaveBeenCalledTimes(1);
    });

    it("does not re-initialize if already initialized", async () => {
      const instance = DownloadService.getInstance();
      await instance.initialize();
      await instance.initialize();
      expect(mockSetConfig).toHaveBeenCalledTimes(1);
    });
  });

  describe("isDownloadActive()", () => {
    it("returns false for an unknown item (Map read, not delegated)", () => {
      const instance = DownloadService.getInstance();
      expect(instance.isDownloadActive("item-not-tracked")).toBe(false);
    });
  });

  describe("getDownloadStatus()", () => {
    it("returns undefined for an unknown item (Map read, not delegated)", () => {
      const instance = DownloadService.getInstance();
      expect(instance.getDownloadStatus("item-not-tracked")).toBeUndefined();
    });
  });

  describe("delegation to statusCollaborator", () => {
    it("isLibraryItemDownloaded delegates to statusCollaborator", async () => {
      const instance = DownloadService.getInstance();
      const result = await instance.isLibraryItemDownloaded("item-1");
      expect(result).toBe(true);
      expect(mockStatusCollaborator.isLibraryItemDownloaded).toHaveBeenCalledWith("item-1");
    });

    it("getDownloadProgress delegates to statusCollaborator", async () => {
      const instance = DownloadService.getInstance();
      const result = await instance.getDownloadProgress("item-1");
      expect(result).toEqual({ downloaded: 2, total: 3, progress: 2 / 3 });
      expect(mockStatusCollaborator.getDownloadProgress).toHaveBeenCalledWith("item-1");
    });

    it("getDownloadedSize delegates to statusCollaborator", async () => {
      const instance = DownloadService.getInstance();
      const result = await instance.getDownloadedSize("item-1");
      expect(result).toBe(1024 * 1024);
      expect(mockStatusCollaborator.getDownloadedSize).toHaveBeenCalledWith("item-1");
    });
  });

  describe("delegation to repairCollaborator", () => {
    it("repairDownloadStatus delegates to repairCollaborator", async () => {
      const instance = DownloadService.getInstance();
      const result = await instance.repairDownloadStatus("item-1");
      expect(result).toBe(1);
      expect(mockRepairCollaborator.repairDownloadStatus).toHaveBeenCalledWith("item-1");
    });

    it("deleteDownloadedLibraryItem delegates to repairCollaborator", async () => {
      const instance = DownloadService.getInstance();
      await instance.deleteDownloadedLibraryItem("item-1");
      expect(mockRepairCollaborator.deleteDownloadedLibraryItem).toHaveBeenCalledWith("item-1");
    });
  });

  // ─── isDownloadActive / getDownloadStatus with active download ──────────────

  describe("isDownloadActive() with active download", () => {
    it("returns true when download is tracked in Map", () => {
      const instance = DownloadService.getInstance();
      injectActiveDownload(instance, "item-active");
      expect(instance.isDownloadActive("item-active")).toBe(true);
    });
  });

  describe("getDownloadStatus() with active download", () => {
    it("returns DownloadInfo when download is tracked in Map", () => {
      const instance = DownloadService.getInstance();
      const info = injectActiveDownload(instance, "item-active");
      expect(instance.getDownloadStatus("item-active")).toBe(info);
    });
  });

  // ─── subscribeToProgress ────────────────────────────────────────────────────

  describe("subscribeToProgress()", () => {
    it("returns unsubscribe function even when item is not in activeDownloads", () => {
      const instance = DownloadService.getInstance();
      const cb = jest.fn();
      const unsub = instance.subscribeToProgress("unknown-item", cb);
      expect(typeof unsub).toBe("function");
    });

    it("adds callback to progressCallbacks when download is active", () => {
      const instance = DownloadService.getInstance();
      const info = injectActiveDownload(instance, "item-1");
      const initialCount = info.progressCallbacks.size;
      const cb = jest.fn();
      instance.subscribeToProgress("item-1", cb);
      expect(info.progressCallbacks.size).toBe(initialCount + 1);
    });

    it("immediately invokes callback with lastProgressUpdate when available", () => {
      const instance = DownloadService.getInstance();
      const info = injectActiveDownload(instance, "item-1");
      const fakeProgress: DownloadProgress = {
        libraryItemId: "item-1",
        totalFiles: 1,
        downloadedFiles: 0,
        currentFile: "ch1.mp3",
        fileProgress: 0.5,
        totalProgress: 0.5,
        bytesDownloaded: 500,
        totalBytes: 1000,
        fileBytesDownloaded: 500,
        fileTotalBytes: 1000,
        downloadSpeed: 100,
        speedSampleCount: 1,
        status: "downloading",
        canPause: true,
        canResume: false,
      };
      info.speedTracker.lastProgressUpdate = fakeProgress;
      const cb = jest.fn();
      instance.subscribeToProgress("item-1", cb);
      expect(cb).toHaveBeenCalledWith(fakeProgress);
    });

    it("returned unsubscribe function removes callback from progressCallbacks", () => {
      const instance = DownloadService.getInstance();
      const info = injectActiveDownload(instance, "item-1");
      const cb = jest.fn();
      const unsub = instance.subscribeToProgress("item-1", cb);
      expect(info.progressCallbacks.has(cb)).toBe(true);
      unsub();
      expect(info.progressCallbacks.has(cb)).toBe(false);
    });
  });

  // ─── unsubscribeFromProgress ────────────────────────────────────────────────

  describe("unsubscribeFromProgress()", () => {
    it("removes callback from progressCallbacks for active download", () => {
      const instance = DownloadService.getInstance();
      const info = injectActiveDownload(instance, "item-1");
      const cb = jest.fn();
      info.progressCallbacks.add(cb);
      instance.unsubscribeFromProgress("item-1", cb);
      expect(info.progressCallbacks.has(cb)).toBe(false);
    });

    it("is a no-op for unknown libraryItemId", () => {
      const instance = DownloadService.getInstance();
      const cb = jest.fn();
      // Should not throw
      expect(() => instance.unsubscribeFromProgress("unknown-item", cb)).not.toThrow();
    });
  });

  // ─── getCurrentProgress ──────────────────────────────────────────────────────

  describe("getCurrentProgress()", () => {
    it("returns null for unknown item", () => {
      const instance = DownloadService.getInstance();
      expect(instance.getCurrentProgress("unknown-item")).toBeNull();
    });

    it("returns lastProgressUpdate when available", () => {
      const instance = DownloadService.getInstance();
      const info = injectActiveDownload(instance, "item-1");
      const fakeProgress: DownloadProgress = {
        libraryItemId: "item-1",
        totalFiles: 1,
        downloadedFiles: 0,
        currentFile: "ch1.mp3",
        fileProgress: 0.3,
        totalProgress: 0.3,
        bytesDownloaded: 300,
        totalBytes: 1000,
        fileBytesDownloaded: 300,
        fileTotalBytes: 1000,
        downloadSpeed: 50,
        speedSampleCount: 1,
        status: "downloading",
        canPause: true,
        canResume: false,
      };
      info.speedTracker.lastProgressUpdate = fakeProgress;
      expect(instance.getCurrentProgress("item-1")).toBe(fakeProgress);
    });

    it("returns null when item is active but no progress update yet", () => {
      const instance = DownloadService.getInstance();
      injectActiveDownload(instance, "item-1");
      // speedTracker.lastProgressUpdate is null by default
      expect(instance.getCurrentProgress("item-1")).toBeNull();
    });
  });

  // ─── rewireProgressCallbacks ─────────────────────────────────────────────────

  describe("rewireProgressCallbacks()", () => {
    it("adds the new callback for active download", () => {
      const instance = DownloadService.getInstance();
      const info = injectActiveDownload(instance, "item-1");
      const newCb = jest.fn();
      instance.rewireProgressCallbacks("item-1", newCb);
      expect(info.progressCallbacks.has(newCb)).toBe(true);
    });

    it("removes only the previously rewired callback, leaving independent subscribers intact", () => {
      // Regression test: the old implementation called progressCallbacks.clear(),
      // which silently dropped every other subscriber (e.g. a second screen showing
      // the same download's progress) whenever any view rewired its own callback.
      const instance = DownloadService.getInstance();
      const info = injectActiveDownload(instance, "item-1");

      // An independent subscriber, added via subscribeToProgress — not part of any
      // rewiring relationship.
      const independentCb = jest.fn();
      instance.subscribeToProgress("item-1", independentCb);

      const rewireCbA = jest.fn();
      instance.rewireProgressCallbacks("item-1", rewireCbA);
      expect(info.progressCallbacks.has(rewireCbA)).toBe(true);
      expect(info.progressCallbacks.has(independentCb)).toBe(true);

      // A later rewire (e.g. the same view rebuilding) should drop rewireCbA but must
      // not touch independentCb.
      const rewireCbB = jest.fn();
      instance.rewireProgressCallbacks("item-1", rewireCbB);
      expect(info.progressCallbacks.has(rewireCbA)).toBe(false);
      expect(info.progressCallbacks.has(rewireCbB)).toBe(true);
      expect(info.progressCallbacks.has(independentCb)).toBe(true);

      // The untouched subscriber must still receive updates.
      const progress = {
        libraryItemId: "item-1",
        totalFiles: 1,
        downloadedFiles: 0,
        currentFile: "ch1.mp3",
        fileProgress: 0.5,
        totalProgress: 0.5,
        bytesDownloaded: 500,
        totalBytes: 1000,
        fileBytesDownloaded: 500,
        fileTotalBytes: 1000,
        downloadSpeed: 0,
        speedSampleCount: 0,
        status: "downloading",
        canPause: true,
        canResume: false,
      } as DownloadProgress;
      (instance as any).notifyProgressCallbacks(info, progress);

      expect(independentCb).toHaveBeenCalledWith(progress);
      expect(rewireCbB).toHaveBeenCalledWith(progress);
      expect(rewireCbA).not.toHaveBeenCalledWith(progress);
    });

    it("returns an unsubscribe function that removes only the rewired callback", () => {
      const instance = DownloadService.getInstance();
      const info = injectActiveDownload(instance, "item-1");
      const independentCb = jest.fn();
      instance.subscribeToProgress("item-1", independentCb);

      const newCb = jest.fn();
      const unsubscribe = instance.rewireProgressCallbacks("item-1", newCb);
      unsubscribe();

      expect(info.progressCallbacks.has(newCb)).toBe(false);
      expect(info.progressCallbacks.has(independentCb)).toBe(true);
    });

    it("returns no-op function for unknown item", () => {
      const instance = DownloadService.getInstance();
      const cb = jest.fn();
      const result = instance.rewireProgressCallbacks("unknown-item", cb);
      expect(typeof result).toBe("function");
      // Calling it should not throw
      expect(() => result()).not.toThrow();
    });
  });

  // ─── pauseDownload ───────────────────────────────────────────────────────────

  describe("pauseDownload()", () => {
    it("calls pause() on all tasks and sets isPaused=true", () => {
      const instance = DownloadService.getInstance();
      const info = injectActiveDownload(instance, "item-1");
      instance.pauseDownload("item-1");
      expect(info.tasks[0].task.pause).toHaveBeenCalledTimes(1);
      expect(info.isPaused).toBe(true);
    });

    it("triggers progress update with paused status when callbacks exist and lastUpdate set", () => {
      const instance = DownloadService.getInstance();
      const info = injectActiveDownload(instance, "item-1");
      const progressCb = jest.fn();
      info.progressCallbacks.add(progressCb);
      // Set lastProgressUpdate so the 'if (lastUpdate)' path is taken
      info.speedTracker.lastProgressUpdate = {
        libraryItemId: "item-1",
        totalFiles: 1,
        downloadedFiles: 0,
        currentFile: "ch1.mp3",
        fileProgress: 0.3,
        totalProgress: 0.3,
        bytesDownloaded: 300,
        totalBytes: 1000,
        fileBytesDownloaded: 300,
        fileTotalBytes: 1000,
        downloadSpeed: 50,
        speedSampleCount: 1,
        status: "downloading",
        canPause: true,
        canResume: false,
      } as DownloadProgress;

      instance.pauseDownload("item-1");
      // Should notify with paused status
      expect(progressCb).toHaveBeenCalledWith(
        expect.objectContaining({ status: "paused", canPause: false, canResume: true })
      );
    });

    it("triggers progress update with fallback when lastUpdate is null", () => {
      const instance = DownloadService.getInstance();
      const info = injectActiveDownload(instance, "item-1");
      const progressCb = jest.fn();
      info.progressCallbacks.add(progressCb);
      // lastProgressUpdate is null/undefined by default
      expect(info.speedTracker.lastProgressUpdate).toBeFalsy();

      instance.pauseDownload("item-1");
      // Should notify with fallback progress (status=paused)
      expect(progressCb).toHaveBeenCalledWith(
        expect.objectContaining({ status: "paused", canPause: false, canResume: true })
      );
    });

    it("is a no-op for unknown item", () => {
      const instance = DownloadService.getInstance();
      expect(() => instance.pauseDownload("unknown-item")).not.toThrow();
    });

    it("is a no-op if already paused", () => {
      const instance = DownloadService.getInstance();
      const info = injectActiveDownload(instance, "item-1");
      info.isPaused = true;
      instance.pauseDownload("item-1");
      expect(info.tasks[0].task.pause).not.toHaveBeenCalled();
    });
  });

  // ─── resumeDownload ──────────────────────────────────────────────────────────

  describe("resumeDownload()", () => {
    it("calls resume() on all tasks and sets isPaused=false", () => {
      const instance = DownloadService.getInstance();
      const info = injectActiveDownload(instance, "item-1");
      info.isPaused = true;
      instance.resumeDownload("item-1");
      expect(info.tasks[0].task.resume).toHaveBeenCalledTimes(1);
      expect(info.isPaused).toBe(false);
    });

    it("is a no-op for unknown item", () => {
      const instance = DownloadService.getInstance();
      expect(() => instance.resumeDownload("unknown-item")).not.toThrow();
    });

    it("is a no-op if not paused", () => {
      const instance = DownloadService.getInstance();
      const info = injectActiveDownload(instance, "item-1");
      // isPaused is false by default
      instance.resumeDownload("item-1");
      expect(info.tasks[0].task.resume).not.toHaveBeenCalled();
    });
  });

  // ─── cancelDownload ──────────────────────────────────────────────────────────

  describe("cancelDownload()", () => {
    it("calls stop() on all tasks and removes item from activeDownloads", () => {
      const instance = DownloadService.getInstance();
      const info = injectActiveDownload(instance, "item-1");
      instance.cancelDownload("item-1");
      expect(info.tasks[0].task.stop).toHaveBeenCalledTimes(1);
      expect(instance.isDownloadActive("item-1")).toBe(false);
    });

    it("is a no-op for unknown item", () => {
      const instance = DownloadService.getInstance();
      expect(() => instance.cancelDownload("unknown-item")).not.toThrow();
    });
  });

  // ─── unified per-file byte accounting (markFileCompleted / updateInFlightBytes / computeAggregateBytes) ──

  describe("per-file byte accounting helpers", () => {
    it("sums in-flight bytes across two concurrent tasks without double-counting on completion", () => {
      const instance = DownloadService.getInstance() as any;
      const downloadInfo: DownloadInfo = {
        tasks: [],
        progressCallbacks: new Set(),
        totalBytes: 3000,
        downloadedBytes: 0,
        isPaused: false,
        speedTracker: createSpeedTracker(),
        completedFileIds: new Set(),
        completedBytes: 0,
        inFlightBytes: new Map(),
      };

      // Two concurrent in-flight tasks — aggregate must be the sum of both.
      instance.updateInFlightBytes(downloadInfo, "af-1", 300);
      instance.updateInFlightBytes(downloadInfo, "af-2", 500);
      expect(instance.computeAggregateBytes(downloadInfo)).toBe(800);

      // A later update for the same file replaces (not adds to) its own contribution.
      instance.updateInFlightBytes(downloadInfo, "af-1", 400);
      expect(instance.computeAggregateBytes(downloadInfo)).toBe(900);

      // Completing af-1 moves its bytes from "in-flight" to "completed" exactly once.
      instance.markFileCompleted(downloadInfo, "af-1", 1000);
      expect(downloadInfo.completedFileIds.has("af-1")).toBe(true);
      expect(downloadInfo.inFlightBytes.has("af-1")).toBe(false);
      expect(instance.computeAggregateBytes(downloadInfo)).toBe(1500); // 1000 (af-1 completed) + 500 (af-2 in-flight)

      // Marking the same file complete again (e.g. a duplicate event) must not double-count.
      instance.markFileCompleted(downloadInfo, "af-1", 1000);
      expect(instance.computeAggregateBytes(downloadInfo)).toBe(1500);

      // A stray in-flight update for an already-completed file must be ignored.
      instance.updateInFlightBytes(downloadInfo, "af-1", 999);
      expect(instance.computeAggregateBytes(downloadInfo)).toBe(1500);
    });
  });

  // ─── startDownload error paths ────────────────────────────────────────────────

  describe("startDownload() error paths", () => {
    it("throws when no server URL configured", async () => {
      const { apiClientService } = require("@/services/ApiClientService");
      apiClientService.getBaseUrl.mockReturnValueOnce(null);
      const instance = DownloadService.getInstance();
      await expect(instance.startDownload("item-1")).rejects.toThrow(
        "Server URL and access token are required"
      );
    });

    it("throws when no access token configured", async () => {
      const { apiClientService } = require("@/services/ApiClientService");
      apiClientService.getAccessToken.mockReturnValueOnce(null);
      const instance = DownloadService.getInstance();
      await expect(instance.startDownload("item-1")).rejects.toThrow(
        "Server URL and access token are required"
      );
    });

    it("throws when download is already in progress", async () => {
      const instance = DownloadService.getInstance();
      injectActiveDownload(instance, "item-1");
      await expect(instance.startDownload("item-1")).rejects.toThrow(
        "Download already in progress"
      );
    });

    it("throws when metadata is not found", async () => {
      mockGetMediaMetadataByLibraryItemId.mockResolvedValueOnce(null);
      const instance = DownloadService.getInstance();
      // Need to initialize first so the service doesn't call initialize() which would call setConfig
      await instance.initialize();
      await expect(instance.startDownload("item-no-metadata")).rejects.toThrow(
        "Library item metadata not found"
      );
    });

    it("throws when no audio files found for item", async () => {
      mockGetMediaMetadataByLibraryItemId.mockResolvedValueOnce({
        id: "meta-1",
        libraryItemId: "item-1",
      } as any);
      mockGetAudioFilesWithDownloadInfo.mockResolvedValueOnce([]);
      const instance = DownloadService.getInstance();
      await instance.initialize();
      await expect(instance.startDownload("item-empty")).rejects.toThrow(
        "No audio files found for this library item"
      );
    });
  });

  // ─── startDownload success path ───────────────────────────────────────────────

  describe("startDownload() success path", () => {
    it("completes download for a single audio file", async () => {
      // Set up metadata + audio files mock
      const metadata = { id: "meta-1", libraryItemId: "item-1" };
      mockGetMediaMetadataByLibraryItemId.mockResolvedValue(metadata as any);
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        {
          id: "af-1",
          ino: "ino-1",
          filename: "chapter-1.mp3",
          size: 1000,
          downloadInfo: null,
        } as any,
      ]);

      const { markAudioFileAsDownloaded } = require("@/db/helpers/audioFiles");
      markAudioFileAsDownloaded.mockResolvedValue(undefined);
      const { cacheCoverIfMissing } = require("@/lib/covers");
      cacheCoverIfMissing.mockResolvedValue(undefined);
      const { setExcludeFromBackup } = require("@/lib/iCloudBackupExclusion");
      setExcludeFromBackup.mockResolvedValue(undefined);

      // Create a chainable task mock that immediately invokes 'done' callback
      const startSpy = jest.fn();
      const mockTask: any = {
        begin: jest.fn().mockReturnThis(),
        progress: jest.fn().mockReturnThis(),
        done: jest.fn<(callback: DoneHandler) => DownloadTask>().mockImplementation((cb) => {
          // Fire done immediately after a tick to simulate async completion
          Promise.resolve().then(() =>
            cb({ location: "", bytesDownloaded: 1000, bytesTotal: 1000 })
          );
          return mockTask;
        }),
        error: jest.fn().mockReturnThis(),
        start: startSpy,
        state: "DONE",
        pause: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn(),
      };

      mockCreateDownloadTask.mockReturnValue(mockTask);

      const instance = DownloadService.getInstance();
      await instance.initialize();
      await instance.startDownload("item-1");

      // After completion, the item should no longer be in activeDownloads
      expect(instance.isDownloadActive("item-1")).toBe(false);
      expect(markAudioFileAsDownloaded).toHaveBeenCalledWith(
        "af-1",
        expect.stringContaining("chapter-1.mp3")
      );
    });

    it("calls createDownloadTask with correct id, url, destination, headers, metadata shape", async () => {
      const metadata = { id: "meta-1", libraryItemId: "item-1" };
      mockGetMediaMetadataByLibraryItemId.mockResolvedValue(metadata as any);
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        {
          id: "af-1",
          ino: "ino-1",
          filename: "chapter-1.mp3",
          size: 1000,
          downloadInfo: null,
        } as any,
      ]);

      const { markAudioFileAsDownloaded } = require("@/db/helpers/audioFiles");
      markAudioFileAsDownloaded.mockResolvedValue(undefined);
      const { cacheCoverIfMissing } = require("@/lib/covers");
      cacheCoverIfMissing.mockResolvedValue(undefined);
      const { setExcludeFromBackup } = require("@/lib/iCloudBackupExclusion");
      setExcludeFromBackup.mockResolvedValue(undefined);

      const startSpy = jest.fn();
      const mockTask: any = {
        begin: jest.fn().mockReturnThis(),
        progress: jest.fn().mockReturnThis(),
        done: jest.fn<(callback: DoneHandler) => DownloadTask>().mockImplementation((cb) => {
          Promise.resolve().then(() =>
            cb({ location: "", bytesDownloaded: 1000, bytesTotal: 1000 })
          );
          return mockTask;
        }),
        error: jest.fn().mockReturnThis(),
        start: startSpy,
        state: "DONE",
        pause: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn(),
      };
      mockCreateDownloadTask.mockReturnValue(mockTask);

      const instance = DownloadService.getInstance();
      await instance.initialize();
      await instance.startDownload("item-1");

      expect(mockCreateDownloadTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringContaining("item-1"),
          url: expect.any(String),
          destination: expect.any(String),
          headers: expect.objectContaining({
            Authorization: expect.stringContaining("Bearer"),
          }),
          metadata: expect.objectContaining({
            libraryItemId: "item-1",
            audioFileId: "af-1",
            filename: "chapter-1.mp3",
          }),
        })
      );
    });

    it("calls task.start() after handler registration", async () => {
      const metadata = { id: "meta-1", libraryItemId: "item-1" };
      mockGetMediaMetadataByLibraryItemId.mockResolvedValue(metadata as any);
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        {
          id: "af-1",
          ino: "ino-1",
          filename: "chapter-1.mp3",
          size: 1000,
          downloadInfo: null,
        } as any,
      ]);

      const { markAudioFileAsDownloaded } = require("@/db/helpers/audioFiles");
      markAudioFileAsDownloaded.mockResolvedValue(undefined);
      const { cacheCoverIfMissing } = require("@/lib/covers");
      cacheCoverIfMissing.mockResolvedValue(undefined);
      const { setExcludeFromBackup } = require("@/lib/iCloudBackupExclusion");
      setExcludeFromBackup.mockResolvedValue(undefined);

      const handlerRegistrationOrder: string[] = [];
      const startSpy = jest.fn().mockImplementation(() => {
        handlerRegistrationOrder.push("start");
      });
      const mockTask: any = {
        begin: jest.fn().mockImplementation(() => {
          handlerRegistrationOrder.push("begin");
          return mockTask;
        }),
        progress: jest.fn().mockImplementation(() => {
          handlerRegistrationOrder.push("progress");
          return mockTask;
        }),
        done: jest.fn<(callback: DoneHandler) => DownloadTask>().mockImplementation((cb) => {
          handlerRegistrationOrder.push("done");
          Promise.resolve().then(() =>
            cb({ location: "", bytesDownloaded: 1000, bytesTotal: 1000 })
          );
          return mockTask;
        }),
        error: jest.fn().mockImplementation(() => {
          handlerRegistrationOrder.push("error");
          return mockTask;
        }),
        start: startSpy,
        state: "DONE",
        pause: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn(),
      };
      mockCreateDownloadTask.mockReturnValue(mockTask);

      const instance = DownloadService.getInstance();
      await instance.initialize();
      await instance.startDownload("item-1");

      // start() must be called after all handlers are registered
      expect(startSpy).toHaveBeenCalledTimes(1);
      const startIndex = handlerRegistrationOrder.indexOf("start");
      const errorIndex = handlerRegistrationOrder.indexOf("error");
      expect(startIndex).toBeGreaterThan(errorIndex); // start comes after error (last handler)
    });

    it("done() handler calls setExcludeFromBackup with the download path", async () => {
      const metadata = { id: "meta-1", libraryItemId: "item-1" };
      mockGetMediaMetadataByLibraryItemId.mockResolvedValue(metadata as any);
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        {
          id: "af-1",
          ino: "ino-1",
          filename: "chapter-1.mp3",
          size: 1000,
          downloadInfo: null,
        } as any,
      ]);

      const { markAudioFileAsDownloaded } = require("@/db/helpers/audioFiles");
      markAudioFileAsDownloaded.mockResolvedValue(undefined);
      const { cacheCoverIfMissing } = require("@/lib/covers");
      cacheCoverIfMissing.mockResolvedValue(undefined);
      const { setExcludeFromBackup } = require("@/lib/iCloudBackupExclusion");
      setExcludeFromBackup.mockResolvedValue(undefined);

      const mockTask: any = {
        begin: jest.fn().mockReturnThis(),
        progress: jest.fn().mockReturnThis(),
        done: jest.fn<(callback: DoneHandler) => DownloadTask>().mockImplementation((cb) => {
          Promise.resolve().then(() =>
            cb({ location: "", bytesDownloaded: 1000, bytesTotal: 1000 })
          );
          return mockTask;
        }),
        error: jest.fn().mockReturnThis(),
        start: jest.fn(),
        state: "DONE",
        pause: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn(),
      };
      mockCreateDownloadTask.mockReturnValue(mockTask);

      const instance = DownloadService.getInstance();
      await instance.initialize();
      await instance.startDownload("item-1");

      expect(setExcludeFromBackup).toHaveBeenCalledWith(expect.stringContaining("chapter-1.mp3"));
    });

    it("triggers error path when download task fires error event", async () => {
      const metadata = { id: "meta-1", libraryItemId: "item-1" };
      mockGetMediaMetadataByLibraryItemId.mockResolvedValue(metadata as any);
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        {
          id: "af-1",
          ino: "ino-1",
          filename: "chapter-1.mp3",
          size: 1000,
          downloadInfo: null,
        } as any,
      ]);

      const { cacheCoverIfMissing } = require("@/lib/covers");
      cacheCoverIfMissing.mockResolvedValue(undefined);

      // Task fires error immediately
      const mockTask: any = {
        begin: jest.fn().mockReturnThis(),
        progress: jest.fn().mockReturnThis(),
        done: jest.fn().mockReturnThis(),
        error: jest.fn<(callback: ErrorHandler) => DownloadTask>().mockImplementation((cb) => {
          Promise.resolve().then(() => cb({ error: "Download failed", errorCode: 0 }));
          return mockTask;
        }),
        start: jest.fn(),
        state: "FAILED",
        pause: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn(),
      };

      mockCreateDownloadTask.mockReturnValue(mockTask);

      const instance = DownloadService.getInstance();
      await instance.initialize();

      await expect(instance.startDownload("item-1")).rejects.toThrow();
      // Item should be removed from activeDownloads on error
      expect(instance.isDownloadActive("item-1")).toBe(false);
    });

    it("handles already-downloaded file gracefully (File already exists)", async () => {
      const metadata = { id: "meta-1", libraryItemId: "item-1" };
      mockGetMediaMetadataByLibraryItemId.mockResolvedValue(metadata as any);
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        {
          id: "af-1",
          ino: "ino-1",
          filename: "chapter-1.mp3",
          size: 1000,
          downloadInfo: null,
        } as any,
      ]);

      const { markAudioFileAsDownloaded } = require("@/db/helpers/audioFiles");
      markAudioFileAsDownloaded.mockResolvedValue(undefined);
      const { cacheCoverIfMissing } = require("@/lib/covers");
      cacheCoverIfMissing.mockResolvedValue(undefined);
      const { setExcludeFromBackup } = require("@/lib/iCloudBackupExclusion");
      setExcludeFromBackup.mockResolvedValue(undefined);

      // Mock downloadFileExists to return true (file already exists)
      const { downloadFileExists } = require("@/lib/fileSystem");
      downloadFileExists.mockReturnValueOnce(true);

      const instance = DownloadService.getInstance();
      await instance.initialize();
      await instance.startDownload("item-1");

      // File already exists path - should mark as downloaded and complete
      expect(markAudioFileAsDownloaded).toHaveBeenCalled();
      expect(instance.isDownloadActive("item-1")).toBe(false);
    });

    it("aggregates bytes across two concurrent in-flight downloads instead of undercounting", async () => {
      // Regression test: updateProgress used to be called with
      // `totalBytesDownloaded + fileBytesDownloaded`, where totalBytesDownloaded only
      // advanced on file *completion*. With two files downloading concurrently, bytes
      // in flight on the file that isn't currently reporting were invisible — the
      // aggregate would reflect only the most-recently-reported file, not the sum.
      const metadata = { id: "meta-1", libraryItemId: "item-concurrent" };
      mockGetMediaMetadataByLibraryItemId.mockResolvedValue(metadata as any);
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        { id: "af-1", ino: "ino-1", filename: "ch1.mp3", size: 1000, downloadInfo: null } as any,
        { id: "af-2", ino: "ino-2", filename: "ch2.mp3", size: 2000, downloadInfo: null } as any,
      ]);

      const { cacheCoverIfMissing } = require("@/lib/covers");
      cacheCoverIfMissing.mockResolvedValue(undefined);

      const progressCallbacks: Record<string, (data: any) => void> = {};

      mockCreateDownloadTask.mockImplementation((config: any) => {
        const filename = config.metadata.filename as string;
        const task: any = {
          begin: jest.fn().mockReturnThis(),
          progress: jest
            .fn<(callback: ProgressHandler) => DownloadTask>()
            .mockImplementation((cb) => {
              progressCallbacks[filename] = cb;
              return task;
            }),
          done: jest.fn().mockReturnThis(), // never fires — both downloads stay in-flight
          error: jest.fn().mockReturnThis(),
          start: jest.fn(),
          state: "DOWNLOADING",
          pause: jest.fn(),
          resume: jest.fn(),
          stop: jest.fn(),
        };
        return task;
      });

      const instance = DownloadService.getInstance();
      await instance.initialize();

      // Fire-and-forget: startDownload() won't resolve since neither task's done() fires.
      void instance.startDownload("item-concurrent").catch(() => {});

      // Let the async downloadAudioFile() chain (map() + the ensureDownloadsDirectory
      // await inside it) run far enough to register the progress handlers.
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(progressCallbacks["ch1.mp3"]).toBeDefined();
      expect(progressCallbacks["ch2.mp3"]).toBeDefined();

      progressCallbacks["ch1.mp3"]({ bytesDownloaded: 300, bytesTotal: 1000 });
      progressCallbacks["ch2.mp3"]({ bytesDownloaded: 500, bytesTotal: 2000 });

      const progress = instance.getCurrentProgress("item-concurrent");
      // Sum of both files' in-flight bytes, not just the most-recently-reported file.
      expect(progress?.bytesDownloaded).toBe(800);
    });

    it("forceRedownload deletes the pre-existing file before creating the download task", async () => {
      const metadata = { id: "meta-1", libraryItemId: "item-1" };
      mockGetMediaMetadataByLibraryItemId.mockResolvedValue(metadata as any);
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        {
          id: "af-1",
          ino: "ino-1",
          filename: "chapter-1.mp3",
          size: 1000,
          downloadInfo: null,
        } as any,
      ]);

      const { markAudioFileAsDownloaded } = require("@/db/helpers/audioFiles");
      markAudioFileAsDownloaded.mockResolvedValue(undefined);
      const { cacheCoverIfMissing } = require("@/lib/covers");
      cacheCoverIfMissing.mockResolvedValue(undefined);
      const { setExcludeFromBackup } = require("@/lib/iCloudBackupExclusion");
      setExcludeFromBackup.mockResolvedValue(undefined);

      const { downloadFileExists, deleteDownloadFile } = require("@/lib/fileSystem");
      downloadFileExists.mockReturnValueOnce(true); // simulate a corrupt/partial pre-existing file

      const callOrder: string[] = [];
      (deleteDownloadFile as jest.Mock).mockImplementation(() => {
        callOrder.push("delete");
      });

      const mockTask: any = {
        begin: jest.fn().mockReturnThis(),
        progress: jest.fn().mockReturnThis(),
        done: jest.fn<(callback: DoneHandler) => DownloadTask>().mockImplementation((cb) => {
          Promise.resolve().then(() =>
            cb({ location: "", bytesDownloaded: 1000, bytesTotal: 1000 })
          );
          return mockTask;
        }),
        error: jest.fn().mockReturnThis(),
        start: jest.fn(),
        state: "DONE",
        pause: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn(),
      };
      mockCreateDownloadTask.mockImplementation(() => {
        callOrder.push("createTask");
        return mockTask;
      });

      const instance = DownloadService.getInstance();
      await instance.initialize();
      await instance.startDownload("item-1", undefined, { forceRedownload: true });

      expect(deleteDownloadFile).toHaveBeenCalledWith("item-1", "chapter-1.mp3", "documents");
      // Deletion must happen before the download task is created, not after.
      expect(callOrder).toEqual(["delete", "createTask"]);
    });
  });

  // ─── initialize() with existing tasks ────────────────────────────────────────

  describe("initialize() with existing background tasks", () => {
    it("re-attaches progress, done, and error handlers to restored tasks", async () => {
      let progressCallback: ProgressHandler | undefined;
      let doneCallback: DoneHandler | undefined;
      let errorCallback: ErrorHandler | undefined;

      const mockTask: any = {
        metadata: { libraryItemId: "item-restored", audioFileId: "af-1", filename: "ch1.mp3" },
        state: "DOWNLOADING",
        progress: jest
          .fn<(callback: ProgressHandler) => DownloadTask>()
          .mockImplementation((cb) => {
            progressCallback = cb;
            return mockTask;
          }),
        done: jest.fn<(callback: DoneHandler) => DownloadTask>().mockImplementation((cb) => {
          doneCallback = cb;
          return mockTask;
        }),
        error: jest.fn<(callback: ErrorHandler) => DownloadTask>().mockImplementation((cb) => {
          errorCallback = cb;
          return mockTask;
        }),
        pause: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn(),
      };
      mockGetExistingDownloadTasks.mockResolvedValueOnce([mockTask] as any);
      mockGetMediaMetadataByLibraryItemId.mockResolvedValue({ id: "meta-1" } as any);
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        { id: "af-1", size: 1000, downloadInfo: { isDownloaded: false } },
      ] as any);

      const instance = DownloadService.getInstance();
      await instance.initialize();

      // After restore, the item should be tracked in activeDownloads
      expect(instance.isDownloadActive("item-restored")).toBe(true);

      // resume() must be called to reconnect JS progress events to the native download
      expect(mockTask.resume).toHaveBeenCalledTimes(1);

      // Fire the progress callback to cover handleTaskProgress
      if (progressCallback !== undefined) {
        progressCallback({ bytesDownloaded: 500, bytesTotal: 1000 });
        // Allow async operations to complete
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Fire the error callback to cover the error handler
      if (errorCallback !== undefined) {
        errorCallback({ error: "Network error", errorCode: 0 });
      }

      // Item should be removed from activeDownloads after error
      expect(instance.isDownloadActive("item-restored")).toBe(false);
    });

    it("fires done callback for restored task to trigger handleTaskCompletion", async () => {
      const { markAudioFileAsDownloaded } = require("@/db/helpers/audioFiles");
      markAudioFileAsDownloaded.mockResolvedValue(undefined);
      const { setExcludeFromBackup } = require("@/lib/iCloudBackupExclusion");
      setExcludeFromBackup.mockResolvedValue(undefined);

      const mockTask: any = {
        metadata: { libraryItemId: "item-restored", audioFileId: "af-1", filename: "ch1.mp3" },
        state: "DONE",
        bytesDownloaded: 1000,
        progress: jest.fn().mockReturnThis(),
        done: jest.fn().mockReturnThis(),
        error: jest.fn().mockReturnThis(),
        pause: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn(),
      };
      mockGetExistingDownloadTasks.mockResolvedValueOnce([mockTask] as any);
      mockGetMediaMetadataByLibraryItemId.mockResolvedValue({ id: "meta-1" } as any);
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([]);

      const instance = DownloadService.getInstance();
      await instance.initialize();

      // Allow the async completion chain (markAudioFileAsDownloaded + setExcludeFromBackup) to resolve
      await new Promise((resolve) => setTimeout(resolve, 20));

      // DONE tasks are handled immediately at restore time — no event callback needed.
      // markAudioFileAsDownloaded and iCloud exclusion should have been applied.
      expect(markAudioFileAsDownloaded).toHaveBeenCalled();
      expect(setExcludeFromBackup).toHaveBeenCalled();

      // After handling, the item should be removed from activeDownloads
      expect(instance.isDownloadActive("item-restored")).toBe(false);
    });

    it("counts exactly one already-downloaded file when 1-of-3 files were downloaded before restore", async () => {
      // Regression test: the old handleTaskProgress used
      // `const isAlreadyCounted = alreadyDownloadedFiles > 0` — a boolean shortcut that,
      // whenever *any* file was already downloaded, skipped counting *every* DONE task's
      // bytes. With 1-of-3 files done in the DB and other tasks completing during
      // restore, this either overcounted (miscounting on error) or, as reproduced here,
      // undercounted downloadedFiles by treating an unrelated completed task as already
      // counted.
      let progressCbForAf3: ((data: any) => void) | null = null;
      let doneCbForAf2: ((data: any) => void) | null = null;

      const taskAf2: any = {
        metadata: {
          libraryItemId: "item-restore-partial",
          audioFileId: "af-2",
          filename: "ch2.mp3",
        },
        state: "DOWNLOADING",
        progress: jest.fn().mockReturnThis(),
        done: jest.fn<(callback: DoneHandler) => DownloadTask>().mockImplementation((cb) => {
          doneCbForAf2 = cb;
          return taskAf2;
        }),
        error: jest.fn().mockReturnThis(),
        pause: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn(),
      };
      const taskAf3: any = {
        metadata: {
          libraryItemId: "item-restore-partial",
          audioFileId: "af-3",
          filename: "ch3.mp3",
        },
        state: "DOWNLOADING",
        progress: jest
          .fn<(callback: ProgressHandler) => DownloadTask>()
          .mockImplementation((cb) => {
            progressCbForAf3 = cb;
            return taskAf3;
          }),
        done: jest.fn().mockReturnThis(),
        error: jest.fn().mockReturnThis(),
        pause: jest.fn(),
        resume: jest.fn(),
        stop: jest.fn(),
      };

      mockGetExistingDownloadTasks.mockResolvedValueOnce([taskAf2, taskAf3] as any);
      mockGetMediaMetadataByLibraryItemId.mockResolvedValue({ id: "meta-1" } as any);
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        { id: "af-1", size: 1000, downloadInfo: { isDownloaded: true } }, // already downloaded, no active task
        { id: "af-2", size: 2000, downloadInfo: { isDownloaded: false } },
        { id: "af-3", size: 1500, downloadInfo: { isDownloaded: false } },
      ] as any);

      const { markAudioFileAsDownloaded } = require("@/db/helpers/audioFiles");
      markAudioFileAsDownloaded.mockResolvedValue(undefined);
      const { setExcludeFromBackup } = require("@/lib/iCloudBackupExclusion");
      setExcludeFromBackup.mockResolvedValue(undefined);

      const instance = DownloadService.getInstance();
      await instance.initialize();

      expect(progressCbForAf3).toBeDefined();

      // First progress event for af-3 (still downloading). Exactly 1 file (af-1) should
      // be reported as downloaded — not 0 (DB snapshot ignored) and not 2 (af-3 itself
      // miscounted).
      progressCbForAf3!({ bytesDownloaded: 100, bytesTotal: 1500 });
      let progress = instance.getCurrentProgress("item-restore-partial");
      expect(progress?.downloadedFiles).toBe(1);
      expect(progress?.totalFiles).toBe(3);

      // Now af-2 completes while af-3 is still downloading — the exact scenario the old
      // "Simplified check" got wrong.
      expect(doneCbForAf2).toBeDefined();
      taskAf2.state = "DONE";
      doneCbForAf2!({ bytesDownloaded: 2000, bytesTotal: 2000 });
      await new Promise((resolve) => setTimeout(resolve, 20));

      progressCbForAf3!({ bytesDownloaded: 300, bytesTotal: 1500 });
      progress = instance.getCurrentProgress("item-restore-partial");
      // af-1 (DB) + af-2 (just completed) = 2. Not 1 (old undercount bug) and not 3.
      expect(progress?.downloadedFiles).toBe(2);
    });
  });
});
