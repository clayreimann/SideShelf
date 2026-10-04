import { createTestDb, TestDatabase } from "@/__tests__/utils/testDb";
import { audioFiles } from "@/db/schema/audioFiles";
import { libraries } from "@/db/schema/libraries";
import { localAudioFileDownloads } from "@/db/schema/localData";
import { libraryItems } from "@/db/schema/libraryItems";
import { mediaMetadata } from "@/db/schema/mediaMetadata";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { getAudioFilesWithDownloadInfo } from "../combinedQueries";

jest.mock("@/lib/fileSystem", () => ({
  resolveAppPath: jest.fn((path: string) => path),
}));

describe("combinedQueries helper", () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDb();
    await testDb.db.insert(libraries).values({ id: "library-1", name: "Library" });
    await testDb.db.insert(libraryItems).values({ id: "item-1", libraryId: "library-1" });
    await testDb.db.insert(mediaMetadata).values({
      id: "media-1",
      libraryItemId: "item-1",
      mediaType: "book",
    });
    await testDb.db.insert(audioFiles).values([
      {
        id: "audio-1",
        mediaId: "media-1",
        index: 1,
        ino: "ino-1",
        filename: "chapter-1.m4b",
        path: "/server/chapter-1.m4b",
      },
      {
        id: "audio-2",
        mediaId: "media-1",
        index: 2,
        ino: "ino-2",
        filename: "chapter-2.m4b",
        path: "/server/chapter-2.m4b",
      },
    ]);
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it("preserves null and recorded download access timestamps in audio-file order", async () => {
    const recentAccess = new Date("2026-07-27T12:00:00.000Z");
    const downloadedAt = new Date("2026-07-01T12:00:00.000Z");
    await testDb.db.insert(localAudioFileDownloads).values([
      {
        audioFileId: "audio-1",
        isDownloaded: true,
        downloadPath: "D:downloads/item-1/chapter-1.m4b",
        downloadedAt,
        updatedAt: downloadedAt,
        storageLocation: "documents",
        lastAccessedAt: null,
      },
      {
        audioFileId: "audio-2",
        isDownloaded: true,
        downloadPath: "D:downloads/item-1/chapter-2.m4b",
        downloadedAt,
        updatedAt: downloadedAt,
        storageLocation: "documents",
        lastAccessedAt: recentAccess,
      },
    ]);

    const result = await getAudioFilesWithDownloadInfo("media-1");

    expect(result.map((file) => file.downloadInfo?.lastAccessedAt)).toEqual([null, recentAccess]);
  });
});
