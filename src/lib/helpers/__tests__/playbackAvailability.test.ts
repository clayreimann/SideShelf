import { getPlayButtonState } from "@/lib/helpers/playbackAvailability";

describe("getPlayButtonState", () => {
  it("keeps downloaded playback available while reauthentication is required", () => {
    expect(
      getPlayButtonState({
        authStatus: "reauthRequired",
        isDownloaded: true,
        isLoadingTrack: false,
        serverReachable: true,
      })
    ).toEqual({ disabled: false, labelKey: "common.play" });
  });

  it("disables streaming-only playback with sign-in feedback", () => {
    expect(
      getPlayButtonState({
        authStatus: "reauthRequired",
        isDownloaded: false,
        isLoadingTrack: false,
        serverReachable: true,
      })
    ).toEqual({ disabled: true, labelKey: "auth.signInToStream" });
  });

  it("preserves the existing unreachable-server feedback for authenticated users", () => {
    expect(
      getPlayButtonState({
        authStatus: "authenticated",
        isDownloaded: false,
        isLoadingTrack: false,
        serverReachable: false,
      })
    ).toEqual({ disabled: true, labelKey: "common.offline" });
  });
});
