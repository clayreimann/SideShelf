/**
 * Stores index - exports all Zustand stores and types
 *
 * This file provides a centralized export point for all application stores.
 * Import stores from here to maintain consistency across the application.
 *
 * The store system uses the slice pattern for better organization:
 * - Each slice manages a specific domain of state
 * - Slices are combined into a single store
 * - Hooks provide clean access to slice functionality
 */

// Main store and hooks
export {
    useAppStore, // Debug
    useAuthors, useAuthorsActions, useAuthorsState, useAuthorsStoreInitializer, // Legacy export for backward compatibility
    useDebugStore, // Authors
    useLibrary, useLibraryActions, useLibraryState, useLibraryStore, useLibraryStoreInitializer, // Library
    useSeries, useSeriesActions, useSeriesState, useSeriesStoreInitializer, // Series
    type StoreState
} from './appStore';

// Library slice type exports
export {
    type LibrarySlice, type LibrarySliceActions, type LibrarySliceState
} from './slices/librarySlice';

// Authors slice type exports
export {
    type AuthorsSlice, type AuthorsSliceActions, type AuthorsSliceState
} from './slices/authorsSlice';

// Series slice type exports
export {
    type SeriesSlice, type SeriesSliceActions, type SeriesSliceState
} from './slices/seriesSlice';

// Shared types
export {
    type AuthorSortConfig, type AuthorSortField,
    type LibraryItemListRow, type LoadingStates,
    type SeriesSortConfig, type SeriesSortField,
    type SliceCreator, type SortConfig, type SortDirection, type SortField
} from './types';

// Utilities
export {
    DEFAULT_AUTHOR_SORT_CONFIG, DEFAULT_SERIES_SORT_CONFIG, DEFAULT_SORT_CONFIG,
    sortAuthors, sortLibraryItems as sortItems, sortSeries, STORAGE_KEYS
} from './utils';
