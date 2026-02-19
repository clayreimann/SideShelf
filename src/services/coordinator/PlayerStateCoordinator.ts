/**
 * Player State Coordinator - Phase 2: Execution Control
 *
 * Event-driven state machine for coordinating player state.
 *
 * PHASE 2 IMPLEMENTATION (Execution Control):
 * - Executes state transitions by calling PlayerService execute* methods
 * - Services respond to coordinator commands (not independent execution)
 * - State machine validates transitions and blocks invalid ones
 * - Context updates from ALL events to reflect actual system state
 * - observerMode=false by default; set true for instant Phase 1 rollback
 *
 * KEY DESIGN DECISION:
 * Context (isPlaying, position, etc.) updates from ALL events including NATIVE_*
 * to ensure diagnostics always show current reality. When observerMode is false,
 * the coordinator calls execute* methods on PlayerService to drive playback.
 *
 * Phase history:
 * - Phase 1 (Observer Mode): Validated state machine models real system
 * - Phase 2 (Execution Control): Coordinator drives PlayerService
 * - Phase 3: Centralize position logic
 * - Phase 4: Propagate state to subscribers
 */

import { getActiveSession } from "@/db/helpers/localListeningSessions";
import { getMediaProgressForLibraryItem } from "@/db/helpers/mediaProgress";
import { getUserByUsername } from "@/db/helpers/users";
import { ASYNC_KEYS, getItem as getAsyncItem, saveItem } from "@/lib/asyncStore";
import { formatTime } from "@/lib/helpers/formatters";
import { logger } from "@/lib/logger";
import { getStoredUsername } from "@/lib/secureStore";
import { useAppStore } from "@/stores/appStore";
import {
  CoordinatorMetrics,
  DiagnosticEvent,
  EventProcessingResult,
  LARGE_DIFF_THRESHOLD,
  MIN_PLAUSIBLE_POSITION,
  PlayerEvent,
  PlayerState,
  ResumePositionInfo,
  ResumeSource,
  StateContext,
  TransitionHistoryEntry,
} from "@/types/coordinator";
import AsyncLock from "async-lock";
import EventEmitter from "eventemitter3";
import { State } from "react-native-track-player";
import { PlayerService } from "../PlayerService";
import { dispatchPlayerEvent, playerEventBus } from "./eventBus";
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

  // Phase 2: Execution mode
  private observerMode = false;

  // Phase 4: Store bridge - track last synced chapter to debounce metadata updates
  private lastSyncedChapterId: string | null = null;

  // Diagnostic logging interval
  private diagnosticInterval: NodeJS.Timeout | null = null;

  private constructor() {
    super();
    this.context = this.createInitialContext();
    this.startDiagnosticLogging();
    this.subscribeToEventBus();

    log.info(
      `[Coordinator] PlayerStateCoordinator initialized (${this.observerMode ? "Observer Mode" : "Execution Mode"})`
    );
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
   * Events are queued and processed serially. In execution mode (observerMode=false),
   * valid transitions invoke the corresponding execute* method on PlayerService.
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

  /**
   * Set observer mode at runtime.
   * When true, coordinator observes but does not execute (Phase 1 behavior).
   * When false, coordinator calls service execute* methods (Phase 2+ behavior).
   */
  setObserverMode(enabled: boolean): void {
    this.observerMode = enabled;
    log.info(`[Coordinator] Observer mode ${enabled ? "enabled" : "disabled"}`);
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
   * Handle a single event.
   *
   * Validates the transition, updates context, and (when not in observer mode)
   * calls executeTransition to invoke the appropriate execute* method on PlayerService.
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
      // Execute transition (Phase 2)
      if (!this.observerMode) {
        await this.executeTransition(event, nextState);
        // Sync coordinator state to Zustand store (Phase 4: State Propagation)
        if (event.type === "NATIVE_PROGRESS_UPDATED") {
          this.syncPositionToStore();
        } else {
          this.syncStateToStore();
        }
      }
    } else {
      log.warn(
        `[Coordinator] Rejected: ${currentState} --[${event.type}]--> Reason: ${validation.reason || "unknown"}`
      );
      this.metrics.rejectedTransitionCount++;
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
        // Clear isSeeking when progress update arrives during seek (seek is complete)
        if (this.context.isSeeking) {
          this.context.isSeeking = false;
        }
        // POS-03: Do not overwrite valid position with native-0 during track load.
        // After TrackPlayer.add(tracks), the native player briefly reports position 0
        // before the seek to the resume position completes. If we write 0 here, we
        // lose the position that resolveCanonicalPosition just resolved.
        // Once isLoadingTrack is cleared (by QUEUE_RELOADED), native 0 is accepted.
        if (this.context.isLoadingTrack && event.payload.position === 0) {
          this.context.duration = event.payload.duration; // duration update is safe
          this.context.lastPositionUpdate = Date.now();
          break;
        }
        this.context.position = event.payload.position;
        this.context.duration = event.payload.duration;
        this.context.lastPositionUpdate = Date.now();
        break;

      case "SEEK":
        this.context.preSeekState = this.context.currentState; // capture BEFORE transition
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
        // Map native State enum to isPlaying boolean
        this.context.isPlaying = event.payload.state === State.Playing;
        log.debug(
          `[Coordinator] Context updated from NATIVE_STATE_CHANGED: isPlaying=${this.context.isPlaying} (state=${event.payload.state})`
        );

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
    const store = useAppStore.getState();
    const asyncStoragePosition = (await getAsyncItem(ASYNC_KEYS.position)) as number | null;

    let position = store.player.position;
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
                } else if (asyncStoragePosition && asyncStoragePosition >= MIN_PLAUSIBLE_POSITION) {
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
    dispatchPlayerEvent({ type: "POSITION_RECONCILED", payload: { position } });

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

  /**
   * Lightweight position-only sync — called on every NATIVE_PROGRESS_UPDATED (1Hz).
   *
   * Only updates store.updatePosition() to avoid triggering expensive Zustand
   * selector re-evaluations across the full player state on every tick (PROP-02/PROP-03).
   *
   * Guard: no-op when observerMode is true or when Zustand is unavailable (Android
   * BGS headless context, PROP-05).
   */
  private syncPositionToStore(): void {
    if (this.observerMode) return;
    try {
      const store = useAppStore.getState();
      store.updatePosition(this.context.position);
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
   * isRestoringState (playerSlice-local guard), isModalVisible (UI-only),
   * initialized (lifecycle).
   *
   * After sync, if the current chapter changed, calls updateNowPlayingMetadata()
   * fire-and-forget (PROP-06: only on actual chapter change, not every structural sync).
   *
   * Guard: no-op when observerMode is true or when Zustand is unavailable (Android
   * BGS headless context, PROP-05).
   */
  private syncStateToStore(): void {
    if (this.observerMode) return;
    try {
      const store = useAppStore.getState();
      store._setCurrentTrack(this.context.currentTrack);
      store.updatePlayingState(this.context.isPlaying);
      store.updatePosition(this.context.position);
      store._setTrackLoading(this.context.isLoadingTrack);
      store._setSeeking(this.context.isSeeking);
      store._setPlaybackRate(this.context.playbackRate);
      store._setVolume(this.context.volume);
      store._setPlaySessionId(this.context.sessionId);

      // PROP-06: Only call updateNowPlayingMetadata when chapter actually changes
      const currentChapterId = this.context.currentChapter?.chapter?.id?.toString() ?? null;
      if (currentChapterId !== null && currentChapterId !== this.lastSyncedChapterId) {
        this.lastSyncedChapterId = currentChapterId;
        store.updateNowPlayingMetadata().catch((err) => {
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
      preSeekState: null,
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
  /**
   * Execute state transition
   * This is where the actual side effects happen (calling PlayerService)
   */
  private async executeTransition(
    event: PlayerEvent,
    nextState: PlayerState | null
  ): Promise<void> {
    const playerService = PlayerService.getInstance();

    try {
      // Handle state transitions
      if (nextState) {
        switch (nextState) {
          case PlayerState.LOADING:
            if (event.type === "LOAD_TRACK") {
              await playerService.executeLoadTrack(
                event.payload.libraryItemId,
                event.payload.episodeId
              );
            }
            break;

          case PlayerState.READY:
            // Resume playback if seek interrupted PLAYING state
            if (this.context.preSeekState === PlayerState.PLAYING) {
              this.context.preSeekState = null; // clear after use
              dispatchPlayerEvent({ type: "PLAY" });
            }
            break;

          case PlayerState.PLAYING:
            // Only call executePlay when actually transitioning into PLAYING (not same-state no-ops like SET_RATE)
            if (event.type === "PLAY") {
              await playerService.executePlay();
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
      // We might want to dispatch an error event here, but be careful of infinite loops
    }
  }
}

/**
 * Convenience function to get coordinator instance
 */
export function getCoordinator(): PlayerStateCoordinator {
  return PlayerStateCoordinator.getInstance();
}
