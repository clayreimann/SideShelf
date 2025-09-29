/**
 * Utility functions for the library store
 */

import { AuthorListRow } from '@/db/helpers/authors';
import { SeriesListRow } from '@/db/helpers/series';
import { AuthorSortConfig, LibraryItemListRow, SeriesSortConfig, SortConfig } from './types';

/**
 * Storage keys for persisting state
 */
export const STORAGE_KEYS = {
    selectedLibraryId: 'abs.selectedLibraryId',
    sortConfig: 'abs.sortConfig',
} as const;

/**
 * Default sort configuration
 */
export const DEFAULT_SORT_CONFIG: SortConfig = { field: 'title', direction: 'asc' };

/**
 * Default author sort configuration
 */
export const DEFAULT_AUTHOR_SORT_CONFIG: AuthorSortConfig = { field: 'name', direction: 'asc' };

/**
 * Default series sort configuration
 */
export const DEFAULT_SERIES_SORT_CONFIG: SeriesSortConfig = { field: 'name', direction: 'asc' };

/**
 * Compare two library items by title
 */
function compareByTitle(a: LibraryItemListRow, b: LibraryItemListRow, config: SortConfig): number {
    const aValue = a.title?.toLowerCase() || '';
    const bValue = b.title?.toLowerCase() || '';
    if (aValue < bValue) return -1;
    if (aValue > bValue) return 1;
    return 0;
}

/**
 * Compare two library items by author (using authorNameLF for proper sorting)
 */
function compareByAuthor(a: LibraryItemListRow, b: LibraryItemListRow, config: SortConfig): number {
    // Use authorNameLF for proper last name first sorting, fallback to author
    const aValue = (a.authorNameLF || a.author)?.toLowerCase() || '';
    const bValue = (b.authorNameLF || b.author)?.toLowerCase() || '';
    if (aValue < bValue) return -1;
    if (aValue > bValue) return 1;
    return 0;
}

/**
 * Compare two library items by published year
 */
function compareByPublishedYear(a: LibraryItemListRow, b: LibraryItemListRow, config: SortConfig): number {
    const aValue = a.publishedYear || '';
    const bValue = b.publishedYear || '';
    if (aValue < bValue) return -1;
    if (aValue > bValue) return 1;
    return 0;
}

/**
 * Compare two library items by added date
 */
function compareByAddedAt(a: LibraryItemListRow, b: LibraryItemListRow, config: SortConfig): number {
    const aValue = a.addedAt || 0;
    const bValue = b.addedAt || 0;
    if (aValue < bValue) return -1;
    if (aValue > bValue) return 1;
    return 0;
}

/**
 * Sort library items based on the provided configuration
 */
export function sortLibraryItems(items: LibraryItemListRow[], config: SortConfig): LibraryItemListRow[] {
    let compareFn: (a: LibraryItemListRow, b: LibraryItemListRow, config: SortConfig) => number;

    switch (config.field) {
        case 'title':
            compareFn = compareByTitle;
            break;
        case 'author':
            compareFn = compareByAuthor;
            break;
        case 'publishedYear':
            compareFn = compareByPublishedYear;
            break;
        case 'addedAt':
            compareFn = compareByAddedAt;
            break;
        default:
            // fallback: no sorting
            compareFn = () => 0;
    }

    const sorted = [...items].sort((a, b) => {
        const comparison = compareFn(a, b, config);
        return config.direction === 'desc' ? -comparison : comparison;
    });

    return sorted;
}

/**
 * Compare two authors by name
 */
function compareAuthorsByName(a: AuthorListRow, b: AuthorListRow, config: AuthorSortConfig): number {
    const aValue = a.name?.toLowerCase() || '';
    const bValue = b.name?.toLowerCase() || '';
    if (aValue < bValue) return -1;
    if (aValue > bValue) return 1;
    return 0;
}

/**
 * Compare two authors by number of books
 */
function compareAuthorsByNumBooks(a: AuthorListRow, b: AuthorListRow, config: AuthorSortConfig): number {
    const aValue = a.numBooks || 0;
    const bValue = b.numBooks || 0;
    if (aValue < bValue) return -1;
    if (aValue > bValue) return 1;
    return 0;
}

/**
 * Sort authors based on the provided configuration
 */
export function sortAuthors(items: AuthorListRow[], config: AuthorSortConfig): AuthorListRow[] {
    let compareFn: (a: AuthorListRow, b: AuthorListRow, config: AuthorSortConfig) => number;

    switch (config.field) {
        case 'name':
            compareFn = compareAuthorsByName;
            break;
        case 'numBooks':
            compareFn = compareAuthorsByNumBooks;
            break;
        default:
            // fallback: no sorting
            compareFn = () => 0;
    }

    const sorted = [...items].sort((a, b) => {
        const comparison = compareFn(a, b, config);
        return config.direction === 'desc' ? -comparison : comparison;
    });

    return sorted;
}

/**
 * Compare two series by name
 */
function compareSeriesByName(a: SeriesListRow, b: SeriesListRow, config: SeriesSortConfig): number {
    const aValue = a.name?.toLowerCase() || '';
    const bValue = b.name?.toLowerCase() || '';
    if (aValue < bValue) return -1;
    if (aValue > bValue) return 1;
    return 0;
}

/**
 * Compare two series by added date
 */
function compareSeriesByAddedAt(a: SeriesListRow, b: SeriesListRow, config: SeriesSortConfig): number {
    const aValue = a.addedAt?.getTime() || 0;
    const bValue = b.addedAt?.getTime() || 0;
    if (aValue < bValue) return -1;
    if (aValue > bValue) return 1;
    return 0;
}

/**
 * Compare two series by updated date
 */
function compareSeriesByUpdatedAt(a: SeriesListRow, b: SeriesListRow, config: SeriesSortConfig): number {
    const aValue = a.updatedAt?.getTime() || 0;
    const bValue = b.updatedAt?.getTime() || 0;
    if (aValue < bValue) return -1;
    if (aValue > bValue) return 1;
    return 0;
}

/**
 * Sort series based on the provided configuration
 */
export function sortSeries(items: SeriesListRow[], config: SeriesSortConfig): SeriesListRow[] {
    let compareFn: (a: SeriesListRow, b: SeriesListRow, config: SeriesSortConfig) => number;

    switch (config.field) {
        case 'name':
            compareFn = compareSeriesByName;
            break;
        case 'addedAt':
            compareFn = compareSeriesByAddedAt;
            break;
        case 'updatedAt':
            compareFn = compareSeriesByUpdatedAt;
            break;
        default:
            // fallback: no sorting
            compareFn = () => 0;
    }

    const sorted = [...items].sort((a, b) => {
        const comparison = compareFn(a, b, config);
        return config.direction === 'desc' ? -comparison : comparison;
    });

    return sorted;
}
