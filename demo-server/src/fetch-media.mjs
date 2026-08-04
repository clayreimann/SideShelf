// fetch-media.mjs — archive.org metadata lookup + audio/cover selection + download.
//
// Node 20+ built-ins only: global `fetch`, node:fs/promises, node:path.
// No npm dependencies.

import { mkdir, stat, open } from "node:fs/promises";
import path from "node:path";

const ARCHIVE_METADATA_BASE = "https://archive.org/metadata";
const ARCHIVE_DOWNLOAD_BASE = "https://archive.org/download";

// archive.org intermittently returns 5xx for files that are perfectly healthy
// on the next attempt. A full seed pulls ~600 MB across ~150 requests, so
// without retries a single flaky response throws away a ten-minute run. This
// is not hypothetical: the first live seed died on an HTTP 500 for
// call_of_the_wild_2_london_64kb.mp3, which returned 200 three times in a row
// moments later.
const MAX_DOWNLOAD_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 1000;

// Number of ordered chapter files downloaded for `mode: "sample"` entries.
// Audiobookshelf derives one chapter per audio file, so this is also how
// many chapters a "sample" item ends up with — enough for a presentable,
// scrollable chapter list without downloading every chapter of every title.
export const SAMPLE_CHAPTER_COUNT = 4;

/** HTTP statuses worth retrying. 4xx (except 429) are permanent — don't retry. */
function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * True for errors that represent a transient failure rather than a permanent
 * one: retryable HTTP statuses (tagged by streamToFile) and the network-level
 * errors `fetch` throws (DNS, reset connections, socket timeouts).
 * @param {unknown} error
 */
function isTransientError(error) {
  if (error && typeof error === "object" && "retryable" in error) {
    return Boolean(/** @type {{ retryable?: boolean }} */ (error).retryable);
  }
  // fetch() rejects with a TypeError for network-layer failures.
  return error instanceof TypeError;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @typedef {{ name: string, format: string, size: number, track?: string, title?: string }} ArchiveFile
 * @typedef {{ identifier: string, files: ArchiveFile[], metadata: Record<string, unknown> }} ArchiveMetadata
 */

/**
 * Fetch archive.org's item metadata JSON for a given identifier.
 * @param {string} identifier
 * @returns {Promise<ArchiveMetadata>}
 */
export async function fetchArchiveMetadata(identifier) {
  const url = `${ARCHIVE_METADATA_BASE}/${encodeURIComponent(identifier)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `archive.org metadata request failed for "${identifier}": HTTP ${response.status}`
    );
  }
  /** @type {ArchiveMetadata} */
  const data = await response.json();
  if (!data || !Array.isArray(data.files) || data.files.length === 0) {
    throw new Error(`archive.org metadata for "${identifier}" has no files array`);
  }
  return data;
}

/**
 * Strip the "_64kb" bitrate-rendition suffix (if present) right before the
 * extension, so the VBR and 64Kbps renditions of the same chapter map to
 * the same canonical key, e.g. both "foo_7.mp3" and "foo_7_64kb.mp3" ->
 * "foo_7".
 * @param {string} name
 * @returns {string}
 */
export function canonicalTrackKey(name) {
  return name.replace(/\.mp3$/i, "").replace(/_64kb$/i, "");
}

/**
 * Parse archive.org's `track` field, which is inconsistently either a bare
 * integer-like string ("7") or an "N/total" string ("1/13"). Falls back to
 * a leading number in the filename, then to a large sentinel (sorts last)
 * so an unparseable entry never silently disappears from the list.
 * @param {string | undefined} trackField
 * @param {string} name
 * @returns {number}
 */
function parseTrackOrder(trackField, name) {
  if (trackField != null) {
    const [numerator] = String(trackField).split("/");
    const parsed = Number(numerator);
    if (Number.isFinite(parsed)) return parsed;
  }
  const match = name.match(/_(\d+)(?:-\d+)?_/) ?? name.match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/**
 * Pick the ordered list of MP3 files for an item, preferring the smaller
 * "64Kbps MP3" rendition (LibriVox always publishes both a VBR and 64Kbps
 * rendition per chapter) to keep demo-server disk usage sane.
 *
 * LibriVox archive.org items are inconsistent about which rendition
 * carries the `track` field (sometimes only the VBR rendition has it, and
 * even then in either "N" or "N/total" form) — so ordering is resolved
 * per *chapter* (grouping VBR/64Kbps renditions of the same chapter
 * together and taking whichever variant's track info is available) rather
 * than independently per file, which would otherwise scramble the order
 * whenever the smaller rendition is missing the field.
 *
 * Each returned file carries archive.org's per-file `title` (when present)
 * so callers can derive presentable chapter titles from it later — see
 * demo-server/src/chapters.mjs. The preferred rendition is used when it has
 * a title; otherwise the title is borrowed from a sibling rendition in the
 * same chapter group, since LibriVox items occasionally set `title` on only
 * one of the two renditions.
 *
 * @param {ArchiveMetadata} metadata
 * @param {"full" | "sample" | "first-chapter"} mode "full" downloads every
 *   chapter file; "sample" downloads the first SAMPLE_CHAPTER_COUNT ordered
 *   chapter files; "first-chapter" is a legacy alias for a single file, kept
 *   working so older manifests don't break.
 * @returns {ArchiveFile[]} ordered audio files to download
 */
export function pickAudioFiles(metadata, mode) {
  const mp3s = metadata.files.filter((f) => f.name.toLowerCase().endsWith(".mp3"));
  if (mp3s.length === 0) {
    throw new Error(`archive.org item "${metadata.metadata?.identifier ?? "?"}" has no MP3 files`);
  }

  const preferredFormat = mp3s.some((f) => f.format === "64Kbps MP3") ? "64Kbps MP3" : "VBR MP3";
  const orderedGroups = groupAndOrderChapters(mp3s);
  const selectedGroups = orderedGroups.slice(0, chapterCountForMode(mode, orderedGroups.length));

  return selectedGroups.map(([, files]) => selectPreferredFile(files, preferredFormat));
}

/**
 * How many ordered chapter groups a mode should select, given how many
 * exist in total.
 * @param {"full" | "sample" | "first-chapter"} mode
 * @param {number} totalGroups
 * @returns {number}
 */
function chapterCountForMode(mode, totalGroups) {
  if (mode === "full") return totalGroups;
  if (mode === "sample") return SAMPLE_CHAPTER_COUNT;
  return 1; // "first-chapter" legacy alias
}

/**
 * Group same-chapter MP3 renditions together (see canonicalTrackKey) and
 * sort the groups into chapter order.
 * @param {ArchiveFile[]} mp3s
 * @returns {[string, ArchiveFile[]][]}
 */
function groupAndOrderChapters(mp3s) {
  /** @type {Map<string, ArchiveFile[]>} */
  const groups = new Map();
  for (const file of mp3s) {
    const key = canonicalTrackKey(file.name);
    const group = groups.get(key) ?? [];
    group.push(file);
    groups.set(key, group);
  }

  return [...groups.entries()].sort(([, filesA], [, filesB]) => {
    const trackA = Math.min(...filesA.map((f) => parseTrackOrder(f.track, f.name)));
    const trackB = Math.min(...filesB.map((f) => parseTrackOrder(f.track, f.name)));
    if (trackA !== trackB) return trackA - trackB;
    return filesA[0].name.localeCompare(filesB[0].name);
  });
}

/**
 * Pick the preferred-format rendition from a chapter's file group, carrying
 * over a sibling rendition's `title` if the preferred one lacks it.
 * @param {ArchiveFile[]} files
 * @param {string} preferredFormat
 * @returns {ArchiveFile}
 */
function selectPreferredFile(files, preferredFormat) {
  const preferred = files.find((f) => f.format === preferredFormat) ?? files[0];
  if (preferred.title) return preferred;
  const withTitle = files.find((f) => f.title);
  return withTitle ? { ...preferred, title: withTitle.title } : preferred;
}

/**
 * Pick the largest non-thumbnail JPEG file to use as cover art.
 * @param {ArchiveMetadata} metadata
 * @returns {ArchiveFile | null}
 */
export function pickCoverFile(metadata) {
  const jpegs = metadata.files.filter((f) => {
    const isJpeg = f.format === "JPEG" || /\.(jpe?g)$/i.test(f.name);
    const isThumb = f.format === "JPEG Thumb" || /thumb/i.test(f.name);
    return isJpeg && !isThumb;
  });
  if (jpegs.length === 0) return null;
  return jpegs.reduce((largest, f) => (Number(f.size) > Number(largest.size) ? f : largest));
}

/**
 * Streams `url` to `tmpPath`, returning the number of bytes written.
 * Throws if the HTTP response is not ok or has no body.
 * @param {string} url
 * @param {string} tmpPath
 * @returns {Promise<number>}
 */
async function streamToFile(url, tmpPath) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    const error = new Error(`Download failed for ${url}: HTTP ${response.status}`);
    // Tagged so downloadArchiveFile can tell a flaky 503 from a real 404.
    Object.assign(error, { retryable: isRetryableStatus(response.status) });
    throw error;
  }

  const handle = await open(tmpPath, "w");
  let bytesWritten = 0;
  try {
    const writable = handle.createWriteStream();
    for await (const chunk of response.body) {
      bytesWritten += chunk.length;
      if (!writable.write(chunk)) {
        await new Promise((resolve) => writable.once("drain", resolve));
      }
    }
    await new Promise((resolve, reject) => {
      writable.end((err) => (err ? reject(err) : resolve(undefined)));
    });
  } finally {
    await handle.close();
  }
  return bytesWritten;
}

/**
 * Stream `url` to `tmpPath`, retrying transient failures with exponential
 * backoff, and asserting the result is exactly `expectedSize` bytes.
 *
 * A truncated body counts as transient: archive.org sometimes closes a
 * connection early, and the byte-length check is what detects it. Because the
 * caller only renames tmpPath into place after this resolves, a failed attempt
 * can never leave a partial file that a later run mistakes for a complete one.
 *
 * @param {string} url
 * @param {string} tmpPath
 * @param {number} expectedSize
 * @param {string} label human-readable file description, used in messages
 * @returns {Promise<number>} bytes written
 */
async function streamWithRetry(url, tmpPath, expectedSize, label) {
  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      const bytesWritten = await streamToFile(url, tmpPath);
      if (bytesWritten !== expectedSize) {
        throw Object.assign(
          new Error(
            `Downloaded byte length mismatch for ${label}: expected ${expectedSize} bytes ` +
              `from archive.org metadata, got ${bytesWritten}.`
          ),
          { retryable: true }
        );
      }
      return bytesWritten;
    } catch (error) {
      if (attempt === MAX_DOWNLOAD_ATTEMPTS || !isTransientError(error)) {
        throw error;
      }
      const delayMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(
        `  retrying ${label} in ${delayMs}ms (attempt ${attempt} failed: ${error.message})`
      );
      await sleep(delayMs);
    }
  }
  // Unreachable: the loop either returns or throws on the final attempt.
  throw new Error(`Exhausted download attempts for ${label}`);
}

/**
 * Download a single archive.org file to `destPath`, skipping the download if
 * a file of the expected size already exists there (idempotent re-runs), and
 * verifying the downloaded byte length against the size archive.org reported.
 *
 * @param {string} identifier
 * @param {ArchiveFile} file
 * @param {string} destPath
 * @param {{ dryRun?: boolean }} [options]
 * @returns {Promise<{ skipped: boolean, bytes: number }>}
 */
export async function downloadArchiveFile(identifier, file, destPath, options = {}) {
  const expectedSize = Number(file.size);
  const existing = await stat(destPath).catch(() => null);
  if (existing?.isFile() && existing.size === expectedSize) {
    return { skipped: true, bytes: existing.size };
  }

  if (options.dryRun) {
    return { skipped: false, bytes: expectedSize };
  }

  await mkdir(path.dirname(destPath), { recursive: true });

  const url = `${ARCHIVE_DOWNLOAD_BASE}/${encodeURIComponent(identifier)}/${encodeURIComponent(file.name)}`;
  const tmpPath = `${destPath}.download`;
  const bytesWritten = await streamWithRetry(
    url,
    tmpPath,
    expectedSize,
    `${file.name} ("${identifier}")`
  );

  const { rename } = await import("node:fs/promises");
  await rename(tmpPath, destPath);

  return { skipped: false, bytes: bytesWritten };
}

/**
 * Resolve the full download plan for a manifest entry: which audio files
 * and which cover file will be fetched, without necessarily fetching them
 * (see `dryRun`).
 *
 * @param {{ identifier: string, mode: "full" | "sample" | "first-chapter" }} entry
 * @returns {Promise<{ metadata: ArchiveMetadata, audioFiles: ArchiveFile[], coverFile: ArchiveFile | null }>}
 */
export async function planMediaForEntry(entry) {
  const metadata = await fetchArchiveMetadata(entry.identifier);
  const audioFiles = pickAudioFiles(metadata, entry.mode);
  const coverFile = pickCoverFile(metadata);
  return { metadata, audioFiles, coverFile };
}
