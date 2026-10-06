import { describe, expect, it } from "vitest";
import {
  readingPreview,
  sortReadingSessions,
  validateReadingEntry,
  validReadingDate,
} from "../src/reading";
import type { Entry, RecordItem } from "../src/domain";
const entry: Entry = {
  notebookId: "n",
  title: "The Book",
  date: "2026-10-05",
  markdown: "",
  reading: {
    minutes: 25,
    author: "An Author",
    createdAt: "2026-10-05T10:00:00.000Z",
  },
};
describe("reading session data", () => {
  it("validates real dates and whole minutes without confusing minutes with hours", () => {
    expect(() => validateReadingEntry(entry)).not.toThrow();
    for (const date of [
      "2026-02-29",
      "2026-04-31",
      "10/05/2026",
      "0000-01-01",
      "",
      "2026-13-01",
    ])
      expect(validReadingDate(date)).toBe(false);
    expect(validReadingDate("2024-02-29")).toBe(true);
    for (const minutes of [0, -1, 1.5, 1441, NaN])
      expect(() =>
        validateReadingEntry({
          ...entry,
          reading: { ...entry.reading!, minutes },
        }),
      ).toThrow();
    expect(() => validateReadingEntry({ ...entry, title: "   " })).toThrow();
    expect(() => validateReadingEntry({ ...entry, paperId: "p" })).toThrow();
  });
  it("orders days first, then sessions, independently of later note edits", () => {
    const record = (
      id: string,
      date: string,
      createdAt: string,
    ): RecordItem<"entry"> => ({
      id,
      kind: "entry",
      data: { ...entry, date, reading: { ...entry.reading!, createdAt } },
      revision: 1,
      updated_at: "2099-01-01",
      deleted_at: null,
    });
    const rows = [
      record("old", "2026-10-04", "2026-10-05T11:00:00Z"),
      record("early", "2026-10-05", "2026-10-05T09:00:00Z"),
      record("late", "2026-10-05", "2026-10-05T10:00:00Z"),
    ];
    expect(sortReadingSessions(rows).map((r) => r.id)).toEqual([
      "late",
      "early",
      "old",
    ]);
    expect(rows[0].id).toBe("old");
  });
  it("shows useful note text instead of link destinations and image filenames", () => {
    expect(
      readingPreview(
        "## A **thought**\n[Worth keeping](https://example.com) ![file.png](asset:123)",
      ),
    ).toBe("A thought Worth keeping");
  });
});
