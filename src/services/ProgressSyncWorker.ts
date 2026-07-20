import {
  acknowledgeProgressSyncRevision,
  getEarliestProgressSyncRetryDeadline,
  getNextEligibleProgressSync,
  recordProgressSyncFailure,
  terminallyResolveProgressSyncRevision,
  type PendingProgressSync,
  type ProgressSyncTerminalReason,
} from "@/db/helpers/progressSyncOutbox";
import { getLibraryItemById } from "@/db/helpers/libraryItems";
import { marshalMediaProgressFromApi, upsertMediaProgress } from "@/db/helpers/mediaProgress";
import {
  ApiResponseError,
  createLocalSession,
  fetchMediaProgress,
  getDeviceInfo,
} from "@/lib/api/endpoints";
import { logger } from "@/lib/logger";
import { apiClientService } from "@/services/ApiClientService";
import NetInfo from "@react-native-community/netinfo";

const PERIODIC_DRAIN_INTERVAL_MS = 2 * 60 * 1000;
const UNMETERED_PROGRESS_DRAIN_INTERVAL_MS = 15 * 1000;
const METERED_PROGRESS_DRAIN_INTERVAL_MS = 60 * 1000;
const INITIAL_RETRY_DELAY_MS = 15 * 1000;
const MAX_RETRY_DELAY_MS = 15 * 60 * 1000;
const MIN_MEANINGFUL_LISTENING_SECONDS = 5;
const LOCAL_SESSION_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const log = logger.forTag("ProgressSyncWorker");

export type ProgressSyncTrigger =
  | "authentication"
  | "network"
  | "foreground"
  | "periodic"
  | "pause"
  | "end"
  | "manual"
  | "progress";

export type AwaitableProgressSyncTrigger = Exclude<ProgressSyncTrigger, "progress">;

type PendingDeliveryResult = "continue" | "stop";

type DeliveryContext = {
  generation: number;
  userId: string;
};

type PendingReconciliation = {
  userId: string;
  libraryItemId: string;
  episodeId?: string;
};

type DrainIdleWaiter = {
  generation: number;
  resolve: () => void;
  reject: (reason?: unknown) => void;
  failed: boolean;
  error?: unknown;
};

/** Return the durable retry delay for the row's current consecutive failure count. */
export function calculateProgressRetryDelay(
  attemptCount: number,
  random: () => number,
  retryAfterMs?: number
): number {
  if (typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return retryAfterMs;
  }

  const normalizedAttempt = Number.isFinite(attemptCount)
    ? Math.max(0, Math.floor(attemptCount))
    : 0;
  const exponentialDelay = Math.min(
    INITIAL_RETRY_DELAY_MS * 2 ** Math.min(normalizedAttempt, 30),
    MAX_RETRY_DELAY_MS
  );
  const randomValue = Math.min(1, Math.max(0, random()));
  const jitterMultiplier = 0.8 + randomValue * 0.4;
  return Math.min(MAX_RETRY_DELAY_MS, Math.round(exponentialDelay * jitterMultiplier));
}

/**
 * Owns the authenticated lifetime and scheduling of durable progress delivery.
 *
 * Row delivery remains a narrow protected seam so scheduling stays independent
 * from transport decisions and generation changes remain safe in flight.
 */
export class ProgressSyncWorker {
  private enabledUserId: string | null = null;
  private generation = 0;
  private drainPromise: Promise<void> | null = null;
  private drainRequested = false;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeDeadline: number | null = null;
  private pendingReconciliations = new Map<string, PendingReconciliation>();
  private drainIdleWaiters = new Set<DrainIdleWaiter>();

  constructor(private readonly random: () => number = Math.random) {}

  start(userId: string): void {
    if (this.enabledUserId === userId) {
      return;
    }

    this._clearTimers();
    for (const [key, pending] of this.pendingReconciliations) {
      if (pending.userId !== userId) {
        this.pendingReconciliations.delete(key);
      }
    }
    this.enabledUserId = userId;
    this.generation += 1;
    this._resolveObsoleteDrainWaiters();

    this.periodicTimer = setInterval(() => {
      this.requestDrain("periodic");
    }, PERIODIC_DRAIN_INTERVAL_MS);

    this.requestDrain("authentication");
  }

  stop(): void {
    this.enabledUserId = null;
    this.generation += 1;
    this.drainRequested = false;
    this._clearTimers();
    this._resolveObsoleteDrainWaiters();
  }

  requestDrain(trigger: ProgressSyncTrigger): void {
    if (!this.enabledUserId) {
      return;
    }

    if (trigger === "progress") {
      void this._requestProgressDrain().catch((error: unknown) => {
        log.error("Progress cadence scheduling failed", asError(error));
      });
      return;
    }

    this.drainRequested = true;
    this._drainInBackground();
  }

  /**
   * Request an immediate drain and resolve only once that generation is idle.
   * If another pass is queued behind an active drain, the promise spans both passes.
   */
  requestDrainAndWait(trigger: AwaitableProgressSyncTrigger): Promise<void> {
    const generation = this.generation;
    if (!this.enabledUserId) return Promise.resolve();

    this.requestDrain(trigger);
    if (generation !== this.generation || (!this.drainPromise && !this.drainRequested)) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      this.drainIdleWaiters.add({ generation, resolve, reject, failed: false });
    });
  }

  drainNow(): Promise<void> {
    const userId = this.enabledUserId;
    if (!userId) {
      return Promise.resolve();
    }

    if (this.drainPromise) {
      return this.drainPromise;
    }

    const generation = this.generation;
    this.drainRequested = false;

    let drain: Promise<void>;
    drain = this._drain(generation, userId)
      .catch((error: unknown) => {
        this._recordDrainFailure(generation, error);
        throw error;
      })
      .finally(() => {
        if (this.drainPromise !== drain) {
          return;
        }

        this.drainPromise = null;
        if (this.enabledUserId && this.drainRequested) {
          this._drainInBackground();
          return;
        }
        this._settleDrainWaiters(generation);
      });
    this.drainPromise = drain;
    return drain;
  }

  /** Deliver one captured absolute snapshot without recapturing its mutable revision state. */
  // eslint-disable-next-line complexity -- Each early return is a required delivery boundary.
  protected async _deliverPending(
    pending: PendingProgressSync,
    context: DeliveryContext = {
      generation: this.generation,
      userId: this.enabledUserId ?? "",
    }
  ): Promise<PendingDeliveryResult> {
    if (!this._canDeliverPending(pending, context)) {
      return "stop";
    }

    const malformedReason = getMalformedPendingReason(pending);
    if (malformedReason) {
      return this._terminallyResolve(pending, "malformed_local_data", malformedReason, context);
    }

    if (pending.session.timeListening < MIN_MEANINGFUL_LISTENING_SECONDS) {
      return this._terminallyResolve(
        pending,
        "too_short",
        `Listening duration ${pending.session.timeListening}s is below the 5s minimum`,
        context
      );
    }

    let libraryItem: Awaited<ReturnType<typeof getLibraryItemById>>;
    try {
      libraryItem = await getLibraryItemById(pending.session.libraryItemId);
    } catch (error) {
      log.error(
        `Failed to resolve local media relation session=${pending.session.id} item=${pending.session.libraryItemId}`,
        asError(error)
      );
      return "stop";
    }

    if (!this._canDeliverPending(pending, context)) {
      return "stop";
    }
    if (!libraryItem) {
      return this._terminallyResolve(
        pending,
        "local_media_missing",
        `Local library item ${pending.session.libraryItemId} was not found`,
        context
      );
    }
    if (!isNonEmptyId(libraryItem.libraryId)) {
      return this._terminallyResolve(
        pending,
        "malformed_local_data",
        `Local library item ${pending.session.libraryItemId} has an invalid library ID`,
        context
      );
    }

    let network: Awaited<ReturnType<typeof NetInfo.fetch>>;
    try {
      network = await NetInfo.fetch();
    } catch {
      log.warn(
        `Network preflight unavailable; retaining session=${pending.session.id} item=${pending.session.libraryItemId}`
      );
      return "stop";
    }

    if (!this._canDeliverPending(pending, context)) {
      return "stop";
    }
    if (network.isConnected === false || network.isInternetReachable === false) {
      log.info(
        `Offline before upload; retaining session=${pending.session.id} item=${pending.session.libraryItemId}`
      );
      return "stop";
    }

    const episodeId = pending.session.episodeId ?? undefined;
    let deviceInfo: Awaited<ReturnType<typeof getDeviceInfo>>;
    try {
      deviceInfo = await getDeviceInfo();
    } catch (error) {
      const wakeAt = new Date(
        Date.now() + calculateProgressRetryDelay(pending.outbox.attemptCount, this.random)
      );
      log.warn(
        `Device enrichment unavailable; retaining session=${pending.session.id} item=${pending.session.libraryItemId}: ${getErrorMessage(error)}`
      );
      this._scheduleWakeAt(wakeAt);
      return "stop";
    }

    if (!this._canDeliverPending(pending, context)) {
      return "stop";
    }

    try {
      await createLocalSession({
        sessionId: pending.session.id,
        userId: pending.session.userId,
        libraryId: libraryItem.libraryId,
        libraryItemId: pending.session.libraryItemId,
        startTime: pending.session.startTime,
        currentTime: pending.session.currentTime,
        timeListening: pending.session.timeListening,
        duration: pending.session.duration,
        episodeId,
        startedAt: pending.session.sessionStart.getTime(),
        updatedAt: pending.session.updatedAt.getTime(),
        deviceInfo,
      });
    } catch (error) {
      return this._classifyUploadFailure(pending, error, context);
    }

    try {
      await acknowledgeProgressSyncRevision(pending.session.id, pending.sentRevision, new Date());
    } catch (error) {
      if (isMissingOutboxError(error)) {
        return "stop";
      }
      log.error(
        `Upload accepted but acknowledgement failed session=${pending.session.id} revision=${pending.sentRevision}`,
        asError(error)
      );
      return "stop";
    }

    if (!this._canDeliverPending(pending, context)) {
      return "stop";
    }

    // Reconciliation is refresh work: acknowledgement deliberately precedes it so a
    // refresh failure can never replay an already accepted upload.
    try {
      const serverProgress = episodeId
        ? await fetchMediaProgress(pending.session.libraryItemId, episodeId)
        : await fetchMediaProgress(pending.session.libraryItemId);
      if (!this._canDeliverPending(pending, context)) {
        this._queueReconciliation(pending.session.libraryItemId, pending.session.userId, episodeId);
        return "stop";
      }
      await upsertMediaProgress([
        marshalMediaProgressFromApi(serverProgress, pending.session.userId),
      ]);
      this._completeReconciliation(
        pending.session.libraryItemId,
        pending.session.userId,
        episodeId
      );
    } catch (error) {
      await this._deferReconciliation(
        pending.session.libraryItemId,
        pending.session.userId,
        episodeId,
        error
      );
    }

    return "continue";
  }

  /** Schedule the earliest one-shot retry or live-progress wake for the active user. */
  protected _scheduleWakeAt(when: Date): void {
    const userId = this.enabledUserId;
    if (!userId) {
      return;
    }

    const deadline = when.getTime();
    if (deadline <= Date.now()) {
      this._clearWakeTimer();
      this.requestDrain("periodic");
      return;
    }

    if (this.wakeDeadline !== null && this.wakeDeadline <= deadline) {
      return;
    }

    this._clearWakeTimer();

    const generation = this.generation;
    this.wakeDeadline = deadline;
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null;
      this.wakeDeadline = null;

      if (this._isCurrentGeneration(generation, userId)) {
        this.requestDrain("periodic");
      }
    }, deadline - Date.now());
  }

  private async _requestProgressDrain(): Promise<void> {
    const userId = this.enabledUserId;
    const generation = this.generation;
    if (!userId) {
      return;
    }

    let network: Awaited<ReturnType<typeof NetInfo.fetch>> | null = null;
    try {
      network = await NetInfo.fetch();
    } catch (error) {
      log.warn(`Network cadence inspection unavailable: ${getErrorMessage(error)}`);
    }
    if (!this._isCurrentGeneration(generation, userId)) {
      return;
    }

    const isUnmetered = network?.type === "wifi" || network?.type === "ethernet";
    const interval = isUnmetered
      ? UNMETERED_PROGRESS_DRAIN_INTERVAL_MS
      : METERED_PROGRESS_DRAIN_INTERVAL_MS;
    this._scheduleWakeAt(new Date(Date.now() + interval));
  }

  private async _drain(generation: number, userId: string): Promise<void> {
    await this._retryPendingReconciliations({ generation, userId });

    while (this._isCurrentGeneration(generation, userId)) {
      const pending = await getNextEligibleProgressSync(userId, new Date());
      if (!pending || !this._isCurrentGeneration(generation, userId)) {
        if (this._isCurrentGeneration(generation, userId)) {
          const deadline = await getEarliestProgressSyncRetryDeadline(userId, new Date());
          if (deadline && this._isCurrentGeneration(generation, userId)) {
            this._scheduleWakeAt(deadline);
          }
        }
        return;
      }

      const deliveryResult = await this._deliverPending(pending, { generation, userId });
      if (deliveryResult === "stop" || !this._isCurrentGeneration(generation, userId)) {
        return;
      }
    }
  }

  private _isCurrentGeneration(generation: number, userId: string): boolean {
    return this.generation === generation && this.enabledUserId === userId;
  }

  private _drainInBackground(): void {
    void this.drainNow().catch((error: unknown) => {
      log.error("Progress drain failed", asError(error));
    });
  }

  private _recordDrainFailure(generation: number, error: unknown): void {
    for (const waiter of this.drainIdleWaiters) {
      if (waiter.generation === generation && !waiter.failed) {
        waiter.failed = true;
        waiter.error = error;
      }
    }
  }

  private _settleDrainWaiters(generation: number): void {
    for (const waiter of this.drainIdleWaiters) {
      if (waiter.generation !== generation) continue;
      this.drainIdleWaiters.delete(waiter);
      if (waiter.failed) waiter.reject(waiter.error);
      else waiter.resolve();
    }
  }

  private _resolveObsoleteDrainWaiters(): void {
    for (const waiter of this.drainIdleWaiters) {
      if (waiter.generation !== this.generation) {
        this.drainIdleWaiters.delete(waiter);
        if (waiter.failed) waiter.reject(waiter.error);
        else waiter.resolve();
      }
    }
  }

  private _canDeliverPending(pending: PendingProgressSync, context: DeliveryContext): boolean {
    return (
      this._isCurrentGeneration(context.generation, context.userId) &&
      pending.outbox.userId === context.userId &&
      pending.session.userId === context.userId
    );
  }

  private _queueReconciliation(libraryItemId: string, userId: string, episodeId?: string): void {
    const reconciliation = { userId, libraryItemId, episodeId };
    this.pendingReconciliations.set(getReconciliationKey(reconciliation), reconciliation);
  }

  private _completeReconciliation(libraryItemId: string, userId: string, episodeId?: string): void {
    this.pendingReconciliations.delete(getReconciliationKey({ userId, libraryItemId, episodeId }));
  }

  /**
   * Retry best-effort refresh work retained during this process. Task 7's full
   * authenticated refresh owns recovery after a process restart.
   */
  private async _retryPendingReconciliations(context: DeliveryContext): Promise<void> {
    if (!this._isCurrentGeneration(context.generation, context.userId)) {
      return;
    }

    // Snapshot the set so failures from this pass wait for a later drain trigger.
    const pendingRefreshes = [...this.pendingReconciliations.values()].filter(
      (pending) => pending.userId === context.userId
    );
    for (const pending of pendingRefreshes) {
      if (!this._isCurrentGeneration(context.generation, context.userId)) {
        return;
      }

      try {
        const serverProgress = pending.episodeId
          ? await fetchMediaProgress(pending.libraryItemId, pending.episodeId)
          : await fetchMediaProgress(pending.libraryItemId);
        if (!this._isCurrentGeneration(context.generation, context.userId)) {
          return;
        }
        await upsertMediaProgress([marshalMediaProgressFromApi(serverProgress, context.userId)]);
        this._completeReconciliation(pending.libraryItemId, context.userId, pending.episodeId);
      } catch (error) {
        if (isAuthenticationRejection(error)) {
          await this._clearRejectedAuthentication();
        }
        log.warn(
          `Progress reconciliation remains deferred user=${context.userId} item=${pending.libraryItemId}: ${getErrorMessage(error)}`
        );
      }
    }
  }

  private async _deferReconciliation(
    libraryItemId: string,
    userId: string,
    episodeId: string | undefined,
    error: unknown
  ): Promise<void> {
    this._queueReconciliation(libraryItemId, userId, episodeId);
    if (isAuthenticationRejection(error)) {
      await this._clearRejectedAuthentication();
    }
    log.warn(
      `Progress reconciliation deferred user=${userId} item=${libraryItemId}: ${getErrorMessage(error)}`
    );
  }

  private async _clearRejectedAuthentication(): Promise<void> {
    try {
      await apiClientService.clearTokens();
    } catch (clearError) {
      log.error("Failed to clear rejected authentication tokens", asError(clearError));
    } finally {
      this.stop();
    }
  }

  private async _terminallyResolve(
    pending: PendingProgressSync,
    reason: ProgressSyncTerminalReason,
    error: string,
    context: DeliveryContext
  ): Promise<PendingDeliveryResult> {
    if (!this._canDeliverPending(pending, context)) {
      return "stop";
    }

    try {
      await terminallyResolveProgressSyncRevision(
        pending.session.id,
        pending.sentRevision,
        reason,
        new Date(),
        error
      );
      return this._canDeliverPending(pending, context) ? "continue" : "stop";
    } catch (terminalError) {
      log.error(
        `Failed to record terminal progress result session=${pending.session.id} revision=${pending.sentRevision}`,
        asError(terminalError)
      );
      return "stop";
    }
  }

  // eslint-disable-next-line complexity -- HTTP outcomes intentionally map one-to-one to policy.
  private async _classifyUploadFailure(
    pending: PendingProgressSync,
    error: unknown,
    context: DeliveryContext
  ): Promise<PendingDeliveryResult> {
    if (!this._canDeliverPending(pending, context)) {
      return "stop";
    }

    if (error instanceof ApiResponseError) {
      if (error.status === 401 || error.status === 403) {
        await this._clearRejectedAuthentication();
        return "stop";
      }
      if (error.status === 404) {
        return this._terminallyResolve(pending, "media_missing", getErrorMessage(error), context);
      }
      if (error.status === 400 || error.status === 422) {
        return this._terminallyResolve(
          pending,
          "malformed_local_data",
          getErrorMessage(error),
          context
        );
      }
    }

    const retryAfterMs =
      error instanceof ApiResponseError && error.status === 429 ? error.retryAfter : undefined;
    const retryDelay = calculateProgressRetryDelay(
      pending.outbox.attemptCount,
      this.random,
      retryAfterMs
    );
    const attemptedAt = new Date();
    const nextAttemptAt = new Date(attemptedAt.getTime() + retryDelay);

    try {
      await recordProgressSyncFailure(
        pending.session.id,
        attemptedAt,
        nextAttemptAt,
        getErrorMessage(error)
      );
    } catch (recordError) {
      log.error(
        `Failed to record progress retry session=${pending.session.id} revision=${pending.sentRevision}`,
        asError(recordError)
      );
      return "stop";
    }

    if (!this._canDeliverPending(pending, context)) {
      return "stop";
    }
    this._scheduleWakeAt(nextAttemptAt);
    return "stop";
  }

  private _clearTimers(): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
    this._clearWakeTimer();
  }

  private _clearWakeTimer(): void {
    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = null;
    }
    this.wakeDeadline = null;
  }
}

export const progressSyncWorker = new ProgressSyncWorker();

function getReconciliationKey(pending: PendingReconciliation): string {
  return JSON.stringify([pending.userId, pending.libraryItemId, pending.episodeId ?? null]);
}

function isMissingOutboxError(error: unknown): boolean {
  return error instanceof Error && /^Outbox .+ not found$/.test(error.message);
}

function isAuthenticationRejection(error: unknown): boolean {
  return error instanceof ApiResponseError && (error.status === 401 || error.status === 403);
}

// eslint-disable-next-line complexity -- Validation reports the first malformed snapshot field.
function getMalformedPendingReason(pending: PendingProgressSync): string | null {
  const { session, outbox, sentRevision } = pending;
  if (!LOCAL_SESSION_UUID_PATTERN.test(session.id) || outbox.sessionId !== session.id) {
    return `Invalid local session ID session=${session.id}`;
  }
  if (
    !isNonEmptyId(session.userId) ||
    !isNonEmptyId(outbox.userId) ||
    !isNonEmptyId(session.libraryItemId) ||
    !isNonEmptyId(session.mediaId)
  ) {
    return `Invalid local identifiers session=${session.id} item=${session.libraryItemId}`;
  }
  if (
    session.episodeId !== null &&
    session.episodeId !== undefined &&
    !isNonEmptyId(session.episodeId)
  ) {
    return `Invalid local episode ID session=${session.id}`;
  }
  if (!Number.isInteger(sentRevision) || sentRevision <= 0) {
    return `Invalid sent revision session=${session.id}`;
  }
  if (
    !isNonNegativeFinite(session.startTime) ||
    !isNonNegativeFinite(session.currentTime) ||
    !isPositiveFinite(session.duration) ||
    !isNonNegativeFinite(session.timeListening)
  ) {
    return `Invalid local progress values session=${session.id}`;
  }
  if (!isValidDate(session.sessionStart) || !isValidDate(session.updatedAt)) {
    return `Invalid local timestamps session=${session.id}`;
  }
  return null;
}

function isNonEmptyId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeFinite(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isValidDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
