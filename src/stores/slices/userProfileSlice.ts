/**
 * UserProfile slice for Zustand store
 *
 * This slice manages user profile and device information including:
 * - Device info (OS, model, version, etc.)
 * - User database record
 * - Server information
 * - Bookmark CRUD with offline-aware create/delete/rename
 * - Pending bookmark ops queue drain on network restore
 */

import { getUserByUsername, UserRow } from "@/db/helpers/users";
import {
  upsertBookmark,
  upsertAllBookmarks,
  deleteBookmarkLocal,
  enqueuePendingOp,
  dequeuePendingOps,
  clearPendingOps,
} from "@/db/helpers/bookmarks";
import {
  createBookmark as apiCreateBookmark,
  deleteBookmark as apiDeleteBookmark,
  renameBookmark as apiRenameBookmark,
  fetchMe,
  getDeviceInfo,
} from "@/lib/api/endpoints";
import { logger } from "@/lib/logger";
import type { ApiAudioBookmark } from "@/types/api";
import type { SliceCreator } from "@/types/store";
import { v4 as uuidv4 } from "uuid";

// Create cached sublogger for this slice
const log = logger.forTag("UserProfileSlice");

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
  /** Create a new bookmark (offline-aware) */
  createBookmark: (
    libraryItemId: string,
    time: number,
    title?: string
  ) => Promise<ApiAudioBookmark>;
  /** Delete a bookmark by time position (offline-aware) */
  deleteBookmark: (libraryItemId: string, time: number) => Promise<void>;
  /** Rename a bookmark (offline-aware) */
  renameBookmark: (libraryItemId: string, time: number, newTitle: string) => Promise<void>;
  /** Get bookmarks for a specific library item */
  getItemBookmarks: (libraryItemId: string) => ApiAudioBookmark[];
  /** Drain pending bookmark ops queue, replaying ops in FIFO order */
  drainPendingBookmarkOps: () => Promise<void>;
  /** Reset the slice to initial state */
  resetUserProfile: () => void;
}

/**
 * Combined UserProfile slice interface
 */
export interface UserProfileSlice extends UserProfileSliceState, UserProfileSliceActions {}

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
   * Initialize the slice with username.
   * Also populates SQLite with server bookmarks via upsertAllBookmarks.
   */
  initializeUserProfile: async (username: string) => {
    const state = get();

    if (state.userProfile.initialized) {
      log.debug("User profile already initialized, skipping");
      return;
    }

    log.info("Initializing user profile slice...");

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

      const userId = user?.id ?? meResponse.id;
      const bookmarksFromServer = meResponse.bookmarks || [];

      // Populate SQLite with server bookmarks
      await upsertAllBookmarks(userId, bookmarksFromServer);

      set((state: UserProfileSlice) => ({
        ...state,
        userProfile: {
          ...state.userProfile,
          deviceInfo,
          user,
          bookmarks: bookmarksFromServer,
          initialized: true,
          isLoading: false,
        },
      }));

      log.info(
        `User profile initialized successfully: username=${username}, deviceId=${deviceInfo.deviceId}, bookmarks=${bookmarksFromServer.length}`
      );
    } catch (error) {
      log.error("Failed to initialize user profile", error as Error);

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
    log.info("Refreshing device info...");

    try {
      const deviceInfo = await getDeviceInfo();

      set((state: UserProfileSlice) => ({
        ...state,
        userProfile: {
          ...state.userProfile,
          deviceInfo,
        },
      }));

      log.info("Device info refreshed successfully");
    } catch (error) {
      log.error("Failed to refresh device info", error as Error);
      throw error;
    }
  },

  /**
   * Refresh server info
   */
  refreshServerInfo: async () => {
    log.info("Refreshing server info...");

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

      log.info("Server info refreshed successfully");
    } catch (error) {
      log.error("Failed to refresh server info", error as Error);
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

      log.info("User record updated successfully");
    } catch (error) {
      log.error("Failed to update user record", error as Error);
      throw error;
    }
  },

  /**
   * Fetch and update bookmarks from server
   */
  refreshBookmarks: async () => {
    log.info("Refreshing bookmarks...");

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
      log.error("Failed to refresh bookmarks", error as Error);
      throw error;
    }
  },

  /**
   * Create a new bookmark — offline-aware.
   * Online: calls API, upserts to SQLite.
   * Offline: creates optimistic bookmark in state + SQLite, enqueues pending op.
   */
  createBookmark: async (libraryItemId: string, time: number, title?: string) => {
    log.info(`[createBookmark] libraryItemId=${libraryItemId} time=${time}`);

    const isOnline = get().network.isConnected && get().network.isInternetReachable !== false;

    if (isOnline) {
      const response = await apiCreateBookmark(libraryItemId, time, title);
      const newBookmark = response.bookmark;

      // Upsert to SQLite with syncedAt = now
      await upsertBookmark({
        id: newBookmark.id,
        userId: get().userProfile.user?.id ?? "",
        libraryItemId: newBookmark.libraryItemId,
        title: newBookmark.title,
        time: newBookmark.time,
        createdAt: new Date(newBookmark.createdAt),
        syncedAt: new Date(),
      });

      set((state: UserProfileSlice) => ({
        ...state,
        userProfile: {
          ...state.userProfile,
          bookmarks: [...state.userProfile.bookmarks, newBookmark],
        },
      }));

      log.info(`[createBookmark] created successfully: ${newBookmark.id}`);
      return newBookmark;
    } else {
      // Offline: create optimistic bookmark
      const tempId = uuidv4();
      const userId = get().userProfile.user?.id ?? "";
      const optimisticBookmark: ApiAudioBookmark = {
        id: tempId,
        libraryItemId,
        title: title ?? `Bookmark at ${time}s`,
        time,
        createdAt: Date.now(),
      };

      // Upsert to SQLite (syncedAt = null — pending)
      await upsertBookmark({
        id: tempId,
        userId,
        libraryItemId,
        title: optimisticBookmark.title,
        time,
        createdAt: new Date(),
        syncedAt: null,
      });

      // Enqueue pending op
      await enqueuePendingOp({
        id: uuidv4(),
        userId,
        libraryItemId,
        operationType: "create",
        time,
        title: optimisticBookmark.title,
        createdAt: new Date(),
      });

      // Optimistic state update
      set((state: UserProfileSlice) => ({
        ...state,
        userProfile: {
          ...state.userProfile,
          bookmarks: [...state.userProfile.bookmarks, optimisticBookmark],
        },
      }));

      log.info(`[createBookmark] queued offline create for time=${time}`);
      return optimisticBookmark;
    }
  },

  /**
   * Delete a bookmark by time — offline-aware.
   * Online: calls API + removes from SQLite.
   * Offline: removes from SQLite + enqueues pending delete op.
   * Always removes from state (optimistic).
   */
  deleteBookmark: async (libraryItemId: string, time: number) => {
    log.info(`[deleteBookmark] libraryItemId=${libraryItemId} time=${time}`);

    const userId = get().userProfile.user?.id ?? "";

    // Optimistic state update (filter by libraryItemId + time)
    set((state: UserProfileSlice) => ({
      ...state,
      userProfile: {
        ...state.userProfile,
        bookmarks: state.userProfile.bookmarks.filter(
          (b) => !(b.libraryItemId === libraryItemId && b.time === time)
        ),
      },
    }));

    const isOnline = get().network.isConnected && get().network.isInternetReachable !== false;

    if (isOnline) {
      await apiDeleteBookmark(libraryItemId, time);
    } else {
      await enqueuePendingOp({
        id: uuidv4(),
        userId,
        libraryItemId,
        operationType: "delete",
        time,
        title: null,
        createdAt: new Date(),
      });
    }

    // Always remove from SQLite
    await deleteBookmarkLocal(userId, libraryItemId, time);

    log.info(`[deleteBookmark] done isOnline=${isOnline}`);
  },

  /**
   * Rename a bookmark — offline-aware.
   * Online: calls API, upserts updated bookmark to SQLite.
   * Offline: updates SQLite optimistically, enqueues pending rename op.
   */
  renameBookmark: async (libraryItemId: string, time: number, newTitle: string) => {
    log.info(`[renameBookmark] libraryItemId=${libraryItemId} time=${time} newTitle=${newTitle}`);

    const userId = get().userProfile.user?.id ?? "";
    const isOnline = get().network.isConnected && get().network.isInternetReachable !== false;

    // Optimistic state update
    set((state: UserProfileSlice) => ({
      ...state,
      userProfile: {
        ...state.userProfile,
        bookmarks: state.userProfile.bookmarks.map((b) =>
          b.libraryItemId === libraryItemId && b.time === time ? { ...b, title: newTitle } : b
        ),
      },
    }));

    if (isOnline) {
      const response = await apiRenameBookmark(libraryItemId, time, newTitle);
      const updatedBm = response.bookmark;

      await upsertBookmark({
        id: updatedBm.id,
        userId,
        libraryItemId: updatedBm.libraryItemId,
        title: updatedBm.title,
        time: updatedBm.time,
        createdAt: new Date(updatedBm.createdAt),
        syncedAt: new Date(),
      });

      log.info(`[renameBookmark] API success`);
    } else {
      // Find the bookmark to get its id for upsert
      const existing = get().userProfile.bookmarks.find(
        (b: ApiAudioBookmark) => b.libraryItemId === libraryItemId && b.time === time
      );

      if (existing) {
        await upsertBookmark({
          id: existing.id,
          userId,
          libraryItemId,
          title: newTitle,
          time,
          createdAt: new Date(existing.createdAt),
          syncedAt: null,
        });
      }

      await enqueuePendingOp({
        id: uuidv4(),
        userId,
        libraryItemId,
        operationType: "rename",
        time,
        title: newTitle,
        createdAt: new Date(),
      });

      log.info(`[renameBookmark] queued offline rename`);
    }
  },

  /**
   * Get bookmarks for a specific library item
   */
  getItemBookmarks: (libraryItemId: string) => {
    const state = get();
    return state.userProfile.bookmarks.filter(
      (b: ApiAudioBookmark) => b.libraryItemId === libraryItemId
    );
  },

  /**
   * Drain the pending bookmark ops queue.
   * Replays ops in FIFO order (createdAt ascending).
   * Stops on first failure to preserve ordering.
   * Calls refreshBookmarks after any successful ops to reconcile state.
   */
  drainPendingBookmarkOps: async () => {
    const userId = get().userProfile.user?.id;
    if (!userId) {
      log.debug("[drainPendingBookmarkOps] no userId, skipping");
      return;
    }

    log.info("[drainPendingBookmarkOps] starting");
    const ops = await dequeuePendingOps(userId);

    if (!ops.length) {
      log.debug("[drainPendingBookmarkOps] no pending ops");
      return;
    }

    const succeededIds: string[] = [];

    for (const op of ops) {
      try {
        if (op.operationType === "create") {
          const bm = await apiCreateBookmark(op.libraryItemId, op.time, op.title ?? undefined);
          await upsertBookmark({
            id: bm.bookmark.id,
            userId,
            libraryItemId: bm.bookmark.libraryItemId,
            title: bm.bookmark.title,
            time: bm.bookmark.time,
            createdAt: new Date(bm.bookmark.createdAt),
            syncedAt: new Date(),
          });
        } else if (op.operationType === "delete") {
          await apiDeleteBookmark(op.libraryItemId, op.time);
        } else if (op.operationType === "rename" && op.title) {
          await apiRenameBookmark(op.libraryItemId, op.time, op.title);
        }
        succeededIds.push(op.id);
      } catch (error) {
        log.warn(`[drainPendingBookmarkOps] op failed, leaving in queue: ${error}`);
        // Stop draining on first failure to preserve order
        break;
      }
    }

    if (succeededIds.length > 0) {
      await clearPendingOps(userId, succeededIds);
      await get().refreshBookmarks();
    }

    log.info(`[drainPendingBookmarkOps] done: ${succeededIds.length}/${ops.length} ops succeeded`);
  },

  /**
   * Reset the slice to initial state
   */
  resetUserProfile: () => {
    log.info("Resetting user profile slice");
    set((state: UserProfileSlice) => ({
      ...state,
      userProfile: initialState.userProfile,
    }));
  },
});
