/**
 * Navigation utilities for Expo Router
 *
 * These utilities help work around common Expo Router limitations,
 * particularly with file-based routing and tab navigation.
 */

import { Href, Router } from "expo-router";

/**
 * Navigate to a detail page within a tab, ensuring the tab's index is in the navigation stack first.
 *
 * This solves the problem where directly navigating to a dynamic route in an uninitialized tab
 * makes that route the root of the stack, preventing navigation back to the list view.
 *
 * @param router - The router instance from useRouter()
 * @param tabPath - The tab's base path (e.g., "/(tabs)/authors", "/(tabs)/series")
 * @param detailPath - The detail route path (e.g., "/(tabs)/authors/123", "/(tabs)/series/456")
 *
 * @example
 * ```tsx
 * import { useRouter } from "expo-router";
 * import { navigateToTabDetail } from "@/lib/navigation";
 *
 * function MyComponent() {
 *   const router = useRouter();
 *
 *   const handleAuthorPress = (authorId: string) => {
 *     navigateToTabDetail(
 *       router,
 *       "/(tabs)/authors",
 *       `/(tabs)/authors/${authorId}`
 *     );
 *   };
 * }
 * ```
 */
export function navigateToTabDetail(router: Router, tabPath: string, detailPath: string): void {
  // First push to the tab's index to ensure it's in the navigation stack
  router.push(tabPath as Href);

  // Then navigate to the detail page after interactions are complete
  // This ensures the index route is fully rendered before navigating
  setImmediate(() => {
    router.push(detailPath as Href);
  });
}

/**
 * Convenience helper for navigating to an author detail page
 *
 * @param router - The router instance from useRouter()
 * @param authorId - The author's ID
 */
export function navigateToAuthor(router: Router, authorId: string): void {
  navigateToTabDetail(router, "/(tabs)/authors", `/(tabs)/authors/${authorId}`);
}

/**
 * Convenience helper for navigating to a series detail page
 *
 * @param router - The router instance from useRouter()
 * @param seriesId - The series' ID
 */
export function navigateToSeries(router: Router, seriesId: string): void {
  navigateToTabDetail(router, "/(tabs)/series", `/(tabs)/series/${seriesId}`);
}

/**
 * Convenience helper for navigating to a library item detail page
 *
 * @param router - The router instance from useRouter()
 * @param itemId - The library item's ID
 */
export function navigateToLibraryItem(router: Router, itemId: string): void {
  navigateToTabDetail(router, "/(tabs)/library", `/(tabs)/library/${itemId}`);
}
