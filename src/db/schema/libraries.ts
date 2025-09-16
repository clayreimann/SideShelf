import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const libraries = sqliteTable('libraries', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  icon: text('icon'),
  displayOrder: integer('display_order'),
  mediaType: text('media_type'),
  createdAt: integer('created_at'),
  updatedAt: integer('updated_at'),
});

export type LibraryRow = typeof libraries.$inferSelect;
