import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createTestDb, TestDatabase } from "@/__tests__/utils/testDb";
import { localListeningSessions } from "@/db/schema/localData";
import { libraries } from "@/db/schema/libraries";
import { libraryItems } from "@/db/schema/libraryItems";
import { mediaMetadata } from "@/db/schema/mediaMetadata";
import { users } from "@/db/schema/users";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  acknowledgeProgressSyncRevision,
  getNextEligibleProgressSync,
  getProgressSyncOutbox,
  recordProgressSyncFailure,
  terminallyResolveProgressSyncRevision,
} from "../progressSyncOutbox";
import { applyLocalPlaybackTick, startListeningSession } from "../localListeningSessions";

describe("progress sync outbox helpers", () => {
  let testDb: TestDatabase;
  const now = new Date("2026-07-20T12:00:00.000Z");

  beforeEach(async () => {
    testDb = await createTestDb();
    let sessionNumber = 0;
    const uuidMock = uuidv4 as unknown as {
      mockReset(): void;
      mockImplementation(implementation: () => string): void;
    };
    uuidMock.mockReset();
    uuidMock.mockImplementation(() => `session-${++sessionNumber}`);
    await testDb.db.insert(users).values([
      { id: "user-1", username: "user-1" },
      { id: "user-2", username: "user-2" },
    ]);
    await testDb.db.insert(libraries).values({ id: "library-1", name: "Library" });
    await testDb.db.insert(libraryItems).values([
      { id: "item-1", libraryId: "library-1" },
      { id: "item-2", libraryId: "library-1" },
      { id: "item-3", libraryId: "library-1" },
    ]);
    await testDb.db.insert(mediaMetadata).values([
      { id: "media-1", libraryItemId: "item-1", mediaType: "book" },
      { id: "media-2", libraryItemId: "item-2", mediaType: "book" },
      { id: "media-3", libraryItemId: "item-3", mediaType: "book" },
    ]);
  });

  afterEach(async () => {
    await testDb.cleanup();
  });

  async function startSession(userId: string, startTime: number): Promise<string> {
    return startListeningSession(
      userId,
      `item-${startTime}`,
      `media-${startTime}`,
      startTime,
      3600
    );
  }

  it("selects the oldest eligible pending session for only the requested user", async () => {
    const first = await startSession("user-1", 1);
    const second = await startSession("user-1", 2);
    await startSession("user-2", 3);
    const firstCreatedAt = new Date("2026-07-20T11:59:58.000Z");
    const secondCreatedAt = new Date("2026-07-20T11:59:59.000Z");
    await testDb.db
      .update(localListeningSessions)
      .set({ createdAt: firstCreatedAt })
      .where(eq(localListeningSessions.id, first));
    await testDb.db
      .update(localListeningSessions)
      .set({ createdAt: secondCreatedAt })
      .where(eq(localListeningSessions.id, second));

    const selectSpy = jest.spyOn(testDb.db, "select");
    const pending = await getNextEligibleProgressSync("user-1", now);
    expect(selectSpy).toHaveBeenCalledTimes(1);
    selectSpy.mockRestore();

    expect(pending).toMatchObject({
      sentRevision: 1,
      session: { id: first, userId: "user-1", createdAt: firstCreatedAt },
      outbox: { sessionId: first, userId: "user-1" },
    });

    await acknowledgeProgressSyncRevision(first, 1, now);
    expect(await getNextEligibleProgressSync("user-1", now)).toMatchObject({
      session: { id: second, createdAt: secondCreatedAt },
    });
    expect(await getNextEligibleProgressSync("user-2", now)).toMatchObject({
      session: { userId: "user-2" },
    });
  });

  it("excludes a pending row until its retry deadline is due", async () => {
    const sessionId = await startSession("user-1", 1);
    const nextAttemptAt = new Date(now.getTime() + 60_000);

    await recordProgressSyncFailure(sessionId, now, nextAttemptAt, "server unavailable");

    expect(await getNextEligibleProgressSync("user-1", now)).toBeNull();
    expect(await getNextEligibleProgressSync("user-1", nextAttemptAt)).toMatchObject({
      session: { id: sessionId },
      sentRevision: 1,
    });
    expect(await getProgressSyncOutbox(sessionId)).toMatchObject({
      attemptCount: 1,
      lastError: "server unavailable",
    });
  });

  it("acknowledges only the captured revision when newer local work exists", async () => {
    const sessionId = await startSession("user-1", 1);
    await applyLocalPlaybackTick(sessionId, {
      currentTime: 2,
      listeningTimeDelta: 1,
      playbackRate: 1,
      volume: 1,
    });

    await acknowledgeProgressSyncRevision(sessionId, 1, now);

    expect(await getProgressSyncOutbox(sessionId)).toMatchObject({
      desiredRevision: 2,
      acknowledgedRevision: 1,
      attemptCount: 0,
      lastError: null,
      nextAttemptAt: null,
    });
    expect(await getNextEligibleProgressSync("user-1", now)).toMatchObject({ sentRevision: 2 });
  });

  it("terminally resolves a captured revision and removes it from automatic draining", async () => {
    const sessionId = await startSession("user-1", 1);

    await terminallyResolveProgressSyncRevision(
      sessionId,
      1,
      "media_missing",
      now,
      "Remote media was deleted"
    );

    expect(await getProgressSyncOutbox(sessionId)).toMatchObject({
      acknowledgedRevision: 1,
      terminalReason: "media_missing",
      lastError: "Remote media was deleted",
    });
    expect(await getNextEligibleProgressSync("user-1", now)).toBeNull();
  });

  it("does not let an older terminal result block a newer local revision", async () => {
    const sessionId = await startSession("user-1", 1);
    await applyLocalPlaybackTick(sessionId, {
      currentTime: 2,
      listeningTimeDelta: 1,
      playbackRate: 1,
      volume: 1,
    });

    await terminallyResolveProgressSyncRevision(sessionId, 1, "media_missing", now);

    expect(await getProgressSyncOutbox(sessionId)).toMatchObject({
      desiredRevision: 2,
      acknowledgedRevision: 1,
      terminalReason: null,
    });
    expect(await getNextEligibleProgressSync("user-1", now)).toMatchObject({ sentRevision: 2 });
  });
});
