/**
 * Progress Sync Service
 *
 * Handles syncing progress between the app and server, including:
 * - Fetching latest progress from server
 * - Updating progress to server
 * - Background progress sync during playback
 */

import { marshalMediaProgressFromAuthResponse, upsertMediaProgress } from '@/db/helpers/mediaProgress';
import { fetchMe } from '@/lib/api/endpoints';

export class ProgressSyncService {
  private static instance: ProgressSyncService;
  private syncInProgress = false;
  private lastSyncTime = 0;
  private readonly MIN_SYNC_INTERVAL = 30000; // 30 seconds minimum between syncs

  private constructor() {}

  static getInstance(): ProgressSyncService {
    if (!ProgressSyncService.instance) {
      ProgressSyncService.instance = new ProgressSyncService();
    }
    return ProgressSyncService.instance;
  }

  /**
   * Fetch latest progress from server and update local database
   */
  async fetchAndSyncProgress(): Promise<void> {
    if (this.syncInProgress) {
      console.log('[ProgressSyncService] Sync already in progress, skipping');
      return;
    }

    const now = Date.now();
    if (now - this.lastSyncTime < this.MIN_SYNC_INTERVAL) {
      console.log('[ProgressSyncService] Too soon since last sync, skipping');
      return;
    }

    this.syncInProgress = true;
    this.lastSyncTime = now;

    try {
      console.log('[ProgressSyncService] Fetching latest progress from server');

      // Fetch latest user data including progress
      const meResponse = await fetchMe();

      // Marshal and upsert progress data
      const progressData = marshalMediaProgressFromAuthResponse(meResponse);
      if (progressData.length > 0) {
        await upsertMediaProgress(progressData);
        console.log(`[ProgressSyncService] Synced ${progressData.length} progress entries`);
      } else {
        console.log('[ProgressSyncService] No progress data to sync');
      }

    } catch (error) {
      console.error('[ProgressSyncService] Failed to sync progress:', error);
      throw error;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Update progress to server
   * DISABLED: API conformance needs to be verified
   */
  async updateProgressToServer(
    libraryItemId: string,
    currentTime: number,
    duration: number,
    progress: number,
    isFinished: boolean = false
  ): Promise<void> {
    console.log('[ProgressSyncService] Server progress update is currently disabled - API conformance needs verification');
    return;

  }

  /**
   * Force a progress sync (ignores timing restrictions)
   * DISABLED: API conformance needs to be verified
   */
  async forceSyncProgress(): Promise<void> {
    console.log('[ProgressSyncService] Force sync is currently disabled - API conformance needs verification');
    return;

    // TODO: Re-enable once API conformance is verified
    // this.lastSyncTime = 0; // Reset timing restriction
    // await this.fetchAndSyncProgress();

    // Also sync any unsynced local sessions
    // try {
    //   await sessionTrackingService.forceSyncSessions();
    // } catch (error) {
    //   console.error('[ProgressSyncService] Failed to sync local sessions:', error);
    // }
  }

  /**
   * Sync all offline data (progress + sessions)
   * DISABLED: API conformance needs to be verified
   */
  async syncAllOfflineData(): Promise<void> {
    console.log('[ProgressSyncService] Full offline data sync is currently disabled - API conformance needs verification');
    return;

    // TODO: Re-enable once API conformance is verified
    // console.log('[ProgressSyncService] Starting full offline data sync');

    // try {
    //   // First sync progress from server
    //   await this.forceSyncProgress();

    //   // Then sync local sessions to server
    //   await sessionTrackingService.forceSyncSessions();

    //   console.log('[ProgressSyncService] Full offline data sync completed');
    // } catch (error) {
    //   console.error('[ProgressSyncService] Failed to sync offline data:', error);
    //   throw error;
    // }
  }
}

// Export singleton instance
export const progressSyncService = ProgressSyncService.getInstance();
