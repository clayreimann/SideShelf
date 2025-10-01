/**
 * PlayerService - Manages react-native-track-player integration
 *
 * This service handles:
 * - Track player setup and configuration
 * - Local and remote audio file playback
 * - Progress tracking and chapter navigation
 * - Integration with Zustand player store
 */

import { apiFetch, getApiConfig } from '@/lib/api/api';
import { useAppStore } from '@/stores/appStore';
import type { PlayerTrack } from '@/types/player';
import TrackPlayer, {
  AndroidAudioContentType,
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  IOSCategory,
  IOSCategoryMode,
  State,
  Track,
} from 'react-native-track-player';
import { sessionTrackingService } from './SessionTrackingService';
// Note: We can't use useAuth hook in a service, so we'll handle auth differently

/**
 * Audiobookshelf play session response types
 */
interface PlaySessionAudioTrack {
  index: number;
  startOffset: number;
  duration: number;
  title: string;
  contentUrl: string;
  mimeType: string;
  metadata: {
    filename: string;
    ext: string;
    path: string;
    relPath: string;
    size: number;
    mtimeMs: number;
    ctimeMs: number;
    birthtimeMs: number;
  };
}

interface PlaySessionResponse {
  id: string;
  userId: string;
  libraryId: string;
  libraryItemId: string;
  episodeId?: string;
  mediaType: 'book' | 'podcast';
  mediaMetadata: {
    title: string;
    author: string;
    description?: string;
    releaseDate?: string;
    genres?: string[];
  };
  chapters: any[];
  displayTitle: string;
  displayAuthor: string;
  coverPath: string;
  duration: number;
  playMethod: number;
  mediaPlayer: string;
  audioTracks: PlaySessionAudioTrack[];
  videoTrack?: any;
  libraryItem: any;
}

/**
 * Track player service class
 */
export class PlayerService {
  private static instance: PlayerService | null = null;
  private initialized = false;
  private progressUpdateInterval: ReturnType<typeof setInterval> | null = null;
  private currentTrack: PlayerTrack | null = null;
  private currentUsername: string | null = null;
  private cachedApiInfo: { baseUrl: string; accessToken: string } | null = null;

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
    this.stopProgressTracking();
    this.initialized = false;
  }

  /**
   * Initialize the track player
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[PlayerService] Already initialized, skipping');
      return;
    }

    try {
      console.log('[PlayerService] Initializing track player');

      // Check if player is already set up (e.g., during hot reload)
      try {
        const state = await TrackPlayer.getPlaybackState();
        console.log('[PlayerService] Track player already exists, reusing existing instance');

        // Player exists, just set up our event listeners and tracking
        this.setupEventListeners();
        this.startProgressTracking();
        this.initialized = true;
        console.log('[PlayerService] Reused existing track player successfully');
        return;
      } catch (checkError) {
        // Player doesn't exist yet, continue with setup
        console.log('[PlayerService] No existing player found, setting up new instance');
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
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.SeekTo,
          Capability.Stop,
        ],
        compactCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
        ],
        progressUpdateEventInterval: 1, // Update every second
      });

      // Set up event listeners
      this.setupEventListeners();

      // Start progress tracking
      this.startProgressTracking();

      this.initialized = true;
      console.log('[PlayerService] Track player initialized successfully');
    } catch (error) {
      // Handle the specific "already initialized" error gracefully
      if (error instanceof Error && error.message.includes('already been initialized')) {
        console.log('[PlayerService] Player was already initialized elsewhere, setting up listeners');
        try {
          // Set up our event listeners and tracking on the existing player
          this.setupEventListeners();
          this.startProgressTracking();
          this.initialized = true;
          console.log('[PlayerService] Successfully attached to existing player');
          return;
        } catch (attachError) {
          console.error('[PlayerService] Failed to attach to existing player:', attachError);
        }
      }

      console.error('[PlayerService] Failed to initialize track player:', error);
      throw error;
    }
  }

  /**
   * Load and play a track
   */
  async playTrack(track: PlayerTrack, username?: string): Promise<void> {
    try {
      console.log('[PlayerService] Loading track:', track.title);

      // End any existing session
      await sessionTrackingService.endCurrentSession();

      // Clear current queue
      await TrackPlayer.reset();

      // Determine the audio source (local or remote)
      const tracks = await this.buildTrackList(track);

      if (tracks.length === 0) {
        throw new Error('No playable audio files found');
      }

      // Add tracks to queue
      await TrackPlayer.add(tracks);

      // Store current track and username for session tracking
      this.currentTrack = track;
      this.currentUsername = username || null;

      // Start playback
      await TrackPlayer.play();

      // Start session tracking if we have username
      if (username) {
        const progress = await TrackPlayer.getProgress();
        await sessionTrackingService.startSession(
          username,
          track.libraryItemId,
          track.mediaId,
          progress.position,
          track.duration
        );
      }

      console.log('[PlayerService] Track loaded and playing');
    } catch (error) {
      console.error('[PlayerService] Failed to load track:', error);
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
      await sessionTrackingService.endCurrentSession(progress.position);
    }

    await TrackPlayer.stop();
    await TrackPlayer.reset();

    this.currentTrack = null;
    this.currentUsername = null;
  }

  /**
   * Build track list from PlayerTrack
   */
  private async buildTrackList(playerTrack: PlayerTrack): Promise<Track[]> {
    const tracks: Track[] = [];

    // Check if any files need streaming
    const needsStreaming = playerTrack.audioFiles.some(
      audioFile => !audioFile.downloadInfo?.isDownloaded
    );

    let streamingTracks: PlaySessionAudioTrack[] = [];
    if (needsStreaming) {
      try {
        streamingTracks = await this.getStreamingUrls(playerTrack.libraryItemId);
        console.log('[PlayerService] Got streaming tracks:', streamingTracks.length);
      // Log the first track for debugging
      if (streamingTracks.length > 0) {
        console.log('[PlayerService] Sample streaming track:', {
          contentUrl: streamingTracks[0].contentUrl,
          filename: streamingTracks[0].metadata.filename,
          mimeType: streamingTracks[0].mimeType
        });
      }
      } catch (error) {
        console.error('[PlayerService] Failed to get streaming URLs, falling back to local files only:', error);
      }
    }

    for (const audioFile of playerTrack.audioFiles) {
      let url: string;

      if (audioFile.downloadInfo?.isDownloaded && audioFile.downloadInfo.downloadPath) {
        // Use local file
        url = `file://${audioFile.downloadInfo.downloadPath}`;
        console.log('[PlayerService] Using local file:', url);
      } else {
        // Find matching streaming track by filename or index
        const streamingTrack = streamingTracks.find(
          track =>
            track.metadata.filename === audioFile.filename ||
            track.index === audioFile.index
        );

        if (streamingTrack) {
          // Use streaming URL - need to construct full URL with base URL and auth token
          // The contentUrl from API is relative (e.g., "/s/item/li_xxx/filename.mp3")
          // We'll get the API info once for all tracks to avoid multiple API calls
          if (!this.cachedApiInfo) {
            this.cachedApiInfo = this.getApiInfo();
          }

          if (this.cachedApiInfo) {
            // Add the access token as a query parameter for authentication
            const separator = streamingTrack.contentUrl.includes('?') ? '&' : '?';
            url = `${this.cachedApiInfo.baseUrl}${streamingTrack.contentUrl}${separator}token=${this.cachedApiInfo.accessToken}`;
            console.log('[PlayerService] Using streaming URL for:', audioFile.filename, '-> ', url.replace(this.cachedApiInfo.accessToken, '<token>'));
          } else {
            console.error('[PlayerService] No API info available for streaming');
            continue;
          }
        } else {
          console.warn('[PlayerService] No streaming URL found for:', audioFile.filename);
          continue; // Skip this file if we can't stream it
        }
      }

      tracks.push({
        id: audioFile.id,
        url,
        title: audioFile.tagTitle || audioFile.filename,
        artist: playerTrack.author,
        album: playerTrack.title,
        artwork: playerTrack.coverUri || undefined,
        duration: audioFile.duration || undefined,
        // Custom metadata for react-native-track-player
        // Note: These will be available in the track object
      });
    }

    return tracks;
  }

  /**
   * Get base URL and access token from API config
   */
  private getApiInfo(): { baseUrl: string; accessToken: string } | null {
    const config = getApiConfig();
    if (!config) {
      console.error('[PlayerService] API config not available');
      return null;
    }

    const baseUrl = config.getBaseUrl();
    const accessToken = config.getAccessToken();

    if (!baseUrl || !accessToken) {
      console.error('[PlayerService] Missing base URL or access token');
      return null;
    }

    return { baseUrl, accessToken };
  }

  /**
   * Get streaming URLs by starting a play session
   */
  private async getStreamingUrls(libraryItemId: string): Promise<PlaySessionAudioTrack[]> {
    try {
      console.log('[PlayerService] Starting play session for library item:', libraryItemId);

      // Call the Audiobookshelf play endpoint
      const response = await apiFetch(`/api/items/${libraryItemId}/play`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceInfo: {
            clientName: 'SideShelf',
            clientVersion: '1.0.0',
            deviceId: 'react-native-app',
          },
          supportedMimeTypes: [
            'audio/mpeg',
            'audio/mp4',
            'audio/aac',
            'audio/flac',
            'audio/ogg',
            'audio/wav',
          ],
          mediaPlayer: 'react-native-track-player',
          forceDirectPlay: true, // Prefer direct streaming over transcoding
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to start play session: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const playSession: PlaySessionResponse = await response.json();
      console.log('[PlayerService] Play session started:', playSession.id);
      console.log('[PlayerService] Audio tracks available:', playSession.audioTracks.length);

      if (!playSession.audioTracks || playSession.audioTracks.length === 0) {
        throw new Error('No audio tracks available in play session');
      }

      return playSession.audioTracks;
    } catch (error) {
      console.error('[PlayerService] Failed to get streaming URLs:', error);
      throw error;
    }
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Playback state changes
    TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
      const store = useAppStore.getState();
      const isPlaying = event.state === State.Playing;
      store.updatePlayingState(isPlaying);
    });

    // Track changes
    TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event) => {
      console.log('[PlayerService] Track changed:', event);
      // Handle track changes if needed
    });

    // Playback errors
    TrackPlayer.addEventListener(Event.PlaybackError, (event) => {
      console.error('[PlayerService] Playback error:', event);
      // Handle playback errors
    });

    // Queue ended
    TrackPlayer.addEventListener(Event.PlaybackQueueEnded, (event) => {
      console.log('[PlayerService] Queue ended:', event);
      // Handle queue end
    });
  }

  /**
   * Start progress tracking
   */
  private startProgressTracking(): void {
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval);
    }

    this.progressUpdateInterval = setInterval(async () => {
      try {
        const progress = await TrackPlayer.getProgress();
        const store = useAppStore.getState();
        const state = await TrackPlayer.getPlaybackState();

        // Update store
        store.updatePosition(progress.position);

        // Update session tracking if we have current track and username
        if (this.currentTrack && this.currentUsername) {
          const playbackRate = await TrackPlayer.getRate();
          const volume = await TrackPlayer.getVolume();
          const isPlaying = state.state === State.Playing;

          // Get current chapter if available
          const currentChapter = this.getCurrentChapter(progress.position);

          await sessionTrackingService.updateProgress(
            progress.position,
            playbackRate,
            volume,
            currentChapter?.id,
            isPlaying
          );
        }
      } catch (error) {
        // Ignore errors during progress updates
      }
    }, 1000);
  }

  /**
   * Get current chapter based on position
   */
  private getCurrentChapter(position: number): { id: string; title: string } | null {
    if (!this.currentTrack?.chapters) {
      return null;
    }

    const chapter = this.currentTrack.chapters.find(
      (ch) => position >= ch.start && position < ch.end
    );

    return chapter ? { id: chapter.id, title: chapter.title } : null;
  }

  /**
   * Stop progress tracking
   */
  private stopProgressTracking(): void {
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval);
      this.progressUpdateInterval = null;
    }
  }

}

// Export singleton instance
export const playerService = PlayerService.getInstance();
