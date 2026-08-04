import { Directory, File, Paths } from "expo-file-system";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { Platform } from "react-native";
import { sanitizeTracePayload, trace } from "@/lib/trace";
import { logger } from "@/lib/logger";
import { getProgressSyncDiagnostics } from "@/db/helpers/progressSyncOutbox";

const log = logger.forTag("traceDump");
const DUMP_FILENAME_PATTERN =
  /^trace-dump-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json$/;

export async function writeDumpToDisk(
  reason: "rejection" | "manual",
  rejectionEvent?: unknown
): Promise<string> {
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `trace-dump-${iso}.json`;
  const file = new File(Paths.document, filename);

  const exported = trace.exportTrace();
  const progressSyncDiagnostics = await getProgressSyncDiagnostics()
    .then((rows) => ({ available: true, rows }))
    .catch(() => {
      log.warn("[writeDumpToDisk] Progress sync diagnostics unavailable");
      return { available: false, rows: [] };
    });

  // Flatten meta fields to the root of the payload for easier reading
  const payload = {
    exportedAt: exported.exportedAt,
    appVersion: Constants.expoConfig?.version ?? "unknown",
    buildVersion: Application.nativeBuildVersion ?? "unknown",
    platform: Platform.OS,
    dumpReason: reason,
    rejectionEvent: rejectionEvent ?? null,
    progressSyncOutboxAvailable: progressSyncDiagnostics.available,
    progressSyncOutbox: progressSyncDiagnostics.rows,
    records: exported.records,
  };

  await file.write(JSON.stringify(sanitizeTracePayload(payload), null, 2));
  log.info(`[writeDumpToDisk] Wrote trace dump: ${filename}`);
  pruneTraceDumps().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`[writeDumpToDisk] prune failed: ${message}`);
  });
  return file.uri;
}

/**
 * Parse the timestamp from a trace dump filename.
 * Format: trace-dump-YYYY-MM-DDThh-mm-ss-mssZ.json
 * (ISO 8601 with ':' and '.' replaced by '-')
 */
function parseDumpTimestamp(name: string): number | null {
  const match = name.match(DUMP_FILENAME_PATTERN);
  if (!match) return null;

  const [year, month, day, hour, minute, second, millisecond] = match.slice(1).map(Number);
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const date = new Date(timestamp);

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second &&
    date.getUTCMilliseconds() === millisecond
    ? timestamp
    : null;
}

/**
 * Prune trace dumps to the most recent 30 files within the last 7 days.
 * Called fire-and-forget after writeDumpToDisk and on app foreground.
 */
export async function pruneTraceDumps(): Promise<void> {
  const dir = new Directory(Paths.document);
  const files = await dir.list();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const dumps = (files as Array<{ name: string; delete: () => void }>)
    .filter((f) => /^trace-dump-.*\.json$/.test(f.name))
    .map((f) => ({ file: f, ts: parseDumpTimestamp(f.name) }))
    .filter(
      (entry): entry is { file: { name: string; delete: () => void }; ts: number } =>
        entry.ts !== null
    );

  const expired = dumps.filter((entry) => entry.ts < cutoff);
  const recent = dumps.filter((entry) => entry.ts >= cutoff).sort((a, b) => b.ts - a.ts);
  const overflow = recent.slice(30);
  const toDelete = [...expired, ...overflow];

  for (const { file } of toDelete) {
    file.delete();
  }
  log.info(`[pruneTraceDumps] kept=${recent.length - overflow.length} deleted=${toDelete.length}`);
}
