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
    expect(() => validateManifest({ version: 3, records })).toThrow();
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

it("round trips v2 labels, daily minutes and progress references", () => {
  const label = "00000000-0000-4000-8000-000000000003";
  const progress = "00000000-0000-4000-8000-000000000004";
  const activity = "00000000-0000-4000-8000-000000000005";
  const snapshot: Snapshot = structuredClone(records);
  if (snapshot[1].kind === "entry") snapshot[1].data.labelIds = [label];
  snapshot.push({
    id: label,
    kind: "label",
    data: { notebookId: n, name: "Theory", color: "#f59a56" },
    revision: 1,
    updated_at: "",
    deleted_at: null,
  });
  snapshot.push({
    id: progress,
    kind: "writing_progress",
    data: {
      entryId: e,
      notebookId: n,
      date: "2026-09-26",
      baseline: ["hello"],
      maxAdded: 4,
    },
    revision: 1,
    updated_at: "",
    deleted_at: null,
  });
  snapshot.push({
    id: activity,
    kind: "activity",
    data: {
      notebookId: n,
      date: "2026-09-26",
      completed: true,
      minutes: 75,
      provenance: "writing",
      completedAt: "2026-09-26T20:00:00Z",
    },
    revision: 1,
    updated_at: "",
    deleted_at: null,
  });
  expect(validateManifest({ version: 2, records: snapshot })).toEqual(snapshot);
  const map = new Map(snapshot.map((r) => [r.id, crypto.randomUUID()]));
  const remapped = remapReferences(snapshot, map);
  expect(remapped.find((r) => r.kind === "entry")?.data.labelIds).toEqual([
    map.get(label),
  ]);
  expect(
    remapped.find((r) => r.kind === "writing_progress")?.data.entryId,
  ).toBe(map.get(e));
  expect(remapped.find((r) => r.kind === "activity")?.data.minutes).toBe(75);
  const broken = structuredClone(snapshot);
  if (broken[1].kind === "entry") broken[1].data.labelIds = [n];
  expect(() => validateManifest({ version: 2, records: broken })).toThrow(
    "label",
  );
});
