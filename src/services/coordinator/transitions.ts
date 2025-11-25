/**
 * State Machine Transition Matrix
 *
 * Defines allowed state transitions in the player state machine.
 * Phase 1: Defined but not enforced (observer mode).
 */

import { PlayerEvent, PlayerState } from "@/types/coordinator";

/**
 * State transition matrix
 *
 * Maps current state → event type → next state
 * If event not in map for current state, transition is not allowed.
 */
export const transitions: Record<PlayerState, Partial<Record<PlayerEvent["type"], PlayerState>>> = {
  [PlayerState.IDLE]: {
    LOAD_TRACK: PlayerState.LOADING,
    RESTORE_STATE: PlayerState.RESTORING,
    RELOAD_QUEUE: PlayerState.LOADING,
    NATIVE_STATE_CHANGED: PlayerState.IDLE, // Allow native state changes while idle
    APP_FOREGROUNDED: PlayerState.IDLE, // No-op transition - app foregrounded while idle
  },

  [PlayerState.LOADING]: {
    NATIVE_TRACK_CHANGED: PlayerState.READY,
    QUEUE_RELOADED: PlayerState.READY,
    NATIVE_ERROR: PlayerState.ERROR,
    NATIVE_PLAYBACK_ERROR: PlayerState.ERROR,
    NATIVE_STATE_CHANGED: PlayerState.LOADING, // Allow state changes during loading
    NATIVE_PROGRESS_UPDATED: PlayerState.LOADING, // Allow progress updates during loading
  },

  [PlayerState.READY]: {
    PLAY: PlayerState.PLAYING,
    LOAD_TRACK: PlayerState.LOADING,
    STOP: PlayerState.IDLE,
    SEEK: PlayerState.SEEKING,
    NATIVE_STATE_CHANGED: PlayerState.READY, // Allow native state changes during ready
    NATIVE_ERROR: PlayerState.ERROR,
    NATIVE_PLAYBACK_ERROR: PlayerState.ERROR,
    APP_FOREGROUNDED: PlayerState.READY, // No-op - app foregrounded while ready
    RESTORE_STATE: PlayerState.READY, // No-op - already restored
    RESTORE_COMPLETE: PlayerState.READY, // No-op - restoration complete
  },

  [PlayerState.PLAYING]: {
    PAUSE: PlayerState.PAUSED,
    STOP: PlayerState.STOPPING,
    SEEK: PlayerState.SEEKING,
    LOAD_TRACK: PlayerState.LOADING, // Allow switching tracks while playing
    BUFFERING_STARTED: PlayerState.BUFFERING,
    NATIVE_STATE_CHANGED: PlayerState.PLAYING, // Allow native state changes during playback
    NATIVE_TRACK_CHANGED: PlayerState.PLAYING, // Allow track changes during playback
    NATIVE_ERROR: PlayerState.ERROR,
    NATIVE_PLAYBACK_ERROR: PlayerState.ERROR,
    APP_BACKGROUNDED: PlayerState.PLAYING, // Continue in background
    APP_FOREGROUNDED: PlayerState.PLAYING, // No-op - app foregrounded while playing
    RESTORE_STATE: PlayerState.PLAYING, // No-op - already playing
    RESTORE_COMPLETE: PlayerState.PLAYING, // No-op - restoration complete
  },

  [PlayerState.PAUSED]: {
    PLAY: PlayerState.PLAYING,
    STOP: PlayerState.STOPPING,
    SEEK: PlayerState.SEEKING,
    LOAD_TRACK: PlayerState.LOADING,
    NATIVE_STATE_CHANGED: PlayerState.PAUSED, // Allow native state changes while paused
    NATIVE_TRACK_CHANGED: PlayerState.PAUSED, // Allow track changes while paused
    NATIVE_ERROR: PlayerState.ERROR,
    NATIVE_PLAYBACK_ERROR: PlayerState.ERROR,
    APP_FOREGROUNDED: PlayerState.PAUSED, // No-op - app foregrounded while paused
    APP_BACKGROUNDED: PlayerState.PAUSED, // Continue in background
    RESTORE_STATE: PlayerState.PAUSED, // No-op - already paused
    RESTORE_COMPLETE: PlayerState.PAUSED, // No-op - restoration complete
  },

  [PlayerState.SEEKING]: {
    SEEK_COMPLETE: PlayerState.READY,
    NATIVE_PROGRESS_UPDATED: PlayerState.READY, // Seek complete
    NATIVE_STATE_CHANGED: PlayerState.SEEKING, // Allow native state changes during seek
    NATIVE_ERROR: PlayerState.ERROR,
    NATIVE_PLAYBACK_ERROR: PlayerState.ERROR,
  },

  [PlayerState.BUFFERING]: {
    BUFFERING_COMPLETED: PlayerState.PLAYING,
    NATIVE_STATE_CHANGED: PlayerState.PLAYING,
    NATIVE_TRACK_CHANGED: PlayerState.BUFFERING, // Allow track changes during buffering
    NATIVE_ERROR: PlayerState.ERROR,
    NATIVE_PLAYBACK_ERROR: PlayerState.ERROR,
    PAUSE: PlayerState.PAUSED,
    APP_FOREGROUNDED: PlayerState.BUFFERING, // No-op - app foregrounded while buffering
    APP_BACKGROUNDED: PlayerState.BUFFERING, // Continue in background
  },

  [PlayerState.STOPPING]: {
    NATIVE_STATE_CHANGED: PlayerState.IDLE,
  },

  [PlayerState.RESTORING]: {
    RESTORE_COMPLETE: PlayerState.READY,
    POSITION_RECONCILED: PlayerState.READY,
    RELOAD_QUEUE: PlayerState.LOADING,
    PLAY: PlayerState.PLAYING, // Allow user to start playback during restoration
    PAUSE: PlayerState.PAUSED, // Allow user to pause during restoration
    NATIVE_STATE_CHANGED: PlayerState.RESTORING, // Allow state changes during restoration
    NATIVE_TRACK_CHANGED: PlayerState.RESTORING, // Allow track changes during restoration
    NATIVE_ERROR: PlayerState.ERROR, // Handle errors during restoration
    NATIVE_PLAYBACK_ERROR: PlayerState.ERROR, // Handle playback errors during restoration
  },

  [PlayerState.SYNCING_POSITION]: {
    POSITION_RECONCILED: PlayerState.READY,
  },

  [PlayerState.SYNCING_SESSION]: {
    SESSION_SYNC_COMPLETED: PlayerState.PLAYING,
    SESSION_SYNC_FAILED: PlayerState.PLAYING, // Continue playing even if sync fails
  },

  [PlayerState.ERROR]: {
    PLAY: PlayerState.PLAYING, // Retry
    LOAD_TRACK: PlayerState.LOADING, // Load different track
    STOP: PlayerState.IDLE,
    APP_FOREGROUNDED: PlayerState.ERROR, // No-op - app foregrounded in error state
    APP_BACKGROUNDED: PlayerState.ERROR, // Continue in background
  },

  [PlayerState.FATAL_ERROR]: {
    LOAD_TRACK: PlayerState.LOADING,
    STOP: PlayerState.IDLE,
  },
};

/**
 * Check if a transition is allowed
 */
export function isTransitionAllowed(
  currentState: PlayerState,
  eventType: PlayerEvent["type"]
): boolean {
  const allowedTransitions = transitions[currentState];
  return eventType in (allowedTransitions || {});
}

/**
 * Get next state for a given event
 *
 * Returns null if transition is not allowed.
 */
export function getNextState(
  currentState: PlayerState,
  eventType: PlayerEvent["type"]
): PlayerState | null {
  return transitions[currentState]?.[eventType] || null;
}

/**
 * Events that don't cause state transitions but may have side effects
 */
export const noOpEvents: PlayerEvent["type"][] = [
  "NATIVE_PROGRESS_UPDATED",
  "SESSION_UPDATED",
  "SESSION_CREATED",
  "SESSION_ENDED",
  "SESSION_SYNC_STARTED",
  "SESSION_SYNC_COMPLETED",
  "SESSION_SYNC_FAILED",
  "CHAPTER_CHANGED",
];

/**
 * Check if an event is a no-op (doesn't cause state transition)
 */
export function isNoOpEvent(eventType: PlayerEvent["type"]): boolean {
  return noOpEvents.includes(eventType);
}

/**
 * Get all allowed events for a given state
 */
export function getAllowedEvents(state: PlayerState): PlayerEvent["type"][] {
  return Object.keys(transitions[state] || {}) as PlayerEvent["type"][];
}

/**
 * Validate state transition and return validation result
 */
export interface TransitionValidation {
  allowed: boolean;
  nextState: PlayerState | null;
  reason?: string;
}

export function validateTransition(
  currentState: PlayerState,
  event: PlayerEvent
): TransitionValidation {
  const nextState = getNextState(currentState, event.type);

  if (nextState) {
    return {
      allowed: true,
      nextState,
    };
  }

  if (isNoOpEvent(event.type)) {
    return {
      allowed: true,
      nextState: currentState, // No state change
      reason: "No-op event",
    };
  }

  return {
    allowed: false,
    nextState: null,
    reason: `Event ${event.type} not allowed in state ${currentState}`,
  };
}
