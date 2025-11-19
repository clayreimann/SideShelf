/**
 * UserProfile slice for Zustand store
 *
 * This slice manages user profile and device information including:
 * - Device info (OS, model, version, etc.)
 * - User database record
 * - Server information
 */

import { getUserByUsername, UserRow } from '@/db/helpers/users';
import { createBookmark, deleteBookmark, fetchMe, getDeviceInfo } from '@/lib/api/endpoints';
import { logger } from '@/lib/logger';
import type { ApiAudioBookmark } from '@/types/api';
import type { SliceCreator } from '@/types/store';

// Create cached sublogger for this slice
const log = logger.forTag('UserProfileSlice');

/**
 * Device information type
 */
export type DeviceInfo = {
    osName: string;
    osVersion: string;
    deviceName: string;
    deviceType: string;
    manufacturer: string;
    model: string;
    sdkVersion: number | undefined;
    clientName: string;
    clientVersion: string;
    deviceId: string;
};

/**
 * Server information type (placeholder for future expansion)
 */
export type ServerInfo = {
    version?: string;
    isLocal?: boolean;
};

/**
 * UserProfile slice state interface - scoped under 'userProfile' to avoid conflicts
 */
export interface UserProfileSliceState {
    userProfile: {
        /** Device information (cached, loaded once) */
        deviceInfo: DeviceInfo | null;
        /** Current user database record */
        user: UserRow | null;
        /** Server information */
        serverInfo: ServerInfo | null;
        /** User's bookmarks */
        bookmarks: ApiAudioBookmark[];
        /** Whether the slice has been initialized */
        initialized: boolean;
        /** Whether data is currently being loaded */
        isLoading: boolean;
    };
}

/**
 * UserProfile slice actions interface
 */
export interface UserProfileSliceActions {
    // Public methods
    /** Initialize the slice with username */
    initializeUserProfile: (username: string) => Promise<void>;
    /** Refresh device info (should rarely be needed) */
    refreshDeviceInfo: () => Promise<void>;
    /** Refresh server info */
    refreshServerInfo: () => Promise<void>;
    /** Update user record */
    updateUser: (username: string) => Promise<void>;
    /** Fetch and update bookmarks from server */
    refreshBookmarks: () => Promise<void>;
    /** Create a new bookmark */
    createBookmark: (libraryItemId: string, time: number, title?: string) => Promise<ApiAudioBookmark>;
    /** Delete a bookmark */
    deleteBookmark: (libraryItemId: string, bookmarkId: string) => Promise<void>;
    /** Get bookmarks for a specific library item */
    getItemBookmarks: (libraryItemId: string) => ApiAudioBookmark[];
    /** Reset the slice to initial state */
    resetUserProfile: () => void;
}

/**
 * Combined UserProfile slice interface
 */
export interface UserProfileSlice extends UserProfileSliceState, UserProfileSliceActions { }

/**
 * Initial state
 */
const initialState: UserProfileSliceState = {
    userProfile: {
        deviceInfo: null,
        user: null,
        serverInfo: null,
        bookmarks: [],
        initialized: false,
        isLoading: false,
    },
};

/**
 * Create the UserProfile slice
 */
export const createUserProfileSlice: SliceCreator<UserProfileSlice> = (set, get) => ({
    // Initial state
    ...initialState,

    /**
     * Initialize the slice with username
     */
    initializeUserProfile: async (username: string) => {
        const state = get();

        if (state.userProfile.initialized) {
            log.debug('User profile already initialized, skipping');
            return;
        }

        log.info('Initializing user profile slice...');

        set((state: UserProfileSlice) => ({
            ...state,
            userProfile: {
                ...state.userProfile,
                isLoading: true,
            },
        }));

        try {
            // Fetch device info, user, and bookmarks in parallel
            const [deviceInfo, user, meResponse] = await Promise.all([
                getDeviceInfo(),
                getUserByUsername(username),
                fetchMe(),
            ]);

            set((state: UserProfileSlice) => ({
                ...state,
                userProfile: {
                    ...state.userProfile,
                    deviceInfo,
                    user,
                    bookmarks: meResponse.bookmarks || [],
                    initialized: true,
                    isLoading: false,
                },
            }));

            log.info(`User profile initialized successfully: username=${username}, deviceId=${deviceInfo.deviceId}, bookmarks=${meResponse.bookmarks?.length || 0}`);
        } catch (error) {
            log.error('Failed to initialize user profile', error as Error);

            set((state: UserProfileSlice) => ({
                ...state,
                userProfile: {
                    ...state.userProfile,
                    isLoading: false,
                },
            }));

            throw error;
        }
    },

    /**
     * Refresh device info (should rarely be needed as it's mostly static)
     */
    refreshDeviceInfo: async () => {
        log.info('Refreshing device info...');

        try {
            const deviceInfo = await getDeviceInfo();

            set((state: UserProfileSlice) => ({
                ...state,
                userProfile: {
                    ...state.userProfile,
                    deviceInfo,
                },
            }));

            log.info('Device info refreshed successfully');
        } catch (error) {
            log.error('Failed to refresh device info', error as Error);
            throw error;
        }
    },

    /**
     * Refresh server info
     */
    refreshServerInfo: async () => {
        log.info('Refreshing server info...');

        try {
            // TODO: Implement server info fetching when needed
            // For now, this is a placeholder
            const serverInfo: ServerInfo = {};

            set((state: UserProfileSlice) => ({
                ...state,
                userProfile: {
                    ...state.userProfile,
                    serverInfo,
                },
            }));

            log.info('Server info refreshed successfully');
        } catch (error) {
            log.error('Failed to refresh server info', error as Error);
            throw error;
        }
    },

    /**
     * Update user record
     */
    updateUser: async (username: string) => {
        log.info(`Updating user record for ${username}...`);

        try {
            const user = await getUserByUsername(username);

            set((state: UserProfileSlice) => ({
                ...state,
                userProfile: {
                    ...state.userProfile,
                    user,
                },
            }));

            log.info('User record updated successfully');
        } catch (error) {
            log.error('Failed to update user record', error as Error);
            throw error;
        }
    },

    /**
     * Fetch and update bookmarks from server
     */
    refreshBookmarks: async () => {
        log.info('Refreshing bookmarks...');

        try {
            const meResponse = await fetchMe();

            set((state: UserProfileSlice) => ({
                ...state,
                userProfile: {
                    ...state.userProfile,
                    bookmarks: meResponse.bookmarks || [],
                },
            }));

            log.info(`Bookmarks refreshed successfully (${meResponse.bookmarks?.length || 0} bookmarks)`);
        } catch (error) {
            log.error('Failed to refresh bookmarks', error as Error);
            throw error;
        }
    },

    /**
     * Create a new bookmark
     */
    createBookmark: async (libraryItemId: string, time: number, title?: string) => {
        log.info(`Creating bookmark for item ${libraryItemId} at ${time}s...`);

        try {
            const response = await createBookmark(libraryItemId, time, title);
            const newBookmark = response.bookmark;

            // Add the new bookmark to the state
            set((state: UserProfileSlice) => ({
                ...state,
                userProfile: {
                    ...state.userProfile,
                    bookmarks: [...state.userProfile.bookmarks, newBookmark],
                },
            }));

            log.info(`Bookmark created successfully: ${newBookmark.id}`);
            return newBookmark;
        } catch (error) {
            log.error('Failed to create bookmark', error as Error);
            throw error;
        }
    },

    /**
     * Delete a bookmark
     */
    deleteBookmark: async (libraryItemId: string, bookmarkId: string) => {
        log.info(`Deleting bookmark ${bookmarkId}...`);

        try {
            await deleteBookmark(libraryItemId, bookmarkId);

            // Remove the bookmark from the state
            set((state: UserProfileSlice) => ({
                ...state,
                userProfile: {
                    ...state.userProfile,
                    bookmarks: state.userProfile.bookmarks.filter((b) => b.id !== bookmarkId),
                },
            }));

            log.info(`Bookmark deleted successfully: ${bookmarkId}`);
        } catch (error) {
            log.error('Failed to delete bookmark', error as Error);
            throw error;
        }
    },

    /**
     * Get bookmarks for a specific library item
     */
    getItemBookmarks: (libraryItemId: string) => {
        const state = get();
        return state.userProfile.bookmarks.filter((b) => b.libraryItemId === libraryItemId);
    },

    /**
     * Reset the slice to initial state
     */
    resetUserProfile: () => {
        log.info('Resetting user profile slice');
        set((state: UserProfileSlice) => ({
            ...state,
            userProfile: initialState.userProfile,
        }));
    },
});
