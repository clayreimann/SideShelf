/**
 * Tests for cover-cache repair logic.
 *
 * Regression coverage for a bug where `repairMissingCoverArt` only checked
 * whether the cover *file* existed on disk (`isCoverCached`) and never
 * checked whether the corresponding `local_cover_cache` DB row existed. Every
 * cover-rendering query joins against that DB row, so an item whose file
 * downloaded successfully but whose row was never written rendered blank
 * forever — and the repair scan, which only looked at the filesystem, never
 * noticed or fixed it.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { libraries } from "@/db/schema/libraries";
import { libraryItems } from "@/db/schema/libraryItems";
import { localCoverCache } from "@/db/schema/localData";
import { mediaMetadata } from "@/db/schema/mediaMetadata";
import { setLocalCoverCached } from "@/db/helpers/localData";
import { Directory, File, Paths } from "expo-file-system";
import { createTestDb, TestDatabase } from "../../__tests__/utils/testDb";
import * as coversModule from "../covers";
import { getCoverUri, repairMissingCoverArt } from "../covers";

const mockFetchLibraryItemCoverHead =
  jest.fn<(libraryItemId: string) => Promise<{ ok: boolean; url: string }>>();
const mockApiFetch =
  jest.fn<(url: string) => Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>>();

jest.mock("@/lib/api/endpoints", () => ({
  fetchLibraryItemCoverHead: (libraryItemId: string) =>
    mockFetchLibraryItemCoverHead(libraryItemId),
}));

jest.mock("@/lib/api/api", () => ({
  apiFetch: (url: string) => mockApiFetch(url),
}));

jest.mock("@/lib/fileSystem", () => ({
  resolveAppPath: jest.fn((path: string) => path),
  toAppRelativePath: jest.fn((path: string) => path),
}));

const STUB_LIBRARY = {
  id: "lib-1",
  name: "Test Library",
  icon: null,
  displayOrder: 1,
  mediaType: "book" as const,
  createdAt: 1640995200000,
  updatedAt: 1672531200000,
};

function makeLibraryItemRow(id: string) {
  return {
    id,
    libraryId: "lib-1",
    ino: null,
    folderId: null,
    path: null,
    relPath: null,
    isFile: false,
    mtimeMs: null,
    ctimeMs: null,
    birthtimeMs: null,
    addedAt: 1640995200000,
    updatedAt: 1672531200000,
    lastScan: null,
    scanVersion: null,
    isMissing: false,
    isInvalid: false,
    mediaType: "book" as const,
  };
}

function makeMediaMetadataRow(id: string, libraryItemId: string) {
  return {
    id,
    libraryItemId,
    mediaType: "book" as const,
  };
}

describe("covers", () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDb();
    mockFetchLibraryItemCoverHead.mockReset();
    mockApiFetch.mockReset();

    await testDb.db.insert(libraries).values(STUB_LIBRARY);
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  describe("repairMissingCoverArt", () => {
    it("writes the local_cover_cache row without re-downloading when the file is already cached but the row is missing", async () => {
      await testDb.db.insert(libraryItems).values(makeLibraryItemRow("item-1"));
      await testDb.db.insert(mediaMetadata).values(makeMediaMetadataRow("media-1", "item-1"));

      // Simulate the cover file already existing on disk (downloaded previously)
      // but the DB row was never written — the exact bug scenario.
      const dir = new Directory(Paths.cache, "covers");
      const file = new File(dir, "item-1");
      file.write(new Uint8Array([1, 2, 3]));

      await repairMissingCoverArt();

      // No network call should have been made — the file already existed.
      expect(mockFetchLibraryItemCoverHead).not.toHaveBeenCalled();

      const rows = await testDb.db.select().from(localCoverCache);
      expect(rows).toHaveLength(1);
      expect(rows[0].mediaId).toBe("media-1");
      expect(getCoverUri("item-1")).toContain("item-1");
    });

    it("downloads and writes both the file and the DB row when both are missing", async () => {
      await testDb.db.insert(libraryItems).values(makeLibraryItemRow("item-2"));
      await testDb.db.insert(mediaMetadata).values(makeMediaMetadataRow("media-2", "item-2"));

      mockFetchLibraryItemCoverHead.mockResolvedValue({ ok: true, url: "http://server/cover.jpg" });
      mockApiFetch.mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new Uint8Array([9, 9, 9]).buffer,
      });

      await repairMissingCoverArt();

      expect(mockFetchLibraryItemCoverHead).toHaveBeenCalledWith("item-2");

      const rows = await testDb.db.select().from(localCoverCache);
      expect(rows).toHaveLength(1);
      expect(rows[0].mediaId).toBe("media-2");
    });

    it("skips items where both the file and the DB row already exist", async () => {
      await testDb.db.insert(libraryItems).values(makeLibraryItemRow("item-3"));
      await testDb.db.insert(mediaMetadata).values(makeMediaMetadataRow("media-3", "item-3"));

      const dir = new Directory(Paths.cache, "covers");
      const file = new File(dir, "item-3");
      file.write(new Uint8Array([1, 2, 3]));
      await setLocalCoverCached("media-3", file.uri);

      await repairMissingCoverArt();

      expect(mockFetchLibraryItemCoverHead).not.toHaveBeenCalled();

      const rows = await testDb.db.select().from(localCoverCache);
      expect(rows).toHaveLength(1);
    });
  });

  describe("dead code removal", () => {
    it("no longer exports cacheCoversForLibrary", () => {
      expect((coversModule as Record<string, unknown>).cacheCoversForLibrary).toBeUndefined();
    });
  });
});
