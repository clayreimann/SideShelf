/**
 * Track Player Background Service
 *
 * This service is required by react-native-track-player to handle
 * background playback events and remote control events.
 * Handles comprehensive progress syncing using TrackPlayer events.
 */

import { updateAudioFileLastAccessed } from "@/db/helpers/localData";
import { getPeriodicNowPlayingUpdatesEnabled } from "@/lib/appSettings";
import { formatTime } from "@/lib/helpers/formatters";
import { logger } from "@/lib/logger";
import { applySmartRewind } from "@/lib/smartRewind";
import { dispatchPlayerEvent } from "@/services/coordinator/eventBus";
import { getCoordinator } from "@/services/coordinator/PlayerStateCoordinator";
import { progressService } from "@/services/ProgressService";
import { useAppStore } from "@/stores/appStore";
import { getCurrentUser } from "@/utils/userHelpers";
import { AppState } from "react-native";
import TrackPlayer, {
  Event,
  PlaybackActiveTrackChangedEvent,
  PlaybackErrorEvent,
  PlaybackProgressUpdatedEvent,
  PlaybackState as PlaybackStateEvent,
  RemoteDuckEvent,
  RemoteJumpBackwardEvent,
  RemoteJumpForwardEvent,
  RemoteSeekEvent,
  State,
} from "react-native-track-player";

// Create a cached sublogger for this service (more efficient than calling logger.X('tag', ...) each time)
const log = logger.forTag("PlayerBackgroundService");
// Create a diagnostic logger for verbose diagnostic logging
const diagLog = logger.forDiagnostics("PlayerBackgroundService");

// Generate a unique ID for this module instance to detect multiple instances
const MODULE_INSTANCE_UUID = `BGS-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * HEADLESS JS ARCHITECTURE NOTE:
 *
 * On Android, this service runs in a SEPARATE JavaScript context from the main UI.
 * This means:
 * - There are TWO separate PlayerStateCoordinator instances (UI + background)
 * - NO shared memory between contexts
 * - Communication happens through: Native TrackPlayer state, Database, AsyncStorage
 *
 * The getCoordinator() call below ensures the background context has its own
 * coordinator instance to receive events dispatched from this service.
 * Both coordinators stay eventually consistent by observing the same native player.
 */
getCoordinator();

// Track meaningful listening time per library item
// Used to update lastAccessedAt after 2 minutes of cumulative playback
const MEANINGFUL_LISTEN_THRESHOLD = 2 * 60; // 2 minutes in seconds
const meaningfulListenTracker = new Map<
  string,
  {
    startTime: number;
    cumulativeTime: number;
    lastUpdateTime: number;
    hasUpdatedAccess: boolean;
  }
>();

function describeRuntimeContext(): string {
  const parts: string[] = [];
  parts.push(`uuid=${MODULE_INSTANCE_UUID}`);
  parts.push(typeof globalThis.window === "undefined" ? "no-window" : "window");
  parts.push(typeof globalThis.document === "undefined" ? "no-document" : "document");
  try {
    const state = AppState.currentState;
    parts.push(`AppState=${state ?? "unknown"}`);
  } catch {
    parts.push("AppState=unavailable");
  }
  parts.push(
    global.__playerBackgroundServiceInitializedAt !== undefined
      ? `initializedAt=${global.__playerBackgroundServiceInitializedAt}`
      : "initializedAt=none"
  );
  parts.push(__DEV__ ? "dev" : "prod");
  return parts.join(" ");
}

// Add type definitions for global properties
declare global {
  // eslint-disable-next-line no-var
  var __playerBackgroundServiceInitializedAt: number | undefined;
  // eslint-disable-next-line no-var
  var __playerBackgroundServiceSubscriptions: Array<() => void> | undefined;
}

/**
 * Handle remote play command
 */
async function handleRemotePlay(): Promise<void> {
  const progress = await TrackPlayer.getProgress();
  log.debug(
    `RemotePlay received progress=${formatTime(progress.position)} (${describeRuntimeContext()})`
  );

  // Apply smart rewind (checks enabled setting internally)
  await applySmartRewind(progress.position);

  // Clear pause time since we're resuming
  const store = useAppStore.getState();
  store._setLastPauseTime(null);

  dispatchPlayerEvent({ type: "PLAY" });
}

/**
 * Handle remote pause command
 */
async function handleRemotePause(): Promise<void> {
  log.debug(`RemotePause received (${describeRuntimeContext()})`);
  const store = useAppStore.getState();
  const pauseTime = Date.now();
  store._setLastPauseTime(pauseTime);
  log.info(`Pausing playback at ${new Date(pauseTime).toISOString()}`);
  dispatchPlayerEvent({ type: "PAUSE" });
}

/**
 * Helper to get userId and libraryItemId from playerSlice
 */
async function getUserIdAndLibraryItemId(): Promise<{
  userId: string;
  libraryItemId: string;
} | null> {
  const store = useAppStore.getState();
  const libraryItemId = store.player.currentTrack?.libraryItemId;
  if (!libraryItemId) {
    return null;
  }

  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  return { userId: user.id, libraryItemId };
}

/**
 * Handle remote stop command
 */
async function handleRemoteStop(): Promise<void> {
  log.debug(`RemoteStop received (${describeRuntimeContext()})`);
  dispatchPlayerEvent({ type: "STOP" });

  const ids = await getUserIdAndLibraryItemId();
  if (ids) {
    const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
    await progressService.endCurrentSession(ids.userId, ids.libraryItemId);

    // Clear meaningful listen tracker on stop
    meaningfulListenTracker.delete(ids.libraryItemId);

    if (session) {
      log.info(`Remote stop: session=${session.sessionId} item=${ids.libraryItemId}`);
    }
  }
}

/**
 * Handle remote jump forward command
 */
async function handleRemoteJumpForward(event: RemoteJumpForwardEvent): Promise<void> {
  log.debug(`RemoteJumpForward received interval=${event.interval} (${describeRuntimeContext()})`);
  const progress = await TrackPlayer.getProgress();
  const newPosition = progress.position + event.interval;

  dispatchPlayerEvent({
    type: "SEEK",
    payload: { position: newPosition },
  });

  try {
    const ids = await getUserIdAndLibraryItemId();
    if (ids) {
      const playbackRate = await TrackPlayer.getRate();
      const volume = await TrackPlayer.getVolume();
      const state = await TrackPlayer.getPlaybackState();

      await progressService.updateProgress(
        ids.userId,
        ids.libraryItemId,
        newPosition,
        playbackRate,
        volume,
        undefined,
        state.state === State.Playing
      );

      const store = useAppStore.getState();
      store.updatePosition(newPosition);

      const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
      if (session) {
        log.info(
          `Jump forward: position=${newPosition.toFixed(2)}s session=${session.sessionId} item=${ids.libraryItemId}`
        );
      }
    }
  } catch (error) {
    const ids = await getUserIdAndLibraryItemId();
    log.error(
      `Jump forward progress update error: ${(error as Error).message} item=${ids?.libraryItemId || "unknown"}`,
      error as Error
    );
  }
}

/**
 * Handle remote jump backward command
 */
async function handleRemoteJumpBackward(event: RemoteJumpBackwardEvent): Promise<void> {
  log.debug(`RemoteJumpBackward received interval=${event.interval} (${describeRuntimeContext()})`);
  const progress = await TrackPlayer.getProgress();
  const newPosition = Math.max(0, progress.position - event.interval);

  dispatchPlayerEvent({
    type: "SEEK",
    payload: { position: newPosition },
  });

  try {
    const ids = await getUserIdAndLibraryItemId();
    if (ids) {
      const playbackRate = await TrackPlayer.getRate();
      const volume = await TrackPlayer.getVolume();
      const state = await TrackPlayer.getPlaybackState();

      await progressService.updateProgress(
        ids.userId,
        ids.libraryItemId,
        newPosition,
        playbackRate,
        volume,
        undefined,
        state.state === State.Playing
      );

      const store = useAppStore.getState();
      store.updatePosition(newPosition);

      const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
      if (session) {
        log.info(
          `Jump backward: position=${newPosition.toFixed(2)}s session=${session.sessionId} item=${ids.libraryItemId}`
        );
      }
    }
  } catch (error) {
    const ids = await getUserIdAndLibraryItemId();
    log.error(
      `Jump backward progress update error: ${(error as Error).message} item=${ids?.libraryItemId || "unknown"}`,
      error as Error
    );
  }
}

/**
 * Handle remote next track command
 */
async function handleRemoteNext(): Promise<void> {
  log.debug(`RemoteNext received (${describeRuntimeContext()})`);
  await TrackPlayer.skipToNext();
}

/**
 * Handle remote previous track command
 */
async function handleRemotePrevious(): Promise<void> {
  log.debug(`RemotePrevious received (${describeRuntimeContext()})`);
  await TrackPlayer.skipToPrevious();
}

/**
 * Handle remote seek command
 */
async function handleRemoteSeek(event: RemoteSeekEvent): Promise<void> {
  log.debug(`RemoteSeek received position=${event.position} (${describeRuntimeContext()})`);

  dispatchPlayerEvent({
    type: "SEEK",
    payload: { position: event.position },
  });

  // Update progress immediately after seek
  try {
    const ids = await getUserIdAndLibraryItemId();
    if (ids) {
      const playbackRate = await TrackPlayer.getRate();
      const volume = await TrackPlayer.getVolume();
      const state = await TrackPlayer.getPlaybackState();

      await progressService.updateProgress(
        ids.userId,
        ids.libraryItemId,
        event.position,
        playbackRate,
        volume,
        undefined,
        state.state === State.Playing
      );

      // Update the store with new position after seek
      const store = useAppStore.getState();
      store.updatePosition(event.position);

      const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
      if (session) {
        log.info(
          `Seek: position=${formatTime(event.position)}s session=${session.sessionId} item=${ids.libraryItemId}`
        );
      }
    }
  } catch (error) {
    const ids = await getUserIdAndLibraryItemId();
    log.error(
      `Seek progress update error: ${(error as Error).message} item=${ids?.libraryItemId || "unknown"}`,
      error as Error
    );
  }
}

/**
 * Handle audio duck events (when other apps need audio focus)
 */
async function handleRemoteDuck(event: RemoteDuckEvent): Promise<void> {
  log.debug(
    `RemoteDuck received permanent=${event.permanent} paused=${event.paused} (${describeRuntimeContext()})`
  );
  try {
    const ids = await getUserIdAndLibraryItemId();
    if (ids) {
      const store = useAppStore.getState();

      if (event.permanent) {
        const pauseTime = Date.now();
        store._setLastPauseTime(pauseTime);
        log.info(`Pausing playback (permanent duck) at ${new Date(pauseTime).toISOString()}`);
        dispatchPlayerEvent({ type: "PAUSE" });
        await progressService.handleDuck(ids.userId, ids.libraryItemId, true);
      } else if (event.paused) {
        const pauseTime = Date.now();
        store._setLastPauseTime(pauseTime);
        log.info(`Pausing playback (duck) at ${new Date(pauseTime).toISOString()}`);
        dispatchPlayerEvent({ type: "PAUSE" });
        await progressService.handleDuck(ids.userId, ids.libraryItemId, true);
      } else {
        // Resuming from duck - apply smart rewind (checks enabled setting internally)
        await applySmartRewind();

        // Clear pause time since we're resuming
        store._setLastPauseTime(null);

        dispatchPlayerEvent({ type: "PLAY" });
        await progressService.handleDuck(ids.userId, ids.libraryItemId, false);
      }

      const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
      if (session) {
        log.info(
          `Audio duck: permanent=${event.permanent} paused=${event.paused} session=${session.sessionId} item=${ids.libraryItemId}`
        );
      }
    }
  } catch (error) {
    const ids = await getUserIdAndLibraryItemId();
    log.error(
      `Duck event error: ${(error as Error).message} item=${ids?.libraryItemId || "unknown"}`,
      error as Error
    );
  }
}

/**
 * Handle playback state changes (playing, paused, stopped, etc.)
 */
async function handlePlaybackStateChanged(event: PlaybackStateEvent): Promise<void> {
  try {
    // Phase 1: Dispatch to event bus
    dispatchPlayerEvent({
      type: "NATIVE_STATE_CHANGED",
      payload: { state: event.state },
    });

    // Clear loading state when playback actually starts
    if (event.state === State.Playing) {
      const store = useAppStore.getState();
      store._setTrackLoading(false);
    }

    const ids = await getUserIdAndLibraryItemId();
    if (ids) {
      const progress = await TrackPlayer.getProgress();
      const playbackRate = await TrackPlayer.getRate();
      const volume = await TrackPlayer.getVolume();
      const isPlaying = event.state === State.Playing;

      // Update the store with current position and playing state
      const store = useAppStore.getState();
      store.updatePosition(progress.position);
      store.updatePlayingState(isPlaying);

      await progressService.updateProgress(
        ids.userId,
        ids.libraryItemId,
        progress.position,
        playbackRate,
        volume,
        undefined,
        isPlaying
      );

      const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
      if (session) {
        log.info(
          `Playback state changed: state=${event.state} progress=${formatTime(progress.position)} uuid=${MODULE_INSTANCE_UUID} session=${session.sessionId} item=${ids.libraryItemId}`
        );
      }
    }
  } catch (error) {
    const ids = await getUserIdAndLibraryItemId();
    log.error(
      `Playback state change error: ${(error as Error).message} item=${ids?.libraryItemId || "unknown"}`,
      error as Error
    );
  }
}

/**
 * Handle playback progress updates (fired every second during playback)
 * This is where we check if periodic sync to server is needed
 */
async function handlePlaybackProgressUpdated(event: PlaybackProgressUpdatedEvent): Promise<void> {
  try {
    // Phase 1: Dispatch to event bus
    dispatchPlayerEvent({
      type: "NATIVE_PROGRESS_UPDATED",
      payload: { position: event.position, duration: event.duration, buffered: event.buffered },
    });

    const store = useAppStore.getState();
    const currentTrack = store.player.currentTrack;
    const ids = await getUserIdAndLibraryItemId();
    const previousChapter = store.player.currentChapter;

    if (ids) {
      const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);

      if (Math.floor(event.position) % 5 === 0) {
        const { id, title } = store.player.currentChapter?.chapter || { id: null, title: null };
        log.info(
          `Playback progress updated: position=${formatTime(event.position)} appState=${AppState.currentState} uuid=${MODULE_INSTANCE_UUID} session=${session?.sessionId || "none"} item=${ids.libraryItemId} chapter=${JSON.stringify({ id, title })}`
        );
      }
      const playbackRate = await TrackPlayer.getRate();
      const volume = await TrackPlayer.getVolume();
      const state = await TrackPlayer.getPlaybackState();
      const isPlaying = state.state === State.Playing;

      // Update session progress (DB is source of truth)
      await progressService.updateProgress(
        ids.userId,
        ids.libraryItemId,
        event.position,
        playbackRate,
        volume,
        undefined,
        isPlaying
      );

      // Sync store position from session (DB is source of truth after updateProgress)
      const updatedSession = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);

      if (updatedSession) {
        // Use session position as source of truth, not TrackPlayer position directly
        // Position is always absolute (book position), not chapter-relative
        store.updatePosition(updatedSession.currentTime);
      } else {
        // Fallback to TrackPlayer position if session not found
        // Position is absolute (book position)
        store.updatePosition(event.position);
      }

      // Check if chapter changed (non-gated update)
      const currentChapter = store.player.currentChapter;
      if (previousChapter?.chapter.id !== currentChapter?.chapter.id && currentChapter) {
        // Chapter changed - update now playing metadata immediately (non-gated)
        log.info(
          `Chapter changed from ${previousChapter?.chapter.id || "none"} to ${currentChapter.chapter.id}, updating now playing metadata`
        );
        await store.updateNowPlayingMetadata();
      }

      // Periodic now playing metadata updates (gated by setting)
      // Throttle to every 2 seconds to avoid excessive updates
      const periodicUpdatesEnabled = await getPeriodicNowPlayingUpdatesEnabled();
      if (periodicUpdatesEnabled && Math.floor(event.position) % 2 === 0) {
        await store.updateNowPlayingMetadata();
      }

      // Check sleep timer and pause if expired
      const { sleepTimer } = store.player;
      if (sleepTimer.type && isPlaying) {
        let shouldPause = false;

        if (sleepTimer.type === "duration" && sleepTimer.endTime) {
          // Time-based timer
          if (Date.now() >= sleepTimer.endTime) {
            shouldPause = true;
            log.info("Sleep timer expired (duration-based), pausing playback");
          }
        } else if (sleepTimer.type === "chapter" && currentChapter) {
          // Chapter-based timer
          const targetChapter =
            sleepTimer.chapterTarget === "current"
              ? currentChapter.chapter
              : currentTrack?.chapters.find((ch) => ch.start === currentChapter.chapter.end);

          if (targetChapter && event.position >= targetChapter.end) {
            shouldPause = true;
            log.info(
              `Sleep timer expired (end of ${sleepTimer.chapterTarget} chapter), pausing playback`
            );
          }
        }

        if (shouldPause) {
          // Cancel the timer and pause playback
          store.cancelSleepTimer();
          const pauseTime = Date.now();
          store._setLastPauseTime(pauseTime);
          dispatchPlayerEvent({ type: "PAUSE" });
        }
      }

      // Check if we should sync to server (uses adaptive intervals based on network type)
      const syncCheck = await progressService.shouldSyncToServer(ids.userId, ids.libraryItemId);
      if (syncCheck.shouldSync) {
        const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
        log.info(
          `Syncing to server: ${syncCheck.reason} appState=${AppState.currentState} session=${session?.sessionId || "none"} item=${ids.libraryItemId}`
        );
        await progressService.syncSessionToServer(ids.userId, ids.libraryItemId);
      }

      // Track meaningful listening time (≥2 minutes) for file lifecycle management
      if (isPlaying) {
        const tracker = meaningfulListenTracker.get(ids.libraryItemId);
        const now = Date.now();

        if (!tracker) {
          // Start tracking for this item
          meaningfulListenTracker.set(ids.libraryItemId, {
            startTime: now,
            cumulativeTime: 0,
            lastUpdateTime: now,
            hasUpdatedAccess: false,
          });
        } else if (!tracker.hasUpdatedAccess) {
          // Update cumulative time (TrackPlayer fires this event every ~1 second)
          const elapsed = (now - tracker.lastUpdateTime) / 1000; // Convert to seconds
          tracker.cumulativeTime += elapsed;
          tracker.lastUpdateTime = now;

          // Check if we've reached meaningful listening threshold
          if (tracker.cumulativeTime >= MEANINGFUL_LISTEN_THRESHOLD) {
            log.info(
              `Meaningful listening threshold reached (${tracker.cumulativeTime.toFixed(1)}s), updating lastAccessedAt for item=${ids.libraryItemId}`
            );

            try {
              await updateAudioFileLastAccessed(ids.libraryItemId);
              tracker.hasUpdatedAccess = true; // Only update once per session
            } catch (error) {
              log.error(
                `Failed to update lastAccessedAt for item=${ids.libraryItemId}:`,
                error as Error
              );
            }
          }
        }
      }
    } else if (currentTrack) {
      // No session - try to rehydrate from database if TrackPlayer has a track loaded
      log.info(
        `No session, attempting rehydration: position=${formatTime(event.position)}s appState=${AppState.currentState} item=${currentTrack.libraryItemId}`
      );
      const state = await TrackPlayer.getPlaybackState();
      const isPlaying = state.state === State.Playing;

      log.info(`Attempting to rehydrate session item=${currentTrack.libraryItemId}`);
      await progressService.forceRehydrateSession(currentTrack.libraryItemId);

      // Try to get session after rehydration
      const rehydratedIds = await getUserIdAndLibraryItemId();
      if (rehydratedIds) {
        const session = await progressService.getCurrentSession(
          rehydratedIds.userId,
          rehydratedIds.libraryItemId
        );
        if (session) {
          log.info(
            `Session rehydrated successfully, updating progress session=${session.sessionId} item=${rehydratedIds.libraryItemId}`
          );
          const playbackRate = await TrackPlayer.getRate();
          const volume = await TrackPlayer.getVolume();

          await progressService.updateProgress(
            rehydratedIds.userId,
            rehydratedIds.libraryItemId,
            event.position,
            playbackRate,
            volume,
            undefined,
            isPlaying
          );

          // Sync store position from rehydrated session (DB is source of truth)
          const updatedSession = await progressService.getCurrentSession(
            rehydratedIds.userId,
            rehydratedIds.libraryItemId
          );
          if (updatedSession) {
            store.updatePosition(updatedSession.currentTime);
          }
        } else if (isPlaying) {
          // Rehydration failed but playback is active - start a new session
          log.info(
            `Rehydration failed but playback is active, starting new session item=${currentTrack.libraryItemId}`
          );
          const user = await getCurrentUser();
          if (user) {
            const playbackRate = await TrackPlayer.getRate();
            const volume = await TrackPlayer.getVolume();
            const sessionId = store.player.currentPlaySessionId;

            try {
              await progressService.startSession(
                user.username,
                currentTrack.libraryItemId,
                currentTrack.mediaId,
                event.position, // Start at current position
                currentTrack.duration,
                playbackRate,
                volume,
                sessionId || undefined
              );

              // Now update progress with the new session
              const newIds = await getUserIdAndLibraryItemId();
              if (newIds) {
                await progressService.updateProgress(
                  newIds.userId,
                  newIds.libraryItemId,
                  event.position,
                  playbackRate,
                  volume,
                  undefined,
                  isPlaying
                );

                // Sync store position from new session
                const newSession = await progressService.getCurrentSession(
                  newIds.userId,
                  newIds.libraryItemId
                );
                if (newSession) {
                  store.updatePosition(newSession.currentTime);
                }
              }
            } catch (error) {
              log.error(
                `Failed to start new session after stale session cleared: ${(error as Error).message} item=${currentTrack.libraryItemId}`
              );
              // Fallback: update store from TrackPlayer position
              store.updatePosition(event.position);
            }
          } else {
            log.warn(
              `No username available, cannot start new session item=${currentTrack.libraryItemId}`
            );
            store.updatePosition(event.position);
          }
        } else {
          log.warn(
            `Failed to rehydrate session, and playback is not active item=${currentTrack.libraryItemId}`
          );
          // Fallback: update store from TrackPlayer position if no session
          store.updatePosition(event.position);
        }
      } else {
        log.info(`No current track in playerSlice, cannot rehydrate or start session`);
        // Fallback: update store from TrackPlayer position if no session
        store.updatePosition(event.position);
      }
    } else {
      // No track and no IDs - just update position from TrackPlayer
      store.updatePosition(event.position);
    }
  } catch (error) {
    const ids = await getUserIdAndLibraryItemId();
    const store = useAppStore.getState();
    const currentTrack = store.player.currentTrack;
    log.error(
      `Progress update error: ${(error as Error).message} item=${ids?.libraryItemId || currentTrack?.libraryItemId || "unknown"}`,
      error as Error
    );
  }
}

/**
 * Handle active track changes
 */
async function handleActiveTrackChanged(
  event: PlaybackActiveTrackChangedEvent,
  lastActiveTrackId: { value: string | null }
): Promise<void> {
  try {
    // Avoid processing duplicate events
    const currentActiveTrack = await TrackPlayer.getActiveTrack();
    if (!currentActiveTrack || currentActiveTrack.id === lastActiveTrackId.value) {
      return;
    }

    // Phase 1: Dispatch to event bus
    // Note: We pass null for track since we don't have PlayerTrack here
    dispatchPlayerEvent({
      type: "NATIVE_TRACK_CHANGED",
      payload: { track: null },
    });

    lastActiveTrackId.value = currentActiveTrack.id;

    // Get track info from playerSlice and current user
    const store = useAppStore.getState();
    const currentTrack = store.player.currentTrack;
    const user = await getCurrentUser();

    log.info(
      `Active track changed: ${event.track?.title || "unknown"} item=${currentTrack?.libraryItemId || "unknown"}`
    );

    // Clear meaningful listen tracker for the previous track
    // Note: We keep the tracker for the current track if it exists
    const previousLibraryItemId = event.track?.id; // This might be the previous track
    if (previousLibraryItemId && previousLibraryItemId !== currentTrack?.libraryItemId) {
      meaningfulListenTracker.delete(previousLibraryItemId);
    }

    if (currentTrack && user) {
      log.info(
        `Starting session for track: ${currentTrack.title} item=${currentTrack.libraryItemId}`
      );
      // Start session tracking
      const playbackRate = await TrackPlayer.getRate();
      const volume = await TrackPlayer.getVolume();
      const sessionId = store.player.currentPlaySessionId;

      // Get current position before starting session
      let startPosition = 0;
      const MIN_PLAUSIBLE_POSITION = 5; // seconds

      try {
        const currentProgress = await TrackPlayer.getProgress();
        startPosition = currentProgress.position || 0;
      } catch (error) {
        log.warn(`Failed to get TrackPlayer progress, using store position`);
        startPosition = store.player.position || 0;
      }

      // Validate position - if it's implausibly small, prefer store position
      if (
        startPosition < MIN_PLAUSIBLE_POSITION &&
        store.player.position >= MIN_PLAUSIBLE_POSITION
      ) {
        log.warn(
          `TrackPlayer position ${formatTime(startPosition)}s is implausibly small, using store position ${formatTime(store.player.position)}s`
        );
        startPosition = store.player.position;
      }

      // If still implausible, let startSession() handle it (it has fallback logic)
      // startSession will use activeSession or savedProgress if startTime is 0 or small

      // GUARD: Check if a session already exists to prevent race conditions
      // This prevents duplicate session creation when app resumes from background
      // During normal playback, startSession handles resuming existing sessions correctly
      // But when multiple code paths call it simultaneously, races can occur
      try {
        const existingSession = await progressService.getCurrentSession(
          user.id,
          currentTrack.libraryItemId
        );
        if (existingSession) {
          // Session already exists - let it be
          // startSession() will handle resuming it if needed
          // But if we just got here from app resume, there might be concurrent calls
          // So we skip this one and let the other code path (updateProgress) handle it
          log.info(
            `Active session already exists, skipping duplicate startSession call item=${currentTrack.libraryItemId} session=${existingSession.sessionId} position=${formatTime(existingSession.currentTime)}s`
          );
          return;
        }
      } catch (error) {
        log.warn(`Failed to check existing session: ${error}`);
        // Continue with session creation if check fails
      }

      await progressService.startSession(
        user.username,
        currentTrack.libraryItemId,
        currentTrack.mediaId,
        startPosition,
        currentTrack.duration,
        playbackRate,
        volume,
        sessionId || undefined
      );
    }

    // Note: currentTrack is already set by PlayerService.playTrack() in playerSlice
    // so we don't need to set it again here
  } catch (error) {
    const store = useAppStore.getState();
    const currentTrack = store.player.currentTrack;
    log.error(
      `Active track change error: ${(error as Error).message} item=${currentTrack?.libraryItemId || "unknown"}`,
      error as Error
    );
  }
}

/**
 * Handle playback errors
 */
async function handlePlaybackError(event: PlaybackErrorEvent): Promise<void> {
  try {
    const ids = await getUserIdAndLibraryItemId();
    const store = useAppStore.getState();
    const currentTrack = store.player.currentTrack;
    const itemId = ids?.libraryItemId || currentTrack?.libraryItemId || "unknown";

    log.error(`Playback error: ${event.code} - ${event.message} item=${itemId}`);

    // End current session on critical playback errors
    if (ids) {
      const session = await progressService.getCurrentSession(ids.userId, ids.libraryItemId);
      log.info(
        `Ending session due to playback error session=${session?.sessionId || "none"} item=${ids.libraryItemId}`
      );
      await progressService.endCurrentSession(ids.userId, ids.libraryItemId);
    }

    // Clear loading state
    store._setTrackLoading(false);
  } catch (error) {
    const ids = await getUserIdAndLibraryItemId();
    const store = useAppStore.getState();
    const currentTrack = store.player.currentTrack;
    log.error(
      `Error handling playback error: ${(error as Error).message} item=${ids?.libraryItemId || currentTrack?.libraryItemId || "unknown"}`,
      error as Error
    );
  }
}

/**
 * Clean up existing event listeners
 */
function cleanupEventListeners(): void {
  if (global.__playerBackgroundServiceSubscriptions) {
    log.info("Cleaning up existing event listeners");
    log.debug(
      `Number of listeners to clean up: ${global.__playerBackgroundServiceSubscriptions.length} (${describeRuntimeContext()})`
    );
    global.__playerBackgroundServiceSubscriptions.forEach((unsub, idx) => {
      try {
        // unsub is already the .remove function, just call it
        if (typeof unsub === "function") {
          unsub();
          log.debug(`Cleaned up listener #${idx}`);
        }
      } catch (error) {
        log.error("Error removing event listener", error as Error);
      }
    });
    global.__playerBackgroundServiceSubscriptions = undefined;
  }
}

/**
 * Setup all event listeners
 */
function setupEventListeners(): Array<() => void> {
  log.info("Setting up event listeners");
  // Diagnostic: log event listener setup
  const eventTypes = [
    "RemotePlay",
    "RemotePause",
    "RemoteStop",
    "RemoteNext",
    "RemotePrevious",
    "RemoteSeek",
    "RemoteDuck",
    "RemoteJumpForward",
    "RemoteJumpBackward",
    "PlaybackState",
    "PlaybackProgressUpdated",
    "PlaybackActiveTrackChanged",
    "PlaybackError",
  ];
  log.debug(
    `Setting up listeners for events: ${eventTypes.join(", ")} (${describeRuntimeContext()})`
  );

  // Use object to store lastActiveTrackId so it can be mutated in the handler
  const lastActiveTrackId = { value: null as string | null };

  const subscriptions: Array<() => void> = [];

  // Register remote control event handlers
  subscriptions.push(TrackPlayer.addEventListener(Event.RemotePlay, handleRemotePlay).remove);
  subscriptions.push(TrackPlayer.addEventListener(Event.RemotePause, handleRemotePause).remove);
  subscriptions.push(TrackPlayer.addEventListener(Event.RemoteStop, handleRemoteStop).remove);
  subscriptions.push(TrackPlayer.addEventListener(Event.RemoteNext, handleRemoteNext).remove);
  subscriptions.push(
    TrackPlayer.addEventListener(Event.RemotePrevious, handleRemotePrevious).remove
  );
  subscriptions.push(TrackPlayer.addEventListener(Event.RemoteSeek, handleRemoteSeek).remove);
  subscriptions.push(TrackPlayer.addEventListener(Event.RemoteDuck, handleRemoteDuck).remove);
  subscriptions.push(
    TrackPlayer.addEventListener(Event.RemoteJumpForward, handleRemoteJumpForward).remove
  );
  subscriptions.push(
    TrackPlayer.addEventListener(Event.RemoteJumpBackward, handleRemoteJumpBackward).remove
  );

  // Register playback event handlers
  subscriptions.push(
    TrackPlayer.addEventListener(Event.PlaybackState, handlePlaybackStateChanged).remove
  );
  subscriptions.push(
    TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, handlePlaybackProgressUpdated)
      .remove
  );
  subscriptions.push(
    TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (event) =>
      handleActiveTrackChanged(event, lastActiveTrackId)
    ).remove
  );
  subscriptions.push(TrackPlayer.addEventListener(Event.PlaybackError, handlePlaybackError).remove);

  return subscriptions;
}

/**
 * Reconnect background service (for external use)
 * This forces a cleanup and re-setup of event listeners
 */
export function reconnectBackgroundService(): void {
  log.info("Forcing reconnection of background service");
  log.debug(
    `Reconnecting background service: cleaning up and re-setting listeners (${describeRuntimeContext()})`
  );
  cleanupEventListeners();
  global.__playerBackgroundServiceSubscriptions = setupEventListeners();
  log.debug(
    `Number of listeners after setup: ${global.__playerBackgroundServiceSubscriptions.length}`
  );
  global.__playerBackgroundServiceInitializedAt = Date.now();
}

/**
 * Shutdown the background service and clean up all resources
 * Useful for hot reloads, app updates, or forcing a full re-initialization
 */
export function shutdownBackgroundService(): void {
  log.info("Shutting down background service");
  cleanupEventListeners();
  meaningfulListenTracker.clear(); // Clear all tracking state
  global.__playerBackgroundServiceSubscriptions = undefined;
  global.__playerBackgroundServiceInitializedAt = undefined;
}

/**
 * Check if the background service is initialized
 */
export function isBackgroundServiceInitialized(): boolean {
  return global.__playerBackgroundServiceInitializedAt !== undefined;
}

/**
 * Main module export - called by TrackPlayer.registerPlaybackService
 * This is the entry point that react-native-track-player calls
 */
async function trackPlayerBackgroundService(): Promise<void> {
  const now = Date.now();
  log.info(
    `trackPlayerBackgroundService invoked uuid=${MODULE_INSTANCE_UUID} (${describeRuntimeContext()})`
  );

  if (global.__playerBackgroundServiceInitializedAt) {
    const timeSinceInit = now - global.__playerBackgroundServiceInitializedAt;

    // If called within 1 second, skip (duplicate call)
    if (timeSinceInit < 1000) {
      log.debug(`Already initialized ${timeSinceInit}ms ago, skipping duplicate setup`);
      return;
    }

    // If it's been longer, this likely means the JS context was recreated
    log.warn(
      `Re-initializing after ${Math.round(timeSinceInit / 1000)}s - possible JS context recreation`
    );
    cleanupEventListeners();
  } else {
    log.info("First-time initialization");
  }

  global.__playerBackgroundServiceSubscriptions = setupEventListeners();
  global.__playerBackgroundServiceInitializedAt = now;

  log.info(`Background service initialization complete uuid=${MODULE_INSTANCE_UUID}`);
}

// Attach helpers to the exported function so consumers retaining CommonJS access continue to work
const serviceExports = trackPlayerBackgroundService as unknown as {
  reconnectBackgroundService?: typeof reconnectBackgroundService;
  shutdownBackgroundService?: typeof shutdownBackgroundService;
  isBackgroundServiceInitialized?: typeof isBackgroundServiceInitialized;
};

serviceExports.reconnectBackgroundService = reconnectBackgroundService;
serviceExports.shutdownBackgroundService = shutdownBackgroundService;
serviceExports.isBackgroundServiceInitialized = isBackgroundServiceInitialized;

module.exports = trackPlayerBackgroundService;
