import { logger } from "@/lib/logger";
import { useAuth } from "@/providers/AuthProvider";
import { useAppStore, useNetwork } from "@/stores/appStore";
import React, { useEffect } from "react";

const log = logger.forTag("BookmarkSyncProvider");

/** Owns pending bookmark delivery for the confirmed authenticated identity. */
export function BookmarkSyncProvider({ children }: { children?: React.ReactNode }) {
  const { authStatus, userId } = useAuth();
  const { initialized: networkInitialized, isConnected, isInternetReachable } = useNetwork();
  const activeUserId = useAppStore((state) => state.userProfile.activeUserId);
  const drainPendingBookmarkOps = useAppStore((state) => state.drainPendingBookmarkOps);

  useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      userId === null ||
      activeUserId !== userId ||
      !networkInitialized ||
      !isConnected ||
      isInternetReachable === false
    ) {
      return;
    }

    void drainPendingBookmarkOps().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      log.warn(`[BookmarkSyncProvider] pending bookmark drain failed: ${message}`);
    });
  }, [
    activeUserId,
    authStatus,
    drainPendingBookmarkOps,
    isConnected,
    isInternetReachable,
    networkInitialized,
    userId,
  ]);

  return <>{children}</>;
}
