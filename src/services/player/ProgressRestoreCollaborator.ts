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
    try {
      const username = await getStoredUsername();
      if (!username) {
        log.info("No username found, skipping PlayerService restoration");
        return;
      }

      const user = await getUserByUsername(username);
      if (!user?.id) {
        log.info("User not found, skipping PlayerService restoration");
        return;
      }

      // Get active session from DB - need to get libraryItemId first
      // Try to get it from playerSlice, or query DB for most recent session
      const store = useAppStore.getState();
      let libraryItemId: string | null = store.player.currentTrack?.libraryItemId || null;

      if (!libraryItemId) {
        // Query DB for most recent active session
        const activeSessions = await getAllActiveSessionsForUser(user.id);
        if (activeSessions.length > 0) {
          const mostRecent = activeSessions.sort(
            (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
          )[0];
          libraryItemId = mostRecent.libraryItemId;
        }
      }

      if (!libraryItemId) {
        log.info("No active session found, skipping PlayerService restoration");
        return;
      }

      const session = await progressService.getCurrentSession(user.id, libraryItemId);
      if (!session) {
        log.info("No active session found, skipping PlayerService restoration");
        return;
      }

      log.info(`Restoring PlayerService from session: ${session.libraryItemId}`);

      // Try to restore track info - only load full track if we have downloaded files
      try {
        const libraryItem = await getLibraryItemById(session.libraryItemId);
        if (!libraryItem) {
          log.warn(`Library item ${session.libraryItemId} not found, cannot restore track`);
          return;
        }

        const metadata = await getMediaMetadataByLibraryItemId(session.libraryItemId);
        if (!metadata) {
          log.warn(`Metadata not found for ${session.libraryItemId}, cannot restore track`);
          return;
        }

        // Check if we have downloaded audio files (indicates downloaded media)
        const audioFiles = await getAudioFilesWithDownloadInfo(metadata.id);
        if (audioFiles.length === 0) {
          log.warn(`No audio files found for ${session.libraryItemId}, cannot restore track`);
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
      } catch (error) {
        log.error("Failed to restore currentTrack from session", error as Error);
      }
    } catch (error) {
      log.error("Failed to restore PlayerService from session", error as Error);
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
