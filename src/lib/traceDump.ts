import { File, Paths } from "expo-file-system";
import Constants from "expo-constants";
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
    platform: Platform.OS,
    dumpReason: reason,
    rejectionEvent: rejectionEvent ?? null,
    records: exported.records,
  };

  await file.write(JSON.stringify(payload, null, 2));
  log.info(`[writeDumpToDisk] Wrote trace dump: ${filename}`);
  return file.uri;
}
