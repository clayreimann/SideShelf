/**
 * Database schema types and related interfaces
 *
 * These types are inferred from Drizzle schema definitions
 * and used throughout the application for database operations.
 */

import type { LibraryItemDisplayRow } from './components';
import { audioFiles } from '@/db/schema/audioFiles';
import { authors } from '@/db/schema/authors';
import { chapters } from '@/db/schema/chapters';
import { genres } from '@/db/schema/genres';
import { languages } from '@/db/schema/languages';
import { libraries } from '@/db/schema/libraries';
import { libraryFiles } from '@/db/schema/libraryFiles';
import { libraryItems } from '@/db/schema/libraryItems';
import { mediaAuthors, mediaGenres, mediaNarrators, mediaSeries, mediaTags } from '@/db/schema/mediaJoins';
import { mediaMetadata } from '@/db/schema/mediaMetadata';
import { mediaProgress } from '@/db/schema/mediaProgress';
import { narrators } from '@/db/schema/narrators';
import { series } from '@/db/schema/series';
import { tags } from '@/db/schema/tags';
import { users } from '@/db/schema/users';

// Core table row types (inferred from schema)
export type UserRow = typeof users.$inferSelect;
export type LibraryRow = typeof libraries.$inferSelect;
export type LibraryItemRow = typeof libraryItems.$inferSelect;
export type LibraryFileRow = typeof libraryFiles.$inferSelect;
export type AudioFileRow = typeof audioFiles.$inferSelect;
export type ChapterRow = typeof chapters.$inferSelect;
export type MediaMetadataRow = typeof mediaMetadata.$inferSelect;
export type MediaProgressRow = typeof mediaProgress.$inferSelect;
export type AuthorRow = typeof authors.$inferSelect;
export type SeriesRow = typeof series.$inferSelect;
export type GenreRow = typeof genres.$inferSelect;
export type NarratorRow = typeof narrators.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type LanguageRow = typeof languages.$inferSelect;

// Media join table types
export type MediaAuthorRow = typeof mediaAuthors.$inferSelect;
export type MediaGenreRow = typeof mediaGenres.$inferSelect;
export type MediaSeriesRow = typeof mediaSeries.$inferSelect;
export type MediaTagRow = typeof mediaTags.$inferSelect;
export type MediaNarratorRow = typeof mediaNarrators.$inferSelect;

// Insert types (for creating new records)
export type NewUserRow = typeof users.$inferInsert;
export type NewLibraryRow = typeof libraries.$inferInsert;
export type NewLibraryItemRow = typeof libraryItems.$inferInsert;
export type NewLibraryFileRow = typeof libraryFiles.$inferInsert;
export type NewAudioFileRow = typeof audioFiles.$inferInsert;
export type NewChapterRow = typeof chapters.$inferInsert;
export type NewMediaMetadataRow = typeof mediaMetadata.$inferInsert;
export type NewMediaProgressRow = typeof mediaProgress.$inferInsert;
export type NewAuthorRow = typeof authors.$inferInsert;
export type NewSeriesRow = typeof series.$inferInsert;
export type NewGenreRow = typeof genres.$inferInsert;
export type NewNarratorRow = typeof narrators.$inferInsert;
export type NewTagRow = typeof tags.$inferInsert;
export type NewLanguageRow = typeof languages.$inferInsert;

// Media join insert types
export type NewMediaAuthorRow = typeof mediaAuthors.$inferInsert;
export type NewMediaGenreRow = typeof mediaGenres.$inferInsert;
export type NewMediaSeriesRow = typeof mediaSeries.$inferInsert;
export type NewMediaTagRow = typeof mediaTags.$inferInsert;
export type NewMediaNarratorRow = typeof mediaNarrators.$inferInsert;

// Specialized types for database operations

/**
 * Library item list row type alias for sorting operations
 * This matches LibraryItemDisplayRow and includes all fields needed for sorting
 */
export type LibraryItemListRow = LibraryItemDisplayRow;

/**
 * Home screen item interface for displaying items on the home screen
 */
export interface HomeScreenItem {
  id: string;
  title: string;
  author: string;
  narrator: string | null;
  duration: number;
  coverUri: string;
  progress: number;
  isFinished: boolean;
  lastUpdate: number;
}
