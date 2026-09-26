import { useEffect, useState, useRef, lazy, Suspense } from "react";
import {
  Link,
  useParams,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { displayDate, ofKind, uid } from "../domain";
import type { Entry, RecordItem, Snapshot } from "../domain";
import { useSave } from "../hooks";
import * as api from "../service";
const Markdown = lazy(() =>
  import("./Markdown").then((m) => ({ default: m.Markdown })),
);
import { DailyEntry } from "./DailyEntry";
import { ErrorNotice } from "./UI";

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

export function EntryLabels({
  value,
  records,
  onChange,
}: {
  value: Entry;
  records: Snapshot;
  onChange: (value: Entry) => void;
}) {
  const labels = ofKind(records, "label").filter(
    (l) => l.data.notebookId === value.notebookId,
  );
  return labels.length ? (
    <fieldset className="entry-labels">
      <legend>Labels</legend>
      {labels.map((l) => (
        <label
          key={l.id}
          className="label-chip"
          style={{ borderColor: l.data.color }}
        >
          <input
            type="checkbox"
            checked={value.labelIds?.includes(l.id) || false}
            onChange={(e) =>
              onChange({
                ...value,
                labelIds: e.target.checked
                  ? [...(value.labelIds || []), l.id]
                  : value.labelIds?.filter((id) => id !== l.id),
              })
            }
          />
          {l.data.name}
        </label>
      ))}
    </fieldset>
  ) : (
    <Link className="small muted" to={`/notebooks/${value.notebookId}/pages`}>
      Manage labels
    </Link>
  );
}
function Labels({
  notebookId,
  records,
}: {
  notebookId: string;
  records: Snapshot;
}) {
  const save = useSave(),
    [name, setName] = useState(""),
    [color, setColor] = useState("#f59a56"),
    [editing, setEditing] = useState<RecordItem<"label">>(),
    [error, setError] = useState("");
  return (
    <details className="label-manager">
      <summary>Manage notebook labels</summary>
      <div className="row wrap">
        {ofKind(records, "label")
          .filter((l) => l.data.notebookId === notebookId)
          .map((l) => (
            <button
              key={l.id}
              style={{ borderColor: l.data.color }}
              onClick={() => {
                setEditing(l);
                setName(l.data.name);
                setColor(l.data.color);
              }}
            >
              {l.data.name}
            </button>
          ))}
      </div>
      <form
        className="row wrap"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await save(
              "label",
              editing?.id || uid(),
              { notebookId, name: name.trim(), color },
              editing?.revision || 0,
            );
            setEditing(undefined);
            setName("");
            setError("");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <label>
          Label name
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Label color
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <button>{editing ? "Rename label" : "Add label"}</button>
        {editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(undefined);
              setName("");
            }}
          >
            Cancel
          </button>
        )}
      </form>
      <ErrorNotice error={error} />
    </details>
  );
}
export function NotebookIndex({ records }: { records: Snapshot }) {
  const { id } = useParams(),
    [params, setParams] = useFilters();
  const notebook = ofKind(records, "notebook").find((n) => n.id === id);
  if (!notebook) return <p>Notebook not found.</p>;
  const selected = params.getAll("label"),
    text = params.get("q") || "",
    from = params.get("from") || "",
    to = params.get("to") || "";
  const update = (key: string, value: string) =>
    setParams((p) => {
      value ? p.set(key, value) : p.delete(key);
      return p;
    });
  const entries = ofKind(records, "entry")
    .filter((e) => e.data.notebookId === id)
    .filter(
      (e) =>
        (!from || e.data.date >= from) &&
        (!to || e.data.date <= to) &&
        selected.every((l) => e.data.labelIds?.includes(l)) &&
        `${e.data.title} ${e.data.markdown}`
          .toLowerCase()
          .includes(text.toLowerCase()),
    )
    .sort(
      (a, b) =>
        b.data.date.localeCompare(a.data.date) || b.id.localeCompare(a.id),
    );
  const papers = ofKind(records, "paper").filter(
    (p) => !ofKind(records, "entry").some((e) => e.data.paperId === p.id),
  );
  return (
    <main className="page">
      <div className="row between">
        <h1>{notebook.data.name}</h1>
        <Link to={`/notebooks/${id}`}>Open notebook</Link>
      </div>
      <div className="filters">
        <label>
          Search pages
          <input value={text} onChange={(e) => update("q", e.target.value)} />
        </label>
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => update("from", e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            onChange={(e) => update("to", e.target.value)}
          />
        </label>
      </div>
      <fieldset className="entry-labels">
        <legend>Match all selected labels</legend>
        {ofKind(records, "label")
          .filter((l) => l.data.notebookId === id)
          .map((l) => (
            <label
              className="label-chip"
              key={l.id}
              style={{ borderColor: l.data.color }}
            >
              <input
                type="checkbox"
                checked={selected.includes(l.id)}
                onChange={(e) =>
                  setParams((p) => {
                    const next = e.target.checked
                      ? [...selected, l.id]
                      : selected.filter((id) => id !== l.id);
                    p.delete("label");
                    next.forEach((id) => p.append("label", id));
                    return p;
                  })
                }
              />
              {l.data.name}
            </label>
          ))}
      </fieldset>
      <Labels notebookId={id!} records={records} />
      <div className="entry-list">
        {entries.map((e) => (
          <Link
            className="entry-row"
            key={e.id}
            to={
              e.data.paperId ? `/papers/${e.data.paperId}` : `/entries/${e.id}`
            }
          >
            <div>
              <h2>
                {e.data.paperId
                  ? ofKind(records, "paper").find(
                      (p) => p.id === e.data.paperId,
                    )?.data.title
                  : e.data.title || "Untitled note"}
              </h2>
              <p>
                {displayDate(e.data.date, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
              <div className="row wrap">
                {ofKind(records, "label")
                  .filter((l) => e.data.labelIds?.includes(l.id))
                  .map((l) => (
                    <span
                      className="label-chip"
                      key={l.id}
                      style={{ borderColor: l.data.color }}
                    >
                      {l.data.name}
                    </span>
                  ))}
              </div>
            </div>
          </Link>
        ))}
        {notebook.data.research &&
          !from &&
          !to &&
          !selected.length &&
          papers
            .filter((p) =>
              p.data.title.toLowerCase().includes(text.toLowerCase()),
            )
            .map((p) => (
              <Link className="entry-row" to={`/papers/${p.id}`} key={p.id}>
                {p.data.title}
              </Link>
            ))}
        {!entries.length &&
          !(
            notebook.data.research &&
            !from &&
            !to &&
            !selected.length &&
            papers.some((p) =>
              p.data.title.toLowerCase().includes(text.toLowerCase()),
            )
          ) && <p className="muted">No matching pages.</p>}
      </div>
    </main>
  );
}
export function NotebookStream({
  notebook,
  records,
  date,
}: {
  notebook: RecordItem<"notebook">;
  records: Snapshot;
  date: string;
}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const target =
    ofKind(records, "entry").find((e) => e.id === params.get("entry"))?.data
      .date || date;
  const [active, setActive] = useState(target);
  useEffect(() => {
    setActive(target);
    document
      .getElementById(`section-${target}`)
      ?.scrollIntoView({ block: "start" });
  }, [target]);
  const entries = ofKind(records, "entry").filter(
    (e) => e.data.notebookId === notebook.id && !e.data.paperId,
  );
  const dates = [...new Set([date, ...entries.map((e) => e.data.date)])]
    .sort()
    .reverse();
  const go = (d: string) => {
    setActive(d);
    requestAnimationFrame(() =>
      document
        .getElementById(`section-${d}`)
        ?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
  };
  return (
    <main className="notebook-stream">
      <nav className="page-outline" aria-label="Notebook outline">
        <Link to={`/notebooks/${notebook.id}/pages`}>All pages & labels</Link>
        {dates.map((d) => (
          <button
            key={d}
            aria-current={active === d ? "location" : undefined}
            onClick={() => go(d)}
          >
            {displayDate(d, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            <small>
              {entries.find((e) => e.data.date === d)?.data.title ||
                (d === date ? "Today" : "Untitled note")}
            </small>
          </button>
        ))}
      </nav>
      <div className="sections-pane">
        <h1>{notebook.data.name}</h1>
        {dates.map((d) => {
          const e = entries.find((e) => e.data.date === d);
          return (
            <section id={`section-${d}`} className="dated-section" key={d}>
              <h2>
                {displayDate(d, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </h2>
              {active === d ? (
                <DailyEntry notebook={notebook} records={records} date={d} />
              ) : (
                <>
                  <button className="section-edit" onClick={() => setActive(d)}>
                    {e?.data.title || "Untitled note"} · Edit
                  </button>
                  <div onClick={() => setActive(d)}>
                    <Suspense
                      fallback={<p className="muted">Loading section…</p>}
                    >
                      <Markdown
                        text={e?.data.markdown || "Start writing…"}
                        records={records}
                        onAnnotation={(id) => {
                          const a = ofKind(records, "annotation").find(
                            (a) => a.id === id,
                          );
                          if (a)
                            navigate(
                              `/papers/${a.data.paperId}?annotation=${id}`,
                            );
                        }}
                      />
                    </Suspense>
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
export function TimeLog({
  notebook,
  records,
  date,
  paperId,
}: {
  notebook: RecordItem<"notebook">;
  records: Snapshot;
  date: string;
  paperId?: string;
}) {
  const old = ofKind(records, "activity").find(
      (a) => a.data.notebookId === notebook.id && a.data.date === date,
    ),
    minutes = old?.data.minutes || 0;
  const [hours, setHours] = useState(String(Math.floor(minutes / 60))),
    [mins, setMins] = useState(String(minutes % 60)),
    [paper, setPaper] = useState(paperId || ""),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    q = useQueryClient();
  const [base, setBase] = useState(old);
  useEffect(() => {
    if (!dirty) {
      setHours(String(Math.floor(minutes / 60)));
      setMins(String(minutes % 60));
      setBase(old);
    }
  }, [old, minutes, dirty]);
  return (
    <form
      className="time-log"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api.saveTime(
            notebook.id,
            date,
            Number(hours) * 60 + Number(mins),
            base,
            paper || undefined,
          );
          await q.invalidateQueries({ queryKey: ["records"] });
          setDirty(false);
          setError("");
        } catch (e) {
          setError(
            (e as Error).message +
              " Your entered total is preserved. Reload the total before retrying.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <span>{notebook.data.name}</span>
      <label>
        Hours
        <input
          aria-label={`${notebook.data.name} hours`}
          type="number"
          min="0"
          max="24"
          step="1"
          required
          value={hours}
          onChange={(e) => {
            setHours(e.target.value);
            setDirty(true);
          }}
        />
      </label>
      <label>
        Minutes
        <input
          aria-label={`${notebook.data.name} minutes`}
          type="number"
          min="0"
          max="59"
          step="1"
          required
          value={mins}
          onChange={(e) => {
            setMins(e.target.value);
            setDirty(true);
          }}
        />
      </label>
      {notebook.data.research && (
        <label>
          Paper studied
          <select value={paper} onChange={(e) => setPaper(e.target.value)}>
            <option value="">No paper selected</option>
            {ofKind(records, "paper").map((p) => (
              <option key={p.id} value={p.id}>
                {p.data.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <button disabled={busy}>Save time</button>
      {error && (
        <>
          <ErrorNotice error={error} />
          <button
            type="button"
            onClick={() => {
              setDirty(false);
              setError("");
              void q.invalidateQueries({ queryKey: ["records"] });
            }}
          >
            Reload total
          </button>
        </>
      )}
    </form>
  );
}
export function TimeHistory({ records }: { records: Snapshot }) {
  const [params, setParams] = useFilters();
  const [editDate, setEditDate] = useState(
      new Date().toISOString().slice(0, 10),
    ),
    [editNotebook, setEditNotebook] = useState(
      ofKind(records, "notebook")[0]?.id || "",
    );
  const editing = ofKind(records, "notebook").find(
    (n) => n.id === editNotebook,
  );
  const from = params.get("from") || "",
    to = params.get("to") || "",
    notebook = params.get("notebook") || "";
  const update = (key: string, value: string) =>
    setParams((p) => {
      value ? p.set(key, value) : p.delete(key);
      return p;
    });
  const activities = ofKind(records, "activity")
    .filter(
      (a) =>
        (!from || a.data.date >= from) &&
        (!to || a.data.date <= to) &&
        (!notebook || a.data.notebookId === notebook),
    )
    .sort((a, b) => b.data.date.localeCompare(a.data.date));
  const total = activities.reduce((sum, a) => sum + (a.data.minutes || 0), 0);
  return (
    <main className="page">
      <h1>Productive time</h1>
      <details>
        <summary>Add or edit a daily total</summary>
        <div className="filters">
          <label>
            Date
            <input
              type="date"
              required
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
            />
          </label>
          <label>
            Notebook to log
            <select
              value={editNotebook}
              onChange={(e) => setEditNotebook(e.target.value)}
            >
              {ofKind(records, "notebook").map((n) => (
                <option key={n.id} value={n.id}>
                  {n.data.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {editing && editDate && (
          <TimeLog
            key={`${editNotebook}:${editDate}`}
            notebook={editing}
            records={records}
            date={editDate}
          />
        )}
      </details>
      <div className="filters">
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => update("from", e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            onChange={(e) => update("to", e.target.value)}
          />
        </label>
        <label>
          Notebook
          <select
            value={notebook}
            onChange={(e) => update("notebook", e.target.value)}
          >
            <option value="">All notebooks</option>
            {ofKind(records, "notebook").map((n) => (
              <option key={n.id} value={n.id}>
                {n.data.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <h2>
        {Math.floor(total / 60)} hours {total % 60} minutes
      </h2>
      {activities.map((a) => {
        const n = ofKind(records, "notebook").find(
          (n) => n.id === a.data.notebookId,
        );
        return (
          n && (
            <section key={a.id}>
              <h3>
                {displayDate(a.data.date, {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </h3>
              <TimeLog notebook={n} records={records} date={a.data.date} />
            </section>
          )
        );
      })}
      {!activities.length && <p>No time recorded in this range.</p>}
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
