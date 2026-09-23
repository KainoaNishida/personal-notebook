import { useState } from "react";
import type { RecordItem } from "../domain";
import { useSave } from "../hooks";
export function PaperTitle({ paper }: { paper: RecordItem<"paper"> }) {
  const [editing, setEditing] = useState(false),
    [title, setTitle] = useState(paper.data.title),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const save = useSave();
  return (
    <div className="paper-title">
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await save(
                "paper",
                paper.id,
                { ...paper.data, title: title.trim() },
                paper.revision,
              );
              setEditing(false);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            autoFocus
            aria-label="Paper title"
            value={title}
            maxLength={300}
            required
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <button disabled={busy || !title.trim()}>Save</button>
          <button type="button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button
          className="text-button"
          title="Rename paper"
          aria-label={`Rename paper: ${paper.data.title}`}
          onClick={() => {
            setTitle(paper.data.title);
            setEditing(true);
          }}
        >
          {paper.data.title}
        </button>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
