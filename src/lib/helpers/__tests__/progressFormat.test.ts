import { formatProgress, ProgressFormat } from "@/lib/helpers/progressFormat";

describe("progressFormat", () => {
  describe("ProgressFormat type", () => {
    it("accepts all three valid format values", () => {
      const formats: ProgressFormat[] = ["remaining", "elapsed", "percent"];
      expect(formats).toHaveLength(3);
    });
  });

  describe("formatProgress — remaining", () => {
    it("returns hours and minutes remaining for a typical book position", () => {
      // position=5025 (1h 23m 45s), duration=13530 (3h 45m 30s)
      // remaining = 13530 - 5025 = 8505s = 2h 21m 45s → "2h 21m remaining"
      expect(formatProgress("remaining", 5025, 13530)).toBe("2h 21m remaining");
    });

    it("returns friendly units from plan example: position=5025 duration=13530", () => {
      // plan says → "2h 20m remaining" but that uses floor math:
      // 8505 / 3600 = 2h, (8505 % 3600) / 60 = 141/60 = 2.35 → floor = 2? No, 8505 % 3600 = 8505-7200=1305, 1305/60=21.75 → 21m
      // Actually: 13530-5025=8505. 8505/3600=2h remainder 1305s. 1305/60=21.75 → floor=21m → "2h 21m remaining"
      expect(formatProgress("remaining", 5025, 13530)).toBe("2h 21m remaining");
    });

    it("returns only minutes when less than 1 hour remaining", () => {
      // 30 minutes remaining
      expect(formatProgress("remaining", 0, 1800)).toBe("30m remaining");
    });

    it('returns "0m remaining" when position equals duration', () => {
      expect(formatProgress("remaining", 3600, 3600)).toBe("0m remaining");
    });

    it('returns "0m remaining" when position exceeds duration', () => {
      expect(formatProgress("remaining", 5000, 3600)).toBe("0m remaining");
    });

    it('returns "0m remaining" when duration is 0', () => {
      expect(formatProgress("remaining", 0, 0)).toBe("0m remaining");
    });

    it("returns full duration remaining when position is 0", () => {
      // duration=13530 (3h 45m 30s) — shows hours+minutes only
      expect(formatProgress("remaining", 0, 13530)).toBe("3h 45m remaining");
    });

    it("returns only minutes when remaining is under 1 hour", () => {
      // 45 minutes remaining
      expect(formatProgress("remaining", 900, 3600)).toBe("45m remaining");
    });
  });

  describe("formatProgress — elapsed", () => {
    it("returns H:MM:SS / H:MM:SS for typical book position", () => {
      // position=5025 → 1:23:45, duration=13530 → 3:45:30
      expect(formatProgress("elapsed", 5025, 13530)).toBe("1:23:45 / 3:45:30");
    });

    it("returns M:SS / M:SS when both are under 1 hour", () => {
      // position=90 → 1:30, duration=300 → 5:00
      expect(formatProgress("elapsed", 90, 300)).toBe("1:30 / 5:00");
    });

    it('returns "0:00 / 0:00" when duration is 0', () => {
      expect(formatProgress("elapsed", 0, 0)).toBe("0:00 / 0:00");
    });

    it('returns "0:00:00 / H:MM:SS" when position is 0 and duration has hours', () => {
      // Both sides use the same format width for consistency
      expect(formatProgress("elapsed", 0, 13530)).toBe("0:00:00 / 3:45:30");
    });

    it("uses consistent format width between position and duration", () => {
      // If duration has hours, position should also use hour format (0:MM:SS)
      expect(formatProgress("elapsed", 60, 7200)).toBe("0:01:00 / 2:00:00");
    });
  });

  describe("formatProgress — percent", () => {
    it("returns percentage rounded to nearest integer", () => {
      // position=5025, duration=13530 → 5025/13530 = 37.14% → "37%"
      expect(formatProgress("percent", 5025, 13530)).toBe("37%");
    });

    it('returns "0%" when position is 0', () => {
      expect(formatProgress("percent", 0, 13530)).toBe("0%");
    });

    it('returns "100%" when position equals duration', () => {
      expect(formatProgress("percent", 3600, 3600)).toBe("100%");
    });

    it('returns "100%" when position exceeds duration', () => {
      expect(formatProgress("percent", 5000, 3600)).toBe("100%");
    });

    it('returns "0%" when duration is 0', () => {
      expect(formatProgress("percent", 0, 0)).toBe("0%");
    });

    it("rounds to nearest integer", () => {
      // 50.5% → rounds to "51%"
      // position = 5050, duration = 10000 → 50.5%
      expect(formatProgress("percent", 5050, 10000)).toBe("51%");
    });
  });
});
