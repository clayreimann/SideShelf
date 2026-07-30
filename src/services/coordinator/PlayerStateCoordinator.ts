/**
 * Player State Coordinator
 *
 * Event-driven state machine for coordinating player state.
 *
 * The coordinator owns player state — services execute its commands and report
 * reality back, not the other way around.
 *
 * - Executes state transitions by calling PlayerService execute* methods
 * - Services respond to coordinator commands (not independent execution)
 * - State machine validates transitions and blocks invalid ones
 * - Context updates from ALL events to reflect actual system state
 * - Position logic centralized via resolveCanonicalPosition
 * - State propagated to Zustand store via syncPositionToStore / syncStateToStore
 *
 * Phase history:
 * - Phase 1 (Observer Mode): Validated state machine models real system
 * - Phase 2 (Execution Control): Coordinator drives PlayerService
 * - Phase 3: Centralize position logic
 * - Phase 4: Propagate state to subscribers
 * - Phase 5: Cleanup — observer mode scaffolding removed
 */

import { getActiveSession } from "@/db/helpers/localListeningSessions";
import { getMediaProgressForLibraryItem } from "@/db/helpers/mediaProgress";
import { getUserByUsername } from "@/db/helpers/users";
import { ASYNC_KEYS, getItem as getAsyncItem, saveItem } from "@/lib/asyncStore";
import { formatTime } from "@/lib/helpers/formatters";
import { logger } from "@/lib/logger";
import { updateNowPlayingMetadata } from "@/lib/nowPlayingMetadata";
import { getStoredUsername } from "@/lib/secureStore";
import { useAppStore } from "@/stores/appStore";
import type { SmartRewindOutcome } from "@/lib/smartRewind";
import type { JumpRecordInput } from "@/types/player";
import {
  CoordinatorMetrics,
  DiagnosticEvent,
  DispatchMeta,
  EventProcessingResult,
  LARGE_DIFF_THRESHOLD,
  MIN_PLAUSIBLE_POSITION,
  PlayerEvent,
  PlayerState,
  ResumePositionInfo,
  ResumeSource,
  StateContext,
  TransitionHistoryEntry,
  CompactHistoryEntry,
} from "@/types/coordinator";
import AsyncLock from "async-lock";
import EventEmitter from "eventemitter3";
import { State } from "react-native-track-player";
// PlayerService is dynamically imported in executeTransition to avoid a circular dependency:
// PlayerStateCoordinator → PlayerService → PlayerStateCoordinator
import { trace, type SpanHandle } from "@/lib/trace";
import { dispatchPlayerEvent, playerEventBus } from "./eventBus";
import { validateTransition } from "./transitions";

const log = logger.forTag("PlayerStateCoordinator");

type ExpectedInternalPositionReconciliation = SmartRewindOutcome & {
  libraryItemId: string;
  generation: number;
};

const SMART_REWIND_RECONCILIATION_WINDOW_MS = 2_000;
const SMART_REWIND_POSITION_TOLERANCE_SECONDS = 1;

/** Upper bound on how long a track load may hold the UI in its loading state.
 *  Native audio may legitimately settle into Ready/Paused without ever emitting
 *  State.Playing (observed on iOS when play() races a large seek), and no event
 *  clears isLoadingTrack in that case. */
const LOAD_WATCHDOG_MS = 10_000;

/**
 * Singleton coordinator for player state management
 */
export class PlayerStateCoordinator extends EventEmitter {
  private static instance: PlayerStateCoordinator | null = null;

  private context: StateContext;
  private eventQueue: Array<{ event: PlayerEvent; meta?: DispatchMeta }> = [];
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

  // Monotonic counter for trace event ordering
  private machineSequence = 0;

  // Transition history for diagnostics
  private transitionHistory: TransitionHistoryEntry[] = [];
  private readonly MAX_HISTORY_ENTRIES = 100;
  private historyMetadata = {
    lastClearedAt: null as number | null,
    totalClears: 0,
  };

  // Phase 4: Store bridge - track last synced chapter to debounce metadata updates
  private lastSyncedChapterId: string | null = null;

  // Pending authoritative jump records awaiting flush to the player slice.
  private _pendingJumpRecords: JumpRecordInput[] = [];
  private jumpSequence = 0;

  // Smart rewind seeks TrackPlayer directly. Keep its exact expected native
  // position until that reconciliation arrives so it cannot be logged as an
  // unexpected external jump.
  private expectedInternalPositionReconciliation: ExpectedInternalPositionReconciliation | null =
    null;
  private expectedInternalPositionReconciliationTimeout: ReturnType<typeof setTimeout> | null =
    null;
  private internalPositionReconciliationGeneration = 0;

  // Load watchdog: guards against isLoadingTrack latching true forever when
  // native audio never reports State.Playing after a track load. See
  // LOAD_WATCHDOG_MS above.
  private loadWatchdogTimeout: ReturnType<typeof setTimeout> | null = null;

  // Open span for the current session sync cycle (SYNC_STARTED → SYNC_COMPLETED/FAILED)
  private activeSyncSpan: SpanHandle | null = null;

  // Diagnostic logging interval
  private diagnosticInterval: NodeJS.Timeout | null = null;

  private constructor() {
    super();
    this.context = this.createInitialContext();
    this.startDiagnosticLogging();
    this.subscribeToEventBus();

    log.info(`[Coordinator] PlayerStateCoordinator initialized (Execution Mode)`);
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
      PlayerStateCoordinator.instance.clearExpectedInternalPositionReconciliation();
      PlayerStateCoordinator.instance.clearLoadWatchdog();
    }
    PlayerStateCoordinator.instance = null;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Dispatch an event to the state machine.
   *
   * Events are queued and processed serially. Valid transitions invoke the
   * corresponding execute* method on PlayerService.
   */
  async dispatch(event: PlayerEvent, meta?: DispatchMeta): Promise<void> {
    this.eventQueue.push({ event, meta });
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

  // ============================================================================
  // Event Processing
  // ============================================================================

  /**
   * Process events from queue one at a time
   */
  private async processEventQueue(): Promise<void> {
    this.processingEvent = true;

    while (this.eventQueue.length > 0) {
      const { event, meta } = this.eventQueue.shift()!;
      this.metrics.eventQueueLength = this.eventQueue.length;

      try {
        await this.lock.acquire("state-transition", async () => {
          await this.handleEvent(event, meta);
        });
      } catch (error) {
        log.error(`[Coordinator] Error processing event: ${event.type}`, error as Error);
        this.emit("error", { event, error });
      }
    }

    this.processingEvent = false;
  }

  /**
   * Same-item chapter/bookmark loads are position changes, not track loads.
   * Normalize them before transition validation so they retain the current
   * PLAYING/PAUSED state and never pass through LOADING.
   */
  private normalizeSameTrackLoad(event: PlayerEvent): PlayerEvent {
    if (
      event.type !== "LOAD_TRACK" ||
      event.payload.startPosition === undefined ||
      (this.context.currentState !== PlayerState.PLAYING &&
        this.context.currentState !== PlayerState.PAUSED) ||
      event.payload.libraryItemId !== this.context.currentTrack?.libraryItemId ||
      Math.abs(event.payload.startPosition - this.context.position) <= 1
    ) {
      return event;
    }

    return {
      type: "SAME_TRACK_SEEK",
      payload: { position: event.payload.startPosition },
    };
  }

  /**
   * Resolve a relative jump from coordinator-owned position state.
   * Event queue serialization makes rapid commands additive without relying on
   * React rerenders or independently sampled native positions.
   */
  private resolveRelativeSeekPosition(event: PlayerEvent, fromPosition: number): number | null {
    if (event.type !== "JUMP_FORWARD" && event.type !== "JUMP_BACKWARD") {
      return null;
    }

    const requestedSeconds = Number.isFinite(event.payload.seconds)
      ? Math.max(0, event.payload.seconds)
      : 0;
    const signedSeconds = event.type === "JUMP_FORWARD" ? requestedSeconds : -requestedSeconds;
    const duration = Math.max(0, this.context.currentTrack?.duration ?? this.context.duration);
    const unclampedTarget = fromPosition + signedSeconds;

    return Math.max(0, duration > 0 ? Math.min(duration, unclampedTarget) : unclampedTarget);
  }

  private clearExpectedInternalPositionReconciliation(): void {
    this.internalPositionReconciliationGeneration++;
    this.expectedInternalPositionReconciliation = null;
    if (this.expectedInternalPositionReconciliationTimeout) {
      clearTimeout(this.expectedInternalPositionReconciliationTimeout);
      this.expectedInternalPositionReconciliationTimeout = null;
    }
  }

  private armExpectedInternalPositionReconciliation(
    outcome: SmartRewindOutcome,
    libraryItemId: string
  ): void {
    this.clearExpectedInternalPositionReconciliation();
    const generation = this.internalPositionReconciliationGeneration;
    this.expectedInternalPositionReconciliation = {
      ...outcome,
      libraryItemId,
      generation,
    };
    this.expectedInternalPositionReconciliationTimeout = setTimeout(() => {
      if (this.expectedInternalPositionReconciliation?.generation === generation) {
        this.clearExpectedInternalPositionReconciliation();
      }
    }, SMART_REWIND_RECONCILIATION_WINDOW_MS);
  }

  /**
   * Clear the load watchdog timer without acting on it (e.g. loading resolved
   * normally, or the machine is being torn down/reset).
   */
  private clearLoadWatchdog(): void {
    if (this.loadWatchdogTimeout) {
      clearTimeout(this.loadWatchdogTimeout);
      this.loadWatchdogTimeout = null;
    }
  }

  /**
   * Arm the load watchdog. Called whenever context.isLoadingTrack transitions
   * false -> true. If isLoadingTrack has not cleared by the time this fires,
   * native audio never confirmed the load (no State.Playing event arrived) —
   * recover so the UI is not left permanently stuck in a loading state.
   */
  private armLoadWatchdog(): void {
    this.clearLoadWatchdog();
    this.loadWatchdogTimeout = setTimeout(() => {
      this.loadWatchdogTimeout = null;
      log.warn(
        `[Coordinator] Load watchdog fired after ${LOAD_WATCHDOG_MS}ms — isLoadingTrack never cleared ` +
          `(currentState=${this.context.currentState}, hasReachedPlayingState=${this.context.hasReachedPlayingState}, ` +
          `isPlaying=${this.context.isPlaying}, position=${this.context.position}, ` +
          `libraryItemId=${this.context.currentTrack?.libraryItemId ?? "none"})`
      );

      if (this.context.isLoadingTrack) {
        this.context.isLoadingTrack = false;
        this.pushTrackLoadingClearedToStore();
      }

      // Machine optimistically entered PLAYING when LOAD_TRACK auto-dispatched
      // PLAY, but native audio never confirmed it — reconcile back to PAUSED so
      // togglePlayPause() can dispatch PLAY again (allowed from PAUSED).
      if (
        this.context.currentState === PlayerState.PLAYING &&
        !this.context.hasReachedPlayingState
      ) {
        dispatchPlayerEvent({ type: "PAUSE" }, { source: "native_player" });
      }
    }, LOAD_WATCHDOG_MS);
  }

  /**
   * Push the cleared isLoadingTrack flag to the Zustand store. Extracted from
   * syncStateToStore since the watchdog fires outside normal event processing
   * and has no PlayerEvent to hand syncStateToStore.
   * Guard: no-op when Zustand is unavailable (Android BGS headless context, PROP-05).
   */
  private pushTrackLoadingClearedToStore(): void {
    try {
      useAppStore.getState()._setTrackLoading(this.context.isLoadingTrack);
    } catch {
      // BGS headless context: Zustand store may not be available (PROP-05)
      return;
    }
  }

  /**
   * Handle a single event.
   *
   * Validates the transition, updates context, and calls executeTransition
   * to invoke the appropriate execute* method on PlayerService.
   */
  private async handleEvent(incomingEvent: PlayerEvent, meta?: DispatchMeta): Promise<void> {
    const event = this.normalizeSameTrackLoad(incomingEvent);
    const startTime = Date.now();
    const { currentState } = this.context;
    const before = {
      position: this.context.position,
      isSeeking: this.context.isSeeking,
      isLoadingTrack: this.context.isLoadingTrack,
      queueStatus: this.context.queueStatus,
      currentTrack: this.context.currentTrack,
      sessionId: this.context.sessionId,
    };
    const resolvedRelativeSeekPosition = this.resolveRelativeSeekPosition(event, before.position);

    // Validate transition
    const validation = validateTransition(currentState, event);
    const nextState = validation.nextState;

    // Sync lifecycle: open a span when a session sync cycle begins.
    // Closed below after executeTransition completes (or for no-op states).
    if (event.type === "SESSION_SYNC_STARTED") {
      this.activeSyncSpan = trace.startSpan("player.session.sync", {
        sessionId: this.context.sessionId,
        itemId: this.context.currentTrack?.libraryItemId,
      });
      trace.addEvent("session.sync.started", {}, this.activeSyncSpan.context);
    }

    // Per-event dispatch span — groups received/accepted/rejected/state.entered as children.
    // Skipped for NATIVE_PROGRESS_UPDATED (1 Hz) and session sync events (have own span).
    // SESSION_UPDATED fires on every DB write — same noise profile as NATIVE_PROGRESS_UPDATED.
    const isHighFrequency =
      event.type === "NATIVE_PROGRESS_UPDATED" ||
      event.type === "SESSION_UPDATED" ||
      event.type === "SESSION_SYNC_STARTED" ||
      event.type === "SESSION_SYNC_COMPLETED" ||
      event.type === "SESSION_SYNC_FAILED";
    const eventSpan = isHighFrequency
      ? null
      : trace.startSpan("player.machine.dispatch", {
          event: event.type,
          fromState: currentState,
          source: meta?.source ?? "unknown",
        });
    const traceCtx = eventSpan?.context;

    // Trace: record every event received by the machine (pre-transition).
    // Skip NATIVE_PROGRESS_UPDATED — 1 Hz noise; the span guard above already skips it.
    if (!isHighFrequency) {
      trace.addEvent(
        "player.machine.event.received",
        {
          sequence: this.machineSequence++,
          source: meta?.source ?? "unknown",
          event: event.type,
          fromState: currentState,
          itemId: this.context.currentTrack?.libraryItemId,
          chapterId: this.context.currentChapter?.chapter.id,
          positionMs:
            this.context.position != null ? Math.round(this.context.position * 1000) : undefined,
          restoreSessionId: meta?.restoreSessionId,
          ...(event.type === "NATIVE_STATE_CHANGED" ? { nativeState: event.payload.state } : {}),
        },
        traceCtx
      );
    }

    // Update context based on event payload — ONLY for allowed transitions.
    // Core state-machine invariant: a rejected event must have zero effect on
    // context. Previously this ran unconditionally, so e.g. a SEEK rejected
    // during LOADING would still set isSeeking=true/position, and a PAUSE
    // rejected during LOADING would still clear isPlaying/playIntentOnLoad —
    // corrupting context without the corresponding execute* ever running.
    // Kept at this position (before the diagnosticEvent snapshot below) so
    // diagnostics/trace semantics for ALLOWED events are unchanged: the
    // diagnostic and history entries still capture post-update context.
    if (validation.allowed) {
      if (resolvedRelativeSeekPosition !== null) {
        this.context.position = resolvedRelativeSeekPosition;
      } else {
        this.updateContextFromEvent(event);
      }

      // Load watchdog: arm/disarm on the isLoadingTrack edge so it can never
      // latch true forever (see LOAD_WATCHDOG_MS). STOP always clears it
      // regardless of the edge — updateContextFromEvent's STOP case does not
      // touch isLoadingTrack, so the generic edge check alone would miss a
      // STOP that arrives while a load is in flight.
      if (!before.isLoadingTrack && this.context.isLoadingTrack) {
        this.armLoadWatchdog();
      } else if (before.isLoadingTrack && !this.context.isLoadingTrack) {
        this.clearLoadWatchdog();
      }
      if (event.type === "STOP") {
        this.clearLoadWatchdog();
      }

      const isLoadingDifferentItem =
        event.type === "LOAD_TRACK" &&
        this._pendingJumpRecords.some(
          (record) => record.libraryItemId !== event.payload.libraryItemId
        );
      if (event.type === "STOP" || isLoadingDifferentItem) {
        this._pendingJumpRecords = [];
      }
      if (
        event.type === "STOP" ||
        event.type === "SEEK" ||
        event.type === "SAME_TRACK_SEEK" ||
        event.type === "JUMP_FORWARD" ||
        event.type === "JUMP_BACKWARD" ||
        event.type === "LOAD_TRACK"
      ) {
        this.clearExpectedInternalPositionReconciliation();
      }

      const nativeProgressEvent = event.type === "NATIVE_PROGRESS_UPDATED" ? event : null;
      const expectedInternalPositionReconciliation =
        nativeProgressEvent !== null &&
        this.expectedInternalPositionReconciliation !== null &&
        before.currentTrack?.libraryItemId ===
          this.expectedInternalPositionReconciliation.libraryItemId
          ? this.expectedInternalPositionReconciliation
          : null;

      let isExpectedInternalPositionReconciliation = false;
      if (nativeProgressEvent !== null && expectedInternalPositionReconciliation !== null) {
        const reportedPosition = nativeProgressEvent.payload.position;
        const isPreTargetTick =
          Math.abs(reportedPosition - expectedInternalPositionReconciliation.fromPosition) <=
          SMART_REWIND_POSITION_TOLERANCE_SECONDS;
        const reachedTarget =
          Math.abs(reportedPosition - expectedInternalPositionReconciliation.toPosition) <=
          SMART_REWIND_POSITION_TOLERANCE_SECONDS;

        isExpectedInternalPositionReconciliation = isPreTargetTick || reachedTarget;
        if (reachedTarget || !isPreTargetTick) {
          this.clearExpectedInternalPositionReconciliation();
        }
      }

      const resolvedIntentionalSeekPosition =
        event.type === "SEEK" || event.type === "SAME_TRACK_SEEK"
          ? event.payload.position
          : resolvedRelativeSeekPosition;
      if (
        resolvedIntentionalSeekPosition !== null &&
        meta?.jump &&
        !meta.suppressJumpHistory &&
        before.currentTrack
      ) {
        this._pendingJumpRecords.push({
          id: `${before.currentTrack.libraryItemId}:${Date.now()}:${this.jumpSequence++}`,
          sessionId: before.sessionId,
          libraryItemId: before.currentTrack.libraryItemId,
          ...meta.jump,
          fromPosition: before.position,
          toPosition: resolvedIntentionalSeekPosition,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      if (
        event.type === "NATIVE_PROGRESS_UPDATED" &&
        before.currentTrack &&
        !before.isSeeking &&
        !before.isLoadingTrack &&
        before.queueStatus === "valid" &&
        !isExpectedInternalPositionReconciliation &&
        Math.abs(event.payload.position - before.position) >= 30
      ) {
        this._pendingJumpRecords.push({
          id: `${before.currentTrack.libraryItemId}:${Date.now()}:${this.jumpSequence++}`,
          sessionId: before.sessionId,
          libraryItemId: before.currentTrack.libraryItemId,
          surface: "native_player",
          category: "unexpected_native",
          fromPosition: before.position,
          toPosition: event.payload.position,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

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
        this.context.previousState = currentState;
        this.context.currentState = nextState;
      }
      // Trace: accepted transition (skip for high-frequency events to reduce noise)
      if (!isHighFrequency) {
        trace.addEvent(
          "player.machine.transition.accepted",
          {
            sequence: this.machineSequence++,
            source: meta?.source ?? "unknown",
            event: event.type,
            fromState: currentState,
            toState: nextState ?? currentState,
            itemId: this.context.currentTrack?.libraryItemId,
            positionMs:
              this.context.position != null ? Math.round(this.context.position * 1000) : undefined,
          },
          traceCtx
        );
      }
      await this.executeTransition(event, nextState, meta, resolvedRelativeSeekPosition);
      // Trace: state entered (only on actual state change)
      if (!isHighFrequency && nextState && nextState !== currentState) {
        trace.addEvent(
          "player.machine.state.entered",
          {
            sequence: this.machineSequence++,
            state: nextState,
            fromState: currentState,
            event: event.type,
            source: meta?.source ?? "unknown",
          },
          traceCtx
        );
      }
      if (eventSpan) trace.endSpan(eventSpan, "ok", { toState: nextState ?? currentState });
      // Sync coordinator state to Zustand store (Phase 4: State Propagation)
      if (event.type === "NATIVE_PROGRESS_UPDATED") {
        this.syncPositionToStore();
      } else {
        this.syncStateToStore(event);
      }
    } else {
      // Trace: rejected transition
      trace.addEvent(
        "player.machine.transition.rejected",
        {
          sequence: this.machineSequence++,
          source: meta?.source ?? "unknown",
          event: event.type,
          fromState: currentState,
          reason: validation.reason ?? "unknown",
          itemId: this.context.currentTrack?.libraryItemId,
          positionMs:
            this.context.position != null ? Math.round(this.context.position * 1000) : undefined,
          restoreSessionId: meta?.restoreSessionId,
        },
        traceCtx
      );
      if (eventSpan) trace.endSpan(eventSpan, "error", { reason: validation.reason });
      log.warn(
        `[Coordinator] Rejected: ${currentState} --[${event.type}]--> Reason: ${validation.reason || "unknown"}`
      );
      this.metrics.rejectedTransitionCount++;
    }

    // Sync lifecycle: close the open sync span when the cycle completes or fails.
    // Runs after executeTransition so the span covers the full state change in SYNCING_SESSION,
    // and also closes cleanly when these events arrive as no-ops in other states.
    if (
      (event.type === "SESSION_SYNC_COMPLETED" || event.type === "SESSION_SYNC_FAILED") &&
      this.activeSyncSpan
    ) {
      const isCompleted = event.type === "SESSION_SYNC_COMPLETED";
      trace.addEvent(
        isCompleted ? "session.sync.completed" : "session.sync.failed",
        isCompleted ? {} : { error: String((event as any).payload?.error ?? "unknown") },
        this.activeSyncSpan.context
      );
      trace.endSpan(this.activeSyncSpan, isCompleted ? "ok" : "error");
      this.activeSyncSpan = null;
    }

    // Update metrics and internal state for accurate validation
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
        this.context.queueStatus = "unknown";
        this.context.hasReachedPlayingState = false;
        log.debug(
          `[Coordinator] Context updated from RESTORE_STATE: position=${state.position}, track=${state.currentTrack?.title || "none"}`
        );
        break;
      }

      // Track loading and changes
      case "LOAD_TRACK":
        this.context.isLoadingTrack = true;
        this.context.playIntentOnLoad = true;
        this.context.hasReachedPlayingState = false;
        break;

      case "NATIVE_TRACK_CHANGED":
        // The only dispatcher (PlayerBackgroundService.handleActiveTrackChanged) sends
        // track: null because it has no PlayerTrack to hand over. Assigning that null
        // wiped the track the LOADING handler just set, permanently disabling the
        // same-item LOAD_TRACK short-circuit.
        if (event.payload.track) {
          this.context.currentTrack = event.payload.track;
          this.context.duration = event.payload.track.duration;
        }
        break;

      case "RELOAD_QUEUE":
        // Set isLoadingTrack so the bridge can propagate it; QUEUE_RELOADED clears it
        // This allows store._setTrackLoading(true) to be removed from reloadTrackPlayerQueue()
        this.context.isLoadingTrack = true;
        this.context.hasReachedPlayingState = false;
        log.debug(`[Coordinator] Context updated from RELOAD_QUEUE: isLoadingTrack=true`);
        break;

      case "QUEUE_RELOADED":
        this.context.isLoadingTrack = false;
        this.context.position = event.payload.position;
        this.context.queueStatus = "valid";
        log.debug(
          `[Coordinator] Context updated from QUEUE_RELOADED: position=${event.payload.position}, queueStatus=valid`
        );
        break;

      // Position and duration updates
      case "NATIVE_PROGRESS_UPDATED": {
        const newPosition = event.payload.position;

        // Clear isSeeking when progress update arrives during seek (seek is complete)
        if (this.context.isSeeking) {
          this.context.isSeeking = false;
        }
        // POS-03: Do not overwrite valid position with native-0 during track load.
        // After TrackPlayer.add(tracks), the native player briefly reports position 0
        // before the seek to the resume position completes. If we write 0 here, we
        // lose the position that resolveCanonicalPosition just resolved.
        // Once isLoadingTrack is cleared (by QUEUE_RELOADED), native 0 is accepted.
        if (this.context.isLoadingTrack && newPosition === 0) {
          this.context.duration = event.payload.duration; // duration update is safe
          this.context.lastPositionUpdate = Date.now();
          break;
        }
        this.context.position = newPosition;
        this.context.duration = event.payload.duration;
        this.context.lastPositionUpdate = Date.now();

        break;
      }

      case "SEEK":
        this.context.preSeekState = this.context.currentState; // capture BEFORE transition
        this.context.isSeeking = true;
        this.context.position = event.payload.position;
        break;

      case "SAME_TRACK_SEEK":
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
        this.context.playIntentOnLoad = false;
        break;

      case "STOP":
        this.context.isPlaying = false;
        this.context.position = 0;
        this.context.currentTrack = null;
        this.context.sessionId = null;
        this.context.sessionStartTime = null;
        this.context.playIntentOnLoad = false;
        this.context.queueStatus = "unknown";
        this.context.hasReachedPlayingState = false;
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

      // Native state changes — track actual player state for diagnostics
      case "NATIVE_STATE_CHANGED":
        // Update context to reflect actual native player state
        // Diagnostics UI needs accurate state
        // Map native State enum to isPlaying boolean
        this.context.isPlaying = event.payload.state === State.Playing;
        // Clear isLoadingTrack when playback actually starts — mirrors BGS behavior
        // that was removed in Phase 4 (store._setTrackLoading(false) was only in Playing case)
        if (event.payload.state === State.Playing) {
          this.context.isLoadingTrack = false;
          this.context.hasReachedPlayingState = true;
        }
        log.debug(
          `[Coordinator] Context updated from NATIVE_STATE_CHANGED: isPlaying=${this.context.isPlaying} (state=${event.payload.state})`
        );
        // If the machine is PLAYING but native audio stopped (not just buffering),
        // dispatch PAUSE to sync machine state → PAUSED. This allows togglePlayPause()
        // to dispatch PLAY from PAUSED (which is allowed), resuming TrackPlayer.
        // AsyncLock ensures PAUSE is processed after NATIVE_STATE_CHANGED completes.
        //
        // hasReachedPlayingState guards against the iOS queue-rebuild pre-play sequence:
        // TrackPlayer.add()/seekTo() triggers Buffering→Ready→Paused before executePlay
        // runs. Without the guard that spurious Paused fires a PAUSE that leaves the
        // machine stuck in PAUSED. We only auto-pause once native playback has confirmed
        // at least one State.Playing event (reset on LOAD_TRACK / RESTORE_STATE / RELOAD_QUEUE / STOP).
        if (
          this.context.currentState === PlayerState.PLAYING &&
          this.context.hasReachedPlayingState &&
          event.payload.state !== State.Playing &&
          event.payload.state !== State.Buffering &&
          event.payload.state !== State.Ready // transient during track load/stream init after NATIVE_TRACK_CHANGED
        ) {
          dispatchPlayerEvent({ type: "PAUSE" }, { source: "native_player" });
        }
        break;

      // Error handling
      case "NATIVE_ERROR":
        this.context.lastError = event.payload.error;
        this.context.playIntentOnLoad = false;
        // Task 3c: NATIVE_ERROR is only ever dispatched from executeTransition's
        // catch block, recovering a failed load/play into ERROR (see the comment
        // there). Without this, a failed load left isLoadingTrack latched true
        // forever — the collaborators' own store._setTrackLoading(false) writes
        // in their catch blocks were already dead: they ran before this event's
        // subsequent syncStateToStore call, which re-pushed context.isLoadingTrack
        // (still true) right back over them. Clearing it here, alongside
        // playIntentOnLoad above, is the actual fix; the dead writes are removed.
        this.context.isLoadingTrack = false;
        break;

      case "NATIVE_PLAYBACK_ERROR":
        this.context.lastError = new Error(`${event.payload.code}: ${event.payload.message}`);
        // Clear loading state on playback error so the bridge can propagate it
        // (BGS handlePlaybackError's store._setTrackLoading(false) removed in Phase 4)
        this.context.isLoadingTrack = false;
        this.context.playIntentOnLoad = false;
        // Brief E (streaming auth header migration): mark the queue stale so the
        // next PLAY rebuilds it via the existing queueStatus==='unknown' inline
        // path (see case PlayerState.PLAYING above) instead of resuming the same
        // queue that just failed. Streamed tracks carry the access token as a
        // per-track Authorization header set once when the queue was built; if
        // the token rotates mid-playback (ApiClientService's refresh flow), the
        // queued track's header goes stale and the native player will keep
        // failing against the same URL/header. RNTP surfaces this as a generic
        // playback error (Android: PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS
        // for ANY bad HTTP status incl. 401, not 401-specific; iOS: no HTTP-status
        // detail at all — react-native-track-player 4.1.2's iOS PlaybackError event
        // only carries `{error: string}`, no code — confirmed at
        // ios/RNTrackPlayer/RNTrackPlayer.swift:838 and doublesymmetry/
        // react-native-track-player GitHub issue #1437). Since neither platform
        // reliably distinguishes "401 from a stale token" from other playback
        // failures, we don't gate on event.code/message — instead any playback
        // error invalidates the queue so the NEXT play attempt (user retry or
        // app-driven) rebuilds with a fresh play session + fresh token via
        // executeRebuildQueue. A non-token-related failure just fails again with
        // a fresh NATIVE_PLAYBACK_ERROR — no worse than today.
        this.context.queueStatus = "unknown";
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
  // Position Reconciliation
  // ============================================================================

  /**
   * Resolve the canonical resume position for the given library item.
   *
   * Implements the same priority chain as the former PlayerService.determineResumePosition():
   *   1. Active DB local listening session (most authoritative)
   *   2. Saved DB media progress (fallback if session is implausible)
   *   3. AsyncStorage persisted position (final fallback)
   *   4. Zustand store position (last resort)
   *
   * After resolving, this method:
   *   - Updates context.position with the resolved value
   *   - Dispatches POSITION_RECONCILED so the context update flows through the event bus
   *   - Syncs AsyncStorage if authoritativePosition differs from asyncStoragePosition
   *
   * Public so PlayerService.executeLoadTrack() and reloadTrackPlayerQueue() can call it
   * directly (Phase 02 will wire those callers).
   */
  async resolveCanonicalPosition(libraryItemId: string): Promise<ResumePositionInfo> {
    const [asyncStoragePosition, asyncStoragePositionUpdatedAt] = (await Promise.all([
      getAsyncItem(ASYNC_KEYS.position),
      getAsyncItem(ASYNC_KEYS.positionUpdatedAt),
    ])) as [number | null, number | null];

    // Task 4e: last-resort fallback reads context.position rather than the
    // Zustand store's (global, not item-scoped) position, and ONLY when
    // context.currentTrack is the item being resolved — otherwise a different
    // item's in-memory position (or the store's, which reflects whatever item
    // last played) could bleed into this resolution. Scoping the fallback to
    // the item it belongs to makes that bleed impossible by construction,
    // replacing the prior approach of pre-emptively resetting store position
    // to 0 on every book switch (which was itself dead code by the time it
    // ran — see TrackLoadingCollaborator.executeLoadTrack).
    let position =
      this.context.currentTrack?.libraryItemId === libraryItemId ? this.context.position : 0;
    let source: ResumeSource = "store";
    let authoritativePosition: number | null = null;

    if (asyncStoragePosition !== null && asyncStoragePosition !== undefined) {
      position = asyncStoragePosition;
      source = "asyncStorage";
      authoritativePosition = asyncStoragePosition;
    }

    try {
      const username = await getStoredUsername();
      if (username) {
        const user = await getUserByUsername(username);
        if (user?.id) {
          const [activeSession, savedProgress] = await Promise.all([
            getActiveSession(user.id, libraryItemId),
            getMediaProgressForLibraryItem(libraryItemId, user.id),
          ]);

          if (activeSession) {
            // If item is marked finished, start from beginning regardless of session
            if (savedProgress?.isFinished === true) {
              position = 0;
              source = "savedProgress";
              authoritativePosition = 0;
              log.info(
                `[Coordinator] Item is finished — starting from beginning (had active session)`
              );
              // Clear AsyncStorage position so we don't re-use the stale end position
              await saveItem(ASYNC_KEYS.position, null);
            } else {
              const sessionPosition = activeSession.currentTime;
              const sessionUpdatedAt = activeSession.updatedAt.getTime();

              // If AsyncStorage has a timestamped position that is fresher than the DB session,
              // prefer it — the session may be stale (e.g. zombie session not closed on last run).
              if (
                asyncStoragePosition !== null &&
                asyncStoragePositionUpdatedAt !== null &&
                asyncStoragePositionUpdatedAt > sessionUpdatedAt
              ) {
                log.info(
                  `[Coordinator] AsyncStorage position (${formatTime(asyncStoragePosition)}s, ` +
                    `updated ${new Date(asyncStoragePositionUpdatedAt).toISOString()}) ` +
                    `is more recent than active session (${formatTime(sessionPosition)}s, ` +
                    `updated ${new Date(sessionUpdatedAt).toISOString()}) — using asyncStorage`
                );
                position = asyncStoragePosition;
                source = "asyncStorage";
                authoritativePosition = asyncStoragePosition;
              } else {
                const savedPosition = savedProgress?.currentTime;
                const savedLastUpdate = savedProgress?.lastUpdate?.getTime();

                // Check if session position is implausibly small (native 0-before-loaded artifact)
                if (sessionPosition < MIN_PLAUSIBLE_POSITION) {
                  if (savedPosition && savedPosition >= MIN_PLAUSIBLE_POSITION) {
                    log.warn(
                      `[Coordinator] Rejecting implausible session position ${formatTime(sessionPosition)}s (updated ${new Date(sessionUpdatedAt).toISOString()}), using saved position ${formatTime(savedPosition)}s (updated ${savedLastUpdate ? new Date(savedLastUpdate).toISOString() : "unknown"})`
                    );
                    position = savedPosition;
                    source = "savedProgress";
                    authoritativePosition = savedPosition;
                  } else if (
                    asyncStoragePosition &&
                    asyncStoragePosition >= MIN_PLAUSIBLE_POSITION
                  ) {
                    log.warn(
                      `[Coordinator] Rejecting implausible session position ${formatTime(sessionPosition)}s, using AsyncStorage position ${formatTime(asyncStoragePosition)}s`
                    );
                    position = asyncStoragePosition;
                    source = "asyncStorage";
                    authoritativePosition = asyncStoragePosition;
                  } else {
                    // Session position is small but no better alternative exists
                    position = sessionPosition;
                    source = "activeSession";
                    authoritativePosition = sessionPosition;
                    log.info(
                      `[Coordinator] Resume position from active session (small but no alternative): ${formatTime(position)}s`
                    );
                  }
                } else if (savedPosition && savedLastUpdate) {
                  // Both exist — compare timestamps to determine which is more recent
                  const positionDiff = Math.abs(sessionPosition - savedPosition);

                  if (positionDiff > LARGE_DIFF_THRESHOLD) {
                    // Large discrepancy — prefer the more recently updated source
                    const isSessionNewer = sessionUpdatedAt > savedLastUpdate;
                    const preferredPosition = isSessionNewer ? sessionPosition : savedPosition;
                    const preferredSource: ResumeSource = isSessionNewer
                      ? "activeSession"
                      : "savedProgress";

                    log.warn(
                      `[Coordinator] Large position discrepancy: session=${formatTime(sessionPosition)}s (${new Date(sessionUpdatedAt).toISOString()}) vs saved=${formatTime(savedPosition)}s (${new Date(savedLastUpdate).toISOString()}), using ${preferredSource} position ${formatTime(preferredPosition)}s`
                    );

                    position = preferredPosition;
                    source = preferredSource;
                    authoritativePosition = preferredPosition;
                  } else {
                    // Positions are close — use session (more frequently updated)
                    position = sessionPosition;
                    source = "activeSession";
                    authoritativePosition = sessionPosition;
                    log.info(
                      `[Coordinator] Resume position from active session: ${formatTime(position)}s`
                    );
                  }
                } else {
                  // Normal case — use session position
                  position = sessionPosition;
                  source = "activeSession";
                  authoritativePosition = sessionPosition;
                  log.info(
                    `[Coordinator] Resume position from active session: ${formatTime(position)}s`
                  );
                }
              } // end else (asyncStorage not fresher than session)
            } // end else (not isFinished)
          } else if (savedProgress?.currentTime) {
            // If item is marked finished, start from beginning
            if (savedProgress.isFinished === true) {
              position = 0;
              source = "savedProgress";
              authoritativePosition = 0;
              log.info(`[Coordinator] Item is finished — starting from beginning`);
              // Clear AsyncStorage position so we don't re-use the stale end position
              await saveItem(ASYNC_KEYS.position, null);
            } else {
              position = savedProgress.currentTime;
              source = "savedProgress";
              authoritativePosition = savedProgress.currentTime;
              log.info(
                `[Coordinator] Resume position from saved progress: ${formatTime(position)}s`
              );
            }
          }
        }
      }
    } catch (error) {
      log.error("[Coordinator] Failed to determine resume position", error as Error);
    }

    if (source === "store") {
      authoritativePosition = null;
      if (position > 0) {
        log.info(
          `[Coordinator] Using in-memory store position for resume: ${formatTime(position)}s`
        );
      }
    }

    const result: ResumePositionInfo = {
      position,
      source,
      authoritativePosition,
      asyncStoragePosition,
    };

    // Update coordinator context with the resolved position
    this.context.position = position;

    // Dispatch POSITION_RECONCILED so the position flows through the event bus
    dispatchPlayerEvent(
      { type: "POSITION_RECONCILED", payload: { position } },
      { source: "native_player" }
    );

    // Sync AsyncStorage if the authoritative position differs from what was stored
    if (authoritativePosition !== null && authoritativePosition !== asyncStoragePosition) {
      await saveItem(ASYNC_KEYS.position, authoritativePosition);
    }

    log.info(
      `[Coordinator] resolveCanonicalPosition(${libraryItemId}): position=${formatTime(position)}s source=${source}`
    );

    return result;
  }

  // ============================================================================
  // Store Bridge (Phase 4: State Propagation)
  // ============================================================================

  private flushPendingJumpRecords(
    store: Pick<ReturnType<typeof useAppStore.getState>, "_recordJump">
  ): void {
    while (this._pendingJumpRecords.length > 0) {
      const record = this._pendingJumpRecords[0];
      store._recordJump(record);
      this._pendingJumpRecords.shift();
    }
  }

  /**
   * Lightweight position-only sync — called on every NATIVE_PROGRESS_UPDATED (1Hz).
   *
   * Only updates store.updatePosition() to avoid triggering expensive Zustand
   * selector re-evaluations across the full player state on every tick (PROP-02/PROP-03).
   *
   * Also detects chapter boundary crossings and calls updateNowPlayingMetadata() when
   * chapter.id changes (CLEAN-03). updatePosition() triggers _updateCurrentChapter
   * synchronously via Zustand set, so store.player.currentChapter reflects the
   * updated chapter by the time the comparison runs.
   *
   * Debounced by lastSyncedChapterId to avoid redundant metadata updates.
   *
   * Guard: no-op when Zustand is unavailable (Android BGS headless context, PROP-05).
   */
  private syncPositionToStore(): void {
    try {
      const store = useAppStore.getState();
      store.updatePosition(this.context.position); // triggers _updateCurrentChapter synchronously

      this.flushPendingJumpRecords(store);

      // Detect chapter boundary crossings using the store's computed chapter id (set
      // synchronously by _updateCurrentChapter above). Debounced by lastSyncedChapterId.
      const currentChapterId = store.player.currentChapter?.chapter?.id?.toString() ?? null;
      if (currentChapterId !== null && currentChapterId !== this.lastSyncedChapterId) {
        this.lastSyncedChapterId = currentChapterId;
        // currentTrack comes from the store (maintained by PlayerService); position
        // comes from this.context (coordinator's authoritative value, not delayed by
        // the React state cycle).
        const track = store.player.currentTrack;
        if (track && !this.context.isLoadingTrack) {
          updateNowPlayingMetadata(track, this.context.position).catch((err) => {
            log.error("[Coordinator] Failed to update now playing metadata on chapter change", err);
          });
        }
      }
    } catch {
      // BGS headless context: Zustand store may not be available (PROP-05)
      return;
    }
  }

  /**
   * Full structural sync — called on all allowed transitions except NATIVE_PROGRESS_UPDATED.
   *
   * Syncs all coordinator context fields to their corresponding playerSlice mutators.
   * Does NOT sync: lastPauseTime (service-ephemeral), sleepTimer (PROP-04 exception),
   * isModalVisible (UI-only), initialized (lifecycle).
   *
   * currentTrack: synced on STOP (to clear) and whenever context.currentTrack differs
   * by reference from the store's copy (Task 1 — the coordinator now owns
   * context.currentTrack after a successful load; previously this only synced on STOP,
   * which meant the store's currentTrack came exclusively from PlayerService's own
   * store._setCurrentTrack call in TrackLoadingCollaborator, not from the coordinator).
   *
   * After sync, calls updateNowPlayingMetadata() fire-and-forget on SEEK_COMPLETE,
   * PAUSE, and PLAY to keep the lock screen position accurate at key transitions.
   * Chapter boundary crossings are handled by syncPositionToStore instead (CLEAN-03).
   *
   * Guard: no-op when Zustand is unavailable (Android BGS headless context, PROP-05).
   */
  private syncStateToStore(event: PlayerEvent): void {
    try {
      const store = useAppStore.getState();
      // Sync currentTrack on STOP (to clear it) and whenever the coordinator's
      // value differs by reference from the store's, so the store projection
      // stays correct now that the coordinator sets currentTrack itself (Task 1).
      if (event.type === "STOP" || this.context.currentTrack !== store.player.currentTrack) {
        store._setCurrentTrack(this.context.currentTrack);
      }
      store.updatePlayingState(this.context.isPlaying);
      store.updatePosition(this.context.position);
      store._setTrackLoading(this.context.isLoadingTrack);
      store._setSeeking(this.context.isSeeking);
      store._setPlaybackRate(this.context.playbackRate);
      store._setVolume(this.context.volume);
      store._setPlaySessionId(this.context.sessionId);

      this.flushPendingJumpRecords(store);

      // Refresh lock screen metadata at key playback state transitions.
      // Chapter boundary crossings are handled in syncPositionToStore (CLEAN-03), which
      // reads the chapter from the store after updatePosition() runs _updateCurrentChapter.
      //
      // SEEK_COMPLETE: same-chapter seeks change positionInChapter without triggering a
      // chapter boundary crossing, so syncPositionToStore's chapter detector won't fire.
      //
      // PAUSE / PLAY: TrackPlayer's native layer updates MPNowPlayingInfoCenter with the
      // absolute track position when playback state changes, overwriting the chapter-relative
      // elapsedTime we set. Re-asserting our metadata after these transitions ensures the lock
      // screen always freezes (PAUSE) or resumes advancing (PLAY) from the correct chapter position.
      // currentTrack comes from the store (maintained by PlayerService); position
      // comes from this.context (coordinator's authoritative value).
      const track = store.player.currentTrack;
      if (
        (event.type === "SEEK_COMPLETE" || event.type === "PAUSE" || event.type === "PLAY") &&
        track &&
        !this.context.isLoadingTrack
      ) {
        updateNowPlayingMetadata(track, this.context.position).catch((err) => {
          log.error("[Coordinator] Failed to update now playing metadata", err);
        });
      }
    } catch {
      // BGS headless context: Zustand store may not be available (PROP-05)
      return;
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
    playerEventBus.subscribe((event, meta) => {
      // Dispatch to internal queue for processing, carrying meta for source tracing
      this.dispatch(event, meta).catch((err) => {
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
      preSeekState: null,
      isLoadingTrack: false,
      playIntentOnLoad: false,
      queueStatus: "unknown",
      hasReachedPlayingState: false,
      lastServerSync: null,
      pendingSyncPosition: null,
      lastError: null,
    };
  }

  /**
   * Get event queue snapshot (for diagnostics)
   */
  getEventQueue(): ReadonlyArray<PlayerEvent> {
    return this.eventQueue.map(({ event }) => event);
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
   * Clear transition history (useful for reducing diagnostic output size)
   */
  clearTransitionHistory(): void {
    this.transitionHistory = [];
    this.historyMetadata.lastClearedAt = Date.now();
    this.historyMetadata.totalClears++;
    log.info("[Coordinator] Transition history cleared");
  }

  /**
   * Export diagnostic data
   * @param compact If true, returns abbreviated output optimized for token efficiency
   */
  exportDiagnostics(compact = false): {
    context: StateContext;
    metrics: CoordinatorMetrics;
    eventQueue: PlayerEvent[];
    processingTimes?: number[];
    transitionHistory: TransitionHistoryEntry[] | CompactHistoryEntry[];
    historyMetadata: { lastClearedAt: number | null; totalClears: number };
  } {
    const history = compact ? this.compactHistory() : [...this.transitionHistory];

    return {
      context: { ...this.context },
      metrics: { ...this.metrics },
      eventQueue: this.eventQueue.map(({ event }) => event),
      ...(compact ? {} : { processingTimes: [...this.processingTimes] }),
      transitionHistory: history,
      historyMetadata: { ...this.historyMetadata },
    };
  }

  /**
   * Compact transition history for token efficiency
   * - Abbreviates field names
   * - Rounds numeric values
   * - Omits redundant data
   */
  private compactHistory(): CompactHistoryEntry[] {
    return this.transitionHistory.map((entry) => ({
      ts: entry.timestamp,
      evt: entry.event.type,
      ...((entry.event as { type: string; payload?: unknown }).payload
        ? { pay: this.compactPayload((entry.event as { type: string; payload: unknown }).payload) }
        : {}),
      from: entry.fromState,
      to: entry.toState || entry.fromState,
      ok: entry.allowed,
      ...(entry.reason ? { why: entry.reason } : {}),
      ms: entry.processingTime,
    }));
  }

  /**
   * Compact event payload (round numbers, limit precision)
   */
  private compactPayload(payload: any): any {
    if (typeof payload === "number") {
      return Math.round(payload * 100) / 100; // 2 decimals
    }
    if (typeof payload === "object" && payload !== null) {
      const compact: any = {};
      for (const [key, value] of Object.entries(payload)) {
        if (typeof value === "number") {
          compact[key] = Math.round(value * 100) / 100;
        } else {
          compact[key] = value;
        }
      }
      return compact;
    }
    return payload;
  }
  /**
   * Execute state transition
   * This is where the actual side effects happen (calling PlayerService)
   */
  private async executeTransition(
    event: PlayerEvent,
    nextState: PlayerState | null,
    meta?: DispatchMeta,
    resolvedRelativeSeekPosition: number | null = null
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PlayerService } = require("../PlayerService") as typeof import("../PlayerService");
    const playerService = PlayerService.getInstance();

    try {
      // Handle state transitions
      if (nextState) {
        switch (nextState) {
          case PlayerState.LOADING:
            if (event.type === "LOAD_TRACK") {
              // Short-circuit if same item is already actively playing or paused.
              // previousState is the state before transitioning to LOADING.
              // context.currentTrack reflects the track confirmed by a prior playback cycle —
              // safe to trust in PLAYING and PAUSED. READY is excluded (see spec).
              //
              // A same-item LOAD_TRACK whose startPosition actually differs from the
              // current position (by more than 1s) never reaches this handler:
              // normalizeSameTrackLoad (invoked earlier in handleEvent, before transition
              // validation) already rewrote it to SAME_TRACK_SEEK using the identical
              // same-item / PLAYING-or-PAUSED / startPosition-vs-position guard checked
              // there (it reads context.currentState, which becomes context.previousState
              // by the time this handler runs, and the same context.position). So every
              // LOAD_TRACK that lands here for an already-active item has no startPosition,
              // or one within 1s of the current position — always a plain resume, never a seek.
              const { previousState, currentTrack } = this.context;
              const wasActivelyPlayingOrPaused =
                previousState === PlayerState.PLAYING || previousState === PlayerState.PAUSED;
              if (
                wasActivelyPlayingOrPaused &&
                event.payload.libraryItemId === currentTrack?.libraryItemId
              ) {
                log.info(
                  `[Coordinator] Short-circuit: ${event.payload.libraryItemId} already ${previousState} — dispatching PLAY`
                );
                // Thread meta so skipSmartRewind reaches executePlay
                dispatchPlayerEvent({ type: "PLAY" }, meta ?? { source: "native_player" });
                return; // skip executeLoadTrack and playIntentOnLoad check
              }

              const loadResult = await playerService.executeLoadTrack(
                event.payload.libraryItemId,
                event.payload.episodeId,
                event.payload.startPosition
              );
              // Task 1: the coordinator now owns context.currentTrack — it is no
              // longer solely dependent on NATIVE_TRACK_CHANGED (whose only
              // production dispatcher always sends track: null, see below).
              // Without this, the same-item short-circuit above never fires.
              this.context.currentTrack = loadResult.track;
              this.context.duration = loadResult.track.duration;
              // Task 3a: currentPlaySessionId is threaded back via the return
              // value (rather than TrackLoadingCollaborator writing it directly
              // to the store, which fought the store bridge below) — null means
              // "no active streaming session" and clears any stale prior value.
              this.context.sessionId = loadResult.playSessionId;
              // Task 4a/4b: the position executeLoadTrack resolved and seeked to
              // (caller-specified startPosition, or resolveCanonicalPosition's
              // result) is threaded back the same way, covering both branches —
              // previously the startPosition branch never reached context at all.
              this.context.position = loadResult.position;
              // executeLoadTrack already reset/rebuilt the native TrackPlayer queue
              // (TrackPlayer.reset/add/seekTo) — mark it valid so the queueStatus
              // === 'unknown' inline-rebuild branch in PlayerState.PLAYING below
              // (Change 4, for RESTORE_STATE/STOP paths) doesn't immediately
              // trigger a redundant second rebuild once currentTrack is non-null.
              this.context.queueStatus = "valid";
              // Change 2: dispatch PLAY after successful load if intent is still set.
              // playIntentOnLoad is cleared if PAUSE or error arrived during LOADING.
              if (this.context.playIntentOnLoad) {
                dispatchPlayerEvent({ type: "PLAY" }, meta ?? { source: "native_player" });
              }
            }
            break;

          case PlayerState.READY:
            // Resume playback if seek interrupted PLAYING state
            if (this.context.preSeekState === PlayerState.PLAYING) {
              this.context.preSeekState = null; // clear after use
              dispatchPlayerEvent({ type: "PLAY" }, { source: "native_player" });
            }
            break;

          case PlayerState.PLAYING:
            // Only call executePlay when actually transitioning into PLAYING (not same-state no-ops like SET_RATE)
            if (event.type === "PLAY") {
              // Change 4: Inline queue rebuild if queueStatus is unknown.
              // This handles the RESTORE_STATE and STOP paths where the OS may have
              // cleared the TrackPlayer queue. Direct context mutations are used
              // (not dispatchPlayerEvent) because PLAYING/PAUSED reject RELOAD_QUEUE
              // via the transition table — bypassing the queue preserves POS-03 guard.
              if (this.context.queueStatus === "unknown" && this.context.currentTrack) {
                const track = this.context.currentTrack;
                this.updateContextFromEvent({
                  type: "RELOAD_QUEUE",
                  payload: { libraryItemId: track.libraryItemId },
                }); // sets isLoadingTrack=true (POS-03 guard)
                try {
                  const resumeInfo = await playerService.executeRebuildQueue(track);
                  this.updateContextFromEvent({
                    type: "QUEUE_RELOADED",
                    payload: { position: resumeInfo.position },
                  }); // sets isLoadingTrack=false, queueStatus='valid'
                } catch (rebuildError) {
                  // Clear loading state and abort — calling executePlay on an empty queue would fail
                  this.context.isLoadingTrack = false;
                  log.error(
                    "[Coordinator] Failed to rebuild queue before play",
                    rebuildError as Error
                  );
                  return;
                }
              }
              // Task 4c: pass context.position explicitly rather than have
              // executePlay read store.player.position itself — the coordinator's
              // context is the authoritative position value.
              const smartRewindOutcome = await playerService.executePlay(
                this.context.position,
                meta
              );
              if (smartRewindOutcome && this.context.currentTrack) {
                this.armExpectedInternalPositionReconciliation(
                  smartRewindOutcome,
                  this.context.currentTrack.libraryItemId
                );
                this.context.position = smartRewindOutcome.toPosition;
              }
            }
            break;

          case PlayerState.PAUSED:
            // Only call executePause when actually transitioning into PAUSED (not same-state no-ops like SET_RATE)
            if (event.type === "PAUSE") {
              await playerService.executePause();
            }
            break;

          case PlayerState.STOPPING:
            await playerService.executeStop();
            break;

          case PlayerState.IDLE:
            if (event.type === "STOP") {
              await playerService.executeStop();
            }
            break;
        }
      }

      // Handle events that don't necessarily change state but require action
      switch (event.type) {
        case "SEEK":
          await playerService.executeSeek(event.payload.position);
          break;

        case "SAME_TRACK_SEEK":
          await playerService.executeSeek(event.payload.position);
          break;

        case "JUMP_FORWARD":
        case "JUMP_BACKWARD":
          if (resolvedRelativeSeekPosition === null) {
            break;
          }
          await playerService.executeSeek(resolvedRelativeSeekPosition);
          if (meta?.onRelativeSeekResolved) {
            try {
              await meta.onRelativeSeekResolved(resolvedRelativeSeekPosition);
            } catch (resolutionError) {
              log.error(
                "[Coordinator] Relative seek persistence callback failed",
                resolutionError as Error
              );
            }
          }
          break;

        case "SET_RATE":
          await playerService.executeSetRate(event.payload.rate);
          break;

        case "SET_VOLUME":
          await playerService.executeSetVolume(event.payload.volume);
          break;
      }
    } catch (error) {
      log.error(
        `[Coordinator] Error executing transition: ${event.type} -> ${nextState}`,
        error as Error
      );
      // Recovery: route to ERROR so the machine doesn't get stuck (e.g. LOADING
      // has no JS-reachable exit — only native events that never arrive after a
      // JS-side throw). ERROR allows PLAY/LOAD_TRACK/STOP, so the user can retry.
      //
      // Loop protection — do not re-dispatch when:
      // 1. the failing event was itself an error event (NATIVE_ERROR /
      //    NATIVE_PLAYBACK_ERROR) — avoids recursing if handling an error event
      //    itself throws.
      // 2. the machine is already in ERROR/FATAL_ERROR — avoids dispatching a
      //    fresh error while one is already being handled.
      const isErrorEvent = event.type === "NATIVE_ERROR" || event.type === "NATIVE_PLAYBACK_ERROR";
      const alreadyInErrorState =
        this.context.currentState === PlayerState.ERROR ||
        this.context.currentState === PlayerState.FATAL_ERROR;
      if (!isErrorEvent && !alreadyInErrorState) {
        dispatchPlayerEvent(
          { type: "NATIVE_ERROR", payload: { error: error as Error } },
          { source: "native_player" }
        );
      }
    }
  }
}

/**
 * Convenience function to get coordinator instance
 */
export function getCoordinator(): PlayerStateCoordinator {
  return PlayerStateCoordinator.getInstance();
}
