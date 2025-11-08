/**
 * Tests for store utility functions
 */

import { AuthorListRow } from "@/db/helpers/authors";
import { SeriesListRow } from "@/db/helpers/series";
import type { LibraryItemListRow } from "@/types/database";
import { describe, expect, it } from "@jest/globals";
import {
  DEFAULT_AUTHOR_SORT_CONFIG,
  DEFAULT_SERIES_SORT_CONFIG,
  DEFAULT_SORT_CONFIG,
  sortAuthors,
  sortLibraryItems,
  sortSeries,
  STORAGE_KEYS,
} from "../utils";

describe("Store Utils", () => {
  describe("Constants", () => {
    it("should have correct storage keys", () => {
      expect(STORAGE_KEYS.selectedLibraryId).toBe("abs.selectedLibraryId");
      expect(STORAGE_KEYS.sortConfig).toBe("abs.sortConfig");
    });

    it("should have correct default sort configs", () => {
      expect(DEFAULT_SORT_CONFIG).toEqual({ field: "title", direction: "asc" });
      expect(DEFAULT_AUTHOR_SORT_CONFIG).toEqual({ field: "name", direction: "asc" });
      expect(DEFAULT_SERIES_SORT_CONFIG).toEqual({ field: "name", direction: "asc" });
    });
  });

  describe("sortLibraryItems", () => {
    const mockItems: LibraryItemListRow[] = [
      {
        id: "1",
        mediaType: "book",
        title: "The Great Gatsby",
        author: "F. Scott Fitzgerald",
        authorNameLF: "Fitzgerald, F. Scott",
        narrator: "Jim Dale",
        releaseDate: "1925-04-10",
        publishedYear: "1925",
        addedAt: 1640995200000,
        duration: 3600.5,
        coverUri: "/covers/gatsby.jpg",
      },
      {
        id: "2",
        mediaType: "book",
        title: "To Kill a Mockingbird",
        author: "Harper Lee",
        authorNameLF: "Lee, Harper",
        narrator: "Sissy Spacek",
        releaseDate: "1960-07-11",
        publishedYear: "1960",
        addedAt: 1672531200000,
        duration: 4200.0,
        coverUri: "/covers/mockingbird.jpg",
      },
      {
        id: "3",
        mediaType: "book",
        title: "1984",
        author: "George Orwell",
        authorNameLF: "Orwell, George",
        narrator: "Simon Prebble",
        releaseDate: "1949-06-08",
        publishedYear: "1949",
        addedAt: 1656667200000,
        duration: 5400.25,
        coverUri: "/covers/1984.jpg",
      },
    ];

    describe("Sort by title", () => {
      it("should sort by title ascending", () => {
        const result = sortLibraryItems(mockItems, { field: "title", direction: "asc" });

        expect(result.map((item) => item.title)).toEqual([
          "1984",
          "The Great Gatsby",
          "To Kill a Mockingbird",
        ]);
      });

      it("should sort by title descending", () => {
        const result = sortLibraryItems(mockItems, { field: "title", direction: "desc" });

        expect(result.map((item) => item.title)).toEqual([
          "To Kill a Mockingbird",
          "The Great Gatsby",
          "1984",
        ]);
      });

      it("should handle empty titles", () => {
        const itemsWithEmptyTitle = [
          { ...mockItems[0], title: "" },
          { ...mockItems[1] },
          { ...mockItems[2], title: "" },
        ];

        const result = sortLibraryItems(itemsWithEmptyTitle, { field: "title", direction: "asc" });

        // Empty titles should come first when sorting ascending
        expect(result[0].title).toBe("");
        expect(result[1].title).toBe("");
        expect(result[2].title).toBe("To Kill a Mockingbird");
      });
    });

    describe("Sort by author", () => {
      it("should sort by author ascending using authorNameLF", () => {
        const result = sortLibraryItems(mockItems, { field: "authorNameLF", direction: "asc" });

        expect(result.map((item) => item.authorNameLF)).toEqual([
          "Fitzgerald, F. Scott",
          "Lee, Harper",
          "Orwell, George",
        ]);
      });

      it("should sort by author descending", () => {
        const result = sortLibraryItems(mockItems, { field: "authorNameLF", direction: "desc" });

        expect(result.map((item) => item.authorNameLF)).toEqual([
          "Orwell, George",
          "Lee, Harper",
          "Fitzgerald, F. Scott",
        ]);
      });

      it("should fallback to author field when authorNameLF is null", () => {
        const itemsWithoutLF = mockItems.map((item) => ({ ...item, authorNameLF: null }));

        const result = sortLibraryItems(itemsWithoutLF, {
          field: "authorNameLF",
          direction: "asc",
        });

        expect(result.map((item) => item.author)).toEqual([
          "F. Scott Fitzgerald",
          "George Orwell",
          "Harper Lee",
        ]);
      });
    });

    describe("Sort by published year", () => {
      it("should sort by published year ascending", () => {
        const result = sortLibraryItems(mockItems, { field: "publishedYear", direction: "asc" });

        expect(result.map((item) => item.publishedYear)).toEqual(["1925", "1949", "1960"]);
      });

      it("should sort by published year descending", () => {
        const result = sortLibraryItems(mockItems, { field: "publishedYear", direction: "desc" });

        expect(result.map((item) => item.publishedYear)).toEqual(["1960", "1949", "1925"]);
      });

      it("should handle null published years", () => {
        const itemsWithNullYear = [
          { ...mockItems[0], publishedYear: null },
          { ...mockItems[1] },
          { ...mockItems[2], publishedYear: null },
        ];

        const result = sortLibraryItems(itemsWithNullYear, {
          field: "publishedYear",
          direction: "asc",
        });

        // Null years should be treated as empty strings and come first
        expect(result[0].publishedYear).toBeNull();
        expect(result[1].publishedYear).toBeNull();
        expect(result[2].publishedYear).toBe("1960");
      });
    });

    describe("Sort by added date", () => {
      it("should sort by addedAt ascending", () => {
        const result = sortLibraryItems(mockItems, { field: "addedAt", direction: "asc" });

        expect(result.map((item) => item.addedAt)).toEqual([
          1640995200000, // Gatsby
          1656667200000, // 1984
          1672531200000, // Mockingbird
        ]);
      });

      it("should sort by addedAt descending", () => {
        const result = sortLibraryItems(mockItems, { field: "addedAt", direction: "desc" });

        expect(result.map((item) => item.addedAt)).toEqual([
          1672531200000, // Mockingbird
          1656667200000, // 1984
          1640995200000, // Gatsby
        ]);
      });

      it("should handle null addedAt values", () => {
        const itemsWithNullDate = [
          { ...mockItems[0], addedAt: null },
          { ...mockItems[1] },
          { ...mockItems[2], addedAt: null },
        ];

        const result = sortLibraryItems(itemsWithNullDate, { field: "addedAt", direction: "asc" });

        // Null dates should be treated as 0 and come first
        expect(result[0].addedAt).toBeNull();
        expect(result[1].addedAt).toBeNull();
        expect(result[2].addedAt).toBe(1672531200000);
      });
    });

    it("should handle empty array", () => {
      const result = sortLibraryItems([], { field: "title", direction: "asc" });
      expect(result).toEqual([]);
    });

    it("should not mutate original array", () => {
      const originalItems = [...mockItems];
      const result = sortLibraryItems(mockItems, { field: "title", direction: "asc" });

      expect(mockItems).toEqual(originalItems);
      expect(result).not.toBe(mockItems);
    });

    it("should handle invalid sort field gracefully", () => {
      const result = sortLibraryItems(mockItems, { field: "invalid" as any, direction: "asc" });

      // Should return items in original order when sort field is invalid
      expect(result.map((item) => item.id)).toEqual(["1", "2", "3"]);
    });
  });

  describe("sortAuthors", () => {
    const mockAuthors: AuthorListRow[] = [
      {
        id: "author-1",
        name: "George Orwell",
        addedAt: new Date("2022-01-01"),
        updatedAt: new Date("2023-01-01"),
        numBooks: 5,
      },
      {
        id: "author-2",
        name: "Harper Lee",
        addedAt: new Date("2021-06-15"),
        updatedAt: new Date("2022-12-01"),
        numBooks: 2,
      },
      {
        id: "author-3",
        name: "F. Scott Fitzgerald",
        addedAt: new Date("2023-03-10"),
        updatedAt: new Date("2023-06-15"),
        numBooks: 8,
      },
    ];

    describe("Sort by name", () => {
      it("should sort by name ascending", () => {
        const result = sortAuthors(mockAuthors, { field: "name", direction: "asc" });

        expect(result.map((author) => author.name)).toEqual([
          "F. Scott Fitzgerald",
          "George Orwell",
          "Harper Lee",
        ]);
      });

      it("should sort by name descending", () => {
        const result = sortAuthors(mockAuthors, { field: "name", direction: "desc" });

        expect(result.map((author) => author.name)).toEqual([
          "Harper Lee",
          "George Orwell",
          "F. Scott Fitzgerald",
        ]);
      });

      it("should handle null names", () => {
        const authorsWithNullName = [
          { ...mockAuthors[0], name: null as any },
          { ...mockAuthors[1] },
          { ...mockAuthors[2], name: null as any },
        ];

        const result = sortAuthors(authorsWithNullName, { field: "name", direction: "asc" });

        // Null names should be treated as empty strings and come first
        expect(result[0].name).toBeNull();
        expect(result[1].name).toBeNull();
        expect(result[2].name).toBe("Harper Lee");
      });
    });

    describe("Sort by numBooks", () => {
      it("should sort by numBooks ascending", () => {
        const result = sortAuthors(mockAuthors, { field: "numBooks", direction: "asc" });

        expect(result.map((author) => author.numBooks)).toEqual([2, 5, 8]);
      });

      it("should sort by numBooks descending", () => {
        const result = sortAuthors(mockAuthors, { field: "numBooks", direction: "desc" });

        expect(result.map((author) => author.numBooks)).toEqual([8, 5, 2]);
      });

      it("should handle null numBooks", () => {
        const authorsWithNullBooks = [
          { ...mockAuthors[0], numBooks: null as any },
          { ...mockAuthors[1] },
          { ...mockAuthors[2], numBooks: null as any },
        ];

        const result = sortAuthors(authorsWithNullBooks, { field: "numBooks", direction: "asc" });

        // Null numBooks should be treated as 0 and come first
        expect(result[0].numBooks).toBeNull();
        expect(result[1].numBooks).toBeNull();
        expect(result[2].numBooks).toBe(2);
      });
    });

    it("should not mutate original array", () => {
      const originalAuthors = [...mockAuthors];
      const result = sortAuthors(mockAuthors, { field: "name", direction: "asc" });

      expect(mockAuthors).toEqual(originalAuthors);
      expect(result).not.toBe(mockAuthors);
    });

    it("should handle invalid sort field gracefully", () => {
      const result = sortAuthors(mockAuthors, { field: "invalid" as any, direction: "asc" });

      // Should return authors in original order when sort field is invalid
      expect(result.map((author) => author.id)).toEqual(["author-1", "author-2", "author-3"]);
    });
  });

  describe("sortSeries", () => {
    const mockSeries: SeriesListRow[] = [
      {
        id: "series-1",
        name: "Harry Potter",
        description: null,
        addedAt: new Date("2022-01-01"),
        updatedAt: new Date("2023-01-01"),
        bookCount: 7,
      },
      {
        id: "series-2",
        name: "The Lord of the Rings",
        description: null,
        addedAt: new Date("2021-06-15"),
        updatedAt: new Date("2022-12-01"),
        bookCount: 3,
      },
      {
        id: "series-3",
        name: "A Song of Ice and Fire",
        description: null,
        addedAt: new Date("2023-03-10"),
        updatedAt: new Date("2023-06-15"),
        bookCount: 5,
      },
    ];

    describe("Sort by name", () => {
      it("should sort by name ascending", () => {
        const result = sortSeries(mockSeries, { field: "name", direction: "asc" });

        expect(result.map((series) => series.name)).toEqual([
          "A Song of Ice and Fire",
          "Harry Potter",
          "The Lord of the Rings",
        ]);
      });

      it("should sort by name descending", () => {
        const result = sortSeries(mockSeries, { field: "name", direction: "desc" });

        expect(result.map((series) => series.name)).toEqual([
          "The Lord of the Rings",
          "Harry Potter",
          "A Song of Ice and Fire",
        ]);
      });
    });

    describe("Sort by addedAt", () => {
      it("should sort by addedAt ascending", () => {
        const result = sortSeries(mockSeries, { field: "addedAt", direction: "asc" });

        expect(result.map((series) => series.addedAt?.getTime())).toEqual([
          new Date("2021-06-15").getTime(),
          new Date("2022-01-01").getTime(),
          new Date("2023-03-10").getTime(),
        ]);
      });

      it("should sort by addedAt descending", () => {
        const result = sortSeries(mockSeries, { field: "addedAt", direction: "desc" });

        expect(result.map((series) => series.addedAt?.getTime())).toEqual([
          new Date("2023-03-10").getTime(),
          new Date("2022-01-01").getTime(),
          new Date("2021-06-15").getTime(),
        ]);
      });

      it("should handle null addedAt", () => {
        const seriesWithNullDate = [
          { ...mockSeries[0], addedAt: null },
          { ...mockSeries[1] },
          { ...mockSeries[2], addedAt: null },
        ];

        const result = sortSeries(seriesWithNullDate, { field: "addedAt", direction: "asc" });

        // Null dates should be treated as 0 and come first
        expect(result[0].addedAt).toBeNull();
        expect(result[1].addedAt).toBeNull();
        expect(result[2].addedAt?.getTime()).toBe(new Date("2021-06-15").getTime());
      });
    });

    describe("Sort by updatedAt", () => {
      it("should sort by updatedAt ascending", () => {
        const result = sortSeries(mockSeries, { field: "updatedAt", direction: "asc" });

        expect(result.map((series) => series.updatedAt?.getTime())).toEqual([
          new Date("2022-12-01").getTime(),
          new Date("2023-01-01").getTime(),
          new Date("2023-06-15").getTime(),
        ]);
      });

      it("should sort by updatedAt descending", () => {
        const result = sortSeries(mockSeries, { field: "updatedAt", direction: "desc" });

        expect(result.map((series) => series.updatedAt?.getTime())).toEqual([
          new Date("2023-06-15").getTime(),
          new Date("2023-01-01").getTime(),
          new Date("2022-12-01").getTime(),
        ]);
      });
    });

    it("should not mutate original array", () => {
      const originalSeries = [...mockSeries];
      const result = sortSeries(mockSeries, { field: "name", direction: "asc" });

      expect(mockSeries).toEqual(originalSeries);
      expect(result).not.toBe(mockSeries);
    });

    it("should handle invalid sort field gracefully", () => {
      const result = sortSeries(mockSeries, { field: "invalid" as any, direction: "asc" });

      // Should return series in original order when sort field is invalid
      expect(result.map((series) => series.id)).toEqual(["series-1", "series-2", "series-3"]);
    });
  });
});
