import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  type: text('type'),
  token: text('token'),
  createdAt: integer('created_at'),
  lastSeen: integer('last_seen'),
  permissionsJson: text('permissions_json'),
});

export type UserRow = typeof users.$inferSelect;
