import { authHelpers, mediaProgressHelpers, userHelpers } from '@/db/helpers';
import { setApiConfig } from '@/lib/api/api';
import { login as doLogin } from '@/lib/api/endpoints';
import { useDb } from '@/providers/DbProvider';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type AuthState = {
    serverUrl: string | null;
    accessToken: string | null;
    refreshToken: string | null;
    username: string | null;
};

type AuthContextValue = AuthState & {
    initialized: boolean;
    isAuthenticated: boolean;
    setServerUrl: (url: string) => Promise<void>;
    login: (params: { serverUrl: string; username: string; password: string }) => Promise<void>;
    logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SECURE_KEYS = {
    serverUrl: 'abs.serverUrl',
    accessToken: 'abs.accessToken',
    refreshToken: 'abs.refreshToken',
    username: 'abs.username',
} as const;

async function saveItem(key: string, value: string | null): Promise<void> {
    if (value == null) {
        await SecureStore.deleteItemAsync(key);
    } else {
        await SecureStore.setItemAsync(key, value);
    }
}

async function getItem(key: string): Promise<string | null> {
    try {
        return await SecureStore.getItemAsync(key);
    } catch {
        return null;
    }
}

async function persistTokensAndState(
    setState: React.Dispatch<React.SetStateAction<AuthState>>,
    {
        accessToken,
        refreshToken,
        username,
    }: { accessToken: string | null; refreshToken: string | null; username?: string | null }
): Promise<void> {
    await Promise.all([
        saveItem(SECURE_KEYS.accessToken, accessToken),
        saveItem(SECURE_KEYS.refreshToken, refreshToken),
        username !== undefined ? saveItem(SECURE_KEYS.username, username) : Promise.resolve(),
    ]);
    setState((s) => ({
        ...s,
        accessToken,
        refreshToken,
        username: username !== undefined ? username : s.username,
    }));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const { initialized: dbInitialized } = useDb();
    const [state, setState] = useState<AuthState>({ serverUrl: null, accessToken: null, refreshToken: null, username: null });
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        (async () => {
            if (!dbInitialized) return;
            const [serverUrl, accessToken, refreshToken, username] = await Promise.all([
                getItem(SECURE_KEYS.serverUrl),
                getItem(SECURE_KEYS.accessToken),
                getItem(SECURE_KEYS.refreshToken),
                getItem(SECURE_KEYS.username),
            ]);
            setState({ serverUrl, accessToken, refreshToken, username });
            setInitialized(true);
        })();
    }, [dbInitialized]);

    useEffect(() => {
        setApiConfig({
            getBaseUrl: () => state.serverUrl,
            getAccessToken: () => state.accessToken,
            refreshAccessToken: async () => {
                console.log(`[AuthProvider] Refreshing access token ${state.serverUrl} ${state.refreshToken ? 'has refresh token' : 'no refresh token'}`);
                if (!state.serverUrl || !state.refreshToken) return false;
                const response = await fetch(`${state.serverUrl}/auth/refresh`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-refresh-token': state.refreshToken
                    }
                });
                console.log(`[AuthProvider] Refresh access token response: ${response.status} ${response.statusText}`);
                if (!response.ok) {
                    const text = await response.clone().text();
                    console.log(`[AuthProvider] Refresh access token failed: ${text}`);
                    return false;
                }
                const data = await response.json();
                const {accessToken, refreshToken} = authHelpers.extractTokensFromAuthResponse(data);
                if (!accessToken || !refreshToken) return false;
                await persistTokensAndState(setState, { accessToken, refreshToken });
                return true;
            }
        });
    }, [state.serverUrl, state.accessToken]);

    const isAuthenticated = !!state.accessToken && !!state.serverUrl;

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
            const mediaProgress = mediaProgressHelpers.marshalMediaProgressFromAuthResponse(response);

            await Promise.all([
                userHelpers.upsertUser(user),
                mediaProgressHelpers.upsertMediaProgress(mediaProgress),
            ]);
        } catch (e) {
            throw new Error(e instanceof Error ? e.message : 'Login failed');
        }

    }, []);

    const logout = useCallback(async () => {
        await Promise.all([
            saveItem(SECURE_KEYS.accessToken, null),
            saveItem(SECURE_KEYS.refreshToken, null),
        ]);
        setState((s) => ({ ...s, accessToken: null, refreshToken: null }));
    }, []);

    const value = useMemo<AuthContextValue>(() => ({
        ...state,
        initialized,
        isAuthenticated,
        setServerUrl,
        login,
        logout,
    }), [state, initialized, isAuthenticated, setServerUrl, login, logout]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
