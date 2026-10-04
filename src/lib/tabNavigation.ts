import type { Href } from "expo-router";

export type MovableTabName = "home" | "library" | "series" | "authors";

const MORE_TAB_INDEX_ROUTES = {
  home: "/more/home",
  library: "/more/library",
  series: "/more/series",
  authors: "/more/authors",
} as const satisfies Record<MovableTabName, Href>;

function isMoreScoped(pathname: string, tab: MovableTabName): boolean {
  const base = `/more/${tab}`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function getMoreTabIndexRoute(tab: MovableTabName): Href {
  return MORE_TAB_INDEX_ROUTES[tab];
}

export function getHomeItemRoute(pathname: string, itemId: string): Href {
  return isMoreScoped(pathname, "home") ? `/more/home/item/${itemId}` : `/home/item/${itemId}`;
}

export function getLibraryItemRoute(pathname: string, itemId: string): Href {
  return isMoreScoped(pathname, "library") ? `/more/library/${itemId}` : `/library/${itemId}`;
}

export function getSeriesItemRoute(pathname: string, seriesId: string, itemId: string): Href {
  return isMoreScoped(pathname, "series")
    ? `/more/series/${seriesId}/item/${itemId}`
    : `/series/${seriesId}/item/${itemId}`;
}

export function getAuthorItemRoute(pathname: string, authorId: string, itemId: string): Href {
  return isMoreScoped(pathname, "authors")
    ? `/more/authors/${authorId}/item/${itemId}`
    : `/authors/${authorId}/item/${itemId}`;
}
