# API Client Service Architecture

## Motivation

The previous API configuration approach had several architectural issues:

- **Race conditions**: Multiple simultaneous 401 responses triggered concurrent token refresh attempts
- **Circular dependencies**: AuthProvider used raw `fetch()` to refresh tokens, bypassing the API client
- **Mixed responsibilities**: AuthProvider handled both auth state AND made HTTP calls for token refresh
- **Tight coupling**: Token refresh logic embedded in AuthProvider created unclear separation of concerns

## Strategy

The refactored architecture introduces **ApiClientService** as a dedicated singleton that owns all HTTP operations and coordinates token refresh:

### Separation of Concerns

- **AuthProvider**: Manages authentication state and token persistence only
  - Provides callbacks for token access (`getAccessToken`, `getRefreshToken`)
  - Provides callbacks for token updates (`setTokens`, `clearTokens`)
  - No HTTP operations

- **ApiClientService**: Owns all HTTP operations including token refresh
  - Makes the `/auth/refresh` HTTP call directly
  - Coordinates concurrent 401 responses with shared promise (mutex pattern)
  - Manages request timeouts
  - Updates tokens via AuthProvider callbacks

- **apiFetch**: Pure HTTP client function
  - Delegates to ApiClientService for configuration and 401 handling
  - No direct knowledge of auth state

### Token Refresh Flow

When a 401 occurs:
1. First request initiates token refresh via `ApiClientService.handleUnauthorized()`
2. Concurrent 401s await the same shared promise (no duplicate refreshes)
3. ApiClientService makes POST to `/auth/refresh` endpoint
4. On success: calls `config.setTokens()` to update AuthProvider state
5. On failure: calls `config.clearTokens()` and sets "Session expired" message
6. All waiting requests retry with fresh token (or fail if refresh failed)

### Benefits

- **Clear ownership**: All HTTP operations in one place (ApiClientService)
- **No circular dependencies**: AuthProvider never makes HTTP calls
- **Testability**: Can test token refresh logic independently of React context
- **Race condition prevention**: Shared promise ensures single refresh for concurrent 401s
- **Simple timeouts**: Configurable per-request without exposing AbortController complexity
