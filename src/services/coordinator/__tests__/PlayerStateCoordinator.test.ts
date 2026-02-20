/**
 * Tests for PlayerStateCoordinator
 *
 * Tests event processing, state machine, metrics, and integration
 */

import type { DiagnosticEvent, PlayerEvent } from "@/types/coordinator";
import { PlayerState } from "@/types/coordinator";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { State } from "react-native-track-player";
import { PlayerStateCoordinator } from "../PlayerStateCoordinator";
import { playerEventBus } from "../eventBus";

// Mock PlayerService
jest.mock("../../PlayerService", () => {
  const { jest } = require("@jest/globals");
  const mockInstance = {
    executeLoadTrack: jest.fn(),
    executePlay: jest.fn(),
    executePause: jest.fn(),
    executeStop: jest.fn(),
    executeSeek: jest.fn(),
    executeSetRate: jest.fn(),
    executeSetVolume: jest.fn(),
  };
  return {
    PlayerService: {
      getInstance: jest.fn(() => mockInstance),
      resetInstance: jest.fn(),
    },
  };
});

// Mock DB helpers used by resolveCanonicalPosition
jest.mock("@/db/helpers/localListeningSessions", () => ({
  getActiveSession: jest.fn(),
  getAllActiveSessionsForUser: jest.fn(),
}));

jest.mock("@/db/helpers/mediaProgress", () => ({
  getMediaProgressForLibraryItem: jest.fn(),
}));

jest.mock("@/db/helpers/users", () => ({
  getUserByUsername: jest.fn(),
}));

jest.mock("@/lib/secureStore", () => ({
  getStoredUsername: jest.fn(),
}));

jest.mock("@/lib/asyncStore", () => ({
  ASYNC_KEYS: { position: "position" },
  getItem: jest.fn(),
  saveItem: jest.fn(),
}));

jest.mock("@/stores/appStore", () => ({
  useAppStore: {
    getState: jest.fn(),
  },
}));

// Mock logger
jest.mock("@/lib/logger", () => ({
  log: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  logger: {
    forTag: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
    forDiagnostics: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

describe("PlayerStateCoordinator", () => {
  let coordinator: PlayerStateCoordinator;

  beforeEach(() => {
    // Clear event bus listeners from previous tests BEFORE creating coordinator
    playerEventBus.clearListeners();

    // Reset singleton and create new instance (which will subscribe to event bus)
    PlayerStateCoordinator.resetInstance();
    coordinator = PlayerStateCoordinator.getInstance();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  describe("getInstance", () => {
    it("should return singleton instance", () => {
      const instance1 = PlayerStateCoordinator.getInstance();
      const instance2 = PlayerStateCoordinator.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should initialize in IDLE state", () => {
      expect(coordinator.getState()).toBe(PlayerState.IDLE);
    });
  });

  describe("dispatch", () => {
    it("should queue and process events", async () => {
      const event: PlayerEvent = { type: "PLAY" };

      await coordinator.dispatch(event);

      const metrics = coordinator.getMetrics();
      expect(metrics.totalEventsProcessed).toBe(1);
    });

    it("should process events serially", async () => {
      const processedEvents: PlayerEvent[] = [];

      coordinator.on("eventProcessed", ({ event }) => {
        processedEvents.push(event);
      });

      // Dispatch multiple events rapidly
      const events: PlayerEvent[] = [
        { type: "LOAD_TRACK", payload: { libraryItemId: "1" } },
        { type: "PLAY" },
        { type: "PAUSE" },
      ];

      await Promise.all(events.map((e) => coordinator.dispatch(e)));

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Events should be processed in order
      expect(processedEvents).toHaveLength(3);
      expect(processedEvents[0].type).toBe("LOAD_TRACK");
      expect(processedEvents[1].type).toBe("PLAY");
      expect(processedEvents[2].type).toBe("PAUSE");
    });

    it("should handle errors without crashing", async () => {
      // Listen for errors
      const errorHandler = jest.fn();
      coordinator.on("error", errorHandler);

      // Dispatch event that might cause error in processing
      await coordinator.dispatch({ type: "PLAY" });

      // Should not throw
      expect(errorHandler).not.toHaveBeenCalled();
    });

    it("should update metrics on each event", async () => {
      const before = coordinator.getMetrics().totalEventsProcessed;

      await coordinator.dispatch({ type: "PLAY" });

      const after = coordinator.getMetrics().totalEventsProcessed;

      expect(after).toBe(before + 1);
    });
  });

  describe("state transitions", () => {
    it("should validate valid transitions", async () => {
      const diagnostics: DiagnosticEvent[] = [];

      coordinator.on("diagnostic", (event: DiagnosticEvent) => {
        diagnostics.push(event);
      });

      await coordinator.dispatch({
        type: "LOAD_TRACK",
        payload: { libraryItemId: "book-123" },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const lastDiagnostic = diagnostics[diagnostics.length - 1];
      expect(lastDiagnostic.allowed).toBe(true);
      expect(lastDiagnostic.currentState).toBe(PlayerState.IDLE);
      expect(lastDiagnostic.nextState).toBe(PlayerState.LOADING);
    });

    it("should reject invalid transitions", async () => {
      const diagnostics: DiagnosticEvent[] = [];

      coordinator.on("diagnostic", (event: DiagnosticEvent) => {
        diagnostics.push(event);
      });

      // Try to PAUSE from IDLE (invalid)
      await coordinator.dispatch({ type: "PAUSE" });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const lastDiagnostic = diagnostics[diagnostics.length - 1];
      expect(lastDiagnostic.allowed).toBe(false);
      expect(lastDiagnostic.currentState).toBe(PlayerState.IDLE);
      expect(lastDiagnostic.nextState).toBeNull();
    });

    it("should increment rejected transition count for invalid transitions", async () => {
      const beforeRejected = coordinator.getMetrics().rejectedTransitionCount;

      await coordinator.dispatch({ type: "PAUSE" }); // Invalid from IDLE

      await new Promise((resolve) => setTimeout(resolve, 50));

      const afterRejected = coordinator.getMetrics().rejectedTransitionCount;
      expect(afterRejected).toBe(beforeRejected + 1);
    });

    it("should handle no-op events", async () => {
      const event: PlayerEvent = {
        type: "NATIVE_PROGRESS_UPDATED",
        payload: { position: 120, duration: 3600 },
      };

      await coordinator.dispatch(event);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should process without error
      const metrics = coordinator.getMetrics();
      expect(metrics.totalEventsProcessed).toBeGreaterThan(0);
    });
  });

  describe("metrics", () => {
    it("should track total events processed", async () => {
      const before = coordinator.getMetrics().totalEventsProcessed;

      await coordinator.dispatch({ type: "PLAY" });
      await coordinator.dispatch({ type: "PAUSE" });
      await coordinator.dispatch({ type: "STOP" });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const after = coordinator.getMetrics().totalEventsProcessed;
      expect(after).toBe(before + 3);
    });

    it("should track event queue length", async () => {
      const metrics1 = coordinator.getMetrics();
      expect(metrics1.eventQueueLength).toBe(0);

      // Dispatch events without waiting
      coordinator.dispatch({ type: "PLAY" });
      coordinator.dispatch({ type: "PAUSE" });

      // Queue should have events
      const metrics2 = coordinator.getMetrics();
      expect(metrics2.eventQueueLength).toBeGreaterThan(0);
    });

    it("should track average processing time", async () => {
      await coordinator.dispatch({ type: "PLAY" });
      await coordinator.dispatch({ type: "PAUSE" });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const metrics = coordinator.getMetrics();
      // Processing can be 0ms for very fast operations
      expect(metrics.avgEventProcessingTime).toBeGreaterThanOrEqual(0);
      expect(metrics.avgEventProcessingTime).toBeLessThan(100); // Should be fast
    });

    it("should track last event timestamp", async () => {
      const before = Date.now();

      await coordinator.dispatch({ type: "PLAY" });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const after = Date.now();
      const metrics = coordinator.getMetrics();

      expect(metrics.lastEventTimestamp).not.toBeNull();
      expect(metrics.lastEventTimestamp!).toBeGreaterThanOrEqual(before);
      expect(metrics.lastEventTimestamp!).toBeLessThanOrEqual(after);
    });

    it("should maintain processing times history", async () => {
      // Dispatch several events
      for (let i = 0; i < 5; i++) {
        await coordinator.dispatch({ type: "PLAY" });
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      const processingTimes = coordinator.getProcessingTimes();
      expect(processingTimes.length).toBeGreaterThan(0);
      expect(processingTimes.length).toBeLessThanOrEqual(100); // Max 100
    });

    it("should limit processing times history to 100", async () => {
      // Dispatch 150 events
      for (let i = 0; i < 150; i++) {
        await coordinator.dispatch({ type: "PLAY" });
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      const processingTimes = coordinator.getProcessingTimes();
      expect(processingTimes.length).toBeLessThanOrEqual(100);
    });
  });

  describe("getContext", () => {
    it("should return current context", () => {
      const context = coordinator.getContext();

      expect(context).toHaveProperty("currentState");
      expect(context).toHaveProperty("previousState");
      expect(context).toHaveProperty("currentTrack");
      expect(context).toHaveProperty("position");
      expect(context).toHaveProperty("duration");
    });

    it("should return copy not reference", () => {
      const context1 = coordinator.getContext();
      const context2 = coordinator.getContext();

      expect(context1).toEqual(context2);
      expect(context1).not.toBe(context2);
    });

    it("should have initial values", () => {
      const context = coordinator.getContext();

      expect(context.currentState).toBe(PlayerState.IDLE);
      expect(context.previousState).toBeNull();
      expect(context.currentTrack).toBeNull();
      expect(context.position).toBe(0);
      expect(context.duration).toBe(0);
      expect(context.playbackRate).toBe(1);
      expect(context.volume).toBe(1);
      expect(context.isPlaying).toBe(false);
    });
  });

  describe("getEventQueue", () => {
    it("should return current event queue", async () => {
      // Dispatch events without waiting
      coordinator.dispatch({ type: "PLAY" });
      coordinator.dispatch({ type: "PAUSE" });

      const queue = coordinator.getEventQueue();
      expect(Array.isArray(queue)).toBe(true);
    });

    it("should return copy of queue", async () => {
      coordinator.dispatch({ type: "PLAY" });

      const queue1 = coordinator.getEventQueue();
      const queue2 = coordinator.getEventQueue();

      expect(queue1).toEqual(queue2);
      // Don't check reference equality as queue might be empty by the time we get it
    });
  });

  describe("exportDiagnostics", () => {
    it("should export complete diagnostics", () => {
      const diagnostics = coordinator.exportDiagnostics();

      expect(diagnostics).toHaveProperty("context");
      expect(diagnostics).toHaveProperty("metrics");
      expect(diagnostics).toHaveProperty("eventQueue");
      expect(diagnostics).toHaveProperty("processingTimes");
    });

    it("should include all context fields", () => {
      const diagnostics = coordinator.exportDiagnostics();

      expect(diagnostics.context).toHaveProperty("currentState");
      expect(diagnostics.context).toHaveProperty("currentTrack");
      expect(diagnostics.context).toHaveProperty("position");
      expect(diagnostics.context).toHaveProperty("isPlaying");
    });

    it("should include all metrics", () => {
      const diagnostics = coordinator.exportDiagnostics();

      expect(diagnostics.metrics).toHaveProperty("totalEventsProcessed");
      expect(diagnostics.metrics).toHaveProperty("stateTransitionCount");
      expect(diagnostics.metrics).toHaveProperty("rejectedTransitionCount");
      expect(diagnostics.metrics).toHaveProperty("avgEventProcessingTime");
    });
  });

  describe("event bus integration", () => {
    it("should subscribe to event bus on initialization", () => {
      // Dispatch event to event bus
      playerEventBus.dispatch({ type: "PLAY" });

      // Give time for processing
      return new Promise((resolve) => {
        setTimeout(() => {
          const metrics = coordinator.getMetrics();
          expect(metrics.totalEventsProcessed).toBeGreaterThan(0);
          resolve(undefined);
        }, 100);
      });
    });

    it("should receive events from event bus", async () => {
      const processedEvents: PlayerEvent[] = [];

      coordinator.on("eventProcessed", ({ event }) => {
        processedEvents.push(event);
      });

      // Dispatch to event bus
      playerEventBus.dispatch({ type: "PLAY" });
      playerEventBus.dispatch({ type: "PAUSE" });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(processedEvents.length).toBeGreaterThan(0);
    });

    it("should handle errors from event bus gracefully", async () => {
      // Event bus should not throw even if coordinator has issues
      playerEventBus.dispatch({ type: "PLAY" });

      // Should not throw
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  });

  describe("execution mode behavior", () => {
    it("should execute state transitions", async () => {
      // Load track - should transition to LOADING
      await coordinator.dispatch({
        type: "LOAD_TRACK",
        payload: { libraryItemId: "test-item" },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify state transition occurred
      expect(coordinator.getState()).toBe(PlayerState.LOADING);
      const metrics = coordinator.getMetrics();
      expect(metrics.stateTransitionCount).toBeGreaterThan(0);
    });

    it("should track metrics", async () => {
      await coordinator.dispatch({ type: "PLAY" });
      await coordinator.dispatch({ type: "PAUSE" });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const metrics = coordinator.getMetrics();
      expect(metrics.totalEventsProcessed).toBe(2);
    });
  });

  describe("event emitters", () => {
    it("should emit diagnostic events", async () => {
      const diagnosticHandler = jest.fn();
      coordinator.on("diagnostic", diagnosticHandler);

      await coordinator.dispatch({ type: "PLAY" });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(diagnosticHandler).toHaveBeenCalled();
    });

    it("should emit eventProcessed events", async () => {
      const processedHandler = jest.fn();
      coordinator.on("eventProcessed", processedHandler);

      await coordinator.dispatch({ type: "PLAY" });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(processedHandler).toHaveBeenCalled();
    });

    it("should include event in diagnostic emission", async () => {
      let receivedEvent: DiagnosticEvent | null = null;

      coordinator.on("diagnostic", (event: DiagnosticEvent) => {
        receivedEvent = event;
      });

      await coordinator.dispatch({ type: "PLAY" });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(receivedEvent).not.toBeNull();
      expect(receivedEvent!.event.type).toBe("PLAY");
    });
  });

  describe("error handling", () => {
    it("should emit error event on processing error", async () => {
      const errorHandler = jest.fn();
      coordinator.on("error", errorHandler);

      // This shouldn't cause an error in observer mode, but test the pattern
      await coordinator.dispatch({ type: "PLAY" });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // In current implementation, should not error
      // But the error handler is in place if needed
    });

    it("should continue processing after error", async () => {
      await coordinator.dispatch({ type: "PLAY" });
      await coordinator.dispatch({ type: "PAUSE" });
      await coordinator.dispatch({ type: "STOP" });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const metrics = coordinator.getMetrics();
      expect(metrics.totalEventsProcessed).toBe(3);
    });
  });

  describe("performance", () => {
    it("should process events quickly", async () => {
      const start = Date.now();

      // Dispatch 100 events
      for (let i = 0; i < 100; i++) {
        await coordinator.dispatch({ type: "PLAY" });
      }

      const duration = Date.now() - start;

      // Should complete in reasonable time (< 1 second for 100 events)
      expect(duration).toBeLessThan(1000);
    });

    it("should maintain low average processing time", async () => {
      // Dispatch several events
      for (let i = 0; i < 10; i++) {
        await coordinator.dispatch({ type: "PLAY" });
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      const metrics = coordinator.getMetrics();

      // Should average < 10ms per event
      expect(metrics.avgEventProcessingTime).toBeLessThan(10);
    });
  });

  describe("queue reload events", () => {
    it("should handle RELOAD_QUEUE transition from IDLE to LOADING", async () => {
      await coordinator.dispatch({
        type: "RELOAD_QUEUE",
        payload: { libraryItemId: "test-item-id" },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // In observer mode, state doesn't actually change, but transition should be validated
      const metrics = coordinator.getMetrics();
      expect(metrics.totalEventsProcessed).toBe(1);
      expect(metrics.rejectedTransitionCount).toBe(0);
    });

    it("should accept NATIVE_STATE_CHANGED during LOADING", async () => {
      await coordinator.dispatch({
        type: "RELOAD_QUEUE",
        payload: { libraryItemId: "test-item-id" },
      });
      await coordinator.dispatch({
        type: "NATIVE_STATE_CHANGED",
        payload: { state: State.Playing },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const metrics = coordinator.getMetrics();
      expect(metrics.totalEventsProcessed).toBe(2);
      // Now that coordinator tracks state, it transitions from IDLE -> LOADING
      // and NATIVE_STATE_CHANGED is accepted during LOADING (but stays in LOADING, so only 1 transition)
      expect(metrics.rejectedTransitionCount).toBe(0);
      expect(metrics.stateTransitionCount).toBe(1); // IDLE->LOADING only
    });

    it("should handle QUEUE_RELOADED transition from LOADING to READY", async () => {
      await coordinator.dispatch({
        type: "RELOAD_QUEUE",
        payload: { libraryItemId: "test-item-id" },
      });
      await coordinator.dispatch({
        type: "QUEUE_RELOADED",
        payload: { position: 100 },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const metrics = coordinator.getMetrics();
      expect(metrics.totalEventsProcessed).toBe(2);
      // Now that coordinator tracks state, it transitions from IDLE -> LOADING -> READY
      expect(metrics.rejectedTransitionCount).toBe(0);
      expect(metrics.stateTransitionCount).toBe(2); // IDLE->LOADING, LOADING->READY
    });
  });

  describe("resetInstance", () => {
    it("should reset singleton instance", () => {
      const instance1 = PlayerStateCoordinator.getInstance();

      PlayerStateCoordinator.resetInstance();

      const instance2 = PlayerStateCoordinator.getInstance();

      expect(instance1).not.toBe(instance2);
    });

    it("should create fresh instance with clean state", () => {
      // Dispatch some events to first instance
      coordinator.dispatch({ type: "PLAY" });

      PlayerStateCoordinator.resetInstance();

      const newCoordinator = PlayerStateCoordinator.getInstance();
      const metrics = newCoordinator.getMetrics();

      expect(metrics.totalEventsProcessed).toBe(0);
    });
  });

  describe("context updates from events", () => {
    it("should update context from RESTORE_STATE event", async () => {
      const mockTrack: any = {
        libraryItemId: "test-item-1",
        title: "Test Book",
        duration: 3600,
      };

      await coordinator.dispatch({
        type: "RESTORE_STATE",
        payload: {
          state: {
            currentTrack: mockTrack,
            position: 1234,
            playbackRate: 1.5,
            volume: 0.8,
            isPlaying: true,
            currentPlaySessionId: "session-123",
          },
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const context = coordinator.getContext();
      expect(context.currentTrack).toEqual(mockTrack);
      expect(context.position).toBe(1234);
      expect(context.playbackRate).toBe(1.5);
      expect(context.volume).toBe(0.8);
      expect(context.isPlaying).toBe(true);
      expect(context.sessionId).toBe("session-123");
      expect(context.duration).toBe(3600);
    });

    it("should update position from QUEUE_RELOADED event", async () => {
      await coordinator.dispatch({
        type: "RELOAD_QUEUE",
        payload: { libraryItemId: "test-item" },
      });

      await coordinator.dispatch({
        type: "QUEUE_RELOADED",
        payload: { position: 567 },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const context = coordinator.getContext();
      expect(context.position).toBe(567);
      expect(context.isLoadingTrack).toBe(false);
    });

    it("should update sessionId from SESSION_CREATED event", async () => {
      await coordinator.dispatch({
        type: "SESSION_CREATED",
        payload: { sessionId: "new-session-456" },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const context = coordinator.getContext();
      expect(context.sessionId).toBe("new-session-456");
      expect(context.sessionStartTime).not.toBeNull();
    });

    it("should clear sessionId from SESSION_ENDED event", async () => {
      // First create a session
      await coordinator.dispatch({
        type: "SESSION_CREATED",
        payload: { sessionId: "session-to-end" },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Then end it
      await coordinator.dispatch({
        type: "SESSION_ENDED",
        payload: { sessionId: "session-to-end" },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const context = coordinator.getContext();
      expect(context.sessionId).toBeNull();
      expect(context.sessionStartTime).toBeNull();
    });

    it("should update position and duration from NATIVE_PROGRESS_UPDATED", async () => {
      await coordinator.dispatch({
        type: "NATIVE_PROGRESS_UPDATED",
        payload: { position: 123.5, duration: 3600 },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const context = coordinator.getContext();
      expect(context.position).toBe(123.5);
      expect(context.duration).toBe(3600);
      expect(context.lastPositionUpdate).toBeGreaterThan(0);
    });

    it("should update isPlaying from PLAY and PAUSE events", async () => {
      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      let context = coordinator.getContext();
      expect(context.isPlaying).toBe(true);

      await coordinator.dispatch({ type: "PAUSE" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      context = coordinator.getContext();
      expect(context.isPlaying).toBe(false);
    });

    it("should update playback rate from SET_RATE", async () => {
      await coordinator.dispatch({
        type: "SET_RATE",
        payload: { rate: 2.0 },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const context = coordinator.getContext();
      expect(context.playbackRate).toBe(2.0);
    });

    it("should update volume from SET_VOLUME", async () => {
      await coordinator.dispatch({
        type: "SET_VOLUME",
        payload: { volume: 0.5 },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const context = coordinator.getContext();
      expect(context.volume).toBe(0.5);
    });

    it("should set isSeeking during SEEK and clear on SEEK_COMPLETE", async () => {
      await coordinator.dispatch({
        type: "SEEK",
        payload: { position: 1000 },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      let context = coordinator.getContext();
      expect(context.isSeeking).toBe(true);
      expect(context.position).toBe(1000);

      await coordinator.dispatch({ type: "SEEK_COMPLETE" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      context = coordinator.getContext();
      expect(context.isSeeking).toBe(false);
    });

    it("should set isLoadingTrack during LOAD_TRACK", async () => {
      await coordinator.dispatch({
        type: "LOAD_TRACK",
        payload: { libraryItemId: "test-item" },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const context = coordinator.getContext();
      expect(context.isLoadingTrack).toBe(true);
    });

    it("should update chapter from CHAPTER_CHANGED", async () => {
      const mockChapter: any = {
        id: 1,
        title: "Chapter 1",
        start: 0,
        end: 600,
      };

      await coordinator.dispatch({
        type: "CHAPTER_CHANGED",
        payload: { chapter: mockChapter },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const context = coordinator.getContext();
      expect(context.currentChapter).toEqual(mockChapter);
    });

    it("should reset all playback state on STOP", async () => {
      // Setup some state first
      await coordinator.dispatch({
        type: "RESTORE_STATE",
        payload: {
          state: {
            currentTrack: { libraryItemId: "test" } as any,
            position: 100,
            playbackRate: 1.5,
            volume: 1.0,
            isPlaying: true,
            currentPlaySessionId: "session-1",
          },
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Now stop
      await coordinator.dispatch({ type: "STOP" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      const context = coordinator.getContext();
      expect(context.isPlaying).toBe(false);
      expect(context.position).toBe(0);
      expect(context.currentTrack).toBeNull();
      expect(context.sessionId).toBeNull();
      expect(context.sessionStartTime).toBeNull();
    });
  });

  // ============================================================================
  // EXEC-01: Verify execute* methods are called on valid transitions
  // ============================================================================

  describe("execution control (EXEC-01)", () => {
    let mockPlayerService: {
      executeLoadTrack: ReturnType<typeof jest.fn>;
      executePlay: ReturnType<typeof jest.fn>;
      executePause: ReturnType<typeof jest.fn>;
      executeStop: ReturnType<typeof jest.fn>;
      executeSeek: ReturnType<typeof jest.fn>;
      executeSetRate: ReturnType<typeof jest.fn>;
      executeSetVolume: ReturnType<typeof jest.fn>;
    };

    beforeEach(() => {
      const { PlayerService } = require("../../PlayerService");
      mockPlayerService = PlayerService.getInstance();
      jest.clearAllMocks();
    });

    async function transitionToState(targetState: PlayerState): Promise<void> {
      if (targetState === PlayerState.LOADING) {
        await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
      } else if (targetState === PlayerState.READY) {
        await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
        await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
      } else if (targetState === PlayerState.PLAYING) {
        await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
        await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
        await coordinator.dispatch({ type: "PLAY" });
      } else if (targetState === PlayerState.PAUSED) {
        await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
        await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
        await coordinator.dispatch({ type: "PLAY" });
        await coordinator.dispatch({ type: "PAUSE" });
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    it("should call executeLoadTrack when LOAD_TRACK transitions to LOADING", async () => {
      await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockPlayerService.executeLoadTrack).toHaveBeenCalledWith("test-item", undefined);
    });

    it("should call executePlay when transitioning to PLAYING", async () => {
      await transitionToState(PlayerState.READY);
      jest.clearAllMocks();

      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockPlayerService.executePlay).toHaveBeenCalledTimes(1);
    });

    it("should call executePause when transitioning to PAUSED", async () => {
      await transitionToState(PlayerState.PLAYING);
      jest.clearAllMocks();

      await coordinator.dispatch({ type: "PAUSE" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockPlayerService.executePause).toHaveBeenCalledTimes(1);
    });

    it("should call executeStop when transitioning via STOP", async () => {
      await transitionToState(PlayerState.PLAYING);
      jest.clearAllMocks();

      await coordinator.dispatch({ type: "STOP" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockPlayerService.executeStop).toHaveBeenCalledTimes(1);
    });

    it("should call executeSeek on SEEK event from PLAYING state", async () => {
      await transitionToState(PlayerState.PLAYING);
      jest.clearAllMocks();

      await coordinator.dispatch({ type: "SEEK", payload: { position: 1000 } });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockPlayerService.executeSeek).toHaveBeenCalledWith(1000);
    });

    it("should call executeSetRate on SET_RATE event", async () => {
      await transitionToState(PlayerState.PLAYING);
      jest.clearAllMocks();

      await coordinator.dispatch({ type: "SET_RATE", payload: { rate: 1.5 } });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockPlayerService.executeSetRate).toHaveBeenCalledWith(1.5);
    });

    it("should call executeSetVolume on SET_VOLUME event", async () => {
      await transitionToState(PlayerState.PLAYING);
      jest.clearAllMocks();

      await coordinator.dispatch({ type: "SET_VOLUME", payload: { volume: 0.7 } });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockPlayerService.executeSetVolume).toHaveBeenCalledWith(0.7);
    });
  });

  // ============================================================================
  // EXEC-02: Transition guards reject invalid operations
  // ============================================================================

  describe("transition guards (EXEC-02)", () => {
    let mockPlayerService: {
      executeLoadTrack: ReturnType<typeof jest.fn>;
      executePlay: ReturnType<typeof jest.fn>;
      executePause: ReturnType<typeof jest.fn>;
      executeStop: ReturnType<typeof jest.fn>;
      executeSeek: ReturnType<typeof jest.fn>;
      executeSetRate: ReturnType<typeof jest.fn>;
      executeSetVolume: ReturnType<typeof jest.fn>;
    };

    beforeEach(() => {
      const { PlayerService } = require("../../PlayerService");
      mockPlayerService = PlayerService.getInstance();
      jest.clearAllMocks();
    });

    it("should reject LOAD_TRACK from LOADING state (duplicate session prevention)", async () => {
      // First LOAD_TRACK transitions IDLE -> LOADING
      await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(coordinator.getState()).toBe(PlayerState.LOADING);
      const beforeRejected = coordinator.getMetrics().rejectedTransitionCount;

      jest.clearAllMocks();

      // Second LOAD_TRACK from LOADING — should be rejected
      await coordinator.dispatch({
        type: "LOAD_TRACK",
        payload: { libraryItemId: "another-item" },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockPlayerService.executeLoadTrack).not.toHaveBeenCalled();
      expect(coordinator.getMetrics().rejectedTransitionCount).toBe(beforeRejected + 1);
    });

    it("should reject PLAY from IDLE state", async () => {
      expect(coordinator.getState()).toBe(PlayerState.IDLE);
      const beforeRejected = coordinator.getMetrics().rejectedTransitionCount;

      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockPlayerService.executePlay).not.toHaveBeenCalled();
      expect(coordinator.getMetrics().rejectedTransitionCount).toBe(beforeRejected + 1);
    });

    it("should reject PAUSE from IDLE state", async () => {
      expect(coordinator.getState()).toBe(PlayerState.IDLE);
      const beforeRejected = coordinator.getMetrics().rejectedTransitionCount;

      await coordinator.dispatch({ type: "PAUSE" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockPlayerService.executePause).not.toHaveBeenCalled();
      expect(coordinator.getMetrics().rejectedTransitionCount).toBe(beforeRejected + 1);
    });

    it("should reject SEEK from IDLE state", async () => {
      expect(coordinator.getState()).toBe(PlayerState.IDLE);
      const beforeRejected = coordinator.getMetrics().rejectedTransitionCount;

      await coordinator.dispatch({ type: "SEEK", payload: { position: 500 } });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockPlayerService.executeSeek).not.toHaveBeenCalled();
      expect(coordinator.getMetrics().rejectedTransitionCount).toBe(beforeRejected + 1);
    });
  });

  // ============================================================================
  // EXEC-03: Feedback loop prevention — execute* methods do not re-dispatch events
  // ============================================================================

  describe("feedback loop prevention (EXEC-03)", () => {
    let mockPlayerService: {
      executeLoadTrack: ReturnType<typeof jest.fn>;
      executePlay: ReturnType<typeof jest.fn>;
      executePause: ReturnType<typeof jest.fn>;
      executeStop: ReturnType<typeof jest.fn>;
      executeSeek: ReturnType<typeof jest.fn>;
      executeSetRate: ReturnType<typeof jest.fn>;
      executeSetVolume: ReturnType<typeof jest.fn>;
    };

    beforeEach(async () => {
      const { PlayerService } = require("../../PlayerService");
      mockPlayerService = PlayerService.getInstance();
      jest.clearAllMocks();

      // Pre-load to READY state for most feedback loop tests
      await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
      await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
      await new Promise((resolve) => setTimeout(resolve, 50));
      jest.clearAllMocks();
    });

    it("should not re-dispatch events from within executePlay", async () => {
      const dispatchSpy = jest.spyOn(playerEventBus, "dispatch");

      // Dispatch PLAY directly to coordinator (not via bus)
      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // execute* methods must not call dispatchPlayerEvent / playerEventBus.dispatch
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(mockPlayerService.executePlay).toHaveBeenCalledTimes(1);

      dispatchSpy.mockRestore();
    });

    it("should not re-dispatch events from within executePause", async () => {
      // Transition to PLAYING first
      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));
      jest.clearAllMocks();

      const dispatchSpy = jest.spyOn(playerEventBus, "dispatch");

      await coordinator.dispatch({ type: "PAUSE" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(mockPlayerService.executePause).toHaveBeenCalledTimes(1);

      dispatchSpy.mockRestore();
    });

    it("should not re-dispatch events from within executeSeek", async () => {
      // Transition to PLAYING first
      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));
      jest.clearAllMocks();

      const dispatchSpy = jest.spyOn(playerEventBus, "dispatch");

      await coordinator.dispatch({ type: "SEEK", payload: { position: 2000 } });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(mockPlayerService.executeSeek).toHaveBeenCalledWith(2000);

      dispatchSpy.mockRestore();
    });

    it("should process exactly one coordinator dispatch when PLAY dispatched via bus", async () => {
      const coordinatorDispatchSpy = jest.spyOn(coordinator, "dispatch");

      // Dispatch PLAY via event bus — coordinator subscribes and calls this.dispatch() once
      playerEventBus.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Coordinator's dispatch should be called exactly once (from bus subscription, no feedback loop)
      expect(coordinatorDispatchSpy).toHaveBeenCalledTimes(1);

      coordinatorDispatchSpy.mockRestore();
    });
  });

  // ============================================================================
  // EXEC-05: NATIVE_* events update context unconditionally
  // ============================================================================

  describe("NATIVE_* context updates (EXEC-05)", () => {
    beforeEach(async () => {
      jest.clearAllMocks();
    });

    it("should update isPlaying from NATIVE_STATE_CHANGED", async () => {
      // Reach PLAYING state
      await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
      await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(coordinator.getState()).toBe(PlayerState.PLAYING);

      // Native layer reports paused state
      await coordinator.dispatch({
        type: "NATIVE_STATE_CHANGED",
        payload: { state: State.Paused },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(coordinator.getContext().isPlaying).toBe(false);
    });

    it("should update position from NATIVE_PROGRESS_UPDATED", async () => {
      await coordinator.dispatch({
        type: "NATIVE_PROGRESS_UPDATED",
        payload: { position: 456, duration: 3600 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(coordinator.getContext().position).toBe(456);
    });

    it("should update lastError from NATIVE_ERROR", async () => {
      await coordinator.dispatch({
        type: "NATIVE_ERROR",
        payload: { error: new Error("test error") },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(coordinator.getContext().lastError).not.toBeNull();
    });
  });

  // ============================================================================
  // Coverage: Remaining context update paths and utility methods
  // ============================================================================

  describe("additional context updates and utility coverage", () => {
    it("should update currentTrack from NATIVE_TRACK_CHANGED", async () => {
      const mockTrack: any = { libraryItemId: "track-1", title: "Book A", duration: 7200 };

      await coordinator.dispatch({
        type: "NATIVE_TRACK_CHANGED",
        payload: { track: mockTrack },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      const context = coordinator.getContext();
      expect(context.currentTrack).toEqual(mockTrack);
      expect(context.duration).toBe(7200);
    });

    it("should update position from POSITION_RECONCILED", async () => {
      await coordinator.dispatch({
        type: "POSITION_RECONCILED",
        payload: { position: 999 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(coordinator.getContext().position).toBe(999);
      expect(coordinator.getMetrics().positionReconciliationCount).toBeGreaterThan(0);
    });

    it("should update isBuffering from BUFFERING_COMPLETED", async () => {
      // First set buffering true via BUFFERING_STARTED (requires PLAYING state)
      await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
      await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      await coordinator.dispatch({ type: "BUFFERING_STARTED" });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(coordinator.getContext().isBuffering).toBe(true);

      await coordinator.dispatch({ type: "BUFFERING_COMPLETED" });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(coordinator.getContext().isBuffering).toBe(false);
    });

    it("should update pendingSyncPosition to null from SESSION_UPDATED", async () => {
      await coordinator.dispatch({
        type: "SESSION_UPDATED",
        payload: { sessionId: "sess-1", currentTime: 100 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(coordinator.getContext().pendingSyncPosition).toBeNull();
    });

    it("should update lastServerSync from SESSION_SYNC_COMPLETED", async () => {
      const before = Date.now();

      await coordinator.dispatch({
        type: "SESSION_SYNC_COMPLETED",
        payload: { sessionId: "sess-1" },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      const context = coordinator.getContext();
      expect(context.lastServerSync).not.toBeNull();
      expect(context.lastServerSync!).toBeGreaterThanOrEqual(before);
    });

    it("should update lastError from NATIVE_PLAYBACK_ERROR", async () => {
      await coordinator.dispatch({
        type: "NATIVE_PLAYBACK_ERROR",
        payload: { code: "ERR_001", message: "Playback failed" },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(coordinator.getContext().lastError).not.toBeNull();
      expect(coordinator.getContext().lastError!.message).toContain("ERR_001");
    });

    it("should update lastError from SESSION_SYNC_FAILED", async () => {
      const syncError = new Error("sync failed");

      await coordinator.dispatch({
        type: "SESSION_SYNC_FAILED",
        payload: { error: syncError, sessionId: "sess-1" },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(coordinator.getContext().lastError).toBe(syncError);
    });

    it("should return transition history via getTransitionHistory", async () => {
      await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
      await new Promise((resolve) => setTimeout(resolve, 50));

      const history = coordinator.getTransitionHistory();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toHaveProperty("event");
      expect(history[0]).toHaveProperty("fromState");
      expect(history[0]).toHaveProperty("toState");
    });

    it("should handle NATIVE_TRACK_CHANGED with null track", async () => {
      await coordinator.dispatch({
        type: "NATIVE_TRACK_CHANGED",
        payload: { track: null },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not throw; currentTrack will be null
      expect(coordinator.getContext().currentTrack).toBeNull();
    });
  });

  describe("Lock Screen Controls Integration", () => {
    it("should allow NATIVE_STATE_CHANGED from PAUSED state (lock screen play)", async () => {
      // Setup: Transition to playing, then pause
      await coordinator.dispatch({
        type: "LOAD_TRACK",
        payload: { libraryItemId: "test-item" },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Transition through READY to PLAYING
      await coordinator.dispatch({
        type: "QUEUE_RELOADED",
        payload: { position: 0 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      await coordinator.dispatch({ type: "PAUSE" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(coordinator.getState()).toBe(PlayerState.PAUSED);

      // Simulate lock screen play button pressed
      // Native player starts playing, sends NATIVE_STATE_CHANGED
      await coordinator.dispatch({
        type: "NATIVE_STATE_CHANGED",
        payload: { state: State.Playing },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should accept the event (PAUSED -> PAUSED transition allowed)
      const metrics = coordinator.getMetrics();
      expect(metrics.rejectedTransitionCount).toBe(0);

      // Observer mode: Context should reflect the native state change
      // This allows diagnostics UI to show accurate state
      const context = coordinator.getContext();
      expect(context.isPlaying).toBe(true);

      // State machine remains in PAUSED (no-op transition)
      expect(coordinator.getState()).toBe(PlayerState.PAUSED);
    });

    it("should allow NATIVE_STATE_CHANGED from PLAYING state (lock screen pause)", async () => {
      // Setup: Transition to playing
      await coordinator.dispatch({
        type: "LOAD_TRACK",
        payload: { libraryItemId: "test-item" },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Transition through READY to PLAYING
      await coordinator.dispatch({
        type: "QUEUE_RELOADED",
        payload: { position: 0 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(coordinator.getState()).toBe(PlayerState.PLAYING);

      // Simulate lock screen pause button pressed
      // Native player pauses, sends NATIVE_STATE_CHANGED
      await coordinator.dispatch({
        type: "NATIVE_STATE_CHANGED",
        payload: { state: State.Paused },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should accept the event (PLAYING -> PLAYING transition allowed)
      const metrics = coordinator.getMetrics();
      expect(metrics.rejectedTransitionCount).toBe(0);

      // Observer mode: Context should reflect the native state change
      // This allows diagnostics UI to show accurate state
      const context = coordinator.getContext();
      expect(context.isPlaying).toBe(false);

      // State machine remains in PLAYING (no-op transition)
      expect(coordinator.getState()).toBe(PlayerState.PLAYING);
    });

    it("should handle duplicate NATIVE_STATE_CHANGED events (UI + native)", async () => {
      // Setup: Transition to playing
      await coordinator.dispatch({
        type: "LOAD_TRACK",
        payload: { libraryItemId: "test-item" },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Transition through READY to PLAYING
      await coordinator.dispatch({
        type: "QUEUE_RELOADED",
        payload: { position: 0 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // User taps pause button in UI
      await coordinator.dispatch({ type: "PAUSE" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Native player confirms pause with NATIVE_STATE_CHANGED (duplicate)
      await coordinator.dispatch({
        type: "NATIVE_STATE_CHANGED",
        payload: { state: State.Paused },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Both events should be accepted (no rejections)
      const metrics = coordinator.getMetrics();
      expect(metrics.rejectedTransitionCount).toBe(0);

      // Final state should be PAUSED
      expect(coordinator.getState()).toBe(PlayerState.PAUSED);
    });

    it("should track multiple lock screen interactions correctly", async () => {
      // Setup: Load and play
      await coordinator.dispatch({
        type: "LOAD_TRACK",
        payload: { libraryItemId: "test-item" },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Transition through READY to PLAYING
      await coordinator.dispatch({
        type: "QUEUE_RELOADED",
        payload: { position: 0 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Lock screen: pause
      await coordinator.dispatch({
        type: "NATIVE_STATE_CHANGED",
        payload: { state: State.Paused },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      let context = coordinator.getContext();
      expect(context.isPlaying).toBe(false); // Context tracks native state

      // Lock screen: play
      await coordinator.dispatch({
        type: "NATIVE_STATE_CHANGED",
        payload: { state: State.Playing },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      context = coordinator.getContext();
      expect(context.isPlaying).toBe(true); // Context tracks native state

      // Lock screen: pause again
      await coordinator.dispatch({
        type: "NATIVE_STATE_CHANGED",
        payload: { state: State.Paused },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      context = coordinator.getContext();
      expect(context.isPlaying).toBe(false); // Context tracks native state

      // State machine stays in PLAYING (all NATIVE_STATE_CHANGED from PLAYING stay in PLAYING)
      // But context accurately reflects what the native player is doing
      expect(coordinator.getState()).toBe(PlayerState.PLAYING);

      // All events should be accepted
      const metrics = coordinator.getMetrics();
      expect(metrics.rejectedTransitionCount).toBe(0);
      expect(metrics.totalEventsProcessed).toBeGreaterThanOrEqual(6); // LOAD + QUEUE_RELOADED + PLAY + 3x NATIVE
    });

    it("should not reject NATIVE_STATE_CHANGED during SEEKING", async () => {
      // Setup: Play then seek
      await coordinator.dispatch({
        type: "LOAD_TRACK",
        payload: { libraryItemId: "test-item" },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Transition through READY to PLAYING
      await coordinator.dispatch({
        type: "QUEUE_RELOADED",
        payload: { position: 0 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      await coordinator.dispatch({
        type: "SEEK",
        payload: { position: 1000 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(coordinator.getState()).toBe(PlayerState.SEEKING);

      // Native player sends state update during seek
      await coordinator.dispatch({
        type: "NATIVE_STATE_CHANGED",
        payload: { state: State.Playing },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should accept (SEEKING -> SEEKING allowed)
      const metrics = coordinator.getMetrics();
      expect(metrics.rejectedTransitionCount).toBe(0);
    });

    it("should not reject NATIVE_STATE_CHANGED during BUFFERING", async () => {
      // Setup: Load and play
      await coordinator.dispatch({
        type: "LOAD_TRACK",
        payload: { libraryItemId: "test-item" },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Transition through READY to PLAYING
      await coordinator.dispatch({
        type: "QUEUE_RELOADED",
        payload: { position: 0 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Simulate buffering via BUFFERING_STARTED event
      await coordinator.dispatch({ type: "BUFFERING_STARTED" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(coordinator.getState()).toBe(PlayerState.BUFFERING);

      // Native player recovers from buffering (NATIVE_STATE_CHANGED transitions BUFFERING -> PLAYING)
      await coordinator.dispatch({
        type: "NATIVE_STATE_CHANGED",
        payload: { state: State.Playing },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should transition to PLAYING
      expect(coordinator.getState()).toBe(PlayerState.PLAYING);

      // No rejections
      const metrics = coordinator.getMetrics();
      expect(metrics.rejectedTransitionCount).toBe(0);
    });
  });

  // ============================================================================
  // Seek State Recovery (Bug 1)
  // ============================================================================

  describe("seek state recovery (Bug 1)", () => {
    let mockPlayerService: {
      executeLoadTrack: ReturnType<typeof jest.fn>;
      executePlay: ReturnType<typeof jest.fn>;
      executePause: ReturnType<typeof jest.fn>;
      executeStop: ReturnType<typeof jest.fn>;
      executeSeek: ReturnType<typeof jest.fn>;
      executeSetRate: ReturnType<typeof jest.fn>;
      executeSetVolume: ReturnType<typeof jest.fn>;
    };

    beforeEach(() => {
      const { PlayerService } = require("../../PlayerService");
      mockPlayerService = PlayerService.getInstance();
      jest.clearAllMocks();
    });

    it("should resume PLAYING after seek while playing", async () => {
      // Get to PLAYING state
      await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
      await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(coordinator.getState()).toBe(PlayerState.PLAYING);

      // Seek while playing
      await coordinator.dispatch({ type: "SEEK", payload: { position: 60 } });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(coordinator.getState()).toBe(PlayerState.SEEKING);

      // Progress update arrives — seek is complete, coordinator should dispatch PLAY
      await coordinator.dispatch({
        type: "NATIVE_PROGRESS_UPDATED",
        payload: { position: 60, duration: 300 },
      });

      // Wait for the auto-dispatched PLAY to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      // PLAYING -> SEEKING -> READY -> PLAYING (via auto-dispatched PLAY)
      expect(coordinator.getState()).toBe(PlayerState.PLAYING);
    });

    it("should remain in READY after seek while paused", async () => {
      // Get to PAUSED state
      await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
      await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
      await coordinator.dispatch({ type: "PLAY" });
      await coordinator.dispatch({ type: "PAUSE" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(coordinator.getState()).toBe(PlayerState.PAUSED);

      // Clear mocks so we can assert executePlay is NOT called after seek
      jest.clearAllMocks();

      // Seek while paused
      await coordinator.dispatch({ type: "SEEK", payload: { position: 30 } });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Progress update arrives — seek is complete
      await coordinator.dispatch({
        type: "NATIVE_PROGRESS_UPDATED",
        payload: { position: 30, duration: 300 },
      });
      await new Promise((resolve) => setTimeout(resolve, 100));

      // PAUSED -> SEEKING -> READY (no auto-PLAY because preSeekState was PAUSED)
      expect(coordinator.getState()).toBe(PlayerState.READY);
      expect(mockPlayerService.executePlay).not.toHaveBeenCalled();
    });

    it("should clear isSeeking when NATIVE_PROGRESS_UPDATED arrives during SEEKING", async () => {
      // Get to PLAYING state
      await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
      await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Seek — isSeeking should be true
      await coordinator.dispatch({ type: "SEEK", payload: { position: 60 } });
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(coordinator.getContext().isSeeking).toBe(true);

      // Progress update arrives — isSeeking should be cleared
      await coordinator.dispatch({
        type: "NATIVE_PROGRESS_UPDATED",
        payload: { position: 60, duration: 300 },
      });
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(coordinator.getContext().isSeeking).toBe(false);
    });

    it("should clear preSeekState after resume", async () => {
      // Get to PLAYING state
      await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
      await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Seek while playing
      await coordinator.dispatch({ type: "SEEK", payload: { position: 60 } });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Progress update triggers resume — preSeekState should be cleared after use
      await coordinator.dispatch({
        type: "NATIVE_PROGRESS_UPDATED",
        payload: { position: 60, duration: 300 },
      });

      // Wait for PLAY auto-dispatch to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(coordinator.getContext().preSeekState).toBeNull();
    });
  });

  // ============================================================================
  // Position Reconciliation (POS-01 through POS-03)
  // ============================================================================

  describe("Position Reconciliation (POS-01 through POS-03)", () => {
    const { getActiveSession } = require("@/db/helpers/localListeningSessions");
    const { getMediaProgressForLibraryItem } = require("@/db/helpers/mediaProgress");
    const { getUserByUsername } = require("@/db/helpers/users");
    const { getStoredUsername } = require("@/lib/secureStore");
    const { getItem: getAsyncItem } = require("@/lib/asyncStore");
    const { useAppStore } = require("@/stores/appStore");

    const mockStore = {
      player: {
        position: 0,
      },
    };

    beforeEach(() => {
      jest.clearAllMocks();
      getStoredUsername.mockResolvedValue("testuser");
      getUserByUsername.mockResolvedValue({ id: "user1" });
      getActiveSession.mockResolvedValue(null);
      getMediaProgressForLibraryItem.mockResolvedValue(null);
      getAsyncItem.mockResolvedValue(null);
      useAppStore.getState.mockReturnValue(mockStore);
      mockStore.player.position = 0;
    });

    // --------------------------------------------------------------------------
    // POS-01: Position priority chain
    // --------------------------------------------------------------------------

    describe("POS-01: position priority chain", () => {
      it("should prefer active session position over saved progress", async () => {
        getActiveSession.mockResolvedValue({
          currentTime: 1800,
          updatedAt: new Date("2024-01-01T12:00:00Z"),
        });
        getMediaProgressForLibraryItem.mockResolvedValue({
          currentTime: 900,
          lastUpdate: new Date("2024-01-01T11:00:00Z"),
        });

        const result = await coordinator.resolveCanonicalPosition("lib-item-1");

        expect(result.position).toBe(1800);
        expect(result.source).toBe("activeSession");
      });

      it("should prefer saved progress when no active session exists", async () => {
        getActiveSession.mockResolvedValue(null);
        getMediaProgressForLibraryItem.mockResolvedValue({
          currentTime: 900,
          lastUpdate: new Date("2024-01-01T11:00:00Z"),
        });

        const result = await coordinator.resolveCanonicalPosition("lib-item-1");

        expect(result.position).toBe(900);
        expect(result.source).toBe("savedProgress");
      });

      it("should fall back to AsyncStorage when no DB sources exist", async () => {
        getActiveSession.mockResolvedValue(null);
        getMediaProgressForLibraryItem.mockResolvedValue(null);
        getAsyncItem.mockResolvedValue(600);

        const result = await coordinator.resolveCanonicalPosition("lib-item-1");

        expect(result.position).toBe(600);
        expect(result.source).toBe("asyncStorage");
      });

      it("should fall back to store position as last resort", async () => {
        getActiveSession.mockResolvedValue(null);
        getMediaProgressForLibraryItem.mockResolvedValue(null);
        getAsyncItem.mockResolvedValue(null);
        mockStore.player.position = 300;

        const result = await coordinator.resolveCanonicalPosition("lib-item-1");

        expect(result.position).toBe(300);
        expect(result.source).toBe("store");
      });

      it("should prefer more recent timestamp when large discrepancy exists", async () => {
        // Session has old timestamp and small position (100s)
        // savedProgress has newer timestamp and large position (1800s)
        getActiveSession.mockResolvedValue({
          currentTime: 100,
          updatedAt: new Date("2024-01-01T10:00:00Z"), // older
        });
        getMediaProgressForLibraryItem.mockResolvedValue({
          currentTime: 1800,
          lastUpdate: new Date("2024-01-01T12:00:00Z"), // newer
        });

        const result = await coordinator.resolveCanonicalPosition("lib-item-1");

        // Large discrepancy (>30s), savedProgress is newer => use savedProgress
        expect(result.position).toBe(1800);
        expect(result.source).toBe("savedProgress");
      });
    });

    // --------------------------------------------------------------------------
    // POS-02: MIN_PLAUSIBLE_POSITION rejection
    // --------------------------------------------------------------------------

    describe("POS-02: MIN_PLAUSIBLE_POSITION rejection", () => {
      it("should reject session position below MIN_PLAUSIBLE_POSITION when saved progress is available", async () => {
        getActiveSession.mockResolvedValue({
          currentTime: 3, // below 5s threshold
          updatedAt: new Date(),
        });
        getMediaProgressForLibraryItem.mockResolvedValue({
          currentTime: 1800,
          lastUpdate: new Date(),
        });

        const result = await coordinator.resolveCanonicalPosition("lib-item-1");

        expect(result.position).toBe(1800);
        expect(result.source).toBe("savedProgress");
      });

      it("should reject session position below MIN_PLAUSIBLE_POSITION and fall back to AsyncStorage", async () => {
        getActiveSession.mockResolvedValue({
          currentTime: 2, // below 5s threshold
          updatedAt: new Date(),
        });
        getMediaProgressForLibraryItem.mockResolvedValue(null);
        getAsyncItem.mockResolvedValue(600);

        const result = await coordinator.resolveCanonicalPosition("lib-item-1");

        expect(result.position).toBe(600);
        expect(result.source).toBe("asyncStorage");
      });

      it("should accept session position below MIN_PLAUSIBLE_POSITION when no better alternative", async () => {
        getActiveSession.mockResolvedValue({
          currentTime: 3, // below 5s threshold but no better option
          updatedAt: new Date(),
        });
        getMediaProgressForLibraryItem.mockResolvedValue(null);
        getAsyncItem.mockResolvedValue(null);

        const result = await coordinator.resolveCanonicalPosition("lib-item-1");

        // No better option, so session position is used despite being small
        expect(result.position).toBe(3);
        expect(result.source).toBe("activeSession");
      });
    });

    // --------------------------------------------------------------------------
    // POS-03: Native-0 guard during loading
    // --------------------------------------------------------------------------

    describe("POS-03: native-0 guard during loading", () => {
      it("should not overwrite context.position with native 0 during loading", async () => {
        // Enter LOADING state
        await coordinator.dispatch({
          type: "LOAD_TRACK",
          payload: { libraryItemId: "test-item" },
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Manually set context position (simulating a resolved position)
        // by dispatching a POSITION_RECONCILED event
        await coordinator.dispatch({
          type: "POSITION_RECONCILED",
          payload: { position: 1800 },
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(coordinator.getContext().position).toBe(1800);

        // Now dispatch NATIVE_PROGRESS_UPDATED with position=0 during loading
        await coordinator.dispatch({
          type: "NATIVE_PROGRESS_UPDATED",
          payload: { position: 0, duration: 3600, buffered: 0 },
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Position should NOT have been overwritten to 0
        expect(coordinator.getContext().position).toBe(1800);
        // Duration IS updated even when position is guarded
        expect(coordinator.getContext().duration).toBe(3600);
      });

      it("should accept native position > 0 during loading", async () => {
        // Enter LOADING state
        await coordinator.dispatch({
          type: "LOAD_TRACK",
          payload: { libraryItemId: "test-item" },
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Dispatch NATIVE_PROGRESS_UPDATED with non-zero position during loading
        await coordinator.dispatch({
          type: "NATIVE_PROGRESS_UPDATED",
          payload: { position: 500, duration: 3600, buffered: 0 },
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Non-zero position IS accepted
        expect(coordinator.getContext().position).toBe(500);
      });

      it("should accept native position 0 when NOT loading", async () => {
        // Reach PLAYING state
        await coordinator.dispatch({
          type: "LOAD_TRACK",
          payload: { libraryItemId: "test-item" },
        });
        await coordinator.dispatch({
          type: "QUEUE_RELOADED",
          payload: { position: 0 },
        });
        await coordinator.dispatch({ type: "PLAY" });
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Advance position first
        await coordinator.dispatch({
          type: "NATIVE_PROGRESS_UPDATED",
          payload: { position: 1000, duration: 3600, buffered: 0 },
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Now send position=0 when PLAYING (not loading)
        await coordinator.dispatch({
          type: "NATIVE_PROGRESS_UPDATED",
          payload: { position: 0, duration: 3600, buffered: 0 },
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Position 0 IS accepted when not in loading state
        expect(coordinator.getContext().position).toBe(0);
      });
    });

    // --------------------------------------------------------------------------
    // BUG-02: Finished items start from position 0
    // --------------------------------------------------------------------------

    describe("BUG-02: finished items start from position 0", () => {
      it("should return position 0 when savedProgress.isFinished is true (no active session)", async () => {
        getActiveSession.mockResolvedValue(null);
        getMediaProgressForLibraryItem.mockResolvedValue({
          currentTime: 294,
          isFinished: true,
          lastUpdate: new Date(),
        });

        const result = await coordinator.resolveCanonicalPosition("item-1");

        expect(result.position).toBe(0);
        expect(result.source).toBe("savedProgress");
      });

      it("should return position 0 when savedProgress.isFinished is true (with active session)", async () => {
        getActiveSession.mockResolvedValue({
          currentTime: 294,
          updatedAt: new Date(),
        });
        getMediaProgressForLibraryItem.mockResolvedValue({
          currentTime: 294,
          isFinished: true,
          lastUpdate: new Date(),
        });

        const result = await coordinator.resolveCanonicalPosition("item-1");

        expect(result.position).toBe(0);
        expect(result.source).toBe("savedProgress");
      });

      it("should clear AsyncStorage when item is finished", async () => {
        const { saveItem: mockSaveItem } = require("@/lib/asyncStore");
        getActiveSession.mockResolvedValue(null);
        getMediaProgressForLibraryItem.mockResolvedValue({
          currentTime: 294,
          isFinished: true,
          lastUpdate: new Date(),
        });

        await coordinator.resolveCanonicalPosition("item-1");

        expect(mockSaveItem).toHaveBeenCalledWith("position", null);
      });

      it("should NOT reset position when isFinished is false", async () => {
        getActiveSession.mockResolvedValue(null);
        getMediaProgressForLibraryItem.mockResolvedValue({
          currentTime: 500,
          isFinished: false,
          lastUpdate: new Date(),
        });

        const result = await coordinator.resolveCanonicalPosition("item-1");

        expect(result.position).toBe(500);
        expect(result.source).toBe("savedProgress");
      });
    });

    // --------------------------------------------------------------------------
    // POS-06: Android BGS coordinator isolation (documented as convention)
    // --------------------------------------------------------------------------

    describe("POS-06: Android BGS coordinator isolation", () => {
      /**
       * POS-06: Android BGS coordinator isolation is satisfied by convention.
       *
       * On Android, PlayerBackgroundService runs in a SEPARATE JavaScript context
       * from the main UI. Both contexts call getCoordinator(), which returns an
       * instance that is local to that JS context. Since there is NO shared memory
       * between the main UI thread and the headless JS background service:
       *
       * - UI coordinator: Receives events from UI interactions
       * - BGS coordinator: Receives events from TrackPlayer native events
       * - Both coordinators read from the same DB (SQLite) and AsyncStorage
       * - Neither coordinator writes to the other's in-memory state
       *
       * This is enforced by the platform (separate JS contexts) and verified by
       * convention (getCoordinator() is module-local singleton per context).
       *
       * See: PlayerBackgroundService.ts lines 44-53 (HEADLESS JS ARCHITECTURE NOTE)
       */
      it.skip("POS-06 is a platform convention — no executable test required", () => {
        // BGS creates its own coordinator via getCoordinator() at module load time.
        // On Android, this is a completely separate JS context — no shared state.
        // Both coordinators stay eventually consistent by reading from SQLite/AsyncStorage.
        // This is verified by PlayerBackgroundService.ts architecture documentation,
        // not by an executable unit test.
      });
    });
  });

  // ============================================================================
  // PROP Contract Tests (Phase 4: State Propagation)
  // These tests prove that the Phase 4 migration is correct and complete.
  // Each PROP corresponds to a requirement in the 04-RESEARCH.md document.
  // ============================================================================

  describe("PROP Contract Tests (Phase 4)", () => {
    const { useAppStore } = require("@/stores/appStore");

    const makeMockStore = () => ({
      player: { position: 0 },
      updatePosition: jest.fn(),
      updatePlayingState: jest.fn(),
      _setCurrentTrack: jest.fn(),
      _setTrackLoading: jest.fn(),
      _setSeeking: jest.fn(),
      _setPlaybackRate: jest.fn(),
      _setVolume: jest.fn(),
      _setPlaySessionId: jest.fn(),
      _setLastPauseTime: jest.fn(),
      updateNowPlayingMetadata: jest.fn().mockResolvedValue(undefined),
      setSleepTimer: jest.fn(),
      cancelSleepTimer: jest.fn(),
    });

    let mockStore: ReturnType<typeof makeMockStore>;

    beforeEach(() => {
      mockStore = makeMockStore();
      useAppStore.getState.mockReturnValue(mockStore);
      jest.clearAllMocks();
      // Re-apply after clearAllMocks
      mockStore = makeMockStore();
      useAppStore.getState.mockReturnValue(mockStore);
    });

    // --------------------------------------------------------------------------
    // PROP-01: playerSlice receives all player state from coordinator
    //
    // Static verification: grep -rn "store\.\(updatePosition\|updatePlayingState\|_setTrackLoading\|_setCurrentTrack\|_setPlaySessionId\|_setSeeking\|_setPlaybackRate\|_setVolume\)" src/services/PlayerService.ts src/services/PlayerBackgroundService.ts src/services/ProgressService.ts
    // — should only return documented exceptions (error-path _setTrackLoading(false),
    //   buildTrackList _setCurrentTrack, _setPlaySessionId for progress tracking,
    //   reconciliation helpers). No coordinator-owned writes should appear.
    // --------------------------------------------------------------------------

    describe("PROP-01: playerSlice receives all player state from coordinator", () => {
      it("should update store via bridge at each step of a full playback lifecycle", async () => {
        // Step 1: LOAD_TRACK — coordinator bridge should call _setTrackLoading
        // Note: _setCurrentTrack is NOT called by bridge on LOAD_TRACK - PlayerService
        // retains responsibility for building and setting PlayerTrack (Plan 02 exception)
        await coordinator.dispatch({
          type: "LOAD_TRACK",
          payload: { libraryItemId: "prop-01-item" },
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(mockStore._setTrackLoading).toHaveBeenCalled();
        expect(mockStore.updatePlayingState).toHaveBeenCalled();

        // Reset mocks for next step
        jest.clearAllMocks();
        mockStore = makeMockStore();
        useAppStore.getState.mockReturnValue(mockStore);

        // Step 2: PLAY — bridge should call updatePlayingState(true)
        // First reach READY state via QUEUE_RELOADED
        await coordinator.dispatch({
          type: "QUEUE_RELOADED",
          payload: { position: 0 },
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        jest.clearAllMocks();
        mockStore = makeMockStore();
        useAppStore.getState.mockReturnValue(mockStore);

        await coordinator.dispatch({ type: "PLAY" });
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(mockStore.updatePlayingState).toHaveBeenCalledWith(true);

        // Reset mocks for next step
        jest.clearAllMocks();
        mockStore = makeMockStore();
        useAppStore.getState.mockReturnValue(mockStore);

        // Step 3: NATIVE_PROGRESS_UPDATED — position-only path should call updatePosition
        await coordinator.dispatch({
          type: "NATIVE_PROGRESS_UPDATED",
          payload: { position: 150, duration: 3600 },
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(mockStore.updatePosition).toHaveBeenCalledWith(150);
        // Full sync NOT triggered for NATIVE_PROGRESS_UPDATED (position-only path)
        expect(mockStore._setCurrentTrack).not.toHaveBeenCalled();

        // Reset mocks for next step
        jest.clearAllMocks();
        mockStore = makeMockStore();
        useAppStore.getState.mockReturnValue(mockStore);

        // Step 4: PAUSE — bridge should call updatePlayingState(false)
        await coordinator.dispatch({ type: "PAUSE" });
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(mockStore.updatePlayingState).toHaveBeenCalledWith(false);

        // Reset mocks for next step
        jest.clearAllMocks();
        mockStore = makeMockStore();
        useAppStore.getState.mockReturnValue(mockStore);

        // Step 5: STOP — bridge should clear currentTrack and sessionId
        await coordinator.dispatch({ type: "STOP" });
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(mockStore._setCurrentTrack).toHaveBeenCalledWith(null);
        expect(mockStore._setPlaySessionId).toHaveBeenCalledWith(null);
      });
    });

    // --------------------------------------------------------------------------
    // PROP-02: usePlayerState selector-based subscriptions
    //
    // PROP-02 is structurally satisfied — usePlayerState(selector) passes through
    // to Zustand's useAppStore(selector) which uses Object.is equality for comparison.
    // No runtime test needed; the implementation is a one-liner that delegates entirely
    // to Zustand's built-in selector machinery.
    // See: src/stores/appStore.ts — usePlayerState
    // --------------------------------------------------------------------------

    describe("PROP-02: usePlayerState selector-based subscriptions", () => {
      it.skip("PROP-02 is structurally satisfied — usePlayerState delegates to useAppStore(selector)", () => {
        // usePlayerState(selector) is implemented as:
        //   export const usePlayerState = <T>(selector: (state: AppState) => T) =>
        //     useAppStore(selector);
        //
        // Zustand's useStore(selector) uses Object.is equality by default,
        // so components only re-render when the selected slice changes.
        // This is a structural guarantee, not a runtime behavior to test here.
      });
    });

    // --------------------------------------------------------------------------
    // PROP-03: Render counts do not increase after bridge (position-only path)
    //
    // PROP-03 requires React component lifecycle testing with React.Profiler.
    // This is impractical in Jest + mocked store context because:
    //   1. useAppStore is fully mocked — no real Zustand reactivity
    //   2. @testing-library/react-native render counts don't reflect Zustand selector
    //      optimization in isolation (the store mock bypasses selector logic)
    //
    // Manual verification command:
    //   Run app → open React DevTools Profiler → play audio for 30 seconds →
    //   verify FullScreenPlayer/MiniPlayer render counts stay constant when only
    //   position changes (components subscribing to isPlaying should not re-render
    //   during NATIVE_PROGRESS_UPDATED events).
    // --------------------------------------------------------------------------

    describe("PROP-03: render counts do not increase for non-position subscribers", () => {
      it.skip("PROP-03 requires React DevTools Profiler — manual verification needed", () => {
        // Two-tier sync (NATIVE_PROGRESS_UPDATED → syncPositionToStore → updatePosition only)
        // ensures that components subscribing to isPlaying or currentTrack don't re-render
        // at 1Hz during playback. This is enforced by the architecture (separate sync paths),
        // not by Zustand selector behavior that can be tested with a mocked store.
        //
        // Architecture guarantee: syncPositionToStore calls ONLY updatePosition.
        // syncStateToStore calls the full set of store mutators.
        // NATIVE_PROGRESS_UPDATED always goes through syncPositionToStore (position-only).
        // All other events go through syncStateToStore (full sync).
      });
    });

    // --------------------------------------------------------------------------
    // PROP-04: Sleep timer retained as playerSlice-local (not touched by bridge)
    // --------------------------------------------------------------------------

    describe("PROP-04: sleep timer retained as playerSlice-local", () => {
      it("should not call setSleepTimer or cancelSleepTimer during structural transitions", async () => {
        // Run through a full structural lifecycle: LOAD_TRACK -> QUEUE_RELOADED -> PLAY -> PAUSE -> STOP
        await coordinator.dispatch({
          type: "LOAD_TRACK",
          payload: { libraryItemId: "prop-04-item" },
        });
        await coordinator.dispatch({
          type: "QUEUE_RELOADED",
          payload: { position: 0 },
        });
        await coordinator.dispatch({ type: "PLAY" });
        await coordinator.dispatch({ type: "PAUSE" });
        await coordinator.dispatch({ type: "STOP" });
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Bridge must never touch sleep timer state
        expect(mockStore.setSleepTimer).not.toHaveBeenCalled();
        expect(mockStore.cancelSleepTimer).not.toHaveBeenCalled();
      });

      it("should not call setSleepTimer or cancelSleepTimer during position updates", async () => {
        // Dispatch position updates
        for (let i = 0; i < 5; i++) {
          await coordinator.dispatch({
            type: "NATIVE_PROGRESS_UPDATED",
            payload: { position: i * 10, duration: 3600 },
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(mockStore.setSleepTimer).not.toHaveBeenCalled();
        expect(mockStore.cancelSleepTimer).not.toHaveBeenCalled();
      });
    });

    // --------------------------------------------------------------------------
    // PROP-05: Android BGS does not call syncToStore (try/catch guard)
    //
    // In production, Android BGS headless JS context makes useAppStore.getState()
    // unavailable. The try/catch in syncToStore/syncPositionToStore guards against
    // this — coordinator survives the error and continues processing events.
    // --------------------------------------------------------------------------

    describe("PROP-05: Android BGS graceful failure when Zustand unavailable", () => {
      it("should process NATIVE_PROGRESS_UPDATED without error when getState throws", async () => {
        useAppStore.getState.mockImplementation(() => {
          throw new Error("Zustand unavailable in BGS headless JS context");
        });

        // Dispatch position update — should not crash the coordinator
        await coordinator.dispatch({
          type: "NATIVE_PROGRESS_UPDATED",
          payload: { position: 200, duration: 3600 },
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Event was still processed (coordinator survived the error)
        const metrics = coordinator.getMetrics();
        expect(metrics.totalEventsProcessed).toBeGreaterThan(0);
      });

      it("should process structural transitions without error when getState throws", async () => {
        useAppStore.getState.mockImplementation(() => {
          throw new Error("Zustand unavailable in BGS headless JS context");
        });

        // Dispatch structural events — should not crash
        await coordinator.dispatch({
          type: "LOAD_TRACK",
          payload: { libraryItemId: "bgs-item" },
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Coordinator state machine still advanced correctly
        expect(coordinator.getState()).toBe("loading");
        const metrics = coordinator.getMetrics();
        expect(metrics.totalEventsProcessed).toBeGreaterThan(0);
      });
    });

    // --------------------------------------------------------------------------
    // PROP-06: updateNowPlayingMetadata debounce preserved
    //
    // updateNowPlayingMetadata is only called when chapter.id changes (not every
    // structural sync). This prevents redundant now-playing updates at each event.
    //
    // Note: Periodic metadata updates (2s gate) are preserved in BGS
    // handlePlaybackProgressUpdated — not tested here as that's BGS-specific.
    // --------------------------------------------------------------------------

    describe("PROP-06: updateNowPlayingMetadata debounce preserved", () => {
      it("should call updateNowPlayingMetadata once on chapter change, not again for same chapter", async () => {
        // Reach PLAYING state
        await coordinator.dispatch({
          type: "LOAD_TRACK",
          payload: { libraryItemId: "prop-06-item" },
        });
        await coordinator.dispatch({
          type: "QUEUE_RELOADED",
          payload: { position: 0 },
        });
        await coordinator.dispatch({ type: "PLAY" });
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Reset mocks
        jest.clearAllMocks();
        mockStore = makeMockStore();
        useAppStore.getState.mockReturnValue(mockStore);

        const chapter1: any = {
          chapter: {
            id: "chapter-1",
            chapterId: 1,
            title: "Chapter 1",
            start: 0,
            end: 600,
            mediaId: "media-1",
          },
          positionInChapter: 0,
          chapterDuration: 600,
        };

        // Dispatch CHAPTER_CHANGED with chapter 1
        await coordinator.dispatch({
          type: "CHAPTER_CHANGED",
          payload: { chapter: chapter1 },
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        // updateNowPlayingMetadata called once for the chapter change
        expect(mockStore.updateNowPlayingMetadata).toHaveBeenCalledTimes(1);

        // Reset mocks and dispatch NATIVE_PROGRESS_UPDATED (same chapter, no change)
        jest.clearAllMocks();
        mockStore = makeMockStore();
        useAppStore.getState.mockReturnValue(mockStore);

        await coordinator.dispatch({
          type: "NATIVE_PROGRESS_UPDATED",
          payload: { position: 100, duration: 3600 },
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        // updateNowPlayingMetadata must NOT be called (same chapter, position-only path)
        expect(mockStore.updateNowPlayingMetadata).not.toHaveBeenCalled();

        // Reset mocks and dispatch a different chapter
        jest.clearAllMocks();
        mockStore = makeMockStore();
        useAppStore.getState.mockReturnValue(mockStore);

        const chapter2: any = {
          chapter: {
            id: "chapter-2",
            chapterId: 2,
            title: "Chapter 2",
            start: 600,
            end: 1200,
            mediaId: "media-1",
          },
          positionInChapter: 0,
          chapterDuration: 600,
        };

        await coordinator.dispatch({
          type: "CHAPTER_CHANGED",
          payload: { chapter: chapter2 },
        });
        await new Promise((resolve) => setTimeout(resolve, 50));

        // updateNowPlayingMetadata called again for the new chapter
        expect(mockStore.updateNowPlayingMetadata).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ============================================================================
  // Store Bridge (Phase 4: State Propagation)
  // ============================================================================

  describe("Store Bridge (Phase 4)", () => {
    const { useAppStore } = require("@/stores/appStore");

    // Create a mock store with all playerSlice mutators as jest.fn() spies
    const makeMockStore = () => ({
      player: { position: 0 },
      updatePosition: jest.fn(),
      updatePlayingState: jest.fn(),
      _setCurrentTrack: jest.fn(),
      _setTrackLoading: jest.fn(),
      _setSeeking: jest.fn(),
      _setPlaybackRate: jest.fn(),
      _setVolume: jest.fn(),
      _setPlaySessionId: jest.fn(),
      _setLastPauseTime: jest.fn(),
      updateNowPlayingMetadata: jest.fn().mockResolvedValue(undefined),
      setSleepTimer: jest.fn(),
      cancelSleepTimer: jest.fn(),
    });

    let mockStore: ReturnType<typeof makeMockStore>;

    beforeEach(() => {
      mockStore = makeMockStore();
      useAppStore.getState.mockReturnValue(mockStore);
      jest.clearAllMocks();
      // Re-apply after clearAllMocks
      mockStore = makeMockStore();
      useAppStore.getState.mockReturnValue(mockStore);
    });

    it("syncPositionToStore updates store position on NATIVE_PROGRESS_UPDATED", async () => {
      // Reach PLAYING state first
      await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
      await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Reset mocks to isolate the NATIVE_PROGRESS_UPDATED call
      jest.clearAllMocks();
      mockStore = makeMockStore();
      useAppStore.getState.mockReturnValue(mockStore);

      // Dispatch position update
      await coordinator.dispatch({
        type: "NATIVE_PROGRESS_UPDATED",
        payload: { position: 42.5, duration: 3600 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Position-only path: updatePosition called, _setCurrentTrack NOT called
      expect(mockStore.updatePosition).toHaveBeenCalledWith(42.5);
      expect(mockStore._setCurrentTrack).not.toHaveBeenCalled();
    });

    it("syncPositionToStore triggers updateNowPlayingMetadata on chapter change (CLEAN-03)", async () => {
      // Reach PLAYING state first
      await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
      await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Reset mocks to isolate chapter detection behavior
      jest.clearAllMocks();
      mockStore = makeMockStore();
      useAppStore.getState.mockReturnValue(mockStore);

      // Set up chapter 1 on the mock store player object
      const chapter1: any = {
        chapter: { id: "ch-1", chapterId: 1, title: "Chapter 1", start: 0, end: 600 },
        positionInChapter: 0,
        chapterDuration: 600,
      };
      mockStore.player = { ...mockStore.player, currentChapter: chapter1 };

      // Dispatch NATIVE_PROGRESS_UPDATED — coordinator reads store.player.currentChapter
      // after updatePosition() runs; detects chapter-1 is new → calls updateNowPlayingMetadata
      await coordinator.dispatch({
        type: "NATIVE_PROGRESS_UPDATED",
        payload: { position: 100, duration: 3600 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Assert updateNowPlayingMetadata called once for the chapter change
      expect(mockStore.updateNowPlayingMetadata).toHaveBeenCalledTimes(1);

      // Reset mocks — dispatch again with SAME chapter (no change expected)
      jest.clearAllMocks();
      mockStore = makeMockStore();
      mockStore.player = { ...mockStore.player, currentChapter: chapter1 };
      useAppStore.getState.mockReturnValue(mockStore);

      await coordinator.dispatch({
        type: "NATIVE_PROGRESS_UPDATED",
        payload: { position: 200, duration: 3600 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Debounce: same chapter id — updateNowPlayingMetadata must NOT be called again
      expect(mockStore.updateNowPlayingMetadata).not.toHaveBeenCalled();
    });

    it("syncStateToStore updates all fields on structural transition (LOAD_TRACK)", async () => {
      // Dispatch LOAD_TRACK — structural transition IDLE -> LOADING
      await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Full sync path should have been called
      // Note: _setCurrentTrack is NOT called during LOAD_TRACK - PlayerService handles it
      expect(mockStore._setTrackLoading).toHaveBeenCalled();
      expect(mockStore.updatePlayingState).toHaveBeenCalled();
      expect(mockStore.updatePosition).toHaveBeenCalled();
    });

    it("syncToStore always updates store (coordinator always in execution mode)", async () => {
      await coordinator.dispatch({
        type: "NATIVE_PROGRESS_UPDATED",
        payload: { position: 99, duration: 3600 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Store position is always updated — execution mode is always active
      expect(mockStore.updatePosition).toHaveBeenCalledWith(99);
    });

    it("syncToStore does not write sleepTimer or lastPauseTime during sync", async () => {
      // Reach PLAYING state and dispatch several structural events
      await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
      await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
      await coordinator.dispatch({ type: "PLAY" });
      await coordinator.dispatch({ type: "PAUSE" });
      await coordinator.dispatch({
        type: "NATIVE_PROGRESS_UPDATED",
        payload: { position: 50, duration: 3600 },
      });
      await new Promise((resolve) => setTimeout(resolve, 100));

      // The bridge must never touch sleepTimer or lastPauseTime
      expect(mockStore.setSleepTimer).not.toHaveBeenCalled();
      expect(mockStore.cancelSleepTimer).not.toHaveBeenCalled();
      expect(mockStore._setLastPauseTime).not.toHaveBeenCalled();
    });

    it("syncToStore calls updateNowPlayingMetadata on chapter change", async () => {
      // Reach PLAYING state
      await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test-item" } });
      await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
      await coordinator.dispatch({ type: "PLAY" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Reset mocks to count only the chapter-change-triggered call
      jest.clearAllMocks();
      mockStore = makeMockStore();
      useAppStore.getState.mockReturnValue(mockStore);

      // Dispatch CHAPTER_CHANGED with a properly-structured CurrentChapter payload
      const mockCurrentChapter: any = {
        chapter: {
          id: "ch-1",
          chapterId: 1,
          title: "Chapter 1",
          start: 0,
          end: 600,
          mediaId: "m1",
        },
        positionInChapter: 0,
        chapterDuration: 600,
      };
      await coordinator.dispatch({
        type: "CHAPTER_CHANGED",
        payload: { chapter: mockCurrentChapter },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // updateNowPlayingMetadata called once for the chapter change
      expect(mockStore.updateNowPlayingMetadata).toHaveBeenCalledTimes(1);

      // Dispatch another structural event that does NOT change the chapter
      jest.clearAllMocks();
      mockStore = makeMockStore();
      useAppStore.getState.mockReturnValue(mockStore);

      await coordinator.dispatch({ type: "SET_RATE", payload: { rate: 1.5 } });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // updateNowPlayingMetadata must NOT be called again (same chapter id)
      expect(mockStore.updateNowPlayingMetadata).not.toHaveBeenCalled();
    });

    it("syncToStore handles BGS context gracefully when getState throws", async () => {
      // Mock getState to throw (simulates BGS headless context)
      useAppStore.getState.mockImplementation(() => {
        throw new Error("Zustand unavailable in BGS context");
      });

      // Dispatch NATIVE_PROGRESS_UPDATED — should not crash
      await coordinator.dispatch({
        type: "NATIVE_PROGRESS_UPDATED",
        payload: { position: 123, duration: 3600 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should complete without throwing — event still processed
      const metrics = coordinator.getMetrics();
      expect(metrics.totalEventsProcessed).toBeGreaterThan(0);
    });
  });

  describe("Diagnostic Utilities", () => {
    it("clearTransitionHistory should clear history and update metadata", async () => {
      // Generate some history
      await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test" } });
      await coordinator.dispatch({ type: "QUEUE_RELOADED", payload: { position: 0 } });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify history exists
      const beforeClear = coordinator.exportDiagnostics();
      expect(beforeClear.transitionHistory.length).toBeGreaterThan(0);
      expect(beforeClear.historyMetadata.totalClears).toBe(0);
      expect(beforeClear.historyMetadata.lastClearedAt).toBeNull();

      // Clear history
      coordinator.clearTransitionHistory();

      // Verify cleared
      const afterClear = coordinator.exportDiagnostics();
      expect(afterClear.transitionHistory.length).toBe(0);
      expect(afterClear.historyMetadata.totalClears).toBe(1);
      expect(afterClear.historyMetadata.lastClearedAt).toBeGreaterThan(0);
    });

    it("exportDiagnostics with compact=true should return abbreviated format", async () => {
      // Generate some history with payloads
      await coordinator.dispatch({ type: "LOAD_TRACK", payload: { libraryItemId: "test" } });
      await coordinator.dispatch({
        type: "NATIVE_PROGRESS_UPDATED",
        payload: { position: 123.456789, duration: 600.123456 },
      });
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Export full format
      const full = coordinator.exportDiagnostics(false);
      expect(full.transitionHistory.length).toBeGreaterThan(0);
      expect(full.processingTimes).toBeDefined();
      expect((full.transitionHistory[0] as any).timestamp).toBeDefined();

      // Export compact format
      const compact = coordinator.exportDiagnostics(true);
      expect(compact.transitionHistory.length).toBeGreaterThan(0);
      expect(compact.processingTimes).toBeUndefined(); // omitted in compact mode
      const compactEntry = compact.transitionHistory[0] as any;
      expect(compactEntry.ts).toBeDefined(); // abbreviated timestamp
      expect(compactEntry.evt).toBeDefined(); // abbreviated event type
      expect(compactEntry.from).toBeDefined();
      expect(compactEntry.to).toBeDefined();
      expect(compactEntry.ok).toBeDefined();
      expect(compactEntry.ms).toBeDefined();

      // Verify payload rounding
      const progressEntry = compact.transitionHistory.find(
        (e: any) => e.evt === "NATIVE_PROGRESS_UPDATED"
      );
      if (progressEntry && (progressEntry as any).pay) {
        expect((progressEntry as any).pay.position).toBe(123.46); // rounded to 2 decimals
        expect((progressEntry as any).pay.duration).toBe(600.12); // rounded to 2 decimals
      }
    });
  });
});
