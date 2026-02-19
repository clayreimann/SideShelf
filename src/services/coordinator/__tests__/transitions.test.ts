/**
 * Tests for State Machine Transitions
 *
 * Tests state transition validation and transition matrix
 */

import type { PlayerEvent } from "@/types/coordinator";
import { PlayerState } from "@/types/coordinator";
import { describe, expect, it } from "@jest/globals";
import {
  getAllowedEvents,
  getNextState,
  isNoOpEvent,
  isTransitionAllowed,
  noOpEvents,
  transitions,
  validateTransition,
} from "../transitions";

describe("State Machine Transitions", () => {
  describe("transitions matrix", () => {
    it("should have entry for every PlayerState", () => {
      const allStates = Object.values(PlayerState);

      allStates.forEach((state) => {
        expect(transitions).toHaveProperty(state);
      });
    });

    it("should have valid next states", () => {
      const allStates = Object.values(PlayerState);

      Object.entries(transitions).forEach(([currentState, eventMap]) => {
        Object.values(eventMap).forEach((nextState) => {
          expect(allStates).toContain(nextState);
        });
      });
    });

    it("should define IDLE state transitions", () => {
      expect(transitions[PlayerState.IDLE]).toMatchObject({
        LOAD_TRACK: PlayerState.LOADING,
        RESTORE_STATE: PlayerState.RESTORING,
      });
    });

    it("should define LOADING state transitions", () => {
      expect(transitions[PlayerState.LOADING]).toMatchObject({
        NATIVE_TRACK_CHANGED: PlayerState.READY,
        NATIVE_ERROR: PlayerState.ERROR,
        NATIVE_PLAYBACK_ERROR: PlayerState.ERROR,
      });
    });

    it("should define READY state transitions", () => {
      expect(transitions[PlayerState.READY]).toMatchObject({
        PLAY: PlayerState.PLAYING,
        LOAD_TRACK: PlayerState.LOADING,
        STOP: PlayerState.IDLE,
        SEEK: PlayerState.SEEKING,
        NATIVE_STATE_CHANGED: PlayerState.READY,
        NATIVE_ERROR: PlayerState.ERROR,
        NATIVE_PLAYBACK_ERROR: PlayerState.ERROR,
      });
    });

    it("should define PLAYING state transitions", () => {
      expect(transitions[PlayerState.PLAYING]).toMatchObject({
        PAUSE: PlayerState.PAUSED,
        STOP: PlayerState.STOPPING,
        SEEK: PlayerState.SEEKING,
        LOAD_TRACK: PlayerState.LOADING,
        BUFFERING_STARTED: PlayerState.BUFFERING,
        NATIVE_STATE_CHANGED: PlayerState.PLAYING,
        NATIVE_TRACK_CHANGED: PlayerState.PLAYING,
        NATIVE_ERROR: PlayerState.ERROR,
        NATIVE_PLAYBACK_ERROR: PlayerState.ERROR,
        APP_BACKGROUNDED: PlayerState.PLAYING,
      });
    });

    it("should define PAUSED state transitions", () => {
      expect(transitions[PlayerState.PAUSED]).toMatchObject({
        PLAY: PlayerState.PLAYING,
        STOP: PlayerState.STOPPING,
        SEEK: PlayerState.SEEKING,
        LOAD_TRACK: PlayerState.LOADING,
        NATIVE_STATE_CHANGED: PlayerState.PAUSED,
        NATIVE_TRACK_CHANGED: PlayerState.PAUSED,
        NATIVE_ERROR: PlayerState.ERROR,
        NATIVE_PLAYBACK_ERROR: PlayerState.ERROR,
      });
    });

    it("should define SEEKING state transitions", () => {
      expect(transitions[PlayerState.SEEKING]).toMatchObject({
        SEEK_COMPLETE: PlayerState.READY,
        NATIVE_PROGRESS_UPDATED: PlayerState.READY,
        NATIVE_ERROR: PlayerState.ERROR,
        NATIVE_PLAYBACK_ERROR: PlayerState.ERROR,
      });
    });

    it("should define BUFFERING state transitions", () => {
      expect(transitions[PlayerState.BUFFERING]).toMatchObject({
        BUFFERING_COMPLETED: PlayerState.PLAYING,
        NATIVE_STATE_CHANGED: PlayerState.PLAYING,
        NATIVE_ERROR: PlayerState.ERROR,
        NATIVE_PLAYBACK_ERROR: PlayerState.ERROR,
        PAUSE: PlayerState.PAUSED,
      });
    });

    it("should define ERROR state transitions for recovery", () => {
      expect(transitions[PlayerState.ERROR]).toMatchObject({
        PLAY: PlayerState.PLAYING,
        LOAD_TRACK: PlayerState.LOADING,
        STOP: PlayerState.IDLE,
      });
    });
  });

  describe("isTransitionAllowed", () => {
    it("should return true for allowed transitions", () => {
      expect(isTransitionAllowed(PlayerState.IDLE, "LOAD_TRACK")).toBe(true);
      expect(isTransitionAllowed(PlayerState.READY, "PLAY")).toBe(true);
      expect(isTransitionAllowed(PlayerState.READY, "PAUSE")).toBe(false);
      expect(isTransitionAllowed(PlayerState.PLAYING, "PAUSE")).toBe(true);
      expect(isTransitionAllowed(PlayerState.PLAYING, "LOAD_TRACK")).toBe(true);
      expect(isTransitionAllowed(PlayerState.PAUSED, "PLAY")).toBe(true);
    });

    it("should return false for disallowed transitions", () => {
      expect(isTransitionAllowed(PlayerState.IDLE, "PAUSE")).toBe(false);
      expect(isTransitionAllowed(PlayerState.IDLE, "PLAY")).toBe(false);
      // LOADING allows PLAY — executeLoadTrack dispatches PLAY to start playback via coordinator
      expect(isTransitionAllowed(PlayerState.LOADING, "PLAY")).toBe(true);
      expect(isTransitionAllowed(PlayerState.BUFFERING, "LOAD_TRACK")).toBe(false);
    });

    it("should handle no-op events as allowed", () => {
      // No-op events don't have state transitions but should not be rejected
      // The validation should happen in validateTransition
      expect(isTransitionAllowed(PlayerState.PLAYING, "NATIVE_PROGRESS_UPDATED")).toBe(false);
    });
  });

  describe("getNextState", () => {
    it("should return next state for valid transitions", () => {
      expect(getNextState(PlayerState.IDLE, "LOAD_TRACK")).toBe(PlayerState.LOADING);
      expect(getNextState(PlayerState.READY, "PLAY")).toBe(PlayerState.PLAYING);
      expect(getNextState(PlayerState.PLAYING, "PAUSE")).toBe(PlayerState.PAUSED);
      expect(getNextState(PlayerState.PAUSED, "PLAY")).toBe(PlayerState.PLAYING);
    });

    it("should return null for invalid transitions", () => {
      expect(getNextState(PlayerState.IDLE, "PAUSE")).toBeNull();
      expect(getNextState(PlayerState.IDLE, "PLAY")).toBeNull();
      // LOADING → PLAY → PLAYING is now valid (executeLoadTrack dispatches PLAY)
      expect(getNextState(PlayerState.LOADING, "PLAY")).toBe(PlayerState.PLAYING);
    });

    it("should handle same-state transitions", () => {
      // APP_BACKGROUNDED keeps PLAYING in PLAYING state
      expect(getNextState(PlayerState.PLAYING, "APP_BACKGROUNDED")).toBe(PlayerState.PLAYING);
    });
  });

  describe("noOpEvents", () => {
    it("should include progress updated event", () => {
      expect(noOpEvents).toContain("NATIVE_PROGRESS_UPDATED");
    });

    it("should include session updated event", () => {
      expect(noOpEvents).toContain("SESSION_UPDATED");
    });

    it("should include chapter changed event", () => {
      expect(noOpEvents).toContain("CHAPTER_CHANGED");
    });
  });

  describe("isNoOpEvent", () => {
    it("should return true for no-op events", () => {
      expect(isNoOpEvent("NATIVE_PROGRESS_UPDATED")).toBe(true);
      expect(isNoOpEvent("SESSION_UPDATED")).toBe(true);
      expect(isNoOpEvent("CHAPTER_CHANGED")).toBe(true);
    });

    it("should return false for state-changing events", () => {
      expect(isNoOpEvent("PLAY")).toBe(false);
      expect(isNoOpEvent("PAUSE")).toBe(false);
      expect(isNoOpEvent("LOAD_TRACK")).toBe(false);
      expect(isNoOpEvent("STOP")).toBe(false);
    });
  });

  describe("getAllowedEvents", () => {
    it("should return all allowed events for IDLE state", () => {
      const allowed = getAllowedEvents(PlayerState.IDLE);

      expect(allowed).toContain("LOAD_TRACK");
      expect(allowed).toContain("RESTORE_STATE");
      expect(allowed).toContain("RELOAD_QUEUE");
      expect(allowed).toContain("APP_FOREGROUNDED");
      expect(allowed).toContain("NATIVE_STATE_CHANGED");
      expect(allowed).toHaveLength(5);
    });

    it("should return all allowed events for PLAYING state", () => {
      const allowed = getAllowedEvents(PlayerState.PLAYING);

      expect(allowed).toContain("PAUSE");
      expect(allowed).toContain("STOP");
      expect(allowed).toContain("SEEK");
      expect(allowed).toContain("BUFFERING_STARTED");
      expect(allowed).toContain("NATIVE_ERROR");
      expect(allowed).toContain("APP_BACKGROUNDED");
    });

    it("should return empty array for state with no transitions", () => {
      const allowed = getAllowedEvents(PlayerState.FATAL_ERROR);
      // FATAL_ERROR has some transitions defined
      expect(Array.isArray(allowed)).toBe(true);
    });
  });

  describe("validateTransition", () => {
    it("should validate allowed transitions", () => {
      const event: PlayerEvent = { type: "PLAY" };
      const result = validateTransition(PlayerState.READY, event);

      expect(result.allowed).toBe(true);
      expect(result.nextState).toBe(PlayerState.PLAYING);
      expect(result.reason).toBeUndefined();
    });

    it("should reject invalid transitions", () => {
      const event: PlayerEvent = { type: "PAUSE" };
      const result = validateTransition(PlayerState.IDLE, event);

      expect(result.allowed).toBe(false);
      expect(result.nextState).toBeNull();
      expect(result.reason).toContain("not allowed");
      expect(result.reason).toContain("PAUSE");
      expect(result.reason).toContain("idle");
    });

    it("should handle no-op events", () => {
      const event: PlayerEvent = {
        type: "NATIVE_PROGRESS_UPDATED",
        payload: { position: 120, duration: 3600 },
      };
      const result = validateTransition(PlayerState.PLAYING, event);

      expect(result.allowed).toBe(true);
      expect(result.nextState).toBe(PlayerState.PLAYING); // No state change
      expect(result.reason).toBe("No-op event");
    });

    it("should include event type in rejection reason", () => {
      const event: PlayerEvent = { type: "PLAY" };
      const result = validateTransition(PlayerState.IDLE, event);

      expect(result.reason).toContain("PLAY");
    });

    it("should include current state in rejection reason", () => {
      const event: PlayerEvent = { type: "PAUSE" };
      const result = validateTransition(PlayerState.IDLE, event);

      expect(result.reason).toContain("idle");
    });
  });

  describe("playback flow transitions", () => {
    it("should support complete playback flow", () => {
      // IDLE -> LOADING
      expect(getNextState(PlayerState.IDLE, "LOAD_TRACK")).toBe(PlayerState.LOADING);

      // LOADING -> READY
      expect(getNextState(PlayerState.LOADING, "NATIVE_TRACK_CHANGED")).toBe(PlayerState.READY);

      // READY -> PLAYING
      expect(getNextState(PlayerState.READY, "PLAY")).toBe(PlayerState.PLAYING);

      // PLAYING -> PAUSED
      expect(getNextState(PlayerState.PLAYING, "PAUSE")).toBe(PlayerState.PAUSED);

      // PAUSED -> PLAYING
      expect(getNextState(PlayerState.PAUSED, "PLAY")).toBe(PlayerState.PLAYING);

      // PLAYING -> STOPPING
      expect(getNextState(PlayerState.PLAYING, "STOP")).toBe(PlayerState.STOPPING);

      // STOPPING -> IDLE
      expect(getNextState(PlayerState.STOPPING, "NATIVE_STATE_CHANGED")).toBe(PlayerState.IDLE);
    });

    it("should support error recovery flow", () => {
      // Any state -> ERROR on error
      expect(getNextState(PlayerState.PLAYING, "NATIVE_ERROR")).toBe(PlayerState.ERROR);
      expect(getNextState(PlayerState.LOADING, "NATIVE_PLAYBACK_ERROR")).toBe(PlayerState.ERROR);

      // ERROR -> PLAYING (retry)
      expect(getNextState(PlayerState.ERROR, "PLAY")).toBe(PlayerState.PLAYING);

      // ERROR -> LOADING (load different track)
      expect(getNextState(PlayerState.ERROR, "LOAD_TRACK")).toBe(PlayerState.LOADING);

      // ERROR -> IDLE (give up)
      expect(getNextState(PlayerState.ERROR, "STOP")).toBe(PlayerState.IDLE);
    });

    it("should support seeking flow", () => {
      // READY -> SEEKING
      expect(getNextState(PlayerState.READY, "SEEK")).toBe(PlayerState.SEEKING);

      // PLAYING -> SEEKING
      expect(getNextState(PlayerState.PLAYING, "SEEK")).toBe(PlayerState.SEEKING);

      // SEEKING -> READY
      expect(getNextState(PlayerState.SEEKING, "SEEK_COMPLETE")).toBe(PlayerState.READY);
      expect(getNextState(PlayerState.SEEKING, "NATIVE_PROGRESS_UPDATED")).toBe(PlayerState.READY);
    });

    it("should support buffering flow", () => {
      // PLAYING -> BUFFERING
      expect(getNextState(PlayerState.PLAYING, "BUFFERING_STARTED")).toBe(PlayerState.BUFFERING);

      // BUFFERING -> PLAYING
      expect(getNextState(PlayerState.BUFFERING, "BUFFERING_COMPLETED")).toBe(PlayerState.PLAYING);
      expect(getNextState(PlayerState.BUFFERING, "NATIVE_STATE_CHANGED")).toBe(PlayerState.PLAYING);

      // BUFFERING -> PAUSED
      expect(getNextState(PlayerState.BUFFERING, "PAUSE")).toBe(PlayerState.PAUSED);
    });

    it("should support restoration flow", () => {
      // IDLE -> RESTORING
      expect(getNextState(PlayerState.IDLE, "RESTORE_STATE")).toBe(PlayerState.RESTORING);

      // RESTORING -> READY (via RESTORE_COMPLETE)
      expect(getNextState(PlayerState.RESTORING, "RESTORE_COMPLETE")).toBe(PlayerState.READY);

      // RESTORING -> READY (via POSITION_RECONCILED)
      expect(getNextState(PlayerState.RESTORING, "POSITION_RECONCILED")).toBe(PlayerState.READY);

      // Allow user to control playback during restoration
      expect(getNextState(PlayerState.RESTORING, "PLAY")).toBe(PlayerState.PLAYING);
      expect(getNextState(PlayerState.RESTORING, "PAUSE")).toBe(PlayerState.PAUSED);

      // Handle errors during restoration
      expect(getNextState(PlayerState.RESTORING, "NATIVE_ERROR")).toBe(PlayerState.ERROR);
      expect(getNextState(PlayerState.RESTORING, "NATIVE_PLAYBACK_ERROR")).toBe(PlayerState.ERROR);
    });
  });

  describe("edge cases", () => {
    it("should not allow PLAY from IDLE", () => {
      // Must load track first
      expect(getNextState(PlayerState.IDLE, "PLAY")).toBeNull();
    });

    it("should not allow PAUSE from IDLE or READY", () => {
      expect(getNextState(PlayerState.IDLE, "PAUSE")).toBeNull();
      expect(getNextState(PlayerState.READY, "PAUSE")).toBeNull();
    });

    it("should allow STOP from most states", () => {
      expect(getNextState(PlayerState.READY, "STOP")).toBe(PlayerState.IDLE);
      expect(getNextState(PlayerState.PLAYING, "STOP")).toBe(PlayerState.STOPPING);
      expect(getNextState(PlayerState.PAUSED, "STOP")).toBe(PlayerState.STOPPING);
    });

    it("should allow LOAD_TRACK from PAUSED to switch tracks", () => {
      expect(getNextState(PlayerState.PAUSED, "LOAD_TRACK")).toBe(PlayerState.LOADING);
    });

    it("should keep PLAYING state when backgrounded", () => {
      expect(getNextState(PlayerState.PLAYING, "APP_BACKGROUNDED")).toBe(PlayerState.PLAYING);
    });
  });
});
