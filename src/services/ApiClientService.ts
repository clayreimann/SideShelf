/**
 * API Client Service
 *
 * Manages API configuration and token refresh coordination.
 * This service handles:
 * - API configuration management
 * - Token refresh with mutex to prevent race conditions
 * - All HTTP operations including token refresh
 * - Configurable timeouts
 */

import { authHelpers } from "@/db/helpers";
import { logger } from "@/lib/logger";

const log = logger.forTag("api:client");

export type ApiConfig = {
  getBaseUrl: () => string | null;
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  clearTokens: () => Promise<void>;
  timeout?: number; // in milliseconds, defaults to 30000
};

class ApiClientService {
  private config: ApiConfig | null = null;
  private refreshPromise: Promise<boolean> | null = null;

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
   * Handle unauthorized response with mutex to prevent concurrent refreshes
   *
   * When multiple requests receive 401 at the same time:
   * - First request initiates token refresh
   * - Subsequent requests await the same refresh promise
   * - All requests retry after refresh completes
   */
  async handleUnauthorized(): Promise<boolean> {
    // If a refresh is already in progress, await it
    if (this.refreshPromise) {
      log.info("Token refresh already in progress, waiting...");
      return await this.refreshPromise;
    }

    // Start the refresh process
    log.info("Starting token refresh");
    this.refreshPromise = this.performTokenRefresh();

    try {
      const success = await this.refreshPromise;
      return success;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Perform the actual token refresh by calling the /auth/refresh endpoint
   */
  private async performTokenRefresh(): Promise<boolean> {
    if (!this.config) {
      log.error("No API config available");
      return false;
    }

    const baseUrl = this.config.getBaseUrl();
    const refreshToken = this.config.getRefreshToken();

    if (!baseUrl || !refreshToken) {
      log.error("Missing base URL or refresh token");
      await this.config.clearTokens();
      return false;
    }

    try {
      const response = await fetch(`${baseUrl}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-refresh-token": refreshToken,
        },
        signal: AbortSignal.timeout(this.getTimeout()),
      });

      log.info(`Token refresh response: ${response.status}`);

      if (!response.ok) {
        log.error(`Token refresh failed with status ${response.status}`);
        await this.config.clearTokens();
        return false;
      }

      const data = await response.json();
      const tokens = authHelpers.extractTokensFromAuthResponse(data);

      if (!tokens.accessToken || !tokens.refreshToken) {
        log.error("Token refresh response missing tokens");
        await this.config.clearTokens();
        return false;
      }

      await this.config.setTokens(tokens.accessToken, tokens.refreshToken);
      log.info("Token refresh succeeded");
      return true;
    } catch (error) {
      log.error("Token refresh error:", error);
      await this.config.clearTokens();
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
   * Check if a refresh is currently in progress
   */
  isRefreshing(): boolean {
    return this.refreshPromise !== null;
  }
}

// Singleton instance
export const apiClientService = new ApiClientService();
