/**
 * Tests for associateOrphanFile (src/lib/orphanAssociation.ts)
 *
 * DEBT-02: associate orphan file — links an orphaned downloaded file back to
 * its known library item record by looking up the item in mediaMetadata and
 * calling the appropriate mark-as-downloaded helper
 */

import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

// --- Mocks ---

jest.mock("@/db/helpers/localData", () => ({
  markAudioFileAsDownloaded: jest.fn(),
  markLibraryFileAsDownloaded: jest.fn(),
  getAllDownloadedAudioFiles: jest.fn(),
  getAllDownloadedLibraryFiles: jest.fn(),
  getAllLocalCovers: jest.fn(),
  clearAllLocalCovers: jest.fn(),
}));

jest.mock("@/i18n", () => ({
  translate: (key: string) => key,
}));

jest.mock("react-native", () => ({
  Alert: { alert: jest.fn() },
}));

// --- Imports ---

import { associateOrphanFile } from "@/lib/orphanAssociation";
import { markAudioFileAsDownloaded, markLibraryFileAsDownloaded } from "@/db/helpers/localData";
import { Alert } from "react-native";
import type { OrphanFile } from "@/lib/orphanScanner";

const mockMarkAudio = markAudioFileAsDownloaded as jest.MockedFunction<
  typeof markAudioFileAsDownloaded
>;
const mockMarkLibrary = markLibraryFileAsDownloaded as jest.MockedFunction<
  typeof markLibraryFileAsDownloaded
>;
const mockAlertAlert = Alert.alert as jest.MockedFunction<typeof Alert.alert>;

// --- Test helpers ---

/** Build a mock drizzle query chain whose .limit() resolves to given values in order */
function buildMockDb(...limitResults: unknown[][]) {
  const mockChain: any = {
    from: jest.fn(),
    innerJoin: jest.fn(),
    where: jest.fn(),
    limit: jest.fn(),
  };
  mockChain.from.mockReturnValue(mockChain);
  mockChain.innerJoin.mockReturnValue(mockChain);
  mockChain.where.mockReturnValue(mockChain);

  let limitMock = mockChain.limit;
  for (const result of limitResults) {
    limitMock = limitMock.mockResolvedValueOnce(result);
  }

  return {
    select: jest.fn().mockReturnValue(mockChain),
  };
}

function makeOrphan(overrides: Partial<OrphanFile> = {}): OrphanFile {
  return {
    uri: "file:///downloads/item-123/chapter1.mp3",
    filename: "chapter1.mp3",
    libraryItemId: "item-123",
    size: 12345,
    ...overrides,
  };
}

// --- Setup ---

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.clearAllMocks();
});

// --- Tests ---

describe("Orphan Association", () => {
  describe("DEBT-02: associate orphan file", () => {
    it("looks up item title by libraryItemId from mediaMetadata", async () => {
      const mockDb = buildMockDb(
        [{ title: "My Audiobook" }], // mediaMetadata query
        [{ id: "audio-file-id" }] // audioFiles query
      );
      (global as any).setMockDb(mockDb);

      await associateOrphanFile(makeOrphan(), jest.fn());

      // db.select was called (at least once for metadata)
      expect(mockDb.select).toHaveBeenCalled();
      // The title appears in the confirmation alert message
      expect(mockAlertAlert).toHaveBeenCalledWith(
        "Repair Download Record",
        expect.stringContaining("My Audiobook"),
        expect.any(Array)
      );
    });

    it("identifies audio files by extension and calls markAudioFileAsDownloaded", async () => {
      const orphan = makeOrphan({
        filename: "chapter1.mp3",
        uri: "file:///downloads/item-1/chapter1.mp3",
      });
      const mockDb = buildMockDb([{ title: "Test Book" }], [{ id: "audio-file-id" }]);
      (global as any).setMockDb(mockDb);
      mockMarkAudio.mockResolvedValue(undefined);

      await associateOrphanFile(orphan, jest.fn());

      // Simulate user pressing "Repair"
      const buttons = mockAlertAlert.mock.calls[0][2] as any[];
      const repairButton = buttons.find((b) => b.text === "Repair");
      await repairButton?.onPress?.();

      expect(mockMarkAudio).toHaveBeenCalledWith("audio-file-id", orphan.uri);
      expect(mockMarkLibrary).not.toHaveBeenCalled();
    });

    it("identifies non-audio files and calls markLibraryFileAsDownloaded", async () => {
      const orphan = makeOrphan({
        filename: "cover.jpg",
        uri: "file:///downloads/item-1/cover.jpg",
      });
      const mockDb = buildMockDb([{ title: "Test Book" }], [{ id: "library-file-id" }]);
      (global as any).setMockDb(mockDb);
      mockMarkLibrary.mockResolvedValue(undefined);

      await associateOrphanFile(orphan, jest.fn());

      const buttons = mockAlertAlert.mock.calls[0][2] as any[];
      const repairButton = buttons.find((b) => b.text === "Repair");
      await repairButton?.onPress?.();

      expect(mockMarkLibrary).toHaveBeenCalledWith("library-file-id", orphan.uri);
      expect(mockMarkAudio).not.toHaveBeenCalled();
    });

    it("removes orphan from list after successful repair", async () => {
      const orphan = makeOrphan();
      const mockDb = buildMockDb([{ title: "Test Book" }], [{ id: "audio-file-id" }]);
      (global as any).setMockDb(mockDb);
      mockMarkAudio.mockResolvedValue(undefined);

      const onRemove = jest.fn();
      await associateOrphanFile(orphan, onRemove);

      const buttons = mockAlertAlert.mock.calls[0][2] as any[];
      const repairButton = buttons.find((b) => b.text === "Repair");
      await repairButton?.onPress?.();

      expect(onRemove).toHaveBeenCalledWith(orphan.uri);
    });

    it("shows Cannot Repair alert when no matching file record found", async () => {
      const orphan = makeOrphan({ filename: "chapter1.mp3" });
      const mockDb = buildMockDb(
        [{ title: "Test Book" }], // metadata found
        [] // no matching audio file
      );
      (global as any).setMockDb(mockDb);

      await associateOrphanFile(orphan, jest.fn());

      expect(mockAlertAlert).toHaveBeenCalledWith(
        "Cannot Repair",
        expect.stringContaining("chapter1.mp3"),
        expect.any(Array)
      );
    });
  });
});
