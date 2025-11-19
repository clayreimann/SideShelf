# API Client Service Architecture

## Motivation

The previous API configuration approach had several architectural issues:

- **Race conditions**: Multiple simultaneous 401 responses triggered concurrent token refresh attempts
- **Circular coupling**: AuthProvider and ApiClientService injected callbacks into each other
- **Unclear ownership**: Tokens lived in AuthProvider but API operations needed them
- **Mixed responsibilities**: AuthProvider handled both React state AND credential storage

## Strategy

The refactored architecture makes **ApiClientService** the single source of truth for credentials:

### Separation of Concerns

- **ApiClientService**: Owns credentials and all HTTP operations
  - Stores tokens and base URL in memory
  - Persists to secure storage directly
  - Makes all HTTP calls including `/auth/refresh`
  - Coordinates concurrent 401 responses with shared promise (mutex pattern)
  - Notifies subscribers when auth state changes

- **AuthProvider**: Manages React state and UI concerns only
  - Subscribes to ApiClientService for auth state changes
  - Provides React context for components
  - Manages username separately (not in ApiClientService)
  - Calls ApiClientService methods for login/logout
  - No direct secure storage access

- **apiFetch**: Pure HTTP client function
  - Calls ApiClientService getters for credentials
  - Delegates 401 handling to ApiClientService
  - No state management

### Credential Ownership

```
ApiClientService (owns credentials)
   ↓ stores/loads
SecureStorage
   ↑ subscribes to changes
AuthProvider (React state)
   ↓ provides context
React Components
```

No circular dependencies - AuthProvider reads from ApiClientService, never writes.

### Token Refresh Flow

When a 401 occurs:
1. First request initiates token refresh via `ApiClientService.handleUnauthorized()`
2. Concurrent 401s await the same shared promise (no duplicate refreshes)
3. ApiClientService makes POST to `/auth/refresh` endpoint
4. On success: ApiClientService updates its own tokens and notifies subscribers
5. On failure: ApiClientService clears tokens and notifies subscribers
6. AuthProvider receives notification and updates React state
7. All waiting requests retry with fresh token (or fail if refresh failed)

### Benefits

- **Single source of truth**: ApiClientService owns all credential state
- **No circular dependencies**: Clean one-way data flow
- **Testability**: Can test API operations without React
- **Race condition prevention**: Shared promise ensures single refresh for concurrent 401s
- **Simple API surface**: No callback injection, just direct method calls
