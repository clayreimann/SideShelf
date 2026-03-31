/**
 * PlayerService Collaborator Interfaces
 *
 * Shared TypeScript interfaces that prevent circular imports between
 * PlayerService.ts (facade) and the collaborator files in this directory.
 *
 * Dependency graph intention:
 *   PlayerService.ts     → player/types.ts (imports interfaces)
 *   TrackLoadingCollaborator.ts → player/types.ts (imports IPlayerServiceFacade)
 *   PlaybackControlCollaborator.ts → player/types.ts
 *   ProgressRestoreCollaborator.ts → player/types.ts
 *   BackgroundReconnectCollaborator.ts → player/types.ts
 *
 * NEVER import from "@/services/PlayerService" inside any collaborator —
 * always import IPlayerServiceFacade from this file to prevent circular deps.
 */

import type { PlayerEvent, ResumePositionInfo } from "@/types/coordinator";
import type { PlayerTrack } from "@/types/player";
import type { Track } from "react-native-track-player";

/**
 * Public facade API surface exposed to PlayerService collaborators.
 *
 * Narrowed to what collaborators actually call — not the full PlayerService class.
 * Implemented by PlayerService; mocked in collaborator tests via plain objects.
 */
export interface IPlayerServiceFacade {
  /**
   * Dispatch a coordinator event (wraps dispatchPlayerEvent from eventBus).
   * Collaborators call this instead of importing dispatchPlayerEvent directly
   * so that coordinator interactions can be asserted in tests without mocking the event bus.
   */
  dispatchEvent(event: PlayerEvent): void;

  /**
   * Return cached API credentials for building streaming URLs.
   * Returns null when credentials are unavailable.
   */
  getApiInfo(): { baseUrl: string; accessToken: string } | null;

  /**
   * Return the timestamp (ms since epoch) when this PlayerService instance
   * was initialized. Used by BackgroundReconnectCollaborator to detect
   * context recreation.
   */
  getInitializationTimestamp(): number;

  /**
   * Rebuild the TrackPlayer queue for the given track.
   * Pure execution: resets queue, builds track list, resolves position.
   * Called only by the coordinator from executeTransition. Throws on failure.
   */
  executeRebuildQueue(track: PlayerTrack): Promise<ResumePositionInfo>;

  /**
   * Resolve the canonical resume position for a library item.
   * Delegates to coordinator.resolveCanonicalPosition() without exposing coordinator.
   */
  resolveCanonicalPosition(libraryItemId: string): Promise<ResumePositionInfo>;
}

/**
 * Collaborator interface for track loading concern group.
 *
 * Owns: executeLoadTrack, buildTrackList, reloadTrackPlayerQueue.
 * These three methods share DB lookups, path repair, streaming session
 * creation, and TrackPlayer queue management.
 */
export interface ITrackLoadingCollaborator {
  executeLoadTrack(libraryItemId: string, episodeId?: string, startPosition?: number): Promise<void>;
  buildTrackList(track: PlayerTrack): Promise<Track[]>;
  executeRebuildQueue(track: PlayerTrack): Promise<ResumePositionInfo>;
}

/**
 * Collaborator interface for playback control concern group.
 *
 * Owns: executePlay, executePause, executeStop, executeSeek,
 *        executeSetRate, executeSetVolume.
 * Each method owns a single TrackPlayer operation plus any
 * store side-effects (e.g., _setLastPauseTime on pause).
 */
export interface IPlaybackControlCollaborator {
  executePlay(): Promise<void>;
  executePause(): Promise<void>;
  executeStop(): Promise<void>;
  executeSeek(position: number): Promise<void>;
  executeSetRate(rate: number): Promise<void>;
  executeSetVolume(volume: number): Promise<void>;
}

/**
 * Collaborator interface for progress restoration concern group.
 *
 * Owns: restorePlayerServiceFromSession, syncPositionFromDatabase,
 *        rebuildCurrentTrackIfNeeded.
 * All three methods interact with DB session records, ProgressService,
 * and TrackPlayer position.
 */
export interface IProgressRestoreCollaborator {
  restorePlayerServiceFromSession(): Promise<void>;
  syncPositionFromDatabase(): Promise<void>;
}

/**
 * Collaborator interface for background reconnect concern group.
 *
 * Owns: reconnectBackgroundService, refreshFilePathsAfterContainerChange.
 * Both methods operate after app foregrounding or JS context recreation.
 */
export interface IBackgroundReconnectCollaborator {
  reconnectBackgroundService(): Promise<void>;
  refreshFilePathsAfterContainerChange(): Promise<void>;
}
