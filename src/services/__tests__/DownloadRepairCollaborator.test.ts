/**
 * Tests for DownloadRepairCollaborator
 *
 * Collaborator concern: repair and delete operations — DB read + filesystem + DB write.
 * No facade reference needed. No access to activeDownloads Map.
 *
 * Mock setup (4 mocks):
 *   - @/db/helpers/audioFiles (markAudioFileAsDownloaded, clearAudioFileDownloadStatus)
 *   - @/db/helpers/combinedQueries (getAudioFilesWithDownloadInfo)
 *   - @/db/helpers/mediaMetadata (getMediaMetadataByLibraryItemId)
 *   - @/lib/fileSystem (verifyFileExists, getDownloadPath, getDownloadsDirectory)
 *   - @/lib/covers (cacheCoverIfMissing)
 *   - @/lib/iCloudBackupExclusion (setExcludeFromBackup)
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { DownloadRepairCollaborator } from "@/services/download/DownloadRepairCollaborator";

// --- Mocks ---

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

jest.mock("@/lib/fileSystem", () => ({
  verifyFileExists: jest.fn(),
  getDownloadPath: jest.fn(
    (libraryItemId: string, filename: string, _location?: string) =>
      `/documents/downloads/${libraryItemId}/${filename}`
  ),
  getAudioFileLocation: jest.fn().mockReturnValue(null),
  getDownloadsDirectory: jest.fn(() => ({
    exists: false,
    delete: jest.fn(),
  })),
}));

jest.mock("@/lib/covers", () => ({
  cacheCoverIfMissing: jest.fn(),
}));

jest.mock("@/lib/iCloudBackupExclusion", () => ({
  setExcludeFromBackup: jest.fn(),
}));

// --- Typed mock helpers ---

import { markAudioFileAsDownloaded, clearAudioFileDownloadStatus } from "@/db/helpers/audioFiles";
import { getAudioFilesWithDownloadInfo } from "@/db/helpers/combinedQueries";
import { getMediaMetadataByLibraryItemId } from "@/db/helpers/mediaMetadata";
import { verifyFileExists, getDownloadsDirectory, getAudioFileLocation } from "@/lib/fileSystem";
import { cacheCoverIfMissing } from "@/lib/covers";
import { setExcludeFromBackup } from "@/lib/iCloudBackupExclusion";

const mockMarkAudioFileAsDownloaded = markAudioFileAsDownloaded as jest.MockedFunction<
  typeof markAudioFileAsDownloaded
>;
const mockClearAudioFileDownloadStatus = clearAudioFileDownloadStatus as jest.MockedFunction<
  typeof clearAudioFileDownloadStatus
>;
const mockGetAudioFilesWithDownloadInfo = getAudioFilesWithDownloadInfo as jest.MockedFunction<
  typeof getAudioFilesWithDownloadInfo
>;
const mockGetMediaMetadataByLibraryItemId = getMediaMetadataByLibraryItemId as jest.MockedFunction<
  typeof getMediaMetadataByLibraryItemId
>;
const mockVerifyFileExists = verifyFileExists as jest.MockedFunction<typeof verifyFileExists>;
const mockGetDownloadsDirectory = getDownloadsDirectory as jest.MockedFunction<
  typeof getDownloadsDirectory
>;
const mockCacheCoverIfMissing = cacheCoverIfMissing as jest.MockedFunction<
  typeof cacheCoverIfMissing
>;
const mockSetExcludeFromBackup = setExcludeFromBackup as jest.MockedFunction<
  typeof setExcludeFromBackup
>;
const mockGetAudioFileLocation = getAudioFileLocation as jest.MockedFunction<
  typeof getAudioFileLocation
>;

// --- Fixture data ---

const MOCK_METADATA = {
  id: "media-meta-1",
  libraryItemId: "item-1",
  title: "Test Book",
  authorName: null,
  narratorName: null,
  publishedYear: null,
  description: null,
  isbn: null,
  asin: null,
  language: null,
  explicit: false,
  abridged: false,
  coverPath: null,
  duration: 3600,
  numTracks: 2,
  numAudioFiles: 2,
  ebookFileFormat: null,
  ebookFileSize: null,
  tags: null,
  genres: null,
  narrators: null,
  updatedAt: new Date(),
  createdAt: new Date(),
  libraryId: "lib-1",
  mediaType: "book" as const,
};

function makeAudioFile(
  id: string,
  filename: string,
  size: number,
  isDownloaded: boolean,
  downloadPath?: string
) {
  return {
    id,
    filename,
    size,
    ino: `ino-${id}`,
    mimeType: "audio/mpeg",
    codec: null,
    bitrate: null,
    channels: null,
    sampleRate: null,
    duration: null,
    trackNum: null,
    discNum: null,
    title: null,
    mediaMetadataId: "media-meta-1",
    updatedAt: new Date(),
    createdAt: new Date(),
    downloadInfo: isDownloaded
      ? {
          isDownloaded: true,
          downloadPath: downloadPath ?? `/documents/downloads/item-1/${filename}`,
          downloadedAt: new Date(),
          storageLocation: "documents" as const,
        }
      : null,
  };
}

// --- Tests ---

describe("DownloadRepairCollaborator", () => {
  let collaborator: DownloadRepairCollaborator;

  beforeEach(() => {
    collaborator = new DownloadRepairCollaborator();
    jest.clearAllMocks();
    mockGetMediaMetadataByLibraryItemId.mockResolvedValue(MOCK_METADATA as any);
    mockMarkAudioFileAsDownloaded.mockResolvedValue(undefined as any);
    mockClearAudioFileDownloadStatus.mockResolvedValue(undefined as any);
    mockCacheCoverIfMissing.mockResolvedValue(undefined);
    mockSetExcludeFromBackup.mockResolvedValue(undefined);
    mockGetAudioFileLocation.mockReturnValue(null);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── repairDownloadStatus ───────────────────────────────────────────────────

  describe("repairDownloadStatus()", () => {
    it("returns 0 when no files need repair (all exist at stored path)", async () => {
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        makeAudioFile("af-1", "chapter-1.mp3", 500_000, true) as any,
        makeAudioFile("af-2", "chapter-2.mp3", 600_000, true) as any,
      ]);
      // Both files exist at their stored paths
      mockVerifyFileExists.mockResolvedValue(true);

      const count = await collaborator.repairDownloadStatus("item-1");
      expect(count).toBe(0);
      expect(mockMarkAudioFileAsDownloaded).not.toHaveBeenCalled();
      expect(mockClearAudioFileDownloadStatus).not.toHaveBeenCalled();
    });

    it("marks file as downloaded with corrected path when file found via getAudioFileLocation", async () => {
      const storedPath = "/old-container/documents/downloads/item-1/chapter-1.mp3";
      const expectedPath = "/documents/downloads/item-1/chapter-1.mp3";

      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        makeAudioFile("af-1", "chapter-1.mp3", 500_000, true, storedPath) as any,
      ]);
      // File missing at stored path, but getAudioFileLocation finds it in documents
      mockVerifyFileExists.mockResolvedValue(false); // stored path check fails
      mockGetAudioFileLocation.mockReturnValue("documents"); // found at current path

      const count = await collaborator.repairDownloadStatus("item-1");
      expect(count).toBe(1);
      expect(mockMarkAudioFileAsDownloaded).toHaveBeenCalledWith("af-1", expectedPath);
      expect(mockSetExcludeFromBackup).toHaveBeenCalledWith(expectedPath);
    });

    it("repairs file found in Documents when stored path is a stale legacy absolute path", async () => {
      const legacyPath =
        "file:///var/mobile/Containers/Data/Application/OLD-UUID-1234/Documents/downloads/item-1/chapter-1.mp3";
      const repairedPath = "/documents/downloads/item-1/chapter-1.mp3";

      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        makeAudioFile("af-1", "chapter-1.mp3", 500_000, true, legacyPath) as any,
      ]);
      // Stored path fails (UUID changed), getAudioFileLocation finds file in Documents
      mockVerifyFileExists.mockResolvedValue(false);
      mockGetAudioFileLocation.mockReturnValue("documents");

      const count = await collaborator.repairDownloadStatus("item-1");

      expect(count).toBe(1);
      expect(mockMarkAudioFileAsDownloaded).toHaveBeenCalledWith("af-1", repairedPath);
      expect(mockClearAudioFileDownloadStatus).not.toHaveBeenCalled();
    });

    it("clears download status when file missing from both stored and expected paths", async () => {
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        makeAudioFile("af-1", "chapter-1.mp3", 500_000, true) as any,
      ]);
      // File missing at both paths
      mockVerifyFileExists.mockResolvedValue(false);

      const count = await collaborator.repairDownloadStatus("item-1");
      expect(count).toBe(0);
      expect(mockClearAudioFileDownloadStatus).toHaveBeenCalledWith("af-1");
      expect(mockMarkAudioFileAsDownloaded).not.toHaveBeenCalled();
    });

    it("skips files not marked as downloaded", async () => {
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        makeAudioFile("af-1", "chapter-1.mp3", 500_000, false) as any, // not downloaded
      ]);

      const count = await collaborator.repairDownloadStatus("item-1");
      expect(count).toBe(0);
      expect(mockVerifyFileExists).not.toHaveBeenCalled();
    });

    it("repairs multiple files in a single call and returns correct count", async () => {
      const storedPath = "/old-container/downloads/item-1/chapter-X.mp3";
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        makeAudioFile("af-1", "chapter-1.mp3", 500_000, true, storedPath) as any,
        makeAudioFile("af-2", "chapter-2.mp3", 600_000, true, storedPath) as any,
      ]);
      // Both files are missing at stored path but found via getAudioFileLocation
      mockVerifyFileExists.mockResolvedValue(false); // both stored paths fail
      mockGetAudioFileLocation.mockReturnValue("documents"); // both found in Documents

      const count = await collaborator.repairDownloadStatus("item-1");
      expect(count).toBe(2);
      expect(mockMarkAudioFileAsDownloaded).toHaveBeenCalledTimes(2);
    });

    it("returns 0 when metadata not found", async () => {
      mockGetMediaMetadataByLibraryItemId.mockResolvedValue(null);

      const count = await collaborator.repairDownloadStatus("item-1");
      expect(count).toBe(0);
    });

    it("returns 0 when no audio files in DB", async () => {
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([]);

      const count = await collaborator.repairDownloadStatus("item-1");
      expect(count).toBe(0);
    });

    it("returns 0 on unexpected error", async () => {
      mockGetAudioFilesWithDownloadInfo.mockRejectedValue(new Error("DB error"));

      const count = await collaborator.repairDownloadStatus("item-1");
      expect(count).toBe(0);
    });
  });

  // ─── deleteDownloadedLibraryItem ────────────────────────────────────────────

  describe("deleteDownloadedLibraryItem()", () => {
    it("calls clearAudioFileDownloadStatus for each downloaded audio file", async () => {
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        makeAudioFile("af-1", "chapter-1.mp3", 500_000, true) as any,
        makeAudioFile("af-2", "chapter-2.mp3", 600_000, true) as any,
        makeAudioFile("af-3", "chapter-3.mp3", 700_000, false) as any, // not downloaded
      ]);
      // Directories don't exist
      mockGetDownloadsDirectory.mockReturnValue({
        exists: false,
        delete: jest.fn(),
      } as any);

      await collaborator.deleteDownloadedLibraryItem("item-1");

      // Only the 2 downloaded files should be cleared
      expect(mockClearAudioFileDownloadStatus).toHaveBeenCalledTimes(2);
      expect(mockClearAudioFileDownloadStatus).toHaveBeenCalledWith("af-1");
      expect(mockClearAudioFileDownloadStatus).toHaveBeenCalledWith("af-2");
    });

    it("deletes directory and clears DB status when directory exists", async () => {
      const mockDelete = jest.fn().mockResolvedValue(undefined);
      mockGetDownloadsDirectory.mockReturnValue({
        exists: true,
        delete: mockDelete,
      } as any);
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        makeAudioFile("af-1", "chapter-1.mp3", 500_000, true) as any,
      ]);

      await collaborator.deleteDownloadedLibraryItem("item-1");

      expect(mockDelete).toHaveBeenCalled();
      expect(mockClearAudioFileDownloadStatus).toHaveBeenCalledWith("af-1");
    });

    it("calls cacheCoverIfMissing after deletion", async () => {
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([]);
      mockGetDownloadsDirectory.mockReturnValue({
        exists: false,
        delete: jest.fn(),
      } as any);

      await collaborator.deleteDownloadedLibraryItem("item-1");

      expect(mockCacheCoverIfMissing).toHaveBeenCalledWith("item-1");
    });

    it("does not clear status for files not marked as downloaded", async () => {
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        makeAudioFile("af-1", "chapter-1.mp3", 500_000, false) as any,
      ]);
      mockGetDownloadsDirectory.mockReturnValue({
        exists: false,
        delete: jest.fn(),
      } as any);

      await collaborator.deleteDownloadedLibraryItem("item-1");

      expect(mockClearAudioFileDownloadStatus).not.toHaveBeenCalled();
    });

    it("throws error when deletion fails", async () => {
      mockGetDownloadsDirectory.mockReturnValue({
        exists: true,
        delete: jest.fn().mockRejectedValue(new Error("Delete failed")),
      } as any);

      await expect(collaborator.deleteDownloadedLibraryItem("item-1")).rejects.toThrow(
        "Delete failed"
      );
    });
  });
});
