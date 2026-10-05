// layout.mjs — computes and writes the Audiobookshelf-recognized folder
// structure under media/audiobooks/ for a manifest entry.
//
// Audiobookshelf has no bulk-metadata seeding API worth relying on:
// metadata.json is a scanner OUTPUT format, not an input. Instead the
// scanner parses title/subtitle/authors/narrators/series+sequence and
// published year straight out of the directory path, and reads sidecar
// desc.txt (description) and reader.txt (narrator) files placed in the
// item's own folder. See demo-server/README.md for the citation.
//
// Node 20+ built-ins only.

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// Matches this project's own "NN - <original name>.mp3" track naming
// convention (see trackDestFileName). Used to scope stale-file cleanup so
// it only ever touches files this pipeline wrote.
const TRACK_FILE_PATTERN = /^\d{2} - .+\.mp3$/i;

/**
 * Strip characters that are unsafe (or merely awkward) in a filesystem path
 * segment, and collapse whitespace. Keeps periods/commas/apostrophes since
 * they occur in real author and title names (e.g. "H. G. Wells").
 * @param {string} value
 * @returns {string}
 */
export function sanitizeSegment(value) {
  return value
    .replace(/[/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compute the item's directory name as Audiobookshelf expects it:
 * "Vol. N - Title" inside a series, or just "Title" for a standalone.
 * @param {{ title: string, sequence?: number }} entry
 * @returns {string}
 */
export function itemFolderName(entry) {
  const title = sanitizeSegment(entry.title);
  if (entry.sequence != null) {
    return sanitizeSegment(`Vol. ${entry.sequence} - ${title}`);
  }
  return title;
}

/**
 * Compute the item's path relative to the audiobooks library root, e.g.
 * "Arthur Conan Doyle/Sherlock Holmes/Vol. 1 - The Adventures of Sherlock Holmes"
 * or "Jane Austen/Pride and Prejudice" for a standalone.
 *
 * This relative path is also used as the correlation key when verifying the
 * scanner's parse in seed.mjs, since Audiobookshelf's item.path is
 * deterministic from this same layout.
 *
 * @param {{ author: string, title: string, series?: string, sequence?: number }} entry
 * @returns {string}
 */
export function itemRelativePath(entry) {
  const author = sanitizeSegment(entry.author);
  const segments = [author];
  if (entry.series) {
    segments.push(sanitizeSegment(entry.series));
  }
  segments.push(itemFolderName(entry));
  return path.join(...segments);
}

/**
 * Ensure the item's directory exists and write its desc.txt/reader.txt
 * sidecar files. Audio files and cover.jpg are written directly to this
 * same directory by fetch-media.mjs/seed.mjs (there is no benefit to a
 * separate download-then-copy step for potentially large audio files).
 * Idempotent — sidecar files are cheap to overwrite on every run.
 *
 * @param {object} params
 * @param {string} params.audiobooksDir absolute path to media/audiobooks
 * @param {{ author: string, title: string, series?: string, sequence?: number, narrator: string, description: string }} params.entry
 * @param {boolean} [params.dryRun]
 * @returns {Promise<{ itemDir: string, relativePath: string }>}
 */
export async function writeItemLayout({ audiobooksDir, entry, dryRun = false }) {
  const relativePath = itemRelativePath(entry);
  const itemDir = path.join(audiobooksDir, relativePath);

  if (dryRun) {
    return { itemDir, relativePath };
  }

  await mkdir(itemDir, { recursive: true });
  await writeFile(path.join(itemDir, "desc.txt"), `${entry.description}\n`, "utf8");
  await writeFile(path.join(itemDir, "reader.txt"), `${entry.narrator}\n`, "utf8");

  return { itemDir, relativePath };
}

/**
 * Remove any previously-downloaded track file in `itemDir` that is not part
 * of the current planned file set.
 *
 * This matters because changing an entry's archive.org `identifier` (as
 * happened for Alice's Adventures in Wonderland) or its `mode` leaves stale
 * files with different names sitting alongside the newly downloaded ones —
 * Audiobookshelf would otherwise scan BOTH sets as one item's audio files,
 * producing the wrong track/chapter count. Only matches this project's own
 * "NN - <name>.mp3" naming convention; cover.jpg, desc.txt, and reader.txt
 * are never touched.
 *
 * @param {string} itemDir
 * @param {Set<string>} keepFileNames destination filenames to retain
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<string[]>} filenames removed (or, in dryRun, that would be)
 */
export async function removeStaleAudioFiles(itemDir, keepFileNames, options = {}) {
  let entries;
  try {
    entries = await readdir(itemDir);
  } catch {
    return []; // item folder doesn't exist yet — nothing to clean up
  }

  const stale = entries.filter((name) => TRACK_FILE_PATTERN.test(name) && !keepFileNames.has(name));
  if (!options.dryRun) {
    await Promise.all(stale.map((name) => rm(path.join(itemDir, name))));
  }
  return stale;
}

/**
 * Compute a deterministic, order-preserving destination filename for an
 * audio track so Audiobookshelf's filename-based ordering is unambiguous
 * regardless of the source archive.org filename.
 *
 * @param {string} originalName e.g. "call_of_the_wild_7_london_64kb.mp3"
 * @param {number} index 0-based position in the ordered track list
 * @returns {string} e.g. "08 - call_of_the_wild_7_london.mp3"
 */
export function trackDestFileName(originalName, index) {
  const withoutBitrateSuffix = originalName.replace(/_64kb(?=\.mp3$)/i, "");
  const prefix = String(index + 1).padStart(2, "0");
  return `${prefix} - ${withoutBitrateSuffix}`;
}
