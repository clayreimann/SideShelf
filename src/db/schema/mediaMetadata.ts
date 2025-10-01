import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { libraryItems } from './libraryItems';

// Consolidated media metadata table for both books and podcasts
export const mediaMetadata = sqliteTable('media_metadata', {
  id: text('id').primaryKey(),
  libraryItemId: text('library_item_id').notNull().references(() => libraryItems.id, { onDelete: 'cascade' }),
  mediaType: text('media_type').notNull(), // 'book' or 'podcast'

  // Common fields
  title: text('title'),
  subtitle: text('subtitle'),
  description: text('description'),
  language: text('language'),
  explicit: integer('explicit', { mode: 'boolean' }),
  author: text('author'), // For podcasts, this is the main author/creator

  // ApiBook-specific fields
  publisher: text('publisher'),
  isbn: text('isbn'),
  asin: text('asin'),
  publishedYear: text('published_year'),
  publishedDate: text('published_date'),
  duration: real('duration'),
  trackCount: integer('track_count'),
  format: text('format'),
  edition: text('edition'),
  abridged: integer('abridged', { mode: 'boolean' }),
  rating: real('rating'),
  ratingCount: integer('rating_count'),
  goodreadsId: text('goodreads_id'),
  googleBooksId: text('google_books_id'),

  // ApiPodcast-specific fields
  feedUrl: text('feed_url'),
  imageUrl: text('image_url'), // This will be populated from API, local covers stored in localCoverCache
  itunesPageUrl: text('itunes_page_url'),
  itunesId: text('itunes_id'),
  itunesArtistId: text('itunes_artist_id'),
  type: text('type'), // ApiPodcast type

  // Computed/derived fields from API
  authorName: text('author_name'), // Concatenated author names for books
  authorNameLF: text('author_name_lf'), // Last, First format
  narratorName: text('narrator_name'), // Concatenated narrator names
  seriesName: text('series_name'), // Concatenated series names

  // Timestamps
  addedAt: integer('added_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

export type MediaMetadataRow = typeof mediaMetadata.$inferSelect;
export type NewMediaMetadataRow = typeof mediaMetadata.$inferInsert;
