# Authentication and Token Management Architecture

## Overview

This document describes the authentication and token management implementation in the SideShelf React Native Audiobookshelf client.

## 1. Token Storage

### Storage Mechanism
Tokens are stored using **Expo Secure Store** (`expo-secure-store`), which provides platform-specific secure storage:
- **iOS**: Keychain
- **Android**: Keychain/Keystore

**Location**: `/home/user/SideShelf/src/lib/secureStore.ts`

### Stored Credentials
The following items are stored securely:

```typescript
export const SECURE_KEYS = {
  serverUrl: "abs.serverUrl",        // Server endpoint URL
  accessToken: "abs.accessToken",    // JWT access token
  refreshToken: "abs.refreshToken",  // Refresh token for token rotation
  username: "abs.username",          // Username for re-authentication
} as const;
```

**Key Implementation Details**:
- **Lines 19-32**: `saveItem()` function stores values using `SecureStore.setItemAsync()` with `keychainAccessible: AFTER_FIRST_UNLOCK`
- **Lines 34-41**: `getItem()` function retrieves values using `SecureStore.getItemAsync()`
- **Lines 43-58**: `persistUsername()` function stores username in both secure storage and async storage (fallback)

### Secure Store Configuration
- **Keychain Accessibility**: `AFTER_FIRST_UNLOCK` - Available after device unlock (standard iOS security)
- **Fallback**: Username is also stored in `@react-native-async-storage/async-storage` for fallback access

## 2. Token Refresh Mechanism

### Overview
The app implements a 401-based token refresh strategy with automatic retry logic.

**Location**: `/home/user/SideShelf/src/lib/api/api.ts`

### Refresh Token Flow

```
1. API request with expired access token
   ↓
2. Receive 401 Unauthorized response
   ↓
3. Automatically call refreshAccessToken()
   ↓
4. If successful: Retry original request with new token
   ↓
5. If unsuccessful: Logout user and clear tokens
```

### Implementation Details

**Lines 94-101** in `api.ts`:
```typescript
if (res.status === 401) {
    log.info("access token expired, refreshing token...");
    const success = await config?.refreshAccessToken();
    if (success) {
        // Recursive call will have its own timing
        return await apiFetch(pathOrUrl, { ...init, headers: headerObj });
    }
}
```

### Token Refresh Endpoint

**Location**: `/home/user/SideShelf/src/providers/AuthProvider.tsx` (Lines 76-104)

The refresh is performed directly to the Audiobookshelf API:
- **Endpoint**: `POST /auth/refresh`
- **Header**: `x-refresh-token: {refreshToken}`
- **Response**: Returns new `accessToken` and `refreshToken`

```typescript
const response = await fetch(`${state.serverUrl}/auth/refresh`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-refresh-token': state.refreshToken
    }
});
```

**Error Handling**:
- **Lines 92-96**: If refresh fails, tokens are cleared and user is logged out
- Session marked as expired in UI: `loginMessage: 'Session expired'`
- Both tokens set to `null`

## 3. Authentication Library/Approach

### Authentication Architecture

SideShelf uses a **custom Context-based authentication system** rather than a third-party OAuth library.

**Location**: `/home/user/SideShelf/src/providers/AuthProvider.tsx`

### Key Components

#### AuthContext
```typescript
type AuthState = {
    serverUrl: string | null;
    accessToken: string | null;
    refreshToken: string | null;
    username: string | null;
};

type AuthContextValue = AuthState & {
    initialized: boolean;
    isAuthenticated: boolean;
    apiConfigured: boolean;
    loginMessage?: string;
    setServerUrl: (url: string) => Promise<void>;
    login: (params: { serverUrl: string; username: string; password: string }) => Promise<void>;
    logout: () => Promise<void>;
};
```

#### useAuth Hook
```typescript
export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
```

### Authentication Flow

#### 1. Initialization (Lines 61-74)
```typescript
useEffect(() => {
    (async () => {
        if (!dbInitialized) return;
        const [serverUrl, accessToken, refreshToken] = await Promise.all([
            getItem(SECURE_KEYS.serverUrl),
            getItem(SECURE_KEYS.accessToken),
            getItem(SECURE_KEYS.refreshToken),
        ]);
        const username = await getStoredUsername();
        setState(s => ({ ...s, serverUrl, accessToken, refreshToken, username }));
        setInitialized(true);
    })();
}, [dbInitialized]);
```

**Key Points**:
- Waits for database initialization
- Retrieves stored credentials on app start
- Sets `initialized` flag when complete

#### 2. Login Process (Lines 148-175)
```typescript
const login = useCallback(async ({ 
    serverUrl, username, password 
}: { 
    serverUrl: string; username: string; password: string 
}) => {
    const base = serverUrl.trim().replace(/\/$/, '');
    
    // Call login endpoint
    let response = await doLogin(base, username, password);
    const { accessToken, refreshToken } = 
        authHelpers.extractTokensFromAuthResponse(response);
    
    // Persist tokens to secure storage
    await persistTokensAndState(setState, { 
        accessToken, refreshToken, username 
    });
    
    // Store user data and progress in database
    const user = userHelpers.marshalUserFromAuthResponse(response);
    const mediaProgress = mediaProgressHelpers
        .marshalMediaProgressFromAuthResponse(response.user);
    
    await Promise.all([
        userHelpers.upsertUser(user),
        mediaProgressHelpers.upsertMediaProgress(mediaProgress),
    ]);
}, []);
```

**Login Endpoint**: `/home/user/SideShelf/src/lib/api/endpoints.ts` (Lines 474-495)
```typescript
export async function login(
    baseUrl: string,
    username: string,
    password: string
): Promise<ApiLoginResponse> {
    const response = await fetch(`${base}/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-return-tokens': 'true',
        },
        body: JSON.stringify({ username, password }),
    });
    
    return response.json();
}
```

#### 3. Logout Process (Lines 177-184)
```typescript
const logout = useCallback(async () => {
    await Promise.all([
        saveItem(SECURE_KEYS.accessToken, null),
        saveItem(SECURE_KEYS.refreshToken, null),
        persistUsername(null),
    ]);
    setState((s) => ({ ...s, accessToken: null, refreshToken: null, username: null }));
}, []);
```

#### 4. Token Persistence (Lines 30-53)
```typescript
async function persistTokensAndState(
    setState: React.Dispatch<React.SetStateAction<AuthState>>,
    {
        accessToken,
        refreshToken,
        username,
    }: { accessToken: string | null; refreshToken: string | null; username?: string | null }
): Promise<void> {
    await Promise.all([
        saveItem(SECURE_KEYS.accessToken, accessToken),
        saveItem(SECURE_KEYS.refreshToken, refreshToken),
        username !== undefined ? persistUsername(username) : Promise.resolve(),
    ]);
    setState((s) => ({
        ...s,
        accessToken,
        refreshToken,
        username: username !== undefined ? username : s.username,
    }));
}
```

### API Configuration Setup (Lines 76-117)

The `setApiConfig()` function injects the auth context into the API layer:

```typescript
setApiConfig({
    getBaseUrl: () => state.serverUrl,
    getAccessToken: () => state.accessToken,
    refreshAccessToken: async () => {
        // Handle token refresh
        const response = await fetch(`${state.serverUrl}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-refresh-token': state.refreshToken
            }
        });
        
        if (!response.ok) {
            setState(s => ({ 
                ...s, 
                accessToken: null, 
                refreshToken: null, 
                loginMessage: 'Session expired' 
            }));
            return false;
        }
        
        const data = await response.json();
        const {accessToken, refreshToken} = 
            authHelpers.extractTokensFromAuthResponse(data);
        await persistTokensAndState(setState, { accessToken, refreshToken });
        return true;
    }
});

// Set network status getter for API calls
setNetworkStatusGetter(() => {
    const networkState = useAppStore.getState().network;
    return {
        isConnected: networkState.isConnected,
        serverReachable: networkState.serverReachable,
    };
});
```

## 4. Background Task and Scheduling Mechanisms

### 1. Player Background Service

**Location**: `/home/user/SideShelf/src/services/PlayerBackgroundService.ts`

This service handles background playback events and remote control commands from the system.

**Responsibilities**:
- Remote control event handling (play, pause, seek, skip, etc.)
- Playback state tracking
- Progress syncing during background playback
- Session management during background operations

**Event Listeners** (Lines 818-852):
```typescript
subscriptions.push(TrackPlayer.addEventListener(Event.RemotePlay, handleRemotePlay).remove);
subscriptions.push(TrackPlayer.addEventListener(Event.RemotePause, handleRemotePause).remove);
subscriptions.push(TrackPlayer.addEventListener(Event.RemoteStop, handleRemoteStop).remove);
subscriptions.push(TrackPlayer.addEventListener(Event.RemoteNext, handleRemoteNext).remove);
subscriptions.push(TrackPlayer.addEventListener(Event.RemotePrevious, handleRemotePrevious).remove);
subscriptions.push(TrackPlayer.addEventListener(Event.RemoteSeek, handleRemoteSeek).remove);
subscriptions.push(TrackPlayer.addEventListener(Event.RemoteDuck, handleRemoteDuck).remove);
subscriptions.push(TrackPlayer.addEventListener(Event.RemoteJumpForward, handleRemoteJumpForward).remove);
subscriptions.push(TrackPlayer.addEventListener(Event.RemoteJumpBackward, handleRemoteJumpBackward).remove);
subscriptions.push(TrackPlayer.addEventListener(Event.PlaybackState, handlePlaybackStateChanged).remove);
subscriptions.push(TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, handlePlaybackProgressUpdated).remove);
subscriptions.push(TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, handleActiveTrackChanged).remove);
subscriptions.push(TrackPlayer.addEventListener(Event.PlaybackError, handlePlaybackError).remove);
```

**Key Background Operations**:

1. **Progress Updates** (Lines 389-621)
   - Runs every second during playback
   - Updates local database session
   - Checks for adaptive sync intervals
   - Syncs to server based on network type

2. **Sleep Timer Handling** (Lines 452-485)
   - Duration-based timers
   - Chapter-based timers
   - Auto-pauses playback when timer expires

3. **Session Management** (Lines 627-730)
   - Active track changes
   - Session creation/resumption
   - Stale session cleanup

### 2. Progress Service (Background Sync)

**Location**: `/home/user/SideShelf/src/services/ProgressService.ts`

This service manages listening session tracking and background synchronization.

**Periodic Sync** (Lines 833-836):
```typescript
private startPeriodicSync(): void {
    this.syncInterval = setInterval(async () => {
        await this.syncUnsyncedSessions();
    }, this.BACKGROUND_SYNC_INTERVAL);  // 2 minutes
}
```

**Sync Intervals** (Lines 93-97):
- **Unmetered (WiFi/Ethernet)**: 15 seconds
- **Metered (Mobile data)**: 60 seconds
- **Background periodic sync**: 2 minutes

**Sync Decision Logic** (Lines 717-757):
```typescript
async shouldSyncToServer(
    userId: string,
    libraryItemId: string
): Promise<{ shouldSync: boolean; reason: string }> {
    // Check if session is paused (no update in last 60 seconds)
    const timeSinceUpdate = Date.now() - session.updatedAt.getTime();
    const isPaused = timeSinceUpdate > 60000;
    if (isPaused) {
        return { shouldSync: false, reason: "Playback is paused" };
    }

    // Check network connectivity
    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
        return { shouldSync: false, reason: "No network connection" };
    }

    // Use adaptive sync intervals based on network type
    const isUnmetered = netInfo.type === "wifi" || netInfo.type === "ethernet";
    const syncInterval = isUnmetered ? this.SYNC_INTERVAL_UNMETERED : this.SYNC_INTERVAL_METERED;

    // Check time since last sync
    const timeSinceLastSync = session.lastSyncTime
        ? Date.now() - session.lastSyncTime.getTime()
        : Infinity;

    if (timeSinceLastSync < syncInterval) {
        return {
            shouldSync: false,
            reason: `Too soon (${timeSinceLastSync}ms < ${syncInterval}ms)`,
        };
    }

    return { shouldSync: true, reason: `Ready to sync` };
}
```

**Session Rehydration** (Lines 151-214):
When app resumes, rehydrates active sessions from local database:
- Checks for stale sessions (>15 minutes old)
- Syncs before ending stale sessions
- Prevents duplicate session creation

### 3. App State Monitoring

**Location**: `/home/user/SideShelf/src/providers/AuthProvider.tsx` (Lines 122-140)

```typescript
useEffect(() => {
    if (!isAuthenticated || !state.username) return;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
        if (nextAppState === 'active') {
            console.log('[AuthProvider] App became active');
            // Sync progress when app becomes active
            progressService.fetchServerProgress().catch(error => {
                console.error('[AuthProvider] Failed to sync progress on app foreground:', error);
            });
        }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
        subscription?.remove();
    };
}, [isAuthenticated, state.username]);
```

**Triggers Progress Sync When**:
- App transitions from background to foreground
- Ensures latest progress is fetched from server

## 5. API Client Architecture

**Location**: `/home/user/SideShelf/src/lib/api/api.ts`

### Request Pipeline

1. **Network Check** (Lines 58-64)
   ```typescript
   if (getNetworkStatus) {
       const networkStatus = getNetworkStatus();
       if (!networkStatus.isConnected || networkStatus.serverReachable === false) {
           throw new Error("Network unavailable...");
       }
   }
   ```

2. **Token Injection** (Lines 73-75)
   ```typescript
   if (auth && token) {
       headerObj["Authorization"] = `Bearer ${token}`;
   }
   ```

3. **Request Execution** (Line 89)
   ```typescript
   const res = await fetch(url, { ...rest, headers: headerObj });
   ```

4. **401 Handling** (Lines 94-101)
   - Automatic token refresh
   - Retry with new token
   - Clear tokens if refresh fails

### Error Logging

**Header Redaction** (Lines 131-145):
- `Authorization` header redacted in logs
- Custom User-Agent included for device identification

## 6. Network Status Integration

The app tracks network connectivity using `@react-native-community/netinfo`:

```typescript
setNetworkStatusGetter(() => {
    const networkState = useAppStore.getState().network;
    return {
        isConnected: networkState.isConnected,
        serverReachable: networkState.serverReachable,
    };
});
```

**Impact on Sync Decisions**:
- Sync is skipped if not connected
- Adaptive intervals based on connection type (metered vs unmetered)
- Server reachability affects sync strategy

## Summary Table

| Component | Location | Purpose |
|-----------|----------|---------|
| **Token Storage** | `src/lib/secureStore.ts` | Secure token persistence using Expo Secure Store |
| **AuthProvider** | `src/providers/AuthProvider.tsx` | Context-based auth state management |
| **API Client** | `src/lib/api/api.ts` | Request pipeline with 401 refresh logic |
| **Progress Service** | `src/services/ProgressService.ts` | Session tracking and adaptive background sync (15s/60s/2m) |
| **Player Background Service** | `src/services/PlayerBackgroundService.ts` | Remote control and background playback event handling |
| **App State Monitor** | `src/providers/AuthProvider.tsx` | Foreground/background transition handling |

## Key Design Decisions

1. **No Third-Party OAuth**: Custom implementation gives full control over Audiobookshelf authentication
2. **Dual Token System**: Access token (short-lived) + Refresh token (long-lived) enables session persistence
3. **Adaptive Sync Intervals**: 15s on WiFi vs 60s on mobile data reduces data usage
4. **DB-Centric Sessions**: Local database is source of truth for progress, reducing API load
5. **Automatic Token Refresh**: 401 responses trigger transparent token refresh without user interaction
6. **Network-Aware Operations**: All background operations check connectivity before syncing

