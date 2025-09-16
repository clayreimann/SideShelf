import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { libraries } from './libraries';

export const libraryItems = sqliteTable('library_items', {
  id: text('id').primaryKey(),
  libraryId: text('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
  title: text('title'),
  mediaType: text('media_type'),
  author: text('author'),
  series: text('series'),
});

export type LibraryItemRow = typeof libraryItems.$inferSelect;
