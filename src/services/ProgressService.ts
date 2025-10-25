/**
 * Unified Progress Service
 *
 * Merges the concepts of localListeningSessions and server playback sessions.
 * Handles progress tracking and syncing only for downloaded media.
 * Combines functionality from SessionTrackingService and ProgressSyncService.
 */

import { getLibraryItemById } from '@/db/helpers/libraryItems';
import {
  endListeningSession,
  getActiveSession,
  getAllActiveSessionsForUser,
  getListeningSession,
  getUnsyncedSessions,
  markSessionAsSynced,
  recordSyncFailure,
  resetSessionListeningTime,
  startListeningSession,
  updateServerSessionId,
  updateSessionListeningTime,
  updateSessionProgress
} from '@/db/helpers/localListeningSessions';
import { getMediaProgressForLibraryItem, marshalMediaProgressFromApi, marshalMediaProgressFromAuthResponse, upsertMediaProgress } from '@/db/helpers/mediaProgress';
import { getUserByUsername } from '@/db/helpers/users';
import { LocalListeningSessionRow } from '@/db/schema/localData';
import { closeSession, createLocalSession, fetchMe, fetchMediaProgress, syncSession } from '@/lib/api/endpoints';
import { logger } from '@/lib/logger';
import NetInfo from "@react-native-community/netinfo";

// Create cached sublogger for this service
const log = logger.forTag('ProgressService');

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
  private currentSession: SessionInfo | null = null;
  private currentUsername: string | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private pauseTimeoutInterval: ReturnType<typeof setTimeout> | null = null;
  private lastSyncTime = 0;
  private isPaused = false;
  private pauseStartTime = 0;
  private lastProgressUpdateTime = 0;
  private failedSyncs = 0;

  // Configuration
  public readonly SYNC_INTERVAL_UNMETERED = 15000; // 15 seconds on unmetered connections
  public readonly SYNC_INTERVAL_METERED = 60000; // 60 seconds on metered connections
  private readonly BACKGROUND_SYNC_INTERVAL = 120000; // 2 minutes for background sync
  private readonly MIN_SESSION_DURATION = 5; // 5 seconds minimum to record a session
  private readonly PAUSE_TIMEOUT = 15 * 60 * 1000; // 15 minutes

  private constructor() {
    this.startPeriodicSync();
  }

  static getInstance(): ProgressService {
    if (!ProgressService.instance) {
      ProgressService.instance = new ProgressService();
    }
    return ProgressService.instance;
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
    existingServerSessionId?: string
  ): Promise<void> {
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

      if (this.currentSession) {
        if (this.currentSession.libraryItemId === libraryItemId) {
          log.info('Session already active for this item, ignoring start request');
          return;
        } else {
          // End any existing session first
          log.info('Different session active, ending current session first');
          await this.endCurrentSession();
        }
      }

      // Get user ID
      const user = await getUserByUsername(username);
      if (!user?.id) {
        throw new Error('User not found');
      }

      // Check for existing active session for this item
      const existingSession = await getActiveSession(user.id, libraryItemId);
      let shouldEndExistingSession = false;

      if (existingSession) {
        // Check if session is stale (more than 10 minutes old)
        const sessionAge = Date.now() - existingSession.updatedAt.getTime();
        const isStale = sessionAge > 10 * 60 * 1000; // 10 minutes

        if (isStale) {
          log.info('Found stale active session (>10 min), ending it');
          shouldEndExistingSession = true;
        } else {
          log.info('Found recent active session for same item, will resume');
          shouldEndExistingSession = false;
        }
      }

      // End any other active sessions for this user (sessions for different items)
      const allActiveSessions = await getAllActiveSessionsForUser(user.id);
      for (const session of allActiveSessions) {
        if (session.libraryItemId !== libraryItemId) {
          log.info(`Ending active session for different item: ${session.libraryItemId}`);
          await endListeningSession(session.id, session.currentTime);
        } else if (shouldEndExistingSession) {
          // End the stale session for this item
          await endListeningSession(session.id, session.currentTime);
        }
      }

      // Determine resume position: prioritize existing active session > saved progress > provided startTime
      let resumePosition = startTime;
      if (existingSession && !shouldEndExistingSession) {
        // Use active session's current time (most recent position) - session is still active and recent
        resumePosition = existingSession.currentTime;
        log.info(`Resuming from active session: ${resumePosition}`);
      } else {
        // Fall back to saved progress
        const savedProgress = await getMediaProgressForLibraryItem(libraryItemId, user.id);
        resumePosition = savedProgress?.currentTime || startTime;
        if (savedProgress?.currentTime) {
          log.info(`Resuming from saved progress: ${resumePosition}`);
        }
      }

      // Start new session
      const sessionId = await startListeningSession(
        user.id,
        libraryItemId,
        mediaId,
        resumePosition,
        duration,
        playbackRate,
        volume
      );

      this.currentSession = {
        sessionId,
        libraryItemId,
        mediaId,
        startTime: resumePosition,
        currentTime: resumePosition,
        duration,
        isDownloaded: true,
      };

      // Store username for sync operations
      this.currentUsername = username;

      // Initialize progress tracking
      this.lastProgressUpdateTime = Date.now();
      this.lastSyncTime = Date.now();
      this.failedSyncs = 0;

      // If we have an existing server session ID (from streaming), use it
      if (existingServerSessionId) {
        log.info(`Using existing server session ID: ${existingServerSessionId}`);
        await updateServerSessionId(sessionId, existingServerSessionId);
        // Mark as synced since the server session already exists
        await markSessionAsSynced(sessionId);
      } else {
        // Sync session to server immediately for downloaded content
        await this.syncCurrentSessionToServer();
      }

      log.info(`Started session ${sessionId} for ${libraryItemId} at position ${resumePosition}`);
    } catch (error) {
      log.error('Failed to start session:', error as Error);
      throw error;
    }
  }

  /**
   * End the current listening session
   */
  async endCurrentSession(endTime?: number): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    try {
      // Use provided endTime, or current session's currentTime, or fall back to startTime
      const finalEndTime = endTime ?? this.currentSession.currentTime;

      // Clear pause timeout
      this.clearPauseTimeout();

      // Only record session if it was long enough
      const sessionDuration = finalEndTime - this.currentSession.startTime;
      if (sessionDuration >= this.MIN_SESSION_DURATION) {
        await endListeningSession(this.currentSession.sessionId, finalEndTime);

        // Final sync to server
        await this.syncCurrentSessionToServer();

        log.info(`Ended session ${this.currentSession.sessionId}`);
      } else {
        log.info(`Session too short (${sessionDuration}s), not recording`);
      }

      this.currentSession = null;
      this.currentUsername = null;
      this.isPaused = false;
      this.lastProgressUpdateTime = 0;
      this.lastSyncTime = 0;
      this.failedSyncs = 0;
    } catch (error) {
      log.error('Failed to end session:', error as Error);
    }
  }

  /**
   * Update progress in the current session
   */
  async updateProgress(
    currentTime: number,
    playbackRate?: number,
    volume?: number,
    chapterId?: string,
    isPlaying: boolean = true
  ): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    try {
      const now = Date.now();

      // Track listening time like iOS implementation:
      // Use wall clock time but ONLY when actively playing (includesPlayProgress = isPlaying)
      if (isPlaying && this.lastProgressUpdateTime > 0) {
        const timeSinceLastUpdate = (now - this.lastProgressUpdateTime) / 1000; // Convert to seconds
        if (timeSinceLastUpdate >= 1 && timeSinceLastUpdate < 10) { // Only count reasonable intervals
          await updateSessionListeningTime(this.currentSession.sessionId, timeSinceLastUpdate);
        }
      }

      // Handle pause/play state changes
      if (isPlaying && this.isPaused) {
        // Resuming from pause - reset the update time to avoid counting pause duration
        this.isPaused = false;
        this.clearPauseTimeout();
        this.lastProgressUpdateTime = now; // Reset to avoid counting paused time
        log.info('Resumed playback');
      } else if (!isPlaying && !this.isPaused) {
        // Starting pause
        this.isPaused = true;
        this.pauseStartTime = Date.now();
        this.startPauseTimeout();

        // Immediate sync on pause
        await this.syncCurrentSessionToServer();
        log.info('Paused playback, synced to server');
      }

      // Update session progress
      await updateSessionProgress(
        this.currentSession.sessionId,
        currentTime,
        playbackRate,
        volume
      );

      // Update current time in session info
      this.currentSession.currentTime = currentTime;

      // Always update last progress update time (for next calculation)
      // but only count listening time when actually playing
      this.lastProgressUpdateTime = now;
    } catch (error) {
      log.error('Failed to update progress:', error as Error);
    }
  }

  /**
   * Handle audio duck events (when other apps need audio focus)
   */
  async handleDuck(isPaused: boolean): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    try {
      if (isPaused) {
        // Audio ducked (paused by system)
        this.isPaused = true;
        this.pauseStartTime = Date.now();

        // Immediate sync on duck
        await this.syncCurrentSessionToServer();
        log.info('Audio ducked, synced to server');
      } else {
        // Audio unducked (resumed by system) - reset timer to avoid counting ducked time
        this.isPaused = false;
        this.clearPauseTimeout();
        this.lastProgressUpdateTime = Date.now(); // Reset to avoid counting ducked time
        log.info('Audio unducked');
      }
    } catch (error) {
      log.error('Failed to handle duck event:', error as Error);
    }
  }

  /**
   * Get current session info
   */
  getCurrentSession(): SessionInfo | null {
    return this.currentSession;
  }

  /**
   * Get last sync time (for background service to check if sync is needed)
   */
  getLastSyncTime(): number {
    return this.lastSyncTime;
  }

  /**
   * Get whether playback is currently paused
   */
  getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Check if a sync is needed based on network type and time
   */
  async shouldSyncToServer(): Promise<{ shouldSync: boolean; reason: string }> {
    if (!this.currentSession) {
      return { shouldSync: false, reason: 'No active session' };
    }

    if (this.isPaused) {
      return { shouldSync: false, reason: 'Playback is paused' };
    }

    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      return { shouldSync: false, reason: 'No network connection' };
    }

    const isUnmetered = netInfo.type === 'wifi' || netInfo.type === 'ethernet';
    const syncInterval = isUnmetered ? this.SYNC_INTERVAL_UNMETERED : this.SYNC_INTERVAL_METERED;
    const timeSinceLastSync = Date.now() - this.lastSyncTime;

    if (timeSinceLastSync < syncInterval) {
      return {
        shouldSync: false,
        reason: `Too soon (${timeSinceLastSync}ms < ${syncInterval}ms)`
      };
    }

    return {
      shouldSync: true,
      reason: `Ready to sync (${timeSinceLastSync}ms >= ${syncInterval}ms on ${netInfo.type})`
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
      log.error('Failed to get resume position:', error as Error);
      return 0;
    }
  }

  /**
   * Sync current session to server (public for background service)
   */
  async syncCurrentSessionToServer(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    try {
      // Check network connectivity
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        log.info('No network connection, skipping sync');
        return;
      }

      // Load the current session from database to get full session data
      const sessionData = await getListeningSession(this.currentSession.sessionId);
      if (!sessionData) {
        log.error('Could not load session data for sync');
        return;
      }

      // Use the existing syncSingleSession method
      await this.syncSingleSession(sessionData);

      this.lastSyncTime = Date.now();
      log.info(`Synced session to server: ${this.currentSession.libraryItemId}`);
    } catch (error) {
      log.error('Failed to sync session to server:', error as Error);
    }
  }


  /**
   * Start pause timeout (close session after 15 minutes of pause)
   */
  private startPauseTimeout(): void {
    this.clearPauseTimeout();

    this.pauseTimeoutInterval = setTimeout(async () => {
      log.info('Pause timeout reached, ending session');
      await this.endCurrentSession();
    }, this.PAUSE_TIMEOUT);
  }

  /**
   * Clear pause timeout
   */
  private clearPauseTimeout(): void {
    if (this.pauseTimeoutInterval) {
      clearTimeout(this.pauseTimeoutInterval);
      this.pauseTimeoutInterval = null;
    }
  }

  /**
   * Start periodic sync of unsynced sessions (background sync)
   */
  private startPeriodicSync(): void {
    this.syncInterval = setInterval(async () => {
      await this.syncUnsyncedSessions();
    }, this.BACKGROUND_SYNC_INTERVAL);
  }


  /**
   * Sync a single session to the server
   */
  private async syncSingleSession(session: LocalListeningSessionRow): Promise<void> {
    // Use current time for active sessions, endTime for completed sessions
    const currentTime = session.endTime || session.currentTime;
    // Use the tracked timeListening field, which represents actual listening time
    const timeListened = session.timeListening || 0;

    // Skip sessions that are too short
    if (timeListened < this.MIN_SESSION_DURATION) {
      log.info(`Skipping short session ${session.id} (${timeListened}s)`);
      await markSessionAsSynced(session.id);
      return;
    }

    log.info(`Syncing session ${session.id} for library item ${session.libraryItemId}`);

    if (!session.serverSessionId) {
      // Create new server session only for downloaded content
      log.info(`Creating server session for ${session.libraryItemId}`);
      try {
        // Get the library item to get the library ID
        const libraryItem = await getLibraryItemById(session.libraryItemId);
        if (!libraryItem) {
          throw new Error(`Library item ${session.libraryItemId} not found locally`);
        }

        const serverSession = await createLocalSession(
          session.id, // Use the local session ID as the server session ID
          session.userId,
          libraryItem.libraryId,
          session.libraryItemId,
          session.startTime,
          currentTime,
          timeListened
        );

        // Update local session with server session ID
        await updateServerSessionId(session.id, serverSession.id);
        session.serverSessionId = serverSession.id;
      } catch (error) {
        log.error(`Failed to create server session for ${session.libraryItemId}:`, error as Error);

        // If the library item doesn't exist on server, mark session as synced to avoid retry loop
        if (error instanceof Error && error.message.includes('Media item not found')) {
          log.info(`Library item ${session.libraryItemId} not found on server, marking session as synced`);
          await markSessionAsSynced(session.id);
          return;
        }

        throw error;
      }
    }

    try {
      // Sync current progress to server session
      await syncSession(
        session.serverSessionId,
        currentTime,
        timeListened,
        session.duration
      );

      // Fetch latest progress from server after sync
      try {
        const progressResponse = await fetchMediaProgress(session.libraryItemId);
        await upsertMediaProgress([marshalMediaProgressFromApi(progressResponse, session.userId)]);
        log.info(`Fetched and updated progress after sync for ${session.libraryItemId}`);
      } catch (fetchError) {
        log.warn(`Failed to fetch progress after sync: ${fetchError}`);
        // Don't fail the entire sync if progress fetch fails
      }

      // Close server session if local session is ended
      if (session.sessionEnd) {
        await closeSession(session.serverSessionId);

        // Fetch final progress after closing session
        try {
          const finalProgress = await fetchMediaProgress(session.libraryItemId);
          await upsertMediaProgress([marshalMediaProgressFromApi(finalProgress, session.userId)]);
          log.info(`Fetched final progress after closing session for ${session.libraryItemId}`);
        } catch (fetchError) {
          log.warn(`Failed to fetch final progress: ${fetchError}`);
        }
      }

      // Reset timeListening after successful sync (like iOS implementation)
      if (!session.sessionEnd) {
        // Only reset for active sessions; completed sessions don't need reset
        await resetSessionListeningTime(session.id);
      }

      // Mark as synced
      await markSessionAsSynced(session.id);

      // Reset failure counter on successful sync (like Android)
      this.failedSyncs = 0;
      this.lastSyncTime = Date.now();

      log.info(`Successfully synced session to server: ${session.libraryItemId}`);
    } catch (error) {
      // Handle sync failure (like Android implementation)
      this.failedSyncs++;

      log.error(`Failed to sync session ${session.id} (attempt ${this.failedSyncs}):`, error as Error);

      // Show user feedback after 2 failed syncs (like Android)
      if (this.failedSyncs >= 2) {
        log.warn('Multiple sync failures detected - user should be notified');
        endListeningSession(session.id, session.currentTime).catch(err => {
          log.error('Failed to end session after sync failures:', err);
        });
      }

      // Record the sync failure in database
      await recordSyncFailure(session.id, error instanceof Error ? error.message : 'Unknown sync error');

      throw error;
    }
  }

  /**
   * Sync all unsynced sessions to the server
   */
  async syncUnsyncedSessions(): Promise<void> {
    try {
      // Check network connectivity
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        return;
      }

      const unsyncedSessions = await getUnsyncedSessions();
      if (unsyncedSessions.length === 0) {
        return;
      }

      log.info(`Syncing ${unsyncedSessions.length} unsynced sessions`);

      for (const session of unsyncedSessions) {
        try {
          await this.syncSingleSession(session);
        } catch (error) {
          log.error(`Failed to sync session ${session.id}:`, error as Error);
          await recordSyncFailure(session.id, error instanceof Error ? error.message : 'Unknown error');
        }
      }
    } catch (error) {
      log.error('Failed to sync sessions:', error as Error);
    }
  }

  /**
   * Force sync all unsynced sessions (ignores network check)
   */
  async forceSyncSessions(): Promise<void> {
    const unsyncedSessions = await getUnsyncedSessions();
    log.info(`Force syncing ${unsyncedSessions.length} sessions`);

    for (const session of unsyncedSessions) {
      try {
        await this.syncSingleSession(session);
      } catch (error) {
        log.error(`Failed to force sync session ${session.id}:`, error as Error);
        await recordSyncFailure(session.id, error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }

  /**
   * Fetch latest progress from server and update local database
   * (Compatibility method from ProgressSyncService)
   */
  async fetchServerProgress(): Promise<void> {
    try {
      log.info('Fetching latest progress from server');

      // Fetch latest user data including progress
      const meResponse = await fetchMe();

      // Marshal and upsert progress data
      const progressData = marshalMediaProgressFromAuthResponse(meResponse);
      if (progressData.length > 0) {
        await upsertMediaProgress(progressData);
        log.info(`Synced ${progressData.length} progress entries from server`);
      } else {
        log.info('No progress data to sync from server');
      }

    } catch (error) {
      log.error('Failed to fetch server progress:', error as Error);
      throw error;
    }
  }

  /**
   * End all active sessions for a user (ensures only one session at a time)
   */
  private async endAllActiveSessionsForUser(userId: string): Promise<void> {
    try {
      const activeSessions = await getAllActiveSessionsForUser(userId);
      for (const session of activeSessions) {
        log.info(`Ending active session ${session.id} for user ${userId}`);

        // If session got detached somehow, calculate a reasonable end time
        // Use current time if available, otherwise estimate based on session duration
        let endTime = session.currentTime;
        if (!endTime || endTime <= session.startTime) {
          // Calculate session listening duration and add to start time
          const sessionCreated = session.createdAt.getTime();
          const now = Date.now();
          const sessionDurationMs = now - sessionCreated;
          const estimatedListeningTime = Math.min(sessionDurationMs / 1000, session.duration - session.startTime);
          endTime = session.startTime + estimatedListeningTime;
          log.error(`Estimated end time for session ${session.id}: ${endTime}`);
        }

        await endListeningSession(session.id, endTime);
      }
    } catch (error) {
      log.error('Failed to end active sessions:', error as Error);
    }
  }

  /**
   * Cleanup and shutdown
   */
  shutdown(): void {
    this.clearPauseTimeout();

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    // End current session if any
    this.endCurrentSession();
  }
}

// Export singleton instance
export const unifiedProgressService = ProgressService.getInstance();
