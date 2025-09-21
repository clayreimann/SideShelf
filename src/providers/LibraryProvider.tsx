import { upsertFilterData } from '@/db/helpers/filterData';
import {
    getAllLibraries,
    getLibraryById,
    LibraryRow,
    marshalLibrariesFromResponse,
    marshalLibraryFromApi,
    upsertLibraries,
    upsertLibrary
} from '@/db/helpers/libraries';
import { getLibraryItemsForList, marshalLibraryItemsFromResponse, transformItemsToDisplayFormat, upsertLibraryItems } from '@/db/helpers/libraryItems';
import { upsertBooksMetadata, upsertPodcastsMetadata } from '@/db/helpers/mediaMetadata';
import { fetchLibraries, fetchLibraryItems, fetchLibraryWithFilterData } from '@/lib/api/endpoints';
import { Book, Podcast } from '@/lib/api/types';
import { useAuth } from '@/providers/AuthProvider';
import { useDb } from '@/providers/DbProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';


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

export type SortField = 'title' | 'author' | 'publishedYear' | 'addedAt';
export type SortDirection = 'asc' | 'desc';

export type SortConfig = {
    field: SortField;
    direction: SortDirection;
};

type SelectedLibraryState = {
    selectedLibraryId: string | null;
    selectedLibrary: LibraryRow | null;
    items: LibraryItemListRow[];
    isLoadingItems: boolean;
    selectLibrary: (libraryId: string) => Promise<void>;
    refetchLibraries: () => Promise<LibraryRow[]>;
    refetchItems: () => Promise<void>;
    libraries: LibraryRow[];
    sortConfig: SortConfig;
    setSortConfig: (config: SortConfig) => void;
};

const LibraryContext = createContext<SelectedLibraryState | undefined>(undefined);

const STORAGE_KEYS = {
    selectedLibraryId: 'abs.selectedLibraryId',
    sortConfig: 'abs.sortConfig',
} as const;

export function LibraryProvider({ children }: { children: React.ReactNode }) {
    const { apiConfigured, accessToken } = useAuth();
    const { initialized: dbInitialized } = useDb();
    const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
    const [selectedLibrary, setSelectedLibrary] = useState<LibraryRow | null>(null);
    const [rawItems, setRawItems] = useState<LibraryItemListRow[]>([]);
    const [isLoadingItems, setIsLoadingItems] = useState(false);
    const [allLibraries, setAllLibraries] = useState<LibraryRow[]>([]);
    const [sortConfig, setSortConfigState] = useState<SortConfig>({ field: 'title', direction: 'desc' });

    const initialized = useMemo(() => {
        console.log(`[LibraryProvider.initialized] db=${dbInitialized} apiConfigured=${apiConfigured} token=${accessToken ? 'yes' : 'no'}`);
        return dbInitialized && apiConfigured
    }, [dbInitialized, apiConfigured]);

    const setSortConfig = useCallback(async (config: SortConfig) => {
        setSortConfigState(config);
        try {
            await AsyncStorage.setItem(STORAGE_KEYS.sortConfig, JSON.stringify(config));
        } catch (error) {
            console.error('[LibraryProvider] Failed to save sort config:', error);
        }
    }, []);

    const sortItems = useCallback((items: LibraryItemListRow[], config: SortConfig): LibraryItemListRow[] => {
        const sorted = [...items].sort((a, b) => {
            let aValue: string | number | null;
            let bValue: string | number | null;

            switch (config.field) {
                case 'title':
                    aValue = a.title?.toLowerCase() || '';
                    bValue = b.title?.toLowerCase() || '';
                    break;
                case 'author':
                    // Use authorNameLF for proper last name first sorting, fallback to author
                    aValue = (a.authorNameLF || a.author)?.toLowerCase() || '';
                    bValue = (b.authorNameLF || b.author)?.toLowerCase() || '';
                    break;
                case 'publishedYear':
                    aValue = a.publishedYear || '';
                    bValue = b.publishedYear || '';
                    break;
                case 'addedAt':
                    aValue = a.addedAt || 0;
                    bValue = b.addedAt || 0;
                    break;
                default:
                    return 0;
            }

            let comparison = 0;
            if (aValue < bValue) comparison = -1;
            else if (aValue > bValue) comparison = 1;

            return config.direction === 'desc' ? -comparison : comparison;
        });

        return sorted;
    }, []);

    // Memoized sorted items
    const items = useMemo(() => {
        return sortItems(rawItems, sortConfig);
    }, [rawItems, sortConfig, sortItems]);

    const refetchLibraries = useCallback(async (): Promise<LibraryRow[]> => {
        if (!initialized) return [];

        try {
            console.log('[LibraryProvider] Refreshing libraries');
            // Fetch libraries from API
            const response = await fetchLibraries();

            // Marshal and store in database
            const libraryRows = marshalLibrariesFromResponse(response);
            await upsertLibraries(libraryRows);

            // Get updated libraries from database
            const libraries = await getAllLibraries();
            setAllLibraries(libraries);

            return libraries;
        } catch (error) {
            console.error('[LibraryProvider] Failed to fetch libraries:', error);

            // Fallback to database-only data
            const libraries = await getAllLibraries();
            setAllLibraries(libraries);

            return libraries;
        }
    }, [initialized]);

    const refetchLibrary = useCallback(async (libraryId: string): Promise<LibraryRow | null> => {
        if (!initialized) return null;

        try {
            console.log('[LibraryProvider] Refreshing library with filterdata:', libraryId);
            const response = await fetchLibraryWithFilterData(libraryId);
            const { filterdata, library, issues, numUserPlaylists } = response;
            const libraryRow = marshalLibraryFromApi(library);
            await upsertLibrary(libraryRow);

            // Process and store filterdata if present
            if (filterdata) {
                console.log('[LibraryProvider] Processing filterdata for library:', libraryId);
                await upsertFilterData(filterdata);
            }

            return await getLibraryById(libraryId);
        } catch (error) {
            console.error('[LibraryProvider] Failed to fetch library:', error);
            return null;
        }
    }, [initialized]);

    const refetchItems = useCallback(async () => {
        if (!selectedLibraryId || !initialized || !selectedLibrary) return;

        try {
            setIsLoadingItems(true);
            console.log('[LibraryProvider] Refreshing items for library:', selectedLibraryId, 'type:', selectedLibrary.mediaType);

            // Fetch library items from API
            const response = await fetchLibraryItems(selectedLibraryId);
            const libraryItemRows = marshalLibraryItemsFromResponse(response);
            await upsertLibraryItems(libraryItemRows);

            // Process media metadata based on library type
            if (selectedLibrary.mediaType === 'book') {
                // Extract books from library items and process metadata
                const books = response.results
                    .filter(item => item.mediaType === 'book' && item.media)
                    .map(item => ({...item.media, libraryItemId: item.id}) as Book);

                if (books.length > 0) {
                    console.log('[LibraryProvider] Processing book metadata for', books.length, 'books');
                    await upsertBooksMetadata(books);
                    console.log('[LibraryProvider] Book metadata processed for', books.length, 'books');
                }
            } else if (selectedLibrary.mediaType === 'podcast') {
                // Extract podcasts from library items and process metadata
                const podcasts = response.results
                    .filter(item => item.mediaType === 'podcast' && item.media)
                    .map(item => ({...item.media, libraryItemId: item.id}) as Podcast);

                if (podcasts.length > 0) {
                    console.log('[LibraryProvider] Processing podcast metadata for', podcasts.length, 'podcasts');
                    await upsertPodcastsMetadata(podcasts);
                }
            }

            // Get the items from database with full metadata for display
            const dbItems = await getLibraryItemsForList(selectedLibraryId);
            const displayItems = transformItemsToDisplayFormat(dbItems);
            setRawItems(displayItems);

        } catch (error) {
            console.error('[LibraryProvider] Failed to refresh items:', error);
        } finally {
            setIsLoadingItems(false);
        }
    }, [selectedLibraryId, initialized, selectedLibrary]);

    const selectLibrary = useCallback(async (libraryId: string) => {
        setSelectedLibraryId(libraryId);
        await AsyncStorage.setItem(STORAGE_KEYS.selectedLibraryId, libraryId);
        if (initialized) {
            const lib = await refetchLibrary(libraryId);
            if (lib) setSelectedLibrary(lib);
            await refetchItems();
        }
    }, [initialized, refetchLibrary]);

    // Load selected library and sort config from storage on mount
    useEffect(() => {
        (async () => {
            try {
                const [storedLibraryId, storedSortConfig] = await Promise.all([
                    AsyncStorage.getItem(STORAGE_KEYS.selectedLibraryId),
                    AsyncStorage.getItem(STORAGE_KEYS.sortConfig),
                ]);

                if (storedLibraryId) {
                    setSelectedLibraryId(storedLibraryId);
                }

                if (storedSortConfig) {
                    try {
                        const parsedSortConfig = JSON.parse(storedSortConfig) as SortConfig;
                        setSortConfigState(parsedSortConfig);
                    } catch (parseError) {
                        console.error('[LibraryProvider] Failed to parse stored sort config:', parseError);
                    }
                }
            } catch (error) {
                console.error('[LibraryProvider] Failed to load from storage:', error);
            }
        })();
    }, []);

    // Initialize libraries when api and db are ready
    useEffect(() => {
        (async () => {
            if (!initialized) return;
            console.log(`[LibraryProvider - Effect] Refreshing libraries ${initialized}`);
            // fetch selected library from the database
            if (selectedLibraryId) {
                const selectedLibrary = await getLibraryById(selectedLibraryId);
                if (selectedLibrary) {
                    setSelectedLibrary(selectedLibrary);
                    // load items for this library from the database
                    const items = await getLibraryItemsForList(selectedLibraryId);
                    const displayItems = transformItemsToDisplayFormat(items);
                    setRawItems(displayItems);
                }
            }

            // Fetch libraries from API and store in database
            const libs = await refetchLibraries();

            if (libs.length > 0) {
                // If we have a stored selection, try to use it
                if (selectedLibraryId) {
                    const selectedLibrary = libs.find(lib => lib.id === selectedLibraryId);
                    if (selectedLibrary) {
                        setSelectedLibrary(selectedLibrary);
                        return;
                    }
                }

                // Otherwise, select the first library
                await selectLibrary(libs[0].id);
            }
        })();
    }, [initialized, selectedLibraryId, refetchLibraries, selectLibrary]);

    const value = useMemo<SelectedLibraryState>(() => ({
        selectedLibraryId,
        selectedLibrary,
        items,
        isLoadingItems,
        selectLibrary,
        refetchItems,
        refetchLibraries,
        libraries: allLibraries,
        sortConfig,
        setSortConfig,
    }), [selectedLibraryId, selectedLibrary, items, isLoadingItems, selectLibrary, refetchItems, allLibraries, sortConfig, setSortConfig]);

    return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): SelectedLibraryState {
    const ctx = useContext(LibraryContext);
    if (!ctx) throw new Error('useLibrary must be used within LibraryProvider');
    return ctx;
}
