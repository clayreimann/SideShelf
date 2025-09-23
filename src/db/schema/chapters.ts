import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { mediaMetadata } from './mediaMetadata';

export const chapters = sqliteTable('chapters', {
  id: text('id').primaryKey(), // Generated from mediaId + chapter id
  mediaId: text('media_id').notNull().references(() => mediaMetadata.id, { onDelete: 'cascade' }),
  chapterId: integer('chapter_id').notNull(), // Original chapter ID from API
  start: real('start').notNull(), // Start time in seconds
  end: real('end').notNull(), // End time in seconds
  title: text('title').notNull(),
});

export type ChapterRow = typeof chapters.$inferSelect;
export type NewChapterRow = typeof chapters.$inferInsert;
