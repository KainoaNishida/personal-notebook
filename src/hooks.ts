import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "./service";
import type { AnyRecord, DataMap, Kind, RecordItem, Snapshot } from "./domain";

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
    [value, setValue] = useState<DataMap[K]>(() => {
      const draft = localStorage.getItem(api.recoveryPrefix + record.id);
      try {
        return draft ? JSON.parse(draft).data : record.data;
      } catch {
        return record.data;
      }
    });
  const [status, setStatus] = useState("Saved"),
    [conflict, setConflict] = useState<AnyRecord | null>(null),
    [error, setError] = useState("");
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
        if (!s.dirty) localStorage.removeItem(api.recoveryPrefix + record.id);
        if (mounted.current) {
          setStatus(s.dirty ? "Unsaved" : "Saved");
          setError("");
        }
      } catch (e) {
        if (e instanceof api.ConflictError) {
          s.conflict = true;
          if (mounted.current) setConflict(e.remote);
        }
        if (mounted.current) {
          setError((e as Error).message);
          setStatus("Not saved");
        }
      } finally {
        s.saving = false;
      }
    })();
    await pending.current;
    pending.current = null;
    if (s.dirty && s.value !== data && !s.conflict) await flush();
  }, [save, record.id]);
  useEffect(() => {
    mounted.current = true;
    const draft = localStorage.getItem(api.recoveryPrefix + record.id);
    if (draft) {
      latest.current.dirty = true;
      let parsed;
      try {
        parsed = JSON.parse(draft);
      } catch {
        latest.current.dirty = false;
        setError(
          "The recovery draft is unreadable. The saved note is still available.",
        );
      }
      if (parsed && parsed.revision !== record.revision) {
        latest.current.conflict = true;
        setConflict(record as AnyRecord);
        setStatus("Review recovered draft");
        setError(
          "A recovered draft differs from the saved version. Review both before continuing.",
        );
      } else if (parsed) setStatus("Recovered draft");
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
  }, [record.id, flush]);
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
      localStorage.setItem(
        api.recoveryPrefix + record.id,
        JSON.stringify({ data, revision: latest.current.record.revision }),
      );
    } catch {
      setError(
        "Browser recovery storage is full or unavailable. Keep this page open until the server save succeeds.",
      );
    }
  };
  const acceptRemote = () => {
    if (!conflict) return;
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
    localStorage.removeItem(api.recoveryPrefix + record.id);
  };
  const keepMine = async () => {
    if (!conflict) return;
    latest.current.record = conflict as RecordItem<K>;
    latest.current.conflict = false;
    setConflict(null);
    await flush();
  };
  return {
    value,
    change,
    status,
    error,
    conflict,
    acceptRemote,
    keepMine,
    flush,
  };
}
