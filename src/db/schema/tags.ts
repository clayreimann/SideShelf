import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const tags = sqliteTable('tags', {
  name: text('name').primaryKey(),
});

export type TagRow = typeof tags.$inferSelect;
