import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// ABS Author entity (id + name + optional image url)
export const authors = sqliteTable('authors', {
  id: text('id').primaryKey(),
  name: text('name'),
  imageUrl: text('image_url'),
  numBooks: integer('num_books'),
});

export type AuthorRow = typeof authors.$inferSelect;
