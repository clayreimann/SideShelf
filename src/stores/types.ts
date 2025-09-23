/**
 * Shared types for the Zustand store system
 */

/**
 * Type for library item list display (minimal fields for performance)
 * NOTE: This is a simplified version. For complete display data including title, author,
 * narrator, etc., we would need to join with book/podcast tables when they are implemented
 */
export type LibraryItemListRow = {
    id: string;
    mediaType: string | null;
    title: string;
    author: string;
    authorNameLF: string | null;
    narrator: string | null;
    releaseDate: string | null;
    publishedYear: string | null;
    addedAt: number | null;
    duration: number;
    coverUri: string;
};

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
