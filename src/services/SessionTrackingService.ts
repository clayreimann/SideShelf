/**
 * Session Tracking Service
 *
 * Manages local listening sessions and progress tracking that works offline
 * and syncs to the server when connectivity is available.
 */

import {
    createProgressSnapshot,
    endListeningSession,
    getActiveSession,
    getUnsyncedSessions,
    markSessionAsSynced,
    recordSyncFailure,
    startListeningSession,
    updateSessionProgress
} from '@/db/helpers/localListeningSessions';
import { getUserByUsername } from '@/db/helpers/users';
import NetInfo from "@react-native-community/netinfo";

export interface SessionInfo {
  sessionId: string;
  libraryItemId: string;
  mediaId: string;
  startTime: number;
  duration: number;
}

export class SessionTrackingService {
  private static instance: SessionTrackingService;
  private currentSession: SessionInfo | null = null;
  private progressSnapshotInterval: ReturnType<typeof setInterval> | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private lastSnapshotTime = 0;

  // Configuration
  private readonly SNAPSHOT_INTERVAL = 10000; // 10 seconds
  private readonly SYNC_INTERVAL = 60000; // 1 minute
  private readonly MIN_SESSION_DURATION = 5; // 5 seconds minimum to record a session

  private constructor() {
    this.startPeriodicSync();
  }

  static getInstance(): SessionTrackingService {
    if (!SessionTrackingService.instance) {
      SessionTrackingService.instance = new SessionTrackingService();
    }
    return SessionTrackingService.instance;
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
    volume: number = 1.0
  ): Promise<void> {
    try {
      // End any existing session first
      await this.endCurrentSession();

      // Get user ID
      const user = await getUserByUsername(username);
      if (!user?.id) {
        throw new Error('User not found');
      }

      // Check for existing active session
      const existingSession = await getActiveSession(user.id, libraryItemId);
      if (existingSession) {
        console.log('[SessionTrackingService] Found existing active session, ending it first');
        await endListeningSession(existingSession.id, startTime);
      }

      // Start new session
      const sessionId = await startListeningSession(
        user.id,
        libraryItemId,
        mediaId,
        startTime,
        duration,
        playbackRate,
        volume
      );

      this.currentSession = {
        sessionId,
        libraryItemId,
        mediaId,
        startTime,
        duration,
      };

      // Start progress snapshots
      this.startProgressSnapshots();

      console.log(`[SessionTrackingService] Started session ${sessionId} for ${libraryItemId}`);
    } catch (error) {
      console.error('[SessionTrackingService] Failed to start session:', error);
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
      const finalEndTime = endTime || this.currentSession.startTime;

      // Only record session if it was long enough
      const sessionDuration = finalEndTime - this.currentSession.startTime;
      if (sessionDuration >= this.MIN_SESSION_DURATION) {
        await endListeningSession(this.currentSession.sessionId, finalEndTime);
        console.log(`[SessionTrackingService] Ended session ${this.currentSession.sessionId}`);
      } else {
        console.log(`[SessionTrackingService] Session too short (${sessionDuration}s), not recording`);
      }

      this.currentSession = null;
      this.stopProgressSnapshots();
    } catch (error) {
      console.error('[SessionTrackingService] Failed to end session:', error);
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
      // Update session progress
      await updateSessionProgress(
        this.currentSession.sessionId,
        currentTime,
        playbackRate,
        volume
      );

      // Create snapshot if enough time has passed
      const now = Date.now();
      if (now - this.lastSnapshotTime >= this.SNAPSHOT_INTERVAL) {
        const progress = currentTime / this.currentSession.duration;
        await createProgressSnapshot(
          this.currentSession.sessionId,
          currentTime,
          progress,
          playbackRate || 1.0,
          volume || 1.0,
          chapterId,
          isPlaying
        );
        this.lastSnapshotTime = now;
      }
    } catch (error) {
      console.error('[SessionTrackingService] Failed to update progress:', error);
    }
  }

  /**
   * Get current session info
   */
  getCurrentSession(): SessionInfo | null {
    return this.currentSession;
  }

  /**
   * Start periodic progress snapshots
   */
  private startProgressSnapshots(): void {
    this.stopProgressSnapshots();

    this.progressSnapshotInterval = setInterval(() => {
      // The actual snapshot creation is handled in updateProgress
      // This interval just ensures we're regularly checking
    }, this.SNAPSHOT_INTERVAL);
  }

  /**
   * Stop periodic progress snapshots
   */
  private stopProgressSnapshots(): void {
    if (this.progressSnapshotInterval) {
      clearInterval(this.progressSnapshotInterval);
      this.progressSnapshotInterval = null;
    }
  }

  /**
   * Start periodic sync of unsynced sessions
   * DISABLED: Server sync is currently disabled
   */
  private startPeriodicSync(): void {
    // TODO: Re-enable once server sync is working
    // this.syncInterval = setInterval(async () => {
    //   await this.syncUnsyncedSessions();
    // }, this.SYNC_INTERVAL);
    console.log('[SessionTrackingService] Periodic sync disabled - server sync not available');
  }

  /**
   * Sync all unsynced sessions to the server
   */
  async syncUnsyncedSessions(): Promise<void> {
    try {
      // Check network connectivity
      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        console.log('[SessionTrackingService] No network connection, skipping sync');
        return;
      }

      const unsyncedSessions = await getUnsyncedSessions();
      if (unsyncedSessions.length === 0) {
        return;
      }

      console.log(`[SessionTrackingService] Syncing ${unsyncedSessions.length} unsynced sessions`);

      for (const session of unsyncedSessions) {
        try {
          // Skip active sessions
          if (!session.sessionEnd || !session.endTime) {
            continue;
          }

          // Calculate final progress
          const progress = session.endTime / session.duration;
          const isFinished = progress >= 0.98; // Consider 98% as finished

          // TODO: Re-enable server sync once API conformance is verified
          // await progressSyncService.updateProgressToServer(
          //   session.libraryItemId,
          //   session.endTime,
          //   session.duration,
          //   progress,
          //   isFinished
          // );

          // Mark as synced (for now, just mark as synced without actual server sync)
          await markSessionAsSynced(session.id);

          console.log(`[SessionTrackingService] Marked session ${session.id} as synced (server sync disabled)`);
        } catch (error) {
          console.error(`[SessionTrackingService] Failed to sync session ${session.id}:`, error);
          await recordSyncFailure(session.id, error instanceof Error ? error.message : 'Unknown error');
        }
      }
    } catch (error) {
      console.error('[SessionTrackingService] Failed to sync sessions:', error);
    }
  }

  /**
   * Force sync all unsynced sessions (ignores network check)
   */
  async forceSyncSessions(): Promise<void> {
    const unsyncedSessions = await getUnsyncedSessions();
    console.log(`[SessionTrackingService] Force syncing ${unsyncedSessions.length} sessions`);

    for (const session of unsyncedSessions) {
      try {
        if (!session.sessionEnd || !session.endTime) {
          continue;
        }

        const progress = session.endTime / session.duration;
        const isFinished = progress >= 0.98;

        // TODO: Re-enable server sync once API conformance is verified
        // await progressSyncService.updateProgressToServer(
        //   session.libraryItemId,
        //   session.endTime,
        //   session.duration,
        //   progress,
        //   isFinished
        // );

        await markSessionAsSynced(session.id);
      } catch (error) {
        console.error(`[SessionTrackingService] Failed to force sync session ${session.id}:`, error);
        await recordSyncFailure(session.id, error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }

  /**
   * Cleanup and shutdown
   */
  shutdown(): void {
    this.stopProgressSnapshots();

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    // End current session if any
    this.endCurrentSession();
  }
}

// Export singleton instance
export const sessionTrackingService = SessionTrackingService.getInstance();
