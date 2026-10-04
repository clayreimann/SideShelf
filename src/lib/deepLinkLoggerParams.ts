/**
 * Pure parsing helpers for `side-shelf://logger?...` deep links.
 *
 * Extracted out of src/app/_layout.tsx so it can be unit tested (src/app/ is
 * excluded from coverage) and reused to build a human-readable confirmation
 * message before any logger configuration change from a deep link is applied.
 *
 * Supported query formats:
 * - level[TAG_NAME]=warn        -> set a tag's minimum log level
 * - enabled[TAG_NAME]=false     -> enable/disable a tag
 *
 * A logger deep link can flip on verbose logging tags (e.g. "api:fetch:detailed",
 * which logs full request/response bodies — including tokens and passwords, see
 * src/lib/api/redact.ts) with nothing more than a tapped link. Parsing is kept
 * separate from applying so the caller can show the user exactly what's being
 * requested and get explicit confirmation first.
 */

import type { LogLevel } from "@/lib/logger/types";

const VALID_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

export interface LoggerDeepLinkParams {
  /** Tag -> requested minimum log level (only valid levels are included). */
  tagLevels: Record<string, LogLevel>;
  /** Tag -> requested enabled state. */
  tagEnabled: Record<string, boolean>;
}

function isValidLevel(value: string): value is LogLevel {
  return (VALID_LEVELS as readonly string[]).includes(value);
}

/**
 * Parse the query parameters of a logger deep link URL into a structured,
 * validated result. Unrecognized level values are silently dropped (matches
 * prior inline behavior) rather than surfaced as an error, since a deep link
 * may intentionally target only a subset of tags.
 */
export function parseLoggerDeepLinkParams(url: string): LoggerDeepLinkParams {
  const tagLevels: Record<string, LogLevel> = {};
  const tagEnabled: Record<string, boolean> = {};

  const urlObj = new URL(url);

  urlObj.searchParams.forEach((value, key) => {
    const levelMatch = key.match(/^level\[(.+)\]$/);
    if (levelMatch) {
      const tagName = decodeURIComponent(levelMatch[1]);
      const level = value.toLowerCase();
      if (isValidLevel(level)) {
        tagLevels[tagName] = level;
      }
      return;
    }

    const enabledMatch = key.match(/^enabled\[(.+)\]$/);
    if (enabledMatch) {
      const tagName = decodeURIComponent(enabledMatch[1]);
      tagEnabled[tagName] = value.toLowerCase() !== "false";
    }
  });

  return { tagLevels, tagEnabled };
}

/** True if the parsed params contain at least one recognized change to apply. */
export function hasLoggerDeepLinkChanges(params: LoggerDeepLinkParams): boolean {
  return Object.keys(params.tagLevels).length > 0 || Object.keys(params.tagEnabled).length > 0;
}

/**
 * Build human-readable lines describing the requested changes, suitable for
 * display in a confirmation dialog before they're applied.
 */
export function describeLoggerDeepLinkParams(params: LoggerDeepLinkParams): string[] {
  const lines: string[] = [];
  for (const [tag, level] of Object.entries(params.tagLevels)) {
    lines.push(`Set log level for "${tag}" to ${level}`);
  }
  for (const [tag, enabled] of Object.entries(params.tagEnabled)) {
    lines.push(`${enabled ? "Enable" : "Disable"} logging for "${tag}"`);
  }
  return lines;
}
