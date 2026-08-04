/**
 * Now Playing Metadata
 *
 * Pure library function for updating the iOS/Android lock screen and now-playing
 * center with chapter-relative metadata.
 *
 * Accepts explicit parameters so callers (the coordinator, service collaborators)
 * can use their own authoritative data rather than reading from the Zustand store.
 * This avoids a one-tick lag and removes a React-state dependency from what is
 * purely a native API call.
 *
 * Algorithm: the track's absolute playback position is converted to a
 * chapter-relative elapsed time so the lock screen progress bar represents
 * progress within the current chapter, not the full book.
 */

import { formatTime } from "@/lib/helpers/formatters";
import { configureTrackPlayer } from "@/lib/trackPlayerConfig";
import { logger } from "@/lib/logger";
import type { ChapterRow } from "@/types/database";
import type { PlayerTrack } from "@/types/player";
import TrackPlayer from "react-native-track-player";

const log = logger.forTag("NowPlayingMetadata");

/**
 * Find the chapter that contains `position` (seconds from the start of the book).
 * Clamps to the first or last chapter when the position falls outside all known ranges.
 */
function resolveChapterAtPosition(chapters: ChapterRow[], position: number): ChapterRow {
  const inRange = chapters.find((c) => position >= c.start && position < c.end);
  if (inRange) return inRange;
  return position >= chapters[chapters.length - 1].end
    ? chapters[chapters.length - 1]
    : chapters[0];
}

/**
 * Convert a remote lock-screen seek position into the track's absolute timeline.
 *
 * Now-playing metadata reports chapter-relative time when chapters are available,
 * so iOS sends RemoteSeek positions relative to the chapter currently displayed.
 */
export function resolveAbsoluteRemoteSeekPosition(
  track: PlayerTrack | null,
  currentAbsolutePosition: number,
  remotePosition: number
): number {
  const trackDuration = Math.max(0, track?.duration ?? 0);
  if (!track?.chapters.length) {
    return trackDuration > 0
      ? Math.max(0, Math.min(trackDuration, remotePosition))
      : Math.max(0, remotePosition);
  }

  const chapter = resolveChapterAtPosition(track.chapters, currentAbsolutePosition);
  const chapterDuration = Math.max(0, chapter.end - chapter.start);
  const relative = Math.max(0, Math.min(chapterDuration, remotePosition));
  return Math.max(0, Math.min(trackDuration || chapter.end, chapter.start + relative));
}

/**
 * Push chapter-relative metadata to the iOS/Android now-playing center.
 *
 * @param track  The currently loaded PlayerTrack (provides chapters, title, author, artwork).
 * @param position  Absolute playback position in seconds (from the start of the book).
 */
export async function updateNowPlayingMetadata(
  track: PlayerTrack,
  position: number
): Promise<void> {
  if (!track.chapters?.length) {
    log.debug("[updateNowPlayingMetadata] No chapters, skipping");
    return;
  }

  const chapter = resolveChapterAtPosition(track.chapters, position);
  const chapterDuration = Math.max(0, chapter.end - chapter.start);
  const elapsedTime = Math.max(0, Math.min(chapterDuration, position - chapter.start));

  log.debug(
    `[updateNowPlayingMetadata] track=${track.libraryItemId} chapter=${chapter.id} elapsed=${formatTime(elapsedTime)}/${formatTime(chapterDuration)}`
  );

  const activeTrackIndex = await TrackPlayer.getActiveTrackIndex();
  if (activeTrackIndex == null || activeTrackIndex < 0) {
    log.warn("[updateNowPlayingMetadata] No active track index, skipping");
    return;
  }

  await TrackPlayer.updateMetadataForTrack(activeTrackIndex, {
    title: chapter.title,
    artist: track.author,
    album: track.title,
    artwork: track.coverUri || undefined,
    duration: chapterDuration,
    // @ts-ignore — elapsedTime is consumed by iOS native code (Metadata.swift) but absent from the TS types
    elapsedTime,
  });

  // Re-apply capabilities after metadata update to prevent lock screen controls from disappearing.
  await configureTrackPlayer();

  log.debug(
    `[updateNowPlayingMetadata] Updated: chapter="${chapter.title}" ${formatTime(elapsedTime)}/${formatTime(chapterDuration)}`
  );
}
