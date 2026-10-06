import { bodyWords, addedWords, normalizeLabel } from "./progress";
import { totalWorkedSeconds, validSeconds } from "./workTime";
import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import {
  uid,
  seedNotebooks,
  today,
  responseSchema,
  validateUpload,
} from "./domain";
import type {
  Snapshot,
  AnyRecord,
  Kind,
  DataMap,
  RecordItem,
  AIRequest,
  AIResponse,
  Usage,
  Asset,
} from "./domain";

const url = import.meta.env.VITE_SUPABASE_URL,
  key =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
export const ownerEmail = (import.meta.env.VITE_OWNER_EMAIL || "").trim();
export const demo =
  import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === "true";
export const supabase = configured ? createClient(url, key) : null;
export class ConflictError extends Error {
  constructor(public remote: AnyRecord) {
    super("This note changed in another window. Both versions are preserved.");
    this.name = "ConflictError";
  }
}
const check = <T>(r: { data: T; error: { message: string } | null }) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const previewKey = "commonplace:preview:v1";
const blobMap = new Map<string, Blob>();
function sample(): Snapshot {
  const now = new Date().toISOString();
  const ns = seedNotebooks.map(
    (data, i) =>
      ({
        id: `00000000-0000-4000-8000-00000000000${i}`,
        kind: "notebook",
        data,
        revision: 1,
        updated_at: now,
        deleted_at: null,
      }) as AnyRecord,
  );
  return [
    ...ns,
    {
      id: uid(),
      kind: "entry",
      revision: 1,
      updated_at: now,
      deleted_at: null,
      data: {
        notebookId: ns[0].id,
        date: today(),
        title: "Notebook setup",
        markdown:
          "# Notebook setup\n\nThis is a local preview. Hosted notes are stored separately.",
      },
    },
  ];
}
function preview(): Snapshot {
  const v = localStorage.getItem(previewKey);
  return v ? JSON.parse(v) : sample();
}
export const recoveryPrefix = "commonplace:recovery:";
export function hasRecovery(id: string) {
  const base = recoveryPrefix + id;
  return Object.keys(localStorage).some(
    (k) => k === base || k.startsWith(base + ":"),
  );
}
export function clearRecovery() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(recoveryPrefix))
    .forEach((k) => localStorage.removeItem(k));
}
export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const r = await supabase.auth.getSession();
  if (r.error) throw r.error;
  return r.data.session;
}
export async function signIn(password: string) {
  if (!supabase) throw new Error("Backend is not configured.");
  if (!ownerEmail) throw new Error("The workspace owner is not configured.");
  const r = await supabase.auth.signInWithPassword({
    email: ownerEmail,
    password,
  });
  if (r.error) throw r.error;
}
export async function signOut() {
  if (supabase) {
    const r = await supabase.auth.signOut();
    if (r.error) throw r.error;
  }
  clearRecovery();
}
export async function list(): Promise<Snapshot> {
  if (demo) {
    const s = preview().map((r) =>
      r.kind === "notebook"
        ? {
            ...r,
            data: {
              ...r.data,
              research: r.data.research ?? r.data.icon === "science",
            },
          }
        : r,
    );
    localStorage.setItem(previewKey, JSON.stringify(s));
    return s;
  }
  if (!supabase) throw new Error("Backend is not configured.");
  const result: Snapshot = [];
  for (let from = 0; ; from += 1000) {
    const page = check(
      await supabase
        .from("records")
        .select("id,kind,data,revision,updated_at,deleted_at")
        .order("id")
        .range(from, from + 999),
    ) as Snapshot;
    result.push(...page);
    if (page.length < 1000) break;
  }
  return result;
}
export async function save<K extends Kind>(
  kind: K,
  id: string,
  data: DataMap[K],
  revision = 0,
  deletedAt: string | null = null,
  writingDate?: string,
): Promise<RecordItem<K>> {
  if (demo) {
    const all = preview(),
      i = all.findIndex((r) => r.id === id),
      old = all[i];
    if (!old && kind === "entry" && !deletedAt) {
      const entry = data as DataMap["entry"];
      const prior = all.find(
        (r) =>
          r.kind === "entry" &&
          !r.deleted_at &&
          !r.data.mergedInto &&
          (entry.paperId
            ? r.data.paperId === entry.paperId
            : !r.data.paperId &&
              r.data.notebookId === entry.notebookId &&
              r.data.date === entry.date),
      );
      if (prior) throw new ConflictError(prior);
    }
    if (old && old.revision !== revision) throw new ConflictError(old);
    if (kind === "label") {
      const label = data as DataMap["label"];
      if (
        !normalizeLabel(label.name) ||
        all.some(
          (r) =>
            r.kind === "label" &&
            r.id !== id &&
            !r.deleted_at &&
            r.data.notebookId === label.notebookId &&
            normalizeLabel(r.data.name) === normalizeLabel(label.name),
        )
      )
        throw new Error("Label names must be unique within a notebook.");
    }
    if (kind === "entry") {
      const entry = data as DataMap["entry"];
      if (
        entry.labelIds?.some(
          (labelId) =>
            !all.some(
              (r) =>
                r.id === labelId &&
                r.kind === "label" &&
                r.data.notebookId === entry.notebookId,
            ),
        )
      )
        throw new Error("Label belongs to another notebook.");
    }
    if (kind === "activity") {
      const activity = data as DataMap["activity"];
      if (
        !Number.isInteger(activity.minutes ?? 0) ||
        (activity.minutes ?? 0) < 0 ||
        (activity.minutes ?? 0) > 1440
      )
        throw new Error("Minutes must be an integer from 0 to 1440.");
      data = {
        ...activity,
        completed: old?.kind === "activity" ? old.data.completed : false,
      } as DataMap[K];
    }
    const next = {
      id,
      kind,
      data,
      revision: revision + 1,
      updated_at: new Date().toISOString(),
      deleted_at: deletedAt,
    } as RecordItem<K>;
    if (i < 0) all.push(next as AnyRecord);
    else all[i] = next as AnyRecord;
    if (kind === "entry" && !deletedAt && !old?.deleted_at) {
      const entry = data as DataMap["entry"];
      const before = old?.kind === "entry" ? old.data.markdown : "";
      if (before !== entry.markdown) {
        const date =
          writingDate ||
          today(all.find((r) => r.kind === "settings")?.data.timezone);
        let progress = all.find(
          (r): r is RecordItem<"writing_progress"> =>
            r.kind === "writing_progress" &&
            r.data.entryId === id &&
            r.data.date === date,
        );
        if (!progress) {
          progress = previewRecord("writing_progress", {
            entryId: id,
            notebookId: entry.notebookId,
            date,
            baseline: bodyWords(before),
            maxAdded: 0,
          });
          all.push(progress);
        }
        progress.data.maxAdded = Math.max(
          progress.data.maxAdded,
          addedWords(progress.data.baseline, entry.markdown),
        );
        const total = all.reduce(
          (sum, r) =>
            sum +
            (r.kind === "writing_progress" &&
            r.data.notebookId === entry.notebookId &&
            r.data.date === date
              ? r.data.maxAdded
              : 0),
          0,
        );
        if (total >= 5) {
          let activity = all.find(
            (r): r is RecordItem<"activity"> =>
              r.kind === "activity" &&
              r.data.notebookId === entry.notebookId &&
              r.data.date === date,
          );
          if (!activity) {
            activity = previewRecord("activity", {
              notebookId: entry.notebookId,
              date,
              minutes: 0,
              completed: false,
            });
            all.push(activity);
          }
          if (!activity.data.completed) {
            activity.data = {
              ...activity.data,
              completed: true,
              provenance: "writing",
              completedAt: new Date().toISOString(),
            };
            activity.revision++;
          }
        }
        if (entry.paperId)
          addPreviewStudy(
            all,
            entry.notebookId,
            entry.paperId,
            date,
            "writing",
          );
      }
    }
    localStorage.setItem(previewKey, JSON.stringify(all));
    return next;
  }
  if (!supabase) throw new Error("Backend is not configured.");
  const result = check(
    await supabase.rpc(
      kind === "entry" && !deletedAt && writingDate
        ? "save_entry"
        : "save_record",
      kind === "entry" && !deletedAt && writingDate
        ? {
            p_id: id,
            p_data: data,
            p_revision: revision,
            p_writing_date: writingDate,
          }
        : {
            p_id: id,
            p_kind: kind,
            p_data: data,
            p_revision: revision,
            p_deleted_at: deletedAt,
          },
    ),
  );
  if (result.conflict) throw new ConflictError(result.record);
  return result.record as RecordItem<K>;
}
export async function initializeNotebooks() {
  if (demo) return;
  if (!supabase) throw new Error("Backend is not configured.");
  check(
    await supabase.rpc("initialize_notebooks", { p_notebooks: seedNotebooks }),
  );
}
export async function listWorkTime(): Promise<RecordItem<"work_time">[]> {
  if (demo)
    return preview().filter(
      (r): r is RecordItem<"work_time"> => r.kind === "work_time",
    );
  if (!supabase) throw new Error("Backend is not configured.");
  const records: RecordItem<"work_time">[] = [];
  for (let from = 0; ; from += 1000) {
    const page = check(
      await supabase
        .from("records")
        .select("id,kind,data,revision,updated_at,deleted_at")
        .eq("kind", "work_time")
        .order("id")
        .range(from, from + 999),
    ) as RecordItem<"work_time">[];
    records.push(...page);
    if (page.length < 1000) return records;
  }
}
export async function saveWorkTime(
  date: string,
  field: "actualSeconds" | "taskInput",
  value: number | string,
  expected: number | string | null,
): Promise<{ conflict: boolean; record: RecordItem<"work_time"> }> {
  if (!demo) {
    if (!supabase) throw new Error("Backend is not configured.");
    return check(
      await supabase.rpc("save_work_time", {
        p_date: date,
        p_field: field,
        p_value: value,
        p_expected: expected,
      }),
    );
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    (field === "actualSeconds"
      ? !validSeconds(value)
      : typeof value !== "string" || value.length > 10000)
  )
    throw new Error("Invalid work time.");
  const all = preview();
  const prior = all.find(
    (r): r is RecordItem<"work_time"> =>
      r.kind === "work_time" && r.data.date === date,
  );
  const current = prior?.data[field] ?? null;
  if (prior && current === value) return { conflict: false, record: prior };
  if (prior && current !== expected) return { conflict: true, record: prior };
  if (!prior && expected !== null)
    throw new Error("Work day no longer exists.");
  const record: RecordItem<"work_time"> = {
    id: prior?.id || uid(),
    kind: "work_time",
    revision: (prior?.revision || 0) + 1,
    deleted_at: null,
    updated_at: new Date().toISOString(),
    data: { ...prior?.data, date, [field]: value },
  };
  const next = all.filter((r) => r.id !== record.id).concat(record);
  totalWorkedSeconds(
    Object.fromEntries(
      next
        .filter((r): r is RecordItem<"work_time"> => r.kind === "work_time")
        .map((r) => [r.data.date, r.data.actualSeconds || 0]),
    ),
  );
  localStorage.setItem(previewKey, JSON.stringify(next));
  return { conflict: false, record };
}
export async function upload(file: File): Promise<RecordItem<"asset">> {
  validateUpload(file, file.type === "application/pdf");
  if (file.type.startsWith("image/")) {
    try {
      const bitmap = await createImageBitmap(file);
      bitmap.close();
    } catch {
      throw new Error(
        "This image could not be read. Choose a valid PNG, JPEG, or WebP file.",
      );
    }
  } else if (!(await file.slice(0, 1024).text()).includes("%PDF-")) {
    throw new Error("This file does not contain a readable PDF header.");
  }
  const id = uid();
  const owner = (await getSession())?.user.id || "preview";
  const path = `${owner}/${id}`;
  if (demo) {
    blobMap.set(path, file);
    await putPreviewBlob(path, file);
  } else {
    if (!supabase) throw new Error("Backend is not configured.");
    check(
      await supabase.storage
        .from("journal")
        .upload(path, file, { contentType: file.type, upsert: false }),
    );
  }
  try {
    return await save("asset", id, {
      name: file.name,
      path,
      mime: file.type,
      size: file.size,
    });
  } catch (e) {
    if (supabase && !demo)
      await supabase.storage.from("journal").remove([path]);
    throw e;
  }
}
function previewDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("commonplace-preview-assets", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("blobs");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function putPreviewBlob(path: string, blob: Blob) {
  const db = await previewDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("blobs", "readwrite");
    tx.objectStore("blobs").put(blob, path);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function getPreviewBlob(path: string): Promise<Blob> {
  if (blobMap.has(path)) return blobMap.get(path)!;
  const db = await previewDB();
  const blob = await new Promise<Blob>((resolve, reject) => {
    const r = db.transaction("blobs").objectStore("blobs").get(path);
    r.onsuccess = () =>
      r.result
        ? resolve(r.result)
        : reject(new Error("Preview file is unavailable."));
    r.onerror = () => reject(r.error);
  });
  db.close();
  return blob;
}
export async function download(asset: Asset): Promise<Blob> {
  if (demo) return getPreviewBlob(asset.path);
  if (!supabase) throw new Error("Backend is not configured.");
  const b = check(await supabase.storage.from("journal").download(asset.path));
  if (!b) throw new Error("File unavailable");
  return b;
}
export async function explain(
  request: AIRequest,
  signal?: AbortSignal,
): Promise<AIResponse> {
  if (demo)
    throw new Error(
      "AI is not simulated in preview. Connect Supabase and a Gemini key to request a real explanation.",
    );
  if (!supabase) throw new Error("Backend is not configured.");
  const session = await getSession();
  if (!session) throw new Error("Sign in again to continue.");
  const r = await fetch(`${url}/functions/v1/explain`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: key,
    },
    body: JSON.stringify(request),
    signal,
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || "Explanation failed.");
  return responseSchema.parse(body.result);
}
export async function usage(): Promise<Usage> {
  if (demo)
    return {
      spent: 0,
      reserved: 0,
      limit: 20_000_000,
      month: new Date().toISOString().slice(0, 7),
    };
  if (!supabase) throw new Error("Backend is not configured.");
  return check(await supabase.rpc("get_usage"));
}
export async function restoreBatch(records: Snapshot) {
  if (demo) {
    const all = preview();
    for (const record of structuredClone(records)) {
      if (record.kind === "work_time") {
        const prior = all.find(
          (r): r is RecordItem<"work_time"> =>
            r.kind === "work_time" && r.data.date === record.data.date,
        );
        if (prior) {
          for (const field of ["actualSeconds", "taskInput"] as const)
            if (
              prior.data[field] !== undefined &&
              record.data[field] !== undefined &&
              prior.data[field] !== record.data[field]
            )
              throw new Error(
                `Archive contains different work time for ${record.data.date}. Existing hours were not changed.`,
              );
          prior.data = { ...prior.data, ...record.data };
          prior.revision++;
          continue;
        }
      }
      if (
        record.kind === "entry" &&
        !record.deleted_at &&
        !record.data.mergedInto
      ) {
        const incoming = record.data;
        const prior = all.find(
          (r): r is RecordItem<"entry"> =>
            r.kind === "entry" &&
            !r.deleted_at &&
            !r.data.mergedInto &&
            (incoming.paperId
              ? r.data.paperId === incoming.paperId
              : !r.data.paperId &&
                r.data.notebookId === incoming.notebookId &&
                r.data.date === incoming.date),
        );
        if (prior) {
          if (
            prior.data.markdown !== incoming.markdown &&
            incoming.markdown.trim()
          ) {
            const appended =
              "\n\n---\n\n## Restored notes\n\n" + incoming.markdown;
            for (const progress of all)
              if (
                progress.kind === "writing_progress" &&
                progress.data.entryId === prior.id
              )
                progress.data.baseline.push(...bodyWords(appended));
            prior.data.markdown += appended;
          }
          prior.revision++;
          record.data.mergedInto = prior.id;
        }
      }
      if (
        record.kind === "study" &&
        all.some(
          (r) =>
            r.kind === "study" &&
            r.data.paperId === record.data.paperId &&
            r.data.date === record.data.date,
        )
      )
        continue;
      all.push(record);
    }
    localStorage.setItem(previewKey, JSON.stringify(all));
    return;
  }
  if (!supabase) throw new Error("Backend is not configured.");
  check(await supabase.rpc("restore_records", { p_records: records }));
}
export async function rollbackUploads(assets: Record<string, string>) {
  if (demo) {
    localStorage.setItem(
      previewKey,
      JSON.stringify(preview().filter((r) => !assets[r.id])),
    );
    return;
  }
  if (!supabase) return;
  for (const [id, path] of Object.entries(assets)) {
    const r = await supabase.rpc("remove_orphan_asset", { p_id: id });
    if (!r.error) await supabase.storage.from("journal").remove([path]);
  }
}
export interface GenerationRecord {
  id: string;
  annotation_id: string;
  state: string;
  reserved: number;
  actual: number;
  result: AIResponse | null;
  error: string | null;
  created_at: string;
}
export async function generationHistory(
  annotationId?: string,
): Promise<GenerationRecord[]> {
  if (demo) return [];
  if (!supabase) throw new Error("Backend is not configured.");
  let q = supabase
    .from("ai_requests")
    .select("id,annotation_id,state,reserved,actual,result,error,created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (annotationId) q = q.eq("annotation_id", annotationId);
  return check(await q) as GenerationRecord[];
}

function previewRecord<K extends Kind>(
  kind: K,
  data: DataMap[K],
): RecordItem<K> {
  return {
    id: uid(),
    kind,
    data,
    revision: 1,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };
}
function addPreviewStudy(
  all: Snapshot,
  notebookId: string,
  paperId: string,
  date: string,
  source: DataMap["study"]["source"],
) {
  if (
    !all.some(
      (r) =>
        r.kind === "study" &&
        r.data.paperId === paperId &&
        r.data.date === date,
    )
  )
    all.push(previewRecord("study", { notebookId, paperId, date, source }));
}
export async function recordStudy(
  notebookId: string,
  paperId: string,
  date: string,
) {
  if (demo) {
    const all = preview();
    addPreviewStudy(all, notebookId, paperId, date, "visit");
    localStorage.setItem(previewKey, JSON.stringify(all));
    return;
  }
  if (!supabase) throw new Error("Backend is not configured.");
  check(
    await supabase.rpc("record_study", {
      p_notebook: notebookId,
      p_paper: paperId,
      p_date: date,
    }),
  );
}
export async function saveTime(
  notebookId: string,
  date: string,
  minutes: number,
  old?: RecordItem<"activity">,
  paperId?: string,
) {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440)
    throw new Error("Enter between 0 and 24 hours.");
  if (demo) {
    const all = preview();
    const prior = all.find(
      (r) =>
        r.kind === "activity" &&
        r.data.notebookId === notebookId &&
        r.data.date === date,
    );
    if (prior && prior.id !== old?.id) throw new ConflictError(prior);
    const next = await save(
      "activity",
      old?.id || uid(),
      {
        ...old?.data,
        notebookId,
        date,
        minutes,
        completed: old?.data.completed || false,
      },
      old?.revision || 0,
    );
    if (paperId) await recordStudy(notebookId, paperId, date);
    return next;
  }
  if (!supabase) throw new Error("Backend is not configured.");
  const result = check(
    await supabase.rpc("save_time", {
      p_id: old?.id || uid(),
      p_notebook: notebookId,
      p_date: date,
      p_minutes: minutes,
      p_revision: old?.revision || 0,
      p_paper: paperId || null,
    }),
  );
  if (result.conflict) throw new ConflictError(result.record);
  return result.record as RecordItem<"activity">;
}
