/**
 * Store Provider - Initializes all Zustand stores
 *
 * This provider initializes all the application stores when the API and database are ready.
 * It should be used at the app root to ensure stores are properly initialized.
 */

import {
    useAuthorsStoreInitializer,
    useDownloadsStoreInitializer,
    useHomeStoreInitializer,
    useLibraryStoreInitializer,
    usePlayerStoreInitializer,
    usePodcastStoreInitializer,
    useSeriesStoreInitializer,
    useSettingsStoreInitializer,
    useUserProfileStoreInitializer
} from '@/stores';
import React from 'react';
import { useAuth } from './AuthProvider';
import { useDb } from './DbProvider';

export function StoreProvider({ children }: { children: React.ReactNode }) {
    const { apiConfigured, username } = useAuth();
    const { initialized: dbInitialized } = useDb();

    // Initialize all stores
    useLibraryStoreInitializer(apiConfigured, dbInitialized);
    usePodcastStoreInitializer(apiConfigured, dbInitialized);
    useAuthorsStoreInitializer(apiConfigured, dbInitialized);
    useSeriesStoreInitializer(apiConfigured, dbInitialized);
    usePlayerStoreInitializer(); // Player doesn't need API/DB dependencies
    useSettingsStoreInitializer(); // Settings are independent
    useDownloadsStoreInitializer(); // Downloads are independent
    useUserProfileStoreInitializer(username); // User profile needs username
    useHomeStoreInitializer(username ? username : null); // Home needs userId (username)

    return <>{children}</>;
}
