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
        title: "A space for the things I’m learning",
        markdown:
          "# A little, every day.\n\nSome days, a paper. Other days, a few pages, a sketch, or time spent moving. This is a place to collect the small things.\n\n## What I’m curious about\n\n- How attention turns a sequence into context\n- Systems that stay simple as they grow\n- Learning to notice light and shadow\n\n> Progress doesn’t have to look the same every day.\n\nThis is sample content in a local design preview. Your private notebook will start empty.",
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
export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error("Backend is not configured.");
  const r = await supabase.auth.signInWithPassword({ email, password });
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
    const s = preview();
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
): Promise<RecordItem<K>> {
  if (demo) {
    const all = preview(),
      i = all.findIndex((r) => r.id === id),
      old = all[i];
    if (old && old.revision !== revision) throw new ConflictError(old);
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
    localStorage.setItem(previewKey, JSON.stringify(all));
    return next;
  }
  if (!supabase) throw new Error("Backend is not configured.");
  const result = check(
    await supabase.rpc("save_record", {
      p_id: id,
      p_kind: kind,
      p_data: data,
      p_revision: revision,
      p_deleted_at: deletedAt,
    }),
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
    localStorage.setItem(
      previewKey,
      JSON.stringify([...preview(), ...records]),
    );
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
