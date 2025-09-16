import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const mediaProgress = sqliteTable('media_progress', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  libraryItemId: text('library_item_id').notNull(),
  episodeId: text('episode_id'),
  duration: real('duration'),
  progress: real('progress'),
  currentTime: real('current_time'),
  isFinished: integer('is_finished', { mode: 'boolean' }),
  hideFromContinueListening: integer('hide_from_continue_listening', { mode: 'boolean' }),
  lastUpdate: integer('last_update', { mode: 'timestamp' }),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
});

export type MediaProgressRow = typeof mediaProgress.$inferSelect;
