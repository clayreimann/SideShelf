/**
 * Secure storage utilities
 *
 * This module provides access to secure storage for sensitive data like tokens.
 */

import * as SecureStore from "expo-secure-store";
import { ASYNC_KEYS, getItem as getAsyncItem, saveItem as saveAsyncItem } from "@/lib/asyncStore";

export const SECURE_KEYS = {
  serverUrl: "abs.serverUrl",
  accessToken: "abs.accessToken",
  refreshToken: "abs.refreshToken",
  username: "abs.username",
} as const;

export type SecureKeyType = (typeof SECURE_KEYS)[keyof typeof SECURE_KEYS];

export async function saveItem(key: SecureKeyType, value: string | null): Promise<void> {
  try {
    if (value === null) {
      await SecureStore.deleteItemAsync(key);
    } else {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    }
  } catch (error) {
    console.error(`[secureStore] Failed to save item ${key}:`, error);
    throw error;
  }
}

export async function getItem(key: SecureKeyType): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.error(`[secureStore] Failed to get item ${key}:`, error);
    return null;
  }
}

export async function persistUsername(username: string | null): Promise<void> {
  await Promise.all([
    saveItem(SECURE_KEYS.username, username),
    saveAsyncItem(ASYNC_KEYS.username, username),
  ]);
}

export async function getStoredUsername(): Promise<string | null> {
  const secureUsername = await getItem(SECURE_KEYS.username);
  if (secureUsername) {
    return secureUsername;
  }

  const fallback = await getAsyncItem(ASYNC_KEYS.username);
  return typeof fallback === "string" ? fallback : null;
}

/**
 * Clear all secure storage except for server URL
 * Used when resetting the app while preserving server connection
 */
export async function clearAllSecureStorageExceptServerUrl(): Promise<void> {
  console.log("[secureStore] Clearing all secure storage except serverUrl...");
  const keysToDelete: SecureKeyType[] = [
    SECURE_KEYS.accessToken,
    SECURE_KEYS.refreshToken,
    SECURE_KEYS.username,
  ];

  await Promise.all(keysToDelete.map((key) => saveItem(key, null)));
  console.log("[secureStore] Secure storage cleared (except serverUrl)");
}
