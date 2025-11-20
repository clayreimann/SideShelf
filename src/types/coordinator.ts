/**
 * State Machine Coordinator Types
 *
 * Types for the PlayerStateCoordinator event-driven state machine.
 * Phase 1: Observer mode - types defined but coordinator only observes.
 */

import type { PlayerTrack, CurrentChapter } from "./player";
import type { State } from "react-native-track-player";

/**
 * Player states in the finite state machine
 */
export enum PlayerState {
  /** No track loaded */
  IDLE = "idle",
  /** Loading track metadata and files */
  LOADING = "loading",
  /** Track loaded, ready to play */
  READY = "ready",
  /** Active playback */
  PLAYING = "playing",
  /** Paused, can resume */
  PAUSED = "paused",
  /** Seek operation in progress */
  SEEKING = "seeking",
  /** Waiting for audio data */
  BUFFERING = "buffering",
  /** Stopping playback */
  STOPPING = "stopping",
  /** Recoverable error */
  ERROR = "error",
  /** Non-recoverable error */
  FATAL_ERROR = "fatal_error",
  /** Restoring from persisted state */
  RESTORING = "restoring",
  /** Reconciling position across sources */
  SYNCING_POSITION = "syncing_position",
  /** Syncing session to server */
  SYNCING_SESSION = "syncing_session",
}

/**
 * Events that can be dispatched to the state machine
 */
export type PlayerEvent =
  // Command events (from user/UI)
  | { type: "LOAD_TRACK"; payload: { libraryItemId: string; episodeId?: string } }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "STOP" }
  | { type: "SEEK"; payload: { position: number } }
  | { type: "SET_RATE"; payload: { rate: number } }
  | { type: "SET_VOLUME"; payload: { volume: number } }
  | { type: "NEXT_TRACK" }
  | { type: "PREVIOUS_TRACK" }
  | { type: "JUMP_FORWARD"; payload: { seconds: number } }
  | { type: "JUMP_BACKWARD"; payload: { seconds: number } }

  // Native TrackPlayer events
  | { type: "NATIVE_STATE_CHANGED"; payload: { state: State } }
  | {
      type: "NATIVE_PROGRESS_UPDATED";
      payload: { position: number; duration: number; buffered?: number };
    }
  | { type: "NATIVE_TRACK_CHANGED"; payload: { track: PlayerTrack | null } }
  | { type: "NATIVE_ERROR"; payload: { error: Error } }
  | { type: "NATIVE_PLAYBACK_ERROR"; payload: { code: string; message: string } }

  // Session events
  | { type: "SESSION_CREATED"; payload: { sessionId: string } }
  | { type: "SESSION_UPDATED"; payload: { position: number } }
  | { type: "SESSION_ENDED"; payload: { sessionId: string } }
  | { type: "SESSION_SYNC_STARTED" }
  | { type: "SESSION_SYNC_COMPLETED" }
  | { type: "SESSION_SYNC_FAILED"; payload: { error: Error } }

  // Lifecycle events
  | { type: "APP_FOREGROUNDED" }
  | { type: "APP_BACKGROUNDED" }
  | { type: "RESTORE_STATE"; payload: { state: PersistedPlayerState } }
  | { type: "RESTORE_COMPLETE" }

  // Internal events
  | { type: "POSITION_RECONCILED"; payload: { position: number } }
  | { type: "CHAPTER_CHANGED"; payload: { chapter: CurrentChapter } }
  | { type: "BUFFERING_STARTED" }
  | { type: "BUFFERING_COMPLETED" }
  | { type: "SEEK_COMPLETE" }
  | { type: "RELOAD_QUEUE"; payload: { libraryItemId: string } }
  | { type: "QUEUE_RELOADED"; payload: { position: number } };

/**
 * State context - the full state of the player
 */
export interface StateContext {
  // Current state
  currentState: PlayerState;
  previousState: PlayerState | null;

  // Track info
  currentTrack: PlayerTrack | null;
  position: number;
  duration: number;

  // Playback config
  playbackRate: number;
  volume: number;

  // Session
  sessionId: string | null;
  sessionStartTime: number | null;
  lastPositionUpdate: number;

  // Chapter
  currentChapter: CurrentChapter | null;

  // Flags
  isPlaying: boolean;
  isBuffering: boolean;
  isSeeking: boolean;
  isLoadingTrack: boolean;

  // Sync state
  lastServerSync: number | null;
  pendingSyncPosition: number | null;

  // Error state
  lastError: Error | null;
}

/**
 * Persisted player state (saved to AsyncStorage)
 */
export interface PersistedPlayerState {
  currentTrack: PlayerTrack | null;
  position: number;
  playbackRate: number;
  volume: number;
  isPlaying: boolean;
  currentPlaySessionId: string | null;
}

/**
 * State change event emitted by coordinator
 */
export interface StateChangeEvent {
  from: PlayerState;
  to: PlayerState;
  event: PlayerEvent["type"];
  context: Readonly<StateContext>;
  timestamp: number;
}

/**
 * Position reconciliation event
 */
export interface PositionReconciliationEvent {
  from: number;
  to: number;
  sources: {
    db: number | null;
    store: number;
    native: number;
  };
  timestamp: number;
}

/**
 * Diagnostic event for logging
 */
export interface DiagnosticEvent {
  timestamp: number;
  event: PlayerEvent;
  currentState: PlayerState;
  nextState: PlayerState | null;
  allowed: boolean;
  context: Readonly<StateContext>;
}

/**
 * Subscriber interface for state updates
 */
export interface StateSubscriber {
  /**
   * Called when coordinator state is updated
   */
  onStateUpdate(context: Readonly<StateContext>): Promise<void> | void;

  /**
   * Optional: Called on specific events
   */
  onEvent?(event: PlayerEvent, context: Readonly<StateContext>): Promise<void> | void;
}

/**
 * Coordinator metrics for monitoring
 */
export interface CoordinatorMetrics {
  eventQueueLength: number;
  avgEventProcessingTime: number;
  totalEventsProcessed: number;
  stateTransitionCount: number;
  rejectedTransitionCount: number;
  positionReconciliationCount: number;
  lastEventTimestamp: number | null;
}

/**
 * Event processing result
 */
export interface EventProcessingResult {
  success: boolean;
  stateChanged: boolean;
  previousState: PlayerState;
  newState: PlayerState;
  error?: Error;
  processingTime: number;
}

/**
 * Transition history entry for diagnostics
 */
export interface TransitionHistoryEntry {
  timestamp: number;
  event: PlayerEvent;
  fromState: PlayerState;
  toState: PlayerState | null;
  allowed: boolean;
  reason?: string;
  processingTime: number;
}
