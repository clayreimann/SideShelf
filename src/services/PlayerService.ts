/**
 * PlayerService - Manages react-native-track-player integration
 *
 * This service handles:
 * - Track player setup and configuration
 * - Local and remote audio file playback
 * - Progress tracking and chapter navigation
 * - Integration with Zustand player store
 */

import { clearAudioFileDownloadStatus } from "@/db/helpers/audioFiles";
import { getChaptersForMedia } from "@/db/helpers/chapters";
import type { AudioFileWithDownloadInfo } from "@/db/helpers/combinedQueries";
import { getAudioFilesWithDownloadInfo } from "@/db/helpers/combinedQueries";
import { getLibraryItemById } from "@/db/helpers/libraryItems";
import { getActiveSession } from "@/db/helpers/localListeningSessions";
import { getMediaMetadataByLibraryItemId } from "@/db/helpers/mediaMetadata";
import { getMediaProgressForLibraryItem } from "@/db/helpers/mediaProgress";
import { getUserByUsername } from "@/db/helpers/users";
import { getApiConfig } from "@/lib/api/api";
import { startPlaySession } from "@/lib/api/endpoints";
import { calculateSmartRewindTime, getJumpBackwardInterval, getJumpForwardInterval, getSmartRewindEnabled } from '@/lib/appSettings';
import { ASYNC_KEYS, getItem as getAsyncItem, saveItem } from "@/lib/asyncStore";
import { getCoverUri } from "@/lib/covers";
import { resolveAppPath, verifyFileExists } from "@/lib/fileSystem";
import { formatTime } from "@/lib/helpers/formatters";
import { logger } from "@/lib/logger";
import { getItem, SECURE_KEYS } from "@/lib/secureStore";
import { progressService } from "@/services/ProgressService";
import { useAppStore } from "@/stores/appStore";
import type { ApiPlaySessionResponse } from "@/types/api";
import type { PlayerTrack } from "@/types/player";
import { AppState } from "react-native";
import TrackPlayer, {
  AndroidAudioContentType,
  AppKilledPlaybackBehavior,
  Capability,
  IOSCategory,
  IOSCategoryMode,
  State,
  Track
} from "react-native-track-player";


const log = logger.forTag("PlayerService"); // Cached sublogger
const diagLog = logger.forDiagnostics("PlayerService"); // Diagnostic logger

/**
 * Reconciliation report interface
 */
interface ReconciliationReport {
  discrepanciesFound: boolean;
  actionsTaken: string[];
  trackMismatch: boolean;
  positionMismatch: boolean;
  rateMismatch: boolean;
  volumeMismatch: boolean;
}

/**
 * Track player service class
 */
export class PlayerService {
  private static instance: PlayerService | null = null;
  private initialized = false;
  private initializationTimestamp = 0;
  private listenersSetup = false;
  private eventSubscriptions: Array<{ remove: () => void }> = [];
  private currentTrack: PlayerTrack | null = null;
  private currentUsername: string | null = null;
  private cachedApiInfo: { baseUrl: string; accessToken: string } | null = null;
  private currentPlaySessionId: string | null = null; // Track the current server session ID
  private lastPauseTime: number | null = null; // Track when playback was paused (for smart rewind)

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): PlayerService {
    if (!PlayerService.instance) {
      PlayerService.instance = new PlayerService();
    }
    return PlayerService.instance;
  }

  /**
   * Reset initialization state (useful for hot-reload scenarios)
   */
  static resetInstance(): void {
    if (PlayerService.instance) {
      PlayerService.instance.cleanup();
      PlayerService.instance = null;
    }
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    // Remove all event listeners
    this.eventSubscriptions.forEach((subscription) => {
      try {
        subscription.remove();
      } catch (error) {
        log.error("Error removing subscription", error as Error);
      }
    });
    this.eventSubscriptions.length = 0; // Clear the array

    this.initialized = false;
    this.listenersSetup = false;
  }

  async printDebugInfo(from: string): Promise<void> {
    try {
      const trackIdx = await TrackPlayer.getActiveTrackIndex();
      const currentTrack = (await TrackPlayer.getQueue())[trackIdx || 0];
      const { position } = await TrackPlayer.getProgress();
      const state = await TrackPlayer.getPlaybackState();
      diagLog.info(
        `${from} Track=${trackIdx} Id=${currentTrack?.id} Title=${currentTrack?.title} Position=${formatTime(position)}, State: ${state.state}`
      );
    } catch (diagError) {
      diagLog.error(
        "Error fetching TrackPlayer state",
        diagError as Error
      );
    }
  }

  /**
   * Initialize the track player
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      log.info("Already initialized, skipping");
      // Diagnostic: log current track, position, playing state
      await this.printDebugInfo("initialize");
      return;
    }

    try {
      log.info("Initializing track player");

      // Check if player is already set up (e.g., during hot reload)
      try {
        const state = await TrackPlayer.getPlaybackState();
        log.info("Track player already exists, reusing existing instance");

        // Player exists, just set up our event listeners
        this.initialized = true;
        this.initializationTimestamp = Date.now();
        log.info("Reused existing track player successfully");
        return;
      } catch (checkError) {
        // Player doesn't exist yet, continue with setup
        log.info("No existing player found, setting up new instance");
      }

      await TrackPlayer.setupPlayer({
        // iOS specific options
        iosCategory: IOSCategory.Playback,
        iosCategoryMode: IOSCategoryMode.SpokenAudio,
        iosCategoryOptions: [],

        // Android specific options
        androidAudioContentType: AndroidAudioContentType.Speech,
      });
      await this.configureTrackPlayer();

      // Set up event listeners

      this.initialized = true;
      this.initializationTimestamp = Date.now();
      log.info("Track player initialized successfully");
    } catch (error) {
      // Handle the specific "already initialized" error gracefully
      if (
        error instanceof Error &&
        error.message.includes("already been initialized")
      ) {
        log.info(
          "Player was already initialized elsewhere, setting up listeners"
        );
        try {
          // Set up our event listeners on the existing player
          this.initialized = true;
          this.initializationTimestamp = Date.now();
          log.info("Successfully attached to existing player");
          return;
        } catch (attachError) {
          log.error(
            "Failed to attach to existing player",
            attachError as Error
          );
        }
      }

      log.error("Failed to initialize track player", error as Error);
      throw error;
    }
  }

  /**
   * Load and play a track
   * @param libraryItemId - The library item ID to play
   * @param episodeId - Optional episode ID for podcast episodes (future use)
   */
  async playTrack(libraryItemId: string, episodeId?: string): Promise<void> {
    try {
      diagLog.info(
        `playTrack called for libraryItemId: ${libraryItemId}`
      );
      // Diagnostic: log current track, position, playing state before loading
      await this.printDebugInfo("playTrack::init");
      log.info(`Loading track for library item: ${libraryItemId}`);

      // Get username from secure storage
      const username = await getItem(SECURE_KEYS.username);
      if (!username) {
        throw new Error("No authenticated user found");
      }

      // Get user from database
      const user = await getUserByUsername(username);
      if (!user?.id) {
        throw new Error("User not found in database");
      }

      // Check if already playing this item - if so, just resume
      if (this.currentTrack?.libraryItemId === libraryItemId) {
        const state = await TrackPlayer.getPlaybackState();
        const queue = await TrackPlayer.getQueue();

        // Only short-circuit if we actually have tracks in the queue
        if (queue.length > 0) {
          if (state.state === State.Playing) {
            log.info("Already playing this item");
            return;
          } else if (state.state === State.Paused) {
            log.info("Resuming paused playback");
            await TrackPlayer.play();
            return;
          }
        } else {
          // Queue is empty even though we have a currentTrack - need to reload
          log.warn("Current track set but queue is empty - reloading track");
        }
      }

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
        coverUri: metadata.imageUrl || getCoverUri(libraryItem.id),
        audioFiles,
        chapters,
        duration: audioFiles.reduce(
          (total: number, file: AudioFileWithDownloadInfo) =>
            total + (file.duration || 0),
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
        // Provide more detailed error information
        const hasDownloadedFiles = track.audioFiles.some(
          (af) => af.downloadInfo?.isDownloaded
        );

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
            downloadedFiles: track.audioFiles.filter(
              (af) => af.downloadInfo?.isDownloaded
            ).length,
            needsStreaming,
          })}`
        );

        throw new Error(errorMessage);
      }

      // Store current track and username for session tracking
      this.currentTrack = track;
      this.currentUsername = username;

      // Update store with new track (this also sets loading state)
      const store = useAppStore.getState();
      store._setCurrentTrack(track);
      store._setTrackLoading(true);

      // Add tracks to queue
      await TrackPlayer.add(tracks);

      // Get resume position using priority: activeSession > savedProgress > AsyncStorage
      let resumePosition = 0;
      const activeSession = await getActiveSession(user.id, libraryItemId);
      const savedProgress = await getMediaProgressForLibraryItem(
        libraryItemId,
        user.id
      );
      const asyncStoragePosition = await getAsyncItem(ASYNC_KEYS.position) as number | null;

      // Priority order: activeSession > savedProgress > AsyncStorage
      if (activeSession) {
        resumePosition = activeSession.currentTime;
        log.info(`Resuming from active session: ${resumePosition}s`);
      } else if (savedProgress?.currentTime) {
        resumePosition = savedProgress.currentTime;
        log.info(`Resuming from saved progress: ${resumePosition}s`);
      } else if (asyncStoragePosition !== null && asyncStoragePosition !== undefined) {
        resumePosition = asyncStoragePosition;
        log.info(`Resuming from AsyncStorage: ${resumePosition}s`);
      }

      // Sync AsyncStorage to match DB value (DB is source of truth)
      if (resumePosition > 0) {
        // Use DB value if available, otherwise keep AsyncStorage value
        const positionToSync = activeSession?.currentTime || savedProgress?.currentTime || resumePosition;
        if (positionToSync !== asyncStoragePosition) {
          await saveItem(ASYNC_KEYS.position, positionToSync);
          log.info(`Synced AsyncStorage position to DB value: ${positionToSync}s`);
        }
        await TrackPlayer.seekTo(resumePosition);
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

      // Start playback - background service will handle session tracking
      await TrackPlayer.play();

      // Diagnostic: log current track, position, playing state after loading
      await this.printDebugInfo("playTrack::done");
      log.info("Track loaded and playing");
    } catch (error) {
      log.error(" Failed to load track:", error as Error);
      // Clear loading state on error
      const store = useAppStore.getState();
      store._setTrackLoading(false);
      throw error;
    }
  }

  /**
   * Toggle play/pause
   */
  async togglePlayPause(): Promise<void> {
    const state = await TrackPlayer.getPlaybackState();

    if (state.state === State.Playing) {
      await this.pause();
    } else {
      await this.play();
    }
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    this.lastPauseTime = Date.now();
    log.info(`Pausing playback at ${new Date(this.lastPauseTime).toISOString()}`);
    await TrackPlayer.pause();
  }

  /**
   * Resume playback with optional smart rewind
   */
  async play(): Promise<void> {
    // If currentTrack is null but we should have one (e.g., streaming media not restored),
    // try to rebuild it before playing
    if (!this.currentTrack) {
      await this.rebuildCurrentTrackIfNeeded();
    }

    // Check if smart rewind is enabled and apply it
    const smartRewindEnabled = await getSmartRewindEnabled();

    if (smartRewindEnabled) {
      await this.smartRewind();
    }

    // Clear pause time since we're resuming
    this.lastPauseTime = null;
    await TrackPlayer.play();
  }

  /**
   * Rebuild currentTrack if it's missing but should exist
   * Handles case where streaming media wasn't restored but playback should resume
   */
  private async rebuildCurrentTrackIfNeeded(): Promise<void> {
    try {
      // First, try to get libraryItemId from playerSlice
      const store = useAppStore.getState();
      const playerSliceTrack = store.player.currentTrack;

      let libraryItemId: string | null = null;

      if (playerSliceTrack) {
        libraryItemId = playerSliceTrack.libraryItemId;
        log.info(`Rebuilding currentTrack from playerSlice for ${libraryItemId}`);

        // Restore from playerSlice - it already has all the track info
        this.currentTrack = playerSliceTrack;
        return;
      }

      // If playerSlice doesn't have it, try ProgressService session
      const session = progressService.getCurrentSession();
      if (session) {
        libraryItemId = session.libraryItemId;
        log.info(`Rebuilding currentTrack from ProgressService session for ${libraryItemId}`);

        // We need to rebuild the full track - but for streaming, we might not have all files
        // Try to get it from playerSlice first, or rebuild minimal version
        if (!this.currentTrack && libraryItemId) {
          // Try to restore from session (this will only work for downloaded media)
          // For streaming, we need to rely on playTrack() being called or playerSlice having the track
          log.info(`Cannot fully rebuild streaming track without playTrack() - currentTrack will remain null`);
          // Don't throw - TrackPlayer can still play even if currentTrack is null
        }
      }

      // If we still don't have a track and TrackPlayer has tracks, log warning
      if (!this.currentTrack) {
        const queue = await TrackPlayer.getQueue();
        if (queue.length > 0) {
          log.warn(`TrackPlayer has tracks but currentTrack is null - some features may not work correctly`);
        }
      }
    } catch (error) {
      log.error('Failed to rebuild currentTrack', error as Error);
      // Don't throw - playback can still proceed
    }
  }

  /**
   * Smart rewind
   */
  async smartRewind(): Promise<void> {
    let lastPlayedTime: number | null = null;

    // First, try to use the in-memory pause time from current session
    if (this.lastPauseTime) {
      lastPlayedTime = this.lastPauseTime;
      log.info(`Using current session pause time for smart rewind: ${new Date(lastPlayedTime).toISOString()}`);
    } else if (this.currentTrack?.libraryItemId && this.currentUsername) {
      // Cold boot scenario - check the database for last played time
      try {
        const user = await getUserByUsername(this.currentUsername);
        if (user?.id) {
          const activeSession = await getActiveSession(user.id, this.currentTrack.libraryItemId);
          const savedProgress = await getMediaProgressForLibraryItem(
            this.currentTrack.libraryItemId,
            user.id
          );

          // Use whichever was updated most recently
          if (activeSession && savedProgress?.lastUpdate) {
            const sessionTime = activeSession.updatedAt.getTime();
            const progressTime = savedProgress.lastUpdate.getTime();

            if (sessionTime > progressTime) {
              lastPlayedTime = sessionTime;
              log.info(`Using active session update time for smart rewind: ${new Date(lastPlayedTime).toISOString()}`);
            } else {
              lastPlayedTime = progressTime;
              log.info(`Using saved progress update time for smart rewind: ${new Date(lastPlayedTime).toISOString()}`);
            }
          } else if (activeSession) {
            lastPlayedTime = activeSession.updatedAt.getTime();
            log.info(`Using active session update time for smart rewind: ${new Date(lastPlayedTime).toISOString()}`);
          } else if (savedProgress?.lastUpdate) {
            lastPlayedTime = savedProgress.lastUpdate.getTime();
            log.info(`Using saved progress update time for smart rewind: ${new Date(lastPlayedTime).toISOString()}`);
          }
        }
      } catch (error) {
        log.error('Failed to get last played time from database for smart rewind', error as Error);
      }
    }

    // Apply smart rewind if we have a last played time
    if (lastPlayedTime) {
      const rewindSeconds = calculateSmartRewindTime(lastPlayedTime);
      if (rewindSeconds > 0) {
        const currentPosition = await TrackPlayer.getProgress();
        const newPosition = Math.max(0, currentPosition.position - rewindSeconds);
        log.info(`Smart rewind: jumping back ${rewindSeconds}s (from ${formatTime(currentPosition.position)} to ${formatTime(newPosition)})`);
        await TrackPlayer.seekTo(newPosition);
      }
    }
  }

  /**
   * Seek to position in seconds
   */
  async seekTo(position: number): Promise<void> {
    await TrackPlayer.seekTo(position);
  }

  /**
   * Set playback rate
   */
  async setRate(rate: number): Promise<void> {
    await TrackPlayer.setRate(rate);
  }

  /**
   * Set volume (0.0 to 1.0)
   */
  async setVolume(volume: number): Promise<void> {
    await TrackPlayer.setVolume(volume);
  }

  /**
   * Stop playback and clear queue
   */
  async stop(): Promise<void> {
    // PlayerBackgroundService will handle ending the session
    await TrackPlayer.stop();
    await TrackPlayer.reset();

    this.currentTrack = null;
    this.currentUsername = null;
    this.clearPlaySessionId(); // Clear the session ID when stopping
  }

  /**
   * Build track list from PlayerTrack
   */
  private async buildTrackList(playerTrack: PlayerTrack): Promise<Track[]> {
    const tracks: Track[] = [];

    // First, check which files we have locally
    const locallyAvailableFiles = new Set<string>();
    for (const audioFile of playerTrack.audioFiles) {
      if (
        audioFile.downloadInfo?.isDownloaded &&
        audioFile.downloadInfo.downloadPath
      ) {
        const storedPath = audioFile.downloadInfo.downloadPath;
        const fileExists = await verifyFileExists(storedPath);
        if (fileExists) {
          locallyAvailableFiles.add(audioFile.id);
        } else {
          const resolvedPath = resolveAppPath(storedPath);
          log.warn(
            `File marked as downloaded but missing: ${resolvedPath}`
          );

          // Clean up database
          try {
            await clearAudioFileDownloadStatus(audioFile.id);
            log.info(
              `Cleared download status for missing file: ${audioFile.id}`
            );
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

    if (needsStreaming) {
      try {
        playSession = await startPlaySession(playerTrack.libraryItemId);
        this.currentPlaySessionId = playSession.id; // Store session ID for progress tracking
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
    }

    // Get API info once for all streaming URLs
    if (playSession && !this.cachedApiInfo) {
      this.cachedApiInfo = this.getApiInfo();
    }

    // Process each audio file in a single loop
    for (const audioFile of playerTrack.audioFiles) {
      let url: string | undefined;
      let sourceType: "local" | "streaming" = "local";

      // First, try to use local file if available
      if (
        locallyAvailableFiles.has(audioFile.id) &&
        audioFile.downloadInfo?.downloadPath
      ) {
        url = resolveAppPath(audioFile.downloadInfo.downloadPath);
        sourceType = "local";
      }
      // If no local file, try streaming
      else if (playSession && playSession.audioTracks.length > 0) {
        const streamingTrack = playSession.audioTracks.find(
          (track) =>
            track.metadata.filename === audioFile.filename ||
            track.index === audioFile.index
        );

        if (streamingTrack && this.cachedApiInfo) {
          const separator = streamingTrack.contentUrl.includes("?") ? "&" : "?";
          url = `${this.cachedApiInfo.baseUrl}${streamingTrack.contentUrl}${separator}token=${this.cachedApiInfo.accessToken}`;
          sourceType = "streaming";
        }
      }

      // Add track if we have a valid URL
      if (url) {
        const displayUrl =
          sourceType === "streaming"
            ? url.replace(this.cachedApiInfo?.accessToken || "", "<token>")
            : url;
        log.info(
          `Using ${sourceType} file for ${audioFile.filename}: ${displayUrl}`
        );

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

    return tracks;
  }

  /**
   * Get base URL and access token from API config
   */
  private getApiInfo(): { baseUrl: string; accessToken: string } | null {
    const config = getApiConfig();
    if (!config) {
      log.error(" API config not available");
      return null;
    }

    const baseUrl = config.getBaseUrl();
    const accessToken = config.getAccessToken();

    if (!baseUrl || !accessToken) {
      log.error(" Missing base URL or access token");
      return null;
    }

    return { baseUrl, accessToken };
  }

  /**
   * Get the current play session ID (for progress tracking)
   */
  getCurrentPlaySessionId(): string | null {
    return this.currentPlaySessionId;
  }

  /**
   * Clear the current play session ID
   */
  clearPlaySessionId(): void {
    this.currentPlaySessionId = null;
  }

  /**
   * Get the current track (for PlayerBackgroundService)
   */
  getCurrentTrack(): PlayerTrack | null {
    return this.currentTrack;
  }

  /**
   * Get the current library item ID (for session rehydration)
   */
  getCurrentLibraryItemId(): string | null {
    return this.currentTrack?.libraryItemId || null;
  }

  /**
   * Get the initialization timestamp (for detecting context recreation)
   */
  getInitializationTimestamp(): number {
    return this.initializationTimestamp;
  }

  /**
   * Restore PlayerService state from ProgressService session
   * Repopulates currentTrack and currentUsername from database session
   */
  async restorePlayerServiceFromSession(): Promise<void> {
    try {
      const session = progressService.getCurrentSession();

      if (!session) {
        log.info('No active session found, skipping PlayerService restoration');
        return;
      }

      log.info(`Restoring PlayerService from session: ${session.libraryItemId}`);

      // Restore username from secure store or session context
      const username = await getItem(SECURE_KEYS.username);
      if (username) {
        this.currentUsername = username;
      }

      // Try to restore minimal track info - just enough to allow playTrack() to rebuild later
      // Only load full track if we have downloaded files (works for downloaded media)
      // For streaming media, playTrack() will rebuild the full track when called
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
        const hasDownloadedFiles = audioFiles.some(
          (file: AudioFileWithDownloadInfo) => file.downloadInfo?.isDownloaded
        );

        if (hasDownloadedFiles && audioFiles.length > 0) {
          // For downloaded media, restore full track
          const chapters = await getChaptersForMedia(metadata.id);

          const track: PlayerTrack = {
            libraryItemId: libraryItem.id,
            mediaId: metadata.id,
            title: metadata.title || 'Unknown Title',
            author: metadata.authorName || metadata.author || 'Unknown Author',
            coverUri: metadata.imageUrl || getCoverUri(libraryItem.id),
            audioFiles,
            chapters,
            duration: audioFiles.reduce(
              (total: number, file: AudioFileWithDownloadInfo) =>
                total + (file.duration || 0),
              0
            ),
            isDownloaded: true,
          };

          this.currentTrack = track;
          log.info(`Restored PlayerService track: ${track.title}`);
        } else {
          // For streaming media, we can't fully restore the track without opening a new play session
          // The track will be rebuilt when:
          // 1. User calls playTrack() - will rebuild fully with new play session
          // 2. User calls play() - will restore from playerSlice if available (see rebuildCurrentTrackIfNeeded)
          log.info(`Session is for streaming media - track will be rebuilt on playTrack() or restored from playerSlice on play()`);
          // Don't set currentTrack here - it will be restored from playerSlice in play() if available
        }
      } catch (error) {
        log.error('Failed to restore currentTrack from session', error as Error);
        // Don't throw - username restoration is still useful
      }
    } catch (error) {
      log.error('Failed to restore PlayerService from session', error as Error);
    }
  }

  /**
   * Verify that TrackPlayer state matches store state
   */
  async verifyConnection(): Promise<boolean> {
    try {
      const store = useAppStore.getState();
      const [state, currentTrack, progress] = await Promise.all([
        TrackPlayer.getPlaybackState(),
        TrackPlayer.getActiveTrack(),
        TrackPlayer.getProgress(),
      ]);

      // Check if track matches
      const trackMatches =
      (!currentTrack && !store.player.currentTrack) ||
      (currentTrack as any)?.id.startsWith(store.player.currentTrack?.libraryItemId || "");

      // Check if position is roughly the same (within 5 seconds)
      const positionMatches =
        !store.player.position ||
        Math.abs(progress.position - store.player.position) < 5;

      // Check if playing state matches
      const playingMatches =
        (state.state === State.Playing) === store.player.isPlaying;

      const isConnected = trackMatches && positionMatches && playingMatches;

      if (!isConnected) {
        log.warn(
          `Connection mismatch - Track: ${trackMatches ? "match" : "mismatch"}, Position: ${positionMatches ? "match" : "mismatch"}, Playing: ${playingMatches ? "match" : "mismatch"}`
        );
        if (!trackMatches) {
          diagLog.info(`From TrackPlayer: ${JSON.stringify(currentTrack)}\n\nFrom store: ${JSON.stringify(store.player.currentTrack)}}`)
        }
        if (!positionMatches) {
          diagLog.info(`From store position: ${store.player.position}, from TrackPlayer position: ${progress.position}`);
        }
        if (!playingMatches) {
          diagLog.info(`From store isPlaying: ${store.player.isPlaying}, from TrackPlayer state: ${state.state}`);
        }
      } else {
        log.info("Player connection verified OK");
      }

      return isConnected;
    } catch (error) {
      log.error("Error verifying connection", error as Error);
      return false;
    }
  }

  /**
   * Reconcile TrackPlayer state with JS state (playerSlice and ProgressService)
   * Detects and fixes discrepancies between native and JS layers
   */
  async reconcileTrackPlayerState(): Promise<ReconciliationReport> {
    const report: ReconciliationReport = {
      discrepanciesFound: false,
      actionsTaken: [],
      trackMismatch: false,
      positionMismatch: false,
      rateMismatch: false,
      volumeMismatch: false,
    };

    try {
      const store = useAppStore.getState();

      // Query TrackPlayer state
      const [tpState, tpQueue, tpCurrentTrack, tpProgress, tpRate, tpVolume] = await Promise.all([
        TrackPlayer.getPlaybackState(),
        TrackPlayer.getQueue(),
        TrackPlayer.getActiveTrack(),
        TrackPlayer.getProgress(),
        TrackPlayer.getRate(),
        TrackPlayer.getVolume(),
      ]);

      const hasTracks = tpQueue.length > 0;
      const tpPosition = tpProgress.position;
      const tpIsPlaying = tpState.state === State.Playing;

      // Get DB session as source of truth for position
      const dbSession = progressService.getCurrentSession();
      const dbPosition = dbSession?.currentTime ?? store.player.position;

      // 1. Check track mismatch
      if (hasTracks && !store.player.currentTrack) {
        report.trackMismatch = true;
        report.discrepanciesFound = true;
        // TrackPlayer has tracks but playerSlice doesn't - try to rehydrate
        if (tpCurrentTrack && this.currentTrack) {
          store._setCurrentTrack(this.currentTrack);
          report.actionsTaken.push('Restored currentTrack from PlayerService');
        } else if (dbSession) {
          // Try to restore track from DB session
          try {
            const libraryItem = await getLibraryItemById(dbSession.libraryItemId);
            if (libraryItem) {
              // Can't fully restore PlayerTrack here without more data, but we can note it
              report.actionsTaken.push(`Found DB session for ${dbSession.libraryItemId} but cannot restore track without metadata`);
            }
          } catch (error) {
            log.error('Failed to load library item for reconciliation', error as Error);
          }
        }
      }

      // 2. Check position mismatch (>5s difference)
      const positionDiff = Math.abs(tpPosition - dbPosition);
      if (positionDiff > 5) {
        report.positionMismatch = true;
        report.discrepanciesFound = true;
        // Use DB position as authoritative source
        log.info(`Position mismatch detected: TrackPlayer=${tpPosition.toFixed(2)}s, DB=${dbPosition.toFixed(2)}s, diff=${positionDiff.toFixed(2)}s`);
        if (hasTracks) {
          await TrackPlayer.seekTo(dbPosition);
          store.updatePosition(dbPosition);
          report.actionsTaken.push(`Adjusted TrackPlayer position to DB value: ${dbPosition.toFixed(2)}s`);
        }
      }

      // 3. Check playback rate mismatch
      if (Math.abs(tpRate - store.player.playbackRate) > 0.01) {
        report.rateMismatch = true;
        report.discrepanciesFound = true;
        await TrackPlayer.setRate(store.player.playbackRate);
        report.actionsTaken.push(`Applied playback rate from store: ${store.player.playbackRate}`);
      }

      // 4. Check volume mismatch
      if (Math.abs(tpVolume - store.player.volume) > 0.01) {
        report.volumeMismatch = true;
        report.discrepanciesFound = true;
        await TrackPlayer.setVolume(store.player.volume);
        report.actionsTaken.push(`Applied volume from store: ${store.player.volume}`);
      }

      // 5. Check playing state mismatch
      if (tpIsPlaying !== store.player.isPlaying) {
        report.discrepanciesFound = true;
        store.updatePlayingState(tpIsPlaying);
        report.actionsTaken.push(`Synced playing state from TrackPlayer: ${tpIsPlaying}`);
      }

      if (report.discrepanciesFound) {
        log.info(`Reconciliation completed with ${report.actionsTaken.length} actions: ${report.actionsTaken.join(', ')}`);
      } else {
        log.info('Reconciliation: No discrepancies found, state is in sync');
      }

      return report;
    } catch (error) {
      log.error('Error during reconciliation', error as Error);
      report.discrepanciesFound = true;
      report.actionsTaken.push(`Error: ${(error as Error).message}`);
      return report;
    }
  }

  /**
   * Sync store state with TrackPlayer state
   */
  async syncStoreWithTrackPlayer(): Promise<void> {
    try {
      log.info("Syncing store with TrackPlayer");

      const store = useAppStore.getState();
      const [state, currentTrack, progress] = await Promise.all([
        TrackPlayer.getPlaybackState(),
        TrackPlayer.getActiveTrack(),
        TrackPlayer.getProgress(),
      ]);

      // Update position
      store.updatePosition(progress.position);

      // Note: Playing state is updated by PlayerBackgroundService event listeners

      // If current track in TrackPlayer doesn't match store, update store
      if (
        currentTrack &&
        (currentTrack as any).id !== store.player.currentTrack?.libraryItemId
      ) {
        // Find the track info from our current track
        const trackInfo = this.getCurrentTrack();
        if (trackInfo) {
          store._setCurrentTrack(trackInfo);
        }
      }

      log.info("Store synced with TrackPlayer successfully");
    } catch (error) {
      log.error("Error syncing store with TrackPlayer", error as Error);
    }
  }

  async configureTrackPlayer(): Promise<void> {
    log.info("Configuring TrackPlayer options");

    // Load jump intervals from settings
    const [forwardInterval, backwardInterval] = await Promise.all([
      getJumpForwardInterval(),
      getJumpBackwardInterval(),
    ]);

    log.info(`Configuring jump intervals: forward=${forwardInterval}s, backward=${backwardInterval}s`);

    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SeekTo,
        Capability.JumpBackward,
        Capability.JumpForward,
      ],
      compactCapabilities: [Capability.Play, Capability.Pause],
      forwardJumpInterval: forwardInterval,
      backwardJumpInterval: backwardInterval,
      progressUpdateEventInterval: 1, // Update every second
    });
  }

  /**
   * Reconnect background service and sync state
   *
   * This method handles reconnection after app updates, hot reloads, or JS context recreation.
   * It safely loads the background service module and attempts reconnection, falling back
   * to a full re-registration if the module has changed (e.g., after an app update).
   */
  async reconnectBackgroundService(): Promise<void> {
    try {
      log.info("Reconnecting background service");
      const runtimeParts: string[] = [];
      runtimeParts.push(
        typeof globalThis.window === "undefined" ? "no-window" : "window"
      );
      runtimeParts.push(
        typeof globalThis.document === "undefined" ? "no-document" : "document"
      );
      try {
        runtimeParts.push(`AppState=${AppState.currentState ?? "unknown"}`);
      } catch {
        runtimeParts.push("AppState=unavailable");
      }
      diagLog.info(
        `PlayerService reconnect runtime: ${runtimeParts.join(" ")}`
      );

      // Try to load the background service module
      // Using require() here to handle dynamic loading
      let PlayerBackgroundServiceModule;

      try {
        // Clear the require cache for this module to ensure we get the latest version
        // This is important after app updates where the module might have changed. Hermes
        // doesn't expose Node's require.resolve / require.cache, so guard their usage.
        const metroRequire = require as {
          resolve?: (path: string) => string;
          cache?: Record<string, unknown>;
        };
        const canResolve =
          typeof require === "function" &&
          typeof metroRequire.resolve === "function";
        const cache =
          typeof require === "function" ? metroRequire.cache : undefined;

        if (canResolve && metroRequire.resolve) {
          const modulePath = metroRequire.resolve("./PlayerBackgroundService");
          if (__DEV__) {
            log.debug(`Module path: ${modulePath}`);
          }

          // Delete from cache in development to ensure we get fresh code
          if (__DEV__ && cache && cache[modulePath]) {
            log.debug("Clearing module cache for PlayerBackgroundService");
            delete cache[modulePath];
          }
        } else if (__DEV__) {
          log.debug("require.resolve not available; skipping cache clear");
        }

        PlayerBackgroundServiceModule = require("./PlayerBackgroundService");
      } catch (requireError) {
        log.error(
          "Failed to require PlayerBackgroundService module",
          requireError as Error
        );

        // If we can't load the module, try to force a full re-registration
        log.warn("Attempting full TrackPlayer service re-registration");
        TrackPlayer.registerPlaybackService(() =>
          require("./PlayerBackgroundService")
        );
        await this.syncStoreWithTrackPlayer();
        return;
      }

      // Check if the reconnect function exists
      const reconnectFn =
        PlayerBackgroundServiceModule.reconnectBackgroundService;
      const isInitialized =
        PlayerBackgroundServiceModule.isBackgroundServiceInitialized?.();

      if (typeof reconnectFn === "function") {
        log.info(`Background service initialized: ${isInitialized}`);
        if (isInitialized) {
          reconnectFn();
        } else {
          log.warn(
            "Background service not initialized; forcing TrackPlayer service re-registration instead of reconnect"
          );
          TrackPlayer.registerPlaybackService(() =>
            require("./PlayerBackgroundService")
          );
        }
      } else {
        // Function doesn't exist (old version or incompatible module)
        log.warn(
          "reconnectBackgroundService function not found - forcing full re-registration"
        );

        // Shutdown if the function exists
        if (
          typeof PlayerBackgroundServiceModule.shutdownBackgroundService ===
          "function"
        ) {
          PlayerBackgroundServiceModule.shutdownBackgroundService();
        }

        // Force re-registration
        TrackPlayer.registerPlaybackService(() =>
          require("./PlayerBackgroundService")
        );
      }

      await this.configureTrackPlayer();

      // Sync the store with TrackPlayer state
      await this.syncStoreWithTrackPlayer();

      log.info("Background service reconnection complete");
    } catch (error) {
      log.error("Error reconnecting background service", error as Error);

      // Last resort: try to sync state anyway
      try {
        await this.syncStoreWithTrackPlayer();
      } catch (syncError) {
        log.error(
          "Failed to sync store after reconnection error",
          syncError as Error
        );
      }
    }
  }
}

// Export singleton instance
export const playerService = PlayerService.getInstance();
