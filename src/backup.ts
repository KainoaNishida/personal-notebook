import JSZip from "jszip";
import { z } from "zod";
import { kinds, uid, ofKind, responseSchema, visualSchema } from "./domain";
import type { Snapshot, AnyRecord, Asset } from "./domain";
import * as api from "./service";
const id = z.string().uuid(),
  date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const schemas: Record<string, z.ZodType> = {
  notebook: z.object({
    name: z.string().min(1).max(80),
    description: z.string(),
    color: z.string().regex(/^#[\da-fA-F]{6}$/),
    icon: z.string(),
    order: z.number(),
    archived: z.boolean(),
  }),
  entry: z.object({
    title: z.string(),
    markdown: z.string().max(1000000),
    date,
    notebookId: id,
    paperId: id.optional(),
    mergedInto: id.optional(),
  }),
  day: z.object({
    date,
    markdown: z.string().max(1000000),
    migratedTo: id.optional(),
  }),
  activity: z.object({ date, notebookId: id, completed: z.boolean() }),
  paper: z.object({
    title: z.string(),
    assetId: id,
    fingerprint: z.string(),
    pages: z.number().int().positive(),
  }),
  asset: z.object({
    name: z.string(),
    path: z.string(),
    mime: z.enum(["image/png", "image/jpeg", "image/webp", "application/pdf"]),
    size: z.number().int().nonnegative(),
  }),
  annotation: z.object({
    paperId: id,
    page: z.number().int().nonnegative(),
    text: z.string(),
    rects: z.array(
      z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        width: z.number().min(0).max(1),
        height: z.number().min(0).max(1),
      }),
    ),
    kind: z.enum(["text", "region"]),
    imageAssetId: id.optional(),
  }),
  settings: z.object({
    timezone: z.string(),
    theme: z.enum(["dark", "light"]),
    lifeNotebookId: id.optional(),
    mainColor: z
      .string()
      .regex(/^#[\da-fA-F]{6}$/)
      .optional(),
    accentColor: z
      .string()
      .regex(/^#[\da-fA-F]{6}$/)
      .optional(),
  }),
  conversation: z.object({
    annotationId: id,
    turns: z.array(
      z.object({ question: z.string(), response: responseSchema }),
    ),
  }),
  artifact: z.object({ annotationId: id, visual: visualSchema }),
};
const envelope = z.object({
  id,
  kind: z.enum(kinds),
  data: z.unknown(),
  revision: z.number().int().positive(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});
export function validateManifest(input: unknown): Snapshot {
  const parsed = z
    .object({ version: z.literal(1), records: z.array(envelope).max(20000) })
    .parse(input);
  const ids = new Set<string>();
  for (const r of parsed.records) {
    if (ids.has(r.id)) throw new Error("Duplicate record ID in archive.");
    ids.add(r.id);
    schemas[r.kind].parse(r.data);
  }
  const result = parsed.records as Snapshot;
  const byId = new Map(result.map((r) => [r.id, r]));
  for (const r of result) {
    const data = r.data as unknown as Record<string, unknown>;
    for (const [key, kind] of Object.entries({
      notebookId: "notebook",
      paperId: "paper",
      assetId: "asset",
      imageAssetId: "asset",
      annotationId: "annotation",
    })) {
      if (data[key] && byId.get(String(data[key]))?.kind !== kind)
        throw new Error(`Archive has an unresolved ${key}.`);
    }
    if ("markdown" in data) {
      for (const m of String(data.markdown).matchAll(
        /(?:asset|annotation):([\w-]+)/g,
      )) {
        if (!ids.has(m[1]))
          throw new Error("Archive contains an unresolved embedded reference.");
      }
    }
  }
  return result;
}
export function remapReferences(
  records: Snapshot,
  mapping: Map<string, string>,
): Snapshot {
  return records.map((r) => {
    const data = structuredClone(r.data) as unknown as Record<string, unknown>;
    for (const key of [
      "notebookId",
      "paperId",
      "assetId",
      "imageAssetId",
      "annotationId",
      "mergedInto",
      "migratedTo",
      "lifeNotebookId",
    ])
      if (typeof data[key] === "string")
        data[key] = mapping.get(data[key] as string) || data[key];
    if (typeof data.markdown === "string")
      data.markdown = data.markdown.replace(
        /(asset|annotation):([\w-]+)/g,
        (_m, type, old) => `${type}:${mapping.get(old) || old}`,
      );
    return { ...r, id: mapping.get(r.id)!, data, revision: 1 } as AnyRecord;
  });
}
export async function exportArchive(records: Snapshot) {
  const zip = new JSZip();
  const exportRecords = structuredClone(records);
  for (const asset of ofKind(records, "asset")) {
    const b = await api.download(asset.data);
    zip.file(`assets/${asset.id}`, await b.arrayBuffer());
    const copy = exportRecords.find((r) => r.id === asset.id)!;
    (copy.data as Asset).path = `assets/${asset.id}`;
  }
  for (const entry of ofKind(records, "entry")) {
    zip.file(
      `entries/${entry.id}.md`,
      entry.data.markdown
        .replace(/asset:([\w-]+)/g, "../assets/$1")
        .replace(/annotation:([\w-]+)/g, "../annotations/$1.md"),
    );
  }
  for (const a of ofKind(records, "annotation")) {
    const p = ofKind(records, "paper").find((p) => p.id === a.data.paperId);
    zip.file(
      `annotations/${a.id}.md`,
      `# Source reference\n\n[${p?.data.title || "Paper"}, page ${a.data.page + 1}](../assets/${p?.data.assetId}#page=${a.data.page + 1})\n\n${a.data.text}\n\nExact highlight geometry is preserved in manifest.json.\n`,
    );
  }
  for (const day of ofKind(records, "day")) {
    zip.file(
      `days/${day.data.date}.md`,
      day.data.markdown
        .replace(/asset:([\w-]+)/g, "../assets/$1")
        .replace(/annotation:([\w-]+)/g, "../annotations/$1.md"),
    );
  }
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        version: 1,
        exportedAt: new Date().toISOString(),
        records: exportRecords,
      },
      null,
      2,
    ),
  );
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kais-journal-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// Stop decompression as soon as a file exceeds its limit, before allocating
// the complete output of a maliciously compressed archive.
function boundedBytes(
  file: JSZip.JSZipObject,
  limit: number,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const stream = (
        file as JSZip.JSZipObject & {
          internalStream(
            type: "uint8array",
          ): JSZip.JSZipStreamHelper<Uint8Array>;
        }
      ).internalStream("uint8array"),
      chunks: Uint8Array[] = [];
    let size = 0,
      failed = false;
    stream
      .on("data", (chunk) => {
        size += chunk.length;
        if (size > limit) {
          failed = true;
          stream.pause();
          reject(new Error("Expanded archive file exceeds its size limit."));
        } else chunks.push(chunk);
      })
      .on("error", reject)
      .on("end", () => {
        if (failed) return;
        const output = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          output.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(output);
      })
      .resume();
  });
}
export async function restoreArchive(file: File) {
  if (file.size > 100 * 1024 * 1024)
    throw new Error("Restore archives must be smaller than 100 MB.");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const manifest = zip.file("manifest.json");
  if (!manifest) throw new Error("No manifest.json found.");
  const text = new TextDecoder().decode(
    await boundedBytes(manifest, 20_000_000),
  );
  if (text.length > 20_000_000) throw new Error("Manifest is too large.");
  const records = validateManifest(JSON.parse(text));
  const assets = ofKind(records, "asset");
  if (assets.reduce((sum, a) => sum + a.data.size, 0) > 100 * 1024 * 1024)
    throw new Error("Expanded archive exceeds 100 MB.");
  const binaries = new Map<string, Uint8Array>();
  for (const asset of assets) {
    const f = zip.file(`assets/${asset.id}`);
    if (!f) throw new Error(`Missing file: ${asset.data.name}`);
    const b = await boundedBytes(f, asset.data.size);
    if (b.length !== asset.data.size)
      throw new Error(`File size mismatch: ${asset.data.name}`);
    binaries.set(asset.id, b);
  }
  const existing = await api.list();
  for (const paper of ofKind(records, "paper")) {
    const bytes = binaries.get(paper.data.assetId);
    if (!bytes) throw new Error("Paper file is missing from the archive.");
    const digest = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", bytes.slice().buffer),
      ),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (digest !== paper.data.fingerprint)
      throw new Error(
        "The archived PDF does not match its immutable document identity.",
      );
  }
  const mapping = new Map<string, string>(records.map((r) => [r.id, uid()]));
  const reusedPapers = new Set<string>();
  for (const paper of ofKind(records, "paper")) {
    const old = ofKind(existing, "paper").find(
      (p) => p.data.fingerprint === paper.data.fingerprint,
    );
    if (old) {
      mapping.set(paper.id, old.id);
      reusedPapers.add(paper.id);
    }
  }
  const uploaded: Record<string, string> = {};
  try {
    for (const asset of assets) {
      const restored = await api.upload(
        new File([binaries.get(asset.id)!.slice().buffer], asset.data.name, {
          type: asset.data.mime,
        }),
      );
      mapping.set(asset.id, restored.id);
      uploaded[restored.id] = restored.data.path;
    }
    let copies = remapReferences(
      records.filter((r) => !reusedPapers.has(r.id)),
      mapping,
    ).filter((r) => r.kind !== "asset" && r.kind !== "settings");
    const existingDays = new Set(
      ofKind(existing, "day").map((d) => d.data.date),
    );
    const collidingDays = copies.filter(
      (r) => r.kind === "day" && !r.deleted_at && existingDays.has(r.data.date),
    );
    if (collidingDays.length) {
      const notebookId = uid();
      copies.unshift({
        id: notebookId,
        kind: "notebook",
        data: {
          name: "Restored reflections",
          description: "Daily reflections preserved from your archive.",
          icon: "reading",
          color: "#b7cba3",
          order: 100,
          archived: false,
        },
        revision: 1,
        updated_at: new Date().toISOString(),
        deleted_at: null,
      });
      copies = copies.map((r) =>
        r.kind === "day" && collidingDays.some((d) => d.id === r.id)
          ? {
              ...r,
              kind: "entry",
              data: {
                title: "Restored daily reflection",
                markdown: r.data.markdown,
                date: r.data.date,
                notebookId,
              },
            }
          : r,
      );
    }
    await api.restoreBatch(copies);
    return copies.length + assets.length;
  } catch (e) {
    await api.rollbackUploads(uploaded);
    throw e;
  }
}
