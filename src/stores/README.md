# Stores

This directory contains Zustand stores for state management in the Audiobookshelf React Native application using the **slice pattern**.

## Overview

The stores in this directory provide an alternative to the existing React Context providers for state management. They use [Zustand](https://github.com/pmndrs/zustand), a lightweight state management library with a slice-based architecture that offers:

- **Better performance**: No unnecessary re-renders with selective subscriptions
- **Modular architecture**: Slice pattern for better organization and scalability
- **Simpler API**: Less boilerplate than Context + useReducer
- **DevTools support**: Built-in Redux DevTools integration
- **Persistence**: Easy AsyncStorage integration
- **TypeScript support**: Excellent type inference and strict typing

## Architecture: Slice Pattern

The store system uses the **slice pattern** to organize state management:

```
src/stores/
├── index.ts              # Main exports
├── types.ts              # Shared types and interfaces
├── utils.ts              # Utility functions
├── libraryStore.ts       # Main store combining all slices
├── slices/
│   └── librarySlice.ts   # Library-specific state and actions
└── README.md             # This file
```

### Benefits of the Slice Pattern

1. **Separation of Concerns**: Each slice manages its own domain
2. **Scalability**: Easy to add new slices without affecting existing ones
3. **Testability**: Individual slices can be tested in isolation
4. **Reusability**: Slice logic can be reused across different stores
5. **Type Safety**: Each slice has its own strongly-typed interface
6. **Organization**: Large applications remain manageable
7. **No State Conflicts**: Each slice's state is scoped to avoid naming conflicts

### State Scoping

Each slice's state is scoped under its own namespace to prevent conflicts. For example, the library slice's state is nested under `library`:

```typescript
// Store structure
{
  library: {
    selectedLibraryId: string | null,
    selectedLibrary: LibraryRow | null,
    libraries: LibraryRow[],
    items: LibraryItemListRow[],
    loading: LoadingStates,
    // ... other library state
  },
  // Future slices will be added at the same level
  player: {
    currentTrack: Track | null,
    isPlaying: boolean,
    // ... player state
  },
  settings: {
    theme: 'light' | 'dark',
    // ... settings state
  }
}
```

This scoping ensures that properties like `items`, `loading`, etc. don't conflict between different slices.

## Library Slice

The `slices/librarySlice.ts` file contains the library state management logic, organized as a slice that can be combined with other slices.

### Features

- **Library Management**: Select libraries, fetch from API, sync with database
- **Item Management**: Load and display library items with full metadata
- **Sorting**: Configurable sorting by title, author, published year, or added date
- **Persistence**: Automatically saves selected library and sort preferences
- **Loading States**: Granular loading states for different operations
- **Error Handling**: Graceful fallbacks when API calls fail

### Usage Patterns

#### 1. Basic Usage (Recommended)

The `useLibrary()` hook provides a clean interface similar to the existing LibraryProvider:

```tsx
import { useLibrary } from '@/stores';

function LibraryScreen() {
  const {
    selectedLibrary,
    items,
    isLoadingItems,
    selectLibrary,
    refetchItems,
    setSortConfig,
  } = useLibrary();

  if (!selectedLibrary) {
    return <Text>No library selected</Text>;
  }

  return (
    <View>
      <Text>{selectedLibrary.name}</Text>
      {isLoadingItems ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <LibraryItem item={item} />
          )}
        />
      )}
    </View>
  );
}
```

#### 2. Selective Subscriptions (Performance Optimized)

Use `useLibraryState()` to subscribe only to specific parts of the state:

```tsx
import { useLibraryState, useLibraryActions } from '@/stores';

function LibrarySelector() {
  // Only re-render when libraries change
  const libraries = useLibraryState(state => state.libraries);
  const { selectLibrary } = useLibraryActions();

  return (
    <Picker onValueChange={selectLibrary}>
      {libraries.map(lib => (
        <Picker.Item key={lib.id} label={lib.name} value={lib.id} />
      ))}
    </Picker>
  );
}

function LoadingIndicator() {
  // Only re-render when loading state changes
  const isLoading = useLibraryState(state => state.loading.isLoadingItems);

  return isLoading ? <ActivityIndicator /> : null;
}
```

#### 3. Actions Only (No State Subscriptions)

Use `useLibraryActions()` when you only need to trigger actions:

```tsx
import { useLibraryActions } from '@/stores';

function RefreshButton() {
  const { refetchItems } = useLibraryActions();

  return (
    <Button onPress={refetchItems} title="Refresh" />
  );
}
```

#### Store Initialization

The store needs to be initialized when the app starts. Use the `useLibraryStoreInitializer` hook:

```tsx
import { useAuth } from '@/providers/AuthProvider';
import { useDb } from '@/providers/DbProvider';
import { useLibraryStoreInitializer } from '@/stores';

function App() {
  const { apiConfigured } = useAuth();
  const { initialized: dbInitialized } = useDb();

  // Initialize the library store
  useLibraryStoreInitializer(apiConfigured, dbInitialized);

  return <YourAppContent />;
}
```

#### Direct Store Access

For more advanced use cases, you can access the store directly:

```tsx
import { useLibraryStore } from '@/stores';

function AdvancedComponent() {
  const libraries = useLibraryStore(state => state.libraries);
  const isInitializing = useLibraryStore(state => state.loading.isInitializing);
  const reset = useLibraryStore(state => state.reset);

  // Use the store state and actions directly...
}
```

### State Structure

```typescript
interface LibraryState {
  // Core state
  selectedLibraryId: string | null;
  selectedLibrary: LibraryRow | null;
  libraries: LibraryRow[];
  rawItems: LibraryItemListRow[];
  items: LibraryItemListRow[]; // Sorted items
  sortConfig: SortConfig;
  loading: LoadingStates;
  initialized: boolean;
  ready: boolean;

  // Actions
  initialize: (apiConfigured: boolean, dbInitialized: boolean) => Promise<void>;
  selectLibrary: (libraryId: string) => Promise<void>;
  refetchLibraries: () => Promise<LibraryRow[]>;
  refetchItems: () => Promise<void>;
  setSortConfig: (config: SortConfig) => Promise<void>;
  reset: () => void;
}
```

### Loading States

The store provides granular loading states:

- `isLoadingLibraries`: Libraries are being fetched/refreshed
- `isLoadingItems`: Library items are being fetched/refreshed
- `isSelectingLibrary`: A library is being selected/switched
- `isInitializing`: The store is initializing from storage

### Sorting

The store supports sorting library items by:

- **title**: Alphabetical by title
- **author**: Alphabetical by author (uses `authorNameLF` for proper last-name-first sorting)
- **publishedYear**: By publication year
- **addedAt**: By date added to library

Sort direction can be `asc` (ascending) or `desc` (descending).

```tsx
const { setSortConfig } = useLibrary();

// Sort by author name, descending
setSortConfig({ field: 'author', direction: 'desc' });
```

### Persistence

The store automatically persists:

- **Selected Library**: The currently selected library ID
- **Sort Configuration**: The current sort field and direction

Data is stored in AsyncStorage and automatically restored when the app starts.

## Database Operations

The store integrates with all existing database helper functions:

### Libraries
- `getAllLibraries()`: Fetch all libraries from database
- `getLibraryById(id)`: Get a specific library
- `upsertLibrary(row)`: Insert or update a library
- `upsertLibraries(rows)`: Batch insert/update libraries

### Library Items
- `getLibraryItemsForList(libraryId)`: Get items with full metadata for display
- `upsertLibraryItems(rows)`: Batch insert/update library items
- `transformItemsToDisplayFormat(items)`: Transform DB items for UI display

### Media Metadata
- `upsertBooksMetadata(books)`: Process book metadata
- `upsertPodcastsMetadata(podcasts)`: Process podcast metadata
- `cacheCoversForLibraryItems(libraryId)`: Cache cover images

## API Integration

The store handles all API operations:

- `fetchLibraries()`: Fetch all libraries from Audiobookshelf API
- `fetchLibraryWithFilterData(libraryId)`: Fetch library with filter data
- `fetchLibraryItems(libraryId)`: Fetch items for a specific library

API responses are automatically marshaled to database format and stored locally for offline access.

## Coexistence with LibraryProvider

The Zustand store is designed to coexist with the existing `LibraryProvider`. You can:

1. **Gradual Migration**: Migrate components one by one from Context to Zustand
2. **Feature Testing**: Use Zustand for new features while keeping existing code
3. **Performance Comparison**: Compare performance between the two approaches

Both systems can run simultaneously without conflicts, as they operate on the same database and use the same API endpoints.

## Performance Benefits

Compared to the React Context approach, the Zustand store offers:

1. **Selective Subscriptions**: Components only re-render when their specific data changes
2. **No Provider Wrapping**: No need to wrap components in context providers
3. **Computed Values**: Memoized computed values (like sorted items) are cached
4. **Granular Updates**: Fine-grained control over what triggers re-renders

## Creating New Slices

The slice pattern makes it easy to add new domains of state to the application. Here's how to create a new slice:

### 1. Define the Slice Interface

```typescript
// src/stores/slices/playerSlice.ts
export interface PlayerSliceState {
  player: {
    currentTrack: Track | null;
    isPlaying: boolean;
    volume: number;
    loading: {
      isLoadingTrack: boolean;
    };
  };
}

export interface PlayerSliceActions {
  play: (track: Track) => void;
  pause: () => void;
  setVolume: (volume: number) => void;
  _setPlayerLoading: (loading: boolean) => void;
}

export interface PlayerSlice extends PlayerSliceState, PlayerSliceActions {}
```

### 2. Create the Slice

```typescript
export const createPlayerSlice: SliceCreator<PlayerSlice> = (set, get) => ({
  // Initial scoped state
  player: {
    currentTrack: null,
    isPlaying: false,
    volume: 1.0,
    loading: {
      isLoadingTrack: false,
    },
  },

  // Actions
  play: (track: Track) => {
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        currentTrack: track,
        isPlaying: true,
      },
    }));
  },

  pause: () => {
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        isPlaying: false,
      },
    }));
  },

  setVolume: (volume: number) => {
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        volume: Math.max(0, Math.min(1, volume)),
      },
    }));
  },

  _setPlayerLoading: (loading: boolean) => {
    set((state: PlayerSlice) => ({
      ...state,
      player: {
        ...state.player,
        loading: {
          ...state.player.loading,
          isLoadingTrack: loading,
        },
      },
    }));
  },
});
```

### 3. Add to Main Store

```typescript
// src/stores/libraryStore.ts
import { createPlayerSlice, PlayerSlice } from './slices/playerSlice';

export interface StoreState extends LibrarySlice, PlayerSlice {
  // Other slices...
}

export const useAppStore = create<StoreState>()(
  subscribeWithSelector((set, get) => ({
    // Existing slices
    ...createLibrarySlice(set, get),

    // New slice
    ...createPlayerSlice(set, get),
  }))
);
```

### 4. Create Hooks

```typescript
// Convenience hook for the player slice
export function usePlayer() {
  return useAppStore((state) => ({
    // Access scoped state
    currentTrack: state.player.currentTrack,
    isPlaying: state.player.isPlaying,
    volume: state.player.volume,
    isLoadingTrack: state.player.loading.isLoadingTrack,

    // Actions
    play: state.play,
    pause: state.pause,
    setVolume: state.setVolume,
  }));
}

// Selective subscription hook
export function usePlayerState<T>(selector: (state: PlayerSlice) => T): T {
  return useAppStore(selector);
}

// Example usage:
// const isPlaying = usePlayerState(state => state.player.isPlaying);
// const volume = usePlayerState(state => state.player.volume);
```

## Future Enhancements

The slice pattern enables easy addition of new features:

1. **Player Slice**: Audio player state and controls
2. **Auth Slice**: Authentication and user management
3. **Settings Slice**: Application settings and preferences
4. **Search Slice**: Search functionality and filters
5. **Download Slice**: Download queue and offline content
6. **Sync Slice**: Background synchronization with server

## Development

### Slice Development Guidelines

1. **Single Responsibility**: Each slice should manage one domain of state
2. **Immutable Updates**: Always use immutable update patterns
3. **Action Naming**: Use clear, descriptive action names
4. **State Shape**: Keep state flat and normalized when possible
5. **Error Handling**: Include proper error handling in async actions

### Testing Slices

Slices can be tested independently:

```typescript
import { createLibrarySlice } from '@/stores/slices/librarySlice';

describe('LibrarySlice', () => {
  let slice: LibrarySlice;

  beforeEach(() => {
    const mockSet = jest.fn();
    const mockGet = jest.fn();
    slice = createLibrarySlice(mockSet, mockGet);
  });

  it('should initialize with default state', () => {
    expect(slice.selectedLibraryId).toBeNull();
    expect(slice.libraries).toEqual([]);
  });
});
```

### Debugging

Enable detailed logging by setting the log level:

```typescript
// In development, you can enable more detailed logging
console.log('[LibraryStore] Debug info:', get());
```

The store includes comprehensive logging for all operations, making it easy to debug issues during development.
