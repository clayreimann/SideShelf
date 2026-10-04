#!/usr/bin/env node
// seed.mjs — orchestrates the demo Audiobookshelf server:
//   1. FETCH   archive.org metadata + audio/cover files for library.json entries
//   2. LAYOUT  write the Audiobookshelf folder convention under media/audiobooks
//   3. INIT    create the root user if the server hasn't been initialized
//   4. CREATE+SCAN  create the /audiobooks library and scan it
//   5. VERIFY  read the scanned items back and assert the folder-name parse
//              matches the manifest, patching (and re-asserting) mismatches
//   6. SEED STATE  create the demo user and seed listening progress
//
// Usage:
//   node demo-server/seed.mjs                 # full pipeline
//   node demo-server/seed.mjs --dry-run        # steps 1-2 only, no downloads,
//                                               # prints the planned folder tree
//   node demo-server/seed.mjs --skip-fetch      # skip 1-2 (media/ already populated)
//
// Node 20+ built-ins only. No npm dependencies.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { planMediaForEntry, downloadArchiveFile } from "./src/fetch-media.mjs";
import {
  itemRelativePath,
  writeItemLayout,
  trackDestFileName,
  removeStaleAudioFiles,
} from "./src/layout.mjs";
import {
  waitForServer,
  getStatus,
  initServer,
  login,
  ensureLibrary,
  triggerScan,
  waitForScanToSettle,
  waitForItemAudioFileCount,
  getLibraryItems,
  getLibraryItem,
  patchItemMetadata,
  updateChapters,
} from "./src/abs-client.mjs";
import { buildRetitledChapters, assertChaptersPresentable } from "./src/chapters.mjs";
import { seedDemoUser, seedListeningProgress } from "./src/seed-state.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_SERVER_ROOT = __dirname;
const AUDIOBOOKS_DIR = path.join(DEMO_SERVER_ROOT, "media", "audiobooks");

function parseArgs(argv) {
  const flags = new Set();
  for (const arg of argv) {
    if (arg.startsWith("--")) flags.add(arg.slice(2));
  }
  return {
    dryRun: flags.has("dry-run"),
    skipFetch: flags.has("skip-fetch"),
  };
}

function unquote(value) {
  const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');
  const isSingleQuoted = value.startsWith("'") && value.endsWith("'");
  return isDoubleQuoted || isSingleQuoted ? value.slice(1, -1) : value;
}

/** Parses one KEY=VALUE line; returns null for blank lines, comments, and malformed lines. */
function parseEnvLine(rawLine) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) return null;
  const eq = line.indexOf("=");
  if (eq === -1) return null;
  const key = line.slice(0, eq).trim();
  const value = unquote(line.slice(eq + 1).trim());
  return { key, value };
}

/**
 * Minimal .env loader — no shell interpolation, just KEY=VALUE lines.
 * Environment variables already set win over the file (so CI/tooling can
 * override without editing .env).
 */
async function loadEnvFile(envPath) {
  let contents;
  try {
    contents = await readFile(envPath, "utf8");
  } catch {
    return;
  }
  for (const rawLine of contents.split("\n")) {
    const parsed = parseEnvLine(rawLine);
    if (parsed && process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }
}

/**
 * Validates an already-read env value. Callers pass `process.env.FOO`
 * (a static property access) rather than a name to look up here, so this
 * stays lint-clean under expo/no-dynamic-env-var.
 */
function requireEnv(varName, value) {
  if (!value) {
    throw new Error(
      `Missing required environment variable ${varName}. Copy demo-server/.env.example to demo-server/.env and fill it in.`
    );
  }
  return value;
}

async function loadLibraryManifest() {
  const raw = await readFile(path.join(DEMO_SERVER_ROOT, "library.json"), "utf8");
  const parsed = JSON.parse(raw);
  return parsed.entries;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Fetch archive.org metadata for one entry, clean up any stale track files
 * left over from a previous identifier/mode (see removeStaleAudioFiles),
 * download the current audio + cover files, and write the sidecar layout.
 */
async function downloadEntryMedia(entry, { dryRun }) {
  const { audioFiles, coverFile } = await planMediaForEntry(entry);
  const relativePath = itemRelativePath(entry);
  const itemDir = path.join(AUDIOBOOKS_DIR, relativePath);

  const plannedAudioNames = audioFiles.map((file, index) => trackDestFileName(file.name, index));
  const removedStale = await removeStaleAudioFiles(itemDir, new Set(plannedAudioNames), { dryRun });
  for (const name of removedStale) {
    console.log(`  removing stale track file: ${relativePath}/${name}${dryRun ? " (dry-run)" : ""}`);
  }

  const plannedFiles = [];
  let entryBytes = 0;
  for (const [index, file] of audioFiles.entries()) {
    const destPath = path.join(itemDir, plannedAudioNames[index]);
    const result = await downloadArchiveFile(entry.identifier, file, destPath, { dryRun });
    plannedFiles.push({ name: plannedAudioNames[index], bytes: result.bytes, skipped: result.skipped });
    entryBytes += result.bytes;
  }

  if (coverFile) {
    const destPath = path.join(itemDir, "cover.jpg");
    const result = await downloadArchiveFile(entry.identifier, coverFile, destPath, { dryRun });
    plannedFiles.push({ name: "cover.jpg", bytes: result.bytes, skipped: result.skipped });
    entryBytes += result.bytes;
  }

  await writeItemLayout({ audiobooksDir: AUDIOBOOKS_DIR, entry, dryRun });

  return { relativePath, files: plannedFiles, bytes: entryBytes };
}

/**
 * Steps 1-2: fetch archive.org metadata (and, unless dryRun, download audio +
 * cover files), then write each item's on-disk folder layout.
 */
async function fetchAndLayout(entries, { dryRun }) {
  const plannedTree = [];
  let totalBytes = 0;

  for (const entry of entries) {
    const { relativePath, files, bytes } = await downloadEntryMedia(entry, { dryRun });
    plannedTree.push({ relativePath, files });
    totalBytes += bytes;
  }

  return { plannedTree, totalBytes };
}

function printPlannedTree(plannedTree, totalBytes) {
  console.log("\nPlanned media/audiobooks/ layout:\n");
  for (const { relativePath, files } of plannedTree) {
    console.log(relativePath + "/");
    for (const f of files) {
      const note = f.skipped ? " (already on disk)" : "";
      console.log(`  ${f.name}  ${formatBytes(f.bytes)}${note}`);
    }
  }
  console.log(`\nTotal: ${plannedTree.length} items, ${formatBytes(totalBytes)}\n`);
}

/**
 * Step 3: bring the server up to an initialized state.
 */
async function ensureInitialized(baseUrl, rootUsername, rootPassword) {
  console.log(`Waiting for Audiobookshelf at ${baseUrl} ...`);
  const status = await waitForServer(baseUrl, {
    timeoutMs: Number(process.env.SEED_SERVER_TIMEOUT_MS ?? 60_000),
  });

  if (status.isInit) {
    console.log("Server already initialized, skipping /init.");
    return;
  }

  console.log("Initializing server with root user...");
  await initServer(baseUrl, rootUsername, rootPassword);

  // /init doesn't synchronously guarantee /status flips immediately in all
  // versions; poll briefly for isInit to become true before proceeding.
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const recheck = await getStatus(baseUrl);
    if (recheck.isInit) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Server did not report isInit=true after /init.");
}

/**
 * Step 4: create the library and scan it.
 */
async function createAndScanLibrary(baseUrl, rootToken, expectedItemCount) {
  const library = await ensureLibrary(baseUrl, rootToken, {
    name: "Demo Library",
    folderFullPath: "/audiobooks",
    mediaType: "book",
  });
  console.log(`Library ready: ${library.name} (${library.id})`);

  console.log("Triggering scan...");
  await triggerScan(baseUrl, rootToken, library.id);

  console.log("Waiting for scan to settle (bounded poll — see abs-client.mjs waitForScanToSettle doc comment)...");
  const finalCount = await waitForScanToSettle(baseUrl, rootToken, library.id, {
    timeoutMs: Number(process.env.SEED_SCAN_TIMEOUT_MS ?? 300_000),
    expectAtLeast: expectedItemCount,
  });
  console.log(`Scan settled with ${finalCount} items.`);

  return library;
}

/**
 * Step 5: read scanned items back, assert the folder-name parse matches
 * the manifest (by relPath correlation), and patch+re-assert mismatches.
 */
async function verifyAndPatchParse(baseUrl, rootToken, library, entries) {
  const { results } = await getLibraryItems(baseUrl, rootToken, library.id);
  const byRelPath = new Map(results.map((item) => [item.relPath, item]));

  const progressTargets = [];
  const failures = [];

  for (const entry of entries) {
    const scannedSummary = byRelPath.get(itemRelativePath(entry));
    if (!scannedSummary) {
      failures.push(`"${entry.title}": no scanned item found at relPath "${itemRelativePath(entry)}"`);
      continue;
    }

    const outcome = await verifyAndPatchOneEntry(baseUrl, rootToken, entry, scannedSummary);
    if (outcome.failure) {
      failures.push(outcome.failure);
    } else if (outcome.progressTarget) {
      progressTargets.push(outcome.progressTarget);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Scanner parse verification failed for ${failures.length} item(s):\n  ${failures.join("\n  ")}`);
  }

  return progressTargets;
}

function formatMismatches(mismatches) {
  return mismatches.map((m) => `${m.field}: expected ${JSON.stringify(m.expected)}, got ${JSON.stringify(m.actual)}`).join("; ");
}

/**
 * Patches a mismatched item's metadata and re-fetches it, returning the
 * re-fetched item plus any mismatches that survived the patch.
 */
async function patchAndReverify(baseUrl, rootToken, entry, itemId, mismatches) {
  console.log(`Patching "${entry.title}" — mismatches: ${mismatches.map((m) => m.field).join(", ")}`);
  await patchItemMetadata(baseUrl, rootToken, itemId, buildMetadataPatch(entry, mismatches));

  const reExpanded = await getLibraryItem(baseUrl, rootToken, itemId);
  const reMismatches = diffMetadata(entry, reExpanded.media?.metadata ?? {});
  return { expanded: reExpanded, reMismatches };
}

/**
 * Verifies (and, on mismatch, patches-then-re-verifies) a single scanned
 * item against its manifest entry. Returns exactly one of `failure` or
 * `progressTarget` (which may itself be undefined if the entry has no
 * progress/finished field to seed).
 */
async function verifyAndPatchOneEntry(baseUrl, rootToken, entry, scannedSummary) {
  let expanded = await getLibraryItem(baseUrl, rootToken, scannedSummary.id);
  const mismatches = diffMetadata(entry, expanded.media?.metadata ?? {});

  if (mismatches.length > 0) {
    const reverified = await patchAndReverify(baseUrl, rootToken, entry, scannedSummary.id, mismatches);
    expanded = reverified.expanded;
    if (reverified.reMismatches.length > 0) {
      return { failure: `"${entry.title}": still mismatched after patch — ${formatMismatches(reverified.reMismatches)}` };
    }
  }

  if (entry.progress == null && !entry.finished) {
    return {};
  }
  return {
    progressTarget: { entry, itemId: scannedSummary.id, duration: expanded.media?.duration ?? 0 },
  };
}

function diffMetadata(entry, metadata) {
  const mismatches = [];
  if (metadata.title !== entry.title) {
    mismatches.push({ field: "title", expected: entry.title, actual: metadata.title });
  }
  const authorNames = (metadata.authors ?? []).map((a) => a.name);
  if (!authorNames.includes(entry.author)) {
    mismatches.push({ field: "authors", expected: [entry.author], actual: authorNames });
  }
  if (entry.series) {
    const seriesMatch = (metadata.series ?? []).find((s) => s.name === entry.series);
    if (!seriesMatch) {
      mismatches.push({ field: "series", expected: entry.series, actual: (metadata.series ?? []).map((s) => s.name) });
    } else if (entry.sequence != null && String(seriesMatch.sequence) !== String(entry.sequence)) {
      mismatches.push({ field: "sequence", expected: entry.sequence, actual: seriesMatch.sequence });
    }
  }
  return mismatches;
}

function buildMetadataPatch(entry, mismatches) {
  const patch = {};
  const fields = new Set(mismatches.map((m) => m.field));
  if (fields.has("title")) patch.title = entry.title;
  if (fields.has("authors")) patch.authors = [{ name: entry.author }];
  if (fields.has("series") || fields.has("sequence")) {
    patch.series = entry.series ? [{ name: entry.series, sequence: entry.sequence != null ? String(entry.sequence) : null }] : [];
  }
  return patch;
}

/**
 * Sets presentable chapter titles (derived from archive.org's per-file
 * `title` metadata) on one already-scanned item, reusing its EXISTING
 * chapter start/end boundaries — see chapters.mjs for why those are never
 * recomputed here.
 *
 * Re-fetches archive.org metadata (cheap — no download) to learn both the
 * expected audio file count and the ordered per-file titles, then waits for
 * the item to report that many audio files before trusting its chapters:
 * adding files to an existing item's folder doesn't change the library's
 * item count, so the scan-settle poll in createAndScanLibrary can return
 * before this item's own rescan has actually picked up new files (see
 * waitForItemAudioFileCount's doc comment).
 *
 * @param {string} baseUrl
 * @param {string} rootToken
 * @param {{ identifier: string, mode: "full" | "sample" | "first-chapter", title: string }} entry
 * @param {string} itemId
 */
async function applyChaptersForOneEntry(baseUrl, rootToken, entry, itemId) {
  const { audioFiles } = await planMediaForEntry(entry);

  const expanded = await waitForItemAudioFileCount(baseUrl, rootToken, itemId, audioFiles.length, {
    timeoutMs: Number(process.env.SEED_AUDIO_SETTLE_TIMEOUT_MS ?? 120_000),
    itemLabel: entry.title,
  });

  const existingChapters = expanded.media?.chapters ?? [];
  const retitled = buildRetitledChapters(existingChapters, audioFiles, entry.title);
  await updateChapters(baseUrl, rootToken, itemId, retitled);

  const reExpanded = await getLibraryItem(baseUrl, rootToken, itemId);
  assertChaptersPresentable(reExpanded.media?.chapters ?? [], audioFiles, entry.title);
}

/**
 * Step 5.5 (new): give every scanned item a presentable chapter list.
 * Runs after scan settle + parse verification and before progress seeding,
 * so "Continue Listening" screenshots also show real chapter titles.
 * Collects failures across all items and throws once with the full diff,
 * mirroring verifyAndPatchParse's fail-loudly pattern.
 *
 * @param {string} baseUrl
 * @param {string} rootToken
 * @param {{ id: string }} library
 * @param {Array<{ identifier: string, mode: string, title: string }>} entries
 */
async function applyChapterTitles(baseUrl, rootToken, library, entries) {
  const { results } = await getLibraryItems(baseUrl, rootToken, library.id);
  const byRelPath = new Map(results.map((item) => [item.relPath, item]));
  const failures = [];

  for (const entry of entries) {
    const relPath = itemRelativePath(entry);
    const summary = byRelPath.get(relPath);
    if (!summary) {
      failures.push(`"${entry.title}": no scanned item found at relPath "${relPath}" while setting chapters`);
      continue;
    }
    try {
      await applyChaptersForOneEntry(baseUrl, rootToken, entry, summary.id);
    } catch (err) {
      failures.push(`"${entry.title}": ${err.message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Chapter titling failed for ${failures.length} item(s):\n  ${failures.join("\n  ")}`);
  }
}

async function main() {
  const { dryRun, skipFetch } = parseArgs(process.argv.slice(2));

  await loadEnvFile(path.join(DEMO_SERVER_ROOT, ".env"));

  const entries = await loadLibraryManifest();
  console.log(`Loaded ${entries.length} manifest entries from library.json`);

  if (!skipFetch) {
    const { plannedTree, totalBytes } = await fetchAndLayout(entries, { dryRun });
    printPlannedTree(plannedTree, totalBytes);
  } else {
    console.log("Skipping FETCH/LAYOUT steps (--skip-fetch).");
  }

  if (dryRun) {
    console.log("Dry run complete (steps 1-2 only). No server contacted.");
    return;
  }

  const port = process.env.ABS_PORT ?? "13378";
  const baseUrl = process.env.SEED_BASE_URL ?? `http://127.0.0.1:${port}`;
  const rootUsername = requireEnv("ABS_ROOT_USERNAME", process.env.ABS_ROOT_USERNAME);
  const rootPassword = requireEnv("ABS_ROOT_PASSWORD", process.env.ABS_ROOT_PASSWORD);
  const demoUsername = requireEnv("DEMO_USERNAME", process.env.DEMO_USERNAME);
  const demoPassword = requireEnv("DEMO_PASSWORD", process.env.DEMO_PASSWORD);

  await ensureInitialized(baseUrl, rootUsername, rootPassword);

  const { user: rootUser } = await login(baseUrl, rootUsername, rootPassword);
  const rootToken = rootUser.token;

  const library = await createAndScanLibrary(baseUrl, rootToken, entries.length);

  console.log("Verifying scanner parse against library.json...");
  const progressTargets = await verifyAndPatchParse(baseUrl, rootToken, library, entries);
  console.log("Scanner parse verified for all items.");

  console.log("Setting chapter titles from archive.org metadata...");
  await applyChapterTitles(baseUrl, rootToken, library, entries);
  console.log("Chapter titles set for all items.");

  console.log("Seeding demo user and listening progress...");
  const demoUser = await seedDemoUser(baseUrl, rootToken, { username: demoUsername, password: demoPassword });
  const applied = await seedListeningProgress(baseUrl, demoUser.token, progressTargets);
  for (const a of applied) {
    console.log(`  progress set: "${a.title}" -> ${a.isFinished ? "finished" : `${Math.round(a.currentTime)}s`}`);
  }

  console.log("\nSeed complete.");
  console.log(`Log in at ${baseUrl} as "${demoUsername}" (see demo-server/.env for the password).`);
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message);
  if (err.body) {
    console.error("Response body:", JSON.stringify(err.body));
  }
  process.exitCode = 1;
});
