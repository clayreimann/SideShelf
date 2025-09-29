/**
 * Store-related types for Zustand state management
 *
 * These types define the structure of the application's state management,
 * including slice interfaces, sort configurations, and loading states.
 */

/**
 * Supported sort fields for library items
 */
export type SortField = 'title' | 'author' | 'publishedYear' | 'addedAt';

/**
 * Supported sort fields for authors
 */
export type AuthorSortField = 'name' | 'numBooks';

/**
 * Supported sort fields for series
 */
export type SeriesSortField = 'name' | 'addedAt' | 'updatedAt';

/**
 * Sort direction for library items
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Configuration for sorting library items
 */
export type SortConfig = {
  field: SortField;
  direction: SortDirection;
};

/**
 * Configuration for sorting authors
 */
export type AuthorSortConfig = {
  field: AuthorSortField;
  direction: SortDirection;
};

/**
 * Configuration for sorting series
 */
export type SeriesSortConfig = {
  field: SeriesSortField;
  direction: SortDirection;
};

/**
 * Loading states for different operations
 */
export interface LoadingStates {
  /** Whether libraries are being fetched/refreshed */
  isLoadingLibraries: boolean;
  /** Whether library items are being fetched/refreshed */
  isLoadingItems: boolean;
  /** Whether a library is being selected/switched */
  isSelectingLibrary: boolean;
  /** Whether the store is initializing from storage */
  isInitializing: boolean;
}

/**
 * Generic slice creator function type
 * Uses any to avoid complex type inference issues with Zustand
 */
export type SliceCreator<T> = (
  set: (...args: any[]) => void,
  get: () => any
) => T;

// Note: Store slice interfaces (LibrarySlice, AuthorsSlice, etc.) are defined
// in their respective slice files to avoid circular dependencies.
// Import them directly from their slice files when needed:
//
// import type { LibrarySlice } from '@/stores/slices/librarySlice';
// import type { AuthorsSlice } from '@/stores/slices/authorsSlice';
// import type { SeriesSlice } from '@/stores/slices/seriesSlice';
