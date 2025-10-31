import { db } from '@/db/client';
import { chapters } from '@/db/schema/chapters';
import { eq } from 'drizzle-orm';

export type NewChapterRow = typeof chapters.$inferInsert;
export type ChapterRow = typeof chapters.$inferSelect;

// Chapter interface from API (based on the sample data)
export interface ApiChapter {
  id: number;
  start: number;
  end: number;
  title: string;
}

// Marshal Chapter from API to database row
export function marshalChapterFromApi(mediaId: string, apiChapter: ApiChapter): NewChapterRow {
  return {
    id: `${mediaId}_${apiChapter.id}`,
    mediaId,
    chapterId: apiChapter.id,
    start: apiChapter.start,
    end: apiChapter.end,
    title: apiChapter.title,
  };
}

// Upsert a single chapter
export async function upsertChapter(chapter: NewChapterRow): Promise<ChapterRow> {
  const results = await db
    .select()
    .from(chapters)
    .where(eq(chapters.id, chapter.id))
    .limit(1);
  const existing = results[0];

  if (existing) {
    const [updated] = await db
      .update(chapters)
      .set(chapter)
      .where(eq(chapters.id, chapter.id))
      .returning();
    return updated;
  }

  const [inserted] = await db.insert(chapters).values(chapter).returning();
  return inserted;
}

// Upsert multiple chapters
export async function upsertChapters(chapterRows: NewChapterRow[]): Promise<void> {
  if (chapterRows.length === 0) return;

  // Use a transaction for batch operations
  await db.transaction(async (tx) => {
    for (const chapter of chapterRows) {
      const results = await tx
        .select()
        .from(chapters)
        .where(eq(chapters.id, chapter.id))
        .limit(1);
      const existing = results[0];

      if (existing) {
        await tx
          .update(chapters)
          .set(chapter)
          .where(eq(chapters.id, chapter.id));
      } else {
        await tx.insert(chapters).values(chapter);
      }
    }
  });
}

// Get chapters for a media item
export async function getChaptersForMedia(mediaId: string): Promise<ChapterRow[]> {
  return db
    .select()
    .from(chapters)
    .where(eq(chapters.mediaId, mediaId))
    .orderBy(chapters.chapterId);
}

// Delete chapters for a media item
export async function deleteChaptersForMedia(mediaId: string): Promise<void> {
  await db.delete(chapters).where(eq(chapters.mediaId, mediaId));
}

/**
 * Get chapters that have already been played (position > chapter.end)
 */
export function getPlayedChapters(chapterList: ChapterRow[], currentPosition: number): ChapterRow[] {
  return chapterList.filter((chapter) => currentPosition > chapter.end);
}

/**
 * Get chapters that are upcoming (position < chapter.end)
 * Includes the current chapter if one exists
 */
export function getUpcomingChapters(chapterList: ChapterRow[], currentPosition: number): ChapterRow[] {
  return chapterList.filter((chapter) => currentPosition < chapter.end);
}

/**
 * Get the index of the current chapter based on position
 * Returns -1 if no chapter matches
 */
export function getCurrentChapterIndex(chapterList: ChapterRow[], currentPosition: number): number {
  return chapterList.findIndex(
    (chapter) => currentPosition >= chapter.start && currentPosition < chapter.end
  );
}
