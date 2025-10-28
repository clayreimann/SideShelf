/**
 * Local Listening Sessions Helper
 *
 * Manages local listening sessions that can work offline and sync later
 */

import { db } from '@/db/client';
import {
    localListeningSessions,
    localProgressSnapshots,
    type LocalListeningSessionRow,
    type LocalProgressSnapshotRow,
    type NewLocalListeningSessionRow,
    type NewLocalProgressSnapshotRow
} from '@/db/schema/localData';
import { and, asc, desc, eq, isNull, lt } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Start a new listening session
 */
export async function startListeningSession(
    userId: string,
    libraryItemId: string,
    mediaId: string,
    startTime: number,
    duration: number,
    playbackRate: number = 1.0,
    volume: number = 1.0
): Promise<string> {
    const sessionId = uuidv4();
    const now = new Date();

    const newSession: NewLocalListeningSessionRow = {
        id: sessionId,
        userId,
        libraryItemId,
        mediaId,
        sessionStart: now,
        sessionEnd: null,
        startTime,
        endTime: null,
        currentTime: startTime,
        duration,
        timeListening: 0,
        playbackRate,
        volume,
        isSynced: false,
        syncAttempts: 0,
        lastSyncAttempt: null,
        syncError: null,
        createdAt: now,
        updatedAt: now,
    };

    await db.insert(localListeningSessions).values(newSession);

    console.log(`[LocalListeningSessions] Started session ${sessionId} for ${libraryItemId}`);
    return sessionId;
}

/**
 * Get a listening session by ID
 */
export async function getListeningSession(sessionId: string): Promise<LocalListeningSessionRow | null> {
    const session = await db
        .select()
        .from(localListeningSessions)
        .where(eq(localListeningSessions.id, sessionId))
        .limit(1);
    return session[0] || null;
}

/**
 * End a listening session
 */
export async function endListeningSession(
    sessionId: string,
    endTime: number
): Promise<void> {
    const now = new Date();

    await db
        .update(localListeningSessions)
        .set({
            sessionEnd: now,
            endTime,
            updatedAt: now,
        })
        .where(eq(localListeningSessions.id, sessionId));

    console.log(`[LocalListeningSessions] Ended session ${sessionId} at ${endTime}s`);
}

/**
 * End a stale listening session using its last update time as the end timestamp
 * This is used when cleaning up sessions that were abandoned/stale - the session
 * actually ended at its last update time, not at the current time
 */
export async function endStaleListeningSession(
    sessionId: string,
    endTime: number
): Promise<void> {
    // Get the session to retrieve its last updated timestamp
    const session = await getListeningSession(sessionId);
    if (!session) {
        throw new Error(`Session ${sessionId} not found`);
    }

    // Use the session's updatedAt as the sessionEnd timestamp
    // This represents when the session was actually last active
    await db
        .update(localListeningSessions)
        .set({
            sessionEnd: session.updatedAt,
            endTime,
            updatedAt: session.updatedAt, // Keep the original updatedAt
        })
        .where(eq(localListeningSessions.id, sessionId));

    console.log(`[LocalListeningSessions] Ended stale session ${sessionId} at ${endTime}s (session ended at ${session.updatedAt.toISOString()})`);
}

/**
 * Update current progress in an active session
 */
export async function updateSessionProgress(
    sessionId: string,
    currentTime: number,
    playbackRate?: number,
    volume?: number
): Promise<void> {
    const now = new Date();

    const updateData: Partial<NewLocalListeningSessionRow> = {
        currentTime,
        updatedAt: now,
    };

    if (playbackRate !== undefined) {
        updateData.playbackRate = playbackRate;
    }

    if (volume !== undefined) {
        updateData.volume = volume;
    }

    await db
        .update(localListeningSessions)
        .set(updateData)
        .where(eq(localListeningSessions.id, sessionId));
}

/**
 * Update session listening time (cumulative time spent listening)
 */
export async function updateSessionListeningTime(
    sessionId: string,
    additionalTime: number
): Promise<void> {
    // Get current session to add to existing timeListening
    const session = await getListeningSession(sessionId);
    if (!session) {
        throw new Error(`Session ${sessionId} not found`);
    }

    const newTimeListening = (session.timeListening || 0) + additionalTime;

    await db
        .update(localListeningSessions)
        .set({
            timeListening: newTimeListening,
            updatedAt: new Date(),
        })
        .where(eq(localListeningSessions.id, sessionId));
}

/**
 * Reset session listening time (used after successful sync)
 */
export async function resetSessionListeningTime(sessionId: string): Promise<void> {
    await db
        .update(localListeningSessions)
        .set({
            timeListening: 0,
            updatedAt: new Date(),
        })
        .where(eq(localListeningSessions.id, sessionId));
}

/**
 * Create a progress snapshot
 */
export async function createProgressSnapshot(
    sessionId: string,
    currentTime: number,
    progress: number,
    playbackRate: number,
    volume: number,
    chapterId?: string,
    isPlaying: boolean = true
): Promise<void> {
    const snapshotId = uuidv4();
    const now = new Date();

    const snapshot: NewLocalProgressSnapshotRow = {
        id: snapshotId,
        sessionId,
        currentTime,
        progress,
        playbackRate,
        volume,
        chapterId: chapterId || null,
        isPlaying,
        timestamp: now,
    };

    await db.insert(localProgressSnapshots).values(snapshot);
}

/**
 * Get active session for a user and library item
 */
export async function getActiveSession(
    userId: string,
    libraryItemId: string
): Promise<LocalListeningSessionRow | null> {
    const sessions = await db
        .select()
        .from(localListeningSessions)
        .where(
            and(
                eq(localListeningSessions.userId, userId),
                eq(localListeningSessions.libraryItemId, libraryItemId),
                isNull(localListeningSessions.sessionEnd)
            )
        )
        .orderBy(desc(localListeningSessions.sessionStart))
        .limit(1);

    return sessions[0] || null;
}

/**
 * Get all active sessions for a user
 */
export async function getAllActiveSessionsForUser(
    userId: string
): Promise<LocalListeningSessionRow[]> {
    const sessions = await db
        .select()
        .from(localListeningSessions)
        .where(
            and(
                eq(localListeningSessions.userId, userId),
                isNull(localListeningSessions.sessionEnd)
            )
        );

    return sessions;
}

/**
 * Get all unsynced sessions
 */
export async function getUnsyncedSessions(): Promise<LocalListeningSessionRow[]> {
    return await db
        .select()
        .from(localListeningSessions)
        .where(eq(localListeningSessions.isSynced, false))
        .orderBy(asc(localListeningSessions.sessionStart));
}

/**
 * Update server session ID for a local session
 */
export async function updateServerSessionId(sessionId: string, serverSessionId: string | null): Promise<void> {
    const now = new Date();

    await db
        .update(localListeningSessions)
        .set({
            serverSessionId,
            updatedAt: now,
        })
        .where(eq(localListeningSessions.id, sessionId));

    console.log(`[LocalListeningSessions] Updated server session ID for ${sessionId}: ${serverSessionId}`);
}

/**
 * Mark session as synced
 */
export async function markSessionAsSynced(sessionId: string): Promise<void> {
    const now = new Date();

    await db
        .update(localListeningSessions)
        .set({
            isSynced: true,
            lastSyncTime: now,
            updatedAt: now,
        })
        .where(eq(localListeningSessions.id, sessionId));

    console.log(`[LocalListeningSessions] Marked session ${sessionId} as synced`);
}

/**
 * Record sync attempt failure
 */
export async function recordSyncFailure(
    sessionId: string,
    error: string
): Promise<void> {
    const now = new Date();

    const attempts = await getListeningSession(sessionId).then(session => session?.syncAttempts || 0);
    await db
        .update(localListeningSessions)
        .set({
            syncAttempts: attempts + 1,
            lastSyncAttempt: now,
            syncError: error,
            updatedAt: now,
        })
        .where(eq(localListeningSessions.id, sessionId));

    console.log(`[LocalListeningSessions] Recorded sync failure for session ${sessionId}: ${error}`);
}

/**
 * Get recent progress snapshots for a session
 */
export async function getSessionSnapshots(
    sessionId: string,
    limit: number = 50
): Promise<LocalProgressSnapshotRow[]> {
    return await db
        .select()
        .from(localProgressSnapshots)
        .where(eq(localProgressSnapshots.sessionId, sessionId))
        .orderBy(desc(localProgressSnapshots.timestamp))
        .limit(limit);
}

/**
 * Clean up old snapshots (keep only recent ones)
 */
export async function cleanupOldSnapshots(
    retentionDays: number = 7,
    maxSnapshotsPerSession: number = 100
): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Delete old snapshots
    await db
        .delete(localProgressSnapshots)
        .where(
            and(
                lt(localProgressSnapshots.timestamp, cutoffDate) // This should be a comparison, but drizzle syntax might differ
            )
        );

    console.log(`[LocalListeningSessions] Cleaned up snapshots older than ${retentionDays} days`);
}

/**
 * Get listening statistics for a user
 */
export async function getListeningStats(
    userId: string,
    libraryItemId?: string
): Promise<{
    totalSessions: number;
    totalListeningTime: number; // in seconds
    averageSessionLength: number; // in seconds
    syncedSessions: number;
    unsyncedSessions: number;
}> {
    let conditions = [eq(localListeningSessions.userId, userId)];
    if (libraryItemId) {
        conditions.push(eq(localListeningSessions.libraryItemId, libraryItemId));
    }
    let query = db
        .select()
        .from(localListeningSessions)
        .where(and(...conditions));

    const sessions = await query;

    const totalSessions = sessions.length;
    const syncedSessions = sessions.filter(s => s.isSynced).length;
    const unsyncedSessions = totalSessions - syncedSessions;

    const completedSessions = sessions.filter(s => s.sessionEnd && s.endTime);
    const totalListeningTime = completedSessions.reduce((total, session) => {
        return total + ((session.endTime || 0) - session.startTime);
    }, 0);

    const averageSessionLength = completedSessions.length > 0
        ? totalListeningTime / completedSessions.length
        : 0;

    return {
        totalSessions,
        totalListeningTime,
        averageSessionLength,
        syncedSessions,
        unsyncedSessions,
    };
}
