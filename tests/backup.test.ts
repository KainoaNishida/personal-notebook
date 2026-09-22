import { describe, it, expect } from "vitest";
import { validateManifest, remapReferences } from "../src/backup";
import type { Snapshot } from "../src/domain";
const n = "00000000-0000-4000-8000-000000000001",
  e = "00000000-0000-4000-8000-000000000002";
const records: Snapshot = [
  {
    id: n,
    kind: "notebook",
    data: {
      name: "Science",
      description: "",
      icon: "science",
      color: "#b7cba3",
      order: 0,
      archived: false,
    },
    revision: 1,
    updated_at: "2026-09-22",
    deleted_at: null,
  },
  {
    id: e,
    kind: "entry",
    data: {
      notebookId: n,
      date: "2026-09-22",
      title: "A thought",
      markdown: "Hello",
    },
    revision: 2,
    updated_at: "2026-09-22",
    deleted_at: null,
  },
];
describe("portable backup validation", () => {
  it("validates known versions and required entity references", () => {
    expect(validateManifest({ version: 1, records })).toHaveLength(2);
    expect(() => validateManifest({ version: 2, records })).toThrow();
    expect(() =>
      validateManifest({ version: 1, records: [records[1]] }),
    ).toThrow();
  });
  it("rejects duplicate identifiers before importing", () => {
    expect(() =>
      validateManifest({ version: 1, records: [...records, records[0]] }),
    ).toThrow("Duplicate");
  });
  it("remaps IDs and relationships without overwriting original data", () => {
    const result = remapReferences(
      records,
      new Map([
        [n, "new-notebook"],
        [e, "new-entry"],
      ]),
    );
    expect(result[1].id).toBe("new-entry");
    expect((result[1].data as { notebookId: string }).notebookId).toBe(
      "new-notebook",
    );
    expect(records[1].id).toBe(e);
  });
});
