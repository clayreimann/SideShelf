import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const genres = sqliteTable('genres', {
  name: text('name').primaryKey(),
});

export type GenreRow = typeof genres.$inferSelect;
