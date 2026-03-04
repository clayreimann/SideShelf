/**
 * Tests for libraryItemDetailsSlice
 * Covers: CachedItemDetails.authorId and CachedItemDetails.seriesId (EFFECT-04)
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { create, type StoreApi, type UseBoundStore } from "zustand";
import { createLibraryItemDetailsSlice, LibraryItemDetailsSlice } from "../libraryItemDetailsSlice";

// Mock database helpers
jest.mock("@/db/helpers/libraryItems", () => ({
  getLibraryItemById: jest.fn(),
}));

jest.mock("@/db/helpers/mediaMetadata", () => ({
  getMediaMetadataByLibraryItemId: jest.fn(),
  cacheCoverAndUpdateMetadata: jest.fn(),
}));

jest.mock("@/db/helpers/mediaJoins", () => ({
  getMediaGenres: jest.fn(),
  getMediaTags: jest.fn(),
  getMediaAuthors: jest.fn(),
  getMediaSeries: jest.fn(),
}));

jest.mock("@/db/helpers/chapters", () => ({
  getChaptersForMedia: jest.fn(),
}));

jest.mock("@/db/helpers/combinedQueries", () => ({
  getAudioFilesWithDownloadInfo: jest.fn(),
}));

jest.mock("@/db/helpers/mediaProgress", () => ({
  getMediaProgressForLibraryItem: jest.fn(),
}));

jest.mock("@/lib/api/endpoints", () => ({
  fetchLibraryItemsBatch: jest.fn(),
}));

jest.mock("@/db/helpers/fullLibraryItems", () => ({
  processFullLibraryItems: jest.fn(),
}));

describe("LibraryItemDetailsSlice", () => {
  let store: UseBoundStore<StoreApi<LibraryItemDetailsSlice>>;

  const { getLibraryItemById } = require("@/db/helpers/libraryItems");
  const { getMediaMetadataByLibraryItemId } = require("@/db/helpers/mediaMetadata");
  const {
    getMediaGenres,
    getMediaTags,
    getMediaAuthors,
    getMediaSeries,
  } = require("@/db/helpers/mediaJoins");
  const { getChaptersForMedia } = require("@/db/helpers/chapters");
  const { getAudioFilesWithDownloadInfo } = require("@/db/helpers/combinedQueries");
  const { getMediaProgressForLibraryItem } = require("@/db/helpers/mediaProgress");
  const { fetchLibraryItemsBatch } = require("@/lib/api/endpoints");

  const mockItem = { id: "item-1", libraryId: "lib-1" };
  const mockMetadata = { id: "meta-1", title: "Test Book" };

  beforeEach(() => {
    store = create<LibraryItemDetailsSlice>()((set, get) => ({
      ...createLibraryItemDetailsSlice(set, get),
    }));

    jest.clearAllMocks();

    // Default mock implementations
    getLibraryItemById.mockResolvedValue(mockItem);
    getMediaMetadataByLibraryItemId.mockResolvedValue(mockMetadata);
    getMediaGenres.mockResolvedValue([]);
    getMediaTags.mockResolvedValue([]);
    getMediaAuthors.mockResolvedValue([]);
    getMediaSeries.mockResolvedValue([]);
    getChaptersForMedia.mockResolvedValue([]);
    getAudioFilesWithDownloadInfo.mockResolvedValue([]);
    getMediaProgressForLibraryItem.mockResolvedValue(null);
    fetchLibraryItemsBatch.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("CachedItemDetails authorId and seriesId (EFFECT-04)", () => {
    it("fetchItemDetails populates cachedData.authorId with first author's authorId", async () => {
      getMediaAuthors.mockResolvedValue([
        { mediaId: "meta-1", authorId: "author-abc" },
        { mediaId: "meta-1", authorId: "author-def" },
      ]);

      await store.getState().fetchItemDetails("item-1", "user-1");

      const cached = store.getState().getCachedItem("item-1");
      expect(cached?.authorId).toBe("author-abc");
    });

    it("fetchItemDetails populates cachedData.seriesId with first seriesId", async () => {
      getMediaSeries.mockResolvedValue(["series-xyz", "series-abc"]);

      await store.getState().fetchItemDetails("item-1", "user-1");

      const cached = store.getState().getCachedItem("item-1");
      expect(cached?.seriesId).toBe("series-xyz");
    });

    it("fetchItemDetails sets authorId to null when media has no authors", async () => {
      getMediaAuthors.mockResolvedValue([]);

      await store.getState().fetchItemDetails("item-1", "user-1");

      const cached = store.getState().getCachedItem("item-1");
      expect(cached?.authorId).toBeNull();
    });

    it("fetchItemDetails sets seriesId to null when media has no series", async () => {
      getMediaSeries.mockResolvedValue([]);

      await store.getState().fetchItemDetails("item-1", "user-1");

      const cached = store.getState().getCachedItem("item-1");
      expect(cached?.seriesId).toBeNull();
    });
  });
});
