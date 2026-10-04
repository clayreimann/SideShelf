// chapters.mjs — derives presentable chapter titles from archive.org
// per-file `title` metadata and merges them onto an item's EXISTING
// Audiobookshelf-derived chapters.
//
// Audiobookshelf derives chapter start/end boundaries from the real audio
// file durations when it scans an item — those values are never recomputed
// here, only reused. This module only ever changes `title`.
//
// Node 20+ built-ins only.

import { canonicalTrackKey } from "./fetch-media.mjs";

// "01 - ", "1. ", "3: " — a leading track number with a separator.
const TRACK_NUMBER_PREFIX = /^\d+\s*[-–—.:]\s*/;
// "00 Letters" — a leading track number with only whitespace before a word.
// Requires a following letter so a genuine numeric title ("1984") survives.
const BARE_NUMBER_PREFIX = /^\d+\s+(?=\p{L})/u;

/**
 * Strip a leading track-number prefix from an archive.org chapter title:
 * "01 - Down the Rabbit Hole" -> "Down the Rabbit Hole", and
 * "00 Letters" -> "Letters". Titles with no such prefix (e.g. "Chapter 1")
 * pass through unchanged.
 * @param {string} rawTitle
 * @returns {string}
 */
export function stripTrackPrefix(rawTitle) {
  return rawTitle.replace(TRACK_NUMBER_PREFIX, "").replace(BARE_NUMBER_PREFIX, "").trim();
}

/**
 * True when `title` is unusable as a presentable chapter title: empty, or
 * identical (case-insensitively) to the source audio file's own name minus
 * extension/bitrate suffix. The latter is the failure mode archive.org
 * exhibits when an item's per-file `title` field was never populated and
 * merely echoes the filename — e.g. the LibriVox identifier
 * alice_in_wonderland_librivox has title "wonderland_ch_01" for file
 * "wonderland_ch_01_64kb.mp3".
 * @param {string} title
 * @param {string} fileName original archive.org file name (with extension)
 * @returns {boolean}
 */
export function looksLikeFilename(title, fileName) {
  if (!title) return true;
  if (title.toLowerCase() === canonicalTrackKey(fileName).toLowerCase()) return true;

  // An exact filename match is not the only unusable case. Live seeding
  // produced several titles that passed that check yet were plainly unfit for
  // an App Store screenshot:
  //   "treasure_island_ch_01-02"  — filename-shaped, but not this file's name
  //   "01" / "000"                — a bare track number, no title at all
  // Underscores are the giveaway for the first: real chapter titles use
  // spaces. The second is anything left with no letters once cleaned.
  if (/_/.test(title)) return true;
  if (!/\p{L}/u.test(title)) return true;

  return false;
}

/**
 * Derive a presentable chapter title for the file at `index` (0-based) in
 * an item's ordered audio file list, falling back to "Chapter N" when
 * archive.org's title is missing or unusable (see looksLikeFilename).
 * @param {{ name: string, title?: string }} file
 * @param {number} index
 * @returns {string}
 */
export function deriveChapterTitle(file, index) {
  const cleaned = stripTrackPrefix(file.title ?? "");
  return looksLikeFilename(cleaned, file.name) ? `Chapter ${index + 1}` : cleaned;
}

/**
 * Merge presentable titles onto an item's EXISTING chapters (reusing ABS's
 * own start/end boundaries) by position: the Nth chapter gets the Nth
 * ordered audio file's derived title. Throws if the counts don't match,
 * since that would silently misalign chapter boundaries with the wrong
 * titles rather than failing loudly.
 * @param {Array<{ id: number, start: number, end: number, title: string }>} existingChapters
 * @param {Array<{ name: string, title?: string }>} orderedAudioFiles
 * @param {string} itemLabel human-readable label for error messages
 * @returns {Array<{ id: number, start: number, end: number, title: string }>}
 */
export function buildRetitledChapters(existingChapters, orderedAudioFiles, itemLabel) {
  if (existingChapters.length !== orderedAudioFiles.length) {
    throw new Error(
      `chapter count (${existingChapters.length}) does not match audio file count ` +
        `(${orderedAudioFiles.length}) for "${itemLabel}" — refusing to guess a mapping.`
    );
  }
  return existingChapters.map((chapter, index) => ({
    id: chapter.id,
    start: chapter.start,
    end: chapter.end,
    title: deriveChapterTitle(orderedAudioFiles[index], index),
  }));
}

/**
 * Assert a retitled chapter list is presentable: at least one chapter, and
 * no title that still looks like a raw filename. Mirrors the
 * assert-don't-assume pattern of seed.mjs's scanner-parse verification step
 * — this re-reads what the server actually stored, not what we sent it.
 * @param {Array<{ title: string }>} chapters
 * @param {Array<{ name: string }>} orderedAudioFiles paired by index with `chapters`
 * @param {string} itemLabel human-readable label for error messages
 */
export function assertChaptersPresentable(chapters, orderedAudioFiles, itemLabel) {
  if (chapters.length === 0) {
    throw new Error(`"${itemLabel}" has zero chapters after retitling.`);
  }
  const badTitles = chapters
    .map((chapter, index) => ({ chapter, file: orderedAudioFiles[index] }))
    .filter(({ chapter, file }) => file && looksLikeFilename(chapter.title, file.name));
  if (badTitles.length > 0) {
    const diff = badTitles
      .map(({ chapter, file }) => `"${chapter.title}" (from ${file.name})`)
      .join(", ");
    throw new Error(
      `"${itemLabel}" still has filename-like chapter title(s) after retitling: ${diff}`
    );
  }
}
