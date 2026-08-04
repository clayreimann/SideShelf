import { db } from "@/db/client";
import { markAudioFileAsDownloaded, markLibraryFileAsDownloaded } from "@/db/helpers/localData";
import { audioFiles } from "@/db/schema/audioFiles";
import { libraryFiles } from "@/db/schema/libraryFiles";
import { mediaMetadata } from "@/db/schema/mediaMetadata";
import { translate } from "@/i18n";
import { logger } from "@/lib/logger";
import type { OrphanFile } from "@/lib/orphanScanner";
import { and, eq } from "drizzle-orm";
import { Alert } from "react-native";

const log = logger.forTag("orphanAssociation");

const AUDIO_EXTENSIONS = [".mp3", ".m4b", ".m4a", ".ogg", ".opus", ".flac", ".aac", ".wav"];

function normalizeTitle(value: string | null | undefined): string {
  if (!value) return translate("advanced.trackPlayer.unknownItem");
  const trimmed = value.trim();
  return trimmed || translate("advanced.trackPlayer.unknownItem");
}

/**
 * Associate an orphaned downloaded file with its known library item record.
 *
 * Looks up the library item title from mediaMetadata, determines whether the
 * file is audio or non-audio by extension, finds the matching DB record, then
 * presents a confirmation alert. On confirmation, calls
 * markAudioFileAsDownloaded or markLibraryFileAsDownloaded and invokes
 * onRemove so the caller can remove the item from its list.
 *
 * @param orphan - The orphaned file to associate
 * @param onRemove - Called with orphan.uri after a successful repair
 */
export async function associateOrphanFile(
  orphan: OrphanFile,
  onRemove: (uri: string) => void
): Promise<void> {
  try {
    // 1. Look up item title by libraryItemId from mediaMetadata
    const metadataRows = await db
      .select({ title: mediaMetadata.title })
      .from(mediaMetadata)
      .where(eq(mediaMetadata.libraryItemId, orphan.libraryItemId))
      .limit(1);
    const title = normalizeTitle(metadataRows[0]?.title);

    // 2. Determine file type by extension
    const ext = orphan.filename.slice(orphan.filename.lastIndexOf(".")).toLowerCase();
    const isAudio = AUDIO_EXTENSIONS.includes(ext);

    // 3. Look up the file ID needed for DB repair
    let fileId: string | null = null;
    if (isAudio) {
      const rows = await db
        .select({ id: audioFiles.id })
        .from(audioFiles)
        .innerJoin(mediaMetadata, eq(audioFiles.mediaId, mediaMetadata.id))
        .where(
          and(
            eq(mediaMetadata.libraryItemId, orphan.libraryItemId),
            eq(audioFiles.filename, orphan.filename)
          )
        )
        .limit(1);
      fileId = rows[0]?.id ?? null;
    } else {
      const rows = await db
        .select({ id: libraryFiles.id })
        .from(libraryFiles)
        .where(
          and(
            eq(libraryFiles.libraryItemId, orphan.libraryItemId),
            eq(libraryFiles.filename, orphan.filename)
          )
        )
        .limit(1);
      fileId = rows[0]?.id ?? null;
    }

    if (!fileId) {
      Alert.alert(
        "Cannot Repair",
        `No matching ${isAudio ? "audio" : "library"} file record found for "${orphan.filename}". The file may need to be re-downloaded.`,
        [{ text: "OK" }]
      );
      return;
    }

    // 4. Show confirmation alert with item title
    Alert.alert(
      "Repair Download Record",
      `This file belongs to "${title}" \u2014 repair download record?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Repair",
          onPress: async () => {
            try {
              if (isAudio) {
                await markAudioFileAsDownloaded(fileId!, orphan.uri);
              } else {
                await markLibraryFileAsDownloaded(fileId!, orphan.uri);
              }
              onRemove(orphan.uri);
              log.info(
                `[associateOrphanFile] Repaired ${orphan.filename} -> ${orphan.libraryItemId}`
              );
            } catch (repairError) {
              log.error("[associateOrphanFile] Repair failed", repairError as Error);
              Alert.alert(
                "Repair Failed",
                "Could not repair the download record. Please try again."
              );
            }
          },
        },
      ]
    );
  } catch (error) {
    log.error("[associateOrphanFile] Failed", error as Error);
  }
}
