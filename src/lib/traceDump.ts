import { Directory, File, Paths } from "expo-file-system";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { Platform } from "react-native";
import { trace } from "@/lib/trace";
import { logger } from "@/lib/logger";

const log = logger.forTag("traceDump");

export async function writeDumpToDisk(
  reason: "rejection" | "manual",
  rejectionEvent?: unknown
): Promise<string> {
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `trace-dump-${iso}.json`;
  const file = new File(Paths.document, filename);

  const exported = trace.exportTrace();

  // Flatten meta fields to the root of the payload for easier reading
  const payload = {
    exportedAt: exported.exportedAt,
    appVersion: Constants.expoConfig?.version ?? "unknown",
    buildVersion: Application.nativeBuildVersion ?? "unknown",
    platform: Platform.OS,
    dumpReason: reason,
    rejectionEvent: rejectionEvent ?? null,
    records: exported.records,
  };

  await file.write(JSON.stringify(payload, null, 2));
  log.info(`[writeDumpToDisk] Wrote trace dump: ${filename}`);
  pruneTraceDumps().catch((e) => log.warn("[writeDumpToDisk] prune failed", e));
  return file.uri;
}

/**
 * Parse the timestamp from a trace dump filename.
 * Format: trace-dump-YYYY-MM-DDThh-mm-ss-mssZ.json
 * (ISO 8601 with ':' and '.' replaced by '-')
 */
function parseDumpTimestamp(name: string): number | null {
  const inner = name.replace(/^trace-dump-/, "").replace(/\.json$/, "");
  const tIdx = inner.indexOf("T");
  if (tIdx === -1) return null;
  const datePart = inner.slice(0, tIdx);
  const timeParts = inner.slice(tIdx + 1).split("-"); // ["hh", "mm", "ss", "mssZ"]
  if (timeParts.length < 4) return null;
  const fullIso = `${datePart}T${timeParts[0]}:${timeParts[1]}:${timeParts[2]}.${timeParts[3]}`;
  const ts = Date.parse(fullIso);
  return isNaN(ts) ? null : ts;
}

/**
 * Prune trace dumps to the most recent 30 files within the last 7 days.
 * Files older than 7 days are not managed by this function.
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
        entry.ts !== null && entry.ts >= cutoff
    )
    .sort((a, b) => b.ts - a.ts);

  const toDelete = dumps.slice(30);
  for (const { file } of toDelete) {
    file.delete();
  }
  log.info(`[pruneTraceDumps] kept=${Math.min(dumps.length, 30)} deleted=${toDelete.length}`);
}
