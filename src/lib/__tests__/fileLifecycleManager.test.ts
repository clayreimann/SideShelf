/**
 * Tests for File Lifecycle Manager
 *
 * Tests the core logic for managing audiobook file locations between
 * Documents and Caches directories, including iCloud backup exclusion
 * and cleanup detection.
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";

// Mock logger
jest.mock("@/lib/logger", () => ({
  logger: {
    forTag: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

// Mock file system helpers
jest.mock("@/lib/fileSystem", () => ({
  getDownloadPath: jest.fn(
    (id: string, filename: string, location = "caches") => `${location}/downloads/${id}/${filename}`
  ),
  moveAudioFile: jest.fn(),
  getAudioFileLocation: jest.fn(),
  ensureDownloadsDirectory: jest.fn(),
  verifyFileExists: jest.fn(),
  getDocumentsDirectory: jest.fn(),
  getCachesDirectory: jest.fn(),
  getDownloadsDirectory: jest.fn(),
  downloadFileExists: jest.fn(),
  verifyDownloadedFileExists: jest.fn(),
}));

// Mock database helpers
jest.mock("@/db/helpers/localData", () => ({
  updateAudioFileStorageLocation: jest.fn(),
  clearAudioFileDownloadStatus: jest.fn(),
  getAllDownloadedAudioFiles: jest.fn(),
  getDownloadedAudioFilesWithLibraryInfo: jest.fn(),
  markAudioFileAsDownloaded: jest.fn(),
  getAudioFileDownloadInfo: jest.fn(),
  updateAudioFileLastAccessed: jest.fn(),
  updateAudioFileDownloadPath: jest.fn(),
}));

jest.mock("@/db/helpers/combinedQueries", () => ({
  getAudioFilesWithDownloadInfo: jest.fn(),
}));

jest.mock("@/db/helpers/mediaMetadata", () => ({
  getMediaMetadataByLibraryItemId: jest.fn(),
}));

jest.mock("@/db/helpers/mediaProgress", () => ({
  getMediaProgressForLibraryItem: jest.fn(),
}));

// Mock iCloud backup exclusion
jest.mock("@/lib/iCloudBackupExclusion", () => ({
  setExcludeFromBackup: jest.fn(),
  isExcludedFromBackup: jest.fn(),
  isICloudBackupExclusionAvailable: jest.fn(),
}));

// Import module under test
import * as fileLifecycleManager from "@/lib/fileLifecycleManager";

// Import mocked modules to access them in tests
import * as fileSystem from "@/lib/fileSystem";
import * as localData from "@/db/helpers/localData";
import * as combinedQueries from "@/db/helpers/combinedQueries";
import * as mediaMetadata from "@/db/helpers/mediaMetadata";
import * as mediaProgress from "@/db/helpers/mediaProgress";
import * as iCloudBackup from "@/lib/iCloudBackupExclusion";

// Create typed references to mocked functions
const mocks = {
  fileSystem: jest.mocked(fileSystem),
  localData: jest.mocked(localData),
  combinedQueries: jest.mocked(combinedQueries),
  mediaMetadata: jest.mocked(mediaMetadata),
  mediaProgress: jest.mocked(mediaProgress),
  iCloudBackup: jest.mocked(iCloudBackup),
};

describe("File Lifecycle Manager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("moveItemToDocuments", () => {
    const libraryItemId = "test-item-123";
    const mockMetadata = { id: "metadata-1", libraryItemId, title: "Test Book" };
    const mockAudioFiles = [
      {
        id: "audio-1",
        filename: "chapter1.m4b",
        size: 1000000,
        downloadInfo: { isDownloaded: true, downloadPath: "downloads/test-item-123/chapter1.m4b" },
      },
      {
        id: "audio-2",
        filename: "chapter2.m4b",
        size: 2000000,
        downloadInfo: { isDownloaded: true, downloadPath: "downloads/test-item-123/chapter2.m4b" },
      },
    ];

    beforeEach(() => {
      // Setup default mock responses
      mocks.mediaMetadata.getMediaMetadataByLibraryItemId.mockResolvedValue(mockMetadata as any);
      mocks.combinedQueries.getAudioFilesWithDownloadInfo.mockResolvedValue(mockAudioFiles as any);
      mocks.fileSystem.ensureDownloadsDirectory.mockResolvedValue(undefined as any);
      mocks.fileSystem.getAudioFileLocation.mockReturnValue("caches" as any);
      mocks.fileSystem.moveAudioFile.mockResolvedValue(true);
      mocks.localData.updateAudioFileStorageLocation.mockResolvedValue(undefined as any);
      mocks.iCloudBackup.setExcludeFromBackup.mockResolvedValue({ success: true, path: "" } as any);
    });

    it("should move all files from Caches to Documents", async () => {
      const result = await fileLifecycleManager.moveItemToDocuments(libraryItemId);

      expect(result).toBe(true);
      expect(mocks.fileSystem.ensureDownloadsDirectory).toHaveBeenCalledWith(
        libraryItemId,
        "documents"
      );
      expect(mocks.fileSystem.moveAudioFile).toHaveBeenCalledTimes(2);
      expect(mocks.fileSystem.moveAudioFile).toHaveBeenCalledWith(
        libraryItemId,
        "chapter1.m4b",
        true
      );
      expect(mocks.fileSystem.moveAudioFile).toHaveBeenCalledWith(
        libraryItemId,
        "chapter2.m4b",
        true
      );
    });

    it("should apply iCloud backup exclusion to moved files", async () => {
      await fileLifecycleManager.moveItemToDocuments(libraryItemId);

      expect(mocks.iCloudBackup.setExcludeFromBackup).toHaveBeenCalledTimes(2);
      expect(mocks.iCloudBackup.setExcludeFromBackup).toHaveBeenCalledWith(
        "documents/downloads/test-item-123/chapter1.m4b"
      );
      expect(mocks.iCloudBackup.setExcludeFromBackup).toHaveBeenCalledWith(
        "documents/downloads/test-item-123/chapter2.m4b"
      );
    });

    it("should update database with new storage location", async () => {
      await fileLifecycleManager.moveItemToDocuments(libraryItemId);

      expect(mocks.localData.updateAudioFileStorageLocation).toHaveBeenCalledTimes(2);
      expect(mocks.localData.updateAudioFileStorageLocation).toHaveBeenCalledWith(
        "audio-1",
        "documents",
        "documents/downloads/test-item-123/chapter1.m4b"
      );
      expect(mocks.localData.updateAudioFileStorageLocation).toHaveBeenCalledWith(
        "audio-2",
        "documents",
        "documents/downloads/test-item-123/chapter2.m4b"
      );
    });

    it("should skip files already in Documents", async () => {
      mocks.fileSystem.getAudioFileLocation
        .mockReturnValueOnce("documents") // chapter1 already in docs
        .mockReturnValueOnce("caches"); // chapter2 needs move

      await fileLifecycleManager.moveItemToDocuments(libraryItemId);

      // Should only move chapter2
      expect(mocks.fileSystem.moveAudioFile).toHaveBeenCalledTimes(1);
      expect(mocks.fileSystem.moveAudioFile).toHaveBeenCalledWith(
        libraryItemId,
        "chapter2.m4b",
        true
      );

      // But should apply iCloud exclusion to both
      expect(mocks.iCloudBackup.setExcludeFromBackup).toHaveBeenCalledTimes(2);
    });

    it("should handle file move failures gracefully", async () => {
      mocks.fileSystem.moveAudioFile
        .mockResolvedValueOnce(false) // chapter1 fails
        .mockResolvedValueOnce(true); // chapter2 succeeds

      const result = await fileLifecycleManager.moveItemToDocuments(libraryItemId);

      // Should return false if any file failed
      expect(result).toBe(false);

      // Should only update database for successful move
      expect(mocks.localData.updateAudioFileStorageLocation).toHaveBeenCalledTimes(1);
      expect(mocks.localData.updateAudioFileStorageLocation).toHaveBeenCalledWith(
        "audio-2",
        "documents",
        expect.any(String)
      );
    });

    it("should continue if iCloud exclusion fails", async () => {
      mocks.iCloudBackup.setExcludeFromBackup.mockRejectedValueOnce(new Error("iCloud error"));

      const result = await fileLifecycleManager.moveItemToDocuments(libraryItemId);

      // Should still complete successfully
      expect(result).toBe(true);
      expect(mocks.localData.updateAudioFileStorageLocation).toHaveBeenCalledTimes(2);
    });

    it("should return false if no metadata found", async () => {
      mocks.mediaMetadata.getMediaMetadataByLibraryItemId.mockResolvedValue(null);

      const result = await fileLifecycleManager.moveItemToDocuments(libraryItemId);

      expect(result).toBe(false);
      expect(mocks.fileSystem.moveAudioFile).not.toHaveBeenCalled();
    });

    it("should return false if no audio files found", async () => {
      mocks.combinedQueries.getAudioFilesWithDownloadInfo.mockResolvedValue([]);

      const result = await fileLifecycleManager.moveItemToDocuments(libraryItemId);

      expect(result).toBe(false);
      expect(mocks.fileSystem.moveAudioFile).not.toHaveBeenCalled();
    });

    it("should skip files that are not downloaded", async () => {
      const filesWithUndownloaded = [
        ...mockAudioFiles,
        {
          id: "audio-3",
          filename: "chapter3.m4b",
          size: 3000000,
          downloadInfo: { isDownloaded: false, downloadPath: "" },
        },
      ];
      mocks.combinedQueries.getAudioFilesWithDownloadInfo.mockResolvedValue(
        filesWithUndownloaded as any
      );

      await fileLifecycleManager.moveItemToDocuments(libraryItemId);

      // Should only move the 2 downloaded files
      expect(mocks.fileSystem.moveAudioFile).toHaveBeenCalledTimes(2);
    });
  });

  describe("moveItemToCaches", () => {
    const libraryItemId = "test-item-456";
    const mockMetadata = { id: "metadata-2", libraryItemId, title: "Test Podcast" };
    const mockAudioFiles = [
      {
        id: "audio-10",
        filename: "episode1.mp3",
        size: 5000000,
        downloadInfo: { isDownloaded: true, downloadPath: "downloads/test-item-456/episode1.mp3" },
      },
    ];

    beforeEach(() => {
      mocks.mediaMetadata.getMediaMetadataByLibraryItemId.mockResolvedValue(mockMetadata as any);
      mocks.combinedQueries.getAudioFilesWithDownloadInfo.mockResolvedValue(mockAudioFiles as any);
      mocks.fileSystem.ensureDownloadsDirectory.mockResolvedValue(undefined);
      mocks.fileSystem.getAudioFileLocation.mockReturnValue("documents");
      mocks.fileSystem.moveAudioFile.mockResolvedValue(true);
      mocks.localData.updateAudioFileStorageLocation.mockResolvedValue(undefined);
    });

    it("should move files from Documents to Caches", async () => {
      const result = await fileLifecycleManager.moveItemToCaches(libraryItemId);

      expect(result).toBe(true);
      expect(mocks.fileSystem.ensureDownloadsDirectory).toHaveBeenCalledWith(
        libraryItemId,
        "caches"
      );
      expect(mocks.fileSystem.moveAudioFile).toHaveBeenCalledWith(
        libraryItemId,
        "episode1.mp3",
        false
      );
    });

    it("should update database with cache location", async () => {
      await fileLifecycleManager.moveItemToCaches(libraryItemId);

      expect(mocks.localData.updateAudioFileStorageLocation).toHaveBeenCalledWith(
        "audio-10",
        "caches",
        "caches/downloads/test-item-456/episode1.mp3"
      );
    });

    it("should skip files already in Caches", async () => {
      mocks.fileSystem.getAudioFileLocation.mockReturnValue("caches");

      await fileLifecycleManager.moveItemToCaches(libraryItemId);

      expect(mocks.fileSystem.moveAudioFile).not.toHaveBeenCalled();
    });
  });

  describe("ensureItemInDocuments", () => {
    const libraryItemId = "test-item-789";
    const mockMetadata = { id: "metadata-3", libraryItemId, title: "Test Audiobook" };
    const mockAudioFiles = [
      {
        id: "audio-20",
        filename: "book.m4b",
        size: 100000000,
        downloadInfo: { isDownloaded: true, downloadPath: "downloads/test-item-789/book.m4b" },
      },
    ];

    beforeEach(() => {
      mocks.mediaMetadata.getMediaMetadataByLibraryItemId.mockResolvedValue(mockMetadata as any);
      mocks.combinedQueries.getAudioFilesWithDownloadInfo.mockResolvedValue(mockAudioFiles as any);
      mocks.fileSystem.getAudioFileLocation.mockReturnValue("caches");
      mocks.fileSystem.ensureDownloadsDirectory.mockResolvedValue(undefined);
      mocks.fileSystem.moveAudioFile.mockResolvedValue(true);
      mocks.localData.updateAudioFileStorageLocation.mockResolvedValue(undefined);
      mocks.iCloudBackup.setExcludeFromBackup.mockResolvedValue({ success: true, path: "" } as any);
    });

    it("should move files to Documents if in Caches", async () => {
      await fileLifecycleManager.ensureItemInDocuments(libraryItemId);

      expect(mocks.fileSystem.moveAudioFile).toHaveBeenCalled();
      expect(mocks.localData.updateAudioFileStorageLocation).toHaveBeenCalledWith(
        "audio-20",
        "documents",
        expect.any(String)
      );
    });

    it("should not move files if already in Documents", async () => {
      mocks.fileSystem.getAudioFileLocation.mockReturnValue("documents");

      await fileLifecycleManager.ensureItemInDocuments(libraryItemId);

      expect(mocks.fileSystem.moveAudioFile).not.toHaveBeenCalled();
    });

    it("should not throw if move fails", async () => {
      mocks.fileSystem.moveAudioFile.mockResolvedValue(false);

      await expect(
        fileLifecycleManager.ensureItemInDocuments(libraryItemId)
      ).resolves.not.toThrow();
    });

    it("should handle missing metadata gracefully", async () => {
      mocks.mediaMetadata.getMediaMetadataByLibraryItemId.mockResolvedValue(null);

      await expect(
        fileLifecycleManager.ensureItemInDocuments(libraryItemId)
      ).resolves.not.toThrow();

      expect(mocks.fileSystem.moveAudioFile).not.toHaveBeenCalled();
    });
  });

  describe("shouldMoveToCache", () => {
    const libraryItemId = "test-item-999";
    const userId = "user-123";
    const mockMetadata = { id: "metadata-4", libraryItemId, title: "Test Item" };
    const mockAudioFiles = [
      {
        id: "audio-30",
        filename: "file.m4b",
        size: 50000000,
        downloadInfo: {
          isDownloaded: true,
          downloadPath: "downloads/test-item-999/file.m4b",
          lastAccessedAt: new Date("2025-01-01"),
        },
      },
    ];

    beforeEach(() => {
      mocks.mediaMetadata.getMediaMetadataByLibraryItemId.mockResolvedValue(mockMetadata as any);
      mocks.combinedQueries.getAudioFilesWithDownloadInfo.mockResolvedValue(mockAudioFiles as any);
    });

    it("should return true if item is finished", async () => {
      const mockProgress = {
        isFinished: true,
        currentTime: 3600,
        duration: 3600,
      };
      mocks.mediaProgress.getMediaProgressForLibraryItem.mockResolvedValue(mockProgress as any);

      const result = await fileLifecycleManager.shouldMoveToCache(libraryItemId, userId);

      expect(result).toBe(true);
    });

    it("should return true if item inactive for >2 weeks", async () => {
      const mockProgress = {
        isFinished: false,
        currentTime: 100,
        duration: 3600,
      };
      mocks.mediaProgress.getMediaProgressForLibraryItem.mockResolvedValue(mockProgress as any);

      // Set lastAccessedAt to 3 weeks ago
      const threeWeeksAgo = new Date();
      threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

      const oldFiles = [
        {
          ...mockAudioFiles[0],
          downloadInfo: {
            ...mockAudioFiles[0].downloadInfo,
            lastAccessedAt: threeWeeksAgo,
          },
        },
      ];
      mocks.combinedQueries.getAudioFilesWithDownloadInfo.mockResolvedValue(oldFiles as any);

      const result = await fileLifecycleManager.shouldMoveToCache(libraryItemId, userId);

      expect(result).toBe(true);
    });

    it("should return false if item active within 2 weeks", async () => {
      const mockProgress = {
        isFinished: false,
        currentTime: 100,
        duration: 3600,
      };
      mocks.mediaProgress.getMediaProgressForLibraryItem.mockResolvedValue(mockProgress as any);

      // Set lastAccessedAt to 1 week ago
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const recentFiles = [
        {
          ...mockAudioFiles[0],
          downloadInfo: {
            ...mockAudioFiles[0].downloadInfo,
            lastAccessedAt: oneWeekAgo,
          },
        },
      ];
      mocks.combinedQueries.getAudioFilesWithDownloadInfo.mockResolvedValue(recentFiles as any);

      const result = await fileLifecycleManager.shouldMoveToCache(libraryItemId, userId);

      expect(result).toBe(false);
    });

    it("should return false if no lastAccessedAt timestamp", async () => {
      const mockProgress = {
        isFinished: false,
        currentTime: 100,
        duration: 3600,
      };
      mocks.mediaProgress.getMediaProgressForLibraryItem.mockResolvedValue(mockProgress as any);

      const noTimestampFiles = [
        {
          ...mockAudioFiles[0],
          downloadInfo: {
            ...mockAudioFiles[0].downloadInfo,
            lastAccessedAt: null,
          },
        },
      ];
      mocks.combinedQueries.getAudioFilesWithDownloadInfo.mockResolvedValue(
        noTimestampFiles as any
      );

      const result = await fileLifecycleManager.shouldMoveToCache(libraryItemId, userId);

      expect(result).toBe(false);
    });

    it("should use most recent access time from multiple files", async () => {
      const mockProgress = {
        isFinished: false,
        currentTime: 100,
        duration: 3600,
      };
      mocks.mediaProgress.getMediaProgressForLibraryItem.mockResolvedValue(mockProgress as any);

      const threeWeeksAgo = new Date();
      threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const mixedFiles = [
        {
          ...mockAudioFiles[0],
          downloadInfo: {
            ...mockAudioFiles[0].downloadInfo,
            lastAccessedAt: threeWeeksAgo, // Old
          },
        },
        {
          id: "audio-31",
          filename: "file2.m4b",
          size: 50000000,
          downloadInfo: {
            isDownloaded: true,
            downloadPath: "downloads/test-item-999/file2.m4b",
            lastAccessedAt: yesterday, // Recent
          },
        },
      ];
      mocks.combinedQueries.getAudioFilesWithDownloadInfo.mockResolvedValue(mixedFiles as any);

      const result = await fileLifecycleManager.shouldMoveToCache(libraryItemId, userId);

      // Should use most recent (yesterday), so not ready for cache
      expect(result).toBe(false);
    });
  });

  describe("detectCleanedUpFiles", () => {
    beforeEach(() => {
      mocks.localData.clearAudioFileDownloadStatus.mockResolvedValue(undefined as any);
      mocks.fileSystem.verifyFileExists.mockResolvedValue(true);
    });

    it("should detect files that no longer exist on disk", async () => {
      const mockDownloads = [
        {
          audioFileId: "audio-100",
          filename: "file1.m4b",
          downloadPath: "downloads/item1/file1.m4b",
          libraryItemId: "item-1",
          title: "Test Book 1",
        },
        {
          audioFileId: "audio-101",
          filename: "file2.m4b",
          downloadPath: "downloads/item1/file2.m4b",
          libraryItemId: "item-1",
          title: "Test Book 1",
        },
      ];
      mocks.localData.getDownloadedAudioFilesWithLibraryInfo.mockResolvedValue(
        mockDownloads as any
      );

      // Simulate first file missing, second exists
      mocks.fileSystem.verifyFileExists
        .mockResolvedValueOnce(false) // file1 missing
        .mockResolvedValueOnce(true); // file2 exists

      const result = await fileLifecycleManager.detectCleanedUpFiles();

      expect(result).toHaveLength(1);
      expect(result[0].audioFileId).toBe("audio-100");
      expect(result[0].filename).toBe("file1.m4b");
      expect(result[0].libraryItemId).toBe("item-1");
      expect(result[0].title).toBe("Test Book 1");
    });

    it("should clear download status for missing files", async () => {
      const mockDownloads = [
        {
          audioFileId: "audio-200",
          filename: "missing.m4b",
          downloadPath: "downloads/item2/missing.m4b",
          libraryItemId: "item-2",
          title: "Test Book 2",
        },
      ];
      mocks.localData.getDownloadedAudioFilesWithLibraryInfo.mockResolvedValue(
        mockDownloads as any
      );
      mocks.fileSystem.verifyFileExists.mockResolvedValue(false);

      await fileLifecycleManager.detectCleanedUpFiles();

      expect(mocks.localData.clearAudioFileDownloadStatus).toHaveBeenCalledWith("audio-200");
    });

    it("should return empty array if all files exist", async () => {
      const mockDownloads = [
        {
          audioFileId: "audio-300",
          filename: "exists.m4b",
          downloadPath: "downloads/item3/exists.m4b",
          libraryItemId: "item-3",
          title: "Test Book 3",
        },
      ];
      mocks.localData.getDownloadedAudioFilesWithLibraryInfo.mockResolvedValue(
        mockDownloads as any
      );
      mocks.fileSystem.verifyFileExists.mockResolvedValue(true);

      const result = await fileLifecycleManager.detectCleanedUpFiles();

      expect(result).toHaveLength(0);
      expect(mocks.localData.clearAudioFileDownloadStatus).not.toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      mocks.localData.getAllDownloadedAudioFiles.mockRejectedValue(new Error("Database error"));

      const result = await fileLifecycleManager.detectCleanedUpFiles();

      expect(result).toHaveLength(0);
    });
  });
});
