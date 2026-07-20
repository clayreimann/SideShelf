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

import { extractTokensFromAuthResponse } from "@/db/helpers/tokens";
import { getItem, saveItem, SECURE_KEYS } from "@/lib/secureStore";
import { logger } from "@/lib/logger";

const log = logger.forTag("api:client");

type AuthStateListener = () => void;

export type UnauthorizedResult =
  | { status: "refreshed" }
  | { status: "rejected" }
  | { status: "transient"; error: Error };

export class TransientTokenRefreshError extends Error {
  constructor(message = "Token refresh temporarily unavailable") {
    super(message);
    this.name = "TransientTokenRefreshError";
  }
}

class ApiClientService {
  private baseUrl: string | null = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private username: string | null = null;
  private refreshPromise: Promise<UnauthorizedResult> | null = null;
  private authGeneration = 0;
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
    this.authGeneration += 1;

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

  /** Monotonic boundary for server/account credential lifetimes. */
  getAuthGeneration(): number {
    return this.authGeneration;
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
    this.authGeneration += 1;
    await saveItem(SECURE_KEYS.serverUrl, normalized);
    this.notifyListeners();
  }

  /**
   * Set tokens and persist to secure storage.
   *
   * `refreshToken` may be null for servers older than Audiobookshelf v2.26,
   * which return only an access token from /login (see
   * extractTokensFromAuthResponse in src/db/helpers/tokens.ts). We support
   * this token-only auth mode rather than rejecting the login: a later 401
   * will find no refresh token in performTokenRefresh and terminate the
   * session instead of attempting to refresh.
   */
  async setTokens(
    accessToken: string,
    refreshToken: string | null,
    username?: string
  ): Promise<void> {
    log.info("Updating tokens");
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.authGeneration += 1;
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
    this.authGeneration += 1;
    // Auth state is an in-memory safety boundary. Notify before best-effort
    // persistence so a secure-store failure cannot leave subscribers authenticated.
    this.notifyListeners();

    await Promise.all([
      saveItem(SECURE_KEYS.accessToken, null),
      saveItem(SECURE_KEYS.refreshToken, null),
    ]);
  }

  /**
   * Handle unauthorized response with mutex to prevent concurrent refreshes
   *
   * When multiple requests receive 401 at the same time:
   * - First request initiates token refresh
   * - Subsequent requests await the same refresh promise
   * - All requests retry after refresh completes
   */
  async handleUnauthorized(): Promise<UnauthorizedResult> {
    // If a refresh is already in progress, await it
    if (this.refreshPromise) {
      log.info("Token refresh already in progress, waiting...");
      return await this.refreshPromise;
    }

    // Start the refresh process
    log.info("Starting token refresh");
    this.refreshPromise = this.performTokenRefresh();

    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Perform the actual token refresh by calling the /auth/refresh endpoint
   *
   * Failure discrimination (see review brief "auth resilience"):
   * - No refresh token available (e.g. legacy/token-only session): terminal —
   *   clear tokens, nothing to refresh with.
   * - Server definitively rejects the refresh (401/403): terminal — the
   *   refresh token itself is invalid/revoked, clear tokens.
   * - 5xx responses and network-level failures (fetch throw/abort/timeout):
   *   transient — return a retryable result WITHOUT clearing tokens, so a flaky network
   *   blip or a momentarily-down server doesn't force-log-out a user with a
   *   still-valid refresh token. The current request fails, but the session
   *   survives for a later retry.
   */
  private async performTokenRefresh(): Promise<UnauthorizedResult> {
    if (!this.baseUrl || !this.refreshToken) {
      log.error("Missing base URL or refresh token");
      return this.clearRejectedTokens("missing refresh credentials");
    }
    const refreshGeneration = this.authGeneration;
    const refreshBaseUrl = this.baseUrl;
    const refreshCredential = this.refreshToken;

    // Create abort controller with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(`${refreshBaseUrl}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-refresh-token": refreshCredential,
        },
        signal: controller.signal,
      });
    } catch (error) {
      // Network-level failure (offline, timeout/abort, DNS, etc.) — not a
      // rejection of the refresh token. Do not clear tokens.
      log.error("Token refresh network error (session preserved):", error as Error);
      return {
        status: "transient",
        error: new TransientTokenRefreshError(),
      };
    } finally {
      clearTimeout(timeoutId);
    }

    log.info(`Token refresh response: ${response.status}`);
    if (response.status === 401 || response.status === 403) {
      log.error(`Token refresh rejected by server with status ${response.status}`);
      return this.clearRejectedTokens(`server rejection ${response.status}`);
    }
    if (!response.ok) {
      log.error(`Token refresh failed with status ${response.status} (session preserved)`);
      return {
        status: "transient",
        error: new TransientTokenRefreshError(
          `Token refresh failed with status ${response.status}`
        ),
      };
    }

    let tokens: ReturnType<typeof extractTokensFromAuthResponse>;
    try {
      tokens = extractTokensFromAuthResponse(await response.json());
    } catch (error) {
      log.error("Token refresh response was invalid", error as Error);
      return this.clearRejectedTokens("invalid refresh response");
    }
    if (!tokens.accessToken || !tokens.refreshToken) {
      log.error("Token refresh response missing tokens");
      return this.clearRejectedTokens("invalid refresh response");
    }
    if (this.authGeneration !== refreshGeneration) {
      log.info("Discarding token refresh response for stale auth generation");
      return { status: "rejected" };
    }

    try {
      await Promise.all([
        saveItem(SECURE_KEYS.accessToken, tokens.accessToken),
        saveItem(SECURE_KEYS.refreshToken, tokens.refreshToken),
      ]);
    } catch (error) {
      log.error("Failed to persist refreshed tokens", error as Error);
      return { status: "transient", error: new TransientTokenRefreshError() };
    }
    // Access-token rotation continues the same authenticated identity.
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
    this.notifyListeners();
    log.info("Token refresh succeeded");
    return { status: "refreshed" };
  }

  private async clearRejectedTokens(reason: string): Promise<UnauthorizedResult> {
    try {
      await this.clearTokens();
    } catch (error) {
      log.error(`Failed to persist cleared tokens after ${reason}`, error as Error);
    }
    return { status: "rejected" };
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
