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
import { useDb } from "@/providers/DbProvider";
import { progressService } from "@/services/ProgressService";
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
import { AppState, AppStateStatus } from "react-native";

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
      });

      setInitialized(true);
      _onAuthInitialized?.();
    })();
  }, [dbInitialized]);

  // Subscribe to auth state changes from ApiClientService
  useEffect(() => {
    const unsubscribe = apiClientService.subscribe(() => {
      console.log("[AuthProvider] Auth state changed, syncing state");

      setState((prev: AuthState) => ({
        ...prev,
        serverUrl: apiClientService.getBaseUrl(),
        accessToken: apiClientService.getAccessToken(),
        refreshToken: apiClientService.getRefreshToken(),
        username: explicitLogoutInProgress.current ? null : prev.username,
        userId: explicitLogoutInProgress.current ? null : prev.userId,
      }));
    });

    return unsubscribe;
  }, []);

  const authStatus = useMemo<AuthStatus>(() => {
    if (!initialized) return "initializing";
    if (state.serverUrl && state.accessToken) return "authenticated";
    if (state.serverUrl && state.username && state.userId) return "reauthRequired";
    return "signedOut";
  }, [initialized, state.accessToken, state.serverUrl, state.userId, state.username]);
  const isAuthenticated = authStatus === "authenticated";

  // Handle app state changes for progress syncing
  useEffect(() => {
    if (!isAuthenticated || !state.username) return;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        console.log("[AuthProvider] App became active");
        // Sync progress when app becomes active
        progressService.fetchServerProgress().catch((error) => {
          console.error("[AuthProvider] Failed to sync progress on app foreground:", error);
        });
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, [isAuthenticated, state.username]);

  const setServerUrl = useCallback(async (url: string) => {
    await apiClientService.setBaseUrl(url);
    // State will be updated via subscription
    // Clear all user-specific slice state and DB data when switching servers
    void (async () => {
      useAppStore.getState().resetLibrary();
      useAppStore.getState().resetSeries();
      useAppStore.getState().resetAuthors();
      useAppStore.getState().resetItemDetails();
      useAppStore.getState().resetUserProfile();
      useAppStore.getState().resetHome();
      await wipeUserData();
    })();
  }, []);

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

      // Set server URL
      await apiClientService.setBaseUrl(base);

      try {
        let response = await doLogin(base, username, password);
        const { accessToken, refreshToken } = extractTokensFromAuthResponse(response);
        if (!accessToken) {
          throw new Error("Missing token in response");
        }

        // Update tokens in ApiClientService.
        // Servers older than Audiobookshelf v2.26 return only an access
        // token from /login with no refresh token (see
        // extractTokensFromAuthResponse in src/db/helpers/tokens.ts, which
        // models this by returning refreshToken: null). Rather than reject
        // the login, we support token-only auth (option b): store the
        // access token with no refresh token. A later 401 will find no
        // refresh token in ApiClientService.performTokenRefresh and
        // terminate the session (clearTokens) instead of attempting to
        // refresh — the user sees "Session expired" and must log in again.
        await apiClientService.setTokens(accessToken, refreshToken, username);

        // Persist username separately
        await persistUsername(username);

        const user = marshalUserFromAuthResponse(response);

        // Update local state — include userId from the login response
        setState((prev: AuthState) => ({
          ...prev,
          username,
          userId: user?.id ?? null,
        }));
        const mediaProgress = marshalMediaProgressFromAuthResponse(response.user);

        await Promise.all([upsertUser(user), upsertMediaProgress(mediaProgress)]);

        // Start periodic progress sync now that a user is authenticated (idempotent —
        // no-op if app init already started it)
        progressService.initialize();
      } catch (e) {
        console.error("[AuthProvider] Login error", e);
        throw new Error(e instanceof Error ? e.message : "Login failed");
      }
    },
    []
  );

  const logout = useCallback(async () => {
    // Stop periodic progress sync and drop cached session state (idempotent)
    progressService.shutdown();
    explicitLogoutInProgress.current = true;
    setState((s: AuthState) => ({
      ...s,
      accessToken: null,
      refreshToken: null,
      username: null,
      userId: null,
    }));
    try {
      await Promise.all([apiClientService.clearTokens(), persistUsername(null)]);
    } finally {
      explicitLogoutInProgress.current = false;
    }
    // Token state will be updated via subscription
    // Clear all user-specific slice state and DB data in background (do not await)
    void (async () => {
      useAppStore.getState().resetLibrary();
      useAppStore.getState().resetSeries();
      useAppStore.getState().resetAuthors();
      useAppStore.getState().resetItemDetails();
      useAppStore.getState().resetUserProfile();
      useAppStore.getState().resetHome();
      await wipeUserData();
    })();
  }, []);

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
