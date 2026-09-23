import { useEffect, useState } from "react";
import { ofKind, entryId } from "../domain";
import type { RecordItem, Snapshot } from "../domain";
import { EntryWriting } from "../App";

export function DailyEntry({
  records,
  notebook,
  date,
  compact,
}: {
  records: Snapshot;
  notebook: RecordItem<"notebook">;
  date: string;
  compact?: boolean;
}) {
  const [id, setId] = useState("");
  useEffect(() => {
    let active = true;
    void entryId(`${notebook.id}:${date}`).then((id) => {
      if (active) setId(id);
    });
    return () => {
      active = false;
    };
  }, [notebook.id, date]);
  const existing = ofKind(records, "entry").find(
    (e) =>
      !e.data.paperId &&
      e.data.notebookId === notebook.id &&
      e.data.date === date,
  );
  if (!id && !existing) return <p className="muted">Opening note…</p>;
  const blank: RecordItem<"entry"> = {
    id,
    kind: "entry",
    revision: 0,
    updated_at: "",
    deleted_at: null,
    data: { title: "", markdown: "", date, notebookId: notebook.id },
  };
  return (
    <div className={compact ? "daily-reflection" : ""}>
      <EntryWriting
        key={existing?.id || id}
        record={existing || blank}
        records={records}
      />
    </div>
  );
}
