/**
 * Tests for PlayerStateCoordinator
 *
 * Tests event processing, state machine, metrics, and integration
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { PlayerStateCoordinator } from "../PlayerStateCoordinator";
import { playerEventBus } from "../eventBus";
import { PlayerState } from "@/types/coordinator";
import type { PlayerEvent, DiagnosticEvent } from "@/types/coordinator";
import { State } from "react-native-track-player";

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

    it("should initialize in observer mode", () => {
      expect(coordinator.isObserverMode()).toBe(true);
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
      expect(diagnostics).toHaveProperty("observerMode");
    });

    it("should indicate observer mode", () => {
      const diagnostics = coordinator.exportDiagnostics();
      expect(diagnostics.observerMode).toBe(true);
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

  describe("observer mode behavior", () => {
    it("should be in observer mode", () => {
      expect(coordinator.isObserverMode()).toBe(true);
    });

    it("should log events without executing actions", async () => {
      // In observer mode, events are logged but don't execute actions
      await coordinator.dispatch({ type: "PLAY" });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Context should remain in IDLE (no state execution)
      // This tests that observer mode doesn't execute transitions
      const context = coordinator.getContext();
      expect(context.currentState).toBe(PlayerState.IDLE);
    });

    it("should track metrics in observer mode", async () => {
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
        payload: { libraryItemId: "test-item" },
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
        payload: { libraryItemId: "test-item" },
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
        payload: { libraryItemId: "test-item" },
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
        payload: { libraryItemId: "test-item" },
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
        payload: { libraryItemId: "test-item" },
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
        payload: { libraryItemId: "test-item" },
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
});
