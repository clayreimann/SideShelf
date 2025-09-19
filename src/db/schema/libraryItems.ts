import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { libraries } from './libraries';

export const libraryItems = sqliteTable('library_items', {
  id: text('id').primaryKey(),
  libraryId: text('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
  ino: integer('ino'),
  folderId: text('folder_id'),
  path: text('path'),
  relPath: text('rel_path'),
  isFile: integer('is_file', { mode: 'boolean' }),
  mtimeMs: real('mtime_ms'),
  ctimeMs: real('ctime_ms'),
  birthtimeMs: real('birthtime_ms'),
  addedAt: integer('added_at'),
  updatedAt: integer('updated_at'),
  lastScan: integer('last_scan'),
  scanVersion: integer('scan_version'),
  isMissing: integer('is_missing', { mode: 'boolean' }),
  isInvalid: integer('is_invalid', { mode: 'boolean' }),
  mediaType: text('media_type'),
});

export type LibraryItemRow = typeof libraryItems.$inferSelect;
