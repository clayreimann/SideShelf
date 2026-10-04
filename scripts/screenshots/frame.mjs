#!/usr/bin/env node
/**
 * frame.mjs — App Store Connect screenshot compositor.
 *
 * Takes the raw 1320x2868 device captures produced by capture.sh and
 * composites each one into a captioned, framed 1320x2868 image ready for
 * App Store Connect's iPhone 6.9" screenshot slot.
 *
 * No npm dependencies: uses only Node builtins (fs, path, child_process)
 * plus the system's installed Google Chrome for rendering, and macOS's
 * built-in `sips` for the final alpha-flatten (ASC rejects PNGs/JPEGs with
 * an alpha channel, and headless Chrome always emits one, even for an
 * opaque page).
 *
 * Usage:
 *   node scripts/screenshots/frame.mjs [--theme dark|light]
 *
 * The theme selects which raw capture set to composite for the App Store
 * Connect set (ASC wants ONE representative image per slot, not a
 * dark/light pair — that pairing is a website-only concept, handled
 * separately by web.sh). Defaults to "dark".
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const REQUIRED_WIDTH = 1320;
const REQUIRED_HEIGHT = 2868;

// Frame chrome colors -- dark background from src/lib/theme.ts
// (colors.background for isDark), accent from the website's --clr-accent
// (SideShelf-web/src/assets/css/style.css), kept in sync so the App Store
// screenshots, the app, and the marketing site all read as one brand.
const BG_COLOR = "#222222";
const ACCENT_COLOR = "#4a9ee8";

function parseArgs(argv) {
  const args = { theme: "dark" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--theme") {
      args.theme = argv[++i];
    }
  }
  return args;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toDataUri(pngPath) {
  const buf = readFileSync(pngPath);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

function readPixelDims(pngPath) {
  const width = execFileSync("sips", ["-g", "pixelWidth", pngPath]).toString();
  const height = execFileSync("sips", ["-g", "pixelHeight", pngPath]).toString();
  const w = width.match(/pixelWidth:\s*(\d+)/)?.[1];
  const h = height.match(/pixelHeight:\s*(\d+)/)?.[1];
  return { width: w ? Number(w) : null, height: h ? Number(h) : null };
}

function hasAlpha(imagePath) {
  const out = execFileSync("sips", ["-g", "hasAlpha", imagePath]).toString();
  return /hasAlpha:\s*yes/.test(out);
}

function main() {
  const { theme } = parseArgs(process.argv.slice(2));

  if (!existsSync(CHROME_PATH)) {
    console.error(`ERROR: Chrome not found at "${CHROME_PATH}". Install Google Chrome or update CHROME_PATH in frame.mjs.`);
    process.exit(1);
  }

  const captionsPath = join(__dirname, "captions.json");
  const templatePath = join(__dirname, "template.html");
  const rawDir = join(REPO_ROOT, ".screenshots", "raw", theme);
  const storeDir = join(REPO_ROOT, ".screenshots", "store");
  const tmpDir = join(REPO_ROOT, ".screenshots", "tmp");

  if (!existsSync(rawDir)) {
    console.error(`ERROR: ${rawDir} not found. Run capture.sh first.`);
    process.exit(1);
  }

  const captions = JSON.parse(readFileSync(captionsPath, "utf8"));
  const template = readFileSync(templatePath, "utf8");

  mkdirSync(storeDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });

  let failures = 0;

  for (const entry of captions.sort((a, b) => a.order - b.order)) {
    const rawPng = join(rawDir, `${entry.file}.png`);
    if (!existsSync(rawPng)) {
      console.error(`   MISSING raw capture: ${rawPng}`);
      failures++;
      continue;
    }

    const html = template
      .replaceAll("{{BG_COLOR}}", BG_COLOR)
      .replaceAll("{{ACCENT_COLOR}}", ACCENT_COLOR)
      .replaceAll("{{CAPTION}}", escapeHtml(entry.caption))
      .replaceAll("{{IMAGE_SRC}}", toDataUri(rawPng));

    const frameHtmlPath = join(tmpDir, `${entry.name}.html`);
    const frameRawPngPath = join(tmpDir, `${entry.name}.raw.png`);
    writeFileSync(frameHtmlPath, html, "utf8");

    execFileSync(CHROME_PATH, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--window-size=1320,2868",
      `--screenshot=${frameRawPngPath}`,
      `file://${frameHtmlPath}`,
    ]);

    const dims = readPixelDims(frameRawPngPath);
    if (dims.width !== REQUIRED_WIDTH || dims.height !== REQUIRED_HEIGHT) {
      console.error(
        `   FAIL ${entry.name}: rendered ${dims.width}x${dims.height}px, expected ${REQUIRED_WIDTH}x${REQUIRED_HEIGHT}px`
      );
      failures++;
      continue;
    }

    const outJpg = join(storeDir, `${String(entry.order).padStart(2, "0")}-${entry.name}.jpg`);
    // Flatten alpha: App Store Connect rejects images with an alpha
    // channel, and headless Chrome emits one even for a fully opaque page.
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "95", frameRawPngPath, "--out", outJpg]);

    if (hasAlpha(outJpg)) {
      console.error(`   FAIL ${entry.name}: flattened JPG still reports an alpha channel`);
      failures++;
      continue;
    }

    console.log(`   OK   ${outJpg}`);
  }

  if (failures > 0) {
    console.error(`\n${failures} frame(s) failed. See errors above.`);
    process.exit(1);
  }

  console.log(`\nApp Store Connect screenshots written to ${storeDir}/`);
}

main();
