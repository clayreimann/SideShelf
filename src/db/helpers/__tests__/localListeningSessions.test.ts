import { afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createTestDb, TestDatabase } from "@/__tests__/utils/testDb";
import { localListeningSessions, progressSyncOutbox } from "@/db/schema/localData";
import { libraries } from "@/db/schema/libraries";
import { libraryItems } from "@/db/schema/libraryItems";
import { mediaMetadata } from "@/db/schema/mediaMetadata";
import { users } from "@/db/schema/users";
import { eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  applyLocalPlaybackTick,
  endListeningSession,
  endStaleListeningSession,
  getListeningSession,
  reconcileSessionPositionFromServer,
  resetSessionListeningTime,
  startListeningSession,
  updateServerSessionId,
} from "../localListeningSessions";
import { getProgressSyncOutbox } from "../progressSyncOutbox";

describe("local listening session mutations", () => {
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDb();
    let sessionNumber = 0;
    const uuidMock = uuidv4 as unknown as {
      mockReset(): void;
      mockImplementation(implementation: () => string): void;
    };
    uuidMock.mockReset();
    uuidMock.mockImplementation(() => `session-${++sessionNumber}`);
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

  async function startSession(userId = "user-1"): Promise<string> {
    return startListeningSession(userId, "item-1", "media-1", 12, 3600);
  }

  it("creates the session and initial pending outbox revision together", async () => {
    const sessionId = await startSession();

    expect(await getListeningSession(sessionId)).toMatchObject({ userId: "user-1" });
    expect(await getProgressSyncOutbox(sessionId)).toMatchObject({
      sessionId,
      desiredRevision: 1,
      acknowledgedRevision: 0,
    });
  });

  it("persists an optional podcast episode identity on the durable session", async () => {
    const sessionId = await startListeningSession(
      "user-1",
      "item-1",
      "media-1",
      12,
      3600,
      1,
      1,
      "episode-1"
    );

    expect(await getListeningSession(sessionId)).toMatchObject({ episodeId: "episode-1" });
  });

  it("updates playback state, accumulated listening time, and one revision atomically", async () => {
    const sessionId = await startSession();

    await applyLocalPlaybackTick(sessionId, {
      currentTime: 42,
      listeningTimeDelta: 1.25,
      playbackRate: 1.5,
      volume: 0.8,
    });

    expect(await getListeningSession(sessionId)).toMatchObject({
      currentTime: 42,
      timeListening: 1.25,
      playbackRate: 1.5,
      volume: 0.8,
    });
    expect(await getProgressSyncOutbox(sessionId)).toMatchObject({ desiredRevision: 2 });
  });

  it("advances the revision for both explicit and stale session endings", async () => {
    const explicitId = await startSession();
    await endListeningSession(explicitId, 100);
    expect(await getProgressSyncOutbox(explicitId)).toMatchObject({ desiredRevision: 2 });

    const staleId = await startSession();
    const staleUpdatedAt = new Date("2026-07-20T10:30:00.000Z");
    await testDb.db
      .update(localListeningSessions)
      .set({ updatedAt: staleUpdatedAt })
      .where(eq(localListeningSessions.id, staleId));
    await endStaleListeningSession(staleId, 200);
    expect(await getListeningSession(staleId)).toMatchObject({
      sessionEnd: staleUpdatedAt,
      updatedAt: staleUpdatedAt,
    });
    expect(await getProgressSyncOutbox(staleId)).toMatchObject({ desiredRevision: 2 });
  });

  it("does not dirty the outbox when reconciling a server position", async () => {
    const sessionId = await startSession();

    await reconcileSessionPositionFromServer(sessionId, 88);

    expect(await getListeningSession(sessionId)).toMatchObject({ currentTime: 88 });
    expect(await getProgressSyncOutbox(sessionId)).toMatchObject({ desiredRevision: 1 });
  });

  it("keeps the outbox revision unchanged for server reconciliation helpers", async () => {
    const sessionId = await startSession();
    await applyLocalPlaybackTick(sessionId, {
      currentTime: 20,
      listeningTimeDelta: 3,
      playbackRate: 1,
      volume: 1,
    });

    await resetSessionListeningTime(sessionId);
    await updateServerSessionId(sessionId, "server-session-1");

    expect(await getListeningSession(sessionId)).toMatchObject({
      timeListening: 0,
      serverSessionId: "server-session-1",
    });
    expect(await getProgressSyncOutbox(sessionId)).toMatchObject({ desiredRevision: 2 });
  });

  it("rolls back a session update when its outbox row is missing", async () => {
    const sessionId = await startSession();
    await testDb.db.delete(progressSyncOutbox).where(eq(progressSyncOutbox.sessionId, sessionId));

    await expect(
      applyLocalPlaybackTick(sessionId, {
        currentTime: 42,
        listeningTimeDelta: 1,
        playbackRate: 1,
        volume: 1,
      })
    ).rejects.toThrow(`Outbox ${sessionId} not found`);

    expect(await getListeningSession(sessionId)).toMatchObject({
      currentTime: 12,
      timeListening: 0,
    });
  });

  it("rolls back a real transaction when its forced second statement fails", async () => {
    const sessionId = await startSession();

    expect(() =>
      testDb.db.transaction((tx) => {
        const sessionResult = tx
          .update(localListeningSessions)
          .set({
            currentTime: 42,
            timeListening: sql`${localListeningSessions.timeListening} + 1`,
          })
          .where(eq(localListeningSessions.id, sessionId))
          .run();
        if (sessionResult.changes !== 1) {
          throw new Error("Session update unexpectedly failed");
        }

        const outboxResult = tx
          .update(progressSyncOutbox)
          .set({ desiredRevision: sql`${progressSyncOutbox.desiredRevision} + 1` })
          .where(eq(progressSyncOutbox.sessionId, "missing-outbox"))
          .run();
        if (outboxResult.changes !== 1) {
          throw new Error("forced second statement failure");
        }
      })
    ).toThrow("forced second statement failure");

    expect(await getListeningSession(sessionId)).toMatchObject({
      currentTime: 12,
      timeListening: 0,
    });
    expect(await getProgressSyncOutbox(sessionId)).toMatchObject({ desiredRevision: 1 });
  });
});
