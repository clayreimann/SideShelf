# Tab Bar Implementation

## Overview

This document describes the tab navigation system in the SideShelf React Native application. The app uses **Expo Router** for file-based routing with a tab-based navigation structure that adapts to different platforms.

## Architecture

### Navigation Structure

The app uses **Expo Router's file-based routing system** with the following structure:

```
src/app/
├── _layout.tsx              # Root layout (Stack navigator)
├── index.tsx                # Root index (redirects to home)
├── (tabs)/
│   ├── _layout.tsx          # Tab navigator configuration
│   ├── home/
│   │   ├── _layout.tsx
│   │   └── index.tsx        # Home screen
│   ├── library/
│   │   ├── _layout.tsx
│   │   └── index.tsx        # Library screen
│   ├── series/
│   │   ├── _layout.tsx
│   │   └── index.tsx        # Series screen
│   ├── authors/
│   │   ├── _layout.tsx
│   │   └── index.tsx        # Authors screen
│   └── more/
│       ├── _layout.tsx
│       ├── index.tsx        # More/Settings screen
│       ├── settings.tsx
│       ├── me.tsx
│       └── [other sub-screens]
├── login.tsx                # Login page
└── FullScreenPlayer/        # Full screen player modal
    ├── _layout.tsx
    └── index.tsx
```

## Tab Configuration

### File Location
**`/home/user/SideShelf/src/app/(tabs)/_layout.tsx`**

### Current Tabs

The app defines **5 main tabs** via the `TAB_CONFIG` array:

| Tab | Name | Translation Key | iOS Symbol | Android Icon | Purpose |
|-----|------|-----------------|-----------|--------------|---------|
| 1 | Home | `tabs.home` | `house` / `house.fill` | `home-outline` / `home` | Continue listening, recommendations |
| 2 | Library | `tabs.library` | `books.vertical` / `books.vertical.fill` | `book-outline` / `book` | Browse library items |
| 3 | Series | `tabs.series` | `square.stack` / `square.stack.fill` | `layers-outline` / `layers` | Browse series collections |
| 4 | Authors | `tabs.authors` | `person.circle` / `person.circle.fill` | `people-circle-outline` / `people-circle` | Browse authors |
| 5 | More | `tabs.more` | `ellipsis.circle` / `ellipsis.circle.fill` | `ellipsis-horizontal-circle-outline` / `ellipsis-horizontal-circle` | Settings, account, diagnostics |

### Tab Config Type Definition

```typescript
type TabConfig = {
  name: string;                           // Route name (matches folder)
  titleKey: TranslationKey;              // i18n translation key for tab label
  sfSymbol: {
    default: SFSymbol;                   // iOS default symbol
    selected: SFSymbol;                  // iOS selected/focused symbol
  };
  androidIcon: {
    default: IoniconsName;               // Android default icon
    selected: IoniconsName;              // Android selected/focused icon
  };
};
```

## Rendering Modes

The tab layout supports **two rendering modes** based on platform capabilities:

### 1. Native Tabs (iOS 18+)
- **Condition**: iOS 18+ devices
- **Component**: `expo-router/unstable-native-tabs` (`NativeTabs`)
- **Features**: Platform-native tab bar with Material Design (iOS 18+)
- **Configuration**:
  - Blur effect (Material Dark/Light)
  - Badge support for error indicators
  - Native platform styling and transitions

### 2. Cross-Platform Tabs
- **Condition**: Android or iOS < 18
- **Component**: `expo-router/tabs` (`Tabs`)
- **Features**: Expo Router's built-in tab navigator
- **Configuration**:
  - Tab bar at bottom with configurable styling
  - Label and icon customization
  - Badge support for error indicators

**Auto-detection code**:
```typescript
const SHOULD_USE_NATIVE_TABS = iosMajorVersion !== null && iosMajorVersion >= 26;
```

## Tab Bar Styling

### Theme Configuration
**File**: `/home/user/SideShelf/src/lib/theme.ts`

The `useThemedStyles()` hook provides tab styling based on dark/light mode:

```typescript
const tabs = {
  useNativeTabs: boolean;                 // Whether native tabs are available
  tabBarSpace: number;                    // Padding adjustment for tabs (84px for native, 0 otherwise)
  backgroundColor: string;                // Tab bar background color
  borderColor: string;                    // Tab bar border color
  iconColor: string;                      // Inactive icon color
  selectedIconColor: string;              // Active icon color
  labelColor: string;                     // Inactive label color
  selectedLabelColor: string;             // Active label color
  badgeTextColor: string;                 // Badge text color (white)
  badgeBackgroundColor: string;           // Badge background color (red)
  rippleColor: string;                    // Android ripple effect color
  indicatorColor: string;                 // Bottom indicator color
  shadowColor: string;                    // Shadow color
  disableTransparentOnScrollEdge: boolean;// Disable transparency at scroll edges
};
```

### Dark Mode Colors
- Background: `#1C1C1E`
- Icon (inactive): `rgba(255,255,255,0.65)`
- Label (inactive): `rgba(255,255,255,0.7)`

### Light Mode Colors
- Background: `#F8F8F8`
- Icon (inactive): `#6A6A6A`
- Label (inactive): `#6A6A6A`

## Icon Implementation

### TabBarIcon Component

Platform-specific icon rendering with fallbacks:

```typescript
const TabBarIcon = ({ config, focused, color, size }: TabBarIconProps) => {
  // Android: Use Ionicons
  if (isAndroid) {
    return <Ionicons name={focused ? config.androidIcon.selected : config.androidIcon.default} ... />
  }
  
  // iOS: Use SF Symbols with Ionicons fallback
  if (isIOS) {
    return <SymbolView name={focused ? config.sfSymbol.selected : config.sfSymbol.default} fallback={...} />
  }
  
  // Other: Use Ionicons
  return <Ionicons name={...} />
}
```

## Settings & Preferences Infrastructure

### Overview
Settings are stored in **AsyncStorage** and managed via a **Zustand store slice**.

### AsyncStorage Keys
**File**: `/home/user/SideShelf/src/lib/appSettings.ts`

```typescript
const SETTINGS_KEYS = {
  jumpForwardInterval: "@app/jumpForwardInterval",     // Skip forward time (seconds)
  jumpBackwardInterval: "@app/jumpBackwardInterval",   // Skip backward time (seconds)
  enableSmartRewind: "@app/enableSmartRewind",         // Smart rewind on resume
  enablePeriodicNowPlayingUpdates: "@app/enablePeriodicNowPlayingUpdates", // Metadata updates
  homeLayout: "@app/homeLayout",                       // Home screen layout (list/cover)
  enableDiagnostics: "@app/enableDiagnostics",         // Developer diagnostics
};
```

### Settings Slice
**File**: `/home/user/SideShelf/src/stores/slices/settingsSlice.ts`

The Zustand store manages settings with the following interface:

**State Structure**:
```typescript
settings: {
  jumpForwardInterval: number;      // Default: 30 seconds
  jumpBackwardInterval: number;     // Default: 15 seconds
  smartRewindEnabled: boolean;      // Default: true
  homeLayout: "list" | "cover";     // Default: "list"
  diagnosticsEnabled: boolean;      // Default: false
  initialized: boolean;             // Load state
  isLoading: boolean;               // Loading state
}
```

**Available Actions**:
```typescript
initializeSettings(): Promise<void>                           // Load all settings from storage
updateJumpForwardInterval(seconds: number): Promise<void>    // Update skip forward interval
updateJumpBackwardInterval(seconds: number): Promise<void>   // Update skip backward interval
updateSmartRewindEnabled(enabled: boolean): Promise<void>    // Toggle smart rewind
updateHomeLayout(layout: "list" | "cover"): Promise<void>   // Change home layout
updateDiagnosticsEnabled(enabled: boolean): Promise<void>    // Toggle diagnostics
resetSettings(): void                                         // Reset to defaults
```

### Settings Access Pattern

From within components:
```typescript
const { homeLayout, updateHomeLayout } = useSettings();

// Update with optimistic updates and error handling
await updateHomeLayout("cover");
```

## Error Badge System

### Implementation
The "More" tab shows an error badge when:
1. Diagnostics mode is **enabled** (`settings.diagnosticsEnabled === true`)
2. There are **unacknowledged errors** (`logger.errorCount > 0`)

**Location**: `/home/user/SideShelf/src/app/(tabs)/_layout.tsx` (lines 127-129)

```typescript
const errorCount = useAppStore((state) => state.logger.errorCount);
const diagnosticsEnabled = useAppStore((state) => state.settings.diagnosticsEnabled);
const showErrorBadge = errorCount > 0 && diagnosticsEnabled;
```

## Navigation Helpers

### File Location
**`/home/user/SideShelf/src/lib/navigation.ts`**

Utility functions for navigating to detail pages within tabs:

```typescript
// Navigate to any tab detail page
navigateToTabDetail(router: Router, tabPath: string, detailPath: string): void

// Convenience helpers
navigateToAuthor(router: Router, authorId: string): void
navigateSeries(router: Router, seriesId: string): void
navigateToLibraryItem(router: Router, itemId: string): void
```

## Initialization Flow

1. **RootLayout** (`src/app/_layout.tsx`):
   - Initializes app services via `initializeApp()`
   - Sets up providers (Auth, DB, Store)
   - Loads fonts and shows splash screen

2. **RootIndex** (`src/app/index.tsx`):
   - Checks authentication status
   - Redirects to login or home tab

3. **TabLayout** (`src/app/(tabs)/_layout.tsx`):
   - Checks authentication again
   - Initializes download service
   - Renders tab navigator (native or cross-platform)
   - Displays floating player overlay

4. **SettingsSlice**:
   - `initializeSettings()` is called during store initialization
   - Loads all settings from AsyncStorage in parallel
   - Falls back to defaults on error

## Usage Examples

### Adding a New Tab

1. Create new folder in `src/app/(tabs)/newtab/`
2. Create `_layout.tsx` and `index.tsx` files
3. Add entry to `TAB_CONFIG` array in `_layout.tsx`:
   ```typescript
   {
     name: "newtab",
     titleKey: "tabs.newtab",
     sfSymbol: { default: "star", selected: "star.fill" },
     androidIcon: { default: "star-outline", selected: "star" },
   }
   ```
4. Add translation key to i18n files

### Accessing Settings
```typescript
import { useSettings } from "@/stores";

function MyComponent() {
  const { homeLayout, updateHomeLayout } = useSettings();
  
  const handleChange = async () => {
    try {
      await updateHomeLayout("cover");
    } catch (error) {
      console.error("Failed to update layout:", error);
    }
  };
  
  return <Button onPress={handleChange}>Change Layout</Button>;
}
```

### Conditional Rendering Based on Settings
```typescript
const { homeLayout } = useSettings();

if (homeLayout === "cover") {
  return <CoverLayout />;
} else {
  return <ListLayout />;
}
```

## Platform-Specific Considerations

### iOS
- **Native tabs** available on iOS 18+
- Uses SF Symbols for platform-native icon system
- Ionicons used as fallback
- Blue-based color scheme by default

### Android
- Uses **Ionicons** exclusively
- Material Design color scheme
- Ripple effect on tab press
- Bottom tab bar layout

## See Also
- `/home/user/SideShelf/src/stores/appStore.ts` - Main Zustand store
- `/home/user/SideShelf/src/providers/StoreProvider.tsx` - Store provider setup
- `/home/user/SideShelf/src/i18n/locales/` - Translation files for tab labels
