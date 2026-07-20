import { logger } from "@/lib/logger";
import { useAuth } from "@/providers/AuthProvider";
import { progressSyncWorker, type ProgressSyncTrigger } from "@/services/ProgressSyncWorker";
import { serverProgressRefreshService } from "@/services/ServerProgressRefreshService";
import { useNetwork } from "@/stores/appStore";
import React, { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

const log = logger.forTag("ProgressSyncProvider");

type ConfirmedIdentity = { authStatus: string; userId: string | null };

/** Owns authenticated progress delivery and server-to-local recovery in the UI context. */
export function ProgressSyncProvider({ children }: { children?: React.ReactNode }) {
  const { authStatus, userId } = useAuth();
  const { initialized: networkInitialized, isConnected } = useNetwork();
  const identityRef = useRef<ConfirmedIdentity>({ authStatus, userId });
  identityRef.current = { authStatus, userId };
  const previousConnected = useRef(isConnected);

  const recover = useCallback(async (trigger: ProgressSyncTrigger, expectedUserId: string) => {
    const identity = identityRef.current;
    if (identity.authStatus !== "authenticated" || identity.userId !== expectedUserId) return;

    progressSyncWorker.requestDrain(trigger);
    try {
      await progressSyncWorker.drainNow();
      const currentIdentity = identityRef.current;
      if (
        currentIdentity.authStatus !== "authenticated" ||
        currentIdentity.userId !== expectedUserId
      ) {
        return;
      }
      await serverProgressRefreshService.refreshAll();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn(`[recover] ${trigger} recovery failed: ${message}`);
    }
  }, []);

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
