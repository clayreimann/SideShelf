import { db } from '@/db/client';
import { libraries } from '@/db/schema/libraries';
import type { ApiLibrariesResponse, ApiLibrary } from '@/types/api';
import { eq } from 'drizzle-orm';

export type NewLibraryRow = typeof libraries.$inferInsert;
export type LibraryRow = typeof libraries.$inferSelect;

// Marshal a single ApiLibrary from API to database row
export function marshalLibraryFromApi(library: ApiLibrary): NewLibraryRow {
  return {
    id: library.id,
    name: library.name,
    icon: library.icon || null,
    displayOrder: library.displayOrder || null,
    mediaType: library.mediaType || null,
    createdAt: library.createdAt || null,
    updatedAt: library.lastUpdate || null,
  };
}

// Marshal libraries from API response
export function marshalLibrariesFromResponse(response: ApiLibrariesResponse): NewLibraryRow[] {
  return response.libraries.map(marshalLibraryFromApi);
}

// Upsert a single library
export async function upsertLibrary(row: NewLibraryRow): Promise<void> {
  await db
    .insert(libraries)
    .values(row)
    .onConflictDoUpdate({ target: libraries.id, set: row });
}

// Upsert multiple libraries
export async function upsertLibraries(rows: NewLibraryRow[]): Promise<void> {
  if (!rows?.length) return;

  for (const row of rows) {
    await upsertLibrary(row);
  }
}

// Get all libraries from database
export async function getAllLibraries(): Promise<LibraryRow[]> {
  return await db
    .select()
    .from(libraries)
    .orderBy(libraries.displayOrder, libraries.name);
}

// Get a single library by ID
export async function getLibraryById(id: string): Promise<LibraryRow | null> {
  const result = await db
    .select()
    .from(libraries)
    .where(eq(libraries.id, id))
    .limit(1);

  return result[0] || null;
}

// Delete all libraries (useful for refresh scenarios)
export async function deleteAllLibraries(): Promise<void> {
  await db.delete(libraries);
}
