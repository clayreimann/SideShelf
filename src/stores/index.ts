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
    useAuthors, useAuthorsActions, useAuthorsState, useAuthorsStoreInitializer, // Authors
    useDebugStore, // Legacy export for backward compatibility
    useLibrary, useLibraryActions, useLibraryState, useLibraryStore, useLibraryStoreInitializer, // ApiLibrary
    usePlayer, usePlayerActions, usePlayerState, usePlayerStoreInitializer, // Player
    useSeries, useSeriesActions, useSeriesState, useSeriesStoreInitializer, // ApiSeries
    type StoreState
} from './appStore';

// ApiLibrary slice type exports
export {
    type LibrarySlice, type LibrarySliceActions, type LibrarySliceState
} from './slices/librarySlice';

// Authors slice type exports
export {
    type AuthorsSlice, type AuthorsSliceActions, type AuthorsSliceState
} from './slices/authorsSlice';

// ApiSeries slice type exports
export {
    type SeriesSlice, type SeriesSliceActions, type SeriesSliceState
} from './slices/seriesSlice';

// Player slice type exports
export { type PlayerSlice, type PlayerSliceActions, type PlayerSliceState } from './slices/playerSlice';

// Shared types
export type { LibraryItemListRow } from '@/types/database';
export {
    type AuthorSortConfig, type AuthorSortField,
    type LoadingStates,
    type SeriesSortConfig, type SeriesSortField,
    type SliceCreator, type SortConfig, type SortDirection, type SortField
} from '@/types/store';

// Utilities
export {
    DEFAULT_AUTHOR_SORT_CONFIG, DEFAULT_SERIES_SORT_CONFIG, DEFAULT_SORT_CONFIG, STORAGE_KEYS, sortAuthors, sortLibraryItems as sortItems, sortSeries
} from './utils';
