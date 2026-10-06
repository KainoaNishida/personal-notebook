import { useEffect, useState, useRef } from "react";
import {
  Link,
  useParams,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import { displayDate, ofKind } from "../domain";
import type { Snapshot } from "../domain";
import { LabelChip, ManageLabels } from "./Labels";
import { Modal } from "./UI";

function useFilters() {
  const [params, setParams] = useSearchParams();
  const pending = useRef(params);
  const [visible, setVisible] = useState(params);
  useEffect(() => {
    setVisible(params);
    pending.current = params;
  }, [params]);
  const update = (change: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(pending.current);
    change(next);
    pending.current = next;
    setVisible(next);
    setParams(next, { replace: true });
  };
  return [visible, update] as const;
}

export function NotebookIndex({ records }: { records: Snapshot }) {
  const { id } = useParams();
  const [params, setParams] = useFilters();
  const [filterOpen, setFilterOpen] = useState(false);
  useEffect(() => {
    if (params.has("from") || params.has("to"))
      setParams((p) => {
        p.delete("from");
        p.delete("to");
      });
  }, [params]);
  const notebook = ofKind(records, "notebook").find((n) => n.id === id);
  if (!notebook) return <p>Notebook not found.</p>;
  const labels = ofKind(records, "label").filter(
    (l) => l.data.notebookId === id,
  );
  const selected = params
    .getAll("label")
    .filter((id) => labels.some((l) => l.id === id));
  const text = params.get("q") || "",
    sort = params.get("sort") === "asc" ? "asc" : "desc";
  const update = (key: string, value: string) =>
    setParams((p) => {
      value ? p.set(key, value) : p.delete(key);
    });
  const toggle = (id: string) =>
    setParams((p) => {
      const ids = p.getAll("label");
      p.delete("label");
      (ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id]).forEach(
        (v) => p.append("label", v),
      );
    });
  const papers = ofKind(records, "paper");
  const entries = ofKind(records, "entry")
    .filter((e) => e.data.notebookId === id)
    .filter(
      (e) =>
        selected.every((l) => e.data.labelIds?.includes(l)) &&
        `${e.data.title} ${e.data.markdown} ${papers.find((p) => p.id === e.data.paperId)?.data.title || ""}`
          .toLowerCase()
          .includes(text.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (sort === "asc" ? 1 : -1) *
        (a.data.date.localeCompare(b.data.date) || a.id.localeCompare(b.id)),
    );
  const legacy =
    notebook.data.research && !selected.length
      ? papers.filter(
          (p) =>
            !ofKind(records, "entry").some((e) => e.data.paperId === p.id) &&
            p.data.title.toLowerCase().includes(text.toLowerCase()),
        )
      : [];
  return (
    <main className="page notebook-index">
      <div className="row between">
        <h1>{notebook.data.name}</h1>
        <Link to={`/notebooks/${id}`}>
          {notebook.data.research
            ? "Open timeline"
            : notebook.data.reading
              ? "Open reading log"
              : "Write today"}
        </Link>
      </div>
      <div className="index-toolbar">
        <label className="index-search">
          Search pages
          <input
            value={text}
            placeholder="Search titles and notes…"
            onChange={(e) => update("q", e.target.value)}
          />
        </label>
        <label>
          Sort by date
          <select value={sort} onChange={(e) => update("sort", e.target.value)}>
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </label>
        <button type="button" onClick={() => setFilterOpen(true)}>
          Labels{selected.length ? ` (${selected.length})` : ""}
        </button>
        <ManageLabels notebookId={id!} records={records} />
      </div>
      {!!selected.length && (
        <div className="label-options active-filters">
          {labels
            .filter((l) => selected.includes(l.id))
            .map((l) => (
              <LabelChip
                key={l.id}
                label={l}
                selected
                onClick={() => toggle(l.id)}
              />
            ))}
          <button
            className="text-button"
            onClick={() => setParams((p) => p.delete("label"))}
          >
            Clear labels
          </button>
        </div>
      )}
      <Modal
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title="Filter by labels"
        description="Show pages matching all selected labels."
      >
        <div className="label-options">
          {labels.map((l) => (
            <LabelChip
              key={l.id}
              label={l}
              selected={selected.includes(l.id)}
              onClick={() => toggle(l.id)}
            />
          ))}
        </div>
        {!labels.length && (
          <p className="muted">
            Create labels with Manage labels to filter your pages.
          </p>
        )}
        <button onClick={() => setFilterOpen(false)}>Done</button>
      </Modal>
      <p className="small muted">
        {entries.length + legacy.length}{" "}
        {entries.length + legacy.length === 1 ? "page" : "pages"}
      </p>
      <div className="entry-list">
        {entries.map((e) => (
          <Link
            className="entry-row index-entry"
            key={e.id}
            to={
              e.data.paperId ? `/papers/${e.data.paperId}` : `/entries/${e.id}`
            }
          >
            <div>
              <h2>
                {(e.data.paperId
                  ? papers.find((p) => p.id === e.data.paperId)?.data.title
                  : e.data.title) ||
                  `Note — ${displayDate(e.data.date, { month: "long", day: "numeric", year: "numeric" })}`}
              </h2>
              <time dateTime={e.data.date}>
                {displayDate(e.data.date, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </time>
              <p className="entry-excerpt">
                {e.data.markdown
                  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
                  .replace(/[#*>`]/g, "")
                  .slice(0, 160) || "Empty note"}
              </p>
              <div className="label-options">
                {labels
                  .filter((l) => e.data.labelIds?.includes(l.id))
                  .map((l) => (
                    <LabelChip key={l.id} label={l} />
                  ))}
              </div>
            </div>
          </Link>
        ))}
        {!!legacy.length && (
          <section>
            <h2 className="legacy-heading">Undated papers</h2>
            {legacy.map((p) => (
              <Link className="entry-row" to={`/papers/${p.id}`} key={p.id}>
                {p.data.title}
              </Link>
            ))}
          </section>
        )}
        {!entries.length && !legacy.length && (
          <p className="muted">No matching pages.</p>
        )}
      </div>
    </main>
  );
}
export function ResearchTimeline({
  records,
  notebookId,
}: {
  records: Snapshot;
  notebookId: string;
}) {
  const location = useLocation();
  useEffect(() => {
    if (location.hash.startsWith("#study-")) {
      document
        .getElementById(location.hash.slice(1))
        ?.scrollIntoView({ block: "start" });
    }
  }, [location.key, location.hash]);
  const studies = ofKind(records, "study").filter(
      (s) => s.data.notebookId === notebookId,
    ),
    papers = ofKind(records, "paper");
  const days = [...new Set(studies.map((s) => s.data.date))].sort().reverse();
  const unstudied = papers.filter(
    (p) => !studies.some((s) => s.data.paperId === p.id),
  );
  return (
    <div className="research-timeline">
      <nav className="page-outline" aria-label="Research outline">
        {days.map((d) => (
          <div key={d}>
            <a href={`#study-${d}`}>{displayDate(d)}</a>
            {studies
              .filter((s) => s.data.date === d)
              .map((s) => (
                <Link key={s.id} to={`/papers/${s.data.paperId}`}>
                  {papers.find((p) => p.id === s.data.paperId)?.data.title}
                </Link>
              ))}
          </div>
        ))}
      </nav>
      <div>
        {days.map((d) => (
          <section id={`study-${d}`} key={d}>
            <h2>
              {displayDate(d, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </h2>
            {studies
              .filter((s) => s.data.date === d)
              .map((s) => {
                const p = papers.find((p) => p.id === s.data.paperId);
                return (
                  p && (
                    <Link
                      className="entry-row"
                      key={s.id}
                      to={`/papers/${p.id}`}
                    >
                      <h3>{p.data.title}</h3>
                    </Link>
                  )
                );
              })}
          </section>
        ))}
        {!!unstudied.length && (
          <section>
            <h2>No recorded study date</h2>
            {unstudied.map((p) => (
              <Link className="entry-row" key={p.id} to={`/papers/${p.id}`}>
                {p.data.title}
              </Link>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
