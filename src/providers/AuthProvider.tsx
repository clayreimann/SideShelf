import { authHelpers, mediaProgressHelpers, userHelpers } from "@/db/helpers";
import { login as doLogin } from "@/lib/api/endpoints";
import { getStoredUsername, persistUsername } from "@/lib/secureStore";
import { useDb } from "@/providers/DbProvider";
import { progressService } from "@/services/ProgressService";
import { apiClientService } from "@/services/ApiClientService";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState, AppStateStatus } from "react-native";

type AuthState = {
  serverUrl: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  username: string | null;
  loginMessage?: string;
};

type AuthContextValue = {
  initialized: boolean;
  isAuthenticated: boolean;
  serverUrl: string | null;
  username: string | null;
  loginMessage?: string;
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
  });
  const [initialized, setInitialized] = useState(false);

  // Initialize API client service and load credentials
  useEffect(() => {
    (async () => {
      if (!dbInitialized) return;

      // Initialize API client service (loads from secure storage)
      await apiClientService.initialize();

      // Load username separately (it's not in ApiClientService)
      const username = await getStoredUsername();
      await persistUsername(username);

      // Sync local state from ApiClientService
      setState({
        serverUrl: apiClientService.getBaseUrl(),
        accessToken: apiClientService.getAccessToken(),
        refreshToken: apiClientService.getRefreshToken(),
        username,
      });

      setInitialized(true);
    })();
  }, [dbInitialized]);

  // Subscribe to auth state changes from ApiClientService
  useEffect(() => {
    const unsubscribe = apiClientService.subscribe(() => {
      console.log("[AuthProvider] Auth state changed, syncing state");
      const wasAuthenticated = state.accessToken !== null;
      const isNowAuthenticated = apiClientService.getAccessToken() !== null;

      setState((prev: AuthState) => ({
        ...prev,
        serverUrl: apiClientService.getBaseUrl(),
        accessToken: apiClientService.getAccessToken(),
        refreshToken: apiClientService.getRefreshToken(),
        // If we went from authenticated to not authenticated, show session expired
        loginMessage:
          wasAuthenticated && !isNowAuthenticated ? "Session expired" : prev.loginMessage,
      }));
    });

    return unsubscribe;
  }, [state.accessToken]);

  const isAuthenticated = useMemo(
    () => apiClientService.isAuthenticated(),
    [state.accessToken, state.serverUrl]
  );

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
        const { accessToken, refreshToken } = authHelpers.extractTokensFromAuthResponse(response);
        if (!accessToken) {
          throw new Error("Missing token in response");
        }

        // Update tokens in ApiClientService
        await apiClientService.setTokens(accessToken, refreshToken!, username);

        // Persist username separately
        await persistUsername(username);

        // Update local state
        setState((prev: AuthState) => ({ ...prev, username, loginMessage: undefined }));

        const user = userHelpers.marshalUserFromAuthResponse(response);
        const mediaProgress = mediaProgressHelpers.marshalMediaProgressFromAuthResponse(
          response.user
        );

        await Promise.all([
          userHelpers.upsertUser(user),
          mediaProgressHelpers.upsertMediaProgress(mediaProgress),
        ]);
      } catch (e) {
        console.error("[AuthProvider] Login error", e);
        throw new Error(e instanceof Error ? e.message : "Login failed");
      }
    },
    []
  );

  const logout = useCallback(async () => {
    await apiClientService.clearTokens();
    await persistUsername(null);
    setState((s: AuthState) => ({ ...s, username: null }));
    // Token state will be updated via subscription
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      initialized,
      isAuthenticated,
      serverUrl: state.serverUrl,
      username: state.username,
      loginMessage: state.loginMessage,
      setServerUrl,
      login,
      logout,
    }),
    [
      initialized,
      isAuthenticated,
      state.serverUrl,
      state.username,
      state.loginMessage,
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
