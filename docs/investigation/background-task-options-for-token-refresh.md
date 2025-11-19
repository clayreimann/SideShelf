# Background Task Options for Token Refresh in React Native

**Date**: 2025-11-19
**Purpose**: Investigate options for scheduling daily background tasks to refresh authentication tokens and prevent expiration during extended periods of inactivity.

## Executive Summary

While several React Native background task libraries exist, **relying solely on background tasks for token refresh is not recommended** due to significant platform limitations and reliability concerns. A hybrid approach combining multiple strategies provides the most robust solution.

### Key Findings

1. **Platform Limitations**: Both iOS and Android impose strict restrictions on background task execution
2. **Minimum Interval**: Background tasks cannot run more frequently than every 15 minutes
3. **System Control**: Operating systems decide when (or if) background tasks execute
4. **Reliability Issues**: No guarantee of execution, especially on manufacturer-customized Android devices
5. **iOS Termination**: Background tasks don't run after user manually closes the app on iOS

### Recommended Approach

Use a **defense-in-depth strategy** combining:
1. ✅ **Reactive refresh on 401 errors** (already implemented)
2. ✅ **Proactive refresh on app foreground** (can be enhanced)
3. ✅ **Pre-expiration refresh via request interceptor** (recommended to add)
4. ⚠️ **Background task as fallback** (optional, with caveats)

---

## Current Implementation Analysis

### Token Storage
- **Location**: `src/lib/secureStore.ts`
- **Method**: Expo Secure Store with platform-specific encryption
  - iOS: Keychain
  - Android: Keychain/Keystore
- **Stored Items**:
  - `abs.serverUrl`
  - `abs.accessToken` (short-lived JWT)
  - `abs.refreshToken` (long-lived JWT)
  - `abs.username`

### Current Refresh Mechanism
- **Location**: `src/providers/AuthProvider.tsx:76-104`
- **Trigger**: Reactive - only on 401 API responses
- **Flow**:
  1. API request fails with 401
  2. Calls `POST /auth/refresh` with `x-refresh-token` header
  3. On success: saves new tokens and retries request
  4. On failure: clears tokens, shows "Session expired" message

### App Lifecycle Handling
- **Location**: `src/providers/AuthProvider.tsx:122-140`
- **Current Behavior**: Fetches server progress when app returns to foreground
- **Opportunity**: Could be enhanced to also refresh token proactively

---

## Available Background Task Solutions

### 1. expo-background-task (Recommended for Expo)

**Status**: Current, replaces deprecated `expo-background-fetch` (SDK 53+)
**Compatibility**: ✅ Works with SideShelf (Expo SDK 54 with expo-dev-client)

#### Capabilities
- Cross-platform (iOS & Android)
- Uses modern platform APIs:
  - Android: WorkManager API
  - iOS: BGTaskScheduler API
- Minimum interval: 15 minutes
- Maximum execution time: 30 seconds per task

#### Limitations
- ⚠️ **Minimum interval is 15 minutes** (cannot run hourly or daily with precision)
- ⚠️ **System-controlled execution** - OS decides when to actually run
- ⚠️ **iOS restrictions**:
  - Doesn't work after manual app termination
  - Only available on physical devices (not simulators)
  - Execution depends on user behavior patterns, battery, etc.
- ⚠️ **Android reliability** - varies by manufacturer (some aggressively kill background tasks)

#### Implementation Example
```typescript
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

const TOKEN_REFRESH_TASK = 'token-refresh-background-task';

// Define task (must be in global scope, not inside component)
TaskManager.defineTask(TOKEN_REFRESH_TASK, async () => {
  try {
    const refreshToken = await getItem('abs.refreshToken');
    const serverUrl = await getItem('abs.serverUrl');

    if (!refreshToken || !serverUrl) {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }

    const response = await fetch(`${serverUrl}/api/refresh`, {
      method: 'POST',
      headers: {
        'x-refresh-token': refreshToken,
      },
    });

    if (response.ok) {
      const data = await response.json();
      await saveItem('abs.accessToken', data.accessToken);
      await saveItem('abs.refreshToken', data.refreshToken);
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    return BackgroundTask.BackgroundTaskResult.Failed;
  } catch (error) {
    console.error('Background token refresh failed:', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// Register task
async function registerTokenRefreshTask() {
  await BackgroundTask.registerTaskAsync(TOKEN_REFRESH_TASK, {
    minimumInterval: 1440, // 24 hours in minutes
  });
}
```

#### Configuration Requirements
**iOS** - Add to `app.json`:
```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["processing"]
      }
    }
  }
}
```

**Android** - No additional configuration needed (WorkManager is included)

#### Installation
```bash
npx expo install expo-background-task expo-task-manager
```

---

### 2. react-native-background-fetch (Third-Party Alternative)

**Status**: Actively maintained by transistorsoft
**Compatibility**: ✅ Works with Expo development builds via config plugin

#### Capabilities
- Same fundamental limitations as expo-background-task
- More configurable options
- Commercial support available
- Minimum interval: 15 minutes
- Maximum execution time: 30 seconds

#### Limitations
- Same platform restrictions as expo-background-task
- Requires config plugin and rebuild
- Not compatible with Expo's new architecture (as of Dec 2024)

#### Installation (if chosen)
```bash
npm install react-native-background-fetch
```

**Configuration** - Add to `app.json`:
```json
{
  "expo": {
    "plugins": ["react-native-background-fetch"]
  }
}
```

Then rebuild:
```bash
npx expo prebuild
```

---

### 3. react-native-background-task (Deprecated)

**Status**: ⛔ No longer maintained
**Recommendation**: Do not use

---

## Platform Reliability Analysis

### iOS Background Task Reliability

#### How iOS Decides When to Run Tasks
Apple's background task scheduler uses a complex algorithm considering:
- **User behavior patterns** - Apps used frequently get more background time
- **Battery state** - Low battery = reduced background execution
- **Network conditions** - May delay network-dependent tasks
- **System load** - High CPU/memory usage reduces background opportunities

#### Critical iOS Limitations
1. **Manual termination = no background tasks** - If user swipes app away, background tasks stop
2. **Unpredictable timing** - Even with 15-min minimum, iOS may run every few hours or overnight
3. **Physical devices only** - Background tasks don't work in iOS Simulator
4. **30-second limit** - Task must complete within 30 seconds or iOS kills it

### Android Background Task Reliability

#### WorkManager Behavior
- Generally more reliable than iOS
- Respects minimum interval more closely
- Still subject to system optimization

#### Manufacturer-Specific Issues
Some manufacturers aggressively kill background tasks:
- **OnePlus** - Requires "Don't Optimize" setting
- **Xiaomi/MIUI** - Has aggressive battery optimization
- **Huawei** - Protected apps feature must be enabled
- **Samsung** - Sleeping apps feature can prevent execution

#### Battery Optimization
Apps must request battery optimization exemption, but:
- Google Play may reject apps that abuse this
- Users can revoke exemption at any time
- Not guaranteed to work across all devices

---

## Best Practices for Token Refresh

### Industry Recommendations

Based on security best practices and mobile platform research:

#### 1. Request Interceptor Pattern (Most Reliable)
**Approach**: Check token expiration before each API request

```typescript
// In api.ts or similar
async function makeRequest(endpoint: string, options: RequestOptions) {
  const token = await getItem('abs.accessToken');
  const tokenExpiry = await getItem('abs.tokenExpiry'); // Need to store this

  // Refresh if token expires in less than 5 minutes
  if (tokenExpiry && Date.now() > tokenExpiry - 5 * 60 * 1000) {
    await refreshAccessToken();
  }

  // Proceed with request
  return fetch(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
}
```

**Advantages**:
- ✅ Runs on every API call (guaranteed execution)
- ✅ Proactive (refreshes before expiration)
- ✅ No platform limitations
- ✅ Works in all scenarios (app open, background, etc.)

#### 2. App Foreground Refresh (High Reliability)
**Approach**: Refresh token when app comes to foreground

**Current Implementation**: `AuthProvider.tsx:122-140` already listens to AppState
**Enhancement Needed**: Add token refresh check

```typescript
AppState.addEventListener('change', async (nextAppState) => {
  if (nextAppState === 'active') {
    // Existing: fetch server progress
    progressService.fetchServerProgress();

    // ADD: Check if token needs refresh
    const tokenExpiry = await getItem('abs.tokenExpiry');
    if (tokenExpiry && Date.now() > tokenExpiry - 60 * 60 * 1000) {
      // Refresh if less than 1 hour remaining
      await refreshAccessToken();
    }
  }
});
```

**Advantages**:
- ✅ Highly reliable (runs every time app opens)
- ✅ No platform restrictions
- ✅ Catches long periods of inactivity

#### 3. Token Lifetime Strategy
**Recommendation**: Configure appropriate token lifetimes on server

**Best Practice**:
- **Access Token**: 15-60 minutes (short-lived)
- **Refresh Token**: 14-60 days (long-lived)

**For Audiobookshelf API**:
- Check current token lifetimes in server configuration
- If configurable, set refresh token to at least 30 days
- This reduces urgency of daily refresh requirement

#### 4. Refresh Token Rotation (Security)
**Approach**: Issue new refresh token on each refresh

**Benefits**:
- Limits exposure window if token is compromised
- Industry standard for OAuth 2.0

**Implementation Note**: Check if Audiobookshelf API supports this

---

## Recommended Implementation Strategy

### Phased Approach

#### Phase 1: Core Reliability (Highest Priority)
Implement the most reliable methods that work in all scenarios:

1. **Store Token Expiration Time**
   - Modify `src/providers/AuthProvider.tsx:148-175` (login method)
   - Extract and store token expiry from JWT or response
   - Add to `secureStore.ts`: `abs.tokenExpiry`

2. **Add Request Interceptor Check**
   - Modify `src/lib/api/api.ts`
   - Before each request, check if token expires soon
   - Refresh proactively if within threshold (e.g., 5 minutes)

3. **Enhanced Foreground Refresh**
   - Modify `src/providers/AuthProvider.tsx:122-140`
   - Add token expiration check on app foreground
   - Refresh if token expires within threshold (e.g., 1 hour)

**Estimated Effort**: 4-6 hours
**Reliability**: Very High (95%+ scenarios covered)

#### Phase 2: Background Fallback (Optional)
Add background task as additional safety net:

1. **Install expo-background-task**
   ```bash
   npx expo install expo-background-task expo-task-manager
   ```

2. **Configure iOS background modes**
   - Update `app.json` with `UIBackgroundModes: ["processing"]`

3. **Implement background task**
   - Create `src/tasks/tokenRefreshTask.ts`
   - Define task with TaskManager
   - Register on app initialization

4. **Test on physical devices**
   - iOS device (won't work in simulator)
   - Multiple Android devices (different manufacturers)

**Estimated Effort**: 4-8 hours (including testing)
**Reliability**: Low-Medium (provides additional coverage but not guaranteed)

#### Phase 3: Server Configuration Review (Recommended)
Investigate Audiobookshelf server token settings:

1. **Check token lifetimes**
   - Access token TTL
   - Refresh token TTL

2. **Request configuration changes if needed**
   - Increase refresh token lifetime to 30-60 days
   - Reduces dependency on daily refresh

**Estimated Effort**: 1-2 hours
**Impact**: High (may eliminate need for background tasks entirely)

---

## Comparison Matrix

| Solution | Reliability | Platform Support | Guaranteed Execution | Implementation Complexity |
|----------|-------------|------------------|---------------------|---------------------------|
| Request Interceptor | Very High | All | ✅ Yes (on API calls) | Low |
| App Foreground Refresh | High | All | ✅ Yes (on app open) | Low |
| expo-background-task | Low-Medium | iOS/Android | ❌ No | Medium |
| react-native-background-fetch | Low-Medium | iOS/Android | ❌ No | Medium-High |
| Server Token Lifetime | Very High | All | ✅ Yes (passive) | Low |

---

## Code Integration Points

### Files to Modify for Phase 1

1. **`src/lib/secureStore.ts`**
   - Add: `'abs.tokenExpiry'` to stored items
   - Add helper functions to get/set expiry

2. **`src/providers/AuthProvider.tsx`**
   - **Line 76-104**: Enhance `refreshAccessToken()` to parse and store expiry
   - **Line 122-140**: Add expiry check to AppState listener
   - **Line 148-175**: Store token expiry on login

3. **`src/lib/api/api.ts`**
   - **Before line 94** (where 401 handling happens): Add pre-request expiry check
   - Create new `ensureValidToken()` helper function
   - Call before each API request

### New Files to Create for Phase 2 (Optional)

1. **`src/tasks/tokenRefreshTask.ts`**
   - Define background task with TaskManager
   - Implement refresh logic
   - Export task registration function

2. **`src/hooks/useBackgroundTask.ts`** (optional)
   - Custom hook to manage task registration
   - Handle platform-specific setup

---

## Testing Considerations

### Phase 1 Testing
- ✅ Can be tested in development/staging
- ✅ Works in iOS Simulator and Android Emulator
- ✅ Predictable behavior

**Test Scenarios**:
1. Token expires while app is open → Should refresh on next API call
2. App backgrounded for hours → Should refresh on foreground
3. Token expires while offline → Should refresh when online + next API call

### Phase 2 Testing (Background Tasks)
- ⚠️ Requires physical iOS device
- ⚠️ Requires multiple Android devices (different manufacturers)
- ⚠️ Unpredictable timing

**Test Scenarios**:
1. App backgrounded for 24+ hours → May or may not refresh
2. Device in low battery mode → Likely won't refresh
3. App manually terminated → Won't refresh on iOS
4. Different Android manufacturers → Varying behavior

**Testing Tools**:
- iOS: Use Xcode console to trigger background tasks manually
- Android: `adb shell am broadcast` to simulate task execution

---

## Potential Pitfalls and Gotchas

### Background Tasks
1. **False sense of security** - Developer assumes tasks run reliably, but they don't
2. **Battery drain concerns** - Frequent wakeups can impact battery life
3. **Google Play/App Store policies** - Excessive background activity may violate policies
4. **Testing difficulty** - Hard to test unreliable behavior
5. **Maintenance burden** - Platform APIs change frequently

### Token Refresh in General
1. **Race conditions** - Multiple simultaneous refreshes can cause issues
   - Solution: Implement mutex/lock pattern (already has `isRefreshing` flag at `api.ts:88`)
2. **Refresh token expiration** - Even refresh tokens expire
   - Solution: Graceful logout with clear messaging
3. **Network failures** - Refresh can fail due to connectivity
   - Solution: Retry with exponential backoff
4. **Server token rotation** - New refresh token invalidates old one
   - Solution: Store new refresh token immediately

---

## Alternative Approaches Considered

### Push Notifications
**Idea**: Send silent push notification to trigger refresh

**Pros**:
- Can wake app in background
- More reliable than background tasks

**Cons**:
- ❌ Requires push notification infrastructure
- ❌ Complex setup (FCM for Android, APNs for iOS)
- ❌ User can disable notifications
- ❌ Overkill for this use case
- ❌ Not appropriate for token refresh

**Verdict**: Not recommended

### Websocket/Long-Polling
**Idea**: Maintain persistent connection to server

**Cons**:
- ❌ Massive battery drain
- ❌ OS kills persistent connections in background
- ❌ Not suitable for mobile apps
- ❌ Requires server changes

**Verdict**: Not recommended

### Local Notifications
**Idea**: Schedule local notification to remind user to open app

**Cons**:
- ❌ Poor user experience
- ❌ Requires user action
- ❌ Can be dismissed/ignored

**Verdict**: Not recommended (but could be used as last resort reminder)

---

## Decision Matrix

Use this to decide which phases to implement:

| Scenario | Recommended Solution |
|----------|---------------------|
| **Quick win with high reliability** | Phase 1 only (request interceptor + foreground refresh) |
| **Maximum coverage (defense in depth)** | Phase 1 + Phase 2 |
| **Long-term solution with minimal maintenance** | Phase 1 + Phase 3 (server config) |
| **Token expiry < 24 hours** | Phase 1 (must have) + Phase 2 (nice to have) |
| **Token expiry > 30 days** | Phase 1 only (likely sufficient) |
| **Limited development time** | Phase 1 only |
| **Compliance/security requirements** | Phase 1 + Phase 2 + Phase 3 |

---

## Implementation Checklist

### Phase 1: Core Reliability
- [ ] Add token expiry storage to secureStore.ts
- [ ] Parse and store expiry on login
- [ ] Parse and store expiry on refresh
- [ ] Add `ensureValidToken()` helper to api.ts
- [ ] Call before each API request
- [ ] Add expiry check to AppState foreground handler
- [ ] Test: Token refresh before expiration
- [ ] Test: Token refresh on app foreground
- [ ] Test: Offline → online → refresh

### Phase 2: Background Fallback (Optional)
- [ ] Install expo-background-task and expo-task-manager
- [ ] Update app.json with iOS background modes
- [ ] Create tokenRefreshTask.ts
- [ ] Define task with TaskManager
- [ ] Register task on app init
- [ ] Rebuild app with `npx expo prebuild`
- [ ] Test on physical iOS device
- [ ] Test on multiple Android devices
- [ ] Monitor battery impact
- [ ] Add logging/monitoring for task execution

### Phase 3: Server Configuration
- [ ] Review Audiobookshelf server documentation
- [ ] Check current token TTL settings
- [ ] Consider requesting longer refresh token lifetime
- [ ] Document token lifecycle in architecture docs

---

## Monitoring and Observability

Recommended logging for token refresh:

```typescript
// Add to AuthProvider.tsx
const refreshAccessToken = async () => {
  const startTime = Date.now();
  logger.info('Token refresh initiated', {
    trigger: 'background_task|foreground|api_call|401_response',
    currentExpiry: tokenExpiry,
  });

  try {
    // ... refresh logic ...

    logger.info('Token refresh successful', {
      duration: Date.now() - startTime,
      newExpiry: newTokenExpiry,
    });
  } catch (error) {
    logger.error('Token refresh failed', {
      duration: Date.now() - startTime,
      error: error.message,
      serverReachable: networkState.serverReachable,
    });
  }
};
```

**Metrics to Track**:
- Refresh success/failure rate
- Refresh trigger source (background/foreground/api)
- Time between refreshes
- Background task execution frequency (if Phase 2 implemented)

---

## Conclusion

### Key Takeaways

1. **Background tasks are unreliable** - OS controls execution, no guarantees
2. **Layered approach is best** - Multiple refresh triggers provide defense in depth
3. **Phase 1 is essential** - Request interceptor + foreground refresh covers 95%+ scenarios
4. **Phase 2 is optional** - Background tasks add marginal value with significant complexity
5. **Server configuration matters** - Longer refresh token TTL reduces need for frequent refresh

### Final Recommendation

**Minimum Implementation**: Phase 1
**Optimal Implementation**: Phase 1 + Phase 3
**Maximum Coverage**: Phase 1 + Phase 2 + Phase 3

Start with Phase 1 for quick wins and high reliability. Evaluate server token configuration (Phase 3) before investing in background tasks (Phase 2). Only implement Phase 2 if analytics show it's needed after Phase 1 deployment.

---

## References

- [Expo BackgroundTask Documentation](https://docs.expo.dev/versions/latest/sdk/background-task/)
- [Expo TaskManager Documentation](https://docs.expo.dev/versions/latest/sdk/task-manager/)
- [react-native-background-fetch GitHub](https://github.com/transistorsoft/react-native-background-fetch)
- [Audiobookshelf API Documentation](https://api.audiobookshelf.org/)
- [iOS BGTaskScheduler Documentation](https://developer.apple.com/documentation/backgroundtasks/bgtaskscheduler)
- [Android WorkManager Documentation](https://developer.android.com/topic/libraries/architecture/workmanager)
- Mobile Token Security Best Practices (Medium articles referenced in research)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-19
**Next Review**: When implementing token refresh enhancement
