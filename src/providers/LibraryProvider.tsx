import { db } from '@/db/client';
import type { LibraryItemRow, LibraryRow } from '@/db/schema';
import { libraries, libraryItems } from '@/db/schema';
import { fetchLibraries, fetchLibraryItems } from '@/lib/api/endpoints';
import { useAuth } from '@/providers/AuthProvider';
import { useDb } from '@/providers/DbProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { eq } from 'drizzle-orm';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type SelectedLibraryState = {
  selectedLibraryId: string | null;
  selectedLibrary: LibraryRow | null;
  items: LibraryItemRow[];
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

async function loadCachedItems(libraryId: string): Promise<LibraryItemRow[]> {
  const rows = await db
    .select()
    .from(libraryItems)
    .where(eq(libraryItems.libraryId, libraryId));
  return rows;
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
        title: it.title ?? null,
        mediaType: it.mediaType ?? null,
        author: it.author ?? null,
        series: it.series ?? null,
      })
      .onConflictDoUpdate({
        target: libraryItems.id,
        set: {
          libraryId: it.libraryId,
          title: it.title ?? null,
          mediaType: it.mediaType ?? null,
          author: it.author ?? null,
          series: it.series ?? null,
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
    const title = coerceString(raw?.title) || coerceString(raw?.name) || coerceString(raw?.media?.metadata?.title) || null;
    const mediaType = coerceString(raw?.mediaType) || coerceString(raw?.media?.type) || null;
    const author = coerceString(raw?.author) || coerceString(raw?.media?.metadata?.authorName) || null;
    const series = coerceString(raw?.series) || coerceString(raw?.media?.metadata?.series) || null;
    return { id: id as string, libraryId, title, mediaType, author, series } as Partial<LibraryItemRow>;
  }).filter((it) => !!it.id);
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const { initialized: authInitialized, isAuthenticated } = useAuth();
  const { initialized: dbInitialized } = useDb();
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [selectedLibrary, setSelectedLibrary] = useState<LibraryRow | null>(null);
  const [items, setItems] = useState<LibraryItemRow[]>([]);
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

  const fetchAndRefreshItems = useCallback(async (libraryId: string) => {
    setIsLoadingItems(true);
    try {
      const res = await fetchLibraryItems(libraryId);
      if (res.ok) {
        const json = await res.json();
        const rows = mapAbsItemsToRows(libraryId, json);
        if (dbInitialized) {
          await upsertItems(rows);
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
