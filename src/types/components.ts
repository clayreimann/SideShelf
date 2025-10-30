/**
 * Component prop types and interfaces
 *
 * These types define the props and interfaces used by React components
 * throughout the application.
 */

import type { LibraryRow } from './database';

// Library component types
export interface LibraryItemDetailProps {
  itemId: string;
  onTitleChange?: (title: string) => void;
}

export interface LibraryItemProps {
  item: LibraryItemDisplayRow;
  isDark: boolean;
  variant?: 'grid' | 'list';
}

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

export type ViewMode = 'grid' | 'list';

export interface LibraryItemListProps {
  items: LibraryItemDisplayRow[];
  isLoading?: boolean;
  onRefresh?: () => Promise<void>;
  viewMode?: ViewMode;
}

export interface LibraryPickerProps {
  libraries: LibraryRow[] | null;
  selectLibrary: (id: string) => void;
  selectedLibrary: LibraryRow | null;
  isDark: boolean;
}

// UI component types
export interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  icon?: string;
}

export interface HeaderControlsProps {
  isDark: boolean;
  viewMode?: 'grid' | 'list';
  onToggleViewMode?: () => void;
  onSort: () => void;
  showViewToggle?: boolean;
  sortLabel?: string;
  viewToggleLabel?: string;
}

// Generic sort option type
export interface SortOption<T = string> {
  field: T;
  label: string;
}

// Generic sort config type
export interface GenericSortConfig<T = string> {
  field: T;
  direction: 'asc' | 'desc';
}

export interface SortMenuProps<T = string> {
  visible: boolean;
  onClose: () => void;
  sortConfig: GenericSortConfig<T>;
  onSortChange: (config: GenericSortConfig<T>) => void;
  sortOptions: SortOption<T>[];
  isDark: boolean;
  title?: string;
}

// Screen component types
export interface HomeSection {
  title: string;
  data: any[]; // Will be more specific when we define home screen item types
}

export type ActionItem = {
  label: string;
  onPress: () => void;
};
