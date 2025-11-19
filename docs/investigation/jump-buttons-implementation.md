# Jump Forward/Backward Button Implementation Summary

## Overview
This React Native audiobook player app uses several key components to manage jump/skip functionality with customizable intervals. The implementation includes platform-specific UI (iOS SF Symbols vs Android Material Icons) and persistent settings management.

---

## 1. Jump/Skip Button Components

### SkipButton Component
**Location:** `/home/user/SideShelf/src/components/player/SkipButton.tsx`

Renders forward/backward skip buttons with configurable intervals. Features:
- Platform-specific icons:
  - iOS: SF Symbols (e.g., "goforward.30", "gobackward.15")
  - Android: Material Icons with text overlay showing the skip interval
- Customizable interval (seconds)
- Configurable hit box and icon sizes
- Default intervals: forward=30s, backward=15s

**Key Props:**
- `direction`: 'forward' | 'backward'
- `interval?: number` - Seconds to skip (customizable)
- `hitBoxSize?: number` - Default: 44
- `iconSize?: number` - Default: 24
- `onPress: () => void` - Callback function

**Code snippet:**
```tsx
export interface SkipButtonProps {
    direction: 'forward' | 'backward';
    /** Number of seconds to skip (default: forward=30, backward=15) */
    interval?: number;
    hitBoxSize?: number;
    iconSize?: number;
    onPress: () => void;
}
```

---

### JumpTrackButton Component
**Location:** `/home/user/SideShelf/src/components/player/JumpTrackButton.tsx`

Renders chapter jump buttons (jump to previous/next chapter). Features:
- Platform-specific icons:
  - iOS: SF Symbols ("forward.end", "backward.end")
  - Android: Material Icons ("skip-next", "skip-previous")
- Used for navigating between chapters
- Customizable hit box and icon sizes

**Key Props:**
- `direction`: 'forward' | 'backward'
- `hitBoxSize?: number` - Default: 44
- `iconSize?: number` - Default: 24
- `onPress: () => void` - Callback function

---

## 2. Jump Interval Management

### Settings Slice (Zustand Store)
**Location:** `/home/user/SideShelf/src/stores/slices/settingsSlice.ts`

Manages jump intervals in the app state with automatic persistence:

**State:**
```tsx
{
  settings: {
    jumpForwardInterval: number;    // Default: 30 seconds
    jumpBackwardInterval: number;   // Default: 15 seconds
    smartRewindEnabled: boolean;
    homeLayout: "list" | "cover";
    diagnosticsEnabled: boolean;
    initialized: boolean;
    isLoading: boolean;
  }
}
```

**Key Actions:**
- `updateJumpForwardInterval(seconds: number)` - Update forward jump with optimistic update + storage persistence
- `updateJumpBackwardInterval(seconds: number)` - Update backward jump with optimistic update + storage persistence
- `initializeSettings()` - Load all settings from storage on app startup

**Features:**
- Optimistic updates (immediate state change)
- Automatic AsyncStorage persistence
- Rollback on error
- Reconfigures TrackPlayer when intervals change

---

### App Settings (AsyncStorage Persistence)
**Location:** `/home/user/SideShelf/src/lib/appSettings.ts`

Low-level persistence layer for settings:

**Storage Keys:**
```typescript
SETTINGS_KEYS = {
  jumpForwardInterval: "@app/jumpForwardInterval",
  jumpBackwardInterval: "@app/jumpBackwardInterval",
  enableSmartRewind: "@app/enableSmartRewind",
  enablePeriodicNowPlayingUpdates: "@app/enablePeriodicNowPlayingUpdates",
  homeLayout: "@app/homeLayout",
  enableDiagnostics: "@app/enableDiagnostics",
}
```

**Default Values:**
- `DEFAULT_JUMP_FORWARD_INTERVAL = 30` seconds
- `DEFAULT_JUMP_BACKWARD_INTERVAL = 15` seconds
- `DEFAULT_SMART_REWIND_ENABLED = true`

**Functions:**
- `getJumpForwardInterval()` - Returns stored value or default
- `setJumpForwardInterval(seconds: number)` - Persist to storage
- `getJumpBackwardInterval()` - Returns stored value or default
- `setJumpBackwardInterval(seconds: number)` - Persist to storage

---

## 3. Player Controls Implementation

### FullScreenPlayer Component
**Location:** `/home/user/SideShelf/src/app/FullScreenPlayer/index.tsx`

Main player interface that orchestrates jump controls:

**Key State:**
```tsx
const [jumpForwardInterval, setJumpForwardInterval] = useState(30);
const [jumpBackwardInterval, setJumpBackwardInterval] = useState(15);
```

**Control Layout:**
```
[JumpTrackButton backward] [SkipButton backward] [PlayPauseButton] [SkipButton forward] [JumpTrackButton forward]
```

**Handler Functions:**
```tsx
const handleSkipBackward = useCallback(async () => {
    try {
      await playerService.seekTo(Math.max(position - jumpBackwardInterval, 0));
    } catch (error) {
      console.error("[FullScreenPlayer] Failed to skip backward:", error);
    }
  }, [position, jumpBackwardInterval]);

const handleSkipForward = useCallback(async () => {
    try {
      await playerService.seekTo(position + jumpForwardInterval);
    } catch (error) {
      console.error("[FullScreenPlayer] Failed to skip forward:", error);
    }
  }, [position, jumpForwardInterval]);
```

**Initialization:**
```tsx
useEffect(() => {
  const loadIntervals = async () => {
    const [forward, backward] = await Promise.all([
      getJumpForwardInterval(),
      getJumpBackwardInterval(),
    ]);
    setJumpForwardInterval(forward);
    setJumpBackwardInterval(backward);
  };
  loadIntervals();
}, []);
```

---

## 4. MenuView Components (Long-Press Menu)

The app uses `@react-native-menu/menu` library for context menus. Several components already implement MenuView:

### PlaybackSpeedControl
**Location:** `/home/user/SideShelf/src/components/player/PlaybackSpeedControl.tsx`

Example of MenuView implementation:

**Usage Pattern:**
```tsx
<MenuView
  title={translate("player.playbackSpeed.title")}
  onPressAction={({ nativeEvent }) => {
    const rate = parseFloat(nativeEvent.event);
    handleRateChange(rate);
  }}
  actions={PLAYBACK_SPEEDS.map((rate) => ({
    id: rate.toString(),
    title: translate("player.playbackSpeed.rate", { rate }),
    state: playbackRate === rate ? "on" : "off",
  }))}
>
  <View style={{ ... }}>
    <Text style={...}>
      {translate("player.playbackSpeed.rate", { rate: playbackRate })}
    </Text>
  </View>
</MenuView>
```

### SleepTimerControl
**Location:** `/home/user/SideShelf/src/components/player/SleepTimerControl.tsx`

Another MenuView example with destructive actions:

**Action Structure:**
```tsx
const actions = [
  ...TIME_OPTIONS.map((minutes) => ({
    id: minutes.toString(),
    title: translate("player.sleepTimer.minutes", { minutes }),
  })),
  {
    id: "end-of-chapter",
    title: translate("player.sleepTimer.endOfChapter"),
  },
  {
    id: "end-of-next-chapter",
    title: translate("player.sleepTimer.endOfNextChapter"),
  },
  {
    id: "off",
    title: translate("player.sleepTimer.turnOff"),
    attributes: { destructive: true },
  },
]
```

### HeaderControls
**Location:** `/home/user/SideShelf/src/components/ui/HeaderControls.tsx`

MenuView for sort options:

```tsx
<MenuView
  onPressAction={({ nativeEvent }) => {
    onSortMenuAction(nativeEvent.event as SortField);
  }}
  actions={sortMenuActions}
>
  {sortButton}
</MenuView>
```

---

## 5. Dependencies

**Package.json relevant entry:**
```json
"@react-native-menu/menu": "^2.0.0",
```

**Also available:**
- `react-native-reanimated`: ~4.1.1
- `react-native-gesture-handler`: ~2.28.0

---

## 6. File Structure Summary

```
src/
├── components/
│   ├── player/
│   │   ├── SkipButton.tsx          ← Forward/backward skip buttons
│   │   ├── JumpTrackButton.tsx     ← Chapter jump buttons
│   │   ├── PlaybackSpeedControl.tsx  ← MenuView example
│   │   └── SleepTimerControl.tsx   ← MenuView example
│   └── ui/
│       ├── FloatingPlayer.tsx      ← Mini player
│       └── HeaderControls.tsx      ← MenuView example
├── lib/
│   ├── appSettings.ts              ← Low-level settings persistence
│   └── trackPlayerConfig.ts        ← TrackPlayer configuration
├── stores/
│   ├── appStore.ts                 ← Main Zustand store
│   └── slices/
│       └── settingsSlice.ts        ← Jump interval state management
├── services/
│   └── PlayerService.ts            ← Player control logic
└── app/
    └── FullScreenPlayer/
        └── index.tsx               ← Main player UI with all controls
```

---

## 7. Integration Flow

1. **App Initialization:**
   - `SettingsSlice.initializeSettings()` loads from AsyncStorage
   - Jump intervals populate app state

2. **FullScreenPlayer Mounts:**
   - Loads jump intervals from settings
   - Renders SkipButton and JumpTrackButton components

3. **User Interaction:**
   - Press SkipButton → calls `playerService.seekTo()`
   - Uses current `jumpForwardInterval` / `jumpBackwardInterval`
   - Updates are handled by PlayerService

4. **Settings Changes:**
   - User updates intervals via settings menu
   - `updateJumpForwardInterval()` / `updateJumpBackwardInterval()` called
   - Values persist to AsyncStorage
   - TrackPlayer reconfigured

---

## 8. Key Implementation Notes

- **Platform-specific icons:** iOS uses SF Symbols, Android uses Material Icons with text overlay
- **Optimistic updates:** Settings changes apply immediately in UI while persisting in background
- **Default intervals:** 30s forward, 15s backward
- **MenuView pattern:** Long-press (or press) on UI element to show options
- **No existing jump interval MenuView:** Current implementation uses a simple press, not a MenuView
- **Smart rewind:** Related feature that calculates rewind time based on pause duration (see `calculateSmartRewindTime()`)

