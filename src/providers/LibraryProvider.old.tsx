import { db } from '@/db/client';
import type { LibraryItemRow, LibraryRow } from '@/db/schema_old';
import { audioFiles, authors, bookAudioFiles, bookAuthorJoins, bookAuthors, bookChapters, bookGenreJoins, bookNarratorJoins, books, bookSeriesJoins, genres, libraries, libraryFiles, libraryItems, narrators, podcastAudioFiles, podcasts, series } from '@/db/schema_old';

import { fetchLibraries, fetchLibraryItems } from '@/lib/api/endpoints';
import { cacheCoversForLibrary, getCoverUri } from '@/lib/covers';
import { useAuth } from '@/providers/AuthProvider';
import { useDb } from '@/providers/DbProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { eq, sql } from 'drizzle-orm';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type LibraryItemListRow = {
  id: string;
  libraryId: string;
  mediaType: string | null;
  title: string | null;
  author: string | null;
  releaseDate: string | null;
  duration: number | null;
  coverUri: string;
};

type SelectedLibraryState = {
  selectedLibraryId: string | null;
  selectedLibrary: LibraryRow | null;
  items: LibraryItemListRow[];
  isLoadingItems: boolean;
  selectLibrary: (libraryId: string) => Promise<void>;
  refetchItems: () => Promise<void>;
  refetchLibraries: () => Promise<void>;
  libraries: LibraryRow[];
};

const LibraryContext = createContext<SelectedLibraryState | undefined>(undefined);

const STORAGE_KEYS = {
  selectedLibraryId: 'abs.selectedLibraryId',
} as const;

async function loadFirstLibrary(): Promise<LibraryRow | null> {
  const rows = await db.select().from(libraries).limit(1);
  return rows.length ? rows[0] : null;
}

async function loadLibraryById(libraryId: string): Promise<LibraryRow | null> {
  const rows = await db.select().from(libraries).where(eq(libraries.id, libraryId)).limit(1);
  return rows.length ? rows[0] : null;
}

async function loadAllLibraries(): Promise<LibraryRow[]> {
  const rows = await db.select().from(libraries);
  return rows;
}

async function loadCachedItems(libraryId: string): Promise<LibraryItemListRow[]> {
  // Books with authors via subselect (group_concat)
  const bookRows = await db
    .select({
      id: libraryItems.id,
      libraryId: libraryItems.libraryId,
      mediaType: libraryItems.mediaType,
      title: books.title,
      author: sql<string>`(SELECT group_concat(${bookAuthors.name}, ', ') FROM ${bookAuthors} ba WHERE ba.book_id = ${books.id})`,
      releaseDate: books.releaseDate,
      duration: books.duration,
    })
    .from(libraryItems)
    .leftJoin(books, eq(books.libraryItemId, libraryItems.id))
    .where(eq(libraryItems.libraryId, libraryId));

  const resultById = new Map<string, LibraryItemListRow>();
  for (const r of bookRows) {
    resultById.set(r.id, {
      id: r.id,
      libraryId: r.libraryId,
      mediaType: r.mediaType,
      title: r.title ?? null,
      author: (r as any).author ?? null,
      releaseDate: r.releaseDate ?? null,
      duration: r.duration ?? null,
      coverUri: getCoverUri(r.id),
    });
  }

  // Podcasts fallback
  const podcastRows = await db
    .select({
      id: libraryItems.id,
      libraryId: libraryItems.libraryId,
      mediaType: libraryItems.mediaType,
      title: podcasts.title,
      author: podcasts.author,
      releaseDate: podcasts.releaseDate,
    })
    .from(libraryItems)
    .leftJoin(podcasts, eq(podcasts.libraryItemId, libraryItems.id))
    .where(eq(libraryItems.libraryId, libraryId));

  for (const r of podcastRows) {
    if (!resultById.has(r.id)) {
      resultById.set(r.id, {
        id: r.id,
        libraryId: r.libraryId,
        mediaType: r.mediaType,
        title: r.title ?? null,
        author: r.author ?? null,
        releaseDate: r.releaseDate ?? null,
        duration: null,
        coverUri: getCoverUri(r.id),
      });
    }
  }

  return Array.from(resultById.values());
}

async function upsertItems(items: Partial<LibraryItemRow>[]): Promise<void> {
  if (!items.length) return;
  for (const it of items) {
    if (!it.id || !it.libraryId) continue;
    await db
      .insert(libraryItems)
      .values({
        id: it.id,
        libraryId: it.libraryId,
        ino: (it as any).ino ?? null,
        folderId: (it as any).folderId ?? null,
        path: (it as any).path ?? null,
        relPath: (it as any).relPath ?? null,
        isFile: (it as any).isFile ?? null,
        mtimeMs: (it as any).mtimeMs ?? null,
        ctimeMs: (it as any).ctimeMs ?? null,
        birthtimeMs: (it as any).birthtimeMs ?? null,
        addedAt: (it as any).addedAt ?? null,
        updatedAt: (it as any).updatedAt ?? null,
        lastScan: (it as any).lastScan ?? null,
        scanVersion: (it as any).scanVersion ?? null,
        isMissing: (it as any).isMissing ?? null,
        isInvalid: (it as any).isInvalid ?? null,
        mediaType: it.mediaType ?? null,
      })
      .onConflictDoUpdate({
        target: libraryItems.id,
        set: {
          libraryId: it.libraryId,
          ino: (it as any).ino ?? null,
          folderId: (it as any).folderId ?? null,
          path: (it as any).path ?? null,
          relPath: (it as any).relPath ?? null,
          isFile: (it as any).isFile ?? null,
          mtimeMs: (it as any).mtimeMs ?? null,
          ctimeMs: (it as any).ctimeMs ?? null,
          birthtimeMs: (it as any).birthtimeMs ?? null,
          addedAt: (it as any).addedAt ?? null,
          updatedAt: (it as any).updatedAt ?? null,
          lastScan: (it as any).lastScan ?? null,
          scanVersion: (it as any).scanVersion ?? null,
          isMissing: (it as any).isMissing ?? null,
          isInvalid: (it as any).isInvalid ?? null,
          mediaType: it.mediaType ?? null,
        },
      });
  }
}

async function upsertBooks(rows: any[]): Promise<void> {
  if (!rows.length) return;
  for (const m of rows) {
    if (!m.id || !m.libraryItemId) continue;
    await db
      .insert(books)
      .values({
        id: m.id,
        libraryItemId: m.libraryItemId,
        title: m.title ?? null,
        subtitle: m.subtitle ?? null,
        description: m.description ?? null,
        publisher: m.publisher ?? null,
        language: m.language ?? null,
        isbn: m.isbn ?? null,
        asin: m.asin ?? null,
        releaseDate: m.releaseDate ?? null,
        explicit: m.explicit ?? null,
        duration: m.duration ?? null,
        trackCount: m.trackCount ?? null,
        format: m.format ?? null,
        edition: m.edition ?? null,
        abridged: m.abridged ?? null,
        rating: m.rating ?? null,
        ratingCount: m.ratingCount ?? null,
        goodreadsId: m.goodreadsId ?? null,
        googleBooksId: m.googleBooksId ?? null,
      })
      .onConflictDoUpdate({
        target: books.id,
        set: {
          libraryItemId: m.libraryItemId,
          title: m.title ?? null,
          subtitle: m.subtitle ?? null,
          description: m.description ?? null,
          publisher: m.publisher ?? null,
          language: m.language ?? null,
          isbn: m.isbn ?? null,
          asin: m.asin ?? null,
          releaseDate: m.releaseDate ?? null,
          explicit: m.explicit ?? null,
          duration: m.duration ?? null,
          trackCount: m.trackCount ?? null,
          format: m.format ?? null,
          edition: m.edition ?? null,
          abridged: m.abridged ?? null,
          rating: m.rating ?? null,
          ratingCount: m.ratingCount ?? null,
          goodreadsId: m.goodreadsId ?? null,
          googleBooksId: m.googleBooksId ?? null,
        },
      });
  }
}

async function upsertPodcasts(rows: any[]): Promise<void> {
  if (!rows.length) return;
  for (const m of rows) {
    if (!m.id || !m.libraryItemId) continue;
    await db
      .insert(podcasts)
      .values({
        id: m.id,
        libraryItemId: m.libraryItemId,
        title: m.title ?? null,
        author: m.author ?? null,
        description: m.description ?? null,
        releaseDate: m.releaseDate ?? null,
        feedUrl: m.feedUrl ?? null,
        imageUrl: m.imageUrl ?? null,
        itunesPageUrl: m.itunesPageUrl ?? null,
        itunesId: m.itunesId ?? null,
        itunesArtistId: m.itunesArtistId ?? null,
        explicit: m.explicit ?? null,
        language: m.language ?? null,
        type: m.type ?? null,
      })
      .onConflictDoUpdate({
        target: podcasts.id,
        set: {
          libraryItemId: m.libraryItemId,
          title: m.title ?? null,
          author: m.author ?? null,
          description: m.description ?? null,
          releaseDate: m.releaseDate ?? null,
          feedUrl: m.feedUrl ?? null,
          imageUrl: m.imageUrl ?? null,
          itunesPageUrl: m.itunesPageUrl ?? null,
          itunesId: m.itunesId ?? null,
          itunesArtistId: m.itunesArtistId ?? null,
          explicit: m.explicit ?? null,
          language: m.language ?? null,
          type: m.type ?? null,
        },
      });
  }
}

async function upsertLibraryFiles(rows: any[]): Promise<void> {
  if (!rows.length) return;
  for (const f of rows) {
    if (!f.id || !f.libraryItemId) continue;
    await db
      .insert(libraryFiles)
      .values({
        id: f.id,
        libraryItemId: f.libraryItemId,
        ino: f.ino ?? (f.inode ?? null),
        path: f.path ?? null,
        relPath: f.relPath ?? null,
        fullPath: f.fullPath ?? null,
        size: f.size ?? null,
        mtimeMs: f.mtimeMs ?? null,
        ctimeMs: f.ctimeMs ?? null,
        birthtimeMs: f.birthtimeMs ?? null,
        duration: f.duration ?? null,
        trackNum: f.trackNum ?? (f.track ?? null),
        discNum: f.discNum ?? null,
        mimeType: f.mimeType ?? (f.mimetype ?? null),
        format: f.format ?? (f.ext ?? null),
      })
      .onConflictDoUpdate({
        target: libraryFiles.id,
        set: {
          libraryItemId: f.libraryItemId,
          ino: f.ino ?? (f.inode ?? null),
          path: f.path ?? null,
          relPath: f.relPath ?? null,
          fullPath: f.fullPath ?? null,
          size: f.size ?? null,
          mtimeMs: f.mtimeMs ?? null,
          ctimeMs: f.ctimeMs ?? null,
          birthtimeMs: f.birthtimeMs ?? null,
          duration: f.duration ?? null,
          trackNum: f.trackNum ?? (f.track ?? null),
          discNum: f.discNum ?? null,
          mimeType: f.mimeType ?? (f.mimetype ?? null),
          format: f.format ?? (f.ext ?? null),
        },
      });
  }
}

function coerceString(input: unknown): string | null {
  return typeof input === 'string' && input.trim().length > 0 ? input : null;
}

function mapAbsItemsToRows(libraryId: string, data: unknown): Partial<LibraryItemRow>[] {
  const itemsArray: any[] = Array.isArray(data)
    ? data
    : Array.isArray((data as any)?.items)
      ? (data as any).items
      : Array.isArray((data as any)?.results)
        ? (data as any).results
        : [];

  return itemsArray.map((raw) => {
    const id = coerceString(raw?.id) || coerceString(raw?.libraryItemId) || coerceString(raw?._id);
    const mediaType = coerceString(raw?.mediaType) || coerceString(raw?.media?.type) || null;
    const isFile = typeof raw?.isFile === 'boolean' ? (raw.isFile ? 1 : 0) : null;
    return {
      id: id as string,
      libraryId,
      ino: typeof raw?.ino === 'number' ? raw.ino : (typeof raw?.inode === 'number' ? raw.inode : null),
      folderId: coerceString(raw?.folderId),
      path: coerceString(raw?.path),
      relPath: coerceString(raw?.relPath),
      isFile,
      mtimeMs: typeof raw?.mtimeMs === 'number' ? raw.mtimeMs : null,
      ctimeMs: typeof raw?.ctimeMs === 'number' ? raw.ctimeMs : null,
      birthtimeMs: typeof raw?.birthtimeMs === 'number' ? raw.birthtimeMs : null,
      addedAt: typeof raw?.addedAt === 'number' ? raw.addedAt : null,
      updatedAt: typeof raw?.updatedAt === 'number' ? raw.updatedAt : null,
      lastScan: typeof raw?.lastScan === 'number' ? raw.lastScan : null,
      scanVersion: typeof raw?.scanVersion === 'number' ? raw.scanVersion : null,
      isMissing: typeof raw?.isMissing === 'boolean' ? (raw.isMissing ? 1 : 0) : null,
      isInvalid: typeof raw?.isInvalid === 'boolean' ? (raw.isInvalid ? 1 : 0) : null,
      mediaType,
    } as Partial<LibraryItemRow>;
  }).filter((it) => !!it.id);
}

function mapAbsMediaAndFiles(libraryId: string, data: unknown): { bookRows: any[]; podcastRows: any[]; fileRows: any[]; bookAuthors: any[]; bookSeries: any[]; bookGenres: any[]; bookNarrators: any[]; bookAudioFiles: any[]; bookChapters: any[] } {
  const itemsArray: any[] = Array.isArray(data)
    ? data
    : Array.isArray((data as any)?.items)
      ? (data as any).items
      : Array.isArray((data as any)?.results)
        ? (data as any).results
        : [];

  const bookRows: any[] = [];
  const podcastRows: any[] = [];
  const fileRows: any[] = [];
  const authorsRows: any[] = [];
  const seriesRows: any[] = [];
  const genresRows: any[] = [];
  const narratorsRows: any[] = [];
  const bookAudioFileRows: any[] = [];
  const chapterRows: any[] = [];

  for (const raw of itemsArray) {
    const libraryItemId: string | null = coerceString(raw?.id) || coerceString(raw?.libraryItemId) || coerceString(raw?._id);
    if (!libraryItemId) continue;
    const m = raw?.media || {};
    const meta = m?.metadata || {};
    const mid: string = coerceString(m?.id) || libraryItemId;
    const type = (coerceString(m?.type) || '').toLowerCase();
    if (type === 'book') {
      bookRows.push({
        id: mid,
        libraryItemId,
        title: coerceString(meta?.title),
        subtitle: coerceString(meta?.subtitle),
        authorName: coerceString(meta?.authorName),
        series: coerceString(meta?.series),
        seriesSequence: typeof meta?.seriesSequence === 'number' ? meta.seriesSequence : null,
        description: coerceString(meta?.description),
        publisher: coerceString(meta?.publisher),
        language: coerceString(meta?.language),
        isbn: coerceString(meta?.isbn),
        asin: coerceString(meta?.asin),
        releaseDate: coerceString(meta?.releaseDate),
        explicit: typeof meta?.explicit === 'boolean' ? (meta.explicit ? 1 : 0) : null,
        duration: typeof m?.duration === 'number' ? m.duration : null,
        trackCount: Array.isArray(m?.tracks)
          ? m.tracks.length
          : (typeof meta?.trackCount === 'number' ? meta.trackCount : (typeof m?.trackCount === 'number' ? m.trackCount : (typeof m?.numTracks === 'number' ? m.numTracks : null))),
        format: coerceString(meta?.format),
        edition: coerceString(meta?.edition),
        abridged: typeof meta?.abridged === 'boolean' ? (meta.abridged ? 1 : 0) : null,
        rating: typeof meta?.rating === 'number' ? meta.rating : null,
        ratingCount: typeof meta?.ratingCount === 'number' ? meta.ratingCount : null,
        goodreadsId: coerceString(meta?.goodreadsId),
        googleBooksId: coerceString(meta?.googleBooksId),
      });

      // Authors
      const apiAuthors: any[] = Array.isArray((m as any)?.authors) ? (m as any).authors : (Array.isArray(meta?.authors) ? meta.authors : []);
      for (const a of apiAuthors) {
        const id = coerceString(a?.id);
        const name = coerceString(a?.name ?? (typeof a === 'string' ? a : null));
        if (!id && !name) continue;
        const finalId = id || `name:${name}`;
        authorsRows.push({ id: `${mid}:${finalId}`, bookId: mid, author: { id: finalId, name: name ?? null, imageUrl: coerceString(a?.imageUrl) || null, numBooks: typeof a?.numBooks === 'number' ? a.numBooks : null } });
      }

      // Series (id + name + sequence)
      const apiSeries = (m as any)?.series || { id: null, name: meta?.series };
      const seriesId = coerceString(apiSeries?.id) || (coerceString(apiSeries?.name) ? `name:${apiSeries.name}` : null);
      const seriesName = coerceString(apiSeries?.name) || null;
      const seriesSequence = typeof meta?.seriesSequence === 'number' ? meta.seriesSequence : null;
      if (seriesId) seriesRows.push({ id: `${mid}:${seriesId}`, bookId: mid, series: { id: seriesId, name: seriesName }, sequence: seriesSequence });

      // Genres (strings)
      const genres: string[] = Array.isArray(meta?.genres) ? meta.genres : [];
      for (const g of genres) {
        const n = coerceString(g);
        if (!n) continue;
        genresRows.push({ id: `${mid}:${n}`, bookId: mid, name: n });
      }

      // Narrators (strings)
      const narrators: string[] = Array.isArray(meta?.narrators) ? meta.narrators : [];
      for (const narr of narrators) {
        const n = coerceString(narr);
        if (!n) continue;
        narratorsRows.push({ id: `${mid}:${n}`, bookId: mid, name: n });
      }

      // Book-specific audioFiles (under media.audioFiles)
      const baf: any[] = Array.isArray((m as any)?.audioFiles) ? (m as any).audioFiles : [];
      for (const f of baf) {
        const fid = coerceString(f?.id);
        if (!fid) continue;
        // Upsert into audioFiles top-level
        bookAudioFileRows.push({
          linkId: `${mid}:${fid}`, bookId: mid, audioFile: {
            id: fid,
            ino: typeof f?.ino === 'number' ? f.ino : (typeof f?.inode === 'number' ? f.inode : null),
            path: coerceString(f?.path) || null,
            relPath: coerceString(f?.relPath) || null,
            fullPath: coerceString(f?.fullPath) || coerceString(f?.path) || null,
            size: typeof f?.size === 'number' ? f.size : null,
            mtimeMs: typeof f?.mtimeMs === 'number' ? f.mtimeMs : null,
            ctimeMs: typeof f?.ctimeMs === 'number' ? f.ctimeMs : null,
            birthtimeMs: typeof f?.birthtimeMs === 'number' ? f.birthtimeMs : null,
            duration: typeof f?.duration === 'number' ? f.duration : null,
            trackNum: typeof f?.trackNum === 'number' ? f.trackNum : (typeof f?.track === 'number' ? f.track : null),
            discNum: typeof f?.discNum === 'number' ? f.discNum : null,
            mimeType: coerceString(f?.mimeType) || coerceString(f?.mimetype) || null,
            format: coerceString(f?.format) || coerceString(f?.ext) || null,
          }
        });
      }

      // Book chapters (under media.chapters)
      const chapters: any[] = Array.isArray((m as any)?.chapters) ? (m as any).chapters : [];
      for (const ch of chapters) {
        const chId = coerceString(ch?.id) || `${mid}:${coerceString(ch?.title) || ''}:${typeof ch?.start === 'number' ? ch.start : ''}`;
        if (!chId) continue;
        chapterRows.push({ id: chId, bookId: mid, title: coerceString(ch?.title), start: typeof ch?.start === 'number' ? ch.start : null });
      }
    } else if (type === 'podcast') {
      podcastRows.push({
        id: mid,
        libraryItemId,
        title: coerceString(meta?.title),
        author: coerceString(meta?.author),
        description: coerceString(meta?.description),
        releaseDate: coerceString(meta?.releaseDate),
        feedUrl: coerceString(meta?.feedUrl),
        imageUrl: coerceString(meta?.imageUrl),
        itunesPageUrl: coerceString(meta?.itunesPageUrl),
        itunesId: coerceString(meta?.itunesId),
        itunesArtistId: coerceString(meta?.itunesArtistId),
        explicit: typeof meta?.explicit === 'boolean' ? (meta.explicit ? 1 : 0) : null,
        language: coerceString(meta?.language),
        type: coerceString(meta?.type),
      });
      // Podcast audio files
      const paf: any[] = Array.isArray((m as any)?.audioFiles) ? (m as any).audioFiles : [];
      for (const f of paf) {
        const fid = coerceString(f?.id);
        if (!fid) continue;
        // Store details to audioFiles map (dedup later). Reuse same structure
        bookAudioFileRows.push({
          linkId: `${mid}:${fid}`, podcastId: mid, audioFile: {
            id: fid,
            ino: typeof f?.ino === 'number' ? f.ino : (typeof f?.inode === 'number' ? f.inode : null),
            path: coerceString(f?.path) || null,
            relPath: coerceString(f?.relPath) || null,
            fullPath: coerceString(f?.fullPath) || coerceString(f?.path) || null,
            size: typeof f?.size === 'number' ? f.size : null,
            mtimeMs: typeof f?.mtimeMs === 'number' ? f.mtimeMs : null,
            ctimeMs: typeof f?.ctimeMs === 'number' ? f.ctimeMs : null,
            birthtimeMs: typeof f?.birthtimeMs === 'number' ? f.birthtimeMs : null,
            duration: typeof f?.duration === 'number' ? f.duration : null,
            trackNum: typeof f?.trackNum === 'number' ? f.trackNum : (typeof f?.track === 'number' ? f.track : null),
            discNum: typeof f?.discNum === 'number' ? f.discNum : null,
            mimeType: coerceString(f?.mimeType) || coerceString(f?.mimetype) || null,
            format: coerceString(f?.format) || coerceString(f?.ext) || null,
          }
        });
      }
    }

    const files: any[] = Array.isArray(raw?.libraryFiles)
      ? raw.libraryFiles
      : Array.isArray(m?.files)
        ? m.files
        : Array.isArray(m?.audioFiles)
          ? m.audioFiles
          : [];
    for (const f of files) {
      const fid: string | null = coerceString(f?.id);
      if (!fid) continue;
      fileRows.push({
        id: fid,
        libraryItemId,
        ino: typeof f?.ino === 'number' ? f.ino : (typeof f?.inode === 'number' ? f.inode : null),
        path: coerceString(f?.path) || null,
        relPath: coerceString(f?.relPath) || null,
        fullPath: coerceString(f?.fullPath) || coerceString(f?.path) || null,
        mimeType: coerceString(f?.mimeType) || coerceString(f?.mimetype) || null,
        format: coerceString(f?.format) || coerceString(f?.ext) || null,
        size: typeof f?.size === 'number' ? f.size : null,
        mtimeMs: typeof f?.mtimeMs === 'number' ? f.mtimeMs : null,
        ctimeMs: typeof f?.ctimeMs === 'number' ? f.ctimeMs : null,
        birthtimeMs: typeof f?.birthtimeMs === 'number' ? f.birthtimeMs : null,
        duration: typeof f?.duration === 'number' ? f.duration : null,
        trackNum: typeof f?.trackNum === 'number' ? f.trackNum : (typeof f?.track === 'number' ? f.track : null),
        discNum: typeof f?.discNum === 'number' ? f.discNum : null,
      });
    }
  }

  return { bookRows, podcastRows, fileRows, bookAuthors: authorsRows, bookSeries: seriesRows, bookGenres: genresRows, bookNarrators: narratorsRows, bookAudioFiles: bookAudioFileRows, bookChapters: chapterRows };
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const { initialized: authInitialized, isAuthenticated, accessToken } = useAuth();
  const { initialized: dbInitialized } = useDb();
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [selectedLibrary, setSelectedLibrary] = useState<LibraryRow | null>(null);
  const [items, setItems] = useState<LibraryItemListRow[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [allLibraries, setAllLibraries] = useState<LibraryRow[]>([]);
  const bootstrappedRef = useRef(false);

  // Bootstrap selected library and libraries list when auth ready
  useEffect(() => {
    if (!dbInitialized || !authInitialized || !isAuthenticated || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    (async () => {
      const libs = await loadAllLibraries();
      setAllLibraries(libs);
      let storedId = await AsyncStorage.getItem(STORAGE_KEYS.selectedLibraryId);
      let lib: LibraryRow | null = null;
      if (storedId) {
        lib = await loadLibraryById(storedId);
      }
      if (!lib) {
        lib = await loadFirstLibrary();
      }
      if (lib) {
        setSelectedLibraryId(lib.id);
        setSelectedLibrary(lib);
        const cached = await loadCachedItems(lib.id);
        setItems(cached);
        // Kick off background refresh
        void fetchAndRefreshItems(lib.id);
      }
    })();
  }, [dbInitialized, authInitialized, isAuthenticated]);

  // Ensure selectedLibrary object stays in sync with id
  useEffect(() => {
    if (!dbInitialized || !selectedLibraryId) return;
    (async () => {
      const lib = await loadLibraryById(selectedLibraryId);
      if (lib) setSelectedLibrary(lib);
    })();
  }, [dbInitialized, selectedLibraryId]);

  // this needs to be refactored to use helpers
  const fetchAndRefreshItems = useCallback(async (libraryId: string) => {
    setIsLoadingItems(true);
    try {
      const res = await fetchLibraryItems(libraryId);
      if (res.ok) {
        const json = await res.json();
        const rows = mapAbsItemsToRows(libraryId, json);
        const { bookRows, podcastRows, fileRows, bookAuthors: aRows, bookSeries: sRows, bookGenres: gRows, bookNarrators: nRows, bookAudioFiles: bafRows, bookChapters: chRows } = mapAbsMediaAndFiles(libraryId, json);
        if (dbInitialized) {
          await upsertItems(rows);
          await upsertBooks(bookRows);
          await upsertPodcasts(podcastRows);
          await upsertLibraryFiles(fileRows);
          // Insert related tables (entities, then joins)
          for (const r of aRows) {
            const a = r.author;
            if (a) {
              await db.insert(authors).values(a).onConflictDoUpdate({ target: authors.id, set: { name: a.name ?? null, imageUrl: a.imageUrl ?? null, numBooks: a.numBooks ?? null } });
              await db.insert(bookAuthorJoins).values({ id: r.id, bookId: r.bookId, authorId: a.id }).onConflictDoNothing();
            }
          }
          for (const r of sRows) {
            const s = r.series;
            if (s) {
              await db.insert(series).values(s).onConflictDoUpdate({ target: series.id, set: { name: s.name ?? null } });
              await db.insert(bookSeriesJoins).values({ id: r.id, bookId: r.bookId, seriesId: s.id, sequence: r.sequence ?? null }).onConflictDoUpdate({ target: bookSeriesJoins.id, set: { sequence: r.sequence ?? null } });
            }
          }
          for (const r of gRows) {
            await db.insert(genres).values({ name: r.name }).onConflictDoNothing();
            await db.insert(bookGenreJoins).values({ id: r.id, bookId: r.bookId, genreName: r.name }).onConflictDoNothing();
          }
          for (const r of nRows) {
            await db.insert(narrators).values({ name: r.name }).onConflictDoNothing();
            await db.insert(bookNarratorJoins).values({ id: r.id, bookId: r.bookId, narratorName: r.name }).onConflictDoNothing();
          }
          // Upsert audio files and links
          const seenAudio = new Set<string>();
          for (const r of bafRows) {
            const af = r.audioFile;
            if (af && !seenAudio.has(af.id)) {
              seenAudio.add(af.id);
              await db.insert(audioFiles).values(af).onConflictDoUpdate({ target: audioFiles.id, set: { ...af } });
            }
            if (r.bookId) {
              await db.insert(bookAudioFiles).values({ id: r.linkId, bookId: r.bookId, audioFileId: af.id }).onConflictDoNothing();
            }
            if (r.podcastId) {
              await db.insert(podcastAudioFiles).values({ id: r.linkId, podcastId: r.podcastId, audioFileId: af.id }).onConflictDoNothing();
            }
          }
          for (const r of chRows) {
            await db.insert(bookChapters).values(r).onConflictDoUpdate({ target: bookChapters.id, set: { ...r } });
          }
        }
      }
    } catch (e) {
      console.log('[Library] fetch items failed', e);
    } finally {
      if (dbInitialized) {
        const refreshed = await loadCachedItems(libraryId);
        setItems(refreshed);
      }
      setIsLoadingItems(false);
      // Kick off background cover caching to the caches/covers/{libraryItemId} path
      void cacheCoversForLibrary(libraryId);
    }
  }, [dbInitialized]);

  const selectLibrary = useCallback(async (libraryId: string) => {
    setSelectedLibraryId(libraryId);
    await AsyncStorage.setItem(STORAGE_KEYS.selectedLibraryId, libraryId);
    if (dbInitialized) {
      const lib = await loadLibraryById(libraryId);
      if (lib) setSelectedLibrary(lib);
      const cached = await loadCachedItems(libraryId);
      setItems(cached);
    }
    void fetchAndRefreshItems(libraryId);
  }, [dbInitialized, fetchAndRefreshItems]);

  // this needs to be refactored to use helpers
  const refetchLibraries = useCallback(async () => {
    if (!dbInitialized) return;
    const libs = await fetchLibraries();
    if (libs.ok) {
      const { libraries: librariesData } = await libs.json();
      for (const library of librariesData) {
        let lib = library as LibraryRow;
        console.log('[Library] refetch library', library);
        await db.insert(libraries)
          .values(lib)
          .onConflictDoUpdate({
            target: libraries.id,
            set: {
              name: lib.name,
              icon: lib.icon,
              displayOrder: lib.displayOrder,
            },
          });
      }
      setAllLibraries(librariesData as LibraryRow[]);
    }
  }, [dbInitialized]);

  const refetchItems = useCallback(async () => {
    if (!selectedLibraryId) return;
    await fetchAndRefreshItems(selectedLibraryId);
  }, [selectedLibraryId, fetchAndRefreshItems]);

  const value = useMemo<SelectedLibraryState>(() => ({
    selectedLibraryId,
    selectedLibrary,
    items,
    isLoadingItems,
    selectLibrary,
    refetchItems,
    refetchLibraries,
    libraries: allLibraries,
  }), [selectedLibraryId, selectedLibrary, items, isLoadingItems, selectLibrary, refetchItems, allLibraries]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): SelectedLibraryState {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary must be used within LibraryProvider');
  return ctx;
}
