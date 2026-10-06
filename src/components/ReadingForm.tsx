import { useEffect, useId, useState } from "react";
import { z } from "zod";
import { uid } from "../domain";
import type { RecordItem } from "../domain";
import { sameData } from "../hooks";
import { recoveryPrefix } from "../service";
import { readingSchema, validReadingDate } from "../reading";

const fieldsSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  author: z.string(),
  minutes: z.string(),
  date: z.string(),
  writingDate: z.string(),
  markdown: z.string(),
  createdAt: z.iso.datetime(),
  base: z
    .object({ title: z.string(), date: z.string(), reading: readingSchema })
    .optional(),
});
export type ReadingFields = z.infer<typeof fieldsSchema>;
const scopeFor = (notebookId: string, entryId = "new") =>
  `${recoveryPrefix}reading-form:${notebookId}:${entryId}:`;

export function recoveredReadingForm(notebookId: string, entryId?: string) {
  try {
    const scope = scopeFor(notebookId, entryId);
    const preferred = sessionStorage.getItem(scope);
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(scope))
      .flatMap((key) => {
        try {
          const value = JSON.parse(localStorage.getItem(key)!);
          const parsed = fieldsSchema.safeParse(value.fields);
          return parsed.success
            ? [{ key, fields: parsed.data, time: Number(value.time) || 0 }]
            : [];
        } catch {
          return [];
        }
      })
      .sort(
        (a, b) =>
          Number(b.key === preferred) - Number(a.key === preferred) ||
          b.time - a.time,
      )[0];
  } catch {
    return undefined;
  }
}

// Unsubmitted forms have their own recovery slots, like note drafts. Two tabs
// must not overwrite each other's book/minute input before a record exists.
export function ReadingForm({
  notebookId,
  date,
  books,
  record,
  onSave,
  onCancel,
}: {
  notebookId: string;
  date: string;
  books: RecordItem<"entry">[];
  record?: RecordItem<"entry">;
  onSave: (fields: ReadingFields) => Promise<boolean>;
  onCancel: () => void;
}) {
  const listId = useId();
  const [recovered] = useState(() =>
    recoveredReadingForm(notebookId, record?.id),
  );
  const [fields, setFields] = useState<ReadingFields>(
    () =>
      recovered?.fields || {
        id: record?.id || uid(),
        title: record?.data.title || "",
        author: record?.data.reading?.author || "",
        minutes: record?.data.reading
          ? String(record.data.reading.minutes)
          : "",
        date: record?.data.date || date,
        writingDate: date,
        markdown: record?.data.markdown || "",
        createdAt: record?.data.reading?.createdAt || new Date().toISOString(),
        base: record?.data.reading
          ? {
              title: record.data.title,
              date: record.data.date,
              reading: record.data.reading,
            }
          : undefined,
      },
  );
  const [slot] = useState(() => scopeFor(notebookId, record?.id) + uid());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(!!recovered);
  useEffect(() => {
    if (!dirty && !record)
      setFields((previous) => ({ ...previous, date, writingDate: date }));
  }, [date, dirty, record]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  function change(next: ReadingFields) {
    if (!dirty) next = { ...next, writingDate: date };
    setFields(next);
    setDirty(true);
    setError("");
    try {
      localStorage.setItem(
        slot,
        JSON.stringify({ version: 1, fields: next, time: Date.now() }),
      );
      sessionStorage.setItem(scopeFor(notebookId, record?.id), slot);
    } catch {
      setError(
        "Browser recovery is unavailable. Save this log before leaving the page.",
      );
    }
  }
  function clear() {
    try {
      for (const key of Object.keys(localStorage).filter((k) =>
        k.startsWith(scopeFor(notebookId, record?.id)),
      )) {
        try {
          if (
            key === slot ||
            sameData(JSON.parse(localStorage.getItem(key)!).fields, fields)
          )
            localStorage.removeItem(key);
        } catch {
          /* Preserve unreadable and other-window drafts. */
        }
      }
    } catch {
      /* Saving still succeeds if browser storage becomes unavailable. */
    }
    setDirty(false);
  }
  const unique = [
    ...new Map(
      books.map((b) => [b.data.title.toLocaleLowerCase(), b]),
    ).values(),
  ];
  return (
    <form
      className="reading-form"
      aria-label={record ? "Edit reading session" : "Log reading session"}
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        if (!fields.title.trim() || fields.title.length > 300) {
          setError("Enter a book title of up to 300 characters.");
          return;
        }
        if (
          !/^\d+$/.test(fields.minutes) ||
          Number(fields.minutes) < 1 ||
          Number(fields.minutes) > 1440
        ) {
          setError("Enter whole minutes from 1 to 1440.");
          return;
        }
        if (!validReadingDate(fields.date) || fields.date > date) {
          setError("Choose a valid date no later than today.");
          return;
        }
        setBusy(true);
        try {
          if (
            await onSave({
              ...fields,
              title: fields.title.trim(),
              author: fields.author.trim(),
            })
          )
            clear();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="reading-form-fields">
        <legend className="sr-only">Reading session details</legend>
        <div className="reading-book-fields">
          <label>
            <span className="sr-only">Book title</span>
            <input
              autoFocus
              required
              maxLength={300}
              placeholder="Book title"
              value={fields.title}
              list={listId}
              onChange={(e) => {
                const title = e.target.value,
                  known = unique.find(
                    (b) =>
                      b.data.title.toLocaleLowerCase() ===
                      title.toLocaleLowerCase(),
                  );
                change({
                  ...fields,
                  title,
                  author: known?.data.reading?.author ?? fields.author,
                });
              }}
            />
          </label>
          <datalist id={listId}>
            {unique.map((b) => (
              <option key={b.id} value={b.data.title} />
            ))}
          </datalist>
          <label>
            <span className="sr-only">Author (optional)</span>
            <input
              maxLength={200}
              placeholder="Author (optional)"
              value={fields.author}
              onChange={(e) => change({ ...fields, author: e.target.value })}
            />
          </label>
        </div>
        <label>
          <span className="sr-only">Minutes</span>
          <input
            required
            type="number"
            min={1}
            max={1440}
            step={1}
            placeholder="35"
            value={fields.minutes}
            onChange={(e) => change({ ...fields, minutes: e.target.value })}
          />
        </label>
        <label>
          <span className="sr-only">Reading date</span>
          <input
            required
            type="date"
            min="0001-01-01"
            max={date}
            value={fields.date}
            onChange={(e) => change({ ...fields, date: e.target.value })}
          />
        </label>
        {record ? (
          <p className="small muted">Notes stay in the editor below.</p>
        ) : (
          <label>
            <span className="sr-only">Notes (optional)</span>
            <textarea
              rows={2}
              placeholder="Optional note…"
              value={fields.markdown}
              onChange={(e) => change({ ...fields, markdown: e.target.value })}
            />
          </label>
        )}
      </fieldset>
      <div className="reading-form-actions">
        <span className="small muted">
          {recovered
            ? "Recovered an unfinished log from this browser."
            : "Choose a recent book or type a new title."}
        </span>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => {
            clear();
            onCancel();
          }}
        >
          Cancel
        </button>
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : record ? "Save details" : "Save log"}
        </button>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </form>
  );
}
