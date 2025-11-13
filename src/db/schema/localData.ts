import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { audioFiles } from "./audioFiles";
import { libraryFiles } from "./libraryFiles";
import { mediaMetadata } from "./mediaMetadata";
import { users } from "./users";

/**
 * Local cover cache data - separate from API data
 * This table stores locally cached cover image URLs that should persist
 * even when API data is refreshed via onConflictDoUpdate
 */
export const localCoverCache = sqliteTable("local_cover_cache", {
  mediaId: text("media_id")
    .primaryKey()
    .references(() => mediaMetadata.id, { onDelete: "cascade" }),
  localCoverUrl: text("local_cover_url").notNull(),
  cachedAt: integer("cached_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/**
 * Local audio file download state - separate from API data
 * This table tracks which audio files have been downloaded locally
 * and should persist even when API data is refreshed
 */
export const localAudioFileDownloads = sqliteTable("local_audio_file_downloads", {
  audioFileId: text("audio_file_id")
    .primaryKey()
    .references(() => audioFiles.id, { onDelete: "cascade" }),
  isDownloaded: integer("is_downloaded", { mode: "boolean" }).notNull().default(true),
  downloadPath: text("download_path").notNull(),
  downloadedAt: integer("downloaded_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/**
 * Local library file download state - separate from API data
 * This table tracks which library files (covers, ebooks, etc.) have been downloaded locally
 * and should persist even when API data is refreshed
 */
export const localLibraryFileDownloads = sqliteTable("local_library_file_downloads", {
  libraryFileId: text("library_file_id")
    .primaryKey()
    .references(() => libraryFiles.id, { onDelete: "cascade" }),
  isDownloaded: integer("is_downloaded", { mode: "boolean" }).notNull().default(true),
  downloadPath: text("download_path").notNull(),
  downloadedAt: integer("downloaded_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/**
 * Local listening sessions - tracks offline listening progress
 * This table stores listening sessions that can be synced to the server later
 * Each session represents a continuous listening period with start/end times and progress
 */
export const localListeningSessions = sqliteTable("local_listening_sessions", {
  id: text("id").primaryKey(), // UUID generated locally
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  libraryItemId: text("library_item_id").notNull(),
  mediaId: text("media_id")
    .notNull()
    .references(() => mediaMetadata.id, { onDelete: "cascade" }),

  // Session timing
  sessionStart: integer("session_start", { mode: "timestamp" }).notNull(),
  sessionEnd: integer("session_end", { mode: "timestamp" }), // null if session is still active

  // Progress tracking
  startTime: real("start_time").notNull(), // Position in seconds when session started
  endTime: real("end_time"), // Position in seconds when session ended (null if active)
  currentTime: real("current_time").notNull(), // Current position in seconds
  duration: real("duration").notNull(), // Total media duration in seconds
  timeListening: real("time_listening").notNull().default(0), // Cumulative listening time in seconds

  // Playback info
  playbackRate: real("playback_rate").notNull().default(1.0),
  volume: real("volume").notNull().default(1.0),

  // Sync status
  isSynced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  syncAttempts: integer("sync_attempts").notNull().default(0),
  lastSyncAttempt: integer("last_sync_attempt", { mode: "timestamp" }),
  lastSyncTime: integer("last_sync_time", { mode: "timestamp" }), // Last successful sync time
  serverSessionId: text("server_session_id"), // Server session ID if synced
  syncError: text("sync_error"), // Last sync error message if any

  // Metadata
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/**
 * Local progress snapshots - periodic progress saves during playback
 * This table stores frequent progress updates that can be used to recover playback position
 * and provide detailed listening analytics
 */
export const localProgressSnapshots = sqliteTable("local_progress_snapshots", {
  id: text("id").primaryKey(), // UUID generated locally
  sessionId: text("session_id")
    .notNull()
    .references(() => localListeningSessions.id, { onDelete: "cascade" }),

  // Progress info
  currentTime: real("current_time").notNull(),
  progress: real("progress").notNull(), // 0.0 to 1.0
  playbackRate: real("playback_rate").notNull(),
  volume: real("volume").notNull(),

  // Context
  chapterId: text("chapter_id"), // Current chapter if available
  isPlaying: integer("is_playing", { mode: "boolean" }).notNull(),

  // Timing
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
});

/**
 * Server listening sessions - cached from server to reduce API calls
 * This table stores listening sessions fetched from the server
 * Used for session history and multi-device reconciliation
 */
export const serverListeningSessions = sqliteTable("server_listening_sessions", {
  id: text("id").primaryKey(), // Server session ID
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  libraryItemId: text("library_item_id").notNull(),
  libraryId: text("library_id"),
  episodeId: text("episode_id"),

  // Media info
  mediaType: text("media_type"),
  displayTitle: text("display_title"),
  displayAuthor: text("display_author"),
  coverPath: text("cover_path"),
  duration: real("duration"),

  // Playback info
  playMethod: integer("play_method"),
  mediaPlayer: text("media_player"), // Device info
  startTime: real("start_time"), // Starting position (seconds)
  currentTime: real("current_time"), // Current/final position (seconds)
  timeListening: real("time_listening"), // Listening duration (seconds)

  // Timing (from server)
  startedAt: integer("started_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),

  // Session metadata
  dayOfWeek: text("day_of_week"),
  date: text("date"),

  // Cache metadata
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(), // When we fetched from server
});

// Type exports
export type LocalCoverCacheRow = typeof localCoverCache.$inferSelect;
export type NewLocalCoverCacheRow = typeof localCoverCache.$inferInsert;

export type LocalAudioFileDownloadRow = typeof localAudioFileDownloads.$inferSelect;
export type NewLocalAudioFileDownloadRow = typeof localAudioFileDownloads.$inferInsert;

export type LocalLibraryFileDownloadRow = typeof localLibraryFileDownloads.$inferSelect;
export type NewLocalLibraryFileDownloadRow = typeof localLibraryFileDownloads.$inferInsert;

export type LocalListeningSessionRow = typeof localListeningSessions.$inferSelect;
export type NewLocalListeningSessionRow = typeof localListeningSessions.$inferInsert;

export type LocalProgressSnapshotRow = typeof localProgressSnapshots.$inferSelect;
export type NewLocalProgressSnapshotRow = typeof localProgressSnapshots.$inferInsert;

export type ServerListeningSessionRow = typeof serverListeningSessions.$inferSelect;
export type NewServerListeningSessionRow = typeof serverListeningSessions.$inferInsert;
