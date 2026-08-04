/**
 * Player-related type definitions
 *
 * This file contains all types related to the audio player functionality.
 */

import type { AudioFileWithDownloadInfo } from "@/db/helpers/combinedQueries";
import type { ChapterRow } from "@/db/schema/chapters";

export type JumpSurface = "full_screen" | "item_detail" | "lock_screen" | "native_player";

export type JumpCategory =
  | "scrub"
  | "skip_forward"
  | "skip_backward"
  | "chapter"
  | "bookmark"
  | "unexpected_native";

export interface JumpDescriptor {
  surface: JumpSurface;
  category: JumpCategory;
}

export interface JumpHistoryEntry extends JumpDescriptor {
  id: string;
  sessionId: string | null;
  libraryItemId: string;
  fromPosition: number;
  toPosition: number;
  createdAt: number;
  updatedAt: number;
  toastPending: boolean;
}

export interface JumpHistorySession {
  version: 1;
  libraryItemId: string;
  entries: JumpHistoryEntry[];
}

export type JumpRecordInput = Omit<JumpHistoryEntry, "toastPending">;

/**
 * Track information for the player
 */
export interface PlayerTrack {
  /** Library item ID */
  libraryItemId: string;
  /** Podcast episode ID, when this track represents an episode */
  episodeId?: string;
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
