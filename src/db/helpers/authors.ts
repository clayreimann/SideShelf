/**
 * Authors database helper functions
 *
 * This module provides functions for managing authors in the database,
 * including fetching, upserting, and transforming author data.
 */

import { getAuthorImageUri, isAuthorImageCached } from '@/lib/authorImages';
import { count, desc, eq } from 'drizzle-orm';
import { db } from '../client';
import { AuthorRow, authors } from '../schema/authors';
import { mediaAuthors } from '../schema/mediaJoins';

export type NewAuthorRow = typeof authors.$inferInsert;
export type { AuthorRow };

/**
 * Get all authors from database, ordered by name
 * Calculates book counts from mediaAuthors join table
 */
export async function getAllAuthors(): Promise<AuthorRow[]> {
  try {
    // Get all authors
    const allAuthors = await db
      .select()
      .from(authors)
      .orderBy(authors.name);

    if (allAuthors.length === 0) {
      return [];
    }

    // Get book counts for all authors in a single query using GROUP BY
    const bookCountsMap = new Map<string, number>();

    // Query all media-author relationships and count them
    const authorBookCounts = await db
      .select({
        authorId: mediaAuthors.authorId,
        count: count(),
      })
      .from(mediaAuthors)
      .groupBy(mediaAuthors.authorId);

    // Build the map
    for (const row of authorBookCounts) {
      bookCountsMap.set(row.authorId, row.count);
    }

    // Update authors with book counts and return
    // Batch updates for better performance
    const authorsWithCounts: AuthorRow[] = [];
    const updates: Array<{ id: string; numBooks: number }> = [];

    for (const author of allAuthors) {
      const bookCount = bookCountsMap.get(author.id) ?? 0;
      authorsWithCounts.push({
        ...author,
        numBooks: bookCount,
      });

      // Collect updates (only if different)
      if (author.numBooks !== bookCount) {
        updates.push({ id: author.id, numBooks: bookCount });
      }
    }

    // Batch update all authors that need updating
    if (updates.length > 0) {
      await Promise.all(
        updates.map(update =>
          db.update(authors)
            .set({ numBooks: update.numBooks })
            .where(eq(authors.id, update.id))
        )
      );
    }

    return authorsWithCounts;
  } catch (error) {
    console.error('[getAllAuthors] Error fetching authors:', error);
    // Return authors without book counts if calculation fails
    return await db
      .select()
      .from(authors)
      .orderBy(authors.name);
  }
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
 * ApiAuthor display row for lists
 */
export interface AuthorListRow {
  id: string;
  name: string;
  nameLF: string; // Last name first format for sorting
  imageUrl: string | null;
  numBooks: number;
  cachedImageUri: string | null; // Local cached image URI
}

/**
 * Convert author name to "Last, First" format if possible
 * Handles formats like "First Last", "Last, First", "First Middle Last", etc.
 */
function convertToLastFirst(name: string): string {
  if (!name) return name;

  // If already in "Last, First" format, return as is
  if (name.includes(',')) {
    return name;
  }

  // Try to convert "First Last" to "Last, First"
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    const lastName = parts[parts.length - 1];
    const firstName = parts.slice(0, -1).join(' ');
    return `${lastName}, ${firstName}`;
  }

  // If single word, return as is
  return name;
}

/**
 * Transform authors for display in lists
 * Checks for cached images and sets cachedImageUri if found
 */
export function transformAuthorsToDisplayFormat(authors: AuthorRow[]): AuthorListRow[] {
  return authors.map(author => {
    // Check if image is already cached locally
    let cachedImageUri: string | null = null;
    if (isAuthorImageCached(author.id)) {
      cachedImageUri = getAuthorImageUri(author.id);
    }

    return {
      id: author.id,
      name: author.name || 'Unknown ApiAuthor',
      nameLF: convertToLastFirst(author.name || 'Unknown ApiAuthor'),
      imageUrl: author.imageUrl,
      numBooks: author.numBooks || 0,
      cachedImageUri, // Set from cache if available
    };
  });
}
