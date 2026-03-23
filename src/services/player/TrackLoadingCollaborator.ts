/**
 * TrackLoadingCollaborator
 *
 * Concern group: track loading, track list building, and queue rebuild.
 * Owns: executeLoadTrack, buildTrackList, executeRebuildQueue.
 *
 * These three methods share DB lookups, path repair, streaming session
 * creation, and TrackPlayer queue management.
 *
 * IMPORTANT: This file must NEVER import from "@/services/PlayerService" —
 * always use IPlayerServiceFacade from "./types" to prevent circular imports.
 */

import { clearAudioFileDownloadStatus } from "@/db/helpers/audioFiles";
import { getChaptersForMedia } from "@/db/helpers/chapters";
import type { AudioFileWithDownloadInfo } from "@/db/helpers/combinedQueries";
import { getAudioFilesWithDownloadInfo } from "@/db/helpers/combinedQueries";
import { getLibraryItemById } from "@/db/helpers/libraryItems";
import { getMediaMetadataByLibraryItemId } from "@/db/helpers/mediaMetadata";
import { getUserByUsername } from "@/db/helpers/users";
import { startPlaySession } from "@/lib/api/endpoints";
import { getCoverUri } from "@/lib/covers";
import { ensureItemInDocuments } from "@/lib/fileLifecycleManager";
import { resolveAppPath, verifyFileExists } from "@/lib/fileSystem";
import { formatTime } from "@/lib/helpers/formatters";
import { logger } from "@/lib/logger";
import { trace } from "@/lib/trace";
import { getStoredUsername } from "@/lib/secureStore";
import { dispatchPlayerEvent } from "@/services/coordinator/eventBus";
import { downloadService } from "@/services/DownloadService";
import { useAppStore } from "@/stores/appStore";
import type { ApiPlaySessionResponse } from "@/types/api";
import type { ResumePositionInfo } from "@/types/coordinator";
import type { PlayerTrack } from "@/types/player";
import TrackPlayer, { Track } from "react-native-track-player";
import type { IPlayerServiceFacade, ITrackLoadingCollaborator } from "./types";

const log = logger.forTag("PlayerService");
const diagLog = logger.forDiagnostics("PlayerService");

/**
 * Handles track loading, track list construction, and queue rebuild.
 */
export class TrackLoadingCollaborator implements ITrackLoadingCollaborator {
  constructor(private facade: IPlayerServiceFacade) {}

  /**
   * Execute track loading (Internal - Called by Coordinator).
   */
  async executeLoadTrack(libraryItemId: string, episodeId?: string, startPosition?: number): Promise<void> {
    try {
      diagLog.info(`playTrack called for libraryItemId: ${libraryItemId}`);
      log.info(`Loading track for library item: ${libraryItemId}`);

      // Ensure downloaded files are in Documents directory before playback
      try {
        await ensureItemInDocuments(libraryItemId);
      } catch (error) {
        log.warn(`Failed to ensure item in Documents, continuing with playback: ${error}`);
      }

      // Repair download paths to account for iOS container path changes
      try {
        const repairedCount = await downloadService.repairDownloadStatus(libraryItemId);
        trace.addEvent("player.load.repair_completed", { libraryItemId, repairedCount });
      } catch (error) {
        log.warn(`Failed to repair download status, continuing with playback: ${error}`);
      }

      // Get username from secure storage
      const username = await getStoredUsername();
      if (!username) {
        throw new Error("No authenticated user found");
      }

      // Get user from database
      const user = await getUserByUsername(username);
      if (!user?.id) {
        throw new Error("User not found in database");
      }

      const store = useAppStore.getState();

      // Fetch required data from database
      const libraryItem = await getLibraryItemById(libraryItemId);
      if (!libraryItem) {
        throw new Error(`Library item ${libraryItemId} not found`);
      }

      const metadata = await getMediaMetadataByLibraryItemId(libraryItemId);
      if (!metadata) {
        throw new Error(`Metadata not found for library item ${libraryItemId}`);
      }

      const audioFiles = await getAudioFilesWithDownloadInfo(metadata.id);
      if (audioFiles.length === 0) {
        throw new Error("No audio files found for this item");
      }

      const chapters = await getChaptersForMedia(metadata.id);

      // Build PlayerTrack object
      const track: PlayerTrack = {
        libraryItemId: libraryItem.id,
        mediaId: metadata.id,
        title: metadata.title || "Unknown Title",
        author: metadata.authorName || metadata.author || "Unknown Author",
        // Only use imageUrl for remote URLs (e.g. podcast artwork from iTunes/RSS).
        // Local file paths stored in imageUrl may be stale after iOS app updates change
        // the container UUID. getCoverUri() always resolves via Paths.cache (current UUID).
        coverUri: metadata.imageUrl?.match(/^https?:\/\//)
          ? metadata.imageUrl
          : getCoverUri(libraryItem.id),
        audioFiles,
        chapters,
        duration: audioFiles.reduce(
          (total: number, file: AudioFileWithDownloadInfo) => total + (file.duration || 0),
          0
        ),
        isDownloaded: audioFiles.some(
          (file: AudioFileWithDownloadInfo) => file.downloadInfo?.isDownloaded
        ),
      };

      log.info(`Built track: ${track.title}`);

      // Clear current queue
      await TrackPlayer.reset();

      // Determine the audio source (local or remote)
      const tracks = await this.buildTrackList(track);

      if (tracks.length === 0) {
        const hasDownloadedFiles = track.audioFiles.some((af) => af.downloadInfo?.isDownloaded);
        const needsStreaming = track.audioFiles.some(
          (audioFile) => !audioFile.downloadInfo?.isDownloaded
        );

        let errorMessage = "No playable audio files found";
        if (hasDownloadedFiles && !needsStreaming) {
          errorMessage +=
            ". Downloaded files are missing from device storage. Please re-download the content.";
        } else if (!hasDownloadedFiles && needsStreaming) {
          errorMessage +=
            ". Content is not downloaded and streaming is not available. Please check your internet connection.";
        } else if (hasDownloadedFiles && needsStreaming) {
          errorMessage +=
            ". Downloaded files are missing and streaming failed. Please check your internet connection or re-download the content.";
        }

        log.error(
          `No playable tracks available: ${JSON.stringify({
            totalAudioFiles: track.audioFiles.length,
            downloadedFiles: track.audioFiles.filter((af) => af.downloadInfo?.isDownloaded).length,
            needsStreaming,
          })}`
        );

        throw new Error(errorMessage);
      }

      // Update store with current track
      store._setCurrentTrack(track);

      // Add tracks to queue
      await TrackPlayer.add(tracks);

      let seekPosition: number;
      if (startPosition !== undefined) {
        // Caller-specified chapter position — skip resolveCanonicalPosition to avoid
        // spurious progress-jump toast and timing race during queue rebuild.
        seekPosition = startPosition;
        dispatchPlayerEvent({ type: "POSITION_RECONCILED", payload: { position: startPosition } });
        log.info(`[executeLoadTrack] Using caller-specified startPosition: ${formatTime(startPosition)}s`);
      } else {
        const resumeInfo = await this.facade.resolveCanonicalPosition(libraryItemId);
        seekPosition = resumeInfo.position;
        log.info(`[executeLoadTrack] Resuming from ${resumeInfo.source}: ${formatTime(resumeInfo.position)}s`);
      }

      if (seekPosition > 0) {
        await TrackPlayer.seekTo(seekPosition);
      }

      // Apply playback settings from store to TrackPlayer
      const currentPlaybackRate = store.player.playbackRate;
      const currentVolume = store.player.volume;

      if (currentPlaybackRate !== 1.0) {
        await TrackPlayer.setRate(currentPlaybackRate);
        log.info(`Applied playback rate from store: ${currentPlaybackRate}`);
      }

      if (currentVolume !== 1.0) {
        await TrackPlayer.setVolume(currentVolume);
        log.info(`Applied volume from store: ${currentVolume}`);
      }

      log.info("Track loaded, returning to coordinator");
    } catch (error) {
      log.error(" Failed to load track:", error as Error);
      // Clear loading state on error
      const store = useAppStore.getState();
      store._setTrackLoading(false);
      throw error;
    }
  }

  /**
   * Build track list from PlayerTrack.
   */
  async buildTrackList(playerTrack: PlayerTrack): Promise<Track[]> {
    const parentSpan = trace.startSpan("player.load.build_track_list", {
      libraryItemId: playerTrack.libraryItemId,
    });

    const tracks: Track[] = [];

    // First, check which files we have locally
    const locallyAvailableFiles = new Set<string>();
    for (const audioFile of playerTrack.audioFiles) {
      if (audioFile.downloadInfo?.isDownloaded && audioFile.downloadInfo.downloadPath) {
        const storedPath = audioFile.downloadInfo.downloadPath;
        const fileExists = await verifyFileExists(storedPath);
        if (fileExists) {
          locallyAvailableFiles.add(audioFile.id);
        } else {
          const resolvedPath = resolveAppPath(storedPath);
          log.warn(`File marked as downloaded but missing: ${resolvedPath}`);

          // Clean up database
          try {
            await clearAudioFileDownloadStatus(audioFile.id);
            log.info(`Cleared download status for missing file: ${audioFile.id}`);
          } catch (error) {
            log.error("Failed to clear download status", error as Error);
          }
        }
      }
    }

    // Only get streaming URLs if we don't have all files locally
    let playSession: ApiPlaySessionResponse | null = null;
    const needsStreaming = playerTrack.audioFiles.some(
      (audioFile) => !locallyAvailableFiles.has(audioFile.id)
    );
    const store = useAppStore.getState();

    if (needsStreaming) {
      try {
        playSession = await startPlaySession(playerTrack.libraryItemId);
        store._setPlaySessionId(playSession.id);
        log.info(`Started play session: ${playSession.id}`);
        log.info(`Got streaming tracks: ${playSession.audioTracks.length}`);

        if (playSession.audioTracks.length > 0) {
          log.info(
            `Sample streaming track: ${JSON.stringify({
              contentUrl: playSession.audioTracks[0].contentUrl,
              filename: playSession.audioTracks[0].metadata.filename,
              mimeType: playSession.audioTracks[0].mimeType,
            })}`
          );
        }
      } catch (error) {
        log.error("Failed to start play session", error as Error);
      }
    } else if (store.player.currentPlaySessionId) {
      log.info(
        `Clearing stale streaming session ID before local playback for ${playerTrack.libraryItemId}`
      );
      store._setPlaySessionId(null);
    }

    // Get API info once for all streaming URLs
    let cachedApiInfo = this.facade.getApiInfo();

    let localCount = 0;
    let streamingCount = 0;
    let missingCount = 0;

    // Process each audio file in a single loop
    for (const audioFile of playerTrack.audioFiles) {
      let url: string | undefined;
      let sourceType: "local" | "streaming" | "missing" = "missing";
      let storedPath: string | undefined;
      let resolvedPath: string | undefined;
      let fileExists = false;

      // First, try to use local file if available
      if (locallyAvailableFiles.has(audioFile.id) && audioFile.downloadInfo?.downloadPath) {
        storedPath = audioFile.downloadInfo.downloadPath;
        resolvedPath = resolveAppPath(storedPath);
        url = resolvedPath;
        sourceType = "local";
        fileExists = true;
        localCount++;
      }
      // If no local file, try streaming
      else if (playSession && playSession.audioTracks.length > 0) {
        const streamingTrack = playSession.audioTracks.find(
          (track) =>
            track.metadata.filename === audioFile.filename || track.index === audioFile.index
        );

        if (streamingTrack && cachedApiInfo) {
          const separator = streamingTrack.contentUrl.includes("?") ? "&" : "?";
          url = `${cachedApiInfo.baseUrl}${streamingTrack.contentUrl}${separator}token=${cachedApiInfo.accessToken}`;
          sourceType = "streaming";
          streamingCount++;
        }
      }

      if (sourceType === "missing") {
        missingCount++;
      }

      const fileSpan = trace.startSpan(
        "player.load.file_verify",
        {
          audioFileId: audioFile.id,
          filename: audioFile.filename,
          storedPath: storedPath ?? null,
          resolvedPath: resolvedPath ?? null,
          fileExists,
          sourceType,
        },
        parentSpan.context
      );
      trace.endSpan(fileSpan, "ok");

      // Add track if we have a valid URL
      if (url) {
        const displayUrl =
          sourceType === "streaming"
            ? url.replace(cachedApiInfo?.accessToken || "", "<token>")
            : url;
        log.info(`Using ${sourceType} file for ${audioFile.filename}: ${displayUrl}`);

        tracks.push({
          id: audioFile.id,
          url,
          title: audioFile.tagTitle || audioFile.filename,
          artist: playerTrack.author,
          album: playerTrack.title,
          artwork: playerTrack.coverUri || undefined,
          duration: audioFile.duration || undefined,
        });
      } else {
        log.warn(`No playable source found for: ${audioFile.filename}`);
      }
    }

    trace.endSpan(parentSpan, "ok", {
      totalFiles: playerTrack.audioFiles.length,
      localCount,
      streamingCount,
      missingCount,
    });

    return tracks;
  }

  /**
   * Rebuild TrackPlayer queue for the given track (pure execution).
   * No coordinator imports, no event dispatches, throws on failure.
   * Called only by the coordinator via IPlayerServiceFacade.executeRebuildQueue.
   */
  async executeRebuildQueue(track: PlayerTrack): Promise<ResumePositionInfo> {
    await TrackPlayer.reset();

    const tracks = await this.buildTrackList(track);
    if (tracks.length === 0) {
      log.warn(`No playable sources found while rebuilding queue for ${track.libraryItemId}`);
      throw new Error(
        `No playable sources found while rebuilding queue for ${track.libraryItemId}`
      );
    }

    await TrackPlayer.add(tracks);

    const resumeInfo = await this.facade.resolveCanonicalPosition(track.libraryItemId);

    if (resumeInfo.position > 0) {
      await TrackPlayer.seekTo(resumeInfo.position);
      log.info(
        `Prepared resume position from ${resumeInfo.source}: ${formatTime(resumeInfo.position)}s`
      );
      const store = useAppStore.getState();
      store._updateCurrentChapter(resumeInfo.position);
    } else {
      log.info("Prepared queue with no resume position (starting from beginning)");
    }

    const store = useAppStore.getState();
    if (store.player.playbackRate !== 1.0) {
      await TrackPlayer.setRate(store.player.playbackRate);
      log.info(`Applied stored playback rate: ${store.player.playbackRate}`);
    }

    if (store.player.volume !== 1.0) {
      await TrackPlayer.setVolume(store.player.volume);
      log.info(`Applied stored volume: ${store.player.volume}`);
    }

    return resumeInfo;
  }
}
