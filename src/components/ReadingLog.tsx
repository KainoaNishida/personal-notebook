import { Fragment, lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ChevronDown, ChevronUp, Plus, Search } from "lucide-react";
import { displayDate, ofKind } from "../domain";
import type { RecordItem, Snapshot } from "../domain";
import { sameData, useDraft, useNotebookDate, useSave } from "../hooks";
import * as api from "../service";
import { readingPreview, sortReadingSessions } from "../reading";
import { DraftStatus } from "./DraftStatus";
import { EntryLabels } from "./Labels";
import { NoteVersions } from "./NoteVersions";
import { ReadingForm, recoveredReadingForm } from "./ReadingForm";
import { ErrorNotice } from "./UI";
import "../styles/reading.css";
const Editor = lazy(() =>
  import("./Editor").then((m) => ({ default: m.Editor })),
);

export function ReadingLog({
  records,
  notebook,
}: {
  records: Snapshot;
  notebook: RecordItem<"notebook">;
}) {
  const date = useNotebookDate(
    ofKind(records, "settings")[0]?.data.timezone || "America/Los_Angeles",
  );
  const [params, setParams] = useSearchParams(),
    save = useSave();
  const cache = useQueryClient();
  const [adding, setAdding] = useState(
    () => !!recoveredReadingForm(notebook.id),
  );
  const [formKey, setFormKey] = useState(0);
  const open = params.get("session"),
    query = params.get("q") || "";
  const all = ofKind(records, "entry").filter(
    (e) => e.data.notebookId === notebook.id && !e.data.paperId,
  );
  const sessions = sortReadingSessions(all.filter((e) => !!e.data.reading));
  const shown = sessions.filter(
    (e) =>
      e.id === open ||
      `${e.data.title} ${e.data.reading?.author} ${e.data.markdown}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()),
  );
  const legacy = all.filter((e) => !e.data.reading);
  function select(id: string | null) {
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        id ? next.set("session", id) : next.delete("session");
        return next;
      },
      { replace: true },
    );
  }
  useEffect(() => {
    if (open)
      document
        .getElementById(`reading-${open}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open]);
  return (
    <main className="page reading-page">
      <div className="reading-heading">
        <div>
          <h1>Reading log</h1>
          <p className="muted">Books, minutes, and anything worth keeping.</p>
        </div>
        <button
          className="primary"
          disabled={adding}
          onClick={() => {
            setFormKey((n) => n + 1);
            setAdding(true);
          }}
        >
          <Plus size={16} />
          Log reading
        </button>
      </div>
      <div className="reading-toolbar">
        <label className="reading-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search books or notes</span>
          <input
            placeholder="Search books or notes…"
            value={query}
            onChange={(e) => {
              const q = e.target.value;
              setParams(
                (p) => {
                  const next = new URLSearchParams(p);
                  q ? next.set("q", q) : next.delete("q");
                  return next;
                },
                { replace: true },
              );
            }}
          />
        </label>
        <span className="small muted">
          <ArrowDown size={14} aria-hidden="true" />
          Newest day first
        </span>
      </div>
      <div
        className="reading-table-scroll"
        role="region"
        aria-label="Reading sessions"
        tabIndex={0}
      >
        <table className="reading-table">
          <caption className="sr-only">
            Reading sessions, newest day first. Expand notes for a writing area.
          </caption>
          <colgroup>
            <col className="reading-book-column" />
            <col className="reading-minutes-column" />
            <col className="reading-date-column" />
            <col />
          </colgroup>
          <thead>
            <tr>
              {["Book title", "Minutes", "Date", "Notes"].map((label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {adding && (
              <tr>
                <td colSpan={4} className="reading-form-cell">
                  <ReadingForm
                    key={formKey}
                    notebookId={notebook.id}
                    date={date}
                    books={sessions}
                    onCancel={() => setAdding(false)}
                    onSave={async (fields) => {
                      const data = {
                        notebookId: notebook.id,
                        title: fields.title,
                        date: fields.date,
                        markdown: fields.markdown,
                        reading: {
                          minutes: Number(fields.minutes),
                          author: fields.author,
                          createdAt: fields.createdAt,
                        },
                      };
                      try {
                        await save(
                          "entry",
                          fields.id,
                          data,
                          0,
                          null,
                          fields.writingDate,
                        );
                      } catch (error) {
                        // A lost response must not create a duplicate session on retry.
                        if (!(
                          error instanceof api.ConflictError &&
                          sameData(error.remote.data, data)
                        ))
                          throw error;
                        await cache.invalidateQueries({
                          queryKey: ["records"],
                        });
                      }
                      setAdding(false);
                      return true;
                    }}
                  />
                </td>
              </tr>
            )}
            {shown.map((record) => (
              <Fragment key={record.id}>
                <tr
                  id={`reading-${record.id}`}
                  className={
                    open === record.id ? "reading-row is-open" : "reading-row"
                  }
                >
                  <th scope="row">
                    <button
                      className="reading-book-button"
                      aria-label={`Edit log for ${record.data.title}, ${record.data.date}`}
                      onClick={() => select(record.id)}
                    >
                      {record.data.title}
                    </button>
                    {record.data.reading?.author && (
                      <span className="reading-author">
                        {record.data.reading.author}
                      </span>
                    )}
                  </th>
                  <td className="reading-minutes">
                    {record.data.reading!.minutes}
                  </td>
                  <td>
                    <time dateTime={record.data.date}>
                      {displayDate(record.data.date, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </time>
                    <span className="reading-weekday">
                      {record.data.date === date
                        ? "Today"
                        : displayDate(record.data.date, { weekday: "long" })}
                    </span>
                  </td>
                  <td>
                    <button
                      className="reading-note-preview"
                      aria-expanded={open === record.id}
                      aria-controls={
                        open === record.id
                          ? `reading-notes-${record.id}`
                          : undefined
                      }
                      aria-label={`${open === record.id ? "Close" : record.data.markdown.trim() ? "Open" : "Add"} notes for ${record.data.title}, ${record.data.date}`}
                      onClick={() =>
                        select(open === record.id ? null : record.id)
                      }
                    >
                      <span>
                        {readingPreview(record.data.markdown) || "+ Add notes"}
                      </span>
                      {open === record.id ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                  </td>
                </tr>
                {open === record.id && (
                  <ReadingNotes
                    key={record.id}
                    record={record}
                    records={records}
                    date={date}
                    books={sessions}
                    onClose={() => select(null)}
                  />
                )}
              </Fragment>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={4} className="reading-empty">
                  <h2>
                    {query ? "No matching sessions" : "Start your reading log"}
                  </h2>
                  <p className="muted">
                    {query
                      ? "Try another book title, author, or note."
                      : "Log a book and a few minutes. Add notes whenever you like."}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="reading-footer small muted">
        <span>
          {shown.length} {shown.length === 1 ? "session" : "sessions"} ·{" "}
          {
            new Set(shown.map((e) => e.data.title.trim().toLocaleLowerCase()))
              .size
          }{" "}
          books
        </span>
        <span>
          {shown
            .reduce((sum, e) => sum + e.data.reading!.minutes, 0)
            .toLocaleString()}{" "}
          minutes in view
        </span>
      </div>
      {!!legacy.length && (
        <section className="reading-legacy">
          <h2>Earlier notes</h2>
          <p className="small muted">
            Your original Reading pages are still here.
          </p>
          {sortReadingSessions(legacy).map((e) => (
            <Link key={e.id} className="entry-row" to={`/entries/${e.id}`}>
              <span>{e.data.title || "Untitled note"}</span>
              <time dateTime={e.data.date}>
                {displayDate(e.data.date, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </time>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}

function ReadingNotes({
  record,
  records,
  date,
  books,
  onClose,
}: {
  record: RecordItem<"entry">;
  records: Snapshot;
  date: string;
  books: RecordItem<"entry">[];
  onClose: () => void;
}) {
  const draft = useDraft(record),
    query = useQueryClient(),
    nav = useNavigate();
  const [editing, setEditing] = useState(
    () => !!recoveredReadingForm(record.data.notebookId, record.id),
  );
  const [error, setError] = useState("");
  const noteRegion = useRef<HTMLDivElement>(null);
  useEffect(() => {
    noteRegion.current?.focus({ preventScroll: true });
  }, []);
  return (
    <tr className="reading-notes-row">
      <td colSpan={4}>
        <div
          id={`reading-notes-${record.id}`}
          className="reading-notes"
          ref={noteRegion}
          tabIndex={-1}
          role="region"
          aria-label={`Notes for ${draft.value.title}`}
        >
          <div className="reading-note-heading">
            <span className="eyebrow">Session notes</span>
            <DraftStatus draft={draft} />
            <button
              className="text-button"
              onClick={() => setEditing(!editing)}
            >
              {editing ? "Close details" : "Edit log"}
            </button>
          </div>
          {editing && (
            <ReadingForm
              notebookId={record.data.notebookId}
              date={date}
              books={books}
              record={{ ...record, data: draft.value }}
              onCancel={() => setEditing(false)}
              onSave={async (fields) => {
                const current = {
                  title: draft.value.title,
                  date: draft.value.date,
                  reading: draft.value.reading,
                };
                const desired = {
                  title: fields.title,
                  date: fields.date,
                  reading: {
                    ...draft.value.reading!,
                    author: fields.author,
                    minutes: Number(fields.minutes),
                  },
                };
                if (
                  fields.base &&
                  !sameData(fields.base, current) &&
                  !sameData(desired, current)
                ) {
                  throw new Error(
                    "This session’s details changed in another window. Cancel these details to see the latest values before editing again. Your notes are preserved.",
                  );
                }
                draft.change({
                  ...draft.value,
                  ...desired,
                });
                await draft.flush();
                if (!draft.isSaved()) return false;
                setEditing(false);
                return true;
              }}
            />
          )}
          <EntryLabels
            value={draft.value}
            records={records}
            onChange={draft.change}
          />
          <Suspense fallback={<p className="muted">Opening notes…</p>}>
            <Editor
              records={records}
              value={draft.value.markdown}
              label={`Reading notes for ${draft.value.title}`}
              onChange={(markdown) =>
                draft.change({ ...draft.value, markdown })
              }
              onAnnotation={(id) => {
                const annotation = ofKind(records, "annotation").find(
                  (a) => a.id === id,
                );
                if (annotation)
                  nav(`/papers/${annotation.data.paperId}?annotation=${id}`);
                else
                  setError(
                    "The source annotation is missing. Restore it from a backup.",
                  );
              }}
              onUpload={async (file) => {
                const asset = await api.upload(file);
                await query.invalidateQueries({ queryKey: ["records"] });
                return asset.id;
              }}
            />
          </Suspense>
          <div className="reading-note-bottom">
            <NoteVersions
              record={record}
              records={records}
              onRestore={(markdown) =>
                draft.change({ ...draft.value, markdown })
              }
            />
            <button
              className="text-button"
              onClick={async () => {
                await draft.flush();
                if (draft.isSaved()) {
                  onClose();
                  requestAnimationFrame(() =>
                    document
                      .getElementById(`reading-${record.id}`)
                      ?.querySelector<HTMLButtonElement>(
                        ".reading-note-preview",
                      )
                      ?.focus(),
                  );
                }
              }}
            >
              Close notes <ChevronUp size={14} />
            </button>
          </div>
          <ErrorNotice error={error} />
        </div>
      </td>
    </tr>
  );
}
