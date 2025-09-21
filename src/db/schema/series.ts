import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ABS Series entity (id + name)
export const series = sqliteTable('series', {
  id: text('id').primaryKey(),
  name: text('name'),
  description: text('description'),
  addedAt: integer('added_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

export type SeriesRow = typeof series.$inferSelect;
