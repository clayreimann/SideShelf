# AsyncStorage Organization

This document describes how AsyncStorage is organized in the app and the convention for managing keys.

## Overview

The app uses AsyncStorage to persist various types of data locally. To ensure complete clearing during app reset, all keys use namespaced prefixes.

## Key Prefixes

All AsyncStorage keys must use one of these prefixes:

### `abs.` - Player State & Core App Data

Defined in: `src/lib/asyncStore.ts`

Used for:

- `abs.currentTrack` - Currently playing track
- `abs.playbackRate` - Playback speed
- `abs.volume` - Audio volume
- `abs.position` - Current playback position
- `abs.isPlaying` - Playing state
- `abs.currentPlaySessionId` - Active session ID
- `abs.username` - Cached username
- `abs.sleepTimer` - Sleep timer setting
- `abs.selectedLibraryId` - Selected library (from stores/utils.ts)
- `abs.sortConfig` - Library sort configuration (from stores/utils.ts)

### `@app/` - App Settings

Defined in: `src/lib/appSettings.ts`

Used for:

- `@app/jumpForwardInterval` - Forward skip seconds
- `@app/jumpBackwardInterval` - Backward skip seconds
- `@app/enableSmartRewind` - Smart rewind feature toggle
- `@app/enablePeriodicNowPlayingUpdates` - Metadata update toggle
- `@app/homeLayout` - Home screen layout preference
- `@app/enableDiagnostics` - Diagnostics mode toggle

### `@logger/` - Logger State

Defined in: `src/stores/slices/loggerSlice.ts`

Used for:

- `@logger/errors_acknowledged_timestamp` - When user last acknowledged errors

## Module Organization

While AsyncStorage is accessed from multiple places, the key definitions are organized as follows:

### `src/lib/asyncStore.ts`

- Exports `ASYNC_KEYS` constant with player state keys
- Provides `saveItem()`, `getItem()` utilities
- Provides `clearAllAsyncStorage()` function

### `src/lib/appSettings.ts`

- Defines `SETTINGS_KEYS` constant (private)
- Provides typed getter/setter functions for each setting
- Does NOT provide direct AsyncStorage access

### `src/stores/utils.ts`

- Exports `STORAGE_KEYS` for library/sort configurations
- Used by library, series, and authors slices

### `src/stores/slices/loggerSlice.ts`

- Defines `ERRORS_ACKNOWLEDGED_TIMESTAMP_KEY` (private)
- Manages its own AsyncStorage access

## Clearing Strategy

The `clearAllAsyncStorage()` function in `src/lib/asyncStore.ts` uses a **prefix-based approach**:

```typescript
const allKeys = await AsyncStorage.getAllKeys();
const appKeys = allKeys.filter(
  (key) => key.startsWith("abs.") || key.startsWith("@app/") || key.startsWith("@logger/")
);
await AsyncStorage.multiRemove(appKeys);
```

### Benefits:

- ✅ **Future-proof**: New keys are automatically cleared if they use the correct prefix
- ✅ **No maintenance**: No need to update a master list when adding new keys
- ✅ **Complete**: Guaranteed to clear all app data, not just hardcoded keys
- ✅ **Safe**: Only clears our app's keys, not other libraries' data

## Adding New AsyncStorage Keys

When adding new AsyncStorage keys:

1. **Choose the appropriate prefix**:
   - Use `abs.` for player/library/core app state
   - Use `@app/` for user settings/preferences
   - Use `@logger/` for logger-specific state
   - Create a new prefix if needed (and update `clearAllAsyncStorage()`)

2. **Define the key as a constant** in the appropriate module

3. **No other changes needed** - the clear function will automatically pick it up

## Example

```typescript
// Good ✅
const ASYNC_KEYS = {
  newFeature: "abs.newFeature", // Uses abs. prefix
};

// Good ✅
const SETTINGS_KEYS = {
  newSetting: "@app/newSetting", // Uses @app/ prefix
};

// Bad ❌
const MY_KEY = "myFeature"; // No prefix, won't be cleared on reset
```

## Testing

To verify that reset clears all AsyncStorage:

1. Use the app to create various state (play audio, change settings, etc.)
2. Go to More → Actions → Reset App
3. Check logs for `[asyncStore] Found X app keys to clear`
4. Verify all expected keys are listed
5. Confirm app returns to clean state after reset
