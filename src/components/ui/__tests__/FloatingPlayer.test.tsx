import FloatingPlayer from "@/components/ui/FloatingPlayer";
import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import React from "react";

let mockPlayerState = {
  currentTrack: null as {
    id: string;
    libraryItemId: string;
    title: string;
    duration: number;
    coverUri: string;
  } | null,
  currentChapter: null,
  position: 0,
};

jest.mock("@/components/player/PlayPauseButton", () => "PlayPauseButton");
jest.mock("@/components/ui/AirPlayButton", () => ({ AirPlayButton: "AirPlayButton" }));
jest.mock("@/components/ui/CoverImage", () => "CoverImage");
jest.mock("@/i18n", () => ({ translate: () => "Now playing" }));
jest.mock("@/lib/helpers/progressFormat", () => ({ formatProgress: () => "0:00" }));
jest.mock("@/lib/logger", () => ({ logger: { forTag: () => ({ error: () => undefined }) } }));
jest.mock("@/lib/theme", () => ({
  useThemedStyles: () => ({
    styles: { text: {} },
    isDark: false,
    colors: { shadow: "#000", textPrimary: "#000" },
  }),
}));
jest.mock("@/lib/traceDump", () => ({ writeDumpToDisk: () => undefined }));
jest.mock("@/services/PlayerService", () => ({
  playerService: { togglePlayPause: () => undefined },
}));
jest.mock("@/stores/appStore", () => ({
  usePlayer: () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("react").useState(undefined);
    return mockPlayerState;
  },
  useSettings: () => ({ progressFormat: "elapsed" }),
}));
jest.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Medium: "Medium" },
  impactAsync: () => undefined,
}));
jest.mock("expo-router", () => ({
  router: { push: () => undefined },
  useGlobalSearchParams: () => ({}),
  usePathname: () => "/home",
}));

describe("FloatingPlayer", () => {
  it("renders when a track loads after an empty initial render", () => {
    mockPlayerState = {
      currentTrack: null,
      currentChapter: null,
      position: 0,
    };

    const view = render(<FloatingPlayer />);
    expect(view.queryByTestId("floating-player")).toBeNull();

    mockPlayerState = {
      ...mockPlayerState,
      currentTrack: {
        id: "track-1",
        libraryItemId: "item-1",
        title: "Book",
        duration: 3600,
        coverUri: "",
      },
    };

    expect(() => view.rerender(<FloatingPlayer />)).not.toThrow();
    expect(view.getByTestId("floating-player")).toBeTruthy();
  });
});
