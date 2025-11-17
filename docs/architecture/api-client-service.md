# API Client Service Architecture

## Motivation

The previous API configuration approach mixed concerns between authentication state management and API request handling, creating several issues:

- **Race conditions**: Multiple simultaneous 401 responses triggered concurrent token refresh attempts
- **Lost requests**: Requests made during token refresh would fail instead of being queued
- **Tight coupling**: AuthProvider was responsible for both auth state AND API client configuration

## Strategy

The refactored architecture introduces **ApiClientService** as a dedicated singleton that manages API client lifecycle independently from authentication state:

**Separation of concerns**:
- **AuthProvider**: Manages authentication state and token persistence
- **ApiClientService**: Handles token refresh coordination, request queuing, timeouts, and cancellation
- **apiFetch**: Pure HTTP client function

**Request queuing with mutex**: When a 401 occurs, the first request initiates token refresh while subsequent requests are queued. All queued requests resolve together once the refresh completes, preventing race conditions.

**Enhanced resilience**: Added configurable timeouts and AbortController support for better control over request lifecycle.

This design enables testability, prevents race conditions, and provides a cleaner separation between "what credentials we have" versus "how we use them."
