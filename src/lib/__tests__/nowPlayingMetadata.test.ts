/**
 * Tests for updateNowPlayingMetadata lib function
 */

import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import TrackPlayer from "react-native-track-player";
import { updateNowPlayingMetadata } from "../nowPlayingMetadata";
import type { PlayerTrack } from "@/types/player";

jest.mock("react-native-track-player", () => ({
  getActiveTrackIndex: jest.fn(),
  updateMetadataForTrack: jest.fn(),
}));

jest.mock("@/lib/trackPlayerConfig", () => ({
  configureTrackPlayer: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: { forTag: () => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

const mockedTrackPlayer = TrackPlayer as jest.Mocked<typeof TrackPlayer>;
const { configureTrackPlayer } = require("@/lib/trackPlayerConfig");

const mockTrack: PlayerTrack = {
  libraryItemId: "item-1",
  mediaId: "media-1",
  title: "Test Book",
  author: "Test Author",
  coverUri: "file:///test-cover.jpg",
  duration: 3600,
  isDownloaded: true,
  chapters: [
    { id: "ch-1", chapterId: 1, title: "Chapter 1", start: 0, end: 1800, mediaId: "media-1" },
    { id: "ch-2", chapterId: 2, title: "Chapter 2", start: 1800, end: 3600, mediaId: "media-1" },
  ],
  audioFiles: [],
};

describe("updateNowPlayingMetadata", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedTrackPlayer.getActiveTrackIndex.mockResolvedValue(0);
    (mockedTrackPlayer.updateMetadataForTrack as jest.Mock).mockResolvedValue(undefined);
    configureTrackPlayer.mockResolvedValue(undefined);
  });

  it("updates TrackPlayer with chapter-relative elapsed time", async () => {
    await updateNowPlayingMetadata(mockTrack, 100);

    expect(mockedTrackPlayer.updateMetadataForTrack).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        title: "Chapter 1",
        artist: "Test Author",
        album: "Test Book",
        artwork: "file:///test-cover.jpg",
        duration: 1800,
        elapsedTime: 100,
      })
    );
  });

  it("resets elapsed time to 0 at the start of chapter 2", async () => {
    await updateNowPlayingMetadata(mockTrack, 1800);

    expect(mockedTrackPlayer.updateMetadataForTrack).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        title: "Chapter 2",
        duration: 1800,
        elapsedTime: 0,
      })
    );
  });

  it("clamps elapsed time to chapterDuration when position overshoots", async () => {
    // Position slightly past chapter 1 end (handled by clamp before chapter change detected)
    await updateNowPlayingMetadata(mockTrack, 1799.9);

    const call = (mockedTrackPlayer.updateMetadataForTrack as jest.Mock).mock.calls[0][1] as any;
    expect(call.elapsedTime).toBeLessThanOrEqual(call.duration);
  });

  it("skips when track has no chapters", async () => {
    const trackNoChapters = { ...mockTrack, chapters: [] };
    await updateNowPlayingMetadata(trackNoChapters, 100);

    expect(mockedTrackPlayer.updateMetadataForTrack).not.toHaveBeenCalled();
  });

  it("skips when no active track index", async () => {
    mockedTrackPlayer.getActiveTrackIndex.mockResolvedValue(null as any);
    await updateNowPlayingMetadata(mockTrack, 100);

    expect(mockedTrackPlayer.updateMetadataForTrack).not.toHaveBeenCalled();
  });

  it("calls configureTrackPlayer after metadata update", async () => {
    await updateNowPlayingMetadata(mockTrack, 100);

    expect(configureTrackPlayer).toHaveBeenCalled();
  });
});
