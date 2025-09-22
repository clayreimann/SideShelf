# Components

## Library Components

### LibraryItemDetail

A comprehensive component for displaying detailed information about a library item (book, audiobook, etc.).

**Props:**
- `itemId: string` - The ID of the library item to display
- `onTitleChange?: (title: string) => void` - Optional callback when the title is loaded

**Features:**
- Loads item metadata, genres, and tags
- Displays cover image with fallback
- Shows description with HTML rendering
- Handles cover caching in background
- Loading and error states

**Usage:**
```tsx
import { LibraryItemDetail } from '@/components/library';

<LibraryItemDetail
  itemId="item-123"
  onTitleChange={(title) => setHeaderTitle(title)}
/>
```

### LibraryItemList

A flexible list/grid component for displaying collections of library items.

**Props:**
- `items: LibraryItemListRow[]` - Array of items to display
- `isLoading?: boolean` - Loading state
- `onRefresh?: () => Promise<void>` - Optional refresh handler
- `sortConfig: SortConfig` - Current sort configuration
- `onSortChange: (config: SortConfig) => void` - Sort change handler
- `showControls?: boolean` - Whether to show view mode and sort controls (default: true)

**Features:**
- Grid and list view modes
- Pull-to-refresh functionality
- Sort menu integration
- Responsive design
- Loading states

**Usage:**
```tsx
import { LibraryItemList } from '@/components/library';

<LibraryItemList
  items={items}
  isLoading={isLoading}
  onRefresh={refetchItems}
  sortConfig={sortConfig}
  onSortChange={setSortConfig}
/>
```

### LibraryItem (GridItem & ListItem)

Individual item components for different display modes.

**Props:**
- `item: LibraryItemListRow` - The item data
- `isDark: boolean` - Theme mode
- `variant?: 'grid' | 'list'` - Display variant (for main component)

**Features:**
- Cover image with fallback
- Title, author, narrator display
- Responsive sizing
- Touch navigation

**Usage:**
```tsx
import { GridItem, ListItem, LibraryItem } from '@/components/library';

// Individual components
<GridItem item={item} isDark={isDark} />
<ListItem item={item} isDark={isDark} />

// Main component with variant
<LibraryItem item={item} isDark={isDark} variant="grid" />
```

### LibraryPicker

A horizontal picker component for selecting between multiple libraries.

**Props:**
- `libraries: any[] | null` - Array of available libraries
- `selectLibrary: (id: string) => void` - Selection handler
- `selectedLibrary: any | null` - Currently selected library
- `isDark: boolean` - Theme mode

**Features:**
- Horizontal scrollable layout
- Visual selection state
- Responsive design

**Usage:**
```tsx
import { LibraryPicker } from '@/components/library';

<LibraryPicker
  libraries={libraries}
  selectLibrary={selectLibrary}
  selectedLibrary={selectedLibrary}
  isDark={isDark}
/>
```

## UI Components

### SortMenu

A modal component for selecting sort options.

**Props:**
- `visible: boolean` - Modal visibility
- `onClose: () => void` - Close handler
- `sortConfig: SortConfig` - Current sort configuration
- `onSortChange: (config: SortConfig) => void` - Sort change handler
- `isDark: boolean` - Theme mode

**Features:**
- Modal overlay
- Sort field selection
- Direction toggle (A-Z, Z-A)
- Visual feedback for current selection

**Usage:**
```tsx
import { SortMenu } from '@/components/ui';

<SortMenu
  visible={showSortMenu}
  onClose={() => setShowSortMenu(false)}
  sortConfig={sortConfig}
  onSortChange={setSortConfig}
  isDark={isDark}
/>
```

## Best Practices

1. **Theme consistency**: All components accept `isDark` prop for consistent theming
2. **Loading states**: Components handle loading states internally where appropriate
3. **Error boundaries**: Consider wrapping components in error boundaries for production
4. **Performance**: Components use React.memo where beneficial for performance
5. **Accessibility**: Components include proper accessibility props and behaviors
