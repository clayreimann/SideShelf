/**
 * Player State Coordinator - Phase 1: Observer Mode
 *
 * Event-driven state machine for coordinating player state.
 *
 * PHASE 1 IMPLEMENTATION (Observer Mode):
 * - Observes events without controlling execution
 * - Services still execute independently (no execution control)
 * - State machine validates transitions but doesn't block execution
 * - Context updates from ALL events to reflect actual system state
 * - Diagnostics UI can compare coordinator state vs actual behavior
 * - Purpose: Validate state machine accurately models real system before Phase 2
 *
 * KEY DESIGN DECISION:
 * Context (isPlaying, position, etc.) updates from ALL events including NATIVE_*
 * to ensure diagnostics always show current reality. This is critical for Phase 1
 * validation - we need to see that coordinator's view matches actual system state.
 *
 * Future phases will:
 * - Execute state transitions (Phase 2)
 * - Centralize position logic (Phase 3)
 * - Propagate state to subscribers (Phase 4)
 */

import { logger } from "@/lib/logger";
import {
  CoordinatorMetrics,
  DiagnosticEvent,
  EventProcessingResult,
  PlayerEvent,
  PlayerState,
  StateContext,
  TransitionHistoryEntry,
} from "@/types/coordinator";
import AsyncLock from "async-lock";
import EventEmitter from "eventemitter3";
import { playerEventBus } from "./eventBus";
import { validateTransition } from "./transitions";

const log = logger.forTag("PlayerStateCoordinator");

/**
 * Singleton coordinator for player state management
 */
export class PlayerStateCoordinator extends EventEmitter {
  private static instance: PlayerStateCoordinator | null = null;

  private context: StateContext;
  private eventQueue: PlayerEvent[] = [];
  private lock = new AsyncLock();
  private processingEvent = false;

  // Metrics
  private metrics: CoordinatorMetrics = {
    eventQueueLength: 0,
    avgEventProcessingTime: 0,
    totalEventsProcessed: 0,
    stateTransitionCount: 0,
    rejectedTransitionCount: 0,
    positionReconciliationCount: 0,
    lastEventTimestamp: null,
  };

  // Event processing times for averaging
  private processingTimes: number[] = [];
  private readonly MAX_PROCESSING_TIMES = 100;

  // Transition history for diagnostics
  private transitionHistory: TransitionHistoryEntry[] = [];
  private readonly MAX_HISTORY_ENTRIES = 100;

  // Phase 1: Observer mode flag
  private readonly observerMode = true;

  // Diagnostic logging interval
  private diagnosticInterval: NodeJS.Timeout | null = null;

  private constructor() {
    super();
    this.context = this.createInitialContext();
    this.startDiagnosticLogging();
    this.subscribeToEventBus();

    log.info("[Coordinator] PlayerStateCoordinator initialized (Observer Mode)");
  }

  /**
   * Get singleton instance
   */
  static getInstance(): PlayerStateCoordinator {
    if (!PlayerStateCoordinator.instance) {
      PlayerStateCoordinator.instance = new PlayerStateCoordinator();
    }
    return PlayerStateCoordinator.instance;
  }

  /**
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    if (PlayerStateCoordinator.instance) {
      PlayerStateCoordinator.instance.removeAllListeners();
      // Clear diagnostic interval to prevent timer leaks
      if (PlayerStateCoordinator.instance.diagnosticInterval) {
        clearInterval(PlayerStateCoordinator.instance.diagnosticInterval);
        PlayerStateCoordinator.instance.diagnosticInterval = null;
      }
    }
    PlayerStateCoordinator.instance = null;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Dispatch an event to the state machine.
   *
   * In Phase 1: Events are queued and logged but don't modify behavior.
   */
  async dispatch(event: PlayerEvent): Promise<void> {
    this.eventQueue.push(event);
    this.metrics.eventQueueLength = this.eventQueue.length;

    // Start processing if not already processing
    if (!this.processingEvent) {
      // Don't await - process asynchronously
      this.processEventQueue().catch((err) => {
        log.error("[Coordinator] Error processing event queue", err);
      });
    }
  }

  /**
   * Get current state
   */
  getState(): PlayerState {
    return this.context.currentState;
  }

  /**
   * Get current context (read-only)
   */
  getContext(): Readonly<StateContext> {
    return { ...this.context };
  }

  /**
   * Get current metrics
   */
  getMetrics(): Readonly<CoordinatorMetrics> {
    return {
      ...this.metrics,
      eventQueueLength: this.eventQueue.length,
    };
  }

  /**
   * Check if coordinator is in observer mode
   */
  isObserverMode(): boolean {
    return this.observerMode;
  }

  // ============================================================================
  // Event Processing
  // ============================================================================

  /**
   * Process events from queue one at a time
   */
  private async processEventQueue(): Promise<void> {
    this.processingEvent = true;

    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift()!;
      this.metrics.eventQueueLength = this.eventQueue.length;

      try {
        await this.lock.acquire("state-transition", async () => {
          await this.handleEvent(event);
        });
      } catch (error) {
        log.error(`[Coordinator] Error processing event: ${event.type}`, error as Error);
        this.emit("error", { event, error });
      }
    }

    this.processingEvent = false;
  }

  /**
   * Handle a single event
   *
   * In Phase 1: Validate and log, but don't execute transitions.
   */
  private async handleEvent(event: PlayerEvent): Promise<void> {
    const startTime = Date.now();
    const { currentState } = this.context;

    // Validate transition
    const validation = validateTransition(currentState, event);
    const nextState = validation.nextState;

    // Update context based on event payload (even in observer mode, for accurate tracking)
    this.updateContextFromEvent(event);

    // Log diagnostic event
    const diagnosticEvent: DiagnosticEvent = {
      timestamp: startTime,
      event,
      currentState,
      nextState,
      allowed: validation.allowed,
      context: { ...this.context },
    };

    this.emit("diagnostic", diagnosticEvent);

    // Track processing time
    const processingTime = Date.now() - startTime;
    this.processingTimes.push(processingTime);
    if (this.processingTimes.length > this.MAX_PROCESSING_TIMES) {
      this.processingTimes.shift();
    }

    // Update average processing time
    this.metrics.avgEventProcessingTime =
      this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length;

    // Add to transition history
    const historyEntry: TransitionHistoryEntry = {
      timestamp: startTime,
      event,
      fromState: currentState,
      toState: nextState,
      allowed: validation.allowed,
      reason: validation.reason,
      processingTime,
    };

    this.transitionHistory.push(historyEntry);
    if (this.transitionHistory.length > this.MAX_HISTORY_ENTRIES) {
      this.transitionHistory.shift();
    }

    // Log transition (only significant events)
    if (validation.allowed) {
      if (nextState && nextState !== currentState) {
        log.info(`[Coordinator] Transition: ${currentState} --[${event.type}]--> ${nextState}`);
        this.metrics.stateTransitionCount++;

        // Update context state to maintain accurate state tracking
        // Even in observer mode, we need to track state internally to validate subsequent transitions
        this.context.previousState = currentState;
        this.context.currentState = nextState;
      }
      // Silent for no-op events
    } else {
      log.warn(
        `[Coordinator] Rejected: ${currentState} --[${event.type}]--> Reason: ${validation.reason || "unknown"}`
      );
      this.metrics.rejectedTransitionCount++;
    }

    // Phase 1: Update metrics and internal state for accurate validation
    this.metrics.totalEventsProcessed++;
    this.metrics.lastEventTimestamp = startTime;

    // Emit event processed
    const result: EventProcessingResult = {
      success: true,
      stateChanged: nextState !== currentState && validation.allowed,
      previousState: currentState,
      newState: nextState || currentState,
      processingTime,
    };

    this.emit("eventProcessed", { event, result });
  }

  // ============================================================================
  // Context Management
  // ============================================================================

  /**
   * Update context based on event payload
   * Even in observer mode, we need accurate context for validation and diagnostics
   */
  private updateContextFromEvent(event: PlayerEvent): void {
    switch (event.type) {
      // Restore state - highest priority, sets multiple fields
      case "RESTORE_STATE": {
        const { state } = event.payload;
        this.context.currentTrack = state.currentTrack;
        this.context.position = state.position;
        this.context.playbackRate = state.playbackRate;
        this.context.volume = state.volume;
        this.context.isPlaying = state.isPlaying;
        this.context.sessionId = state.currentPlaySessionId;
        if (state.currentTrack) {
          this.context.duration = state.currentTrack.duration;
        }
        log.debug(
          `[Coordinator] Context updated from RESTORE_STATE: position=${state.position}, track=${state.currentTrack?.title || "none"}`
        );
        break;
      }

      // Track loading and changes
      case "LOAD_TRACK":
        this.context.isLoadingTrack = true;
        break;

      case "NATIVE_TRACK_CHANGED":
        this.context.currentTrack = event.payload.track;
        if (event.payload.track) {
          this.context.duration = event.payload.track.duration;
        }
        break;

      case "QUEUE_RELOADED":
        this.context.isLoadingTrack = false;
        this.context.position = event.payload.position;
        log.debug(
          `[Coordinator] Context updated from QUEUE_RELOADED: position=${event.payload.position}`
        );
        break;

      // Position and duration updates
      case "NATIVE_PROGRESS_UPDATED":
        this.context.position = event.payload.position;
        this.context.duration = event.payload.duration;
        this.context.lastPositionUpdate = Date.now();
        break;

      case "SEEK":
        this.context.isSeeking = true;
        this.context.position = event.payload.position;
        break;

      case "SEEK_COMPLETE":
        this.context.isSeeking = false;
        break;

      case "POSITION_RECONCILED":
        this.context.position = event.payload.position;
        this.metrics.positionReconciliationCount++;
        log.debug(
          `[Coordinator] Context updated from POSITION_RECONCILED: position=${event.payload.position}`
        );
        break;

      // Playback state changes
      case "PLAY":
        this.context.isPlaying = true;
        break;

      case "PAUSE":
        this.context.isPlaying = false;
        break;

      case "STOP":
        this.context.isPlaying = false;
        this.context.position = 0;
        this.context.currentTrack = null;
        this.context.sessionId = null;
        this.context.sessionStartTime = null;
        break;

      // Playback configuration
      case "SET_RATE":
        this.context.playbackRate = event.payload.rate;
        break;

      case "SET_VOLUME":
        this.context.volume = event.payload.volume;
        break;

      // Buffering state
      case "BUFFERING_STARTED":
        this.context.isBuffering = true;
        break;

      case "BUFFERING_COMPLETED":
        this.context.isBuffering = false;
        break;

      // Session management
      case "SESSION_CREATED":
        this.context.sessionId = event.payload.sessionId;
        this.context.sessionStartTime = Date.now();
        log.debug(
          `[Coordinator] Context updated from SESSION_CREATED: sessionId=${event.payload.sessionId}`
        );
        break;

      case "SESSION_UPDATED":
        // Track that position was synced
        this.context.pendingSyncPosition = null;
        break;

      case "SESSION_ENDED":
        this.context.sessionId = null;
        this.context.sessionStartTime = null;
        log.debug(`[Coordinator] Context updated from SESSION_ENDED`);
        break;

      case "SESSION_SYNC_COMPLETED":
        this.context.lastServerSync = Date.now();
        break;

      // Chapter changes
      case "CHAPTER_CHANGED":
        this.context.currentChapter = event.payload.chapter;
        break;

      // Native state changes (observer mode: track actual player state)
      case "NATIVE_STATE_CHANGED":
        // Update context to reflect actual native player state
        // This is critical for Phase 1 validation - diagnostics UI needs accurate state
        if (event.payload.state !== undefined) {
          // Map native State enum to isPlaying boolean
          // State values from react-native-track-player:
          // None = 0, Ready = 1, Playing = 2, Paused = 3, Stopped = 4, Buffering = 6, Connecting = 8
          const State = {
            None: 0,
            Ready: 1,
            Playing: 2,
            Paused: 3,
            Stopped: 4,
            Buffering: 6,
            Connecting: 8,
          };
          this.context.isPlaying = event.payload.state === State.Playing;
          log.debug(
            `[Coordinator] Context updated from NATIVE_STATE_CHANGED: isPlaying=${this.context.isPlaying} (state=${event.payload.state})`
          );
        }
        break;

      // Error handling
      case "NATIVE_ERROR":
        this.context.lastError = event.payload.error;
        break;

      case "NATIVE_PLAYBACK_ERROR":
        this.context.lastError = new Error(`${event.payload.code}: ${event.payload.message}`);
        break;

      case "SESSION_SYNC_FAILED":
        this.context.lastError = event.payload.error;
        break;

      // Other events don't need context updates
      default:
        break;
    }
  }

  // ============================================================================
  // Event Bus Integration
  // ============================================================================

  /**
   * Subscribe to the global event bus
   * This prevents circular dependencies - services dispatch to event bus,
   * coordinator subscribes to event bus and can call service methods.
   */
  private subscribeToEventBus(): void {
    playerEventBus.subscribe((event) => {
      // Dispatch to internal queue for processing
      this.dispatch(event).catch((err) => {
        log.error("[Coordinator] Error handling event from bus", err);
      });
    });

    log.info("[Coordinator] Subscribed to player event bus");
  }

  // ============================================================================
  // Diagnostic Logging
  // ============================================================================

  /**
   * Start diagnostic logging
   */
  private startDiagnosticLogging(): void {
    // Diagnostic events are emitted for programmatic access but not logged
    // to reduce noise. Use getMetrics() or subscribe to 'diagnostic' event
    // for programmatic access to this data.

    // Log errors only
    this.on("error", ({ event, error }) => {
      log.error(`[Coordinator] Error processing event: ${event.type}`, error);
    });
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Create initial context
   */
  private createInitialContext(): StateContext {
    return {
      currentState: PlayerState.IDLE,
      previousState: null,
      currentTrack: null,
      position: 0,
      duration: 0,
      playbackRate: 1,
      volume: 1,
      sessionId: null,
      sessionStartTime: null,
      lastPositionUpdate: 0,
      currentChapter: null,
      isPlaying: false,
      isBuffering: false,
      isSeeking: false,
      isLoadingTrack: false,
      lastServerSync: null,
      pendingSyncPosition: null,
      lastError: null,
    };
  }

  /**
   * Get event queue snapshot (for diagnostics)
   */
  getEventQueue(): ReadonlyArray<PlayerEvent> {
    return [...this.eventQueue];
  }

  /**
   * Get processing times (for diagnostics)
   */
  getProcessingTimes(): ReadonlyArray<number> {
    return [...this.processingTimes];
  }

  /**
   * Get transition history (for diagnostics)
   */
  getTransitionHistory(): ReadonlyArray<TransitionHistoryEntry> {
    return [...this.transitionHistory];
  }

  /**
   * Export diagnostic data
   */
  exportDiagnostics(): {
    context: StateContext;
    metrics: CoordinatorMetrics;
    eventQueue: PlayerEvent[];
    processingTimes: number[];
    transitionHistory: TransitionHistoryEntry[];
    observerMode: boolean;
  } {
    return {
      context: { ...this.context },
      metrics: { ...this.metrics },
      eventQueue: [...this.eventQueue],
      processingTimes: [...this.processingTimes],
      transitionHistory: [...this.transitionHistory],
      observerMode: this.observerMode,
    };
  }
}

/**
 * Convenience function to get coordinator instance
 */
export function getCoordinator(): PlayerStateCoordinator {
  return PlayerStateCoordinator.getInstance();
}
