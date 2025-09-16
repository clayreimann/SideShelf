import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { db, ensureDatabaseInitialized } from '../db/client';
import { libraries, mediaProgress, userLibraries, users } from '../db/schema';
import { AbsMediaProgress, AbsUser, MeResponse } from '../lib/absTypes';
import { apiFetch, setApiConfig } from '../lib/api';

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<AuthState>({ serverUrl: null, accessToken: null, refreshToken: null, username: null });
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        (async () => {
            await ensureDatabaseInitialized();
            const [serverUrl, accessToken, refreshToken, username] = await Promise.all([
                getItem(SECURE_KEYS.serverUrl),
                getItem(SECURE_KEYS.accessToken),
                getItem(SECURE_KEYS.refreshToken),
                getItem(SECURE_KEYS.username),
            ]);
            setState({ serverUrl, accessToken, refreshToken, username });
            setInitialized(true);
        })();
    }, []);

    useEffect(() => {
        setApiConfig({
            getBaseUrl: () => state.serverUrl,
            getAccessToken: () => state.accessToken,
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

        // Try /login first, fallback to /api/login for older proxies/paths returning 404/405
        async function tryLogin(path: string) {
            console.log(`[auth] Attempting login via ${path}`);
            const response = await fetch(`${base}${path}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'x-return-tokens': 'true',
                },
                body: JSON.stringify({ username, password }),
            });
            console.log(`[auth] Login response ${response.status} ${response.statusText} at ${path}`);
            return response;
        }

        let response = await tryLogin('/login');
        if (!response.ok) {
            let message = 'Login failed';
            try {
                const text = await response.clone().text();
                console.log('[auth] Login error body:', text);
                const err = JSON.parse(text);
                message = err?.error || err?.message || message;
            } catch { }
            throw new Error(message);
        }

        const data = await response.json();
        // Per ABS docs, token is at response.user.token
        // Some instances may also return refresh tokens; if not available, reuse token
        const accessToken: string | null = data?.user?.token ?? null;
        const refreshToken: string | null = data?.refreshToken ?? accessToken ?? null;
        const normalizedBase = base;

        if (!accessToken) {
            throw new Error('Missing token in response');
        }

        await Promise.all([
            saveItem(SECURE_KEYS.accessToken, accessToken),
            saveItem(SECURE_KEYS.refreshToken, refreshToken),
            saveItem(SECURE_KEYS.username, username),
        ]);

        setState({ serverUrl: normalizedBase, accessToken, refreshToken, username });

        // After login, fetch current user and persist to DB
        try {
            const meRes = await apiFetch('/api/me');
            if (meRes.ok) {
                const me: MeResponse = await meRes.json();
                const user: AbsUser | undefined = me?.user;
                if (user) {
                    const permissionsJson = user.permissions ? JSON.stringify(user.permissions) : null;
                    await db.insert(users).values({
                        id: user.id,
                        username: user.username,
                        type: user.type ?? null,
                        token: accessToken,
                        createdAt: user.createdAt ?? null,
                        lastSeen: user.lastSeen ?? null,
                        permissionsJson,
                    }).onConflictDoUpdate({
                        target: users.id,
                        set: {
                            username: user.username,
                            type: user.type ?? null,
                            token: accessToken,
                            createdAt: user.createdAt ?? null,
                            lastSeen: user.lastSeen ?? null,
                            permissionsJson,
                        },
                    });
                    await saveItem(SECURE_KEYS.username, user.username);
                    setState((s) => ({ ...s, username: user.username }));
                }

                // Persist accessible libraries and mapping
                if (me?.librariesAccessible?.length) {
                    for (const lib of me.librariesAccessible) {
                        await db.insert(libraries).values({
                            id: lib.id,
                            name: lib.name,
                            mediaType: lib.mediaType ?? null,
                            createdAt: lib.createdAt ?? null,
                        }).onConflictDoUpdate({
                            target: libraries.id,
                            set: { name: lib.name, mediaType: lib.mediaType ?? null, createdAt: lib.createdAt ?? null },
                        });
                        if (me.user?.id) {
                            await db.insert(userLibraries).values({ userId: me.user.id, libraryId: lib.id }).onConflictDoNothing();
                        }
                    }
                }

                // Persist media progress
                if (me?.mediaProgress?.length && me.user?.id) {
                    const userId = me.user.id;
                    for (const mp of me.mediaProgress as AbsMediaProgress[]) {
                        await db.insert(mediaProgress).values({
                            id: mp.id,
                            userId,
                            libraryItemId: mp.libraryItemId,
                            episodeId: mp.episodeId ?? null,
                            duration: mp.duration ?? null,
                            progress: mp.progress ?? null,
                            currentTime: mp.currentTime ?? null,
                            isFinished: mp.isFinished ? 1 : 0,
                            hideFromContinueListening: mp.hideFromContinueListening ? 1 : 0,
                            lastUpdate: mp.lastUpdate ?? null,
                            startedAt: mp.startedAt ?? null,
                            finishedAt: mp.finishedAt ?? null,
                        }).onConflictDoUpdate({
                            target: mediaProgress.id,
                            set: {
                                userId,
                                libraryItemId: mp.libraryItemId,
                                episodeId: mp.episodeId ?? null,
                                duration: mp.duration ?? null,
                                progress: mp.progress ?? null,
                                currentTime: mp.currentTime ?? null,
                                isFinished: mp.isFinished ? 1 : 0,
                                hideFromContinueListening: mp.hideFromContinueListening ? 1 : 0,
                                lastUpdate: mp.lastUpdate ?? null,
                                startedAt: mp.startedAt ?? null,
                                finishedAt: mp.finishedAt ?? null,
                            },
                        });
                    }
                }
            }
        } catch (e) {
            console.log('[auth] fetch /api/me failed', e);
        }
    }, []);

    const logout = useCallback(async () => {
        await Promise.all([
            saveItem(SECURE_KEYS.accessToken, null),
            saveItem(SECURE_KEYS.refreshToken, null),
            saveItem(SECURE_KEYS.username, null),
        ]);
        setState((s) => ({ ...s, accessToken: null, refreshToken: null, username: null }));
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
