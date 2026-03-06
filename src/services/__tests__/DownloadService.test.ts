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
  isLibraryItemDownloaded: jest.fn().mockResolvedValue(true),
  getDownloadProgress: jest.fn().mockResolvedValue({ downloaded: 2, total: 3, progress: 2 / 3 }),
  getDownloadedSize: jest.fn().mockResolvedValue(1024 * 1024),
};
const mockRepairCollaborator = {
  repairDownloadStatus: jest.fn().mockResolvedValue(1),
  deleteDownloadedLibraryItem: jest.fn().mockResolvedValue(undefined),
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
    it("clears existing callbacks and adds the new one for active download", () => {
      const instance = DownloadService.getInstance();
      const info = injectActiveDownload(instance, "item-1");
      const oldCb = jest.fn();
      info.progressCallbacks.add(oldCb);
      const newCb = jest.fn();
      instance.rewireProgressCallbacks("item-1", newCb);
      expect(info.progressCallbacks.has(oldCb)).toBe(false);
      expect(info.progressCallbacks.has(newCb)).toBe(true);
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

    it("returns without error when download is already in progress (reconnects callback)", async () => {
      const instance = DownloadService.getInstance();
      injectActiveDownload(instance, "item-1");
      // Should resolve silently, not throw
      await expect(instance.startDownload("item-1")).resolves.toBeUndefined();
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
        done: jest.fn().mockImplementation((cb: (data: any) => void) => {
          // Fire done immediately after a tick to simulate async completion
          Promise.resolve().then(() => cb({ bytesDownloaded: 1000, bytesTotal: 1000 }));
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
        expect.stringContaining("chapter-1.mp3"),
        "documents"
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
        done: jest.fn().mockImplementation((cb: (data: any) => void) => {
          Promise.resolve().then(() => cb({ bytesDownloaded: 1000, bytesTotal: 1000 }));
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
        done: jest.fn().mockImplementation((cb: (data: any) => void) => {
          handlerRegistrationOrder.push("done");
          Promise.resolve().then(() => cb({ bytesDownloaded: 1000, bytesTotal: 1000 }));
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
        done: jest.fn().mockImplementation((cb: (data: any) => void) => {
          Promise.resolve().then(() => cb({ bytesDownloaded: 1000, bytesTotal: 1000 }));
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
        error: jest.fn().mockImplementation((cb: (err: any) => void) => {
          Promise.resolve().then(() => cb({ error: "Download failed" }));
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
  });

  // ─── initialize() with existing tasks ────────────────────────────────────────

  describe("initialize() with existing background tasks", () => {
    it("re-attaches progress, done, and error handlers to restored tasks", async () => {
      let progressCallback: ((data: any) => void) | null = null;
      let doneCallback: ((data: any) => void) | null = null;
      let errorCallback: ((err: any) => void) | null = null;

      const mockTask: any = {
        metadata: { libraryItemId: "item-restored", audioFileId: "af-1", filename: "ch1.mp3" },
        state: "DOWNLOADING",
        progress: jest.fn().mockImplementation((cb: (data: any) => void) => {
          progressCallback = cb;
          return mockTask;
        }),
        done: jest.fn().mockImplementation((cb: (data: any) => void) => {
          doneCallback = cb;
          return mockTask;
        }),
        error: jest.fn().mockImplementation((cb: (err: any) => void) => {
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

      // Fire the progress callback to cover handleTaskProgress
      if (progressCallback) {
        progressCallback({ bytesDownloaded: 500, bytesTotal: 1000 });
        // Allow async operations to complete
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Fire the error callback to cover the error handler
      if (errorCallback) {
        errorCallback({ error: "Network error" });
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
  });
});
