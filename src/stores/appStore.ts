/**
 * Main Zustand store combining all slices
 *
 * This store uses the slice pattern to organize state management.
 * Each slice handles a specific domain of the application state.
 */

import React from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

import { AuthorsSlice, createAuthorsSlice } from "./slices/authorsSlice";
import { createDownloadSlice, DownloadSlice } from "./slices/downloadSlice";
import { createHomeSlice, HomeSlice } from "./slices/homeSlice";
import {
  createLibraryItemDetailsSlice,
  LibraryItemDetailsSlice,
} from "./slices/libraryItemDetailsSlice";
import { createLibrarySlice, LibrarySlice } from "./slices/librarySlice";
import { createLoggerSlice, LoggerSlice } from "./slices/loggerSlice";
import { createNetworkSlice, NetworkSlice } from "./slices/networkSlice";
import { createPlayerSlice, PlayerSlice } from "./slices/playerSlice";
import { createPodcastSlice, PodcastSlice } from "./slices/podcastSlice";
import { createSeriesSlice, SeriesSlice } from "./slices/seriesSlice";
import { createSettingsSlice, SettingsSlice } from "./slices/settingsSlice";
import { createStatisticsSlice, StatisticsSlice } from "./slices/statisticsSlice";
import { createUserProfileSlice, UserProfileSlice } from "./slices/userProfileSlice";

/**
 * Combined store state interface
 *
 * This interface combines all slices into a single store.
 * As new slices are added, they should be included here.
 */
export interface StoreState
  extends LibrarySlice,
    PodcastSlice,
    AuthorsSlice,
    SeriesSlice,
    PlayerSlice,
    HomeSlice,
    LibraryItemDetailsSlice,
    SettingsSlice,
    UserProfileSlice,
    DownloadSlice,
    StatisticsSlice,
    NetworkSlice,
    LoggerSlice {}

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

    // Podcast slice
    ...createPodcastSlice(set, get),

    // Authors slice
    ...createAuthorsSlice(set, get),

    // ApiSeries slice
    ...createSeriesSlice(set, get),

    // Player slice
    ...createPlayerSlice(set, get),

    // Home slice
    ...createHomeSlice(set, get),

    // LibraryItemDetails slice
    ...createLibraryItemDetailsSlice(set, get),

    // Settings slice
    ...createSettingsSlice(set, get),

    // UserProfile slice
    ...createUserProfileSlice(set, get),

    // Download slice
    ...createDownloadSlice(set, get),

    // Statistics slice
    ...createStatisticsSlice(set, get),

    // Network slice
    ...createNetworkSlice(set, get),

    // Logger slice
    ...createLoggerSlice(set, get),
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
  const selectedLibraryId = useAppStore((state) => state.library.selectedLibraryId);
  const selectedLibrary = useAppStore((state) => state.library.selectedLibrary);
  const libraries = useAppStore((state) => state.library.libraries);
  const items = useAppStore((state) => state.library.items);
  const sortConfig = useAppStore((state) => state.library.sortConfig);

  // Derive loading states from operation state machine
  const operationState = useAppStore((state) => state.library.operationState);
  const isLoadingLibraries = operationState === "REFRESHING_LIBRARIES";
  const isLoadingItems = operationState === "REFRESHING_ITEMS";
  const isSelectingLibrary = operationState === "SELECTING_LIBRARY";
  const isInitializing = useAppStore((state) => state.library.readinessState === "INITIALIZING");

  // Derive readiness flags from readiness state machine
  const readinessState = useAppStore((state) => state.library.readinessState);
  const initialized = readinessState !== "UNINITIALIZED";
  const ready = readinessState === "READY";

  // Actions (these don't change so we can get them once)
  const initialize = useAppStore((state) => state.initializeLibrarySlice);
  const selectLibrary = useAppStore((state) => state.selectLibrary);
  const refresh = useAppStore((state) => state.refresh);
  const setSortConfig = useAppStore((state) => state.setSortConfig);
  const reset = useAppStore((state) => state.resetLibrary);

  return React.useMemo(
    () => ({
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
    }),
    [
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
    ]
  );
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
  const initializeLibrary = useAppStore((state) => state.initializeLibrarySlice);
  const updateReadiness = useAppStore((state) => state._updateReadiness);
  const readinessState = useAppStore((state) => state.library.readinessState);
  const initialized = readinessState !== "UNINITIALIZED";

  // Initialize the store when dependencies are ready
  React.useEffect(() => {
    if (!initialized && (apiConfigured || dbInitialized)) {
      initializeLibrary(apiConfigured, dbInitialized);
    }
  }, [initializeLibrary, initialized, apiConfigured, dbInitialized]);

  // Update ready state when dependencies change
  React.useEffect(() => {
    updateReadiness(apiConfigured, dbInitialized);
  }, [updateReadiness, apiConfigured, dbInitialized]);
}

/**
 * Hook to use the podcast slice with automatic subscription management
 *
 * This hook provides a clean interface to the podcast slice, similar to the
 * existing library hook. It automatically handles subscriptions
 * and provides type-safe access to the podcast state and actions.
 *
 * @example
 * ```tsx
 * function PodcastComponent() {
 *   const {
 *     selectedPodcastLibrary,
 *     items,
 *     selectPodcastLibrary,
 *     refreshPodcasts
 *   } = usePodcasts();
 *
 *   // Use the store state and actions...
 * }
 * ```
 */
export function usePodcasts() {
  const selectedPodcastLibraryId = useAppStore(
    (state) => state.podcasts.selectedPodcastLibraryId
  );
  const selectedPodcastLibrary = useAppStore((state) => state.podcasts.selectedPodcastLibrary);
  const podcastLibraries = useAppStore((state) => state.podcasts.podcastLibraries);
  const items = useAppStore((state) => state.podcasts.items);
  const sortConfig = useAppStore((state) => state.podcasts.sortConfig);

  // Derive loading states from operation state machine
  const operationState = useAppStore((state) => state.podcasts.operationState);
  const isLoadingLibraries = operationState === "REFRESHING_LIBRARIES";
  const isLoadingItems = operationState === "REFRESHING_ITEMS";
  const isSelectingLibrary = operationState === "SELECTING_LIBRARY";
  const isInitializing = useAppStore((state) => state.podcasts.readinessState === "INITIALIZING");

  // Derive readiness flags from readiness state machine
  const readinessState = useAppStore((state) => state.podcasts.readinessState);
  const initialized = readinessState !== "UNINITIALIZED";
  const ready = readinessState === "READY";

  // Actions (these don't change so we can get them once)
  const initialize = useAppStore((state) => state.initializePodcastSlice);
  const selectPodcastLibrary = useAppStore((state) => state.selectPodcastLibrary);
  const refreshPodcasts = useAppStore((state) => state.refreshPodcasts);
  const setSortConfig = useAppStore((state) => state.setPodcastSortConfig);
  const reset = useAppStore((state) => state.resetPodcasts);

  return React.useMemo(
    () => ({
      selectedPodcastLibraryId,
      selectedPodcastLibrary,
      podcastLibraries,
      items,
      sortConfig,
      isLoadingLibraries,
      isLoadingItems,
      isSelectingLibrary,
      isInitializing,
      initialized,
      ready,
      initialize,
      selectPodcastLibrary,
      refreshPodcasts,
      setSortConfig,
      reset,
    }),
    [
      selectedPodcastLibraryId,
      selectedPodcastLibrary,
      podcastLibraries,
      items,
      sortConfig,
      isLoadingLibraries,
      isLoadingItems,
      isSelectingLibrary,
      isInitializing,
      initialized,
      ready,
      initialize,
      selectPodcastLibrary,
      refreshPodcasts,
      setSortConfig,
      reset,
    ]
  );
}

/**
 * Hook to get specific podcast state without subscribing to the entire slice
 *
 * This hook allows components to subscribe to only specific parts of the
 * podcast state, improving performance by preventing unnecessary re-renders.
 *
 * @example
 * ```tsx
 * // Only re-render when libraries change
 * const podcastLibraries = usePodcastState(state => state.podcastLibraries);
 *
 * // Only re-render when loading state changes
 * const isLoading = usePodcastState(state => state.operationState === "REFRESHING_ITEMS");
 * ```
 */
export function usePodcastState<T>(selector: (state: PodcastSlice) => T): T {
  return useAppStore(selector);
}

/**
 * Hook to get podcast actions without subscribing to state
 *
 * This hook provides access to podcast actions without subscribing to any state,
 * which is useful for components that only need to trigger actions.
 *
 * @example
 * ```tsx
 * function ActionButton() {
 *   const { selectPodcastLibrary, refreshPodcasts } = usePodcastActions();
 *
 *   return (
 *     <Button onPress={() => selectPodcastLibrary('library-id')}>
 *       Select Podcast Library
 *     </Button>
 *   );
 * }
 * ```
 */
export function usePodcastActions() {
  return useAppStore((state) => ({
    initialize: state.initializePodcastSlice,
    selectPodcastLibrary: state.selectPodcastLibrary,
    refreshPodcasts: state.refreshPodcasts,
    setSortConfig: state.setPodcastSortConfig,
    reset: state.resetPodcasts,
  }));
}

/**
 * Hook to initialize the podcast store
 *
 * This hook should be used in a provider component or at the app root
 * to initialize the podcast store when the API and database are ready.
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
 *   usePodcastStoreInitializer(apiConfigured, dbInitialized);
 *
 *   return <YourAppContent />;
 * }
 * ```
 */
export function usePodcastStoreInitializer(apiConfigured: boolean, dbInitialized: boolean) {
  const initializePodcasts = useAppStore((state) => state.initializePodcastSlice);
  const updateReadiness = useAppStore((state) => state._updatePodcastReadiness);
  const readinessState = useAppStore((state) => state.podcasts.readinessState);
  const initialized = readinessState !== "UNINITIALIZED";

  // Initialize the store when dependencies are ready
  React.useEffect(() => {
    if (!initialized && (apiConfigured || dbInitialized)) {
      initializePodcasts(apiConfigured, dbInitialized);
    }
  }, [initializePodcasts, initialized, apiConfigured, dbInitialized]);

  // Update ready state when dependencies change
  React.useEffect(() => {
    updateReadiness(apiConfigured, dbInitialized);
  }, [updateReadiness, apiConfigured, dbInitialized]);
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
  const authors = useAppStore((state) => state.authors.authors);
  const items = useAppStore((state) => state.authors.items);
  const sortConfig = useAppStore((state) => state.authors.sortConfig);
  const isLoadingItems = useAppStore((state) => state.authors.loading.isLoadingItems);
  const isInitializing = useAppStore((state) => state.authors.loading.isInitializing);
  const initialized = useAppStore((state) => state.authors.initialized);
  const ready = useAppStore((state) => state.authors.ready);

  // Actions (these don't change so we can get them once)
  const initialize = useAppStore((state) => state.initializeAuthors);
  const refetchAuthors = useAppStore((state) => state.refetchAuthors);
  const setSortConfig = useAppStore((state) => state.setAuthorsSortConfig);
  const reset = useAppStore((state) => state.resetAuthors);

  return React.useMemo(
    () => ({
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
    }),
    [
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
    ]
  );
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
  const series = useAppStore((state) => state.series.series);
  const items = useAppStore((state) => state.series.items);
  const sortConfig = useAppStore((state) => state.series.sortConfig);
  const isLoadingItems = useAppStore((state) => state.series.loading.isLoadingItems);
  const isInitializing = useAppStore((state) => state.series.loading.isInitializing);
  const initialized = useAppStore((state) => state.series.initialized);
  const ready = useAppStore((state) => state.series.ready);

  // Actions (these don't change so we can get them once)
  const initialize = useAppStore((state) => state.initializeSeries);
  const refetchSeries = useAppStore((state) => state.refetchSeries);
  const setSortConfig = useAppStore((state) => state.setSeriesSortConfig);
  const reset = useAppStore((state) => state.resetSeries);

  return React.useMemo(
    () => ({
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
    }),
    [
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
    ]
  );
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
 * Hook to use the player slice with automatic subscription management
 *
 * This hook provides a clean interface to the player slice state.
 * All player control actions should go through PlayerService directly.
 *
 * @example
 * ```tsx
 * function PlayerComponent() {
 *   const {
 *     currentTrack,
 *     isPlaying,
 *     position
 *   } = usePlayer();
 *
 *   // Use playerService for actions
 *   await playerService.playTrack(libraryItemId);
 * }
 * ```
 */
export function usePlayer() {
  const currentTrack = useAppStore((state) => state.player.currentTrack);
  const isPlaying = useAppStore((state) => state.player.isPlaying);
  const position = useAppStore((state) => state.player.position);
  const currentChapter = useAppStore((state) => state.player.currentChapter);
  const playbackRate = useAppStore((state) => state.player.playbackRate);
  const volume = useAppStore((state) => state.player.volume);
  const isModalVisible = useAppStore((state) => state.player.isModalVisible);
  const isLoadingTrack = useAppStore((state) => state.player.loading.isLoadingTrack);
  const isSeeking = useAppStore((state) => state.player.loading.isSeeking);
  const initialized = useAppStore((state) => state.player.initialized);

  // Only UI-only action
  const setModalVisible = useAppStore((state) => state.setModalVisible);

  return React.useMemo(
    () => ({
      currentTrack,
      isPlaying,
      position,
      currentChapter,
      playbackRate,
      volume,
      isModalVisible,
      isLoadingTrack,
      isSeeking,
      initialized,
      setModalVisible,
    }),
    [
      currentTrack,
      isPlaying,
      position,
      currentChapter,
      playbackRate,
      volume,
      isModalVisible,
      isLoadingTrack,
      isSeeking,
      initialized,
      setModalVisible,
    ]
  );
}

/**
 * Hook to get specific player state without subscribing to the entire slice
 *
 * @example
 * ```tsx
 * // Only re-render when current track changes
 * const currentTrack = usePlayerState(state => state.player.currentTrack);
 *
 * // Only re-render when playing state changes
 * const isPlaying = usePlayerState(state => state.player.isPlaying);
 * ```
 */
export function usePlayerState<T>(selector: (state: PlayerSlice) => T): T {
  return useAppStore(selector);
}

/**
 * Hook to get player actions without subscribing to state
 *
 * Note: Most player actions should go through PlayerService directly.
 * This hook only provides UI-only actions.
 *
 * @example
 * ```tsx
 * function PlayerModal() {
 *   const { setModalVisible } = usePlayerActions();
 *
 *   return (
 *     <Button onPress={() => setModalVisible(true)}>
 *       Open Player
 *     </Button>
 *   );
 * }
 * ```
 */
export function usePlayerActions() {
  return useAppStore((state) => ({
    setModalVisible: state.setModalVisible,
  }));
}

/**
 * Hook to initialize the player store
 *
 * This hook should be used in a provider component or at the app root
 * to initialize the player store when the app starts.
 *
 * @example
 * ```tsx
 * function App() {
 *   usePlayerStoreInitializer();
 *
 *   return <YourAppContent />;
 * }
 * ```
 */
export function usePlayerStoreInitializer() {
  const initializePlayer = useAppStore((state) => state.initializePlayerSlice);
  const initialized = useAppStore((state) => state.player.initialized);

  // Initialize the player store on mount
  React.useEffect(() => {
    if (!initialized) {
      initializePlayer();
    }
  }, [initializePlayer, initialized]);
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
  const initializeAuthors = useAppStore((state) => state.initializeAuthors);
  const setAuthorsReady = useAppStore((state) => state._setAuthorsReady);
  const initialized = useAppStore((state) => state.authors.initialized);

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
  const initializeSeries = useAppStore((state) => state.initializeSeries);
  const setSeriesReady = useAppStore((state) => state._setSeriesReady);
  const initialized = useAppStore((state) => state.series.initialized);

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
 * Hook to use the home slice with automatic subscription management
 *
 * @example
 * ```tsx
 * function HomeComponent() {
 *   const {
 *     continueListening,
 *     downloaded,
 *     listenAgain,
 *     refreshHome
 *   } = useHome();
 *
 *   // Use the store state and actions...
 * }
 * ```
 */
export function useHome() {
  const continueListening = useAppStore((state) => state.home.continueListening);
  const downloaded = useAppStore((state) => state.home.downloaded);
  const listenAgain = useAppStore((state) => state.home.listenAgain);
  const isLoadingHome = useAppStore((state) => state.home.loading.isLoadingHome);
  const initialized = useAppStore((state) => state.home.initialized);
  const lastFetchTime = useAppStore((state) => state.home.lastFetchTime);

  // Actions
  const initializeHome = useAppStore((state) => state.initializeHome);
  const refreshHome = useAppStore((state) => state.refreshHome);
  const refreshSection = useAppStore((state) => state.refreshSection);
  const resetHome = useAppStore((state) => state.resetHome);

  return React.useMemo(
    () => ({
      continueListening,
      downloaded,
      listenAgain,
      isLoadingHome,
      initialized,
      lastFetchTime,
      initializeHome,
      refreshHome,
      refreshSection,
      resetHome,
    }),
    [
      continueListening,
      downloaded,
      listenAgain,
      isLoadingHome,
      initialized,
      lastFetchTime,
      initializeHome,
      refreshHome,
      refreshSection,
      resetHome,
    ]
  );
}

/**
 * Hook to use the library item details slice
 *
 * @example
 * ```tsx
 * function ItemDetailComponent({ itemId }: { itemId: string }) {
 *   const { fetchItemDetails, getCachedItem } = useLibraryItemDetails();
 *
 *   // Use the store state and actions...
 * }
 * ```
 */
export function useLibraryItemDetails() {
  const itemsCache = useAppStore((state) => state.itemDetails.itemsCache);
  const loading = useAppStore((state) => state.itemDetails.loading);
  const initialized = useAppStore((state) => state.itemDetails.initialized);

  // Actions
  const fetchItemDetails = useAppStore((state) => state.fetchItemDetails);
  const refreshItemDetails = useAppStore((state) => state.refreshItemDetails);
  const updateItemProgress = useAppStore((state) => state.updateItemProgress);
  const invalidateItem = useAppStore((state) => state.invalidateItem);
  const getCachedItem = useAppStore((state) => state.getCachedItem);
  const resetItemDetails = useAppStore((state) => state.resetItemDetails);

  return React.useMemo(
    () => ({
      itemsCache,
      loading,
      initialized,
      fetchItemDetails,
      refreshItemDetails,
      updateItemProgress,
      invalidateItem,
      getCachedItem,
      resetItemDetails,
    }),
    [
      itemsCache,
      loading,
      initialized,
      fetchItemDetails,
      refreshItemDetails,
      updateItemProgress,
      invalidateItem,
      getCachedItem,
      resetItemDetails,
    ]
  );
}

/**
 * Hook to use the settings slice
 *
 * @example
 * ```tsx
 * function SettingsComponent() {
 *   const {
 *     jumpForwardInterval,
 *     updateJumpForwardInterval
 *   } = useSettings();
 *
 *   // Use the store state and actions...
 * }
 * ```
 */
export function useSettings() {
  const jumpForwardInterval = useAppStore((state) => state.settings.jumpForwardInterval);
  const jumpBackwardInterval = useAppStore((state) => state.settings.jumpBackwardInterval);
  const smartRewindEnabled = useAppStore((state) => state.settings.smartRewindEnabled);
  const homeLayout = useAppStore((state) => state.settings.homeLayout);
  const diagnosticsEnabled = useAppStore((state) => state.settings.diagnosticsEnabled);
  const showAllLibraries = useAppStore((state) => state.settings.showAllLibraries);
  const showAllPodcastLibraries = useAppStore((state) => state.settings.showAllPodcastLibraries);
  const initialized = useAppStore((state) => state.settings.initialized);
  const isLoading = useAppStore((state) => state.settings.isLoading);

  // Actions
  const initializeSettings = useAppStore((state) => state.initializeSettings);
  const updateJumpForwardInterval = useAppStore((state) => state.updateJumpForwardInterval);
  const updateJumpBackwardInterval = useAppStore((state) => state.updateJumpBackwardInterval);
  const updateSmartRewindEnabled = useAppStore((state) => state.updateSmartRewindEnabled);
  const updateHomeLayout = useAppStore((state) => state.updateHomeLayout);
  const updateDiagnosticsEnabled = useAppStore((state) => state.updateDiagnosticsEnabled);
  const updateShowAllLibraries = useAppStore((state) => state.updateShowAllLibraries);
  const updateShowAllPodcastLibraries = useAppStore(
    (state) => state.updateShowAllPodcastLibraries
  );
  const resetSettings = useAppStore((state) => state.resetSettings);

  return React.useMemo(
    () => ({
      jumpForwardInterval,
      jumpBackwardInterval,
      smartRewindEnabled,
      homeLayout,
      diagnosticsEnabled,
      showAllLibraries,
      showAllPodcastLibraries,
      initialized,
      isLoading,
      initializeSettings,
      updateJumpForwardInterval,
      updateJumpBackwardInterval,
      updateSmartRewindEnabled,
      updateHomeLayout,
      updateDiagnosticsEnabled,
      updateShowAllLibraries,
      updateShowAllPodcastLibraries,
      resetSettings,
    }),
    [
      jumpForwardInterval,
      jumpBackwardInterval,
      smartRewindEnabled,
      homeLayout,
      diagnosticsEnabled,
      showAllLibraries,
      showAllPodcastLibraries,
      initialized,
      isLoading,
      initializeSettings,
      updateJumpForwardInterval,
      updateJumpBackwardInterval,
      updateSmartRewindEnabled,
      updateHomeLayout,
      updateDiagnosticsEnabled,
      updateShowAllLibraries,
      updateShowAllPodcastLibraries,
      resetSettings,
    ]
  );
}

/**
 * Hook to use the user profile slice
 *
 * @example
 * ```tsx
 * function ProfileComponent() {
 *   const { deviceInfo, user } = useUserProfile();
 *
 *   // Use the store state and actions...
 * }
 * ```
 */
export function useUserProfile() {
  const deviceInfo = useAppStore((state) => state.userProfile.deviceInfo);
  const user = useAppStore((state) => state.userProfile.user);
  const serverInfo = useAppStore((state) => state.userProfile.serverInfo);
  const initialized = useAppStore((state) => state.userProfile.initialized);
  const isLoading = useAppStore((state) => state.userProfile.isLoading);

  // Actions
  const initializeUserProfile = useAppStore((state) => state.initializeUserProfile);
  const refreshDeviceInfo = useAppStore((state) => state.refreshDeviceInfo);
  const refreshServerInfo = useAppStore((state) => state.refreshServerInfo);
  const updateUser = useAppStore((state) => state.updateUser);
  const resetUserProfile = useAppStore((state) => state.resetUserProfile);

  return React.useMemo(
    () => ({
      deviceInfo,
      user,
      serverInfo,
      initialized,
      isLoading,
      initializeUserProfile,
      refreshDeviceInfo,
      refreshServerInfo,
      updateUser,
      resetUserProfile,
    }),
    [
      deviceInfo,
      user,
      serverInfo,
      initialized,
      isLoading,
      initializeUserProfile,
      refreshDeviceInfo,
      refreshServerInfo,
      updateUser,
      resetUserProfile,
    ]
  );
}

/**
 * Hook to use the downloads slice
 *
 * @example
 * ```tsx
 * function DownloadComponent({ itemId }: { itemId: string }) {
 *   const { activeDownloads, startDownload, isItemDownloaded } = useDownloads();
 *
 *   // Use the store state and actions...
 * }
 * ```
 */
export function useDownloads() {
  const activeDownloads = useAppStore((state) => state.downloads.activeDownloads);
  const downloadedItems = useAppStore((state) => state.downloads.downloadedItems);
  const initialized = useAppStore((state) => state.downloads.initialized);
  const isLoading = useAppStore((state) => state.downloads.isLoading);

  // Actions
  const initializeDownloads = useAppStore((state) => state.initializeDownloads);
  const startDownload = useAppStore((state) => state.startDownload);
  const updateDownloadProgress = useAppStore((state) => state.updateDownloadProgress);
  const completeDownload = useAppStore((state) => state.completeDownload);
  const removeActiveDownload = useAppStore((state) => state.removeActiveDownload);
  const deleteDownload = useAppStore((state) => state.deleteDownload);
  const isItemDownloaded = useAppStore((state) => state.isItemDownloaded);
  const getDownloadProgress = useAppStore((state) => state.getDownloadProgress);
  const resetDownloads = useAppStore((state) => state.resetDownloads);

  return React.useMemo(
    () => ({
      activeDownloads,
      downloadedItems,
      initialized,
      isLoading,
      initializeDownloads,
      startDownload,
      updateDownloadProgress,
      completeDownload,
      removeActiveDownload,
      deleteDownload,
      isItemDownloaded,
      getDownloadProgress,
      resetDownloads,
    }),
    [
      activeDownloads,
      downloadedItems,
      initialized,
      isLoading,
      initializeDownloads,
      startDownload,
      updateDownloadProgress,
      completeDownload,
      removeActiveDownload,
      deleteDownload,
      isItemDownloaded,
      getDownloadProgress,
      resetDownloads,
    ]
  );
}

/**
 * Hook to use the statistics slice
 *
 * @example
 * ```tsx
 * function StatsComponent() {
 *   const { counts, refreshStatistics } = useStatistics();
 *
 *   // Use the store state and actions...
 * }
 * ```
 */
export function useStatistics() {
  const counts = useAppStore((state) => state.statistics.counts);
  const storageStats = useAppStore((state) => state.statistics.storageStats);
  const lastUpdated = useAppStore((state) => state.statistics.lastUpdated);
  const isLoading = useAppStore((state) => state.statistics.isLoading);
  const initialized = useAppStore((state) => state.statistics.initialized);

  // Actions
  const refreshStatistics = useAppStore((state) => state.refreshStatistics);
  const refreshStorageStats = useAppStore((state) => state.refreshStorageStats);
  const invalidateCache = useAppStore((state) => state.invalidateCache);
  const isCacheValid = useAppStore((state) => state.isCacheValid);
  const resetStatistics = useAppStore((state) => state.resetStatistics);

  return React.useMemo(
    () => ({
      counts,
      storageStats,
      lastUpdated,
      isLoading,
      initialized,
      refreshStatistics,
      refreshStorageStats,
      invalidateCache,
      isCacheValid,
      resetStatistics,
    }),
    [
      counts,
      storageStats,
      lastUpdated,
      isLoading,
      initialized,
      refreshStatistics,
      refreshStorageStats,
      invalidateCache,
      isCacheValid,
      resetStatistics,
    ]
  );
}

/**
 * Hook to initialize the home store
 */
export function useHomeStoreInitializer(userId: string | null) {
  const initializeHome = useAppStore((state) => state.initializeHome);
  const initialized = useAppStore((state) => state.home.initialized);

  React.useEffect(() => {
    if (userId && !initialized) {
      initializeHome(userId).catch((error) => {
        console.error("[useHomeStoreInitializer] Failed to initialize home", error);
      });
    }
  }, [initializeHome, initialized, userId]);
}

/**
 * Hook to initialize the settings store
 */
export function useSettingsStoreInitializer() {
  const initializeSettings = useAppStore((state) => state.initializeSettings);
  const initialized = useAppStore((state) => state.settings.initialized);

  React.useEffect(() => {
    if (!initialized) {
      initializeSettings().catch((error) => {
        console.error("[useSettingsStoreInitializer] Failed to initialize settings", error);
      });
    }
  }, [initializeSettings, initialized]);
}

/**
 * Hook to initialize the user profile store
 */
export function useUserProfileStoreInitializer(username: string | null) {
  const initializeUserProfile = useAppStore((state) => state.initializeUserProfile);
  const initialized = useAppStore((state) => state.userProfile.initialized);

  React.useEffect(() => {
    if (username && !initialized) {
      initializeUserProfile(username).catch((error) => {
        console.error("[useUserProfileStoreInitializer] Failed to initialize user profile", error);
      });
    }
  }, [initializeUserProfile, initialized, username]);
}

/**
 * Hook to initialize the downloads store
 */
export function useDownloadsStoreInitializer() {
  const initializeDownloads = useAppStore((state) => state.initializeDownloads);
  const initialized = useAppStore((state) => state.downloads.initialized);

  React.useEffect(() => {
    if (!initialized) {
      initializeDownloads().catch((error) => {
        console.error("[useDownloadsStoreInitializer] Failed to initialize downloads", error);
      });
    }
  }, [initializeDownloads, initialized]);
}

/**
 * Hook to use the network slice
 *
 * @example
 * ```tsx
 * function NetworkIndicator() {
 *   const { isConnected, isInternetReachable } = useNetwork();
 *
 *   return <Text>{isConnected ? 'Online' : 'Offline'}</Text>;
 * }
 * ```
 */
export function useNetwork() {
  const isConnected = useAppStore((state) => state.network.isConnected);
  const isInternetReachable = useAppStore((state) => state.network.isInternetReachable);
  const serverReachable = useAppStore((state) => state.network.serverReachable);
  const connectionType = useAppStore((state) => state.network.connectionType);
  const initialized = useAppStore((state) => state.network.initialized);
  const lastServerCheck = useAppStore((state) => state.network.lastServerCheck);

  // Actions
  const initializeNetwork = useAppStore((state) => state.initializeNetwork);
  const refreshNetworkStatus = useAppStore((state) => state.refreshNetworkStatus);
  const checkServerReachability = useAppStore((state) => state.checkServerReachability);
  const resetNetwork = useAppStore((state) => state.resetNetwork);

  return React.useMemo(
    () => ({
      isConnected,
      isInternetReachable,
      serverReachable,
      connectionType,
      initialized,
      lastServerCheck,
      initializeNetwork,
      refreshNetworkStatus,
      checkServerReachability,
      resetNetwork,
    }),
    [
      isConnected,
      isInternetReachable,
      serverReachable,
      connectionType,
      initialized,
      lastServerCheck,
      initializeNetwork,
      refreshNetworkStatus,
      checkServerReachability,
      resetNetwork,
    ]
  );
}

/**
 * Hook to initialize the network store
 */
export function useNetworkStoreInitializer() {
  const initializeNetwork = useAppStore((state) => state.initializeNetwork);
  const initialized = useAppStore((state) => state.network.initialized);

  React.useEffect(() => {
    if (!initialized) {
      initializeNetwork();
    }
  }, [initializeNetwork, initialized]);
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
  return useAppStore((state) => state);
}
