/**
 * API Client Service
 *
 * Owns and manages API credentials and configuration.
 * This service handles:
 * - Token and base URL storage and persistence
 * - Token refresh with mutex to prevent race conditions
 * - All HTTP operations including token refresh
 * - Configurable timeouts
 * - Notifying subscribers of auth state changes
 */

import { authHelpers } from "@/db/helpers";
import { getItem, saveItem, SECURE_KEYS } from "@/lib/secureStore";
import { logger } from "@/lib/logger";

const log = logger.forTag("api:client");

type AuthStateListener = () => void;

class ApiClientService {
  private baseUrl: string | null = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private username: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  private listeners: Set<AuthStateListener> = new Set();
  private timeout: number = 30000; // default 30 seconds

  /**
   * Initialize by loading credentials from secure storage
   */
  async initialize(): Promise<void> {
    log.info("Initializing API client service");
    const [serverUrl, accessToken, refreshToken] = await Promise.all([
      getItem(SECURE_KEYS.serverUrl),
      getItem(SECURE_KEYS.accessToken),
      getItem(SECURE_KEYS.refreshToken),
    ]);

    this.baseUrl = serverUrl;
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;

    log.info(
      `Loaded credentials: baseUrl=${!!this.baseUrl}, accessToken=${!!this.accessToken}, refreshToken=${!!this.refreshToken}`
    );
  }

  /**
   * Subscribe to auth state changes
   * @returns Unsubscribe function
   */
  subscribe(listener: AuthStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all subscribers of auth state changes
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Get base URL
   */
  getBaseUrl(): string | null {
    return this.baseUrl;
  }

  /**
   * Get access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Get refresh token
   */
  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  /**
   * Get username
   */
  getUsername(): string | null {
    return this.username;
  }

  /**
   * Check if authenticated (has both baseUrl and accessToken)
   */
  isAuthenticated(): boolean {
    return !!this.baseUrl && !!this.accessToken;
  }

  /**
   * Set base URL and persist to secure storage
   */
  async setBaseUrl(url: string): Promise<void> {
    const normalized = url.trim().replace(/\/$/, "");
    this.baseUrl = normalized;
    await saveItem(SECURE_KEYS.serverUrl, normalized);
    this.notifyListeners();
  }

  /**
   * Set tokens and persist to secure storage
   */
  async setTokens(accessToken: string, refreshToken: string, username?: string): Promise<void> {
    log.info("Updating tokens");
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    if (username !== undefined) {
      this.username = username;
    }

    await Promise.all([
      saveItem(SECURE_KEYS.accessToken, accessToken),
      saveItem(SECURE_KEYS.refreshToken, refreshToken),
    ]);

    this.notifyListeners();
  }

  /**
   * Clear tokens and persist to secure storage
   */
  async clearTokens(): Promise<void> {
    log.info("Clearing tokens");
    this.accessToken = null;
    this.refreshToken = null;
    this.username = null;

    await Promise.all([
      saveItem(SECURE_KEYS.accessToken, null),
      saveItem(SECURE_KEYS.refreshToken, null),
    ]);

    this.notifyListeners();
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
    if (!this.baseUrl || !this.refreshToken) {
      log.error("Missing base URL or refresh token");
      await this.clearTokens();
      return false;
    }

    // Create abort controller with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-refresh-token": this.refreshToken,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      log.info(`Token refresh response: ${response.status}`);

      if (!response.ok) {
        log.error(`Token refresh failed with status ${response.status}`);
        await this.clearTokens();
        return false;
      }

      const data = await response.json();
      const tokens = authHelpers.extractTokensFromAuthResponse(data);

      if (!tokens.accessToken || !tokens.refreshToken) {
        log.error("Token refresh response missing tokens");
        await this.clearTokens();
        return false;
      }

      await this.setTokens(tokens.accessToken, tokens.refreshToken);
      log.info("Token refresh succeeded");
      return true;
    } catch (error) {
      clearTimeout(timeoutId);
      log.error("Token refresh error:", error as Error);
      await this.clearTokens();
      return false;
    }
  }

  /**
   * Get the configured timeout value
   */
  getTimeout(): number {
    return this.timeout;
  }

  /**
   * Set the timeout value
   */
  setTimeout(timeout: number): void {
    this.timeout = timeout;
  }

  /**
   * Create an AbortSignal that times out after the configured duration
   *
   * Note: Returns an AbortController instead of just a signal because the caller
   * needs to clean up the timeout. Callers should use controller.signal for fetch
   * and must call clearTimeout on the returned timeoutId.
   *
   * @param customTimeout - Optional custom timeout in milliseconds
   * @returns Object with controller and timeoutId for cleanup
   */
  createTimeoutSignal(customTimeout?: number): {
    controller: AbortController;
    timeoutId: ReturnType<typeof setTimeout>;
  } {
    const timeout = customTimeout ?? this.timeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    return { controller, timeoutId };
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
