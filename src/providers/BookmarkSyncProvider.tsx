import { logger } from "@/lib/logger";
import { useAuth } from "@/providers/AuthProvider";
import { useAppStore, useNetwork } from "@/stores/appStore";
import React, { useEffect, useLayoutEffect, useRef } from "react";

const log = logger.forTag("BookmarkSyncProvider");

type ConfirmedIdentity = {
  authStatus: string;
  userId: string | null;
  serverUrl: string | null;
};

/** Owns pending bookmark delivery for the confirmed authenticated identity. */
export function BookmarkSyncProvider({ children }: { children?: React.ReactNode }) {
  const { authStatus, userId, serverUrl } = useAuth();
  const { initialized: networkInitialized, isConnected, isInternetReachable } = useNetwork();
  const activeUserId = useAppStore((state) => state.userProfile.activeUserId);
  const drainPendingBookmarkOps = useAppStore((state) => state.drainPendingBookmarkOps);
  const identityRef = useRef<ConfirmedIdentity>({ authStatus, userId, serverUrl });
  const identityGenerationRef = useRef(0);

  // Invalidate deferred drain continuations before passive effects can start a new generation.
  useLayoutEffect(() => {
    const previousIdentity = identityRef.current;
    if (
      previousIdentity.authStatus !== authStatus ||
      previousIdentity.userId !== userId ||
      previousIdentity.serverUrl !== serverUrl
    ) {
      identityGenerationRef.current += 1;
    }
    identityRef.current = { authStatus, userId, serverUrl };
  }, [authStatus, serverUrl, userId]);

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

    const expectedGeneration = identityGenerationRef.current;
    const expectedUserId = userId;
    const expectedServerUrl = serverUrl;
    const canContinue = () => {
      const identity = identityRef.current;
      return (
        identityGenerationRef.current === expectedGeneration &&
        identity.authStatus === "authenticated" &&
        identity.userId === expectedUserId &&
        identity.serverUrl === expectedServerUrl
      );
    };

    void drainPendingBookmarkOps(canContinue).catch((error: unknown) => {
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
    serverUrl,
    userId,
  ]);

  return <>{children}</>;
}
