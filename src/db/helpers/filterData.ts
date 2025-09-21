import type { FilterData } from '@/lib/api/types';
import { db } from '../client';
import { AuthorRow, authors } from '../schema/authors';
import { GenreRow, genres } from '../schema/genres';
import { LanguageRow, languages } from '../schema/languages';
import { NarratorRow, narrators } from '../schema/narrators';
import { series, SeriesRow } from '../schema/series';
import { TagRow, tags } from '../schema/tags';

/**
 * Marshal filterdata from API response to database rows
 */
export function marshalFilterDataFromApi(filterData: FilterData) {
  const authorRows: Omit<AuthorRow, 'numBooks'>[] = filterData.authors.map(author => ({
    id: author.id,
    name: author.name,
    imageUrl: null, // Not provided in filterdata
  }));

  const genreRows: GenreRow[] = filterData.genres.map(genre => ({
    name: genre,
  }));

  const languageRows: LanguageRow[] = filterData.languages.map(language => ({
    name: language,
  }));

  const narratorRows: NarratorRow[] = filterData.narrators.map(narrator => ({
    name: narrator,
  }));

  const seriesRows: Omit<SeriesRow, 'description' | 'addedAt' | 'updatedAt'>[] = filterData.series.map(serie => ({
    id: serie.id,
    name: serie.name,
  }));

  const tagRows: TagRow[] = filterData.tags.map(tag => ({
    name: tag,
  }));

  return {
    authors: authorRows,
    genres: genreRows,
    languages: languageRows,
    narrators: narratorRows,
    series: seriesRows,
    tags: tagRows,
  };
}

/**
 * Upsert authors from filterdata
 */
export async function upsertAuthorsFromFilterData(authorRows: Omit<AuthorRow, 'numBooks'>[]) {
  if (authorRows.length === 0) return;

  for (const author of authorRows) {
    await db
      .insert(authors)
      .values({
        ...author,
        numBooks: 0, // Default value, will be updated when books are processed
      })
      .onConflictDoUpdate({
        target: authors.id,
        set: {
          name: author.name,
          imageUrl: author.imageUrl,
        },
      });
  }
}

/**
 * Upsert genres from filterdata
 */
export async function upsertGenresFromFilterData(genreRows: GenreRow[]) {
  if (genreRows.length === 0) return;

  for (const genre of genreRows) {
    await db
      .insert(genres)
      .values(genre)
      .onConflictDoNothing();
  }
}

/**
 * Upsert languages from filterdata
 */
export async function upsertLanguagesFromFilterData(languageRows: LanguageRow[]) {
  if (languageRows.length === 0) return;

  for (const language of languageRows) {
    await db
      .insert(languages)
      .values(language)
      .onConflictDoNothing();
  }
}

/**
 * Upsert narrators from filterdata
 */
export async function upsertNarratorsFromFilterData(narratorRows: NarratorRow[]) {
  if (narratorRows.length === 0) return;

  for (const narrator of narratorRows) {
    await db
      .insert(narrators)
      .values(narrator)
      .onConflictDoNothing();
  }
}

/**
 * Upsert series from filterdata
 */
export async function upsertSeriesFromFilterData(seriesRows: Omit<SeriesRow, 'description' | 'addedAt' | 'updatedAt'>[]) {
  if (seriesRows.length === 0) return;

  for (const serie of seriesRows) {
    await db
      .insert(series)
      .values({
        ...serie,
        description: null,
        addedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: series.id,
        set: {
          name: serie.name,
          updatedAt: new Date(),
        },
      });
  }
}

/**
 * Upsert tags from filterdata
 */
export async function upsertTagsFromFilterData(tagRows: TagRow[]) {
  if (tagRows.length === 0) return;

  for (const tag of tagRows) {
    await db
      .insert(tags)
      .values(tag)
      .onConflictDoNothing();
  }
}

/**
 * Upsert all filterdata into the database
 */
export async function upsertFilterData(filterData: FilterData) {
  const marshaledData = marshalFilterDataFromApi(filterData);

  await Promise.all([
    upsertAuthorsFromFilterData(marshaledData.authors),
    upsertGenresFromFilterData(marshaledData.genres),
    upsertLanguagesFromFilterData(marshaledData.languages),
    upsertNarratorsFromFilterData(marshaledData.narrators),
    upsertSeriesFromFilterData(marshaledData.series),
    upsertTagsFromFilterData(marshaledData.tags),
  ]);

  console.log('[filterData] Successfully upserted filterdata:', {
    authors: marshaledData.authors.length,
    genres: marshaledData.genres.length,
    languages: marshaledData.languages.length,
    narrators: marshaledData.narrators.length,
    series: marshaledData.series.length,
    tags: marshaledData.tags.length,
  });
}
