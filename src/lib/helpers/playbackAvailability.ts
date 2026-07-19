import type { TranslationKey } from "@/i18n";
import type { AuthStatus } from "@/types/auth";

type PlayButtonStateInput = {
  authStatus: AuthStatus;
  isDownloaded: boolean;
  isLoadingTrack: boolean;
  serverReachable: boolean | null;
};

type PlayButtonState = {
  disabled: boolean;
  labelKey: TranslationKey;
};

export function getPlayButtonState({
  authStatus,
  isDownloaded,
  isLoadingTrack,
  serverReachable,
}: PlayButtonStateInput): PlayButtonState {
  if (isLoadingTrack) {
    return { disabled: true, labelKey: "common.loading" };
  }

  if (!isDownloaded && authStatus !== "authenticated") {
    return { disabled: true, labelKey: "auth.signInToStream" };
  }

  if (!isDownloaded && serverReachable === false) {
    return { disabled: true, labelKey: "common.offline" };
  }

  return { disabled: false, labelKey: "common.play" };
}
