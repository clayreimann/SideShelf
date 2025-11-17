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
    useDebugStore, // Debug hook
    useDownloads, useDownloadsStoreInitializer, // Downloads
    useHome, useHomeStoreInitializer, // Home
    useLibrary, useLibraryActions, useLibraryItemDetails, useLibraryState, useLibraryStore, useLibraryStoreInitializer, // ApiLibrary & Item Details
    useNetwork, useNetworkStoreInitializer, // Network
    usePlayer, usePlayerActions, usePlayerState, usePlayerStoreInitializer, // Player
    usePodcasts, usePodcastActions, usePodcastState, usePodcastStoreInitializer, // Podcasts
    useSeries, useSeriesActions, useSeriesState, useSeriesStoreInitializer, // ApiSeries
    useSettings, useSettingsStoreInitializer, // Settings
    useStatistics, // Statistics
    useUserProfile, useUserProfileStoreInitializer, // User Profile
    type StoreState
} from './appStore';

// ApiLibrary slice type exports
export {
    type LibrarySlice, type LibrarySliceActions, type LibrarySliceState
} from './slices/librarySlice';

// Podcast slice type exports
export {
    type PodcastSlice, type PodcastSliceActions, type PodcastSliceState
} from './slices/podcastSlice';

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

// Home slice type exports
export { type HomeSlice, type HomeSliceActions, type HomeSliceState } from './slices/homeSlice';

// LibraryItemDetails slice type exports
export {
    type CachedItemDetails, type LibraryItemDetailsSlice, type LibraryItemDetailsSliceActions, type LibraryItemDetailsSliceState
} from './slices/libraryItemDetailsSlice';

// Settings slice type exports
export { type SettingsSlice, type SettingsSliceActions, type SettingsSliceState } from './slices/settingsSlice';

// UserProfile slice type exports
export { type ServerInfo, type DeviceInfo as UserDeviceInfo, type UserProfileSlice, type UserProfileSliceActions, type UserProfileSliceState } from './slices/userProfileSlice';

// Download slice type exports
export { type DownloadSlice, type DownloadSliceActions, type DownloadSliceState } from './slices/downloadSlice';

// Statistics slice type exports
export {
    type DatabaseCounts, type StatisticsSlice, type StatisticsSliceActions, type StatisticsSliceState, type StorageEntry
} from './slices/statisticsSlice';

// Network slice type exports
export {
    type NetworkSlice, type NetworkSliceActions, type NetworkSliceState
} from './slices/networkSlice';

// Shared types
export type { LibraryItemRow } from '@/db/schema/libraryItems';
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
