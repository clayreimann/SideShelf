import { logger } from "@/lib/logger";
import { PlayerEvent } from "@/types/coordinator";
import { NativeBridge, NativePlayerEvent } from "../nativeEventBridge";
import { PlayerEventBus } from "./eventBus";

const log = logger.forTag("NativeBridgeIntegrator");

// Unique ID for this JS context to prevent echo
const CONTEXT_ID = `ctx-${Date.now()}-${Math.random()}`;

/**
 * Integrates the PlayerEventBus with the NativeBridge.
 * - Listens to PlayerEventBus and broadcasts to NativeBridge.
 * - Listens to NativeBridge and dispatches to PlayerEventBus.
 */
export class NativeBridgeIntegrator {
  private unsubscribeBus: (() => void) | null = null;
  private isInitialized = false;

  constructor(private eventBus: PlayerEventBus) {}

  initialize() {
    if (this.isInitialized) return;

    log.info(`Initializing NativeBridgeIntegrator with Context ID: ${CONTEXT_ID}`);

    // 1. Listen to Local EventBus -> Broadcast to Native
    this.unsubscribeBus = this.eventBus.subscribe((event) => {
      // We need to distinguish if this event came from native bridge (to avoid loops)
      // But the EventBus is now pure, so it doesn't know about sources.
      // We can't easily tag the event object itself without changing the type.
      // However, since we are the ones dispatching to the bus from native,
      // we can perhaps use a flag or just rely on the fact that we won't
      // re-dispatch if we see our own context ID from native.
      
      // WAIT: If we dispatch to bus from native, this listener will fire.
      // We need to avoid sending that back to native.
      // The EventBus dispatch is synchronous for the listener call.
      
      // Strategy: We can't easily tag the event in the bus without changing types.
      // BUT, we can check if we are currently processing a native event.
      if (this.isProcessingNativeEvent) return;

      this.broadcastToNative(event);
    });

    // 2. Listen to Native Bridge -> Dispatch to Local EventBus
    NativeBridge.addListener("ABSPlayerEvent", (eventData: NativePlayerEvent) => {
      this.handleNativeEvent(eventData);
    });

    this.isInitialized = true;
  }

  private isProcessingNativeEvent = false;

  private handleNativeEvent(eventData: NativePlayerEvent) {
    // Echo prevention: Don't process events we sent
    if (eventData.__contextId === CONTEXT_ID) {
      return;
    }

    log.debug(`Received cross-context event: ${eventData.type}`);

    try {
      this.isProcessingNativeEvent = true;
      
      // Re-construct PlayerEvent
      const event: PlayerEvent = {
        type: eventData.type as any,
        payload: eventData.payload,
      };

      // Dispatch to local bus
      this.eventBus.dispatch(event);
    } finally {
      this.isProcessingNativeEvent = false;
    }
  }

  private broadcastToNative(event: PlayerEvent) {
    log.debug(`Broadcasting event to native: ${event.type}`);
    
    NativeBridge.dispatch({
      type: event.type,
      payload: (event as any).payload,
      __contextId: CONTEXT_ID,
    });
  }

  cleanup() {
    if (this.unsubscribeBus) {
      this.unsubscribeBus();
      this.unsubscribeBus = null;
    }
    NativeBridge.removeAllListeners("ABSPlayerEvent");
    this.isInitialized = false;
  }
}
