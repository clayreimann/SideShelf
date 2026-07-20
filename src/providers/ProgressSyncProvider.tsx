import { logger } from "@/lib/logger";
import { useAuth } from "@/providers/AuthProvider";
import {
  progressSyncWorker,
  type AwaitableProgressSyncTrigger,
} from "@/services/ProgressSyncWorker";
import { serverProgressRefreshService } from "@/services/ServerProgressRefreshService";
import { useNetwork } from "@/stores/appStore";
import React, { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

const log = logger.forTag("ProgressSyncProvider");

type ConfirmedIdentity = { authStatus: string; userId: string | null };

/** Owns authenticated progress delivery and server-to-local recovery in the UI context. */
export function ProgressSyncProvider({ children }: { children?: React.ReactNode }) {
  const { authStatus, userId } = useAuth();
  const { initialized: networkInitialized, isConnected } = useNetwork();
  const identityRef = useRef<ConfirmedIdentity>({ authStatus, userId });
  const identityGenerationRef = useRef(0);
  const previousConnected = useRef(isConnected);

  // Commit identity invalidation before any deferred fetch/drain continuation can mutate data.
  useLayoutEffect(() => {
    const previousIdentity = identityRef.current;
    if (previousIdentity.authStatus !== authStatus || previousIdentity.userId !== userId) {
      identityGenerationRef.current += 1;
    }
    identityRef.current = { authStatus, userId };
  }, [authStatus, userId]);

  const recover = useCallback(
    async (trigger: AwaitableProgressSyncTrigger, expectedUserId: string) => {
      const identity = identityRef.current;
      if (identity.authStatus !== "authenticated" || identity.userId !== expectedUserId) return;
      const expectedGeneration = identityGenerationRef.current;

      try {
        await progressSyncWorker.requestDrainAndWait(trigger);
        const currentIdentity = identityRef.current;
        if (
          identityGenerationRef.current !== expectedGeneration ||
          currentIdentity.authStatus !== "authenticated" ||
          currentIdentity.userId !== expectedUserId
        ) {
          return;
        }
        await serverProgressRefreshService.refreshAll(
          () =>
            identityGenerationRef.current === expectedGeneration &&
            identityRef.current.authStatus === "authenticated" &&
            identityRef.current.userId === expectedUserId
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn(`[recover] ${trigger} recovery failed: ${message}`);
      }
    },
    []
  );

  useEffect(() => {
    if (authStatus !== "authenticated" || !userId) {
      progressSyncWorker.stop();
      return;
    }

    progressSyncWorker.start(userId);
    void recover("authentication", userId);

    return () => {
      progressSyncWorker.stop();
    };
  }, [authStatus, recover, userId]);

  useEffect(() => {
    if (authStatus !== "authenticated" || !userId) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") void recover("foreground", userId);
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [authStatus, recover, userId]);

  useEffect(() => {
    const wasConnected = previousConnected.current;
    previousConnected.current = isConnected;
    if (
      networkInitialized &&
      !wasConnected &&
      isConnected &&
      authStatus === "authenticated" &&
      userId
    ) {
      void recover("network", userId);
    }
  }, [authStatus, isConnected, networkInitialized, recover, userId]);

  return <>{children}</>;
}
