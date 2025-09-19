import {
    getAllLibraries,
    getLibraryById,
    LibraryRow,
    marshalLibrariesFromResponse,
    marshalLibraryFromApi,
    upsertLibraries,
    upsertLibrary
} from '@/db/helpers/libraries';
import { fetchLibraries, fetchLibrary } from '@/lib/api/endpoints';
import { useAuth } from '@/providers/AuthProvider';
import { useDb } from '@/providers/DbProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';


type LibraryItemListRow = {
    id: string;
    mediaType: string | null;
    title: string | null;
    author: string | null;
    narrator: string | null;
    releaseDate: string | null;
    duration: number | null;
    coverUri: string;
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
};

const LibraryContext = createContext<SelectedLibraryState | undefined>(undefined);

const STORAGE_KEYS = {
    selectedLibraryId: 'abs.selectedLibraryId',
} as const;

export function LibraryProvider({ children }: { children: React.ReactNode }) {
    const { isAuthenticated } = useAuth();
    const { initialized: dbInitialized } = useDb();
    const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
    const [selectedLibrary, setSelectedLibrary] = useState<LibraryRow | null>(null);
    const [items, setItems] = useState<LibraryItemListRow[]>([]);
    const [isLoadingItems, setIsLoadingItems] = useState(false);
    const [allLibraries, setAllLibraries] = useState<LibraryRow[]>([]);

    const initialized = useMemo(() => dbInitialized && isAuthenticated, [dbInitialized, isAuthenticated]);

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
            console.log('[LibraryProvider] Refreshing library:', libraryId);
            const response = await fetchLibrary(libraryId);
            const library = marshalLibraryFromApi(response);
            await upsertLibrary(library);
            return await getLibraryById(libraryId);
        } catch (error) {
            console.error('[LibraryProvider] Failed to fetch library:', error);
            return null;
        }
    }, [initialized]);

    const refetchItems = useCallback(async () => {
        if (!selectedLibraryId || !initialized) return;
        console.log('[LibraryProvider] Refreshing items:', selectedLibraryId);
        // not implemented
    }, [selectedLibraryId, initialized]);

    const selectLibrary = useCallback(async (libraryId: string) => {
        setSelectedLibraryId(libraryId);
        await AsyncStorage.setItem(STORAGE_KEYS.selectedLibraryId, libraryId);
        if (initialized) {
            const lib = await refetchLibrary(libraryId);
            if (lib) setSelectedLibrary(lib);
        }
    }, [initialized, refetchLibrary]);

    // Load selected library from storage on mount
    useEffect(() => {
        (async () => {
            try {
                const stored = await AsyncStorage.getItem(STORAGE_KEYS.selectedLibraryId);
                if (stored) {
                    setSelectedLibraryId(stored);
                }
            } catch (error) {
                console.error('[LibraryProvider] Failed to load selected library from storage:', error);
            }
        })();
    }, []);

    // Initialize libraries when authenticated and db is ready
    useEffect(() => {
        (async () => {
            if (!initialized) return;
            console.log('[LibraryProvider] Refreshing libraries');
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
    }), [selectedLibraryId, selectedLibrary, items, isLoadingItems, selectLibrary, refetchItems, allLibraries]);

    return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): SelectedLibraryState {
    const ctx = useContext(LibraryContext);
    if (!ctx) throw new Error('useLibrary must be used within LibraryProvider');
    return ctx;
}
