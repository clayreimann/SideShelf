import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const narrators = sqliteTable('narrators', {
  name: text('name').primaryKey(),
});

export type NarratorRow = typeof narrators.$inferSelect;
