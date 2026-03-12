/**
 * wipeUserData — delete all user-specific data from the local database.
 *
 * Called on explicit logout and server switch to ensure no data from the
 * previous user/server leaks into a new session.
 *
 * Tables wiped (all rows deleted, no WHERE clause):
 *   pending_bookmark_ops, bookmarks,
 *   media_progress, library_items, media_metadata, audio_files, chapters,
 *   authors, series, media_genres, media_tags, media_authors, media_series,
 *   media_narrators
 *
 * Tables intentionally kept:
 *   users     — needed for re-login matching
 *   logger tables — log data is independent of user session
 */

import { db } from "../client";
import { audioFiles } from "../schema/audioFiles";
import { bookmarks, pendingBookmarkOps } from "../schema/bookmarks";
import { authors } from "../schema/authors";
import { chapters } from "../schema/chapters";
import { genres } from "../schema/genres";
import { libraryItems } from "../schema/libraryItems";
import {
  mediaAuthors,
  mediaGenres,
  mediaNarrators,
  mediaSeries,
  mediaTags,
} from "../schema/mediaJoins";
import { mediaMetadata } from "../schema/mediaMetadata";
import { mediaProgress } from "../schema/mediaProgress";
import { narrators } from "../schema/narrators";
import { series } from "../schema/series";
import { tags } from "../schema/tags";

/**
 * Delete all user-specific rows from every content table.
 *
 * Order matters: child tables (join tables, audio_files, chapters) must be
 * deleted before their parents to satisfy foreign-key constraints, even though
 * most tables use ON DELETE CASCADE — being explicit here avoids surprises.
 */
export async function wipeUserData(): Promise<void> {
  // Bookmark sync queue first (references users only, no FK to content tables)
  await db.delete(pendingBookmarkOps);
  await db.delete(bookmarks);

  // Join tables first (reference mediaMetadata, authors, series, etc.)
  await db.delete(mediaAuthors);
  await db.delete(mediaGenres);
  await db.delete(mediaSeries);
  await db.delete(mediaTags);
  await db.delete(mediaNarrators);

  // Child content tables
  await db.delete(audioFiles);
  await db.delete(chapters);
  await db.delete(mediaProgress);

  // Parent content tables
  await db.delete(mediaMetadata);
  await db.delete(libraryItems);
  await db.delete(authors);
  await db.delete(series);
  await db.delete(genres);
  await db.delete(tags);
  await db.delete(narrators);
}
