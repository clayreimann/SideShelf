# SideShelf App Structure: Libraries and Tabs

## Overview

This document describes the current implementation of the library system and tab navigation structure in SideShelf, providing a foundation for adding new tabs (e.g., Podcasts).

## 1. Tab Navigation Structure

### Location
- **Main Layout**: `/src/app/_layout.tsx`
- **Tabs Layout**: `/src/app/(tabs)/_layout.tsx`
- **Tabs Directory**: `/src/app/(tabs)/`

### Tab Configuration
Tabs are defined as a configuration array in `/src/app/(tabs)/_layout.tsx`:

```typescript
type TabConfig = {
  name: string;
  titleKey: TranslationKey;
  sfSymbol: {
    default: SFSymbol;
    selected: SFSymbol;
  };
  androidIcon: {
    default: IoniconsName;
    selected: IoniconsName;
  };
};

const TAB_CONFIG: TabConfig[] = [
  {
    name: "home",
    titleKey: "tabs.home",
    sfSymbol: { default: "house", selected: "house.fill" },
    androidIcon: { default: "home-outline", selected: "home" },
  },
  {
    name: "library",
    titleKey: "tabs.library",
    sfSymbol: { default: "books.vertical", selected: "books.vertical.fill" },
    androidIcon: { default: "book-outline", selected: "book" },
  },
  {
    name: "series",
    titleKey: "tabs.series",
    sfSymbol: { default: "square.stack", selected: "square.stack.fill" },
    androidIcon: { default: "layers-outline", selected: "layers" },
  },
  {
    name: "authors",
    titleKey: "tabs.authors",
    sfSymbol: { default: "person.circle", selected: "person.circle.fill" },
    androidIcon: { default: "people-circle-outline", selected: "people-circle" },
  },
  {
    name: "more",
    titleKey: "tabs.more",
    sfSymbol: { default: "ellipsis.circle", selected: "ellipsis.circle.fill" },
    androidIcon: { default: "ellipsis-horizontal-circle-outline", selected: "ellipsis-horizontal-circle" },
  },
];
```

### Navigation Implementation
The app uses **Expo Router** with two tab implementations:
1. **Standard Tabs** (React Native): For devices not supporting native tabs
2. **NativeTabs** (unstable-native-tabs): For iOS/Android native tab bars

The layout dynamically renders tabs based on the platform and theme settings:
- Uses `useThemedStyles().tabs.useNativeTabs` to determine which implementation to use
- Renders either `<Tabs>` or `<NativeTabs>` components
- Each tab in the configuration is rendered via `TAB_CONFIG.map()`

## 2. Library Tab Implementation

### Location
- **Tab Screen**: `/src/app/(tabs)/library/index.tsx`
- **Tab Layout**: `/src/app/(tabs)/library/_layout.tsx`
- **Library Components**: `/src/components/library/`

### Library Tab Screen Structure (`/src/app/(tabs)/library/index.tsx`)

The library tab is a React Native screen that displays:
1. **LibraryPicker** - Dropdown to select between available libraries
2. **LibraryItemList** - Grid/list view of items in the selected library
3. **Search** - Full-text search across items
4. **View Mode Toggle** - Switch between grid and list views
5. **Sort Controls** - Sort by various fields

Key features:
- Auto-opens items if passed via navigation params (`openItem` query parameter)
- Supports filtering items with search query
- Integrates with library store for state management
- Header controls for view mode and sorting

### Library Tab Layout (`/src/app/(tabs)/library/_layout.tsx`)
- Currently a simple layout file
- Can be extended for sub-routes (like item detail pages)

### Library Components

#### LibraryPicker (`/src/components/library/LibraryPicker.tsx`)
Simple selector component showing available libraries as buttons:
```typescript
interface LibraryPickerProps {
  libraries: any[] | null;
  selectLibrary: (id: string) => void;
  selectedLibrary: any | null;
  isDark: boolean;
}
```

#### LibraryItemList (`/src/components/library/LibraryItemList.tsx`)
Main list/grid display component:
- Supports both grid (3 columns) and list (1 column) view modes
- Shows search input when search is enabled
- Uses FlatList for performance with many items
- Pull-to-refresh capability
- Displays LibraryItem components for each item

#### LibraryItem (`/src/components/library/LibraryItem.tsx`)
Individual item card component:
- Shows cover image, title, author
- Supports grid and list variants
- Handles press actions

## 3. Library Selection and State Management

### Zustand Store Architecture

The app uses **Zustand** for state management with a slice pattern.

#### Location
- **Main Store**: `/src/stores/appStore.ts`
- **Library Slice**: `/src/stores/slices/librarySlice.ts`
- **Store Index**: `/src/stores/index.ts`

#### Library Slice Structure (`LibrarySliceState`)

```typescript
interface LibrarySliceState {
  library: {
    // State machines
    readinessState: "UNINITIALIZED" | "INITIALIZING" | "NOT_READY" | "READY";
    operationState: "IDLE" | "REFRESHING_LIBRARIES" | "REFRESHING_ITEMS" | "SELECTING_LIBRARY" | "CHECKING_NEW_ITEMS";

    // Core data
    selectedLibraryId: string | null;
    selectedLibrary: LibraryRow | null;
    libraries: LibraryRow[];
    rawItems: LibraryItemDisplayRow[];
    items: LibraryItemDisplayRow[];  // Sorted items
    sortConfig: SortConfig;
  };
}
```

#### Key Actions

**selectLibrary(libraryId: string, fetchFromApi?: boolean)**
- Selects a library and loads its items
- Can fetch from API or use cached data
- Persists selection to AsyncStorage
- Auto-checks for new items if not fetching from API

**refresh()**
- Refreshes both library list and items for the currently selected library
- Fetches full library data from API
- Runs batched fetch for item details in background
- Updates series and authors after refresh

**initializeLibrarySlice(apiConfigured: boolean, dbInitialized: boolean)**
- Initializes the library slice on app startup
- Loads cached libraries and items from database
- Auto-selects first library if none was previously selected
- Sets up state machine for readiness tracking

**setSortConfig(config: SortConfig)**
- Updates sort configuration for library items
- Persists to AsyncStorage
- Re-sorts items immediately

#### Hook Access

The library slice is accessed via hooks:

```typescript
// Main hook - provides all library state and actions
const {
  selectedLibraryId,
  selectedLibrary,
  libraries,
  items,
  sortConfig,
  isLoadingLibraries,
  isLoadingItems,
  isSelectingLibrary,
  isInitializing,
  initialized,
  ready,
  initialize,
  selectLibrary,
  refresh,
  setSortConfig,
  reset,
} = useLibrary();

// State-only hook
const items = useLibraryState(state => state.library.items);

// Actions-only hook
const { selectLibrary, refresh } = useLibraryActions();

// Initialization hook
useLibraryStoreInitializer(apiConfigured, dbInitialized);
```

## 4. Data Models for Libraries and Items

### Library Data Model

#### Database Schema (`/src/db/schema/libraries.ts`)
```typescript
export const libraries = sqliteTable('libraries', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon'),
  displayOrder: integer('display_order'),
  mediaType: text('media_type'),
  createdAt: integer('created_at'),
  updatedAt: integer('updated_at'),
});

export type LibraryRow = typeof libraries.$inferSelect;
```

#### Component Type (`/src/types/components.ts`)
```typescript
export interface LibraryPickerProps {
  libraries: LibraryRow[] | null;
  selectLibrary: (id: string) => void;
  selectedLibrary: LibraryRow | null;
  isDark: boolean;
}
```

### Library Item Data Models

#### Display Type (`/src/types/components.ts`)
```typescript
export interface LibraryItemDisplayRow {
  id: string;
  mediaType: string | null;
  title: string | null;
  author: string | null;
  authorName: string | null;
  authorNameLF: string | null;
  narrator: string | null;
  releaseDate: string | null;
  publishedYear: string | null;
  addedAt: number | null;
  duration: number | null;
  coverUri: string | null;
  seriesName: string | null;
}
```

#### Component Props
```typescript
export interface LibraryItemProps {
  item: LibraryItemDisplayRow;
  isDark: boolean;
  variant?: 'grid' | 'list';
}
```

### Sorting Configuration

#### Sort Fields (`/src/types/store.ts`)
```typescript
export type SortField = 'title' | 'authorName' | 'authorNameLF' | 'publishedYear' | 'addedAt';

export type SortConfig = {
  field: SortField;
  direction: 'asc' | 'desc';
};
```

#### Default Sort Config
```typescript
DEFAULT_SORT_CONFIG = { field: 'title', direction: 'asc' };
```

Available sort options in library screen:
- Title
- Author First Name
- Author Last Name
- Published Year
- Date Added

## 5. How Library Items Are Currently Displayed

### Display Flow

1. **Fetch Items**: Library slice fetches items from API using `/library/{libraryId}/items` endpoint
2. **Store in Database**: Items are marshaled and stored in SQLite database
3. **Transform to Display Format**: Items are transformed via `transformItemsToDisplayFormat()`
4. **Apply Sorting**: Items are sorted using `sortLibraryItems()` based on `sortConfig`
5. **Render in UI**: LibraryItemList renders FlatList with LibraryItem components

### Batch Fetching Strategy

The library slice implements an optimized batch fetching process:

1. **Step 1**: Fetch minified items (basic metadata with titles) - shows items immediately
2. **Step 2**: Upsert basic metadata to database
3. **Step 3**: Update UI with titles showing
4. **Step 4**: Start background batch fetch for full details (20 items per batch)
5. **Step 5**: Cache covers for items
6. **Step 6**: Update UI after each batch with newly cached covers

This allows users to see items quickly while full details load in the background.

### Search and Filter

The library screen filters items in real-time:
```typescript
const filteredItems = items.filter((item: LibraryItemDisplayRow) => {
  const titleMatch = item.title?.toLowerCase().includes(query) ?? false;
  const authorMatch = item.author?.toLowerCase().includes(query) ?? false;
  const authorNameMatch = item.authorName?.toLowerCase().includes(query) ?? false;
  const narratorMatch = item.narrator?.toLowerCase().includes(query) ?? false;
  const seriesMatch = item.seriesName?.toLowerCase().includes(query) ?? false;

  return titleMatch || authorMatch || authorNameMatch || narratorMatch || seriesMatch;
});
```

### View Modes

**Grid Mode**: 3-column grid layout
- Item width is auto-calculated to fit 3 columns
- Cards show cover image prominently
- Optimized for browsing

**List Mode**: Single-column list layout
- Full width rows
- Shows cover on left, text on right
- Optimized for reading details

## 6. Navigation Structure

### Route Hierarchy

```
/ (Root)
├── /index.tsx (App entry point)
├── /login.tsx (Login screen)
├── /(tabs)/ (Tab navigation)
│   ├── _layout.tsx (Tab navigation layout)
│   ├── /home/
│   │   ├── index.tsx (Home screen)
│   │   └── _layout.tsx
│   ├── /library/
│   │   ├── index.tsx (Library screen)
│   │   ├── _layout.tsx
│   │   └── /[item]/ (Item detail routes)
│   │       ├── index.tsx
│   │       └── _layout.tsx
│   ├── /series/
│   ├── /authors/
│   └── /more/
└── /FullScreenPlayer/
```

### Navigation APIs

The app uses **Expo Router** for navigation:

```typescript
// Navigation examples
const router = useRouter();
router.push('/library/item-id');  // Navigate to item detail
router.setParams({ openItem: 'item-id' });  // Set query params
router.navigate('/login');  // Navigate to login
```

### Deep Linking

The app supports deep linking:
- `side-shelf://logger?level[TAG_NAME]=warn` - Configure logger via deep link
- Can open specific items via navigation params

## 7. State Initialization Flow

### App Startup Sequence

1. **RootLayout Initialization** (`/src/app/_layout.tsx`)
   - Loads fonts
   - Initializes all services (PlayerService, ProgressService, etc.)
   - Sets up app state listeners
   - Loads providers (Auth, DB, Store)

2. **Provider Stack** (in RootLayout)
   ```
   DbProvider
   ├── AuthProvider
   └── StoreProvider
       └── Stack Navigation
           └── (tabs)
   ```

3. **Store Initialization** (in StoreProvider or via initializers)
   - `useLibraryStoreInitializer(apiConfigured, dbInitialized)` called
   - Library slice loads from AsyncStorage (selected library, sort config)
   - Libraries loaded from database cache
   - Auto-selects first library by display order
   - Checks for new items or triggers full refresh

## Key Files Reference

| File | Purpose |
|------|---------|
| `/src/app/(tabs)/_layout.tsx` | Tab configuration and navigation |
| `/src/app/(tabs)/library/index.tsx` | Library tab screen |
| `/src/stores/slices/librarySlice.ts` | Library state management |
| `/src/stores/appStore.ts` | Main Zustand store with hooks |
| `/src/components/library/` | Library UI components |
| `/src/db/schema/libraries.ts` | Library database schema |
| `/src/db/schema/libraryItems.ts` | Library item database schema |
| `/src/types/components.ts` | Component type definitions |
| `/src/types/store.ts` | Store type definitions |
| `/src/lib/api/endpoints.ts` | API endpoint functions |

## Design Patterns Used

### 1. Slice Pattern (Zustand)
- Each domain (library, authors, series, player, etc.) has its own slice
- Slices combined into single store with subscribeWithSelector middleware
- Each slice handles initialization, state, and actions

### 2. Hook-Based API
- Components access state via custom hooks (useLibrary, useAuthors, etc.)
- Hooks handle subscriptions and memoization
- Separation between state and action hooks for performance

### 3. State Machines
- Readiness state: UNINITIALIZED → INITIALIZING → NOT_READY/READY
- Operation state: IDLE → specific operation (REFRESHING_LIBRARIES, etc.) → IDLE
- Prevents invalid state transitions

### 4. Tab Configuration
- Centralized TAB_CONFIG array for easy maintenance
- Platform-specific icons (SF Symbols for iOS, Ionicons for Android)
- Translations via titleKey for i18n support

### 5. Batch Processing
- API requests grouped in batches for efficiency
- Background processing for non-critical data
- UI updated progressively as data arrives

## Next Steps for Podcast Tab Implementation

When adding a podcast tab, you should:

1. **Add to TAB_CONFIG** in `/src/app/(tabs)/_layout.tsx`
   - Choose appropriate icons (SF Symbol + Ionicon)
   - Add translation key

2. **Create Tab Directory** `/src/app/(tabs)/podcasts/`
   - Create `index.tsx` for main screen
   - Create `_layout.tsx` for layout
   - Create sub-routes as needed

3. **Create Podcast Slice** `/src/stores/slices/podcastSlice.ts`
   - Follow LibrarySlice pattern
   - Handle library selection, item fetching, sorting
   - Implement state machines for readiness

4. **Create Components** `/src/components/podcasts/`
   - PodcastList, PodcastItem, PodcastPicker (if needed)
   - Follow existing patterns from library components

5. **Update Store** `/src/stores/appStore.ts`
   - Import and include PodcastSlice
   - Create usePodcast hooks
   - Add to StoreState interface

6. **Add Database Schema** `/src/db/schema/`
   - Create podcast-specific tables if needed
   - Or reuse library items with mediaType filter

7. **Add Translations** `/src/i18n/locales/`
   - Add `tabs.podcasts` key
   - Add podcast-specific strings
