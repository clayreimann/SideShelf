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
import { getCoverUri } from "@/lib/covers";
import { resolveAppPath, verifyFileExists } from "@/lib/fileSystem";
import { logger } from "@/lib/logger";
import { getItem, SECURE_KEYS } from "@/lib/secureStore";
import { useAppStore } from "@/stores/appStore";
import type { ApiPlaySessionResponse } from "@/types/api";
import type { PlayerTrack } from "@/types/player";
import TrackPlayer, {
  AndroidAudioContentType,
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  IOSCategory,
  IOSCategoryMode,
  PlaybackErrorEvent,
  PlaybackQueueEndedEvent,
  PlaybackState,
  State,
  Track,
} from "react-native-track-player";

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
  private log = logger.forTag("PlayerService"); // Cached sublogger

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
        this.log.error("Error removing subscription", error as Error);
      }
    });
    this.eventSubscriptions.length = 0; // Clear the array

    this.initialized = false;
    this.listenersSetup = false;
  }

  /**
   * Initialize the track player
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.log.info("Already initialized, skipping");
      return;
    }

    try {
      this.log.info("Initializing track player");

      // Check if player is already set up (e.g., during hot reload)
      try {
        const state = await TrackPlayer.getPlaybackState();
        this.log.info("Track player already exists, reusing existing instance");

        // Player exists, just set up our event listeners
        this.setupEventListeners();
        this.initialized = true;
        this.initializationTimestamp = Date.now();
        this.log.info("Reused existing track player successfully");
        return;
      } catch (checkError) {
        // Player doesn't exist yet, continue with setup
        this.log.info("No existing player found, setting up new instance");
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
      this.setupEventListeners();

      this.initialized = true;
      this.initializationTimestamp = Date.now();
      this.log.info("Track player initialized successfully");
    } catch (error) {
      // Handle the specific "already initialized" error gracefully
      if (
        error instanceof Error &&
        error.message.includes("already been initialized")
      ) {
        this.log.info(
          "Player was already initialized elsewhere, setting up listeners"
        );
        try {
          // Set up our event listeners on the existing player
          this.setupEventListeners();
          this.initialized = true;
          this.initializationTimestamp = Date.now();
          this.log.info("Successfully attached to existing player");
          return;
        } catch (attachError) {
          this.log.error(
            "Failed to attach to existing player",
            attachError as Error
          );
        }
      }

      this.log.error("Failed to initialize track player", error as Error);
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
      this.log.info(`Loading track for library item: ${libraryItemId}`);

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
        if (state.state === State.Playing) {
          this.log.info("Already playing this item");
          return;
        } else if (state.state === State.Paused) {
          this.log.info("Resuming paused playback");
          await TrackPlayer.play();
          return;
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

      this.log.info(`Built track: ${track.title}`);

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

        this.log.error(
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

      // Get resume position (use whichever was updated most recently)
      let resumePosition = 0;
      const activeSession = await getActiveSession(user.id, libraryItemId);
      const savedProgress = await getMediaProgressForLibraryItem(
        libraryItemId,
        user.id
      );

      if (activeSession && savedProgress) {
        // Both exist - use whichever was updated more recently
        const sessionTime = activeSession.updatedAt.getTime();
        const progressTime = savedProgress.lastUpdate
          ? savedProgress.lastUpdate.getTime()
          : 0;

        if (sessionTime > progressTime) {
          resumePosition = activeSession.currentTime;
          this.log.info(
            ` Resuming from active session (more recent): ${resumePosition}s`
          );
        } else {
          resumePosition = savedProgress.currentTime || 0;
          this.log.info(
            ` Resuming from saved progress (more recent): ${resumePosition}s`
          );
        }
      } else if (activeSession) {
        resumePosition = activeSession.currentTime;
        this.log.info(` Resuming from active session: ${resumePosition}s`);
      } else if (savedProgress) {
        resumePosition = savedProgress.currentTime || 0;
        if (resumePosition > 0) {
          this.log.info(` Resuming from saved progress: ${resumePosition}s`);
        }
      }

      if (resumePosition > 0) {
        await TrackPlayer.seekTo(resumePosition);
      }

      // Start playback - background service will handle session tracking
      await TrackPlayer.play();

      this.log.info("Track loaded and playing");
    } catch (error) {
      this.log.error(" Failed to load track:", error as Error);
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
      await TrackPlayer.pause();
    } else {
      await TrackPlayer.play();
    }
  }

  /**
   * Pause playback
   */
  async pause(): Promise<void> {
    await TrackPlayer.pause();
  }

  /**
   * Resume playback
   */
  async play(): Promise<void> {
    await TrackPlayer.play();
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
          this.log.warn(
            `File marked as downloaded but missing: ${resolvedPath}`
          );

          // Clean up database
          try {
            await clearAudioFileDownloadStatus(audioFile.id);
            this.log.info(
              `Cleared download status for missing file: ${audioFile.id}`
            );
          } catch (error) {
            this.log.error("Failed to clear download status", error as Error);
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
        this.log.info(`Started play session: ${playSession.id}`);
        this.log.info(
          `Got streaming tracks: ${playSession.audioTracks.length}`
        );

        if (playSession.audioTracks.length > 0) {
          this.log.info(
            `Sample streaming track: ${JSON.stringify({
              contentUrl: playSession.audioTracks[0].contentUrl,
              filename: playSession.audioTracks[0].metadata.filename,
              mimeType: playSession.audioTracks[0].mimeType,
            })}`
          );
        }
      } catch (error) {
        this.log.error("Failed to start play session", error as Error);
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
        this.log.info(
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
        this.log.warn(`No playable source found for: ${audioFile.filename}`);
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
      this.log.error(" API config not available");
      return null;
    }

    const baseUrl = config.getBaseUrl();
    const accessToken = config.getAccessToken();

    if (!baseUrl || !accessToken) {
      this.log.error(" Missing base URL or access token");
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
   * Set up event listeners
   */
  private setupEventListeners(): void {
    if (this.listenersSetup) {
      this.log.info("Event listeners already set up, skipping");
      return;
    }

    this.log.info("Setting up event listeners");
    this.listenersSetup = true;

    // Playback state changes
    this.eventSubscriptions.push(
      TrackPlayer.addEventListener(
        Event.PlaybackState,
        this.onPlaybackStateChanged.bind(this)
      )
    );

    // Playback errors
    this.eventSubscriptions.push(
      TrackPlayer.addEventListener(
        Event.PlaybackError,
        this.onPlaybackError.bind(this)
      )
    );

    // Queue ended
    this.eventSubscriptions.push(
      TrackPlayer.addEventListener(
        Event.PlaybackQueueEnded,
        this.onPlaybackEnded.bind(this)
      )
    );
  }

  onPlaybackStateChanged(event: PlaybackState) {
    // Just log the state string value directly
    this.log.info(`Playback state changed: ${event.state}`);
    // PlayerBackgroundService handles store updates
  }

  onPlaybackError(event: PlaybackErrorEvent) {
    this.log.error(`Playback error: ${JSON.stringify(event)}`);
    // PlayerBackgroundService handles store updates
  }

  onPlaybackEnded(event: PlaybackQueueEndedEvent) {
    this.log.info("Playback ended");
    // PlayerBackgroundService handles store updates
  }

  /**
   * Get the initialization timestamp (for detecting context recreation)
   */
  getInitializationTimestamp(): number {
    return this.initializationTimestamp;
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
        (currentTrack as any)?.id ===
          store.player.currentTrack?.libraryItemId ||
        (!currentTrack && !store.player.currentTrack);

      // Check if position is roughly the same (within 5 seconds)
      const positionMatches =
        !store.player.position ||
        Math.abs(progress.position - store.player.position) < 5;

      // Check if playing state matches
      const playingMatches =
        (state.state === State.Playing) === store.player.isPlaying;

      const isConnected = trackMatches && positionMatches && playingMatches;

      if (!isConnected) {
        this.log.warn(
          `Connection mismatch - Track: ${trackMatches}, Position: ${positionMatches}, Playing: ${playingMatches}`
        );
      } else {
        this.log.info("Player connection verified OK");
      }

      return isConnected;
    } catch (error) {
      this.log.error("Error verifying connection", error as Error);
      return false;
    }
  }

  /**
   * Sync store state with TrackPlayer state
   */
  async syncStoreWithTrackPlayer(): Promise<void> {
    try {
      this.log.info("Syncing store with TrackPlayer");

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

      this.log.info("Store synced with TrackPlayer successfully");
    } catch (error) {
      this.log.error("Error syncing store with TrackPlayer", error as Error);
    }
  }

  async configureTrackPlayer(): Promise<void> {
    this.log.info("Configuring TrackPlayer options");
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
      forwardJumpInterval: 30,
      backwardJumpInterval: 30,
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
      this.log.info("Reconnecting background service");

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
            this.log.debug(`Module path: ${modulePath}`);
          }

          // Delete from cache in development to ensure we get fresh code
          if (__DEV__ && cache && cache[modulePath]) {
            this.log.debug("Clearing module cache for PlayerBackgroundService");
            delete cache[modulePath];
          }
        } else if (__DEV__) {
          this.log.debug("require.resolve not available; skipping cache clear");
        }

        PlayerBackgroundServiceModule = require("./PlayerBackgroundService");
      } catch (requireError) {
        this.log.error(
          "Failed to require PlayerBackgroundService module",
          requireError as Error
        );

        // If we can't load the module, try to force a full re-registration
        this.log.warn("Attempting full TrackPlayer service re-registration");
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
        this.log.info(`Background service initialized: ${isInitialized}`);
        reconnectFn();
      } else {
        // Function doesn't exist (old version or incompatible module)
        this.log.warn(
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

      this.log.info("Background service reconnection complete");
    } catch (error) {
      this.log.error("Error reconnecting background service", error as Error);

      // Last resort: try to sync state anyway
      try {
        await this.syncStoreWithTrackPlayer();
      } catch (syncError) {
        this.log.error(
          "Failed to sync store after reconnection error",
          syncError as Error
        );
      }
    }
  }
}

// Export singleton instance
export const playerService = PlayerService.getInstance();
