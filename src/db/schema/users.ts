import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  type: text('type'),
  createdAt: integer('created_at'),
  lastSeen: integer('last_seen'),
  // a comma-separated list of series IDs to hide from the user's "Continue Series" shelf
  hideFromContinueListening: text('hide_from_continue_listening'),
  // from UserPermissions
  canDownload: integer('download', { mode: 'boolean' }),
  canUpdate: integer('update', { mode: 'boolean' }),
  canDelete: integer('delete', { mode: 'boolean' }),
  canUpload: integer('upload', { mode: 'boolean' }),
  canAccessAllLibraries: integer('access_all_libraries', { mode: 'boolean' }),
  canAccessAllTags: integer('access_all_tags', { mode: 'boolean' }),
  canAccessExplicitContent: integer('access_explicit_content', { mode: 'boolean' })
});

export type UserRow = typeof users.$inferSelect;
