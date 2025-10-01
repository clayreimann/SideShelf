import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { mediaMetadata } from './mediaMetadata';

export const audioFiles = sqliteTable('audio_files', {
  id: text('id').primaryKey(), // Generated from mediaId + index
  mediaId: text('media_id').notNull().references(() => mediaMetadata.id, { onDelete: 'cascade' }),
  index: integer('index').notNull(),
  ino: text('ino').notNull(),
  filename: text('filename').notNull(),
  ext: text('ext'),
  path: text('path').notNull(),
  relPath: text('rel_path'),
  size: integer('size'),
  mtimeMs: real('mtime_ms'),
  ctimeMs: real('ctime_ms'),
  birthtimeMs: real('birthtime_ms'),
  addedAt: integer('added_at'),
  updatedAt: integer('updated_at'),
  trackNumFromMeta: integer('track_num_from_meta'),
  discNumFromMeta: integer('disc_num_from_meta'),
  trackNumFromFilename: integer('track_num_from_filename'),
  discNumFromFilename: integer('disc_num_from_filename'),
  manuallyVerified: integer('manually_verified', { mode: 'boolean' }),
  exclude: integer('exclude', { mode: 'boolean' }),
  error: text('error'),
  format: text('format'),
  duration: real('duration'),
  bitRate: integer('bit_rate'),
  language: text('language'),
  codec: text('codec'),
  timeBase: text('time_base'),
  channels: integer('channels'),
  channelLayout: text('channel_layout'),
  embeddedCoverArt: text('embedded_cover_art'),
  mimeType: text('mime_type'),
  // Audio meta tags
  tagAlbum: text('tag_album'),
  tagArtist: text('tag_artist'),
  tagGenre: text('tag_genre'),
  tagTitle: text('tag_title'),
  tagSeries: text('tag_series'),
  tagSeriesPart: text('tag_series_part'),
  tagSubtitle: text('tag_subtitle'),
  tagAlbumArtist: text('tag_album_artist'),
  tagDate: text('tag_date'),
  tagComposer: text('tag_composer'),
  tagPublisher: text('tag_publisher'),
  tagComment: text('tag_comment'),
  tagLanguage: text('tag_language'),
  tagASIN: text('tag_asin'),
  // Note: Download state moved to localAudioFileDownloads table to prevent loss during API updates
});

export type AudioFileRow = typeof audioFiles.$inferSelect;
export type NewAudioFileRow = typeof audioFiles.$inferInsert;
