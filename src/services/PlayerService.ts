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
import { getApiConfig } from "@/lib/api/api";
import { startPlaySession } from "@/lib/api/endpoints";
import { resolveAppPath, verifyFileExists } from "@/lib/fileSystem";
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
import { unifiedProgressService } from "./ProgressService";
// Note: We can't use useAuth hook in a service, so we'll handle auth differently

/**
 * Track player service class
 */
export class PlayerService {
  private static instance: PlayerService | null = null;
  private initialized = false;
  private listenersSetup = false;
  private eventSubscriptions: Array<{ remove: () => void }> = [];
  private currentTrack: PlayerTrack | null = null;
  private currentUsername: string | null = null;
  private cachedApiInfo: { baseUrl: string; accessToken: string } | null = null;
  private currentPlaySessionId: string | null = null; // Track the current server session ID

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
        console.warn("[PlayerService] Error removing subscription:", error);
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
      console.log("[PlayerService] Already initialized, skipping");
      return;
    }

    try {
      console.log("[PlayerService] Initializing track player");

      // Check if player is already set up (e.g., during hot reload)
      try {
        const state = await TrackPlayer.getPlaybackState();
        console.log(
          "[PlayerService] Track player already exists, reusing existing instance"
        );

        // Player exists, just set up our event listeners
        this.setupEventListeners();
        this.initialized = true;
        console.log(
          "[PlayerService] Reused existing track player successfully"
        );
        return;
      } catch (checkError) {
        // Player doesn't exist yet, continue with setup
        console.log(
          "[PlayerService] No existing player found, setting up new instance"
        );
      }

      await TrackPlayer.setupPlayer({
        // iOS specific options
        iosCategory: IOSCategory.Playback,
        iosCategoryMode: IOSCategoryMode.SpokenAudio,
        iosCategoryOptions: [],

        // Android specific options
        androidAudioContentType: AndroidAudioContentType.Speech,
      });

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

      // Set up event listeners
      this.setupEventListeners();

      this.initialized = true;
      console.log("[PlayerService] Track player initialized successfully");
    } catch (error) {
      // Handle the specific "already initialized" error gracefully
      if (
        error instanceof Error &&
        error.message.includes("already been initialized")
      ) {
        console.log(
          "[PlayerService] Player was already initialized elsewhere, setting up listeners"
        );
        try {
          // Set up our event listeners on the existing player
          this.setupEventListeners();
          this.initialized = true;
          console.log(
            "[PlayerService] Successfully attached to existing player"
          );
          return;
        } catch (attachError) {
          console.error(
            "[PlayerService] Failed to attach to existing player:",
            attachError
          );
        }
      }

      console.error(
        "[PlayerService] Failed to initialize track player:",
        error
      );
      throw error;
    }
  }

  /**
   * Load and play a track
   */
  async playTrack(track: PlayerTrack, username?: string): Promise<void> {
    try {
      console.log("[PlayerService] Loading track:", track.title);

      // Set loading state in the store
      const store = useAppStore.getState();
      store._setTrackLoading(true);

      // End any existing session
      await unifiedProgressService.endCurrentSession();

      // Clear current queue
      await TrackPlayer.reset();

      // Determine the audio source (local or remote)
      const tracks = await this.buildTrackList(track);

      if (tracks.length === 0) {
        // Provide more detailed error information
        const hasDownloadedFiles = track.audioFiles.some(
          (af) => af.downloadInfo?.isDownloaded
        );

        // Check if we tried to get streaming URLs
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

        console.error("[PlayerService] No playable tracks available:", {
          totalAudioFiles: track.audioFiles.length,
          downloadedFiles: track.audioFiles.filter(
            (af) => af.downloadInfo?.isDownloaded
          ).length,
          needsStreaming,
        });

        throw new Error(errorMessage);
      }

      // Add tracks to queue
      await TrackPlayer.add(tracks);

      // Store current track and username for session tracking
      this.currentTrack = track;
      this.currentUsername = username || null;

      // Get resume position and seek to it
      let resumePosition = 0;
      if (username) {
        resumePosition = await unifiedProgressService.getResumePosition(
          track.libraryItemId,
          username
        );
        if (resumePosition > 0) {
          console.log(
            `[PlayerService] Seeking to resume position: ${resumePosition}s`
          );
          await TrackPlayer.seekTo(resumePosition);
        }
      }

      // Start playback
      await TrackPlayer.play();

      // Start session tracking if we have username
      if (username) {
        await unifiedProgressService.startSession(
          username,
          track.libraryItemId,
          track.mediaId,
          resumePosition,
          track.duration,
          1.0, // playbackRate
          1.0, // volume
          this.currentPlaySessionId || undefined // Pass existing streaming session ID if available
        );
      }

      console.log("[PlayerService] Track loaded and playing");
    } catch (error) {
      console.error("[PlayerService] Failed to load track:", error);
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
    // End session tracking
    if (this.currentTrack && this.currentUsername) {
      const progress = await TrackPlayer.getProgress();
      await unifiedProgressService.endCurrentSession(progress.position);
    }

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
          console.warn(
            "[PlayerService] File marked as downloaded but missing:",
            resolvedPath
          );

          // Clean up database
          try {
            await clearAudioFileDownloadStatus(audioFile.id);
            console.log(
              "[PlayerService] Cleared download status for missing file:",
              audioFile.id
            );
          } catch (error) {
            console.error(
              "[PlayerService] Failed to clear download status:",
              error
            );
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
        console.log("[PlayerService] Started play session:", playSession.id);
        console.log(
          "[PlayerService] Got streaming tracks:",
          playSession.audioTracks.length
        );

        if (playSession.audioTracks.length > 0) {
          console.log("[PlayerService] Sample streaming track:", {
            contentUrl: playSession.audioTracks[0].contentUrl,
            filename: playSession.audioTracks[0].metadata.filename,
            mimeType: playSession.audioTracks[0].mimeType,
          });
        }
      } catch (error) {
        console.error("[PlayerService] Failed to start play session:", error);
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
        console.log(
          `[PlayerService] Using ${sourceType} file for ${audioFile.filename}:`,
          sourceType === "streaming"
            ? url.replace(this.cachedApiInfo?.accessToken || "", "<token>")
            : url
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
        console.warn(
          "[PlayerService] No playable source found for:",
          audioFile.filename
        );
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
      console.error("[PlayerService] API config not available");
      return null;
    }

    const baseUrl = config.getBaseUrl();
    const accessToken = config.getAccessToken();

    if (!baseUrl || !accessToken) {
      console.error("[PlayerService] Missing base URL or access token");
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
   * Set up event listeners
   */
  private setupEventListeners(): void {
    if (this.listenersSetup) {
      console.log("[PlayerService] Event listeners already set up, skipping");
      return;
    }

    console.log("[PlayerService] Setting up event listeners");
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
    const store = useAppStore.getState();
    const isPlaying = event.state === State.Playing;
    store.updatePlayingState(isPlaying);
  }

  onPlaybackError(event: PlaybackErrorEvent) {
    console.error("[PlayerService] Playback error:", event);
    // Handle playback errors
  }

  onPlaybackEnded(event: PlaybackQueueEndedEvent) {
    console.log("[PlayerService] Playback ended");
    // Handle end of playback
  }
}

// Export singleton instance
export const playerService = PlayerService.getInstance();
