/**
 * Player-related type definitions
 *
 * This file contains all types related to the audio player functionality.
 */

import type { AudioFileWithDownloadInfo } from '@/db/helpers/combinedQueries';
import type { ChapterRow } from '@/db/schema/chapters';

/**
 * Track information for the player
 */
export interface PlayerTrack {
  /** Library item ID */
  libraryItemId: string;
  /** Media metadata ID */
  mediaId: string;
  /** Track title */
  title: string;
  /** Author name */
  author: string;
  /** Cover image URI */
  coverUri: string | null;
  /** Audio files for this track with download information */
  audioFiles: AudioFileWithDownloadInfo[];
  /** Chapters for this track */
  chapters: ChapterRow[];
  /** Total duration in seconds */
  duration: number;
  /** Whether files are downloaded locally */
  isDownloaded: boolean;
}

/**
 * Current chapter information
 */
export interface CurrentChapter {
  /** Chapter data */
  chapter: ChapterRow;
  /** Position within chapter in seconds */
  positionInChapter: number;
  /** Chapter duration in seconds */
  chapterDuration: number;
}
