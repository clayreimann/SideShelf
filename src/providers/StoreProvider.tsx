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
  useNetworkStoreInitializer,
  usePlayerStoreInitializer,
  useSeriesStoreInitializer,
  useSettingsStoreInitializer,
  useUserProfileStoreInitializer,
} from "@/stores";
import React from "react";
import { useAuth } from "./AuthProvider";
import { useDb } from "./DbProvider";

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, username } = useAuth();
  const { initialized: dbInitialized } = useDb();

  // Initialize all stores
  // Note: isAuthenticated indicates we have valid API credentials
  useLibraryStoreInitializer(isAuthenticated, dbInitialized);
  useAuthorsStoreInitializer(isAuthenticated, dbInitialized);
  useSeriesStoreInitializer(isAuthenticated, dbInitialized);
  usePlayerStoreInitializer(); // Player doesn't need API/DB dependencies
  useSettingsStoreInitializer(); // Settings are independent
  useDownloadsStoreInitializer(); // Downloads are independent
  useNetworkStoreInitializer(); // Network monitoring is independent
  useUserProfileStoreInitializer(username); // User profile needs username
  useHomeStoreInitializer(username ? username : null); // Home needs userId (username)

  return <>{children}</>;
}
