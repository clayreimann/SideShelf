/**
 * Main Zustand store combining all slices
 *
 * This store uses the slice pattern to organize state management.
 * Each slice handles a specific domain of the application state.
 */

import React from 'react';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { AuthorsSlice, createAuthorsSlice } from './slices/authorsSlice';
import { createLibrarySlice, LibrarySlice } from './slices/librarySlice';
import { createSeriesSlice, SeriesSlice } from './slices/seriesSlice';

/**
 * Combined store state interface
 *
 * This interface combines all slices into a single store.
 * As new slices are added, they should be included here.
 */
export interface StoreState extends LibrarySlice, AuthorsSlice, SeriesSlice {
    // Future slices will be added here
    // For example:
    // PlayerSlice,
    // SettingsSlice,
    // etc.
}

/**
 * Main Zustand store with slice pattern
 *
 * This store combines multiple slices using the slice pattern.
 * Each slice is responsible for its own domain of state and actions.
 *
 * Benefits of the slice pattern:
 * - Better organization and separation of concerns
 * - Easier to test individual slices
 * - Scalable for large applications
 * - Reusable slice logic
 */
export const useAppStore = create<StoreState>()(
    subscribeWithSelector((set, get) => ({
        // ApiLibrary slice
        ...createLibrarySlice(set, get),

        // Authors slice
        ...createAuthorsSlice(set, get),

        // ApiSeries slice
        ...createSeriesSlice(set, get),

        // Future slices will be spread here
        // ...createPlayerSlice(set, get),
        // ...createSettingsSlice(set, get),
    }))
);

/**
 * Legacy store export for backward compatibility
 * @deprecated Use useAppStore instead
 */
export const useLibraryStore = useAppStore;

/**
 * Hook to use the library slice with automatic subscription management
 *
 * This hook provides a clean interface to the library slice, similar to the
 * existing LibraryProvider context hook. It automatically handles subscriptions
 * and provides type-safe access to the library state and actions.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const {
 *     selectedLibrary,
 *     items,
 *     selectLibrary,
 *     refresh
 *   } = useLibrary();
 *
 *   // Use the store state and actions...
 * }
 * ```
 */
export function useLibrary() {
    const selectedLibraryId = useAppStore(state => state.library.selectedLibraryId);
    const selectedLibrary = useAppStore(state => state.library.selectedLibrary);
    const libraries = useAppStore(state => state.library.libraries);
    const items = useAppStore(state => state.library.items);
    const sortConfig = useAppStore(state => state.library.sortConfig);
    const isLoadingLibraries = useAppStore(state => state.library.loading.isLoadingLibraries);
    const isLoadingItems = useAppStore(state => state.library.loading.isLoadingItems);
    const isSelectingLibrary = useAppStore(state => state.library.loading.isSelectingLibrary);
    const isInitializing = useAppStore(state => state.library.loading.isInitializing);
    const initialized = useAppStore(state => state.library.initialized);
    const ready = useAppStore(state => state.library.ready);

    // Actions (these don't change so we can get them once)
    const initialize = useAppStore(state => state.initializeLibrarySlice);
    const selectLibrary = useAppStore(state => state.selectLibrary);
    const refresh = useAppStore(state => state.refresh);
    const setSortConfig = useAppStore(state => state.setSortConfig);
    const reset = useAppStore(state => state.resetLibrary);

    return React.useMemo(() => ({
        selectedLibraryId,
        selectedLibrary,
        libraries,
        items,
        sortConfig,
        isLoadingLibraries,
        isLoadingItems,
        isSelectingLibrary,
        isInitializing,
        initialized,
        ready,
        initialize,
        selectLibrary,
        refresh,
        setSortConfig,
        reset,
    }), [
        selectedLibraryId,
        selectedLibrary,
        libraries,
        items,
        sortConfig,
        isLoadingLibraries,
        isLoadingItems,
        isSelectingLibrary,
        isInitializing,
        initialized,
        ready,
        initialize,
        selectLibrary,
        refresh,
        setSortConfig,
        reset,
    ]);
}

/**
 * Hook to get specific library state without subscribing to the entire slice
 *
 * This hook allows components to subscribe to only specific parts of the
 * library state, improving performance by preventing unnecessary re-renders.
 *
 * @example
 * ```tsx
 * // Only re-render when libraries change
 * const libraries = useLibraryState(state => state.libraries);
 *
 * // Only re-render when loading state changes
 * const isLoading = useLibraryState(state => state.loading.isLoadingItems);
 * ```
 */
export function useLibraryState<T>(selector: (state: LibrarySlice) => T): T {
    return useAppStore(selector);
}

/**
 * Hook to get library actions without subscribing to state
 *
 * This hook provides access to library actions without subscribing to any state,
 * which is useful for components that only need to trigger actions.
 *
 * @example
 * ```tsx
 * function ActionButton() {
 *   const { selectLibrary, refresh } = useLibraryActions();
 *
 *   return (
 *     <Button onPress={() => selectLibrary('library-id')}>
 *       Select ApiLibrary
 *     </Button>
 *   );
 * }
 * ```
 */
export function useLibraryActions() {
    return useAppStore((state) => ({
        initialize: state.initializeLibrarySlice,
        selectLibrary: state.selectLibrary,
        refresh: state.refresh,
        setSortConfig: state.setSortConfig,
        reset: state.resetLibrary,
    }));
}

/**
 * Hook to initialize the library store
 *
 * This hook should be used in a provider component or at the app root
 * to initialize the library store when the API and database are ready.
 *
 * @param apiConfigured - Whether the API is configured and ready
 * @param dbInitialized - Whether the database is initialized and ready
 *
 * @example
 * ```tsx
 * function App() {
 *   const { apiConfigured } = useAuth();
 *   const { initialized: dbInitialized } = useDb();
 *
 *   useLibraryStoreInitializer(apiConfigured, dbInitialized);
 *
 *   return <YourAppContent />;
 * }
 * ```
 */
export function useLibraryStoreInitializer(apiConfigured: boolean, dbInitialized: boolean) {
    const initializeLibrary = useAppStore(state => state.initializeLibrarySlice);
    const setLibraryReady = useAppStore(state => state._setLibraryReady);
    const initialized = useAppStore(state => state.library.initialized);

    // Initialize the store when dependencies are ready
    React.useEffect(() => {
        if (!initialized && (apiConfigured || dbInitialized)) {
            initializeLibrary(apiConfigured, dbInitialized);
        }
    }, [initializeLibrary, initialized, apiConfigured, dbInitialized]);

    // Update ready state when dependencies change
    React.useEffect(() => {
        setLibraryReady(apiConfigured, dbInitialized);
    }, [setLibraryReady, apiConfigured, dbInitialized]);
}

/**
 * Hook to use the authors slice with automatic subscription management
 *
 * This hook provides a clean interface to the authors slice, similar to the
 * existing library hook. It automatically handles subscriptions
 * and provides type-safe access to the authors state and actions.
 *
 * @example
 * ```tsx
 * function AuthorsComponent() {
 *   const {
 *     authors,
 *     items,
 *     refetchAuthors,
 *     setAuthorsSortConfig
 *   } = useAuthors();
 *
 *   // Use the store state and actions...
 * }
 * ```
 */
export function useAuthors() {
    const authors = useAppStore(state => state.authors.authors);
    const items = useAppStore(state => state.authors.items);
    const sortConfig = useAppStore(state => state.authors.sortConfig);
    const isLoadingItems = useAppStore(state => state.authors.loading.isLoadingItems);
    const isInitializing = useAppStore(state => state.authors.loading.isInitializing);
    const initialized = useAppStore(state => state.authors.initialized);
    const ready = useAppStore(state => state.authors.ready);

    // Actions (these don't change so we can get them once)
    const initialize = useAppStore(state => state.initializeAuthors);
    const refetchAuthors = useAppStore(state => state.refetchAuthors);
    const setSortConfig = useAppStore(state => state.setAuthorsSortConfig);
    const reset = useAppStore(state => state.resetAuthors);

    return React.useMemo(() => ({
        authors,
        items,
        sortConfig,
        isLoadingItems,
        isInitializing,
        initialized,
        ready,
        initialize,
        refetchAuthors,
        setSortConfig,
        reset,
    }), [
        authors,
        items,
        sortConfig,
        isLoadingItems,
        isInitializing,
        initialized,
        ready,
        initialize,
        refetchAuthors,
        setSortConfig,
        reset,
    ]);
}

/**
 * Hook to use the series slice with automatic subscription management
 *
 * This hook provides a clean interface to the series slice, similar to the
 * existing library hook. It automatically handles subscriptions
 * and provides type-safe access to the series state and actions.
 *
 * @example
 * ```tsx
 * function SeriesComponent() {
 *   const {
 *     series,
 *     items,
 *     refetchSeries,
 *     setSeriesSortConfig
 *   } = useSeries();
 *
 *   // Use the store state and actions...
 * }
 * ```
 */
export function useSeries() {
    const series = useAppStore(state => state.series.series);
    const items = useAppStore(state => state.series.items);
    const sortConfig = useAppStore(state => state.series.sortConfig);
    const isLoadingItems = useAppStore(state => state.series.loading.isLoadingItems);
    const isInitializing = useAppStore(state => state.series.loading.isInitializing);
    const initialized = useAppStore(state => state.series.initialized);
    const ready = useAppStore(state => state.series.ready);

    // Actions (these don't change so we can get them once)
    const initialize = useAppStore(state => state.initializeSeries);
    const refetchSeries = useAppStore(state => state.refetchSeries);
    const setSortConfig = useAppStore(state => state.setSeriesSortConfig);
    const reset = useAppStore(state => state.resetSeries);

    return React.useMemo(() => ({
        series,
        items,
        sortConfig,
        isLoadingItems,
        isInitializing,
        initialized,
        ready,
        initialize,
        refetchSeries,
        setSortConfig,
        reset,
    }), [
        series,
        items,
        sortConfig,
        isLoadingItems,
        isInitializing,
        initialized,
        ready,
        initialize,
        refetchSeries,
        setSortConfig,
        reset,
    ]);
}

/**
 * Hook to get specific authors state without subscribing to the entire slice
 *
 * @example
 * ```tsx
 * // Only re-render when authors change
 * const authors = useAuthorsState(state => state.authors);
 *
 * // Only re-render when loading state changes
 * const isLoading = useAuthorsState(state => state.loading.isLoadingItems);
 * ```
 */
export function useAuthorsState<T>(selector: (state: AuthorsSlice) => T): T {
    return useAppStore(selector);
}

/**
 * Hook to get specific series state without subscribing to the entire slice
 *
 * @example
 * ```tsx
 * // Only re-render when series change
 * const series = useSeriesState(state => state.series);
 *
 * // Only re-render when loading state changes
 * const isLoading = useSeriesState(state => state.loading.isLoadingItems);
 * ```
 */
export function useSeriesState<T>(selector: (state: SeriesSlice) => T): T {
    return useAppStore(selector);
}

/**
 * Hook to get authors actions without subscribing to state
 *
 * @example
 * ```tsx
 * function ActionButton() {
 *   const { refetchAuthors, setSortConfig } = useAuthorsActions();
 *
 *   return (
 *     <Button onPress={() => refetchAuthors()}>
 *       Refresh Authors
 *     </Button>
 *   );
 * }
 * ```
 */
export function useAuthorsActions() {
    return useAppStore((state) => ({
        initialize: state.initializeAuthors,
        refetchAuthors: state.refetchAuthors,
        setSortConfig: state.setAuthorsSortConfig,
        reset: state.resetAuthors,
    }));
}

/**
 * Hook to get series actions without subscribing to state
 *
 * @example
 * ```tsx
 * function ActionButton() {
 *   const { refetchSeries, setSortConfig } = useSeriesActions();
 *
 *   return (
 *     <Button onPress={() => refetchSeries()}>
 *       Refresh ApiSeries
 *     </Button>
 *   );
 * }
 * ```
 */
export function useSeriesActions() {
    return useAppStore((state) => ({
        initialize: state.initializeSeries,
        refetchSeries: state.refetchSeries,
        setSortConfig: state.setSeriesSortConfig,
        reset: state.resetSeries,
    }));
}

/**
 * Hook to initialize the authors store
 *
 * This hook should be used in a provider component or at the app root
 * to initialize the authors store when the API and database are ready.
 *
 * @param apiConfigured - Whether the API is configured and ready
 * @param dbInitialized - Whether the database is initialized and ready
 */
export function useAuthorsStoreInitializer(apiConfigured: boolean, dbInitialized: boolean) {
    const initializeAuthors = useAppStore(state => state.initializeAuthors);
    const setAuthorsReady = useAppStore(state => state._setAuthorsReady);
    const initialized = useAppStore(state => state.authors.initialized);

    // Initialize the store when dependencies are ready
    React.useEffect(() => {
        if (!initialized && (apiConfigured || dbInitialized)) {
            initializeAuthors(apiConfigured, dbInitialized);
        }
    }, [initializeAuthors, initialized, apiConfigured, dbInitialized]);

    // Update ready state when dependencies change
    React.useEffect(() => {
        setAuthorsReady(apiConfigured, dbInitialized);
    }, [setAuthorsReady, apiConfigured, dbInitialized]);
}

/**
 * Hook to initialize the series store
 *
 * This hook should be used in a provider component or at the app root
 * to initialize the series store when the API and database are ready.
 *
 * @param apiConfigured - Whether the API is configured and ready
 * @param dbInitialized - Whether the database is initialized and ready
 */
export function useSeriesStoreInitializer(apiConfigured: boolean, dbInitialized: boolean) {
    const initializeSeries = useAppStore(state => state.initializeSeries);
    const setSeriesReady = useAppStore(state => state._setSeriesReady);
    const initialized = useAppStore(state => state.series.initialized);

    // Initialize the store when dependencies are ready
    React.useEffect(() => {
        if (!initialized && (apiConfigured || dbInitialized)) {
            initializeSeries(apiConfigured, dbInitialized);
        }
    }, [initializeSeries, initialized, apiConfigured, dbInitialized]);

    // Update ready state when dependencies change
    React.useEffect(() => {
        setSeriesReady(apiConfigured, dbInitialized);
    }, [setSeriesReady, apiConfigured, dbInitialized]);
}

/**
 * Hook for development/debugging - provides access to the entire store
 *
 * This hook should only be used for debugging purposes or in development tools.
 * Production components should use the more specific hooks above.
 *
 * @example
 * ```tsx
 * function DevTools() {
 *   const store = useDebugStore();
 *
 *   return (
 *     <div>
 *       <pre>{JSON.stringify(store, null, 2)}</pre>
 *     </div>
 *   );
 * }
 * ```
 */
export function useDebugStore() {
    return useAppStore(state => state);
}
