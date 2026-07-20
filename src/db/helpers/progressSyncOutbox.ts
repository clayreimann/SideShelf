import { db } from "@/db/client";
import {
  localListeningSessions,
  progressSyncOutbox,
  type LocalListeningSessionRow,
  type ProgressSyncOutboxRow,
} from "@/db/schema/localData";
import { and, asc, desc, eq, isNull, lt, lte, or, sql } from "drizzle-orm";

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

export const PROGRESS_SYNC_DIAGNOSTIC_LIMIT = 100;

export type ProgressSyncDiagnostic = Pick<
  ProgressSyncOutboxRow,
  | "sessionId"
  | "desiredRevision"
  | "acknowledgedRevision"
  | "attemptCount"
  | "lastAttemptAt"
  | "nextAttemptAt"
  | "lastSuccessAt"
  | "updatedAt"
> & {
  hasError: boolean;
  terminalReason: ProgressSyncTerminalReason | "unknown" | null;
};

/** Read the newest bounded delivery metadata without payloads, account IDs, or raw error text. */
export async function getProgressSyncDiagnostics(): Promise<ProgressSyncDiagnostic[]> {
  const rows = await db
    .select({
      sessionId: progressSyncOutbox.sessionId,
      desiredRevision: progressSyncOutbox.desiredRevision,
      acknowledgedRevision: progressSyncOutbox.acknowledgedRevision,
      attemptCount: progressSyncOutbox.attemptCount,
      lastAttemptAt: progressSyncOutbox.lastAttemptAt,
      nextAttemptAt: progressSyncOutbox.nextAttemptAt,
      lastSuccessAt: progressSyncOutbox.lastSuccessAt,
      hasError: sql<number>`CASE WHEN ${progressSyncOutbox.lastError} IS NULL THEN 0 ELSE 1 END`.as(
        "has_error"
      ),
      terminalReason: progressSyncOutbox.terminalReason,
      updatedAt: progressSyncOutbox.updatedAt,
    })
    .from(progressSyncOutbox)
    .orderBy(desc(progressSyncOutbox.updatedAt), asc(progressSyncOutbox.sessionId))
    .limit(PROGRESS_SYNC_DIAGNOSTIC_LIMIT);

  return rows.map((row) => ({
    ...row,
    hasError: Boolean(row.hasError),
    terminalReason: normalizeDiagnosticTerminalReason(row.terminalReason),
  }));
}

function normalizeDiagnosticTerminalReason(
  reason: string | null
): ProgressSyncDiagnostic["terminalReason"] {
  if (reason === null) return null;
  if (
    reason === "media_missing" ||
    reason === "local_media_missing" ||
    reason === "malformed_local_data" ||
    reason === "too_short"
  ) {
    return reason;
  }
  return "unknown";
}

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
  const session = localListeningSessions;
  const rows = await db
    .select({
      outboxSessionId: sql<string>`${progressSyncOutbox.sessionId}`.as("outbox_session_id"),
      outboxUserId: sql<string>`${progressSyncOutbox.userId}`.as("outbox_user_id"),
      outboxDesiredRevision: sql<number>`${progressSyncOutbox.desiredRevision}`.as(
        "outbox_desired_revision"
      ),
      outboxAcknowledgedRevision: sql<number>`${progressSyncOutbox.acknowledgedRevision}`.as(
        "outbox_acknowledged_revision"
      ),
      outboxAttemptCount: sql<number>`${progressSyncOutbox.attemptCount}`.as(
        "outbox_attempt_count"
      ),
      outboxLastAttemptAt: sql<number | null>`${progressSyncOutbox.lastAttemptAt}`.as(
        "outbox_last_attempt_at"
      ),
      outboxNextAttemptAt: sql<number | null>`${progressSyncOutbox.nextAttemptAt}`.as(
        "outbox_next_attempt_at"
      ),
      outboxLastSuccessAt: sql<number | null>`${progressSyncOutbox.lastSuccessAt}`.as(
        "outbox_last_success_at"
      ),
      outboxLastError: sql<string | null>`${progressSyncOutbox.lastError}`.as("outbox_last_error"),
      outboxTerminalReason: sql<string | null>`${progressSyncOutbox.terminalReason}`.as(
        "outbox_terminal_reason"
      ),
      outboxCreatedAt: sql<number>`${progressSyncOutbox.createdAt}`.as("outbox_created_at"),
      outboxUpdatedAt: sql<number>`${progressSyncOutbox.updatedAt}`.as("outbox_updated_at"),
      sessionId: sql<string>`${session.id}`.as("session_id"),
      sessionUserId: sql<string>`${session.userId}`.as("session_user_id"),
      sessionLibraryItemId: sql<string>`${session.libraryItemId}`.as("session_library_item_id"),
      sessionMediaId: sql<string>`${session.mediaId}`.as("session_media_id"),
      sessionEpisodeId: sql<string | null>`${session.episodeId}`.as("session_episode_id"),
      sessionStart: sql<number>`${session.sessionStart}`.as("session_start"),
      sessionEnd: sql<number | null>`${session.sessionEnd}`.as("session_end"),
      sessionStartTime: sql<number>`${session.startTime}`.as("session_start_time"),
      sessionEndTime: sql<number | null>`${session.endTime}`.as("session_end_time"),
      sessionCurrentTime: sql<number>`${session.currentTime}`.as("session_current_time"),
      sessionDuration: sql<number>`${session.duration}`.as("session_duration"),
      sessionTimeListening: sql<number>`${session.timeListening}`.as("session_time_listening"),
      sessionPlaybackRate: sql<number>`${session.playbackRate}`.as("session_playback_rate"),
      sessionVolume: sql<number>`${session.volume}`.as("session_volume"),
      sessionIsSynced: sql<number>`${session.isSynced}`.as("session_is_synced"),
      sessionSyncAttempts: sql<number>`${session.syncAttempts}`.as("session_sync_attempts"),
      sessionLastSyncAttempt: sql<number | null>`${session.lastSyncAttempt}`.as(
        "session_last_sync_attempt"
      ),
      sessionLastSyncTime: sql<number | null>`${session.lastSyncTime}`.as("session_last_sync_time"),
      sessionServerSessionId: sql<string | null>`${session.serverSessionId}`.as(
        "session_server_session_id"
      ),
      sessionSyncError: sql<string | null>`${session.syncError}`.as("session_sync_error"),
      sessionCreatedAt: sql<number>`${session.createdAt}`.as("session_created_at"),
      sessionUpdatedAt: sql<number>`${session.updatedAt}`.as("session_updated_at"),
    })
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

  const outbox: ProgressSyncOutboxRow = {
    sessionId: row.outboxSessionId,
    userId: row.outboxUserId,
    desiredRevision: row.outboxDesiredRevision,
    acknowledgedRevision: row.outboxAcknowledgedRevision,
    attemptCount: row.outboxAttemptCount,
    lastAttemptAt: fromNullableDatabaseTimestamp(row.outboxLastAttemptAt),
    nextAttemptAt: fromNullableDatabaseTimestamp(row.outboxNextAttemptAt),
    lastSuccessAt: fromNullableDatabaseTimestamp(row.outboxLastSuccessAt),
    lastError: row.outboxLastError,
    terminalReason: row.outboxTerminalReason,
    createdAt: fromDatabaseTimestamp(row.outboxCreatedAt),
    updatedAt: fromDatabaseTimestamp(row.outboxUpdatedAt),
  };
  const selectedSession: LocalListeningSessionRow = {
    id: row.sessionId,
    userId: row.sessionUserId,
    libraryItemId: row.sessionLibraryItemId,
    mediaId: row.sessionMediaId,
    episodeId: row.sessionEpisodeId,
    sessionStart: fromDatabaseTimestamp(row.sessionStart),
    sessionEnd: fromNullableDatabaseTimestamp(row.sessionEnd),
    startTime: row.sessionStartTime,
    endTime: row.sessionEndTime,
    currentTime: row.sessionCurrentTime,
    duration: row.sessionDuration,
    timeListening: row.sessionTimeListening,
    playbackRate: row.sessionPlaybackRate,
    volume: row.sessionVolume,
    isSynced: Boolean(row.sessionIsSynced),
    syncAttempts: row.sessionSyncAttempts,
    lastSyncAttempt: fromNullableDatabaseTimestamp(row.sessionLastSyncAttempt),
    lastSyncTime: fromNullableDatabaseTimestamp(row.sessionLastSyncTime),
    serverSessionId: row.sessionServerSessionId,
    syncError: row.sessionSyncError,
    createdAt: fromDatabaseTimestamp(row.sessionCreatedAt),
    updatedAt: fromDatabaseTimestamp(row.sessionUpdatedAt),
  };

  return { outbox, session: selectedSession, sentRevision: outbox.desiredRevision };
}

function fromDatabaseTimestamp(value: number): Date {
  return new Date(value * 1000);
}

function fromNullableDatabaseTimestamp(value: number | null): Date | null {
  return value === null ? null : fromDatabaseTimestamp(value);
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
