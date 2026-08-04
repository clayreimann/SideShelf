import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createTestDb, TestDatabase } from "@/__tests__/utils/testDb";
import { libraries } from "@/db/schema/libraries";
import { libraryItems } from "@/db/schema/libraryItems";
import {
  localListeningSessions,
  localProgressSnapshots,
  progressSyncOutbox,
} from "@/db/schema/localData";
import { mediaMetadata } from "@/db/schema/mediaMetadata";
import { users } from "@/db/schema/users";
import { startListeningSession } from "../localListeningSessions";
import { wipeUserData } from "../wipeUserData";

describe("wipeUserData", () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDb();
    await testDb.db.insert(users).values({ id: "user-1", username: "user-1" });
    await testDb.db.insert(libraries).values({ id: "library-1", name: "Library" });
    await testDb.db.insert(libraryItems).values({ id: "item-1", libraryId: "library-1" });
    await testDb.db.insert(mediaMetadata).values({
      id: "media-1",
      libraryItemId: "item-1",
      mediaType: "book",
    });
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  it("explicitly deletes progress snapshots, listening sessions, and pending progress outbox rows", async () => {
    const sessionId = await startListeningSession("user-1", "item-1", "media-1", 0, 3600);
    await testDb.db.insert(localProgressSnapshots).values({
      id: "snapshot-1",
      sessionId,
      currentTime: 30,
      progress: 30 / 3600,
      playbackRate: 1,
      volume: 1,
      chapterId: null,
      isPlaying: true,
      timestamp: new Date(),
    });
    testDb.sqlite.execSync("PRAGMA foreign_keys = OFF");

    await wipeUserData();

    expect(await testDb.db.select().from(progressSyncOutbox)).toEqual([]);
    expect(await testDb.db.select().from(localProgressSnapshots)).toEqual([]);
    expect(await testDb.db.select().from(localListeningSessions)).toEqual([]);
  });
});
