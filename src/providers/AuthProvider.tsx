import { authHelpers, mediaProgressHelpers, userHelpers } from '@/db/helpers';
import { setApiConfig, setNetworkStatusGetter } from '@/lib/api/api';
import { login as doLogin } from '@/lib/api/endpoints';
import { getItem, getStoredUsername, persistUsername, saveItem, SECURE_KEYS } from '@/lib/secureStore';
import { useDb } from '@/providers/DbProvider';
import { progressService } from '@/services/ProgressService';
import { useAppStore } from '@/stores/appStore';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

type AuthState = {
    serverUrl: string | null;
    accessToken: string | null;
    refreshToken: string | null;
    username: string | null;
};

type AuthContextValue = AuthState & {
    initialized: boolean;
    isAuthenticated: boolean;
    apiConfigured: boolean;
    loginMessage?: string;
    setServerUrl: (url: string) => Promise<void>;
    login: (params: { serverUrl: string; username: string; password: string }) => Promise<void>;
    logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function persistTokensAndState(
    setState: React.Dispatch<React.SetStateAction<AuthState>>,
    {
        accessToken,
        refreshToken,
        username,
    }: { accessToken: string | null; refreshToken: string | null; username?: string | null }
): Promise<void> {
    const usernamePersistence =
        username !== undefined ? persistUsername(username) : Promise.resolve();

    await Promise.all([
        saveItem(SECURE_KEYS.accessToken, accessToken),
        saveItem(SECURE_KEYS.refreshToken, refreshToken),
        usernamePersistence,
    ]);
    setState((s) => ({
        ...s,
        accessToken,
        refreshToken,
        loginMessage: undefined,
        username: username !== undefined ? username : s.username,
    }));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const { initialized: dbInitialized } = useDb();
    const [state, setState] = useState<AuthState>({ serverUrl: null, accessToken: null, refreshToken: null, username: null });
    const [apiConfigured, setApiConfigured] = useState(false);
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        (async () => {
            if (!dbInitialized) return;
            const [serverUrl, accessToken, refreshToken] = await Promise.all([
                getItem(SECURE_KEYS.serverUrl),
                getItem(SECURE_KEYS.accessToken),
                getItem(SECURE_KEYS.refreshToken),
            ]);
            const username = await getStoredUsername();
            await persistUsername(username);
            setState(s => ({ ...s, serverUrl, accessToken, refreshToken, username }));
            setInitialized(true);
        })();
    }, [dbInitialized]);

    useEffect(() => {
        setApiConfig({
            getBaseUrl: () => state.serverUrl,
            getAccessToken: () => state.accessToken,
            getRefreshToken: () => state.refreshToken,
            setTokens: async (accessToken: string, refreshToken: string) => {
                console.log('[AuthProvider] Updating tokens from refresh');
                await persistTokensAndState(setState, { accessToken, refreshToken });
            },
            clearTokens: async () => {
                console.log('[AuthProvider] Clearing tokens due to refresh failure');
                await Promise.all([
                    saveItem(SECURE_KEYS.accessToken, null),
                    saveItem(SECURE_KEYS.refreshToken, null),
                ]);
                setState(s => ({ ...s, accessToken: null, refreshToken: null, loginMessage: 'Session expired' }));
            }
        });

        // Set network status getter for API calls
        setNetworkStatusGetter(() => {
            const networkState = useAppStore.getState().network;
            return {
                isConnected: networkState.isConnected,
                serverReachable: networkState.serverReachable,
            };
        });

        // Only set apiConfigured to true when we have both serverUrl and accessToken
        setApiConfigured(!!state.serverUrl && !!state.accessToken);
    }, [state.serverUrl, state.accessToken, state.refreshToken]);

    const isAuthenticated = useMemo(() => !!state.accessToken && !!state.serverUrl, [state.accessToken, state.serverUrl]);

    // Handle app state changes for progress syncing
    useEffect(() => {
        if (!isAuthenticated || !state.username) return;

        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            if (nextAppState === 'active') {
                console.log('[AuthProvider] App became active');
                // Sync progress when app becomes active
                progressService.fetchServerProgress().catch(error => {
                    console.error('[AuthProvider] Failed to sync progress on app foreground:', error);
                });
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            subscription?.remove();
        };
    }, [isAuthenticated, state.username]);

    const setServerUrl = useCallback(async (url: string) => {
        const normalized = url.trim().replace(/\/$/, '');
        await saveItem(SECURE_KEYS.serverUrl, normalized);
        setState((s) => ({ ...s, serverUrl: normalized }));
    }, []);

    const login = useCallback(async ({ serverUrl, username, password }: { serverUrl: string; username: string; password: string }) => {
        const base = serverUrl.trim().replace(/\/$/, '');
        // Persist server URL so the field is prefilled next time
        await saveItem(SECURE_KEYS.serverUrl, base);

        try {
            let response = await doLogin(base, username, password);
            const { accessToken, refreshToken } = authHelpers.extractTokensFromAuthResponse(response);
            if (!accessToken) {
                throw new Error('Missing token in response');
            }

            await persistTokensAndState(setState, { accessToken, refreshToken, username });
            setState((s) => ({ ...s, serverUrl: base }));

            const user = userHelpers.marshalUserFromAuthResponse(response);
            const mediaProgress = mediaProgressHelpers.marshalMediaProgressFromAuthResponse(response.user);

            await Promise.all([
                userHelpers.upsertUser(user),
                mediaProgressHelpers.upsertMediaProgress(mediaProgress),
            ]);
        } catch (e) {
            console.error('[AuthProvider] Login error', e);
            throw new Error(e instanceof Error ? e.message : 'Login failed');
        }

    }, []);

    const logout = useCallback(async () => {
        await Promise.all([
            saveItem(SECURE_KEYS.accessToken, null),
            saveItem(SECURE_KEYS.refreshToken, null),
            persistUsername(null),
        ]);
        setState((s) => ({ ...s, accessToken: null, refreshToken: null, username: null }));
    }, []);

    const value = useMemo<AuthContextValue>(() => ({
        ...state,
        initialized,
        isAuthenticated,
        apiConfigured,
        setServerUrl,
        login,
        logout,
    }), [state, initialized, isAuthenticated, apiConfigured, setServerUrl, login, logout]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
