/**
 * PlayerService - Manages react-native-track-player integration
 *
 * This service is a facade that retains all public interface methods and all
 * mutable state. Execution is delegated to four focused collaborators:
 *
 * - TrackLoadingCollaborator: executeLoadTrack, buildTrackList, reloadTrackPlayerQueue
 * - PlaybackControlCollaborator: executePlay, executePause, executeStop, executeSeek, setRate, setVolume
 * - ProgressRestoreCollaborator: restorePlayerServiceFromSession, syncPositionFromDatabase, rebuildCurrentTrackIfNeeded
 * - BackgroundReconnectCollaborator: reconnectBackgroundService, refreshFilePathsAfterContainerChange
 *
 * Interfaces are defined in src/services/player/types.ts to prevent circular imports.
 */

import { logger } from "@/lib/logger";
import { configureTrackPlayer } from "@/lib/trackPlayerConfig";
import { apiClientService } from "@/services/ApiClientService";
import { dispatchPlayerEvent } from "@/services/coordinator/eventBus";
import { getCoordinator } from "@/services/coordinator/PlayerStateCoordinator";
import { formatTime } from "@/lib/helpers/formatters";
import { useAppStore } from "@/stores/appStore";
import type { PlayerEvent, ResumePositionInfo } from "@/types/coordinator";
import type { PlayerTrack } from "@/types/player";
import TrackPlayer, {
  AndroidAudioContentType,
  IOSCategory,
  IOSCategoryMode,
  State,
} from "react-native-track-player";
import { BackgroundReconnectCollaborator } from "./player/BackgroundReconnectCollaborator";
import { PlaybackControlCollaborator } from "./player/PlaybackControlCollaborator";
import { ProgressRestoreCollaborator } from "./player/ProgressRestoreCollaborator";
import { TrackLoadingCollaborator } from "./player/TrackLoadingCollaborator";
import type {
  IBackgroundReconnectCollaborator,
  IPlaybackControlCollaborator,
  IPlayerServiceFacade,
  IProgressRestoreCollaborator,
  ITrackLoadingCollaborator,
} from "./player/types";

const log = logger.forTag("PlayerService");
const diagLog = logger.forDiagnostics("PlayerService");

/**
 * Track player service facade.
 * Implements IPlayerServiceFacade so collaborators can call back via the interface.
 */
export class PlayerService implements IPlayerServiceFacade {
  private static instance: PlayerService | null = null;
  private initialized = false;
  private initializationTimestamp = 0;
  private listenersSetup = false;
  private eventSubscriptions: Array<{ remove: () => void }> = [];
  private cachedApiInfo: { baseUrl: string; accessToken: string } | null = null;

  // Collaborator references (typed to interfaces — swappable in tests)
  private trackLoading!: ITrackLoadingCollaborator;
  private playbackControl!: IPlaybackControlCollaborator;
  private progressRestore!: IProgressRestoreCollaborator;
  private backgroundReconnect!: IBackgroundReconnectCollaborator;

  private constructor() {
    // Collaborators created here — facade is `this`
    this.trackLoading = new TrackLoadingCollaborator(this);
    this.playbackControl = new PlaybackControlCollaborator(this);
    this.progressRestore = new ProgressRestoreCollaborator(this);
    this.backgroundReconnect = new BackgroundReconnectCollaborator(this);
  }

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
    this.eventSubscriptions.forEach((subscription) => {
      try {
        subscription.remove();
      } catch (error) {
        log.error("Error removing subscription", error as Error);
      }
    });
    this.eventSubscriptions.length = 0;

    this.initialized = false;
    this.listenersSetup = false;
  }

  // --- IPlayerServiceFacade implementation ---

  /**
   * Dispatch a coordinator event.
   * Collaborators call this instead of importing dispatchPlayerEvent directly.
   */
  dispatchEvent(event: PlayerEvent): void {
    dispatchPlayerEvent(event);
  }

  /**
   * Get cached API credentials for building streaming URLs.
   */
  getApiInfo(): { baseUrl: string; accessToken: string } | null {
    const baseUrl = apiClientService.getBaseUrl();
    const accessToken = apiClientService.getAccessToken();

    if (!baseUrl || !accessToken) {
      log.error(" Missing base URL or access token");
      return null;
    }

    // Update cache
    this.cachedApiInfo = { baseUrl, accessToken };
    return this.cachedApiInfo;
  }

  /**
   * Get the initialization timestamp (for detecting context recreation).
   */
  getInitializationTimestamp(): number {
    return this.initializationTimestamp;
  }

  /**
   * Rebuild the TrackPlayer queue for the given track.
   * Delegates to TrackLoadingCollaborator.executeRebuildQueue (pure execution).
   * Called only by the coordinator from executeTransition.
   */
  async executeRebuildQueue(track: PlayerTrack): Promise<ResumePositionInfo> {
    return this.trackLoading.executeRebuildQueue(track);
  }

  /**
   * Resolve canonical resume position for a library item.
   * Delegates to coordinator without exposing coordinator to collaborators.
   */
  async resolveCanonicalPosition(libraryItemId: string): Promise<ResumePositionInfo> {
    return getCoordinator().resolveCanonicalPosition(libraryItemId);
  }

  // --- Debug ---

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
      diagLog.error("Error fetching TrackPlayer state", diagError as Error);
    }
  }

  // --- Initialization ---

  /**
   * Initialize the track player
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      log.info("Already initialized, skipping");
      await this.printDebugInfo("initialize");
      return;
    }

    try {
      log.info("Initializing track player");

      try {
        const state = await TrackPlayer.getPlaybackState();
        log.info("Track player already exists, reusing existing instance");

        this.initialized = true;
        this.initializationTimestamp = Date.now();
        log.info("Reused existing track player successfully");
        return;
      } catch (checkError) {
        log.info("No existing player found, setting up new instance");
      }

      await TrackPlayer.setupPlayer({
        autoUpdateMetadata: false,
        iosCategory: IOSCategory.Playback,
        iosCategoryMode: IOSCategoryMode.SpokenAudio,
        androidAudioContentType: AndroidAudioContentType.Speech,
      });
      await configureTrackPlayer();

      this.initialized = true;
      this.initializationTimestamp = Date.now();
      log.info("Track player initialized successfully");
    } catch (error) {
      if (error instanceof Error && error.message.includes("already been initialized")) {
        log.info("Player was already initialized elsewhere, setting up listeners");
        try {
          this.initialized = true;
          this.initializationTimestamp = Date.now();
          log.info("Successfully attached to existing player");
          return;
        } catch (attachError) {
          log.error("Failed to attach to existing player", attachError as Error);
        }
      }

      log.error("Failed to initialize track player", error as Error);
      throw error;
    }
  }

  // --- Public API (event dispatching — unchanged from callers' perspective) ---

  /**
   * Load and play a track (Public API - Dispatches Event)
   */
  async playTrack(libraryItemId: string, episodeId?: string): Promise<void> {
    dispatchPlayerEvent({
      type: "LOAD_TRACK",
      payload: { libraryItemId, episodeId },
    });
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
   * Pause playback (Public API - Dispatches Event)
   */
  async pause(): Promise<void> {
    dispatchPlayerEvent({ type: "PAUSE" });
  }

  /**
   * Resume playback (Public API - Dispatches Event)
   */
  async play(): Promise<void> {
    dispatchPlayerEvent({ type: "PLAY" });
  }

  /**
   * Seek to position in seconds (Public API - Dispatches Event)
   */
  async seekTo(position: number): Promise<void> {
    dispatchPlayerEvent({
      type: "SEEK",
      payload: { position },
    });
  }

  /**
   * Set playback rate (Public API - Dispatches Event)
   */
  async setRate(rate: number): Promise<void> {
    dispatchPlayerEvent({
      type: "SET_RATE",
      payload: { rate },
    });
  }

  /**
   * Set volume (Public API - Dispatches Event)
   */
  async setVolume(volume: number): Promise<void> {
    dispatchPlayerEvent({
      type: "SET_VOLUME",
      payload: { volume },
    });
  }

  /**
   * Stop playback (Public API - Dispatches Event)
   */
  async stop(): Promise<void> {
    dispatchPlayerEvent({ type: "STOP" });
  }

  // --- Internal (Called by Coordinator) — single-line delegates ---

  /**
   * Execute track loading (Internal - Called by Coordinator)
   */
  async executeLoadTrack(libraryItemId: string, episodeId?: string): Promise<void> {
    return this.trackLoading.executeLoadTrack(libraryItemId, episodeId);
  }

  /**
   * Execute play (Internal - Called by Coordinator)
   */
  async executePlay(): Promise<void> {
    return this.playbackControl.executePlay();
  }

  /**
   * Execute pause (Internal - Called by Coordinator)
   */
  async executePause(): Promise<void> {
    return this.playbackControl.executePause();
  }

  /**
   * Execute stop (Internal - Called by Coordinator)
   */
  async executeStop(): Promise<void> {
    return this.playbackControl.executeStop();
  }

  /**
   * Execute seek (Internal - Called by Coordinator)
   */
  async executeSeek(position: number): Promise<void> {
    return this.playbackControl.executeSeek(position);
  }

  /**
   * Execute set rate (Internal - Called by Coordinator)
   */
  async executeSetRate(rate: number): Promise<void> {
    return this.playbackControl.executeSetRate(rate);
  }

  /**
   * Execute set volume (Internal - Called by Coordinator)
   */
  async executeSetVolume(volume: number): Promise<void> {
    return this.playbackControl.executeSetVolume(volume);
  }

  /**
   * Restore PlayerService state from ProgressService session
   */
  async restorePlayerServiceFromSession(): Promise<void> {
    return this.progressRestore.restorePlayerServiceFromSession();
  }

  /**
   * Sync current position from database
   */
  async syncPositionFromDatabase(): Promise<void> {
    return this.progressRestore.syncPositionFromDatabase();
  }

  /**
   * Reconnect background service after app updates, hot reloads, or JS context recreation
   */
  async reconnectBackgroundService(): Promise<void> {
    return this.backgroundReconnect.reconnectBackgroundService();
  }

  /**
   * Refresh file paths after iOS container path changes
   */
  async refreshFilePathsAfterContainerChange(): Promise<void> {
    return this.backgroundReconnect.refreshFilePathsAfterContainerChange();
  }
}

// Export singleton instance
export const playerService = PlayerService.getInstance();
