/**
 * Store Provider - Initializes all Zustand stores
 *
 * This provider initializes all the application stores when the API and database are ready.
 * It should be used at the app root to ensure stores are properly initialized.
 */

import {
    useAuthorsStoreInitializer,
    useLibraryStoreInitializer,
    useSeriesStoreInitializer
} from '@/stores';
import React from 'react';
import { useAuth } from './AuthProvider';
import { useDb } from './DbProvider';

export function StoreProvider({ children }: { children: React.ReactNode }) {
    const { apiConfigured } = useAuth();
    const { initialized: dbInitialized } = useDb();

    // Initialize all stores
    useLibraryStoreInitializer(apiConfigured, dbInitialized);
    useAuthorsStoreInitializer(apiConfigured, dbInitialized);
    useSeriesStoreInitializer(apiConfigured, dbInitialized);

    return <>{children}</>;
}
