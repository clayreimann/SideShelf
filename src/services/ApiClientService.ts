/**
 * API Client Service
 *
 * Manages API configuration, token refresh coordination, and request lifecycle.
 * This service handles:
 * - API configuration management
 * - Token refresh with mutex to prevent race conditions
 * - Request queuing during token refresh
 * - Configurable timeouts
 * - Request cancellation support
 */

import { logger } from "@/lib/logger";

const log = logger.forTag("api:client");

export type ApiConfig = {
  getBaseUrl: () => string | null;
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<boolean>;
  timeout?: number; // in milliseconds, defaults to 30000
};

type PendingRequest = {
  resolve: (value: boolean) => void;
  reject: (error: Error) => void;
};

class ApiClientService {
  private config: ApiConfig | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  private pendingRequests: PendingRequest[] = [];

  /**
   * Set the API configuration
   */
  setConfig(config: ApiConfig): void {
    this.config = config;
    log.info("API client configured");
  }

  /**
   * Get the current API configuration
   */
  getConfig(): ApiConfig | null {
    return this.config;
  }

  /**
   * Handle unauthorized response with mutex and request queuing
   * This prevents race conditions when multiple requests hit 401 simultaneously
   *
   * When multiple requests receive 401 at the same time:
   * - First request initiates token refresh
   * - Subsequent requests are queued and wait for the refresh to complete
   * - All queued requests are resolved/rejected together based on refresh result
   */
  async handleUnauthorized(): Promise<boolean> {
    // If a refresh is already in progress, queue this request
    if (this.refreshPromise) {
      log.info("Token refresh already in progress, queuing request");
      return new Promise<boolean>((resolve, reject) => {
        this.pendingRequests.push({ resolve, reject });
      });
    }

    // Start the refresh process
    log.info("Starting token refresh");
    this.refreshPromise = this.performTokenRefresh();

    try {
      const success = await this.refreshPromise;

      // Resolve all queued requests
      if (this.pendingRequests.length > 0) {
        log.info(`Resolving ${this.pendingRequests.length} queued requests`);
        this.pendingRequests.forEach((req) => req.resolve(success));
        this.pendingRequests = [];
      }

      return success;
    } catch (error) {
      // Reject all queued requests
      if (this.pendingRequests.length > 0) {
        log.error(`Rejecting ${this.pendingRequests.length} queued requests`);
        this.pendingRequests.forEach((req) =>
          req.reject(error instanceof Error ? error : new Error("Token refresh failed"))
        );
        this.pendingRequests = [];
      }
      throw error;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Perform the actual token refresh
   */
  private async performTokenRefresh(): Promise<boolean> {
    if (!this.config?.refreshAccessToken) {
      log.error("No refresh token handler configured");
      return false;
    }

    try {
      const success = await this.config.refreshAccessToken();
      log.info(`Token refresh ${success ? "succeeded" : "failed"}`);
      return success;
    } catch (error) {
      log.error("Token refresh error:", error);
      return false;
    }
  }

  /**
   * Get the configured timeout value
   */
  getTimeout(): number {
    return this.config?.timeout ?? 30000;
  }

  /**
   * Create an AbortSignal that times out after the configured duration
   *
   * @param customTimeout - Optional custom timeout in milliseconds
   * @returns AbortSignal that will abort after the timeout
   */
  createTimeoutSignal(customTimeout?: number): AbortSignal {
    const timeout = customTimeout ?? this.getTimeout();
    return AbortSignal.timeout(timeout);
  }

  /**
   * Combine multiple abort signals into one
   * This allows both timeout and manual cancellation
   *
   * @param signals - Array of AbortSignals to combine
   * @returns A new AbortSignal that aborts when any input signal aborts
   */
  combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
    const controller = new AbortController();
    const validSignals = signals.filter((s): s is AbortSignal => s !== undefined);

    for (const signal of validSignals) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        break;
      }
      signal.addEventListener("abort", () => {
        controller.abort(signal.reason);
      });
    }

    return controller.signal;
  }

  /**
   * Check if a refresh is currently in progress
   */
  isRefreshing(): boolean {
    return this.refreshPromise !== null;
  }

  /**
   * Get the number of requests currently queued
   */
  getQueuedRequestCount(): number {
    return this.pendingRequests.length;
  }
}

// Singleton instance
export const apiClientService = new ApiClientService();
