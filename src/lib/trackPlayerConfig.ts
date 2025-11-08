/**
 * TrackPlayer Configuration Helper
 *
 * Standalone helper to configure TrackPlayer options without creating circular dependencies.
 * This can be imported by both PlayerService and settingsSlice without cycles.
 */

import { getJumpBackwardInterval, getJumpForwardInterval } from "@/lib/appSettings";
import { logger } from "@/lib/logger";
import TrackPlayer, { AppKilledPlaybackBehavior, Capability } from "react-native-track-player";

const log = logger.forTag("TrackPlayerConfig");

/**
 * Configure TrackPlayer with current settings
 */
export async function configureTrackPlayer(): Promise<void> {
  // Load jump intervals from settings
  const [forwardInterval, backwardInterval] = await Promise.all([
    getJumpForwardInterval(),
    getJumpBackwardInterval(),
  ]);

  log.debug(
    `Configuring TrackPlayer options: jumpforward=${forwardInterval}s jumpbackward=${backwardInterval}s`
  );

  await TrackPlayer.updateOptions({
    android: {
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
    },
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SeekTo,
      Capability.JumpBackward,
      Capability.JumpForward,
    ],
    compactCapabilities: [Capability.Play, Capability.Pause],
    forwardJumpInterval: forwardInterval,
    backwardJumpInterval: backwardInterval,
    progressUpdateEventInterval: 1, // Update every second
  });
}
