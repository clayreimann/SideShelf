import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { authors } from './authors';
import { genres } from './genres';
import { mediaMetadata } from './mediaMetadata';
import { narrators } from './narrators';
import { series } from './series';
import { tags } from './tags';

// Join table for media metadata and authors (many-to-many)
export const mediaAuthors = sqliteTable('media_authors', {
  mediaId: text('media_id').notNull().references(() => mediaMetadata.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references(() => authors.id, { onDelete: 'cascade' }),
}/*, (table) => ([
    index('pk').on(table.mediaId, table.authorId),
])*/);

// Join table for media metadata and genres (many-to-many)
export const mediaGenres = sqliteTable('media_genres', {
  mediaId: text('media_id').notNull().references(() => mediaMetadata.id, { onDelete: 'cascade' }),
  genreName: text('genre_name').notNull().references(() => genres.name, { onDelete: 'cascade' }),
}/*, (table) => ([
    index('pk').on(table.mediaId, table.genreName),
])*/);

// Join table for media metadata and series (many-to-many)
export const mediaSeries = sqliteTable('media_series', {
  mediaId: text('media_id').notNull().references(() => mediaMetadata.id, { onDelete: 'cascade' }),
  seriesId: text('series_id').notNull().references(() => series.id, { onDelete: 'cascade' }),
  sequence: text('sequence'), // Series sequence number/position
}/*, (table) => ([
    index('pk').on(table.mediaId, table.seriesId),
])*/);

// Join table for media metadata and tags (many-to-many)
export const mediaTags = sqliteTable('media_tags', {
  mediaId: text('media_id').notNull().references(() => mediaMetadata.id, { onDelete: 'cascade' }),
  tagName: text('tag_name').notNull().references(() => tags.name, { onDelete: 'cascade' }),
}/*, (table) => ([
    index('pk').on(table.mediaId, table.tagName),
])*/);

// Join table for media metadata and narrators (many-to-many) - for books only
export const mediaNarrators = sqliteTable('media_narrators', {
  mediaId: text('media_id').notNull().references(() => mediaMetadata.id, { onDelete: 'cascade' }),
  narratorName: text('narrator_name').notNull().references(() => narrators.name, { onDelete: 'cascade' }),
}/*, (table) => ([
    index('pk').on(table.mediaId, table.narratorName),
])*/);

export type MediaAuthorRow = typeof mediaAuthors.$inferSelect;
export type MediaGenreRow = typeof mediaGenres.$inferSelect;
export type MediaSeriesRow = typeof mediaSeries.$inferSelect;
export type MediaTagRow = typeof mediaTags.$inferSelect;
export type MediaNarratorRow = typeof mediaNarrators.$inferSelect;
