# Tab Bar Implementation Summary

## Quick Reference

### 1. Where the Tab Navigator is Configured
**Primary File**: `/home/user/SideShelf/src/app/(tabs)/_layout.tsx`

This is the root layout component for all tabs. It:
- Defines the `TAB_CONFIG` array with all 5 tabs
- Selects between two rendering modes (Native vs Cross-platform)
- Handles theme styling and tab bar appearance
- Manages the floating player overlay

### 2. What Tabs Currently Exist

The app has exactly **5 tabs**, defined in the `TAB_CONFIG` array (lines 37-77):

| # | Name | Route | Icons | Location |
|---|------|-------|-------|----------|
| 1 | Home | `/home` | house.fill | `src/app/(tabs)/home/` |
| 2 | Library | `/library` | books.vertical.fill | `src/app/(tabs)/library/` |
| 3 | Series | `/series` | square.stack.fill | `src/app/(tabs)/series/` |
| 4 | Authors | `/authors` | person.circle.fill | `src/app/(tabs)/authors/` |
| 5 | More | `/more` | ellipsis.circle.fill | `src/app/(tabs)/more/` |

### 3. How Tabs are Defined and Structured

**Tab Definition** (TypeScript type):
```typescript
type TabConfig = {
  name: string;                 // Folder/route name
  titleKey: TranslationKey;     // i18n key for label (e.g., "tabs.home")
  sfSymbol: {
    default: SFSymbol;          // iOS SF Symbol name (unfocused)
    selected: SFSymbol;         // iOS SF Symbol name (focused)
  };
  androidIcon: {
    default: IoniconsName;      // Android Ionicon name (unfocused)
    selected: IoniconsName;     // Android Ionicon name (focused)
  };
};
```

**Rendering Modes**:
1. **Native Tabs** (iOS 18+): Uses `NativeTabs` from `expo-router/unstable-native-tabs`
2. **Cross-Platform Tabs** (Android + iOS <18): Uses `Tabs` from `expo-router`

**File Structure**:
```
src/app/(tabs)/
├── _layout.tsx                 # Tab navigator (THIS FILE)
├── home/
│   ├── _layout.tsx
│   ├── index.tsx               # Main home screen
│   └── item/[itemId].tsx       # Detail view
├── library/
│   ├── _layout.tsx
│   ├── index.tsx
│   └── [item]/index.tsx        # Item detail
├── series/
│   ├── _layout.tsx
│   ├── index.tsx
│   └── [seriesId]/...
├── authors/
│   ├── _layout.tsx
│   ├── index.tsx
│   └── [authorId]/...
└── more/
    ├── _layout.tsx
    ├── index.tsx               # Main more/settings
    ├── settings.tsx
    ├── me.tsx
    ├── logger-settings.tsx
    ├── storage.tsx
    └── ...other screens
```

### 4. Where Settings/Preferences are Stored

**Two-Tier Storage Architecture**:

#### Tier 1: Persistent Storage (AsyncStorage)
**File**: `/home/user/SideShelf/src/lib/appSettings.ts`

Direct AsyncStorage functions:
- `getJumpForwardInterval()` / `setJumpForwardInterval()`
- `getJumpBackwardInterval()` / `setJumpBackwardInterval()`
- `getSmartRewindEnabled()` / `setSmartRewindEnabled()`
- `getHomeLayout()` / `setHomeLayout()`
- `getDiagnosticsEnabled()` / `setDiagnosticsEnabled()`

Storage keys:
```typescript
"@app/jumpForwardInterval"
"@app/jumpBackwardInterval"
"@app/enableSmartRewind"
"@app/enablePeriodicNowPlayingUpdates"
"@app/homeLayout"
"@app/enableDiagnostics"
```

#### Tier 2: In-Memory Store (Zustand)
**File**: `/home/user/SideShelf/src/stores/slices/settingsSlice.ts`

State structure:
```typescript
settings: {
  jumpForwardInterval: number;      // 30s default
  jumpBackwardInterval: number;     // 15s default
  smartRewindEnabled: boolean;      // true default
  homeLayout: "list" | "cover";     // "list" default
  diagnosticsEnabled: boolean;      // false default
  initialized: boolean;
  isLoading: boolean;
}
```

Actions:
- `initializeSettings()` - Load from AsyncStorage
- `updateJumpForwardInterval()`
- `updateJumpBackwardInterval()`
- `updateSmartRewindEnabled()`
- `updateHomeLayout()`
- `updateDiagnosticsEnabled()`
- `resetSettings()`

#### Tier 3: Hook Interface
**File**: `/home/user/SideShelf/src/stores/appStore.ts` (lines 807-859)

**Usage**:
```typescript
import { useSettings } from "@/stores";

function MyComponent() {
  const {
    homeLayout,
    diagnosticsEnabled,
    jumpForwardInterval,
    updateHomeLayout,
    updateDiagnosticsEnabled,
  } = useSettings();
  
  // Updates persist automatically with optimistic UI
  await updateHomeLayout("cover");
}
```

### Key Design Patterns

1. **Optimistic Updates**: Settings update UI immediately, rollback on error
2. **Parallel Loading**: Settings load from AsyncStorage in parallel on app init
3. **Error Handling**: Falls back to defaults if storage fails
4. **Platform Adaptation**: Auto-detects iOS version and uses native tabs if available
5. **Dark Mode Support**: Theme system detects system color scheme automatically

### Related Files

- **Theme System**: `/home/user/SideShelf/src/lib/theme.ts` - Provides `useThemedStyles()` hook
- **Navigation Helpers**: `/home/user/SideShelf/src/lib/navigation.ts` - Tab-aware navigation utilities
- **Store Setup**: `/home/user/SideShelf/src/stores/appStore.ts` - Main Zustand store
- **i18n**: `/home/user/SideShelf/src/i18n/locales/` - Translation strings for tab labels

### Error Badge System

The "More" tab displays an error badge when:
- Diagnostics mode is enabled (`settings.diagnosticsEnabled === true`)
- AND there are unacknowledged errors (`logger.errorCount > 0`)

Badge implementation in `_layout.tsx` lines 127-129.

### Adding a New Tab (Checklist)

- [ ] Create folder in `src/app/(tabs)/newtab/`
- [ ] Create `_layout.tsx` and `index.tsx` in that folder
- [ ] Add entry to `TAB_CONFIG` in `src/app/(tabs)/_layout.tsx`
- [ ] Add translation keys to `src/i18n/locales/*.ts`
- [ ] Create SF Symbols (for iOS) and Ionicons (for Android)
- [ ] Test on both iOS and Android
