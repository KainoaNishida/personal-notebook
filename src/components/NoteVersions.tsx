import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, demo, recoveryPrefix } from "../service";
import type { RecordItem, Snapshot } from "../domain";

export function NoteVersions({
  record,
  records,
  onRestore,
}: {
  record: RecordItem<"entry">;
  records: Snapshot;
  onRestore: (markdown: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["versions", record.id, record.revision],
    enabled: open && !demo && !!supabase && record.revision > 0,
    queryFn: async () => {
      const r = await supabase!
        .from("record_versions")
        .select("revision,data,saved_at")
        .eq("record_id", record.id)
        .order("revision", { ascending: false })
        .limit(100);
      if (r.error) throw r.error;
      return r.data as {
        revision: number;
        data: { markdown: string };
        saved_at: string;
      }[];
    },
  });
  const originals = records.filter(
    (r): r is RecordItem<"entry"> =>
      r.kind === "entry" && r.data.mergedInto === record.id,
  );
  const relatedIds = new Set([record.id, ...originals.map((r) => r.id)]);
  for (const r of records) {
    if (
      r.kind === "day" &&
      relatedIds.has(
        String((r.data as unknown as { migratedTo?: string }).migratedTo),
      )
    )
      relatedIds.add(r.id);
  }
  const browserDrafts: { key: string; markdown: string }[] = [];
  if (open) {
    try {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(recoveryPrefix)) continue;
        const id = key.slice(recoveryPrefix.length).split(":")[0];
        if (id === record.id || !relatedIds.has(id)) continue;
        const draft = JSON.parse(localStorage.getItem(key)!);
        if (typeof draft.data?.markdown === "string")
          browserDrafts.push({ key, markdown: draft.data.markdown });
      }
    } catch {
      /* Leave recovery storage untouched if unavailable. */
    }
  }
  return (
    <details
      className="note-versions"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Previous versions</summary>
      <p className="small muted">
        Choosing a version puts its text in the editor. Your current saved
        version remains in history.
      </p>
      {query.error && <p className="error-text">{query.error.message}</p>}
      {query.isFetching && <p>Loading versions…</p>}
      {browserDrafts.map((d) => (
        <details key={d.key}>
          <summary>Unsaved browser draft from an original note</summary>
          <pre>{d.markdown}</pre>
          <button onClick={() => onRestore(d.markdown)}>Use this text</button>
        </details>
      ))}
      {originals.map((r) => (
        <details key={r.id}>
          <summary>
            Original · {r.data.date} · {r.data.title || "Note"}
          </summary>
          <pre>{r.data.markdown}</pre>
          <button onClick={() => onRestore(r.data.markdown)}>
            Use this text
          </button>
        </details>
      ))}
      {query.data?.map((v) => (
        <details key={v.revision}>
          <summary>
            Version {v.revision} · {new Date(v.saved_at).toLocaleString()}
          </summary>
          <pre>{v.data.markdown}</pre>
          <button onClick={() => onRestore(v.data.markdown)}>
            Use this text
          </button>
        </details>
      ))}
      {!query.isFetching &&
        !originals.length &&
        !browserDrafts.length &&
        !query.data?.length && (
          <p className="small muted">No earlier versions.</p>
        )}
    </details>
  );
}
