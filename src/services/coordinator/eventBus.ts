/**
 * Player Event Bus
 *
 * Decoupled event dispatching to prevent circular dependencies.
 * Services dispatch events to the bus, coordinator subscribes to the bus.
 *
 * Dependency graph:
 * - Services -> EventBus (dispatch events)
 * - Coordinator -> EventBus (subscribe to events)
 * - Coordinator -> Services (call methods)
 * - NO circular dependency!
 */

import type { DispatchMeta, PlayerEvent } from "@/types/coordinator";
import { logger } from "@/lib/logger";

const log = logger.forTag("PlayerEventBus");

type EventListener = (event: PlayerEvent, meta?: DispatchMeta) => void | Promise<void>;

/**
 * Simple event bus for player events.
 * Decouples event dispatching from the coordinator.
 */
export class PlayerEventBus {
  private listeners: EventListener[] = [];
  private eventHistory: Array<{ event: PlayerEvent; meta?: DispatchMeta; timestamp: number }> = [];
  private readonly MAX_HISTORY = 100;

  /**
   * Dispatch an event to all listeners
   */
  dispatch(event: PlayerEvent, meta?: DispatchMeta): void {
    // Log event
    log.debug(`Event dispatched: ${event.type}`);

    // Add to history
    this.eventHistory.push({
      event,
      meta,
      timestamp: Date.now(),
    });

    // Trim history
    if (this.eventHistory.length > this.MAX_HISTORY) {
      this.eventHistory.shift();
    }

    // Notify all listeners (async, non-blocking)
    this.listeners.forEach((listener) => {
      try {
        const result = listener(event, meta);
        // Handle both sync and async listeners
        if (result instanceof Promise) {
          result.catch((err) => {
            log.error("Event listener error:", err as Error);
          });
        }
      } catch (err) {
        log.error("Event listener error:", err as Error);
      }
    });
  }

  /**
   * Subscribe to events
   * Returns unsubscribe function
   */
  subscribe(listener: EventListener): () => void {
    this.listeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Get event history (for diagnostics)
   */
  getEventHistory(): ReadonlyArray<{ event: PlayerEvent; meta?: DispatchMeta; timestamp: number }> {
    return [...this.eventHistory];
  }

  /**
   * Clear all listeners (for testing)
   */
  clearListeners(): void {
    this.listeners = [];
  }
}

/**
 * Global event bus instance
 */
export const playerEventBus = new PlayerEventBus();

/**
 * Convenience function to dispatch events
 *
 * Use this in services instead of importing coordinator directly.
 * Pass optional meta to attach source and restoreSessionId for tracing.
 */
export function dispatchPlayerEvent(event: PlayerEvent, meta?: DispatchMeta): void {
  playerEventBus.dispatch(event, meta);
}
