import { logger } from "@/lib/logger";
import { playerEventBus } from "./eventBus";
import { NativeBridgeIntegrator } from "./nativeBridgeIntegrator";

const log = logger.forTag("CoordinatorFactory");

let integrator: NativeBridgeIntegrator | null = null;

/**
 * Initialize the Native Bridge Integrator.
 * Should be called early in the app lifecycle.
 */
export function initializeNativeBridge() {
  if (!integrator) {
    log.info("Initializing Native Bridge Integrator");
    integrator = new NativeBridgeIntegrator(playerEventBus);
    integrator.initialize();
  }
}

// Export everything else
export * from "./contextDetection";
export * from "./eventBus";
export * from "./PlayerStateCoordinator";
export * from "./transitions";

