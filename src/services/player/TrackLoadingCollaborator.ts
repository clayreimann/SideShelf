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

import { clearAudioFileDownloadStatus, markAudioFileAsDownloaded } from "@/db/helpers/audioFiles";
import { getChaptersForMedia } from "@/db/helpers/chapters";
import type { AudioFileWithDownloadInfo } from "@/db/helpers/combinedQueries";
import { getAudioFilesWithDownloadInfo } from "@/db/helpers/combinedQueries";
import { getLibraryItemById } from "@/db/helpers/libraryItems";
import { getMediaMetadataByLibraryItemId } from "@/db/helpers/mediaMetadata";
import { getUserByUsername } from "@/db/helpers/users";
import { startPlaySession } from "@/lib/api/endpoints";
import { getCoverUri } from "@/lib/covers";
import { ensureItemInDocuments } from "@/lib/fileLifecycleManager";
import {
  getAudioFileLocation,
  getDownloadPath,
  resolveAppPath,
  verifyFileExists,
} from "@/lib/fileSystem";
import { formatTime } from "@/lib/helpers/formatters";
import { logger } from "@/lib/logger";
import { trace } from "@/lib/trace";
import { getStoredUsername } from "@/lib/secureStore";
import { downloadService } from "@/services/DownloadService";
import { useAppStore } from "@/stores/appStore";
import type { ApiPlaySessionResponse } from "@/types/api";
import type { ResumePositionInfo } from "@/types/coordinator";
import type { PlayerTrack } from "@/types/player";
import TrackPlayer, { Track } from "react-native-track-player";
import type {
  BuildTrackListResult,
  IPlayerServiceFacade,
  ITrackLoadingCollaborator,
  LoadTrackResult,
} from "./types";

const log = logger.forTag("PlayerService");
const diagLog = logger.forDiagnostics("PlayerService");

/** Interval between TrackPlayer.getProgress() polls while waiting for a seek to land. */
const SEEK_LAND_POLL_MS = 50;

/** Upper bound on how long executeLoadTrack waits for a seek to land before giving
 *  up and returning anyway. The coordinator's load watchdog (LOAD_WATCHDOG_MS in
 *  PlayerStateCoordinator) is the ultimate backstop if playback still never confirms. */
const SEEK_LAND_TIMEOUT_MS = 3_000;

/** Tolerance (seconds) for considering TrackPlayer's reported position "at" the
 *  seek target — native progress reporting isn't exact to the millisecond. */
const SEEK_LAND_TOLERANCE_SECONDS = 1;

/**
 * Handles track loading, track list construction, and queue rebuild.
 */
export class TrackLoadingCollaborator implements ITrackLoadingCollaborator {
  constructor(private facade: IPlayerServiceFacade) {}

  /**
   * Execute track loading (Internal - Called by Coordinator).
   */
  async executeLoadTrack(
    libraryItemId: string,
    episodeId?: string,
    startPosition?: number
  ): Promise<LoadTrackResult> {
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
        episodeId,
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
      const { tracks, playSessionId } = await this.buildTrackList(track);

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
        // Threaded back via the return value (Task 4a/4b) — the coordinator's
        // LOADING handler assigns it to context.position directly. The
        // POSITION_RECONCILED dispatch this used to make here was dead: LOADING
        // has no transition entry for POSITION_RECONCILED, so it was always
        // rejected and (per the rejected-events-have-zero-effect invariant)
        // never did anything.
        seekPosition = startPosition;
        log.info(
          `[executeLoadTrack] Using caller-specified startPosition: ${formatTime(startPosition)}s`
        );
      } else {
        const resumeInfo = await this.facade.resolveCanonicalPosition(libraryItemId);
        seekPosition = resumeInfo.position;
        log.info(
          `[executeLoadTrack] Resuming from ${resumeInfo.source}: ${formatTime(resumeInfo.position)}s`
        );
      }

      if (seekPosition > 0) {
        await TrackPlayer.seekTo(seekPosition);
        // Seek-then-play is deliberate (play-then-seek causes an audible stutter,
        // especially on remote media) — but RNTP's seekTo() resolves before AVPlayer
        // actually finishes seeking, so the coordinator's subsequent PLAY dispatch
        // can land mid-seek and stall the player into Ready/Paused, never emitting
        // State.Playing. Wait for the seek to actually land before returning control
        // to the coordinator.
        await this.waitForSeekToLand(seekPosition);
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

      return { track, playSessionId, position: seekPosition };
    } catch (error) {
      log.error(" Failed to load track:", error as Error);
      // Loading-state recovery is owned by the coordinator now (Task 3b/3c):
      // the coordinator's NATIVE_ERROR handler clears context.isLoadingTrack
      // when this rejection routes the machine to ERROR, and its store bridge
      // pushes that to the store. A direct store._setTrackLoading(false) write
      // here was dead — it ran before the coordinator's subsequent
      // syncStateToStore call, which re-pushed context.isLoadingTrack (still
      // true) right back over it.
      throw error;
    }
  }

  /**
   * Wait for a just-issued TrackPlayer.seekTo(targetPosition) to actually land
   * before resolving, so the coordinator's subsequent PLAY dispatch doesn't
   * race a seek that is still in flight natively (see the seek-then-play
   * comment at the call site in executeLoadTrack).
   *
   * Condition-based polling, not a fixed sleep: checks TrackPlayer.getProgress()
   * every SEEK_LAND_POLL_MS and resolves as soon as the reported position is
   * within SEEK_LAND_TOLERANCE_SECONDS of the target. Gives up after
   * SEEK_LAND_TIMEOUT_MS and resolves anyway — this never throws and never
   * blocks the load indefinitely; the coordinator's load watchdog is the
   * backstop if playback still never confirms.
   *
   * Bails out immediately (no polling at all) if getProgress() throws, returns
   * no progress object, or reports a non-finite position — this is what the
   * global test mock (a bare `jest.fn()`, resolving `undefined`) does by
   * default, so unit tests that load a track don't each pay the full timeout.
   */
  private async waitForSeekToLand(targetPosition: number): Promise<void> {
    const startedAt = Date.now();

    for (;;) {
      let position: number | undefined;
      try {
        const progress = await TrackPlayer.getProgress();
        position = progress?.position;
      } catch (error) {
        log.debug(`[waitForSeekToLand] getProgress() threw, giving up immediately: ${error}`);
        return;
      }

      if (position === undefined || !Number.isFinite(position)) {
        log.debug(
          "[waitForSeekToLand] getProgress() returned no usable position, giving up immediately"
        );
        return;
      }

      if (Math.abs(position - targetPosition) <= SEEK_LAND_TOLERANCE_SECONDS) {
        return;
      }

      if (Date.now() - startedAt >= SEEK_LAND_TIMEOUT_MS) {
        log.warn(
          `[waitForSeekToLand] Seek to ${formatTime(targetPosition)}s did not land within ` +
            `${SEEK_LAND_TIMEOUT_MS}ms (last reported position ${formatTime(position)}s) — ` +
            `proceeding anyway; the coordinator's load watchdog is the backstop`
        );
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, SEEK_LAND_POLL_MS));
    }
  }

  /**
   * Build track list from PlayerTrack.
   */
  async buildTrackList(playerTrack: PlayerTrack): Promise<BuildTrackListResult> {
    const parentSpan = trace.startSpan("player.load.build_track_list", {
      libraryItemId: playerTrack.libraryItemId,
    });

    const tracks: Track[] = [];

    // First, check which files we have locally
    const locallyAvailableFiles = new Set<string>();
    // Tracks repaired paths for files whose stored path was stale (legacy absolute path after
    // iOS container UUID rotation). Used in the second loop to serve the correct URL.
    const repairedPaths = new Map<string, string>(); // audioFileId → repaired path
    for (const audioFile of playerTrack.audioFiles) {
      if (audioFile.downloadInfo?.isDownloaded && audioFile.downloadInfo.downloadPath) {
        const storedPath = audioFile.downloadInfo.downloadPath;
        const fileExists = await verifyFileExists(storedPath);
        if (fileExists) {
          locallyAvailableFiles.add(audioFile.id);
        } else {
          const resolvedPath = resolveAppPath(storedPath);
          log.warn(`File marked as downloaded but missing at stored path: ${resolvedPath}`);

          // Before clearing, check both Documents and Caches using current container paths.
          // This handles legacy absolute stored paths that became stale after an iOS UUID rotation.
          const foundLocation = getAudioFileLocation(playerTrack.libraryItemId, audioFile.filename);
          if (foundLocation !== null) {
            const repairedPath = getDownloadPath(
              playerTrack.libraryItemId,
              audioFile.filename,
              foundLocation
            );
            log.info(`  ✓ Found at ${foundLocation}, repairing path: ${repairedPath}`);
            try {
              await markAudioFileAsDownloaded(audioFile.id, repairedPath);
            } catch (error) {
              log.error("Failed to repair download path in buildTrackList", error as Error);
            }
            repairedPaths.set(audioFile.id, repairedPath);
            locallyAvailableFiles.add(audioFile.id);
          } else {
            // File truly not found in either location — clean up database
            try {
              await clearAudioFileDownloadStatus(audioFile.id);
              log.info(`Cleared download status for missing file: ${audioFile.id}`);
            } catch (error) {
              log.error("Failed to clear download status", error as Error);
            }
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
    }
    // Threaded back via the return value rather than written directly to the
    // store here — the coordinator's context is authoritative and the store is
    // a derived projection kept in sync by the coordinator's bridge, which pushes
    // context.sessionId on every event cycle. A direct store write here would be
    // immediately fought/overwritten by that bridge on the next sync. null means
    // "no active streaming session" (local playback, or the session failed to
    // start) — the coordinator's LOADING handler folds this into context.sessionId.
    const playSessionId = needsStreaming ? (playSession?.id ?? null) : null;

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
      // Only set for streaming tracks — carries the bearer token so it never
      // touches the URL (see header-vs-query-param rationale below).
      let trackHeaders: Record<string, string> | undefined;

      // First, try to use local file if available
      if (locallyAvailableFiles.has(audioFile.id) && audioFile.downloadInfo?.downloadPath) {
        // Use repaired path if the stored path was stale; fall back to resolveAppPath for normal paths
        storedPath = repairedPaths.get(audioFile.id) ?? audioFile.downloadInfo.downloadPath;
        resolvedPath = repairedPaths.has(audioFile.id) ? storedPath : resolveAppPath(storedPath);
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
          // Auth is sent via the Authorization header (below), not a `?token=`
          // query param — access tokens in URLs leak into server access logs,
          // reverse-proxy logs, and native player state. Downloads already use
          // header auth (DownloadService.createDownloadTask); this matches it.
          //
          // Range-request propagation verified for react-native-track-player
          // 4.1.2 on both platforms — headers are NOT re-sent per HTTP request,
          // they're attached once at the player/asset level and apply to every
          // request the native player issues for that track, including
          // byte-range requests triggered by seeking:
          //   - iOS: headers become AVURLAssetHTTPHeaderFieldsKey on the
          //     AVURLAsset at creation time (ios/Pods/SwiftAudioEx/Sources/
          //     SwiftAudioEx/AVPlayerWrapper/AVPlayerWrapper.swift, load()).
          //     Apple docs: this key's headers are used for "all requests"
          //     AVURLAsset issues for that asset. AVPlayerWrapper.seek() calls
          //     avPlayer.seek(to:) on the existing item — it does not recreate
          //     the asset — so the same headers keep applying across seeks.
          //   - Android: headers are set once via
          //     DefaultHttpDataSource.Factory.setDefaultRequestProperties()
          //     in KotlinAudio's BaseAudioPlayer.getMediaSourceFromAudioItem()
          //     (github.com/doublesymmetry/KotlinAudio, v2.1.0 pinned in
          //     node_modules/react-native-track-player/android/build.gradle).
          //     Per ExoPlayer/Media3 docs, default request properties apply to
          //     every HTTP request the factory's DataSource makes, including
          //     the ranged re-opens ExoPlayer issues when seeking outside the
          //     buffered window.
          url = `${cachedApiInfo.baseUrl}${streamingTrack.contentUrl}`;
          trackHeaders = { Authorization: `Bearer ${cachedApiInfo.accessToken}` };
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
        // The access token now travels only in the Authorization header
        // (trackHeaders), never in the URL, so the URL itself is safe to log
        // as-is — no redaction needed. Guard against ever logging the header
        // value: log the url only, never trackHeaders.
        log.info(`Using ${sourceType} file for ${audioFile.filename}: ${url}`);

        tracks.push({
          id: audioFile.id,
          url,
          title: audioFile.tagTitle || audioFile.filename,
          artist: playerTrack.author,
          album: playerTrack.title,
          artwork: playerTrack.coverUri || undefined,
          duration: audioFile.duration || undefined,
          ...(trackHeaders ? { headers: trackHeaders } : {}),
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

    return { tracks, playSessionId };
  }

  /**
   * Rebuild TrackPlayer queue for the given track (pure execution).
   * No coordinator imports, no event dispatches, throws on failure.
   * Called only by the coordinator via IPlayerServiceFacade.executeRebuildQueue.
   *
   * Note: this does not thread buildTrackList's playSessionId back to the
   * caller — a pre-existing gap, not introduced by the recent context-ownership
   * work (the direct store._setPlaySessionId() write buildTrackList used to make
   * was already fought/overwritten by the coordinator's store bridge on the very
   * next sync, so removing that write didn't regress anything).
   *
   * Traced consequence (not merely theoretical — this is reachable): when a
   * streaming rebuild is triggered by NATIVE_PLAYBACK_ERROR's token-rotation path
   * (see the queueStatus='unknown' comment in PlayerStateCoordinator's
   * NATIVE_PLAYBACK_ERROR case), buildTrackList mints a fresh server play
   * session, but because it isn't threaded back here, context.sessionId (and the
   * store's currentPlaySessionId projection) keep the pre-error value.
   * PlayerBackgroundService.handlePlaybackError also calls
   * progressService.endCurrentSession() for that item, so the next
   * NATIVE_TRACK_CHANGED's handleActiveTrackChanged does NOT hit its
   * "session already exists" short-circuit — it reads the stale
   * currentPlaySessionId and passes it as existingServerSessionId into
   * progressService.startSession(), which persists it into the new local
   * session row's serverSessionId column via updateServerSessionId().
   *
   * That column, however, is never read back for anything that talks to the
   * server: the progress-sync outbox (ProgressSyncWorker → createLocalSession)
   * addresses sessions exclusively by the app's own local session UUID
   * (pending.session.id), and the endpoints.ts syncSession()/closeSession()
   * functions that DO address a session by server play-session ID are not
   * called anywhere in this app. So the stale value here can leave a wrong
   * serverSessionId sitting in an otherwise-unread DB column, but it cannot
   * cause progress to sync to, or a session to be closed against, the wrong
   * server-side play session. Confirmed benign — left unthreaded deliberately.
   */
  async executeRebuildQueue(track: PlayerTrack): Promise<ResumePositionInfo> {
    await TrackPlayer.reset();

    const { tracks } = await this.buildTrackList(track);
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
