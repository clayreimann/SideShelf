import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { libraryItems } from './libraryItems';

export const libraryFiles = sqliteTable('library_files', {
  id: text('id').primaryKey(), // Generated from libraryItemId + ino
  libraryItemId: text('library_item_id').notNull().references(() => libraryItems.id, { onDelete: 'cascade' }),
  ino: text('ino').notNull(),
  filename: text('filename').notNull(),
  ext: text('ext'),
  path: text('path').notNull(),
  relPath: text('rel_path'),
  size: integer('size'),
  mtimeMs: real('mtime_ms'),
  ctimeMs: real('ctime_ms'),
  birthtimeMs: real('birthtime_ms'),
  isSupplementary: integer('is_supplementary', { mode: 'boolean' }),
  addedAt: integer('added_at'),
  updatedAt: integer('updated_at'),
  fileType: text('file_type'), // 'audio', 'metadata', 'image', 'ebook', 'unknown', etc.
  // Downloaded file info
  isDownloaded: integer('is_downloaded', { mode: 'boolean' }).default(false),
  downloadPath: text('download_path'),
  downloadedAt: integer('downloaded_at', { mode: 'timestamp' }),
});

export type LibraryFileRow = typeof libraryFiles.$inferSelect;
export type NewLibraryFileRow = typeof libraryFiles.$inferInsert;
