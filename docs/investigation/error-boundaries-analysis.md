# Error Boundaries Analysis - SideShelf React Native App

## Project Overview
- **Framework**: React Native with Expo
- **Navigation**: Expo Router (file-based routing) + React Navigation (bottom tabs)
- **UI Libraries**: @react-navigation/bottom-tabs, expo-router
- **State Management**: Zustand (multiple stores)
- **Language**: TypeScript
- **Platform**: iOS and Android (with platform-specific handling)

---

## 1. Tab Navigation Structure

### Navigation Architecture

#### Root Layout
- **File**: `/home/user/SideShelf/src/app/_layout.tsx`
- **Stack Configuration**: Uses Expo Router Stack for navigation
- **Providers Stack**:
  ```
  View (flex: 1)
    └── DbProvider
        └── AuthProvider
            └── StoreProvider
                └── Stack (Root Navigation)
                    ├── index (Root redirect)
                    ├── (tabs) (Tab Navigator)
                    ├── login (Form sheet)
                    └── FullScreenPlayer (Modal)
  ```

#### Tab Navigation Setup
- **File**: `/home/user/SideShelf/src/app/(tabs)/_layout.tsx`
- **Tabs Count**: 5 tabs using Expo Router
- **Tab Configuration**:
  ```typescript
  TAB_CONFIG = [
    { name: "home", titleKey: "tabs.home", ... },
    { name: "library", titleKey: "tabs.library", ... },
    { name: "series", titleKey: "tabs.series", ... },
    { name: "authors", titleKey: "tabs.authors", ... },
    { name: "more", titleKey: "tabs.more", ... },
  ]
  ```

**Dual Navigation Modes**:
1. **Standard Mode**: Uses `@react-navigation/bottom-tabs` (Tabs component)
2. **Native Mode**: Uses `expo-router/unstable-native-tabs` (NativeTabs component)
   - Determined by theme configuration: `tabs.useNativeTabs`
   - Includes platform-specific rendering (iOS SF Symbols vs Android Ionicons)

**Additional Components**:
- FloatingPlayer component overlays the tab bar when audio is playing
- Error badge on "more" tab when diagnostics enabled (shows error count)

### Tab Screens

Each tab has its own directory structure with local Stack navigation:

```
src/app/(tabs)/
├── _layout.tsx (Main tab navigation)
├── home/
│   ├── _layout.tsx (Stack with title)
│   ├── index.tsx (Home screen)
│   └── item/[itemId].tsx (Detail screen)
├── library/
│   ├── _layout.tsx (Stack with title)
│   ├── index.tsx (Library screen)
│   └── [item]/index.tsx (Library item detail)
├── series/
│   ├── _layout.tsx (Stack)
│   ├── index.tsx (Series list)
│   └── [seriesId]/
│       ├── index.tsx (Series detail)
│       └── item/[itemId].tsx (Item detail within series)
├── authors/
│   ├── _layout.tsx (Stack)
│   ├── index.tsx (Authors list)
│   └── [authorId]/
│       ├── index.tsx (Author detail)
│       └── item/[itemId].tsx (Item detail within author)
└── more/
    ├── _layout.tsx (Stack)
    ├── index.tsx (More menu)
    ├── actions.tsx
    ├── collections.tsx
    ├── library-stats.tsx
    ├── logger-settings.tsx
    ├── logs.tsx
    ├── me.tsx
    ├── settings.tsx
    ├── storage.tsx
    └── track-player.tsx
```

---

## 2. Existing Error Handling Patterns

### Current Error Handling Approach

**Status**: NO ERROR BOUNDARIES CURRENTLY IMPLEMENTED

The app uses inline error handling throughout components:

#### 1. Try-Catch Blocks
Located in:
- `/home/user/SideShelf/src/app/_layout.tsx` (RootLayout)
  - App initialization
  - Deep link handling
  - App state changes
  
- `/home/user/SideShelf/src/app/(tabs)/home/index.tsx` (HomeScreen)
  - Pull-to-refresh error handling
  - Home data refresh errors
  - Cover section rendering

- `/home/user/SideShelf/src/components/ui/FloatingPlayer.tsx`
  - Play/pause toggle errors

#### 2. Alert-Based Error Display
Example from HomeScreen:
```typescript
try {
  await progressService.fetchServerProgress();
  await refreshHome(user.id);
} catch (error) {
  console.error("[HomeScreen] Error refreshing home data:", error);
  Alert.alert(translate("common.error"), translate("home.errors.loadHomeData"));
}
```

#### 3. Console Logging
- Tag-based logging: `console.error("[ComponentName] Message", error)`
- Diagnostic logger for specific operations
- Custom logger module at `/home/user/SideShelf/src/lib/logger/`

#### 4. State-Based Error Handling
- Loading states tracked in Zustand stores
- Error states managed per feature (home, library, authors, etc.)
- Conditional rendering for empty/error states

#### 5. Provider-Level Error Handling
- `AuthProvider`: Manages login errors and authentication state
- `DbProvider`: Database initialization errors
- `StoreProvider`: Store initialization failures

### Error Handling Locations in Current Code

**AppState Changes** (`src/app/_layout.tsx`):
```typescript
const handleAppStateChange = async (nextAppState: AppStateStatus) => {
  try {
    await TrackPlayer.getPlaybackState();
    trackPlayerIsPlaying = tpState.state === State.Playing;
  } catch (error) {
    log.warn(`Failed to check TrackPlayer state, assuming not playing ${error}`);
  }
}
```

**Screen-Level Error Handling** (`src/app/(tabs)/home/index.tsx`):
```typescript
const renderCoverSection = useCallback(({ section }: { section: HomeSection }) => {
  try {
    return (
      <FlatList
        data={section.data}
        renderItem={({ item }) => <CoverItem item={item} />}
        // ...
      />
    );
  } catch (error) {
    console.error("[HomeScreen] Error rendering cover section:", error);
    return null;
  }
}, [horizontalContentContainerStyle]);
```

---

## 3. Component Structure Needing Error Boundaries

### High-Priority Components

#### Tab Screen Stacks (Stack navigators)
Each tab's screen should be wrapped to catch navigation-related errors:
- `/home/user/SideShelf/src/app/(tabs)/home/_layout.tsx`
- `/home/user/SideShelf/src/app/(tabs)/library/_layout.tsx`
- `/home/user/SideShelf/src/app/(tabs)/series/_layout.tsx`
- `/home/user/SideShelf/src/app/(tabs)/authors/_layout.tsx`
- `/home/user/SideShelf/src/app/(tabs)/more/_layout.tsx`

#### Tab Index Screens
- Home Screen: `src/app/(tabs)/home/index.tsx`
  - Complex SectionList/ScrollView rendering
  - Multiple child components (CoverItem, Item)
  - Progress service integration
  
- Library Screen: `src/app/(tabs)/library/index.tsx`
  - LibraryItemList with grid/list modes
  - Search functionality
  - Sort operations
  
- Series/Authors Screens: `src/app/(tabs)/series/index.tsx`, `src/app/(tabs)/authors/index.tsx`
  - FlatList rendering of large lists
  - Dynamic author/series images

#### Nested Detail Screens
- `src/app/(tabs)/[tab]/[id]/index.tsx` (Detail pages)
- Dynamic route parameters requiring database lookups
- Image rendering from URIs

#### Global Components
- FloatingPlayer: `src/app/components/ui/FloatingPlayer.tsx`
- Provider components that could fail initialization
- Layout components

### Medium-Priority Components

#### List Item Renderers
- CoverItem: `src/components/home/CoverItem.tsx`
- Item: `src/components/home/Item.tsx`
- LibraryItem: `src/components/library/LibraryItem.tsx`
- Complex rendering with cover images and progress bars

#### Service-Heavy Screens
- More tab screens that interact with multiple services
- Settings, Logger, Track Player screens
- Download status and storage screens

---

## 4. Technology Stack & Navigation Library Details

### Navigation Libraries

#### Expo Router
- **Version**: ~6.0.14
- **Purpose**: File-based routing and navigation
- **Features**:
  - Automatic route generation from file structure
  - Deep linking support
  - Type-safe route parameters
  - Dynamic routes with `[param]` syntax

#### React Navigation
- **Bottom Tabs**: @react-navigation/bottom-tabs ^7.4.0
- **Native**: @react-navigation/native ^7.1.8
- **Elements**: @react-navigation/elements ^2.6.3
- **Purpose**: Native tab bar and navigation state management

#### Key Integration Points
1. Root Stack uses `expo-router/Stack`
2. Tab navigation uses either:
   - `expo-router/Tabs` + `@react-navigation/bottom-tabs` (cross-platform)
   - `expo-router/unstable-native-tabs` (platform-native)
3. Each tab section uses local Stack navigation via `expo-router/Stack`

### State Management

**Zustand Stores** (`src/stores/`):
- `appStore.ts` - Central store with slices
- Slices:
  - `playerSlice.ts` - Currently playing track, playback state
  - `librarySlice.ts` - Library items and loading state
  - `authorsSlice.ts` - Authors data
  - `seriesSlice.ts` - Series data
  - `homeSlice.ts` - Home screen sections
  - `downloadSlice.ts` - Download progress
  - `settingsSlice.ts` - User preferences
  - `statisticsSlice.ts` - User statistics
  - `userProfileSlice.ts` - User profile data
  - `loggerSlice.ts` - Error logging/diagnostics

**Critical Store Initialization** (`src/providers/StoreProvider.tsx`):
```typescript
useLibraryStoreInitializer(apiConfigured, dbInitialized);
useAuthorsStoreInitializer(apiConfigured, dbInitialized);
useSeriesStoreInitializer(apiConfigured, dbInitialized);
usePlayerStoreInitializer();
useSettingsStoreInitializer();
useDownloadsStoreInitializer();
useUserProfileStoreInitializer(username);
useHomeStoreInitializer(username);
```

### Services

**Key Services** (`src/services/`):
- `PlayerService.ts` - Track player management
- `ProgressService.ts` - Progress tracking
- `DownloadService.ts` - Download management
- `PlayerBackgroundService.ts` - Background playback

These services interact heavily with:
- Database (Drizzle ORM)
- APIs (Audiobookshelf)
- React Native Track Player
- Native modules

### Database

**Drizzle ORM**: ^0.44.5
- SQLite backend via expo-sqlite
- Schema defined in `src/db/schema/`
- Helpers for common queries in `src/db/helpers/`

---

## 5. Error Boundary Implementation Opportunities

### Recommended Structure

```
src/
├── components/
│   └── errors/
│       ├── ErrorBoundary.tsx (Main boundary component)
│       ├── TabErrorBoundary.tsx (Specialized for tabs)
│       └── useErrorBoundary.ts (Hook for functional component boundary)
│
├── providers/
│   └── ErrorBoundaryProvider.tsx (Top-level error boundary wrapper)
│
└── app/
    ├── _layout.tsx (Wrap with ErrorBoundaryProvider)
    └── (tabs)/
        ├── _layout.tsx (Wrap each tab with TabErrorBoundary)
        ├── home/
        │   ├── _layout.tsx (Wrap with ErrorBoundary)
        │   └── index.tsx (Wrap sections with ErrorBoundary)
        ├── library/
        │   ├── _layout.tsx (Wrap with ErrorBoundary)
        │   └── index.tsx
        ├── series/
        ├── authors/
        └── more/
```

### Error Capture Points

1. **Stack Navigator Level**
   - Catch errors in screen components
   - Prevent app crash when screen fails to render

2. **Tab Screen Level**
   - Each tab (home, library, series, authors, more)
   - Isolate errors to specific tabs

3. **Component Level**
   - List renderers (CoverItem, LibraryItem)
   - FloatingPlayer
   - Complex nested screens

4. **Provider Level**
   - Top-level error boundary in root layout
   - Catch critical initialization errors

---

## 6. Current Error Logging Infrastructure

### Logger System
- **Location**: `src/lib/logger/`
- **Features**:
  - Tag-based logging (per component/module)
  - Diagnostic mode (deep link triggered)
  - Database storage of logs
  - Custom log levels (debug, info, warn, error)
  - Manual trimming on app background

### Deep Link Logger Configuration
Format: `side-shelf://logger?level[TAG_NAME]=warn&enabled[TAG_NAME]=false`

Example from root layout:
```typescript
const handleDeepLink = async (url: string) => {
  if (!url.includes("://logger")) return;
  
  // Parse logger config from URL
  const tagLevels: Record<string, string> = {};
  const tagEnabled: Record<string, string> = {};
  
  // Apply configuration
  for (const [tag, level] of Object.entries(tagLevels)) {
    await logger.setTagLevel(tag, logLevel);
  }
}
```

---

## 7. Key Files Reference

### Navigation & Layout
- `/home/user/SideShelf/src/app/_layout.tsx` - Root layout with providers
- `/home/user/SideShelf/src/app/index.tsx` - Root redirect
- `/home/user/SideShelf/src/app/(tabs)/_layout.tsx` - Tab navigation
- `/home/user/SideShelf/src/lib/navigation.ts` - Navigation helpers

### Tab Screens
- `/home/user/SideShelf/src/app/(tabs)/home/index.tsx` - Home screen
- `/home/user/SideShelf/src/app/(tabs)/library/index.tsx` - Library screen
- `/home/user/SideShelf/src/app/(tabs)/series/index.tsx` - Series screen
- `/home/user/SideShelf/src/app/(tabs)/authors/index.tsx` - Authors screen
- `/home/user/SideShelf/src/app/(tabs)/more/index.tsx` - More menu

### Providers
- `/home/user/SideShelf/src/providers/AuthProvider.tsx` - Auth state
- `/home/user/SideShelf/src/providers/DbProvider.tsx` - Database initialization
- `/home/user/SideShelf/src/providers/StoreProvider.tsx` - Zustand stores

### Components
- `/home/user/SideShelf/src/components/ui/FloatingPlayer.tsx` - Floating player
- `/home/user/SideShelf/src/components/home/` - Home screen components
- `/home/user/SideShelf/src/components/library/` - Library components

### State Management
- `/home/user/SideShelf/src/stores/appStore.ts` - Main store
- `/home/user/SideShelf/src/stores/slices/` - Store slices

### Services
- `/home/user/SideShelf/src/services/PlayerService.ts` - Player management
- `/home/user/SideShelf/src/services/ProgressService.ts` - Progress tracking
- `/home/user/SideShelf/src/lib/logger/` - Logging system

---

## Summary

### What This App Needs Error Boundaries For

1. **Tab Navigation Resilience**: Prevent one tab crashing from crashing entire app
2. **List Rendering**: Handle errors in FlatList/SectionList item rendering
3. **Service Failures**: Catch errors from PlayerService, ProgressService, etc.
4. **Store Initialization**: Handle Zustand store initialization failures
5. **Component Rendering**: Wrap complex components that could throw
6. **Network/API Errors**: Catch API failures gracefully
7. **Database Errors**: Handle Drizzle ORM query failures
8. **Image Loading**: Handle cover image load failures

### Current Gaps

- No Error Boundary components exist
- Error handling is ad-hoc (try-catch in individual components)
- No way to recover from component render errors
- User sees blank screen or app crash on critical errors
- No centralized error recovery mechanism
- Limited error fallback UI

### Next Steps for Implementation

1. Create ErrorBoundary component with class-based approach (required for error boundaries)
2. Create specialized TabErrorBoundary for tab isolation
3. Wrap layout files and screen stacks
4. Integrate with existing logger system
5. Create error fallback UI components
6. Add error recovery actions
7. Test error boundary coverage
