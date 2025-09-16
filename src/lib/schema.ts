import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  type: text('type'),
  token: text('token'),
  createdAt: integer('created_at'),
  lastSeen: integer('last_seen'),
});

export const libraries = sqliteTable('libraries', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  mediaType: text('media_type'),
  createdAt: integer('created_at'),
});

export const libraryItems = sqliteTable('library_items', {
  id: text('id').primaryKey(),
  libraryId: text('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
  title: text('title'),
  mediaType: text('media_type'),
  author: text('author'),
  series: text('series'),
});

export type UserRow = typeof users.$inferSelect;
export type LibraryRow = typeof libraries.$inferSelect;
export type LibraryItemRow = typeof libraryItems.$inferSelect;
