/**
 * Context Detection Utility
 * 
 * Helper functions to determine the current JavaScript execution context.
 * Used to distinguish between UI (React Native) and Headless JS (Background Service) contexts.
 */

export function isHeadlessContext(): boolean {
  // UI has window, Headless doesn't
  if (typeof window !== "undefined") return false;

  // Headless has __fbBatchedBridge but no window
  // Note: This is a heuristic and might need adjustment based on RN version
  if (typeof global !== "undefined" && typeof (global as any).__fbBatchedBridge !== "undefined") {
    return true;
  }

  return false;
}

export function getContextId(): string {
  return isHeadlessContext() ? "HEADLESS" : "UI";
}
