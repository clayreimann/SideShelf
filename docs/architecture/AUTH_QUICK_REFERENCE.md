# Authentication and Token Management - Quick Reference

## File Locations and Key Line Numbers

### Token Storage
| File | Lines | Function |
|------|-------|----------|
| `/home/user/SideShelf/src/lib/secureStore.ts` | 10-15 | `SECURE_KEYS` constant definition |
| `/home/user/SideShelf/src/lib/secureStore.ts` | 19-32 | `saveItem()` - Save to Expo Secure Store |
| `/home/user/SideShelf/src/lib/secureStore.ts` | 34-41 | `getItem()` - Retrieve from Secure Store |
| `/home/user/SideShelf/src/lib/secureStore.ts` | 43-58 | `persistUsername()` - Store username dual-location |
| `/home/user/SideShelf/src/lib/secureStore.ts` | 64-74 | `clearAllSecureStorageExceptServerUrl()` - Clear function |

### Authentication Context
| File | Lines | Function |
|------|-------|----------|
| `/home/user/SideShelf/src/providers/AuthProvider.tsx` | 11-16 | `AuthState` type definition |
| `/home/user/SideShelf/src/providers/AuthProvider.tsx` | 18-26 | `AuthContextValue` type definition |
| `/home/user/SideShelf/src/providers/AuthProvider.tsx` | 30-53 | `persistTokensAndState()` - Token persistence |
| `/home/user/SideShelf/src/providers/AuthProvider.tsx` | 61-74 | Initialization effect - Load stored credentials |
| `/home/user/SideShelf/src/providers/AuthProvider.tsx` | 76-117 | `setApiConfig()` - Configure API client |
| `/home/user/SideShelf/src/providers/AuthProvider.tsx` | 142-146 | `setServerUrl()` - Store server URL |
| `/home/user/SideShelf/src/providers/AuthProvider.tsx` | 148-175 | `login()` - User login flow |
| `/home/user/SideShelf/src/providers/AuthProvider.tsx` | 177-184 | `logout()` - Clear tokens and logout |
| `/home/user/SideShelf/src/providers/AuthProvider.tsx` | 122-140 | App state monitoring for progress sync |
| `/home/user/SideShelf/src/providers/AuthProvider.tsx` | 199-203 | `useAuth()` hook |

### Token Refresh
| File | Lines | Function |
|------|-------|----------|
| `/home/user/SideShelf/src/lib/api/api.ts` | 5-9 | `ApiConfig` type definition |
| `/home/user/SideShelf/src/lib/api/api.ts` | 53-109 | `apiFetch()` - Main API function with 401 handling |
| `/home/user/SideShelf/src/lib/api/api.ts` | 94-101 | 401 response handling and automatic refresh |

### Login/Credentials
| File | Lines | Function |
|------|-------|----------|
| `/home/user/SideShelf/src/lib/api/endpoints.ts` | 474-495 | `login()` - Login endpoint |
| `/home/user/SideShelf/src/db/helpers/tokens.ts` | 9-14 | `extractTokensFromAuthResponse()` - Parse response |
| `/home/user/SideShelf/src/db/helpers/tokens.ts` | 17-21 | `extractTokensFromUser()` - Extract from user object |

### Background Services
| File | Lines | Function |
|------|-------|----------|
| `/home/user/SideShelf/src/services/ProgressService.ts` | 82-109 | `ProgressService` class definition |
| `/home/user/SideShelf/src/services/ProgressService.ts` | 93-97 | Sync interval constants (15s/60s/2m) |
| `/home/user/SideShelf/src/services/ProgressService.ts` | 151-214 | `rehydrateActiveSession()` - Session restoration |
| `/home/user/SideShelf/src/services/ProgressService.ts` | 717-757 | `shouldSyncToServer()` - Sync decision logic |
| `/home/user/SideShelf/src/services/ProgressService.ts` | 783-828 | `syncSessionToServer()` - Sync to server |
| `/home/user/SideShelf/src/services/ProgressService.ts` | 833-836 | `startPeriodicSync()` - Background sync interval |
| `/home/user/SideShelf/src/services/PlayerBackgroundService.ts` | 793-852 | Event listeners setup |
| `/home/user/SideShelf/src/services/PlayerBackgroundService.ts` | 389-621 | `handlePlaybackProgressUpdated()` - Progress update handler |

## Token Storage Locations

```
Secure Storage (Expo Secure Store)
├── abs.serverUrl          → Server endpoint
├── abs.accessToken        → JWT access token (short-lived)
├── abs.refreshToken       → JWT refresh token (long-lived)
└── abs.username           → Username (also in AsyncStorage)

AsyncStorage (Fallback)
├── abs.username           → Username fallback
├── abs.currentTrack       → Current playback track
├── abs.playbackRate       → Playback speed
├── abs.volume             → Volume level
├── abs.position           → Last position
├── abs.isPlaying          → Playback state
├── abs.currentPlaySessionId → Session ID
└── abs.sleepTimer         → Sleep timer state
```

## Refresh Token Flow

```
Initial Request
     ↓
API Request with accessToken
     ↓
401 Unauthorized Response?
     ├─ NO → Return response
     └─ YES → Call refreshAccessToken()
              ↓
              POST /auth/refresh with x-refresh-token header
              ↓
              Success? ─ NO → Clear tokens, logout user
              │            └─ Return false
              └─ YES → Save new tokens
                       └─ Retry original request
```

## Network Type Detection

```typescript
NetInfo.fetch() returns:
├─ isConnected: boolean
├─ serverReachable: boolean | null
└─ type: 'wifi' | 'cellular' | 'ethernet' | ...

Sync Intervals Based on Type:
├─ WiFi/Ethernet (unmetered) → 15 seconds
├─ Cellular/Mobile (metered) → 60 seconds
└─ Background periodic sync → 2 minutes (all types)
```

## Session Management

### Session States in Database
- **Active**: Currently playing or recently paused (updated within 15 min)
- **Stale**: Not updated for >15 minutes (ended on rehydration)
- **Synced**: Successfully synced to server
- **Unsynced**: Created locally, not yet synced

### Rehydration on App Resume
1. Load active sessions from database
2. Check if stale (>15 min old)
3. If stale: sync to server then end
4. If fresh: resume playback from saved position
5. Prevent duplicate sessions with mutex locks

## Critical Constants

```typescript
// ProgressService
SYNC_INTERVAL_UNMETERED = 15_000     // 15 seconds (WiFi)
SYNC_INTERVAL_METERED = 60_000       // 60 seconds (cellular)
BACKGROUND_SYNC_INTERVAL = 120_000   // 2 minutes
PAUSE_TIMEOUT = 900_000              // 15 minutes (stale session threshold)
MIN_SESSION_DURATION = 5              // 5 seconds minimum

// API
Request timeout → Standard fetch timeout (no explicit limit set)
Ping timeout → 5 seconds

// Secure Store
Keychain Accessibility → AFTER_FIRST_UNLOCK
```

## Error Handling

### Token Refresh Failures
1. Clear `accessToken` and `refreshToken`
2. Set `loginMessage = 'Session expired'`
3. User returned to login screen on next navigation check
4. No automatic retry (user must login again)

### Network Failures
- Sync skipped if `isConnected === false`
- Session cached locally until network available
- Background service continues syncing every 2 minutes when online

### API Request Failures
- Logged with redacted Authorization header
- Error message extracted from JSON response
- Fallback to plain text if non-JSON response

## Provider Initialization Order

```
App
├── StoreProvider (Zustand state)
├── DbProvider (SQLite database)
│   └── AuthProvider (depends on DbProvider)
│       └── useAuth() hook available
└── Components can now:
    ├── Access auth state via useAuth()
    ├── Call progressService for sync
    └── Use apiFetch() for API requests
```

## Testing Hooks

Mock implementations available in:
- `/home/user/SideShelf/src/__tests__/mocks/asyncStorage.ts` - AsyncStorage mock
- `/home/user/SideShelf/src/__tests__/mocks/services.ts` - Service mocks

