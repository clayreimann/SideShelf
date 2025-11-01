/**
 * Now Playing Metadata Helper
 *
 * Handles updating TrackPlayer's now playing metadata with chapter information.
 * This is a standalone helper to avoid circular dependencies between PlayerService
 * and PlayerBackgroundService.
 *
 * TODO: move this to the playerSlice since that's the only
 */

import { formatTime } from '@/lib/helpers/formatters';
import { logger } from '@/lib/logger';
import { useAppStore } from '@/stores/appStore';
import TrackPlayer from 'react-native-track-player';

const log = logger.forTag('PlayerNowPlaying');

/**
 * Update now playing metadata with chapter information
 *
 * Updates the now playing center with:
 * - Title: Current chapter title
 * - Album: Book title
 * - Duration: Chapter duration (so progress bar shows chapter progress)
 * - Elapsed time: Chapter-relative position (resets to 0 at start of each chapter)
 *
 * Note: TrackPlayer's actual playback position is always absolute (book position),
 * but we set elapsedTime to chapter-relative position so the now playing center
 * shows progress within the current chapter.
 */
export async function updateNowPlayingMetadata(): Promise<void> {
  try {
    const store = useAppStore.getState();
    const { currentTrack, currentChapter } = store.player;
    log.debug('Updating now playing metadata');

    if (!currentTrack || !currentChapter) {
      // No chapter info - use default track metadata
      return;
    }

    // Use chapter-relative position for elapsed time
    // positionInChapter is calculated as: absolutePosition - chapter.start
    const chapterElapsedTime = currentChapter.positionInChapter;
    const chapterDuration = currentChapter.chapterDuration;
    const chapterTitle = currentChapter.chapter.title;
    const bookTitle = currentTrack.title;
    const author = currentTrack.author;

    // Get the active track index to update its metadata
    const activeTrackIndex = await TrackPlayer.getActiveTrackIndex();
    if (!activeTrackIndex) {
      return;
    }

    // Update now playing metadata with chapter info
    // TrackPlayer will use this for the lock screen and notification controls
    await TrackPlayer.updateMetadataForTrack(activeTrackIndex, {
      title: chapterTitle,
      artist: author,
      album: bookTitle,
      artwork: currentTrack.coverUri || undefined,
      duration: chapterDuration,
      // @ts-ignore - elapsedTime is used by iOS native code (Metadata.swift) but not in TypeScript types
      elapsedTime: chapterElapsedTime,
    });

    log.debug(`Updated now playing: chapter="${chapterTitle}" elapsed=${formatTime(chapterElapsedTime)}/${formatTime(chapterDuration)}`);
  } catch (error) {
    log.error('Failed to update now playing metadata:', error as Error);
  }
}
