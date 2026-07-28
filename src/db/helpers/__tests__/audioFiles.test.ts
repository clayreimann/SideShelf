import { createTestDb, TestDatabase } from "@/__tests__/utils/testDb";
import { audioFiles } from "@/db/schema/audioFiles";
import { libraries } from "@/db/schema/libraries";
import { localAudioFileDownloads } from "@/db/schema/localData";
import { libraryItems } from "@/db/schema/libraryItems";
import { mediaMetadata } from "@/db/schema/mediaMetadata";
import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { eq } from "drizzle-orm";
import { markAudioFileAsDownloaded } from "../audioFiles";

describe("audioFiles helper", () => {
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
    await testDb.db.insert(audioFiles).values({
      id: "audio-1",
      mediaId: "media-1",
      index: 1,
      ino: "ino-1",
      filename: "chapter.m4b",
      path: "/server/chapter.m4b",
    });
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it("persists a documents download location through the public wrapper", async () => {
    await markAudioFileAsDownloaded("audio-1", "D:downloads/item-1/chapter.m4b", "documents");

    const [download] = await testDb.db
      .select()
      .from(localAudioFileDownloads)
      .where(eq(localAudioFileDownloads.audioFileId, "audio-1"));

    expect(download.storageLocation).toBe("documents");
  });
});
