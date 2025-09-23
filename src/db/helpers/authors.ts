/**
 * Authors database helper functions
 *
 * This module provides functions for managing authors in the database,
 * including fetching, upserting, and transforming author data.
 */

import { desc, eq } from 'drizzle-orm';
import { db } from '../client';
import { AuthorRow, authors } from '../schema/authors';

export type NewAuthorRow = typeof authors.$inferInsert;
export type { AuthorRow };

/**
 * Get all authors from database, ordered by name
 */
export async function getAllAuthors(): Promise<AuthorRow[]> {
  return await db
    .select()
    .from(authors)
    .orderBy(authors.name);
}

/**
 * Get author by ID
 */
export async function getAuthorById(id: string): Promise<AuthorRow | null> {
  const result = await db
    .select()
    .from(authors)
    .where(eq(authors.id, id))
    .limit(1);

  return result[0] || null;
}

/**
 * Get authors ordered by number of books (most popular first)
 */
export async function getAuthorsByPopularity(): Promise<AuthorRow[]> {
  return await db
    .select()
    .from(authors)
    .orderBy(desc(authors.numBooks), authors.name);
}

/**
 * Upsert a single author
 */
export async function upsertAuthor(row: NewAuthorRow): Promise<AuthorRow> {
  const result = await db
    .insert(authors)
    .values(row)
    .onConflictDoUpdate({
      target: authors.id,
      set: {
        name: row.name,
        imageUrl: row.imageUrl,
        numBooks: row.numBooks,
      },
    })
    .returning();

  return result[0];
}

/**
 * Upsert multiple authors
 */
export async function upsertAuthors(rows: NewAuthorRow[]): Promise<void> {
  if (rows.length === 0) return;

  for (const row of rows) {
    await upsertAuthor(row);
  }
}

/**
 * Update author book count
 */
export async function updateAuthorBookCount(authorId: string, count: number): Promise<void> {
  await db
    .update(authors)
    .set({ numBooks: count })
    .where(eq(authors.id, authorId));
}

/**
 * Author display row for lists
 */
export interface AuthorListRow {
  id: string;
  name: string;
  imageUrl: string | null;
  numBooks: number;
}

/**
 * Transform authors for display in lists
 */
export function transformAuthorsToDisplayFormat(authors: AuthorRow[]): AuthorListRow[] {
  return authors.map(author => ({
    id: author.id,
    name: author.name || 'Unknown Author',
    imageUrl: author.imageUrl,
    numBooks: author.numBooks || 0,
  }));
}
