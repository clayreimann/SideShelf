import {
  getNextEligibleProgressSync,
  type PendingProgressSync,
} from "@/db/helpers/progressSyncOutbox";
import NetInfo from "@react-native-community/netinfo";

const PERIODIC_DRAIN_INTERVAL_MS = 2 * 60 * 1000;
const UNMETERED_PROGRESS_DRAIN_INTERVAL_MS = 15 * 1000;
const METERED_PROGRESS_DRAIN_INTERVAL_MS = 60 * 1000;

export type ProgressSyncTrigger =
  | "authentication"
  | "network"
  | "foreground"
  | "periodic"
  | "pause"
  | "end"
  | "manual"
  | "progress";

type PendingDeliveryResult = "continue" | "stop";

/**
 * Owns the authenticated lifetime and scheduling of durable progress delivery.
 *
 * Row delivery intentionally remains a narrow protected seam until the delivery
 * task adds acknowledgement and failure classification. This keeps scheduling
 * independent from transport decisions and makes generation changes safe while
 * a request is in flight.
 */
export class ProgressSyncWorker {
  private enabledUserId: string | null = null;
  private generation = 0;
  private drainPromise: Promise<void> | null = null;
  private drainRequested = false;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeDeadline: number | null = null;

  start(userId: string): void {
    if (this.enabledUserId === userId) {
      return;
    }

    this._clearTimers();
    this.enabledUserId = userId;
    this.generation += 1;

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
  }

  requestDrain(trigger: ProgressSyncTrigger): void {
    if (!this.enabledUserId) {
      return;
    }

    if (trigger === "progress") {
      void this._requestProgressDrain();
      return;
    }

    this.drainRequested = true;
    void this.drainNow();
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
    drain = this._drain(generation, userId).finally(() => {
      if (this.drainPromise !== drain) {
        return;
      }

      this.drainPromise = null;
      if (this.enabledUserId && this.drainRequested) {
        void this.drainNow();
      }
    });
    this.drainPromise = drain;
    return drain;
  }

  /**
   * Task 5 replaces this seam with revision-aware delivery. Returning stop
   * keeps this lifecycle-only worker from repeatedly selecting an unacknowledged
   * row before that behavior exists.
   */
  protected async _deliverPending(_pending: PendingProgressSync): Promise<PendingDeliveryResult> {
    return "stop";
  }

  /** Schedule the earliest one-shot retry or live-progress wake for the active user. */
  protected _scheduleWakeAt(when: Date): void {
    const userId = this.enabledUserId;
    if (!userId) {
      return;
    }

    const deadline = when.getTime();
    if (deadline <= Date.now()) {
      this.requestDrain("periodic");
      return;
    }

    if (this.wakeDeadline !== null && this.wakeDeadline <= deadline) {
      return;
    }

    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer);
    }

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

    const network = await NetInfo.fetch();
    if (!this._isCurrentGeneration(generation, userId)) {
      return;
    }

    const isUnmetered = network.type === "wifi" || network.type === "ethernet";
    const interval = isUnmetered
      ? UNMETERED_PROGRESS_DRAIN_INTERVAL_MS
      : METERED_PROGRESS_DRAIN_INTERVAL_MS;
    this._scheduleWakeAt(new Date(Date.now() + interval));
  }

  private async _drain(generation: number, userId: string): Promise<void> {
    while (this._isCurrentGeneration(generation, userId)) {
      const pending = await getNextEligibleProgressSync(userId, new Date());
      if (!pending || !this._isCurrentGeneration(generation, userId)) {
        return;
      }

      const deliveryResult = await this._deliverPending(pending);
      if (deliveryResult === "stop" || !this._isCurrentGeneration(generation, userId)) {
        return;
      }
    }
  }

  private _isCurrentGeneration(generation: number, userId: string): boolean {
    return this.generation === generation && this.enabledUserId === userId;
  }

  private _clearTimers(): void {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = null;
    }
    this.wakeDeadline = null;
  }
}

export const progressSyncWorker = new ProgressSyncWorker();
