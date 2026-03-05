/**
 * Tests for DownloadStatusCollaborator
 *
 * Collaborator concern: DB-backed status queries — no facade needed, no activeDownloads access.
 *
 * Mock setup (3 mocks — much cleaner than 13+):
 *   - @/db/helpers/combinedQueries (getAudioFilesWithDownloadInfo)
 *   - @/db/helpers/mediaMetadata (getMediaMetadataByLibraryItemId)
 *   - @/lib/fileSystem (verifyFileExists, getDownloadPath, downloadFileExists)
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { DownloadStatusCollaborator } from "@/services/download/DownloadStatusCollaborator";

// --- Mocks ---

jest.mock("@/db/helpers/combinedQueries", () => ({
  getAudioFilesWithDownloadInfo: jest.fn(),
}));

jest.mock("@/db/helpers/mediaMetadata", () => ({
  getMediaMetadataByLibraryItemId: jest.fn(),
}));

jest.mock("@/lib/fileSystem", () => ({
  verifyFileExists: jest.fn(),
  getDownloadPath: jest.fn(
    (libraryItemId: string, filename: string) => `/documents/downloads/${libraryItemId}/${filename}`
  ),
  downloadFileExists: jest.fn(() => false),
}));

// --- Typed mock helpers ---

import { getAudioFilesWithDownloadInfo } from "@/db/helpers/combinedQueries";
import { getMediaMetadataByLibraryItemId } from "@/db/helpers/mediaMetadata";
import { verifyFileExists } from "@/lib/fileSystem";

const mockGetAudioFilesWithDownloadInfo = getAudioFilesWithDownloadInfo as jest.MockedFunction<
  typeof getAudioFilesWithDownloadInfo
>;
const mockGetMediaMetadataByLibraryItemId = getMediaMetadataByLibraryItemId as jest.MockedFunction<
  typeof getMediaMetadataByLibraryItemId
>;
const mockVerifyFileExists = verifyFileExists as jest.MockedFunction<typeof verifyFileExists>;

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

describe("DownloadStatusCollaborator", () => {
  let collaborator: DownloadStatusCollaborator;

  beforeEach(() => {
    collaborator = new DownloadStatusCollaborator();
    jest.clearAllMocks();
    mockGetMetadata();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function mockGetMetadata(metadata = MOCK_METADATA) {
    mockGetMediaMetadataByLibraryItemId.mockResolvedValue(metadata as any);
  }

  // ─── isLibraryItemDownloaded ────────────────────────────────────────────────

  describe("isLibraryItemDownloaded()", () => {
    it("returns true when all audio files are marked downloaded AND verified on disk", async () => {
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        makeAudioFile("af-1", "chapter-1.mp3", 500_000, true) as any,
        makeAudioFile("af-2", "chapter-2.mp3", 600_000, true) as any,
      ]);
      mockVerifyFileExists.mockResolvedValue(true);

      const result = await collaborator.isLibraryItemDownloaded("item-1");
      expect(result).toBe(true);
    });

    it("returns false when any audio file is missing from disk", async () => {
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        makeAudioFile("af-1", "chapter-1.mp3", 500_000, true) as any,
        makeAudioFile("af-2", "chapter-2.mp3", 600_000, true) as any,
      ]);
      // First file exists, second does not
      mockVerifyFileExists.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      const result = await collaborator.isLibraryItemDownloaded("item-1");
      expect(result).toBe(false);
    });

    it("returns false when any audio file is not marked as downloaded in DB", async () => {
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        makeAudioFile("af-1", "chapter-1.mp3", 500_000, true) as any,
        makeAudioFile("af-2", "chapter-2.mp3", 600_000, false) as any, // not downloaded
      ]);
      mockVerifyFileExists.mockResolvedValue(true);

      const result = await collaborator.isLibraryItemDownloaded("item-1");
      expect(result).toBe(false);
    });

    it("returns false when no audio files are found in DB", async () => {
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([]);

      const result = await collaborator.isLibraryItemDownloaded("item-1");
      expect(result).toBe(false);
    });

    it("returns false when metadata is not found", async () => {
      mockGetMediaMetadataByLibraryItemId.mockResolvedValue(null);

      const result = await collaborator.isLibraryItemDownloaded("item-1");
      expect(result).toBe(false);
    });

    it("returns false on unexpected DB error", async () => {
      mockGetAudioFilesWithDownloadInfo.mockRejectedValue(new Error("DB error"));

      const result = await collaborator.isLibraryItemDownloaded("item-1");
      expect(result).toBe(false);
    });
  });

  // ─── getDownloadProgress ───────────────────────────────────────────────────

  describe("getDownloadProgress()", () => {
    it("returns correct downloaded/total ratio when 2 of 3 files are downloaded", async () => {
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        makeAudioFile("af-1", "chapter-1.mp3", 500_000, true) as any,
        makeAudioFile("af-2", "chapter-2.mp3", 600_000, true) as any,
        makeAudioFile("af-3", "chapter-3.mp3", 700_000, false) as any,
      ]);

      const result = await collaborator.getDownloadProgress("item-1");
      expect(result).toEqual({ downloaded: 2, total: 3, progress: 2 / 3 });
    });

    it("returns {0, 0, 0} when no audio files exist", async () => {
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([]);

      const result = await collaborator.getDownloadProgress("item-1");
      expect(result).toEqual({ downloaded: 0, total: 0, progress: 0 });
    });

    it("returns {0, 0, 0} when metadata not found", async () => {
      mockGetMediaMetadataByLibraryItemId.mockResolvedValue(null);

      const result = await collaborator.getDownloadProgress("item-1");
      expect(result).toEqual({ downloaded: 0, total: 0, progress: 0 });
    });

    it("returns progress=1 when all files are downloaded", async () => {
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        makeAudioFile("af-1", "chapter-1.mp3", 500_000, true) as any,
        makeAudioFile("af-2", "chapter-2.mp3", 600_000, true) as any,
      ]);

      const result = await collaborator.getDownloadProgress("item-1");
      expect(result).toEqual({ downloaded: 2, total: 2, progress: 1 });
    });

    it("returns {0, 0, 0} on unexpected DB error", async () => {
      mockGetAudioFilesWithDownloadInfo.mockRejectedValue(new Error("DB error"));

      const result = await collaborator.getDownloadProgress("item-1");
      expect(result).toEqual({ downloaded: 0, total: 0, progress: 0 });
    });
  });

  // ─── getDownloadedSize ─────────────────────────────────────────────────────

  describe("getDownloadedSize()", () => {
    it("sums file sizes for files with isDownloaded=true", async () => {
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        makeAudioFile("af-1", "chapter-1.mp3", 500_000, true) as any,
        makeAudioFile("af-2", "chapter-2.mp3", 600_000, true) as any,
        makeAudioFile("af-3", "chapter-3.mp3", 700_000, false) as any, // not counted
      ]);

      const result = await collaborator.getDownloadedSize("item-1");
      expect(result).toBe(1_100_000);
    });

    it("returns 0 when no files are downloaded", async () => {
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([
        makeAudioFile("af-1", "chapter-1.mp3", 500_000, false) as any,
      ]);

      const result = await collaborator.getDownloadedSize("item-1");
      expect(result).toBe(0);
    });

    it("returns 0 when no audio files in DB", async () => {
      mockGetAudioFilesWithDownloadInfo.mockResolvedValue([]);

      const result = await collaborator.getDownloadedSize("item-1");
      expect(result).toBe(0);
    });

    it("returns 0 when metadata not found", async () => {
      mockGetMediaMetadataByLibraryItemId.mockResolvedValue(null);

      const result = await collaborator.getDownloadedSize("item-1");
      expect(result).toBe(0);
    });

    it("returns 0 on DB error", async () => {
      mockGetAudioFilesWithDownloadInfo.mockRejectedValue(new Error("DB error"));

      const result = await collaborator.getDownloadedSize("item-1");
      expect(result).toBe(0);
    });
  });
});
