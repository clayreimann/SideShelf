# SideShelf Codebase Structure

This document provides a comprehensive overview of the SideShelf React Native Audiobookshelf client codebase structure, with focus on areas relevant for implementing online/offline indicators and modifying cover art components.

**Generated:** 2025-11-16  
**Purpose:** Guide for implementing online/offline status indicators and cover art modifications

---

## 1. Overall Project Structure

```
/home/user/SideShelf/
├── src/                      # Main source code
│   ├── app/                  # Expo Router screens (file-based routing)
│   ├── components/           # React components
│   ├── stores/               # Zustand state management (slice pattern)
│   ├── services/             # Business logic services
│   ├── lib/                  # Utility libraries and helpers
│   ├── providers/            # React Context providers
│   ├── db/                   # Drizzle ORM database layer
│   ├── hooks/                # Custom React hooks
│   ├── i18n/                 # Internationalization
│   ├── types/                # TypeScript type definitions
│   └── __tests__/            # Test files
├── docs/                     # Documentation
├── assets/                   # Static assets (images, fonts)
└── package.json              # Dependencies and scripts
```

---

## 2. State Management (Zustand with Slice Pattern)

### Location
- **Main Store:** `/home/user/SideShelf/src/stores/appStore.ts`
- **Exports:** `/home/user/SideShelf/src/stores/index.ts`
- **Slices:** `/home/user/SideShelf/src/stores/slices/`

### Architecture
The app uses **Zustand** with a **slice pattern** for state management. Each domain (library, player, downloads, etc.) has its own slice that's combined into a single store.

### Available Slices

#### Core Slices
1. **librarySlice.ts** - Library and item management
   - Selected library state
   - Library items
   - Sort configuration
   - Loading states

2. **downloadSlice.ts** - Download management
   - Active downloads tracking
   - Downloaded items set
   - Download progress
   - **Relevant for offline functionality**

3. **playerSlice.ts** - Audio player state
   - Current track
   - Playback state
   - Position tracking

4. **homeSlice.ts** - Home screen data
   - Continue listening
   - Downloaded items
   - Listen again

5. **authorsSlice.ts** - Author management
6. **seriesSlice.ts** - Series management
7. **settingsSlice.ts** - App settings
8. **userProfileSlice.ts** - User profile data
9. **statisticsSlice.ts** - App statistics
10. **loggerSlice.ts** - Logging configuration

### Usage Pattern

```typescript
// Import hooks from index
import { useLibrary, useDownloads, useAppStore } from '@/stores';

// Use in component
function MyComponent() {
  const { items, isLoadingItems } = useLibrary();
  const { downloadedItems, isItemDownloaded } = useDownloads();
  
  // Direct store access for specific state
  const specificState = useAppStore((state) => state.library.selectedLibraryId);
}
```

### Key Points for Online/Offline Indicators
- **No existing network state slice** - Need to create one
- Download slice tracks which items are downloaded (offline-ready)
- Store uses AsyncStorage for persistence

---

## 3. API & Server Connection Logic

### Location
- **API Client:** `/home/user/SideShelf/src/lib/api/api.ts`
- **API Endpoints:** `/home/user/SideShelf/src/lib/api/endpoints.ts`

### Key Features

#### `/home/user/SideShelf/src/lib/api/api.ts`
- Custom `apiFetch()` wrapper around native fetch
- Handles authentication (Bearer tokens)
- Auto-refresh for expired tokens (401 responses)
- Custom User-Agent generation
- Request/response logging

#### Configuration
```typescript
type ApiConfig = {
  getBaseUrl: () => string | null;
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<boolean>;
};

// Set via setApiConfig()
```

### Network Status Tracking

**IMPORTANT:** The app already has `@react-native-community/netinfo` installed!

Currently used in:
- `/home/user/SideShelf/src/services/ProgressService.ts` - Line 45

```typescript
import NetInfo from "@react-native-community/netinfo";
```

This is used for determining sync intervals (metered vs unmetered connections) but NOT exposed globally.

### Key Insight
**NetInfo is already available** - we just need to:
1. Create a network status slice in the store
2. Subscribe to NetInfo changes
3. Expose the connection state to components

---

## 4. UI Components Organization

### Component Structure

```
/home/user/SideShelf/src/components/
├── ui/                       # Generic UI components
│   ├── CoverImange.tsx       # ⚠️ Note: Typo in filename - "Imange"
│   ├── FloatingPlayer.tsx
│   ├── ProgressBar.tsx
│   ├── CollapsibleSection.tsx
│   ├── HeaderControls.tsx
│   ├── SortIcon.tsx
│   ├── SortMenu.tsx
│   └── Toggle.tsx
├── library/                  # Library-specific components
│   ├── LibraryItem.tsx       # Grid/List item component
│   ├── LibraryItemDetail.tsx # Detailed view
│   ├── LibraryItemList.tsx   # List container
│   └── LibraryPicker.tsx
├── home/                     # Home screen components
│   ├── CoverItem.tsx         # Cover-based home item
│   └── Item.tsx
├── player/                   # Player components
└── icons/                    # Icon components
```

### Cover Art Components

#### 1. CoverImage (Base Component)
**File:** `/home/user/SideShelf/src/components/ui/CoverImange.tsx` ⚠️

```typescript
interface CoverImageProps {
  uri: string | null;
  title: string | null;
  fontSize: number;
}

// Displays:
// - Image if uri is provided
// - Title text fallback if no uri
```

**Used by:**
- CoverItem (home)
- LibraryItem (library grid/list)
- Other item display components

#### 2. CoverItem (Home Screen)
**File:** `/home/user/SideShelf/src/components/home/CoverItem.tsx`

Features:
- 140x140px cover size
- Progress bar (optional)
- Title and author text
- Shadow/elevation effects
- Links to item detail

#### 3. LibraryItem (Library Display)
**File:** `/home/user/SideShelf/src/components/library/LibraryItem.tsx`

Two variants:
- **GridItem:** Square cover in grid layout
- **ListItem:** 70x70px cover with metadata

Both use the base `CoverImage` component.

### Component Usage Pattern

```typescript
// Base CoverImage usage
import CoverImage from "@/components/ui/CoverImange";

<CoverImage 
  uri={item.imageUrl} 
  title={item.title} 
  fontSize={16} 
/>

// In context of library items
<View style={[styles.coverContainer, { backgroundColor: colors.coverBackground }]}>
  <CoverImage uri={item.coverUri} title={item.title} fontSize={12} />
</View>
```

### Key Points for Cover Art Modifications
1. **Single base component** (`CoverImage`) used throughout
2. **Three main use cases:** Home, Library Grid, Library List
3. **Wrapping Views** provide sizing and styling
4. **Fallback behavior** already exists (shows title if no image)
5. **Theme integration** via `useThemedStyles()`

---

## 5. Navigation Structure

### Framework
**Expo Router** - File-based routing system

### Structure

```
/home/user/SideShelf/src/app/
├── _layout.tsx               # Root layout with providers
├── index.tsx                 # Entry/splash screen
├── login.tsx                 # Login screen
├── FullScreenPlayer/         # Full-screen player modal
└── (tabs)/                   # Tab navigation group
    ├── _layout.tsx           # Tab layout configuration
    ├── home/                 # Home tab
    ├── library/              # Library tab
    ├── series/               # Series tab
    ├── authors/              # Authors tab
    └── more/                 # More/Settings tab
```

### Tab Configuration
**File:** `/home/user/SideShelf/src/app/(tabs)/_layout.tsx`

5 main tabs:
1. **Home** - Continue listening, downloads, listen again
2. **Library** - Browse library items
3. **Series** - Browse series
4. **Authors** - Browse authors
5. **More** - Settings and additional features

Each tab uses SF Symbols (iOS) and Ionicons (Android).

### Provider Hierarchy
From `/home/user/SideShelf/src/app/_layout.tsx`:

```typescript
<DbProvider>
  <AuthProvider>
    <StoreProvider>
      <Stack>
        {/* Routes */}
      </Stack>
    </StoreProvider>
  </AuthProvider>
</DbProvider>
```

### Providers

1. **DbProvider** - Drizzle database initialization
2. **AuthProvider** - Authentication state and API configuration
3. **StoreProvider** - Zustand store initialization

Location: `/home/user/SideShelf/src/providers/`

---

## 6. Network Status & Connectivity Tracking

### Current State

#### ✅ What Exists
- **NetInfo installed:** `@react-native-community/netinfo` v11.4.1
- **Used in ProgressService:** For sync interval determination
- **Download tracking:** Download slice tracks offline-ready items

#### ❌ What's Missing
- **No global network state** in Zustand store
- **No network status UI indicators**
- **No connection type exposed** to components
- **No offline mode detection**

### Current Usage Example
From `/home/user/SideShelf/src/services/ProgressService.ts`:

```typescript
import NetInfo from "@react-native-community/netinfo";

// Used to determine sync interval based on connection type
public readonly SYNC_INTERVAL_UNMETERED = 15000; // WiFi
public readonly SYNC_INTERVAL_METERED = 60000;   // Cellular
```

### Implementation Path for Online/Offline Indicators

#### 1. Create Network Slice
Create `/home/user/SideShelf/src/stores/slices/networkSlice.ts`:

```typescript
interface NetworkSliceState {
  network: {
    isConnected: boolean;
    isInternetReachable: boolean | null;
    connectionType: string | null;
    isMetered: boolean | null;
  };
}

interface NetworkSliceActions {
  updateNetworkState: (state: NetInfoState) => void;
  initializeNetwork: () => void;
}
```

#### 2. Subscribe to NetInfo
In the slice or a service:

```typescript
NetInfo.addEventListener(state => {
  useAppStore.getState().updateNetworkState(state);
});
```

#### 3. Create Hook
```typescript
export function useNetwork() {
  const isConnected = useAppStore(state => state.network.isConnected);
  const isInternetReachable = useAppStore(state => state.network.isInternetReachable);
  // ...
  return { isConnected, isInternetReachable, ... };
}
```

#### 4. Use in Components
```typescript
function LibraryItem({ item }) {
  const { isConnected } = useNetwork();
  const { isItemDownloaded } = useDownloads();
  
  const isAvailableOffline = isItemDownloaded(item.id);
  const showOfflineIndicator = !isConnected && !isAvailableOffline;
  
  // Render with indicator
}
```

---

## 7. Key Files for Modification

### For Online/Offline Indicators

**Priority 1: Create Network State**
- `/home/user/SideShelf/src/stores/slices/networkSlice.ts` (NEW)
- `/home/user/SideShelf/src/stores/appStore.ts` (ADD slice)
- `/home/user/SideShelf/src/stores/index.ts` (EXPORT hooks)

**Priority 2: Update Cover Components**
- `/home/user/SideShelf/src/components/ui/CoverImange.tsx` (ADD indicator)
- `/home/user/SideShelf/src/components/home/CoverItem.tsx` (USE indicator)
- `/home/user/SideShelf/src/components/library/LibraryItem.tsx` (USE indicator)

**Priority 3: Create Indicator Component**
- `/home/user/SideShelf/src/components/ui/OfflineIndicator.tsx` (NEW)
- `/home/user/SideShelf/src/components/icons/OfflineIcon.tsx` (NEW - optional)

### For Download Status Integration
- `/home/user/SideShelf/src/stores/slices/downloadSlice.ts` (REFERENCE)
  - Already has `isItemDownloaded()` method
  - Already tracks `downloadedItems` Set
  - Already has download progress tracking

---

## 8. Theme & Styling

### Theme System
**File:** `/home/user/SideShelf/src/lib/theme.ts`

```typescript
const { colors, styles, isDark } = useThemedStyles();

// Access theme values
colors.background
colors.textPrimary
colors.coverBackground
// etc.
```

### Color Considerations for Indicators
When adding offline indicators, use theme colors:
- `colors.textSecondary` - For subtle indicators
- `colors.error` - For offline/unavailable state
- `colors.success` - For downloaded/available state

---

## 9. Database Layer

### ORM
**Drizzle ORM** with SQLite (expo-sqlite)

### Schema Location
`/home/user/SideShelf/src/db/schema/`

Relevant tables:
- `libraryItems` - Library item metadata
- `localAudioFileDownloads` - Download tracking
- `mediaMetadata` - Book/podcast metadata
- `audioFiles` - Audio file references

### Helpers
`/home/user/SideShelf/src/db/helpers/`

The download slice already integrates with these helpers for checking download status.

---

## 10. Services Layer

### Key Services

1. **DownloadService** - `/home/user/SideShelf/src/services/DownloadService.ts`
   - File downloads
   - Progress tracking
   - Storage management

2. **ProgressService** - `/home/user/SideShelf/src/services/ProgressService.ts`
   - **Already uses NetInfo** for sync optimization
   - Progress sync with server
   - Local session tracking

3. **PlayerService** - `/home/user/SideShelf/src/services/PlayerService.ts`
   - Audio playback
   - Track management

4. **PlayerBackgroundService** - Background playback handling

---

## 11. Implementation Recommendations

### For Online/Offline Status

#### Phase 1: Network State (Foundation)
1. Create `networkSlice.ts` with NetInfo integration
2. Add to `appStore.ts`
3. Export hooks in `index.ts`
4. Initialize in `_layout.tsx` or a provider

#### Phase 2: Visual Indicators (Components)
1. Create `OfflineIndicator.tsx` component
2. Modify `CoverImage` to accept indicator props
3. Update `CoverItem` and `LibraryItem` to show indicators
4. Add conditional rendering based on connection + download state

#### Phase 3: Polish (UX)
1. Add loading states during download checks
2. Implement badges/icons for offline availability
3. Add tooltips/hints for user understanding
4. Consider global app header indicator

### Design Patterns to Follow

1. **State in Store, Logic in Components**
   - Network state → Store
   - Display logic → Components

2. **Composition over Modification**
   - Add indicator as overlay/badge
   - Don't modify existing CoverImage internals heavily

3. **Theme Consistency**
   - Use `useThemedStyles()` for colors
   - Follow existing icon patterns (SF Symbols/Ionicons)

4. **Performance**
   - Use selective subscriptions (`useNetwork()`)
   - Memoize indicator rendering
   - Cache download status checks

---

## 12. Testing

### Test Structure
- **Unit tests:** `__tests__` directories alongside source
- **Store tests:** `/home/user/SideShelf/src/stores/slices/__tests__/`
- **Service tests:** `/home/user/SideShelf/src/services/__tests__/`

### Test Framework
- **Jest** with **React Native Testing Library**
- Coverage reporting enabled

### For New Features
Create tests for:
- Network slice state updates
- Indicator component rendering
- Integration with download slice

---

## 13. Quick Reference: File Paths

### Absolute Paths (for file operations)

**State Management:**
- `/home/user/SideShelf/src/stores/appStore.ts`
- `/home/user/SideShelf/src/stores/slices/downloadSlice.ts`
- `/home/user/SideShelf/src/stores/index.ts`

**Cover Components:**
- `/home/user/SideShelf/src/components/ui/CoverImange.tsx`
- `/home/user/SideShelf/src/components/home/CoverItem.tsx`
- `/home/user/SideShelf/src/components/library/LibraryItem.tsx`

**Network/API:**
- `/home/user/SideShelf/src/lib/api/api.ts`
- `/home/user/SideShelf/src/services/ProgressService.ts`

**Theme:**
- `/home/user/SideShelf/src/lib/theme.ts`

**Root Layout:**
- `/home/user/SideShelf/src/app/_layout.tsx`

---

## 14. Summary

### Architecture Highlights
- ✅ **Modern React Native** with Expo SDK 54
- ✅ **File-based routing** with Expo Router
- ✅ **Zustand state management** with slice pattern
- ✅ **NetInfo already installed** and partially integrated
- ✅ **Download tracking** already implemented
- ✅ **Theme system** ready for consistent styling

### What You Have
- Complete offline download infrastructure
- Network detection capability (NetInfo)
- Centralized state management
- Reusable cover component architecture

### What You Need
- Global network state exposure
- Visual indicators on cover art
- Integration between network state and download state
- User-facing offline mode UI

### Next Steps
1. Review this document
2. Create network slice
3. Design indicator component
4. Integrate with cover components
5. Test offline scenarios
6. Polish UX

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-16
