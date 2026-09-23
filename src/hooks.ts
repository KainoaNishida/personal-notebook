import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./service";
import type { AnyRecord, DataMap, Kind, RecordItem, Snapshot } from "./domain";

// Postgres JSONB can reorder object keys. Compare values, not serialization order.
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const x = a as Record<string, unknown>,
    y = b as Record<string, unknown>;
  return (
    Object.keys(x).length === Object.keys(y).length &&
    Object.keys(x).every((k) => Object.hasOwn(y, k) && sameData(x[k], y[k]))
  );
}

function clearMatchingDraft(id: string, data: unknown) {
  for (const key of recoveryKeys(id)) {
    try {
      if (sameData(JSON.parse(localStorage.getItem(key)!).data, data))
        localStorage.removeItem(key);
    } catch {
      // Keep unreadable recovery data available until the owner replaces it.
    }
  }
}

function recoveryKeys(id: string) {
  const base = api.recoveryPrefix + id;
  return Object.keys(localStorage).filter(
    (key) => key === base || key.startsWith(base + ":"),
  );
}

function readRecovery<K extends "entry" | "day">(record: RecordItem<K>) {
  try {
    const preferred = sessionStorage.getItem(api.recoveryPrefix + record.id);
    const drafts = recoveryKeys(record.id)
      .map((key) => {
        try {
          const parsed = JSON.parse(localStorage.getItem(key)!);
          if (
            !parsed.data ||
            typeof parsed.data.markdown !== "string" ||
            !Number.isInteger(parsed.revision)
          )
            return null;
          return {
            key,
            data: parsed.data as DataMap[K],
            revision: parsed.revision as number,
            updatedAt: Number(parsed.updatedAt) || 0,
          };
        } catch {
          return null;
        }
      })
      .filter((draft) => draft !== null);
    drafts.sort(
      (a, b) =>
        Number(b.key === preferred) - Number(a.key === preferred) ||
        b.updatedAt - a.updatedAt,
    );
    return drafts[0] || null;
  } catch {
    return null;
  }
}

export function useRecords() {
  return useQuery({
    queryKey: ["records"],
    queryFn: api.list,
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });
}
export function useSave() {
  const q = useQueryClient();
  return useCallback(
    async <K extends Kind>(
      kind: K,
      id: string,
      data: DataMap[K],
      revision = 0,
      deletedAt: string | null = null,
    ) => {
      const next = await api.save(kind, id, data, revision, deletedAt);
      q.setQueryData<Snapshot>(["records"], (old) => [
        ...(old || []).filter((r) => r.id !== id),
        next as AnyRecord,
      ]);
      return next;
    },
    [q],
  );
}
export function useDraft<K extends "entry" | "day">(record: RecordItem<K>) {
  const save = useSave(),
    [recovery] = useState(() => ({
      key: api.recoveryPrefix + record.id + ":" + crypto.randomUUID(),
      draft: readRecovery(record),
    })),
    [value, setValue] = useState<DataMap[K]>(
      () => recovery.draft?.data || record.data,
    );
  const [status, setStatus] = useState("Saved"),
    [conflict, setConflict] = useState<AnyRecord | null>(null),
    [error, setError] = useState(""),
    [recoveryNotice, setRecoveryNotice] = useState("");
  const persist = useCallback(
    (data: DataMap[K], revision: number) => {
      localStorage.setItem(
        recovery.key,
        JSON.stringify({ data, revision, updatedAt: Date.now() }),
      );
      // Remember this window's slot across reloads; localStorage slots are unique
      // to editor instances so other windows never overwrite its unsaved text.
      try {
        sessionStorage.setItem(api.recoveryPrefix + record.id, recovery.key);
      } catch {
        /* Other drafts remain discoverable by timestamp. */
      }
    },
    [recovery.key, record.id],
  );
  const remainingRecovery = useCallback(() => {
    setRecoveryNotice(
      recoveryKeys(record.id).length
        ? "Other unsaved versions remain in this browser."
        : "",
    );
  }, [record.id]);
  const latest = useRef({
      value,
      record,
      dirty: false,
      saving: false,
      conflict: false,
    }),
    mounted = useRef(true),
    pending = useRef<Promise<void> | null>(null);
  const flush = useCallback(async (): Promise<void> => {
    if (pending.current) {
      await pending.current;
      return flush();
    }
    const s = latest.current;
    if (!s.dirty || s.conflict) return;
    s.saving = true;
    if (mounted.current) setStatus("Saving…");
    const data = s.value;
    pending.current = (async () => {
      try {
        const saved = await save(
          s.record.kind,
          s.record.id,
          data,
          s.record.revision,
        );
        s.record = saved;
        s.dirty = s.value !== data;
        if (!s.dirty) clearMatchingDraft(record.id, data);
        if (mounted.current) {
          setStatus(s.dirty ? "Unsaved" : "Saved");
          setError("");
          if (!s.dirty) remainingRecovery();
        }
      } catch (e) {
        // An interrupted response or duplicate submit can already be saved.
        if (e instanceof api.ConflictError && sameData(e.remote.data, data)) {
          s.record = e.remote as RecordItem<K>;
          s.dirty = s.value !== data;
          if (!s.dirty) clearMatchingDraft(record.id, data);
          if (mounted.current) {
            setStatus(s.dirty ? "Unsaved" : "Saved");
            setError("");
            remainingRecovery();
          }
          return;
        }
        let recoveryFailed = false;
        try {
          persist(s.value, s.record.revision);
        } catch {
          recoveryFailed = true;
        }
        if (e instanceof api.ConflictError) {
          s.conflict = true;
          if (mounted.current) setConflict(e.remote);
        }
        if (mounted.current) {
          setError(
            (e as Error).message +
              (recoveryFailed
                ? " Recovery storage is unavailable; keep this tab open and copy your text before closing it."
                : ""),
          );
          setStatus("Not saved");
        }
      } finally {
        s.saving = false;
      }
    })();
    await pending.current;
    pending.current = null;
    if (s.dirty && s.value !== data && !s.conflict) await flush();
  }, [save, record.id, persist, remainingRecovery]);
  useEffect(() => {
    mounted.current = true;
    const draft = recovery.draft;
    if (draft) {
      if (sameData(draft.data, record.data)) {
        clearMatchingDraft(record.id, draft.data);
        remainingRecovery();
      } else {
        latest.current.dirty = true;
        latest.current.conflict = true;
        setConflict(record as AnyRecord);
        setStatus("Review recovered draft");
        setError(
          "A recovered draft differs from the saved version. Review both before continuing.",
        );
      }
    }
    const t = setInterval(() => {
      void flush();
    }, 800);
    const before = (e: BeforeUnloadEvent) => {
      if (latest.current.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      mounted.current = false;
      clearInterval(t);
      window.removeEventListener("beforeunload", before);
      void flush();
    };
  }, [record.id, flush, recovery, remainingRecovery]);
  useEffect(() => {
    const s = latest.current;
    if (!s.dirty && !s.saving && record.revision > s.record.revision) {
      s.record = record;
      s.value = record.data;
      setValue(record.data);
    }
  }, [record]);
  const change = (data: DataMap[K]) => {
    latest.current.value = data;
    latest.current.dirty = true;
    setValue(data);
    setStatus("Unsaved");
    try {
      persist(data, latest.current.record.revision);
    } catch {
      setError(
        "Browser recovery storage is full or unavailable. Keep this page open until the server save succeeds.",
      );
    }
  };
  const acceptRemote = () => {
    if (!conflict) return;
    clearMatchingDraft(record.id, latest.current.value);
    const r = conflict as RecordItem<K>;
    latest.current = {
      value: r.data,
      record: r,
      dirty: false,
      saving: false,
      conflict: false,
    };
    setValue(r.data);
    setConflict(null);
    setError("");
    setStatus("Saved");
    remainingRecovery();
  };
  const keepMine = async () => {
    if (!conflict) return;
    latest.current.record = conflict as RecordItem<K>;
    latest.current.conflict = false;
    setConflict(null);
    await flush();
  };
  const reviewRecovery = () => {
    const next = readRecovery(latest.current.record);
    if (!next) {
      remainingRecovery();
      return;
    }
    latest.current.value = next.data;
    latest.current.dirty = true;
    latest.current.conflict = true;
    setValue(next.data);
    setConflict(latest.current.record as AnyRecord);
    setError(
      "A recovered draft differs from the saved version. Review both before continuing.",
    );
    setStatus("Review recovered draft");
  };
  return {
    value,
    change,
    status,
    error,
    recoveryNotice,
    conflict,
    acceptRemote,
    keepMine,
    reviewRecovery,
    flush,
  };
}
