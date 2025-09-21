import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const languages = sqliteTable('languages', {
  name: text('name').primaryKey(),
});

export type LanguageRow = typeof languages.$inferSelect;
