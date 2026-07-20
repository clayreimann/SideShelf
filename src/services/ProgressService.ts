/**
 * Progress Service
 *
 * Merges the concepts of localListeningSessions and server playback sessions.
 * Handles progress tracking and syncing only for downloaded media.
 * Combines functionality from SessionTrackingService and ProgressSyncService.
 */

import { getLibraryItemById } from "@/db/helpers/libraryItems";
import {
  applyLocalPlaybackTick,
  endListeningSession,
  endStaleListeningSession,
  getActiveSession,
  getAllActiveSessionsForUser,
  reconcileSessionPositionFromServer,
  startListeningSession,
  updateServerSessionId,
} from "@/db/helpers/localListeningSessions";
import { getMediaMetadataByLibraryItemId } from "@/db/helpers/mediaMetadata";
import {
  getMediaProgressForLibraryItem,
  marshalMediaProgressFromApi,
  marshalMediaProgressFromAuthResponse,
  upsertMediaProgress,
} from "@/db/helpers/mediaProgress";
import { getUserByUsername } from "@/db/helpers/users";
import { LocalListeningSessionRow } from "@/db/schema/localData";
import { fetchMe, fetchMediaProgress } from "@/lib/api/endpoints";
import { formatTime } from "@/lib/helpers/formatters";
import { logger } from "@/lib/logger";
import { getStoredUsername } from "@/lib/secureStore";
import { dispatchPlayerEvent } from "@/services/coordinator/eventBus";
import { progressSyncWorker } from "@/services/ProgressSyncWorker";

// Create cached sublogger for this service
const log = logger.forTag("ProgressService");

/**
 * Session information for tracking playback progress
 */
export interface SessionInfo {
  /** Unique identifier for the local listening session */
  sessionId: string;
  /** Library item ID being played */
  libraryItemId: string;
  /** Media ID (book/podcast episode) being played */
  mediaId: string;
  /**
   * Starting position in the media when session began
   * @unit seconds (media time, not wall time)
   * @example 1800 // Started at 30 minutes into the audiobook
   */
  startTime: number;
  /**
   * Current position in the media
   * @unit seconds (media time)
   * @example 2100 // Currently at 35 minutes into the audiobook
   */
  currentTime: number;
  /**
   * Total duration of the media content
   * @unit seconds (media time)
   * @example 43200 // 12-hour audiobook
   */
  duration: number;
  /** Whether the media files are downloaded locally */
  isDownloaded: boolean;
}

export class ProgressService {
  private static instance: ProgressService;
  // Removed: currentSession, currentUsername (now queried from DB)
  // Removed: pauseTimeoutInterval (pause state tracked per session in DB)
  // Removed: lastSyncTime, isPaused, pauseStartTime, lastProgressUpdateTime, failedSyncs, sessionIsStale (tracked per session in DB)

  // Configuration

  // --- Session heuristics (named thresholds; values are hard-won offline-sync tuning) ---

  /** Why: a session with no DB update for this long is considered abandoned ("stale") and is
   *  ended at its last known position rather than resumed. Unified value — startSession
   *  previously used an inline 10-minute literal while updateProgress/rehydrateActiveSession
   *  used 15; one deliberate cutoff avoids a window where the same session is simultaneously
   *  resumable in one code path and stale in another. */
  private readonly PAUSE_TIMEOUT = 15 * 60 * 1000; // 15 minutes

  /** Why: playback ticks arrive at ~1 Hz, so a gap over a minute since the last session
   *  update means playback almost certainly stopped — used to infer "paused" without
   *  explicit pause state in the DB row. */
  private readonly PAUSED_INFERENCE_THRESHOLD_MS = 60 * 1000; // 60 seconds

  /** Why: duplicate-session cleanup treats a session that never progressed past the first
   *  few seconds as invalid (likely a race-created zombie), safe to end without sync. */
  private readonly DUPLICATE_MIN_VALID_POSITION_S = 5; // seconds of media progress

  /** Why: when two valid duplicate sessions exist, one lagging the best session's update
   *  time by more than this window is clearly an older orphan, not a live contender.
   *  Intentionally narrower than PAUSE_TIMEOUT — this compares two sessions to each other,
   *  not a session to "now". */
  private readonly DUPLICATE_SESSION_AGE_GAP_MS = 10 * 60 * 1000; // 10 minutes

  /** Why: a session position at or below ~1 s usually means TrackPlayer had not restored
   *  the real position yet when the session row was written; fall back to saved progress. */
  private readonly RESUME_MIN_SESSION_POSITION_S = 1; // seconds

  /** Why: wall-clock deltas between ticks are only credited as listening time when they
   *  look like real contiguous playback — at least one tick interval, but less than the
   *  gap left by a suspend/kill (which must not be counted as listening). */
  private readonly LISTENING_DELTA_MIN_S = 1; // seconds
  private readonly LISTENING_DELTA_MAX_S = 10; // seconds

  /** Why: position moves >= this between consecutive ticks indicate a seek/jump worth
   *  logging for diagnostics (normal 1 Hz playback moves ~1 s per tick). */
  private readonly POSITION_JUMP_LOG_THRESHOLD_S = 30; // seconds

  /** Why: coordinator SESSION_UPDATED notifications and the diagnostic DB-write log are
   *  throttled to once per this many ms of WALL time. (Previously throttled by media
   *  position % 10, which misfires at non-1x rates, double-fires on repeated ticks within
   *  one media second, and skips entirely across seeks.) */
  private readonly SESSION_UPDATE_NOTIFY_THROTTLE_MS = 10 * 1000; // 10 seconds

  // --- Hot-path state ---

  /** Wall-clock timestamp of the last throttled SESSION_UPDATED dispatch + diagnostic log. */
  private _lastSessionUpdateNotifyAt = 0;

  /** Cached active-session row for the 1 Hz updateProgress hot path, avoiding a DB query
   *  per tick. Invalidated on session start/end/stale-detection/rehydration/sync — cache
   *  correctness over coverage; other (non-1 Hz) paths query the DB directly. */
  private _cachedActiveSession: LocalListeningSessionRow | null = null;

  private constructor() {}

  static getInstance(): ProgressService {
    if (!ProgressService.instance) {
      ProgressService.instance = new ProgressService();
    }
    return ProgressService.instance;
  }

  /** Compatibility no-op while worker lifecycle ownership moves to the provider. */
  initialize(): void {
    log.debug("[initialize] Progress delivery lifecycle is worker-owned");
  }

  /** Invalidate the hot-path session cache. Called whenever a session row may have been
   *  created, ended, or mutated outside the updateProgress tick path. */
  private _invalidateActiveSessionCache(): void {
    this._cachedActiveSession = null;
  }

  /** Infer paused state from the gap since the session's last DB update.
   *  Single definition of the "paused" heuristic (was duplicated in seconds and ms). */
  private _isSessionInferredPaused(session: LocalListeningSessionRow, nowMs: number): boolean {
    return nowMs - session.updatedAt.getTime() > this.PAUSED_INFERENCE_THRESHOLD_MS;
  }

  /** A session that never advanced past its start position ("brand new") has no real
   *  listening progress — safe to close without syncing to the server. */
  private _isBrandNewSession(session: LocalListeningSessionRow): boolean {
    return session.currentTime === session.startTime;
  }

  /**
   * Gets current user context, optionally including active session.
   * Centralizes the username→user→session lookup pattern.
   *
   * @param libraryItemId - Optional library item to fetch session for
   * @returns User context with userId, username, and optional session, or null if user not found
   */
  private async getCurrentUserContext(libraryItemId?: string): Promise<{
    userId: string;
    username: string;
    session?: LocalListeningSessionRow | null;
  } | null> {
    const username = await getStoredUsername();
    if (!username) {
      log.info("[getCurrentUserContext] No username found");
      return null;
    }

    const user = await getUserByUsername(username);
    if (!user?.id) {
      log.info("[getCurrentUserContext] User not found");
      return null;
    }

    let session = null;
    if (libraryItemId) {
      session = await getActiveSession(user.id, libraryItemId);
    }

    return {
      userId: user.id,
      username,
      ...(libraryItemId && { session }),
    };
  }

  /**
   * Rehydrate active session from database (called explicitly during app initialization)
   * Optionally match against a specific library item ID (e.g., from TrackPlayer)
   */
  async rehydrateActiveSession(matchLibraryItemId?: string): Promise<void> {
    // Rehydration may end/replace sessions — drop any cached row up front
    this._invalidateActiveSessionCache();
    try {
      const context = await this.getCurrentUserContext();
      if (!context) {
        log.info("No user found, skipping session rehydration");
        return;
      }

      // Get all active sessions for this user
      const activeSessions = await getAllActiveSessionsForUser(context.userId);
      if (activeSessions.length === 0) {
        log.info("No active sessions to rehydrate");
        return;
      } else if (activeSessions.length > 1) {
        const sessionIds = activeSessions.map((s) => s.id).join(", ");
        log.warn(
          `Multiple (${activeSessions.length}) active sessions found during rehydration: ${sessionIds}`
        );
      }

      // Use the most recently updated session as winner
      const [session, ...losers] = activeSessions.sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      );

      // Always close all non-winner sessions to prevent zombie persistence across boots
      if (losers.length > 0) {
        log.info(`Closing ${losers.length} loser session(s) to prevent zombie persistence`);
        for (const loser of losers) {
          if (!this._isBrandNewSession(loser)) {
            log.info(`Closing loser session with real progress: ${loser.id}`);
          } else {
            log.info(`Closing zombie loser session silently (no progress to sync): ${loser.id}`);
          }
          await endStaleListeningSession(loser.id, loser.currentTime);
          progressSyncWorker.requestDrain("end");
        }
      }

      // If a specific library item ID was provided, verify it matches
      if (matchLibraryItemId && session.libraryItemId !== matchLibraryItemId) {
        log.info(
          `Active session library item (${session.libraryItemId}) doesn't match TrackPlayer item (${matchLibraryItemId}), not rehydrating`
        );
        return;
      }

      // Get the library item to verify it still exists
      const libraryItem = await getLibraryItemById(session.libraryItemId);
      if (!libraryItem) {
        log.warn(`Library item ${session.libraryItemId} not found, ending stale session`);
        await endListeningSession(session.id, session.currentTime);
        progressSyncWorker.requestDrain("end");
        return;
      }

      // Check if session is stale (more than 15 minutes old)
      const sessionAge = Date.now() - session.updatedAt.getTime();
      const isStale = sessionAge > this.PAUSE_TIMEOUT;

      if (isStale) {
        log.info(
          `Ending stale session ${session.id} for ${session.libraryItemId} immediately (${Math.round(sessionAge / 1000)}s old)`
        );
        await endStaleListeningSession(session.id, session.currentTime);
        progressSyncWorker.requestDrain("end");
        return; // Don't rehydrate stale sessions
      }

      log.info(
        `Found active session ${session.id} for ${session.libraryItemId} at position ${session.currentTime}`
      );
      // Session exists in DB - no need to store in instance
      log.info("Session rehydration complete");
    } catch (error) {
      log.error("Failed to rehydrate active session:", error as Error);
    }
  }

  /**
   * Start tracking a new listening session
   */
  async startSession(
    username: string,
    libraryItemId: string,
    mediaId: string,
    startTime: number,
    duration: number,
    playbackRate: number = 1.0,
    volume: number = 1.0,
    existingServerSessionId?: string,
    episodeId?: string
  ): Promise<void> {
    // Session rows are ended/created below — the hot-path cache must not survive this
    this._invalidateActiveSessionCache();
    try {
      log.info(`Starting session for library item ${libraryItemId}, media ${mediaId}`);
      if (existingServerSessionId) {
        log.info(`Using existing streaming session: ${existingServerSessionId}`);
      }

      // Validate that the library item exists in our local database
      const libraryItem = await getLibraryItemById(libraryItemId);
      if (!libraryItem) {
        log.error(`Library item ${libraryItemId} not found in local database`);
        throw new Error(`Library item ${libraryItemId} not found locally`);
      }

      log.info(`Found library item: ${libraryItem.mediaType} in library ${libraryItem.libraryId}`);

      // Get user ID
      const user = await getUserByUsername(username);
      if (!user?.id) {
        throw new Error("User not found");
      }

      // Check for multiple active sessions for this item and clean up duplicates
      const allActiveSessionsForItem = (await getAllActiveSessionsForUser(user.id)).filter(
        (s) => s.libraryItemId === libraryItemId
      );

      // DIAGNOSTIC: Log found sessions to detect race conditions
      if (allActiveSessionsForItem.length > 0) {
        const now = Date.now();
        const sessionDetails = allActiveSessionsForItem
          .map((s) => {
            const age = now - s.createdAt.getTime();
            return `${s.id.slice(0, 8)}(age=${age}ms, brandNew=${this._isBrandNewSession(s)}, pos=${formatTime(s.currentTime)}s)`;
          })
          .join(", ");
        log.info(
          `Found ${allActiveSessionsForItem.length} active session(s) for ${libraryItemId}: ${sessionDetails}`
        );
      }

      let existingSession: LocalListeningSessionRow | null = null;

      if (allActiveSessionsForItem.length > 1) {
        log.warn(
          `Found ${allActiveSessionsForItem.length} active sessions for item ${libraryItemId}, cleaning up duplicates`
        );

        // Sort by updatedAt DESC (most recent first)
        const sortedSessions = allActiveSessionsForItem.sort(
          (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
        );

        const bestSession = sortedSessions[0]; // Keep this one
        const sessionsToEnd = sortedSessions.slice(1);

        for (const session of sessionsToEnd) {
          const hasInvalidProgress = session.currentTime < this.DUPLICATE_MIN_VALID_POSITION_S;
          const isMuchOlder =
            bestSession.updatedAt.getTime() - session.updatedAt.getTime() >
            this.DUPLICATE_SESSION_AGE_GAP_MS;

          if (hasInvalidProgress || isMuchOlder) {
            log.info(
              `Ending duplicate session ${session.id} (currentTime=${session.currentTime}, updatedAt=${session.updatedAt.toISOString()}) session=${session.id} item=${libraryItemId}`
            );
            await endListeningSession(session.id, session.currentTime);
            progressSyncWorker.requestDrain("end");
          } else {
            log.warn(
              `Multiple valid sessions found, keeping most recent (${bestSession.id}) session=${bestSession.id} item=${libraryItemId}`
            );
            // Still end the older one to avoid duplicates
            await endListeningSession(session.id, session.currentTime);
            progressSyncWorker.requestDrain("end");
          }
        }

        // Use the best session as existingSession
        existingSession = bestSession;
      } else if (allActiveSessionsForItem.length === 1) {
        existingSession = allActiveSessionsForItem[0];
      }

      let shouldEndExistingSession = false;
      let resumePosition = startTime;
      let resumeSource: "startArgument" | "activeSession" | "savedProgress" = "startArgument";

      // Get saved progress to use as fallback
      const savedProgress = await getMediaProgressForLibraryItem(libraryItemId, user.id);

      if (existingSession) {
        // Check if session is stale (no update within PAUSE_TIMEOUT — unified with
        // updateProgress/rehydrateActiveSession, was an inline 10-minute literal)
        const sessionAge = Date.now() - existingSession.updatedAt.getTime();
        const isStale = sessionAge > this.PAUSE_TIMEOUT;

        if (isStale) {
          log.info("Found stale active session (exceeded PAUSE_TIMEOUT), ending it");
          shouldEndExistingSession = true;
        } else {
          log.info("Found recent active session for same item, will resume");
          shouldEndExistingSession = false;
          // Use active session's current time (most recent position)
          // But if currentTime is 0 or very small, fall back to saved progress
          if (existingSession.currentTime > this.RESUME_MIN_SESSION_POSITION_S) {
            resumePosition = existingSession.currentTime;
            resumeSource = "activeSession";
            log.info(`Resuming from active session: ${resumePosition}`);
          } else if (savedProgress?.currentTime) {
            resumePosition = savedProgress.currentTime;
            resumeSource = "savedProgress";
            log.info(
              `Resuming from saved progress (session currentTime was ${existingSession.currentTime}): ${resumePosition}`
            );
          } else {
            resumePosition = existingSession.currentTime;
            resumeSource = "activeSession";
            log.info(`Resuming from active session: ${resumePosition}`);
          }
        }
      } else {
        // Fall back to saved progress
        resumePosition = savedProgress?.currentTime || startTime;
        if (savedProgress?.currentTime) {
          resumeSource = "savedProgress";
          log.info(`Resuming from saved progress: ${resumePosition}`);
        }
      }

      // End any other active sessions for this user (sessions for different items)
      const allActiveSessions = await getAllActiveSessionsForUser(user.id);
      for (const session of allActiveSessions) {
        if (session.libraryItemId !== libraryItemId) {
          log.info(`Ending active session for different item: ${session.libraryItemId}`);
          await endListeningSession(session.id, session.currentTime);
          progressSyncWorker.requestDrain("end");
        } else if (shouldEndExistingSession) {
          // End the stale session for this item
          await endListeningSession(session.id, session.currentTime);
          progressSyncWorker.requestDrain("end");
        }
      }

      // Log the resolved resume context before creating the session
      const resumeParts = [`position=${formatTime(resumePosition)}s`, `source=${resumeSource}`];
      if (existingSession) {
        resumeParts.push(`dbCurrent=${formatTime(existingSession.currentTime)}s`);
        if (existingSession.startTime != null) {
          resumeParts.push(`dbStart=${formatTime(existingSession.startTime)}s`);
        }
        resumeParts.push(`dbUpdatedAt=${existingSession.updatedAt.toISOString()}`);
      } else if (savedProgress?.currentTime) {
        resumeParts.push(`savedProgress=${formatTime(savedProgress.currentTime)}s`);
      }
      log.info(`Resolved resume position for ${libraryItemId}: ${resumeParts.join(" ")}`);

      // Start new session
      const sessionId = await startListeningSession(
        user.id,
        libraryItemId,
        mediaId,
        resumePosition,
        duration,
        playbackRate,
        volume,
        episodeId ?? null
      );

      // Session is now in DB - no need to store in instance

      // Notify coordinator that a session has been created
      dispatchPlayerEvent(
        {
          type: "SESSION_CREATED",
          payload: { sessionId },
        },
        { source: "progress_service" }
      );

      // If we have an existing server session ID (from streaming), use it
      if (existingServerSessionId) {
        log.info(`Using existing server session ID: ${existingServerSessionId}`);
        await updateServerSessionId(sessionId, existingServerSessionId);
      }
      progressSyncWorker.requestDrain("progress");

      log.info(
        `Started session ${sessionId} for ${libraryItemId} at position ${resumePosition} session=${sessionId} item=${libraryItemId}`
      );
    } catch (error) {
      log.error("Failed to start session:", error as Error);
      throw error;
    }
  }

  /**
   * End the current listening session
   */
  async endCurrentSession(userId: string, libraryItemId: string, endTime?: number): Promise<void> {
    this._invalidateActiveSessionCache();
    try {
      const session = await getActiveSession(userId, libraryItemId);
      if (!session) {
        log.info(`No active session found for ${libraryItemId}`);
        return;
      }

      // Use provided endTime, or session's currentTime
      const finalEndTime = endTime ?? session.currentTime;

      await endListeningSession(session.id, finalEndTime);
      progressSyncWorker.requestDrain("end");

      dispatchPlayerEvent(
        {
          type: "SESSION_ENDED",
          payload: { sessionId: session.id },
        },
        { source: "progress_service" }
      );

      log.info(`Ended session ${session.id} session=${session.id} item=${libraryItemId}`);
    } catch (error) {
      log.error("Failed to end session:", error as Error);
    }
  }

  /**
   * End a stale listening session using its last update time as the session end timestamp
   * This is used when cleaning up sessions that were abandoned - the session
   * actually ended at its last update time, not at the current time
   */
  private async endStaleSession(
    userId: string,
    libraryItemId: string,
    endTime?: number
  ): Promise<void> {
    this._invalidateActiveSessionCache();
    try {
      const session = await getActiveSession(userId, libraryItemId);
      if (!session) {
        return;
      }

      // Use provided endTime, or session's currentTime
      const finalEndTime = endTime ?? session.currentTime;

      await endStaleListeningSession(session.id, finalEndTime);
      progressSyncWorker.requestDrain("end");

      log.info(`Ended stale session ${session.id}`);
    } catch (error) {
      log.error("Failed to end stale session:", error as Error);
    }
  }

  /**
   * Update progress in the current session
   */
  async updateProgress(
    userId: string,
    libraryItemId: string,
    currentTime: number,
    playbackRate?: number,
    volume?: number,
    chapterId?: string,
    isPlaying: boolean = true
  ): Promise<void> {
    try {
      // Hot path (1 Hz): serve the session from cache when possible; fall back to a DB
      // query on cache miss. Cache is invalidated on session start/end/stale/rehydrate/sync.
      let session = this._cachedActiveSession;
      if (!session || session.userId !== userId || session.libraryItemId !== libraryItemId) {
        session = await getActiveSession(userId, libraryItemId);
        this._cachedActiveSession = session;
      }
      if (!session) {
        // If playback is active but no session exists, we can't update progress
        // PlayerBackgroundService should handle creating a new session
        if (isPlaying) {
          log.info(
            `updateProgress called with no session but playback is active - expecting PlayerBackgroundService to create session`
          );
        }
        return;
      }

      // Check if session is stale (no update within PAUSE_TIMEOUT)
      const sessionAge = Date.now() - session.updatedAt.getTime();
      const isStale = sessionAge > this.PAUSE_TIMEOUT;

      if (isStale) {
        // The cached row is about to be ended/replaced
        this._invalidateActiveSessionCache();
        log.info(
          `Handling stale session - ending old session and starting new one session=${session.id} item=${libraryItemId}`
        );

        // End the stale session at its last known position (when it was last updated)
        const staleSessionEndTime = session.currentTime;
        log.info(
          `Ending stale session at its last position: ${formatTime(staleSessionEndTime)}s (not current position: ${formatTime(currentTime)}s) session=${session.id} item=${libraryItemId}`
        );
        await this.endStaleSession(userId, libraryItemId, staleSessionEndTime);

        // Get username for starting new session
        const username = await getStoredUsername();
        if (username) {
          // Get track duration from session or metadata
          let duration = session.duration;
          if (!duration) {
            const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
            duration = metadata?.duration || 0;
          }

          // Use stale session's position if currentTime is 0 (likely TrackPlayer not restored yet)
          const startPosition = currentTime > 0 ? currentTime : staleSessionEndTime;
          if (currentTime === 0 && staleSessionEndTime > 0) {
            log.info(
              `Using stale session position ${formatTime(staleSessionEndTime)}s instead of 0 for new session (TrackPlayer may not be restored yet) item=${libraryItemId}`
            );
          }

          log.info(
            `Starting new session for ${libraryItemId} at position ${startPosition} session=${session.id} item=${libraryItemId}`
          );
          await this.startSession(
            username,
            libraryItemId,
            session.mediaId,
            startPosition,
            duration,
            playbackRate || 1.0,
            volume || 1.0,
            undefined,
            session.episodeId ?? undefined
          );
        }

        // Early return - the new session will handle subsequent updates
        return;
      }

      const now = Date.now();

      // Track listening time like iOS implementation:
      // Use wall clock time but ONLY when actively playing
      // Get last update time from session's updatedAt
      let listeningTimeDelta = 0;
      if (isPlaying && session.updatedAt) {
        const timeSinceLastUpdate = (now - session.updatedAt.getTime()) / 1000; // Convert to seconds
        if (
          timeSinceLastUpdate >= this.LISTENING_DELTA_MIN_S &&
          timeSinceLastUpdate < this.LISTENING_DELTA_MAX_S
        ) {
          listeningTimeDelta = timeSinceLastUpdate;
        }
      }

      // Handle pause/play state changes — infer pause from the update gap
      const wasPaused = this._isSessionInferredPaused(session, now);

      // Prevent writing currentTime=0 for active sessions (likely indicates TrackPlayer not restored yet)
      // Use the session's existing position if incoming position is 0 and session has a valid position
      if (currentTime === 0 && session.currentTime > 0 && !session.endTime) {
        log.warn(
          `Preventing write of currentTime=0 for active session (previous position was ${formatTime(session.currentTime)}s) - likely TrackPlayer not restored yet session=${session.id} item=${libraryItemId}`
        );
        // Don't update with 0 - keep existing position
        return;
      }

      const diffFromStored = currentTime - session.currentTime;
      if (Math.abs(diffFromStored) >= this.POSITION_JUMP_LOG_THRESHOLD_S) {
        const direction = diffFromStored >= 0 ? "forward" : "backward";
        log.info(
          `Detected ${direction} jump during progress update session=${session.id} item=${libraryItemId} stored=${formatTime(session.currentTime)}s incoming=${formatTime(currentTime)}s delta=${formatTime(Math.abs(diffFromStored))}s`
        );
      }

      // Update session progress in DB - this happens on EVERY progress update
      // (crash-recovery mechanism — the resume-position guarantee depends on it)
      const resolvedPlaybackRate = playbackRate ?? session.playbackRate;
      const resolvedVolume = volume ?? session.volume;
      await applyLocalPlaybackTick(session.id, {
        currentTime,
        listeningTimeDelta,
        playbackRate: resolvedPlaybackRate,
        volume: resolvedVolume,
      });

      // Mirror the write into the cached row so the next tick sees fresh
      // currentTime/listening state/updatedAt without re-querying (the atomic
      // helper persists the same snapshot and outbox revision together).
      this._cachedActiveSession = {
        ...session,
        currentTime,
        timeListening: session.timeListening + listeningTimeDelta,
        updatedAt: new Date(now),
        playbackRate: resolvedPlaybackRate,
        volume: resolvedVolume,
      };
      progressSyncWorker.requestDrain("progress");

      // Notify coordinator + diagnostic log, throttled by WALL time (not media position)
      if (now - this._lastSessionUpdateNotifyAt >= this.SESSION_UPDATE_NOTIFY_THROTTLE_MS) {
        this._lastSessionUpdateNotifyAt = now;
        dispatchPlayerEvent(
          {
            type: "SESSION_UPDATED",
            payload: { position: currentTime },
          },
          { source: "progress_service" }
        );
        log.debug(
          `DB session updated: position=${formatTime(currentTime)}s session=${session.id} item=${libraryItemId}`
        );
      }

      if (isPlaying && wasPaused) {
        // Resuming from pause
        log.info(`Resumed playback session=${session.id} item=${libraryItemId}`);
      } else if (!isPlaying && !wasPaused) {
        progressSyncWorker.requestDrain("pause");
        log.info(
          `Paused playback position=${formatTime(currentTime)} session=${session.id} item=${libraryItemId}`
        );
      }
    } catch (error) {
      log.error("Failed to update progress:", error as Error);
    }
  }

  /**
   * Handle audio duck events (when other apps need audio focus)
   */
  async handleDuck(userId: string, libraryItemId: string, isPaused: boolean): Promise<void> {
    try {
      const session = await getActiveSession(userId, libraryItemId);
      if (!session) {
        return;
      }

      if (isPaused) {
        progressSyncWorker.requestDrain("pause");
        log.info("Audio ducked");
      } else {
        // Audio unducked (resumed by system)
        log.info("Audio unducked");
      }
    } catch (error) {
      log.error("Failed to handle duck event:", error as Error);
    }
  }

  /**
   * Get current session info from database
   */
  async getCurrentSession(userId: string, libraryItemId: string): Promise<SessionInfo | null> {
    try {
      const session = await getActiveSession(userId, libraryItemId);
      if (!session) {
        return null;
      }

      return {
        sessionId: session.id,
        libraryItemId: session.libraryItemId,
        mediaId: session.mediaId,
        startTime: session.startTime,
        currentTime: session.currentTime,
        duration: session.duration,
        isDownloaded: true, // All sessions are for downloaded media in this app
      };
    } catch (error) {
      log.error("Failed to get current session:", error as Error);
      return null;
    }
  }

  /**
   * Force rehydration of session from database
   * Useful when app resumes from background
   * @param matchLibraryItemId - Optional library item ID to match against (e.g., from TrackPlayer)
   */
  async forceRehydrateSession(matchLibraryItemId?: string): Promise<void> {
    log.info("Force rehydrating session from database");
    await this.rehydrateActiveSession(matchLibraryItemId);
  }

  /** Compatibility response until background playback stops polling in Task 7. */
  async shouldSyncToServer(
    _userId: string,
    _libraryItemId: string
  ): Promise<{ shouldSync: boolean; reason: string }> {
    return {
      shouldSync: true,
      reason: "Delivery cadence is owned by ProgressSyncWorker",
    };
  }

  /**
   * Get the resume position for a library item
   */
  async getResumePosition(libraryItemId: string, username: string): Promise<number> {
    try {
      const user = await getUserByUsername(username);
      if (!user?.id) {
        return 0;
      }

      const savedProgress = await getMediaProgressForLibraryItem(libraryItemId, user.id);
      return savedProgress?.currentTime || 0;
    } catch (error) {
      log.error("Failed to get resume position:", error as Error);
      return 0;
    }
  }

  /**
   * Sync session to server (public for background service)
   * @param userId - User ID
   * @param libraryItemId - Library item ID
   * @param sessionId - Optional specific session ID to sync. If not provided, syncs the active session.
   */
  /**
   * Compatibility redirect while PlayerBackgroundService migrates in Task 7.
   * ProgressService never performs outbound delivery.
   */
  async syncSessionToServer(
    _userId: string,
    _libraryItemId: string,
    _sessionId?: string
  ): Promise<void> {
    progressSyncWorker.requestDrain("progress");
  }

  /** Compatibility redirect for callers that previously requested a background sweep. */
  async syncUnsyncedSessions(): Promise<void> {
    progressSyncWorker.requestDrain("manual");
  }

  /** Request a manual worker drain without reading or mutating queue rows here. */
  async forceSyncSessions(): Promise<void> {
    progressSyncWorker.requestDrain("manual");
  }
  /**
   * Fetch latest progress from server and update local database
   * (Compatibility method from ProgressSyncService)
   */
  async fetchServerProgress(): Promise<void> {
    try {
      log.info("Fetching latest progress from server");

      // Fetch latest user data including progress
      const meResponse = await fetchMe();

      // Marshal and upsert progress data
      const progressData = marshalMediaProgressFromAuthResponse(meResponse);
      if (progressData.length > 0) {
        await upsertMediaProgress(progressData);
        log.info(`Synced ${progressData.length} progress entries from server`);
      } else {
        log.info("No progress data to sync from server");
      }
    } catch (error) {
      log.error("Failed to fetch server progress:", error as Error);
      throw error;
    }
  }

  /**
   * Force resync current position from server
   * Useful when local position gets out of sync with server
   */
  async forceResyncPosition(userId: string, libraryItemId: string): Promise<void> {
    // Server position overwrites the session row — the cached copy is no longer valid
    this._invalidateActiveSessionCache();
    try {
      log.info(
        `Forcing position resync from server userId=${userId} libraryItemId=${libraryItemId}`
      );

      // Fetch the specific item's progress from the server
      const progressData = await fetchMediaProgress(libraryItemId);
      if (!progressData) {
        log.warn(`No progress data found on server for ${libraryItemId}`);
        return;
      }

      // Marshal and upsert to database
      const marshaled = marshalMediaProgressFromApi(progressData, userId);
      await upsertMediaProgress([marshaled]);

      // Get the current active session for this item
      const session = await getActiveSession(userId, libraryItemId);
      if (!session) {
        log.info(`No active session found for ${libraryItemId}, position updated in database`);
        return;
      }

      // Update the session's currentTime to match the server
      await reconcileSessionPositionFromServer(session.id, progressData.currentTime);

      log.info(
        `Position resynced from server: ${formatTime(progressData.currentTime)}s session=${session.id} item=${libraryItemId}`
      );
    } catch (error) {
      log.error("Failed to force resync position:", error as Error);
      throw error;
    }
  }

  /** Clear user-scoped hot-path state. Worker lifecycle is owned elsewhere. */
  shutdown(): void {
    this._invalidateActiveSessionCache();
    this._lastSessionUpdateNotifyAt = 0;
  }
}

// Export singleton instance
export const progressService = ProgressService.getInstance();
