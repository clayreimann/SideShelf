/**
 * ProgressRestoreCollaborator
 *
 * Concern group: session restoration, position synchronization, and track rebuild checks.
 * All three methods interact with DB session records, ProgressService, and TrackPlayer.
 */

import type { AudioFileWithDownloadInfo } from "@/db/helpers/combinedQueries";
import { getAudioFilesWithDownloadInfo } from "@/db/helpers/combinedQueries";
import { getChaptersForMedia } from "@/db/helpers/chapters";
import { getAllActiveSessionsForUser } from "@/db/helpers/localListeningSessions";
import { getLibraryItemById } from "@/db/helpers/libraryItems";
import { getMediaMetadataByLibraryItemId } from "@/db/helpers/mediaMetadata";
import { getUserByUsername } from "@/db/helpers/users";
import { getCoverUri } from "@/lib/covers";
import { formatTime } from "@/lib/helpers/formatters";
import { logger } from "@/lib/logger";
import { getStoredUsername } from "@/lib/secureStore";
import { trace } from "@/lib/trace";
import { progressService } from "@/services/ProgressService";
import { getCoordinator } from "@/services/coordinator/PlayerStateCoordinator";
import { useAppStore } from "@/stores/appStore";
import type { PlayerTrack } from "@/types/player";
import TrackPlayer, { State } from "react-native-track-player";
import type { IPlayerServiceFacade, IProgressRestoreCollaborator } from "./types";

const log = logger.forTag("PlayerService");

/**
 * Handles restoration of PlayerService state from ProgressService sessions,
 * position synchronization from DB, and TrackPlayer queue rebuild checks.
 */
export class ProgressRestoreCollaborator implements IProgressRestoreCollaborator {
  constructor(private facade: IPlayerServiceFacade) {}

  /**
   * Restore PlayerService state from ProgressService session.
   * Restores currentTrack to playerSlice from database session.
   */
  async restorePlayerServiceFromSession(): Promise<void> {
    // Generate a unique ID per restore attempt for tracing causality through child spans
    // and any machine events dispatched during restore.
    const restoreSessionId = Math.random().toString(16).slice(2);
    const rootSpan = trace.startSpan('player.restore.session', { restoreSessionId });

    try {
      const username = await getStoredUsername();
      if (!username) {
        log.info("No username found, skipping PlayerService restoration");
        trace.endSpan(rootSpan, 'ok', { earlyExit: 'no_username', restoreSessionId });
        return;
      }

      const user = await getUserByUsername(username);
      if (!user?.id) {
        log.info("User not found, skipping PlayerService restoration");
        trace.endSpan(rootSpan, 'ok', { earlyExit: 'user_not_found', restoreSessionId });
        return;
      }

      // --- source.memory span: check in-memory store for an existing libraryItemId ---
      const memorySpan = trace.startSpan('player.restore.source.memory', {}, rootSpan.context);
      const store = useAppStore.getState();
      let libraryItemId: string | null = store.player.currentTrack?.libraryItemId || null;
      trace.endSpan(memorySpan, 'ok', {
        found: !!libraryItemId,
        itemId: libraryItemId ?? null,
      });

      // --- source.db span: query DB for most recent active session ---
      let sessionCount = 0;
      if (!libraryItemId) {
        const dbSpan = trace.startSpan('player.restore.source.db', {}, rootSpan.context);
        const activeSessions = await getAllActiveSessionsForUser(user.id);
        sessionCount = activeSessions.length;
        if (activeSessions.length > 0) {
          const mostRecent = activeSessions.sort(
            (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
          )[0];
          libraryItemId = mostRecent.libraryItemId;
        }
        trace.endSpan(dbSpan, 'ok', {
          found: !!libraryItemId,
          sessionCount,
          itemId: libraryItemId ?? null,
        });
      }

      if (!libraryItemId) {
        log.info("No active session found, skipping PlayerService restoration");
        trace.endSpan(rootSpan, 'ok', { earlyExit: 'no_library_item_id', restoreSessionId });
        return;
      }

      const session = await progressService.getCurrentSession(user.id, libraryItemId);
      if (!session) {
        log.info("No active session found, skipping PlayerService restoration");
        trace.endSpan(rootSpan, 'ok', { earlyExit: 'no_session', itemId: libraryItemId, restoreSessionId });
        return;
      }

      log.info(`Restoring PlayerService from session: ${session.libraryItemId}`);

      // --- reconcile span: select the winning candidate ---
      const reconcileSpan = trace.startSpan('player.restore.reconcile', {}, rootSpan.context);
      trace.addEvent('restore.candidate.accepted', {
        source: 'db',
        itemId: session.libraryItemId,
        positionMs: session.currentTime * 1000,
        reason: 'active_session',
        restoreSessionId,
      });
      trace.addEvent('restore.decision.finalized', {
        source: 'db',
        itemId: session.libraryItemId,
        positionMs: session.currentTime * 1000,
        restoreSessionId,
      });
      trace.endSpan(reconcileSpan, 'ok', {
        winner: 'db',
        itemId: session.libraryItemId,
        positionMs: session.currentTime * 1000,
      });

      // --- apply span: build track and write to store ---
      const applySpan = trace.startSpan('player.restore.apply', {}, rootSpan.context);
      // Try to restore track info - only load full track if we have downloaded files
      try {
        const libraryItem = await getLibraryItemById(session.libraryItemId);
        if (!libraryItem) {
          log.warn(`Library item ${session.libraryItemId} not found, cannot restore track`);
          trace.endSpan(applySpan, 'error', { reason: 'library_item_not_found', itemId: session.libraryItemId });
          trace.endSpan(rootSpan, 'ok', { earlyExit: 'library_item_not_found', restoreSessionId });
          return;
        }

        const metadata = await getMediaMetadataByLibraryItemId(session.libraryItemId);
        if (!metadata) {
          log.warn(`Metadata not found for ${session.libraryItemId}, cannot restore track`);
          trace.endSpan(applySpan, 'error', { reason: 'metadata_not_found', itemId: session.libraryItemId });
          trace.endSpan(rootSpan, 'ok', { earlyExit: 'metadata_not_found', restoreSessionId });
          return;
        }

        // Check if we have downloaded audio files (indicates downloaded media)
        const audioFiles = await getAudioFilesWithDownloadInfo(metadata.id);
        if (audioFiles.length === 0) {
          log.warn(`No audio files found for ${session.libraryItemId}, cannot restore track`);
          trace.endSpan(applySpan, 'error', { reason: 'no_audio_files', itemId: session.libraryItemId });
          trace.endSpan(rootSpan, 'ok', { earlyExit: 'no_audio_files', restoreSessionId });
          return;
        }

        const chapters = await getChaptersForMedia(metadata.id);
        const hasDownloadedFiles = audioFiles.some(
          (file: AudioFileWithDownloadInfo) => file.downloadInfo?.isDownloaded
        );

        const track: PlayerTrack = {
          libraryItemId: libraryItem.id,
          mediaId: metadata.id,
          title: metadata.title || "Unknown Title",
          author: metadata.authorName || metadata.author || "Unknown Author",
          coverUri: metadata.imageUrl?.match(/^https?:\/\//)
            ? metadata.imageUrl
            : getCoverUri(libraryItem.id),
          audioFiles,
          chapters,
          duration: audioFiles.reduce(
            (total: number, file: AudioFileWithDownloadInfo) => total + (file.duration || 0),
            0
          ),
          isDownloaded: hasDownloadedFiles,
        };

        store._setCurrentTrack(track);
        log.info(
          `Restored PlayerService track to playerSlice (${hasDownloadedFiles ? "downloaded" : "streaming"}): ${track.title}`
        );
        trace.endSpan(applySpan, 'ok', {
          itemId: track.libraryItemId,
          positionMs: session.currentTime * 1000,
          isDownloaded: hasDownloadedFiles,
          audioFileCount: audioFiles.length,
        });
      } catch (error) {
        log.error("Failed to restore currentTrack from session", error as Error);
        trace.recordError(error, applySpan);
        trace.endSpan(applySpan, 'error');
        trace.endSpan(rootSpan, 'error');
        return;
      }

      // --- verify span: confirm store has the track after apply ---
      const verifySpan = trace.startSpan('player.restore.verify', {}, rootSpan.context);
      const postApplyStore = useAppStore.getState();
      const restoredTrack = postApplyStore.player.currentTrack;
      trace.endSpan(verifySpan, 'ok', {
        trackPresent: !!restoredTrack,
        itemId: restoredTrack?.libraryItemId ?? null,
        isDownloaded: restoredTrack?.isDownloaded ?? null,
      });

      trace.endSpan(rootSpan, 'ok', { restoreSessionId, itemId: session.libraryItemId });
    } catch (error) {
      log.error("Failed to restore PlayerService from session", error as Error);
      trace.recordError(error, rootSpan);
      trace.endSpan(rootSpan, 'error');
    }
  }

  /**
   * Sync current position from database.
   * Useful when database position has been updated (e.g., from server sync).
   */
  async syncPositionFromDatabase(): Promise<void> {
    try {
      log.info("Syncing position from database");

      const store = useAppStore.getState();
      const currentTrack = store.player.currentTrack;

      if (!currentTrack?.libraryItemId) {
        log.warn("No current track, skipping position sync");
        return;
      }

      // Get username to fetch user
      const username = await getStoredUsername();
      if (!username) {
        log.warn("No username found, cannot sync position");
        return;
      }

      // Get user from database
      const user = await getUserByUsername(username);
      if (!user?.id) {
        log.warn("User not found in database, cannot sync position");
        return;
      }

      // Get the current session from database
      const session = await progressService.getCurrentSession(user.id, currentTrack.libraryItemId);
      if (!session) {
        log.warn(`No active session found for ${currentTrack.libraryItemId}`);
        return;
      }

      // Check if TrackPlayer is actively playing
      const playbackState = await TrackPlayer.getPlaybackState();
      const isPlaying = playbackState.state === State.Playing;

      // Update store position (for UI consistency)
      store.updatePosition(session.currentTime);

      // Only seek TrackPlayer if NOT actively playing to avoid stutters
      // When playing, TrackPlayer position is ahead of DB due to 1-2s sync lag
      if (!isPlaying) {
        await TrackPlayer.seekTo(session.currentTime);
        log.info(
          `Position synced from database: ${formatTime(session.currentTime)}s for ${currentTrack.libraryItemId}`
        );
      } else {
        log.info(
          `Position updated from database in store: ${formatTime(session.currentTime)}s (TrackPlayer not seeked because actively playing)`
        );
      }
    } catch (error) {
      log.error("Error syncing position from database", error as Error);
      throw error;
    }
  }

  /**
   * Rebuild currentTrack if it's missing but should exist.
   * Handles case where streaming media wasn't restored but playback should resume.
   */
  async rebuildCurrentTrackIfNeeded(): Promise<boolean> {
    try {
      const store = useAppStore.getState();
      let playerSliceTrack = store.player.currentTrack;

      if (!playerSliceTrack) {
        log.info("No currentTrack in store, attempting to restore from session");
        await this.restorePlayerServiceFromSession();
        playerSliceTrack = useAppStore.getState().player.currentTrack;
      }

      if (!playerSliceTrack) {
        log.warn("Unable to rebuild player state - no track information available");
        return false;
      }

      const queue = await TrackPlayer.getQueue();
      const expectedIds = playerSliceTrack.audioFiles.map((file) => file.id);
      const queueIds = queue.map((track) => track.id);
      const queueMatchesTrack =
        queue.length > 0 &&
        queue.length === expectedIds.length &&
        queueIds.every((id, index) => id === expectedIds[index]);

      if (queueMatchesTrack) {
        const requiresStreaming = playerSliceTrack.audioFiles.some(
          (audioFile) => !audioFile.downloadInfo?.isDownloaded
        );
        if (!requiresStreaming) {
          const refreshedStore = useAppStore.getState();
          if (refreshedStore.player.currentPlaySessionId) {
            log.info(
              `Clearing stale streaming session ID for downloaded track ${playerSliceTrack.libraryItemId}`
            );
            refreshedStore._setPlaySessionId(null);
          }
        }
        log.info(`TrackPlayer queue already prepared for ${playerSliceTrack.libraryItemId}`);
        return true;
      }

      log.info(
        `TrackPlayer queue missing or mismatched, rebuilding for ${playerSliceTrack.libraryItemId}`
      );

      // Dynamically import TrackLoadingCollaborator to avoid circular dependency
      // TrackLoadingCollaborator → types.ts → (no PlayerService import)
      // ProgressRestoreCollaborator → TrackLoadingCollaborator would be fine statically,
      // but PlayerService creates both, so we keep this dynamic to be safe.
      const { TrackLoadingCollaborator } = await import("./TrackLoadingCollaborator");
      const trackLoader = new TrackLoadingCollaborator(this.facade);
      const rebuilt = await trackLoader.reloadTrackPlayerQueue(playerSliceTrack);

      if (!rebuilt) {
        log.warn(`Failed to rebuild TrackPlayer queue for ${playerSliceTrack.libraryItemId}`);
      }

      return rebuilt;
    } catch (error) {
      log.error("Failed to rebuild currentTrack", error as Error);
      // Don't throw - playback can still proceed
      return false;
    }
  }
}
