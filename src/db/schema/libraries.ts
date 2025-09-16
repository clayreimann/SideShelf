import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const libraries = sqliteTable('libraries', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  mediaType: text('media_type'),
  createdAt: integer('created_at'),
});

export type LibraryRow = typeof libraries.$inferSelect;
