import { db } from "@/db/client";
import {
  localListeningSessions,
  progressSyncOutbox,
  type LocalListeningSessionRow,
  type ProgressSyncOutboxRow,
} from "@/db/schema/localData";
import { and, asc, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

export type ProgressSyncTerminalReason =
  | "media_missing"
  | "local_media_missing"
  | "malformed_local_data"
  | "too_short";

export type PendingProgressSync = {
  outbox: ProgressSyncOutboxRow;
  session: LocalListeningSessionRow;
  sentRevision: number;
};

export async function getProgressSyncOutbox(
  sessionId: string
): Promise<ProgressSyncOutboxRow | null> {
  const rows = await db
    .select()
    .from(progressSyncOutbox)
    .where(eq(progressSyncOutbox.sessionId, sessionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getNextEligibleProgressSync(
  userId: string,
  now: Date
): Promise<PendingProgressSync | null> {
  const session = alias(localListeningSessions, "pending_progress_session");
  const rows = await db
    .select({ outbox: progressSyncOutbox, sessionId: session.id })
    .from(progressSyncOutbox)
    .innerJoin(session, eq(progressSyncOutbox.sessionId, session.id))
    .where(
      and(
        eq(progressSyncOutbox.userId, userId),
        lt(progressSyncOutbox.acknowledgedRevision, progressSyncOutbox.desiredRevision),
        isNull(progressSyncOutbox.terminalReason),
        or(isNull(progressSyncOutbox.nextAttemptAt), lte(progressSyncOutbox.nextAttemptAt, now))
      )
    )
    .orderBy(asc(session.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  const sessions = await db
    .select()
    .from(localListeningSessions)
    .where(eq(localListeningSessions.id, row.sessionId))
    .limit(1);
  const selectedSession = sessions[0];
  return selectedSession
    ? {
        outbox: row.outbox,
        session: selectedSession,
        sentRevision: row.outbox.desiredRevision,
      }
    : null;
}

export async function recordProgressSyncFailure(
  sessionId: string,
  attemptedAt: Date,
  nextAttemptAt: Date,
  error: string
): Promise<void> {
  const result = db
    .update(progressSyncOutbox)
    .set({
      attemptCount: sql`${progressSyncOutbox.attemptCount} + 1`,
      lastAttemptAt: attemptedAt,
      nextAttemptAt,
      lastError: error,
      updatedAt: attemptedAt,
    })
    .where(eq(progressSyncOutbox.sessionId, sessionId))
    .run();
  ensureOutboxUpdated(sessionId, result.changes);
}

export async function acknowledgeProgressSyncRevision(
  sessionId: string,
  sentRevision: number,
  succeededAt: Date
): Promise<void> {
  const result = db
    .update(progressSyncOutbox)
    .set({
      acknowledgedRevision: sql`max(${progressSyncOutbox.acknowledgedRevision}, ${sentRevision})`,
      attemptCount: 0,
      lastAttemptAt: null,
      nextAttemptAt: null,
      lastSuccessAt: succeededAt,
      lastError: null,
      updatedAt: succeededAt,
    })
    .where(eq(progressSyncOutbox.sessionId, sessionId))
    .run();
  ensureOutboxUpdated(sessionId, result.changes);
}

export async function terminallyResolveProgressSyncRevision(
  sessionId: string,
  sentRevision: number,
  reason: ProgressSyncTerminalReason,
  resolvedAt: Date,
  error?: string
): Promise<void> {
  const result = db
    .update(progressSyncOutbox)
    .set({
      acknowledgedRevision: sql`max(${progressSyncOutbox.acknowledgedRevision}, ${sentRevision})`,
      nextAttemptAt: null,
      terminalReason: sql`CASE
        WHEN ${progressSyncOutbox.desiredRevision} <= ${sentRevision} THEN ${reason}
        ELSE NULL
      END`,
      lastError: sql`CASE
        WHEN ${progressSyncOutbox.desiredRevision} <= ${sentRevision} THEN ${error ?? null}
        ELSE NULL
      END`,
      updatedAt: resolvedAt,
    })
    .where(eq(progressSyncOutbox.sessionId, sessionId))
    .run();
  ensureOutboxUpdated(sessionId, result.changes);
}

function ensureOutboxUpdated(sessionId: string, changes: number): void {
  if (changes !== 1) {
    throw new Error(`Outbox ${sessionId} not found`);
  }
}
