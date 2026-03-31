/**
 * Smart Rewind Helper
 *
 * Provides smart rewind functionality that automatically rewinds playback
 * based on pause duration. This is used by both PlayerService and
 * PlayerBackgroundService to ensure consistent behavior across all
 * playback resume scenarios (in-app, lock screen, duck events).
 */

import { getActiveSession } from "@/db/helpers/localListeningSessions";
import { getMediaProgressForLibraryItem } from "@/db/helpers/mediaProgress";
import { calculateSmartRewindTime, getSmartRewindEnabled } from "@/lib/appSettings";
import { formatTime } from "@/lib/helpers/formatters";
import { logger } from "@/lib/logger";
import { trace } from "@/lib/trace";
import { useAppStore } from "@/stores/appStore";
import { getCurrentUser } from "@/utils/userHelpers";
import TrackPlayer from "react-native-track-player";

const log = logger.forTag("SmartRewind");

/**
 * Apply smart rewind based on pause duration
 *
 * Checks if smart rewind is enabled and, if so, determines how long playback
 * has been paused and rewinds accordingly:
 * - Less than 10 seconds: No rewind
 * - 10s to 1 minute: 3 second rewind
 * - 1 to 5 minutes: 10 second rewind
 * - 5 to 30 minutes: 20 second rewind
 * - 30+ minutes: 30 second rewind
 *
 * The pause time is determined from (in priority order):
 * 1. In-memory pause time from current session (store.player.lastPauseTime)
 * 2. Active session update time from database
 * 3. Saved progress update time from database
 *
 * @param currentPosition Optional current position. If provided, uses this instead of reading from TrackPlayer.
 *                        This prevents race conditions when TrackPlayer hasn't finished seeking yet.
 */
export async function applySmartRewind(currentPosition?: number): Promise<void> {
  const span = trace.startSpan("player.play.smart_rewind");

  // Check if smart rewind is enabled
  const smartRewindEnabled = await getSmartRewindEnabled();
  if (!smartRewindEnabled) {
    trace.endSpan(span, "ok", { enabled: false });
    return;
  }
  const store = useAppStore.getState();
  let lastPlayedTime: number | null = null;
  let lastPlayedSource: "memory" | "active_session" | "saved_progress" | "none" = "none";

  // First, try to use the in-memory pause time from playerSlice
  if (store.player.lastPauseTime) {
    lastPlayedTime = store.player.lastPauseTime;
    lastPlayedSource = "memory";
    log.info(
      `Using current session pause time for smart rewind: ${new Date(lastPlayedTime).toISOString()}`
    );
  } else if (store.player.currentTrack?.libraryItemId) {
    // Cold boot scenario - check the database for last played time
    try {
      const user = await getCurrentUser();
      if (!user || !user.id) {
        log.info("No user found, skipping smart rewind");
        trace.endSpan(span, "ok", {
          enabled: true,
          source: "none",
          rewindSeconds: 0,
          earlyExit: "no_user",
        });
        return;
      }

      const activeSession = await getActiveSession(
        user.id,
        store.player.currentTrack.libraryItemId
      );
      const savedProgress = await getMediaProgressForLibraryItem(
        store.player.currentTrack.libraryItemId,
        user.id
      );

      // Use whichever was updated most recently
      if (activeSession && savedProgress?.lastUpdate) {
        const sessionTime = activeSession.updatedAt.getTime();
        const progressTime = savedProgress.lastUpdate.getTime();

        if (sessionTime > progressTime) {
          lastPlayedTime = sessionTime;
          lastPlayedSource = "active_session";
          log.info(
            `Using active session update time for smart rewind: ${new Date(lastPlayedTime).toISOString()}`
          );
        } else {
          lastPlayedTime = progressTime;
          lastPlayedSource = "saved_progress";
          log.info(
            `Using saved progress update time for smart rewind: ${new Date(lastPlayedTime).toISOString()}`
          );
        }
      } else if (activeSession) {
        lastPlayedTime = activeSession.updatedAt.getTime();
        lastPlayedSource = "active_session";
        log.info(
          `Using active session update time for smart rewind: ${new Date(lastPlayedTime).toISOString()}`
        );
      } else if (savedProgress?.lastUpdate) {
        lastPlayedTime = savedProgress.lastUpdate.getTime();
        lastPlayedSource = "saved_progress";
        log.info(
          `Using saved progress update time for smart rewind: ${new Date(lastPlayedTime).toISOString()}`
        );
      }
    } catch (error) {
      log.error("Failed to get last played time from database for smart rewind", error as Error);
      trace.recordError(error, span);
      trace.endSpan(span, "error");
      return;
    }
  }

  // Apply smart rewind if we have a last played time
  if (lastPlayedTime) {
    const rewindSeconds = calculateSmartRewindTime(lastPlayedTime);
    if (rewindSeconds > 0) {
      // Use provided position or read from TrackPlayer
      const position =
        currentPosition !== undefined
          ? currentPosition
          : (await TrackPlayer.getProgress()).position;
      const newPosition = Math.max(0, position - rewindSeconds);
      log.info(
        `Smart rewind: jumping back ${rewindSeconds}s (from ${formatTime(position)} to ${formatTime(newPosition)})`
      );
      useAppStore.getState().updatePosition(newPosition);
      await TrackPlayer.seekTo(newPosition);
      trace.endSpan(span, "ok", {
        enabled: true,
        source: lastPlayedSource,
        rewindSeconds,
        positionBeforeMs: Math.round(position * 1000),
        positionAfterMs: Math.round(newPosition * 1000),
      });
      return;
    }
  } else {
    log.info("No last played time available, skipping smart rewind");
  }

  trace.endSpan(span, "ok", {
    enabled: true,
    source: lastPlayedSource,
    rewindSeconds: 0,
  });
}
