import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { libraries } from './libraries';
import { users } from './users';

// Join table of which libraries a user can access
export const userLibraries = sqliteTable('user_libraries', {
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  libraryId: text('library_id').notNull().references(() => libraries.id, { onDelete: 'cascade' }),
});

export type UserLibraryRow = typeof userLibraries.$inferSelect;
