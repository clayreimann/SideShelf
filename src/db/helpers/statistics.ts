import { count } from 'drizzle-orm';
import { db } from '../client';
import { authors } from '../schema/authors';
import { genres } from '../schema/genres';
import { languages } from '../schema/languages';
import { narrators } from '../schema/narrators';
import { series } from '../schema/series';
import { tags } from '../schema/tags';

export async function getAuthorCount(): Promise<number> {
  const result = await db.select({ count: count() }).from(authors);
  return result[0]?.count ?? 0;
}

export async function getGenreCount(): Promise<number> {
  const result = await db.select({ count: count() }).from(genres);
  return result[0]?.count ?? 0;
}

export async function getLanguageCount(): Promise<number> {
  const result = await db.select({ count: count() }).from(languages);
  return result[0]?.count ?? 0;
}

export async function getNarratorCount(): Promise<number> {
  const result = await db.select({ count: count() }).from(narrators);
  return result[0]?.count ?? 0;
}

export async function getSeriesCount(): Promise<number> {
  const result = await db.select({ count: count() }).from(series);
  return result[0]?.count ?? 0;
}

export async function getTagCount(): Promise<number> {
  const result = await db.select({ count: count() }).from(tags);
  return result[0]?.count ?? 0;
}

export async function getAllCounts() {
  const [authorCount, genreCount, languageCount, narratorCount, seriesCount, tagCount] = await Promise.all([
    getAuthorCount(),
    getGenreCount(),
    getLanguageCount(),
    getNarratorCount(),
    getSeriesCount(),
    getTagCount(),
  ]);

  return {
    authors: authorCount,
    genres: genreCount,
    languages: languageCount,
    narrators: narratorCount,
    series: seriesCount,
    tags: tagCount,
  };
}
