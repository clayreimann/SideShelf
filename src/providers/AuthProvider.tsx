import { extractTokensFromAuthResponse } from "@/db/helpers/tokens";
import { getUserByUsername, marshalUserFromAuthResponse, upsertUser } from "@/db/helpers/users";
import {
  marshalMediaProgressFromAuthResponse,
  upsertMediaProgress,
} from "@/db/helpers/mediaProgress";
import { wipeUserData } from "@/db/helpers/wipeUserData";
import { useAppStore } from "@/stores/appStore";
import { login as doLogin } from "@/lib/api/endpoints";
import { getStoredUsername, persistUsername } from "@/lib/secureStore";
import { logger } from "@/lib/logger";
import { useDb } from "@/providers/DbProvider";
import { apiClientService } from "@/services/ApiClientService";
import type { AuthStatus } from "@/types/auth";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const log = logger.forTag("AuthProvider");

// Module-level promise that resolves when auth is initialized.
// Used by RootLayout to hold the splash screen until auth state is known,
// preventing the login screen flash when already authenticated.
let _onAuthInitialized: (() => void) | null = null;
export const authInitializedPromise = new Promise<void>((resolve) => {
  _onAuthInitialized = resolve;
});

type AuthState = {
  serverUrl: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  username: string | null;
  userId: string | null;
  identityConfirmed: boolean;
};

export type { AuthStatus } from "@/types/auth";

type AuthContextValue = {
  initialized: boolean;
  authStatus: AuthStatus;
  isAuthenticated: boolean;
  serverUrl: string | null;
  username: string | null;
  userId: string | null;
  setServerUrl: (url: string) => Promise<void>;
  login: (params: { serverUrl: string; username: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { initialized: dbInitialized } = useDb();
  const [state, setState] = useState<AuthState>({
    serverUrl: null,
    accessToken: null,
    refreshToken: null,
    username: null,
    userId: null,
    identityConfirmed: false,
  });
  const [initialized, setInitialized] = useState(false);
  const explicitLogoutInProgress = useRef(false);

  // Initialize API client service and load credentials
  useEffect(() => {
    (async () => {
      if (!dbInitialized) return;

      // Initialize API client service and load username concurrently (both read from secure storage)
      const [, username] = await Promise.all([apiClientService.initialize(), getStoredUsername()]);
      await persistUsername(username);

      // Load userId from DB if username is present
      let userId: string | null = null;
      if (username) {
        const user = await getUserByUsername(username);
        userId = user?.id ?? null;
      }

      // Sync local state from ApiClientService
      setState({
        serverUrl: apiClientService.getBaseUrl(),
        accessToken: apiClientService.getAccessToken(),
        refreshToken: apiClientService.getRefreshToken(),
        username,
        userId,
        identityConfirmed: Boolean(
          apiClientService.getBaseUrl() && apiClientService.getAccessToken() && username && userId
        ),
      });

      setInitialized(true);
      _onAuthInitialized?.();
    })();
  }, [dbInitialized]);

  // Subscribe to auth state changes from ApiClientService
  useEffect(() => {
    const unsubscribe = apiClientService.subscribe(() => {
      log.debug("[subscription] Auth state changed, syncing credentials");

      setState((prev: AuthState) => ({
        ...prev,
        serverUrl: apiClientService.getBaseUrl(),
        accessToken: apiClientService.getAccessToken(),
        refreshToken: apiClientService.getRefreshToken(),
        username: explicitLogoutInProgress.current ? null : prev.username,
        userId: explicitLogoutInProgress.current ? null : prev.userId,
        identityConfirmed: explicitLogoutInProgress.current ? false : prev.identityConfirmed,
      }));
    });

    return unsubscribe;
  }, []);

  const authStatus = useMemo<AuthStatus>(() => {
    if (!initialized) return "initializing";
    if (
      state.identityConfirmed &&
      state.serverUrl &&
      state.accessToken &&
      state.username &&
      state.userId
    ) {
      return "authenticated";
    }
    if (state.serverUrl && state.username && state.userId) return "reauthRequired";
    return "signedOut";
  }, [
    initialized,
    state.accessToken,
    state.identityConfirmed,
    state.serverUrl,
    state.userId,
    state.username,
  ]);
  const isAuthenticated = authStatus === "authenticated";

  const clearUserData = useCallback(async () => {
    const store = useAppStore.getState();
    store.resetLibrary();
    store.resetSeries();
    store.resetAuthors();
    store.resetItemDetails();
    store.resetUserProfile();
    store.resetHome();
    await wipeUserData();
  }, []);

  const clearCredentials = useCallback(async () => {
    const results = await Promise.allSettled([
      apiClientService.clearTokens(),
      persistUsername(null),
    ]);
    for (const result of results) {
      if (result.status === "rejected") {
        const message =
          result.reason instanceof Error ? result.reason.message : String(result.reason);
        log.warn(
          `[clearCredentials] Secure persistence failed after in-memory sign-out: ${message}`
        );
      }
    }
  }, []);

  const setServerUrl = useCallback(
    async (url: string) => {
      const normalized = url.trim().replace(/\/$/, "");
      const changingServer = Boolean(state.serverUrl && state.serverUrl !== normalized);
      if (changingServer) {
        setState((prev) => ({
          ...prev,
          accessToken: null,
          refreshToken: null,
          username: null,
          userId: null,
          identityConfirmed: false,
        }));
        explicitLogoutInProgress.current = true;
        try {
          await clearCredentials();
          await clearUserData();
        } finally {
          explicitLogoutInProgress.current = false;
        }
      }
      await apiClientService.setBaseUrl(normalized);
    },
    [clearCredentials, clearUserData, state.serverUrl]
  );

  const login = useCallback(
    async ({
      serverUrl,
      username,
      password,
    }: {
      serverUrl: string;
      username: string;
      password: string;
    }) => {
      const base = serverUrl.trim().replace(/\/$/, "");

      // A token callback must never combine fresh credentials with a retained old identity.
      setState((prev) => ({
        ...prev,
        accessToken: null,
        refreshToken: null,
        identityConfirmed: false,
      }));

      let userDataCleared = Boolean(state.serverUrl && state.serverUrl !== base);
      await setServerUrl(base);

      if (!userDataCleared && state.username && state.username !== username) {
        explicitLogoutInProgress.current = true;
        try {
          await clearCredentials();
          await clearUserData();
          userDataCleared = true;
        } finally {
          explicitLogoutInProgress.current = false;
        }
      }

      try {
        let response = await doLogin(base, username, password);
        const { accessToken, refreshToken } = extractTokensFromAuthResponse(response);
        if (!accessToken) {
          throw new Error("Missing token in response");
        }

        const user = marshalUserFromAuthResponse(response);
        if (!user?.id) throw new Error("Missing user identity in response");
        const mediaProgress = marshalMediaProgressFromAuthResponse(response.user);

        if (!userDataCleared && state.userId && state.userId !== user.id) {
          explicitLogoutInProgress.current = true;
          try {
            await clearCredentials();
            await clearUserData();
          } finally {
            explicitLogoutInProgress.current = false;
          }
        }

        // Durable identity precedes token publication, so subscriptions cannot expose a
        // fresh token paired with null or stale user state.
        await Promise.all([
          persistUsername(username),
          upsertUser(user),
          upsertMediaProgress(mediaProgress),
        ]);
        await apiClientService.setTokens(accessToken, refreshToken, username);

        setState({
          serverUrl: base,
          accessToken,
          refreshToken,
          username,
          userId: user.id,
          identityConfirmed: true,
        });
      } catch (e) {
        log.error("[login] Login failed", e as Error);
        throw new Error(e instanceof Error ? e.message : "Login failed");
      }
    },
    [clearCredentials, clearUserData, setServerUrl, state.serverUrl, state.userId, state.username]
  );

  const logout = useCallback(async () => {
    explicitLogoutInProgress.current = true;
    setState((s: AuthState) => ({
      ...s,
      accessToken: null,
      refreshToken: null,
      username: null,
      userId: null,
      identityConfirmed: false,
    }));
    try {
      await clearCredentials();
    } finally {
      explicitLogoutInProgress.current = false;
    }
    await clearUserData();
  }, [clearCredentials, clearUserData]);

  const value = useMemo<AuthContextValue>(
    () => ({
      initialized,
      authStatus,
      isAuthenticated,
      serverUrl: state.serverUrl,
      username: state.username,
      userId: state.userId,
      setServerUrl,
      login,
      logout,
    }),
    [
      initialized,
      authStatus,
      isAuthenticated,
      state.serverUrl,
      state.username,
      state.userId,
      setServerUrl,
      login,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
