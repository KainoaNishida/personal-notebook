import { TimeCalculator } from "./components/TimeCalculator";
import { hasUnsyncedWorkTime } from "./workTimeSync";
import { APP_NAME } from "./branding";
import { useEffect, useRef, useState, lazy, Suspense } from "react";
import type { CSSProperties, FormEvent } from "react";
import {
  BrowserRouter,
  NavLink,
  Link,
  Route,
  Routes,
  Navigate,
  useNavigate,
  useParams,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
  useQuery,
} from "@tanstack/react-query";
import {
  ArrowUpRight,
  ArrowLeft,
  Plus,
  Search,
  PanelLeft,
  BookOpen,
  CalendarDays,
  Files,
  Settings as SettingsIcon,
  LogOut,
  Check,
  Archive,
  RotateCcw,
  Download,
  Upload,
  Sparkles,
  Link2,
} from "lucide-react";
import {
  ofKind,
  uid,
  entryId,
  today,
  displayDate,
  shiftDate,
  validateUpload,
} from "./domain";
import type {
  Snapshot,
  RecordItem,
  Notebook,
  Settings,
  AnyRecord,
} from "./domain";
import * as api from "./service";
import { NotebookIndex, ResearchTimeline } from "./components/NotebookViews";
import { EntryLabels } from "./components/Labels";
import { ColorSelector, validColor } from "./components/ColorSelector";
import { MarkdownHelp } from "./components/MarkdownHelp";
import { useRecords, useSave, useDraft, useNotebookDate } from "./hooks";
import { DraftStatus } from "./components/DraftStatus";
import { DailyEntry } from "./components/DailyEntry";
import { Splitter } from "./components/Splitter";
import { PaperTitle } from "./components/PaperTitle";
import { NoteVersions } from "./components/NoteVersions";
import { themeTokens, darkBackgrounds } from "./theme";
import { AuthGate } from "./components/AuthGate";
import type { EditorHandle } from "./components/Editor";
import { Empty, ErrorNotice, Modal, SubjectIcon } from "./components/UI";
import type { Selection } from "./components/PdfViewer";
const Editor = lazy(() =>
  import("./components/Editor").then((m) => ({ default: m.Editor })),
);
const PdfViewer = lazy(() =>
  import("./components/PdfViewer").then((m) => ({ default: m.PdfViewer })),
);
const AIPanel = lazy(() =>
  import("./components/AIPanel").then((m) => ({ default: m.AIPanel })),
);

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10000 } },
});
export default function App() {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Suspense
          fallback={
            <div className="loading-screen">Opening your workspace…</div>
          }
        >
          <AuthGate>
            <Workspace />
          </AuthGate>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
function Workspace() {
  const route = useLocation();
  const q = useRecords(),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [collapsed, setCollapsed] = useState(false);
  const records = q.data || [];
  const setting = ofKind(records, "settings")[0];
  const settings: Settings = setting?.data || {
    timezone: "America/Los_Angeles",
    theme: "dark",
  };
  const ns = ofKind(records, "notebook")
    .filter((n) => !n.data.archived)
    .sort((a, b) => a.data.order - b.data.order);
  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
    const style = document.documentElement.style;
    const tokens = themeTokens(settings);
    for (const key of [
      "--bg",
      "--text",
      "--muted",
      "--sidebar",
      "--surface",
      "--surface2",
      "--border",
      "--rhythm-empty",
      "--accent",
      "--accent-text",
    ]) {
      if (tokens[key]) style.setProperty(key, tokens[key]);
      else style.removeProperty(key);
    }
  }, [settings.theme, settings.mainColor, settings.accentColor]);
  useEffect(() => {
    if (q.data && !ofKind(q.data, "notebook").length)
      void api
        .initializeNotebooks()
        .then(() => q.refetch())
        .catch((e) => setError(e.message));
  }, [q.data]);
  return (
    <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>
      <aside className="app-sidebar">
        <Link to="/" className="brand" aria-label={`${APP_NAME} home`}>
          <BookOpen size={23} />
          <span>{APP_NAME}</span>
        </Link>

        <nav>
          {[
            [CalendarDays, "Today", "/"],
            [BookOpen, "Notebooks", "/notebooks"],
          ].map(([Icon, label, path]) => {
            const I = Icon as typeof CalendarDays;
            return (
              <NavLink
                aria-label={String(label)}
                key={String(path)}
                to={String(path)}
                end={path === "/"}
              >
                <I size={18} />
                <span>{String(label)}</span>
                {path === "/" && <span className="nav-dot" />}
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-subhead">
          <span>Quick Links</span>
        </div>
        <div className="notebook-nav">
          {ns.map((n) => (
            <NavLink key={n.id} to={`/notebooks/${n.id}`}>
              <span style={{ color: n.data.color }}>
                <SubjectIcon name={n.data.icon} size={17} />
              </span>
              <span>{n.data.name}</span>
            </NavLink>
          ))}
        </div>
        <div className="sidebar-bottom">
          <NavLink to="/settings" aria-label="Settings">
            <SettingsIcon size={17} />
            <span>Settings</span>
          </NavLink>
          <button
            className="profile"
            aria-label="Sign out"
            onClick={() => void api.signOut().catch((e) => setError(e.message))}
          >
            <span className="avatar">K</span>
            <span>
              {APP_NAME}
              <small>{api.demo ? "Sample workspace" : "Owner account"}</small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="row">
            <button
              className="icon-button"
              aria-label="Toggle sidebar"
              onClick={() => setCollapsed(!collapsed)}
            >
              <PanelLeft size={18} />
            </button>
          </div>
          <div className="row">
            <label className="search">
              <Search size={16} />
              <input
                aria-label="Search entries"
                placeholder="Search notes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  className="icon-button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </label>
          </div>
        </header>
        {api.demo && (
          <div className="preview-banner">
            DESIGN PREVIEW · Sample data is stored only in this browser. Hosted
            sync and AI require configuration.
          </div>
        )}
        <ErrorNotice error={error || q.error} />
        {q.isPending ? (
          <div className="loading-screen">Loading notes…</div>
        ) : search ? (
          <div className="page">
            <p className="eyebrow">SEARCH YOUR NOTEBOOKS</p>
            <h1>Search results</h1>
            <EntryList
              records={records}
              entries={ofKind(records, "entry").filter((e) =>
                (e.data.title + " " + e.data.markdown)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )}
              onNavigate={() => setSearch("")}
            />
          </div>
        ) : (
          <Routes>
            <Route
              path="/"
              element={
                <Today key="today" records={records} settings={settings} />
              }
            />
            <Route path="/history" element={<Navigate to="/" replace />} />
            <Route path="/help/markdown" element={<MarkdownHelp />} />
            <Route
              path="/notebooks/:id/pages"
              element={<NotebookIndex records={records} />}
            />
            <Route
              path="/notebooks"
              element={<Notebooks records={records} />}
            />
            <Route
              path="/notebooks/:id"
              element={
                <NotebookPage
                  key={route.pathname}
                  records={records}
                  settings={settings}
                />
              }
            />
            <Route
              path="/entries/:id"
              element={<EntryPage records={records} />}
            />
            <Route
              path="/papers"
              element={
                <Navigate
                  to={`/notebooks/${ns.find((n) => n.data.research)?.id || ""}`}
                  replace
                />
              }
            />
            <Route
              path="/papers/:id"
              element={
                <PaperPage
                  key={route.pathname}
                  records={records}
                  settings={settings}
                />
              }
            />
            <Route
              path="/settings"
              element={<SettingsPage records={records} settings={settings} />}
            />
            <Route
              path="*"
              element={
                <Empty title="Page not found.">
                  <Link to="/">Return to Today</Link>
                </Empty>
              }
            />
          </Routes>
        )}
      </div>
    </div>
  );
}
function EntryList({
  entries,
  records,
  onNavigate,
}: {
  entries: RecordItem<"entry">[];
  records: Snapshot;
  onNavigate?: () => void;
}) {
  return entries.length ? (
    <div className="entry-list">
      {entries
        .sort((a, b) => b.data.date.localeCompare(a.data.date))
        .map((e) => {
          const n = ofKind(records, "notebook").find(
            (n) => n.id === e.data.notebookId,
          );
          return (
            <Link
              onClick={onNavigate}
              to={
                e.data.paperId
                  ? `/papers/${e.data.paperId}?entry=${e.id}`
                  : `/entries/${e.id}`
              }
              key={e.id}
              className="entry-row"
            >
              <span className="entry-icon" style={{ color: n?.data.color }}>
                <SubjectIcon name={n?.data.icon} />
              </span>
              <div>
                <h3>{e.data.title || "Untitled note"}</h3>
                <p>
                  {e.data.markdown
                    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
                    .replace(/[#*>`\[\]]/g, "")
                    .slice(0, 105) || "Empty note"}
                </p>
                <span className="small muted">
                  {n?.data.name} <span className="sep">·</span>{" "}
                  {displayDate(e.data.date)}
                </span>
              </div>
              <ArrowUpRight size={18} />
            </Link>
          );
        })}
    </div>
  ) : (
    <Empty title="No entries yet.">Open a notebook to write.</Empty>
  );
}
function Today({
  records,
  settings,
}: {
  records: Snapshot;
  settings: Settings;
}) {
  const date = useNotebookDate(settings.timezone);
  const ns = ofKind(records, "notebook")
      .filter((n) => !n.data.archived)
      .sort((a, b) => a.data.order - b.data.order),
    entries = ofKind(records, "entry").filter((e) => e.data.date === date),
    life =
      ns.find((n) => n.id === settings.lifeNotebookId) ||
      ns.find((n) => n.data.name.toLowerCase() === "life"),
    activities = ofKind(records, "activity");
  const complete = activities.filter(
    (a) =>
      a.data.date === date &&
      a.data.completed &&
      ns.some((n) => n.id === a.data.notebookId),
  ).length;
  const days = Array.from({ length: 14 }, (_, i) => shiftDate(date, i - 13));
  return (
    <main className="page today-page">
      <h1>
        Today —{" "}
        {displayDate(date, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </h1>
      <div className="section-heading">
        <h2>Goals</h2>
        <span className="small muted">
          {complete} of {ns.length} completed
        </span>
      </div>
      <div className="goal-grid">
        {ns.map((n) => {
          const checked = activities.some(
            (a) =>
              a.data.date === date &&
              a.data.notebookId === n.id &&
              a.data.completed,
          );
          return (
            <Link
              to={`/notebooks/${n.id}`}
              className={`goal-card ${checked ? "checked" : ""}`}
              key={n.id}
              style={{ "--subject": n.data.color } as CSSProperties}
            >
              <div className="row between">
                <SubjectIcon name={n.data.icon} size={23} />
                <span
                  aria-label={checked ? "Completed" : "Write five new words"}
                >
                  {checked && <Check size={14} />}
                </span>
              </div>
              <h3>{n.data.name}</h3>
              <span className="goal-status">
                {checked ? "Completed" : "Write five new words"}
              </span>
            </Link>
          );
        })}
      </div>
      <section className="activity-section">
        <div className="section-heading">
          <h2>Activity</h2>
          <span className="small muted">
            {displayDate(days[0])} – {displayDate(date)}
          </span>
        </div>
        <div
          className="activity-scroll"
          role="region"
          aria-label="Activity for the last 14 days"
          tabIndex={0}
        >
          <table className="activity-table">
            <caption className="sr-only">
              Notebook completion over the last 14 days
            </caption>
            <colgroup>
              <col className="activity-name-column" />
              {days.map((d) => (
                <col key={d} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Notebook</th>
                {days.map((d) => (
                  <th
                    scope="col"
                    key={d}
                    className={d === date ? "activity-today" : ""}
                    aria-label={displayDate(d, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  >
                    <span>{displayDate(d, { weekday: "short" })}</span>
                    <strong>{displayDate(d, { day: "numeric" })}</strong>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ns.map((n) => (
                <tr key={n.id}>
                  <th scope="row">
                    <span>
                      <SubjectIcon name={n.data.icon} size={17} />
                      {n.data.name}
                    </span>
                  </th>
                  {days.map((d) => {
                    const completed = activities.some(
                      (a) =>
                        a.data.notebookId === n.id &&
                        a.data.date === d &&
                        a.data.completed,
                    );
                    const entry = ofKind(records, "entry").find(
                      (e) =>
                        e.data.notebookId === n.id &&
                        e.data.date === d &&
                        !e.data.paperId,
                    );
                    const study = ofKind(records, "study").some(
                      (r) => r.data.notebookId === n.id && r.data.date === d,
                    );
                    const href = n.data.research
                      ? study
                        ? `/notebooks/${n.id}#study-${d}`
                        : undefined
                      : entry
                        ? `/entries/${entry.id}`
                        : undefined;
                    const label = `${n.data.name}, ${displayDate(d, { month: "long", day: "numeric", year: "numeric" })}: ${completed ? "completed" : "not completed"}`;
                    const classes = `activity-cell${completed ? " filled" : ""}`;
                    return (
                      <td
                        key={d}
                        className={d === date ? "activity-today" : ""}
                      >
                        {href ? (
                          <Link
                            to={href}
                            aria-label={label}
                            title={label}
                            className={classes}
                          >
                            {completed && <Check size={14} />}
                          </Link>
                        ) : (
                          <span
                            role="img"
                            aria-label={label}
                            title={label}
                            className={classes}
                          >
                            {completed && <Check size={14} />}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <TimeCalculator key={date} date={date} />
      <div className="today-reflection">
        <section>
          <div className="section-heading">
            <h2>Reflection</h2>
          </div>
          <div className="reflection-card">
            {life ? (
              <DailyEntry
                key={`${life.id}:${date}`}
                records={records}
                notebook={life}
                date={date}
                compact
              />
            ) : (
              <p>Open Notebooks to add a Life notebook.</p>
            )}
          </div>
        </section>
      </div>
      <div className="section-heading">
        <h2>
          {date === today(settings.timezone)
            ? "Today’s pages"
            : "Pages from this day"}{" "}
          <span className="count">{entries.length}</span>
        </h2>
      </div>
      <EntryList records={records} entries={entries} />
    </main>
  );
}
function Notebooks({ records }: { records: Snapshot }) {
  const save = useSave(),
    [editing, setEditing] = useState<RecordItem<"notebook"> | null>(null),
    [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [icon, setIcon] = useState("reading"),
    [error, setError] = useState("");
  const ns = ofKind(records, "notebook").sort(
    (a, b) => a.data.order - b.data.order,
  );
  function edit(n?: RecordItem<"notebook">) {
    setEditing(n || null);
    setName(n?.data.name || "");
    setDescription(n?.data.description || "");
    setIcon(n?.data.icon || "reading");
    setOpen(true);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await save(
        "notebook",
        editing?.id || uid(),
        {
          ...(editing?.data || {
            color: "#f59a56",
            icon: "reading",
            order: Math.max(-1, ...ns.map((n) => n.data.order)) + 1,
            research: false,
            archived: false,
          }),
          name: name.trim(),
          description,
          icon,
        },
        editing?.revision || 0,
      );
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function update(n: RecordItem<"notebook">, data: Notebook) {
    try {
      await save("notebook", n.id, data, n.revision);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <main className="page">
      <div className="row between">
        <h1>Notebooks</h1>
        <button className="primary" onClick={() => edit()}>
          <Plus size={16} />
          New notebook
        </button>
      </div>

      <ErrorNotice error={error} />
      <div className="notebook-grid">
        {ns.map((n) => (
          <article
            className={`notebook-card ${n.data.archived ? "archived" : ""}`}
            key={n.id}
            style={{ "--subject": n.data.color } as CSSProperties}
          >
            <Link to={`/notebooks/${n.id}/pages`}>
              <div className="notebook-cover">
                <SubjectIcon name={n.data.icon} size={35} />
                <span className="eyebrow">
                  {n.data.archived ? "ARCHIVED" : "NOTEBOOK"}
                </span>
                <h2>{n.data.name}</h2>
              </div>
            </Link>
            <div className="notebook-info">
              {![
                "Follow an idea all the way through.",
                "Understand how the pieces fit.",
                "Look a little closer.",
                "Good sentences. New perspectives.",
                "Make space to move.",
              ].includes(n.data.description) && <p>{n.data.description}</p>}
              <span className="small muted">
                {
                  ofKind(records, "entry").filter(
                    (e) => e.data.notebookId === n.id,
                  ).length
                }{" "}
                entries
              </span>
              <div className="row notebook-actions">
                <button onClick={() => edit(n)}>Edit</button>
                <button
                  className="icon-button"
                  aria-label={`${n.data.archived ? "Restore" : "Archive"} ${n.data.name}`}
                  onClick={() =>
                    void update(n, { ...n.data, archived: !n.data.archived })
                  }
                >
                  {n.data.archived ? (
                    <RotateCcw size={15} />
                  ) : (
                    <Archive size={15} />
                  )}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Edit notebook" : "A new notebook"}
        description="Name and describe this notebook."
      >
        <form onSubmit={submit}>
          <label className="field">
            Name
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            A short description
            <input
              maxLength={150}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <fieldset className="icon-picker">
            <legend>Notebook icon</legend>
            {["reading", "science", "system", "art", "gym", "code", "life"].map(
              (value) => (
                <button
                  type="button"
                  key={value}
                  aria-label={`${value} icon`}
                  aria-pressed={icon === value}
                  onClick={() => setIcon(value)}
                >
                  <SubjectIcon name={value} />
                </button>
              ),
            )}
          </fieldset>
          <button className="primary" disabled={!name.trim()}>
            Save notebook
          </button>
        </form>
      </Modal>
    </main>
  );
}
function NotebookPage({
  records,
  settings,
}: {
  records: Snapshot;
  settings: Settings;
}) {
  const { id } = useParams();
  const date = useNotebookDate(settings.timezone);
  const [params] = useSearchParams();
  const notebook = ofKind(records, "notebook").find((n) => n.id === id);
  if (!notebook)
    return (
      <Empty title="Notebook not found">
        <Link to="/notebooks">Notebooks</Link>
      </Empty>
    );
  if (notebook.data.research)
    return <Papers records={records} notebook={notebook} />;
  const legacy = ofKind(records, "entry").find(
    (e) =>
      e.id === params.get("entry") &&
      e.data.notebookId === notebook.id &&
      !e.data.paperId,
  );
  if (legacy) return <Navigate to={`/entries/${legacy.id}`} replace />;
  return (
    <main className="page daily-page">
      <div className="row between">
        <h1>{notebook.data.name}</h1>
        <Link to={`/notebooks/${notebook.id}/pages`}>All pages</Link>
      </div>
      <p className="entry-date">
        {displayDate(date, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </p>
      <DailyEntry
        key={`${notebook.id}:${date}`}
        notebook={notebook}
        records={records}
        date={date}
      />
    </main>
  );
}
function EntryPage({ records }: { records: Snapshot }) {
  const { id } = useParams(),
    record = records.find((e) => e.kind === "entry" && e.id === id) as
      RecordItem<"entry"> | undefined;
  if (record?.data.mergedInto)
    return <Navigate to={`/entries/${record.data.mergedInto}`} replace />;
  if (record?.data.paperId)
    return <Navigate to={`/papers/${record.data.paperId}`} replace />;
  return record && !record.deleted_at ? (
    <main className="page daily-page">
      <Link to={`/notebooks/${record.data.notebookId}/pages`}>
        Back to pages
      </Link>
      <h1>
        {ofKind(records, "notebook").find(
          (n) => n.id === record.data.notebookId,
        )?.data.name || "Notebook"}
      </h1>
      <p className="entry-date">
        {displayDate(record.data.date, {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </p>
      <EntryWriting key={record.id} record={record} records={records} />
    </main>
  ) : (
    <Empty title="Entry not found.">It may be in Trash in Settings.</Empty>
  );
}
export function EntryWriting({
  record,
  records,
  editorRef,
}: {
  record: RecordItem<"entry">;
  records: Snapshot;
  editorRef?: React.RefObject<EditorHandle | null>;
}) {
  const draft = useDraft(record),
    nav = useNavigate(),
    [error, setError] = useState("");
  function source(id: string) {
    const a = ofKind(records, "annotation").find((a) => a.id === id);
    if (a) nav(`/papers/${a.data.paperId}?entry=${record.id}&annotation=${id}`);
    else
      setError("The source annotation is missing. Restore it from a backup.");
  }
  return (
    <div className="entry-writing">
      <EntryLabels
        value={draft.value}
        records={records}
        onChange={draft.change}
      />
      {!record.data.paperId && (
        <input
          className="entry-title"
          aria-label="Entry title"
          placeholder="Title (optional)"
          value={draft.value.title}
          onChange={(e) =>
            draft.change({ ...draft.value, title: e.target.value })
          }
        />
      )}
      <Editor
        ref={editorRef}
        records={records}
        value={draft.value.markdown}
        onChange={(markdown) => draft.change({ ...draft.value, markdown })}
        onAnnotation={source}
        onUpload={async (file) => {
          const a = await api.upload(file);
          await client.invalidateQueries({ queryKey: ["records"] });
          return a.id;
        }}
      />
      <div className="row between entry-bottom">
        <DraftStatus draft={draft} />
        <span className="small muted">
          {draft.value.markdown.trim().split(/\s+/).filter(Boolean).length}{" "}
          words · Markdown
        </span>
      </div>
      {record.revision > 0 && (
        <NoteVersions
          record={record}
          records={records}
          onRestore={(markdown) => draft.change({ ...draft.value, markdown })}
        />
      )}
      <ErrorNotice error={error} />
    </div>
  );
}
function Papers({
  records,
  notebook,
}: {
  records: Snapshot;
  notebook: RecordItem<"notebook">;
}) {
  const save = useSave(),
    input = useRef<HTMLInputElement>(null),
    nav = useNavigate(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      validateUpload(file, true);
      const buffer = await file.arrayBuffer();
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const existing = ofKind(records, "paper").find(
        (p) => p.data.fingerprint === digest,
      );
      if (existing) {
        nav("/papers/" + existing.id);
        return;
      }
      const { pdfjs } = await import("./components/PdfViewer");
      const task = pdfjs.getDocument({ data: buffer.slice(0) });
      const doc = await task.promise;
      const pages = doc.numPages;
      await task.destroy();
      const asset = await api.upload(file);
      const p = await save("paper", uid(), {
        title: file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " "),
        assetId: asset.id,
        fingerprint: digest,
        pages,
      });
      await client.invalidateQueries({ queryKey: ["records"] });
      nav(`/papers/${p.id}?notebook=${notebook.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page">
      <div className="row between">
        <h1>Research papers</h1>
        <button
          className="primary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Plus size={16} />
          {busy ? "Opening paper…" : "Add a paper"}
        </button>
      </div>

      <input
        ref={input}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          if (e.target.files?.[0]) void upload(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <ErrorNotice error={error} />
      <Link to={`/notebooks/${notebook.id}/pages`}>All papers & labels</Link>
      <ResearchTimeline records={records} notebookId={notebook.id} />
      {!ofKind(records, "paper").length && (
        <div
          className="upload-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files[0]) void upload(e.dataTransfer.files[0]);
          }}
        >
          <Files size={36} strokeWidth={1} />
          <h2>Add a PDF</h2>
          <p className="muted">
            Drop a PDF here, or choose one from your computer.
          </p>
          <button onClick={() => input.current?.click()}>Choose PDF</button>
          <p className="small muted">
            Up to 25 MB · Stored privately · Text and region selection
          </p>
        </div>
      )}
    </main>
  );
}
function PaperPage({
  records,
  settings,
}: {
  records: Snapshot;
  settings: Settings;
}) {
  const location = useLocation();
  const { id } = useParams(),
    [params, setParams] = useSearchParams(),
    save = useSave(),
    ref = useRef<EditorHandle>(null),
    [ai, setAI] = useState<{
      annotation: RecordItem<"annotation">;
      context: string;
    }>(),
    [error, setError] = useState(""),
    [split, setSplit] = useState(
      () => Number(localStorage.getItem("kais-journal:split")) || 50,
    ),
    [pane, setPane] = useState("both");
  const paper = ofKind(records, "paper").find((p) => p.id === id),
    entries = ofKind(records, "entry")
      .filter((e) => e.data.paperId === id)
      .sort((a, b) => b.data.date.localeCompare(a.data.date)),
    entry = entries.find((e) => e.id === params.get("entry")) || entries[0],
    annotation = ofKind(records, "annotation").find(
      (a) => a.id === params.get("annotation"),
    );
  const notebooks = ofKind(records, "notebook");
  const notebook =
    notebooks.find((n) => n.id === entry?.data.notebookId) ||
    notebooks.find((n) => n.data.research && n.id === params.get("notebook")) ||
    notebooks.find((n) => n.data.research);
  const studyDate = useNotebookDate(settings.timezone);
  useEffect(() => {
    if (notebook && paper)
      void api
        .recordStudy(notebook.id, paper.id, studyDate)
        .then(() => client.invalidateQueries({ queryKey: ["records"] }))
        .catch((e) => setError(e.message));
  }, [notebook?.id, paper?.id, studyDate]);
  const [blankId, setBlankId] = useState("");
  useEffect(() => {
    let active = true;
    void entryId(`paper:${id}`).then((next) => {
      if (active) setBlankId(next);
    });
    return () => {
      active = false;
    };
  }, [id]);
  const blank: RecordItem<"entry"> | undefined =
    notebook && paper && blankId
      ? {
          id: blankId,
          kind: "entry",
          revision: 0,
          updated_at: "",
          deleted_at: null,
          data: {
            paperId: paper.id,
            notebookId: notebook.id,
            date: today(settings.timezone),
            title: paper.data.title,
            markdown: "",
          },
        }
      : undefined;
  const note = entry || blank;
  async function selection(s: Selection, explain: boolean) {
    setError("");
    let imageAssetId: string | undefined;
    if (s.image) {
      const image = await api.upload(
        new File([s.image], `page-${s.page + 1}-region.png`, {
          type: "image/png",
        }),
      );
      imageAssetId = image.id;
      await client.invalidateQueries({ queryKey: ["records"] });
    }
    const a = await save("annotation", uid(), {
      paperId: id!,
      page: s.page,
      text: s.text,
      rects: s.rects,
      kind: s.kind,
      imageAssetId,
    });
    if (explain) setAI({ annotation: a, context: s.context });
    else if (note) {
      ref.current?.insert(
        `\n[${s.kind === "region" ? "Figure or equation" : s.text.slice(0, 70).replace(/[\[\]\\]/g, "")} · p. ${s.page + 1}](annotation:${a.id})\n${imageAssetId ? `\n![Selected PDF region](asset:${imageAssetId})\n` : ""}`,
      );
    } else setError("Reference saved. Open the notes pane to insert it.");
    setParams((p) => {
      p.set("annotation", a.id);
      return p;
    });
  }
  if (!paper)
    return (
      <Empty title="Paper not found.">
        <Link to="/papers">Return to papers</Link>
      </Empty>
    );
  return (
    <main className="science-page">
      <div className="science-heading">
        <div className="row">
          <Link
            to="/papers"
            className="icon-button"
            aria-label="Back to paper library"
          >
            <ArrowLeft size={17} />
          </Link>
          <PaperTitle paper={paper} />
        </div>
        <button
          className="text-button narrow-pane-toggle"
          onClick={() => setPane(pane === "pdf" ? "notes" : "pdf")}
        >
          {pane === "pdf" ? "Show notes" : "Show PDF"}
        </button>
      </div>
      <ErrorNotice error={error} />
      <div
        className={`science-workspace pane-${pane} ${ai ? "with-ai" : ""}`}
        style={{ "--split": `${split}%` } as CSSProperties}
      >
        <div className="science-pdf">
          <PdfViewer
            paper={paper}
            expanded={pane === "pdf"}
            onToggleExpand={() => setPane(pane === "pdf" ? "both" : "pdf")}
            records={records}
            activeAnnotation={annotation}
            focusKey={location.key}
            onSelect={selection}
          />
        </div>
        <Splitter
          value={split}
          onChange={(value) => {
            setSplit(value);
            localStorage.setItem("kais-journal:split", String(value));
          }}
        />
        <section className="science-notes">
          {note && (
            <EntryWriting
              key={note.id}
              record={note}
              records={records}
              editorRef={ref}
            />
          )}
          {annotation && (
            <div className="annotation-actions">
              <span className="small muted">
                Selected source · page {annotation.data.page + 1}
              </span>
              <button
                disabled={!note}
                onClick={() =>
                  ref.current?.insert(
                    `\n[Source · page ${annotation.data.page + 1}](annotation:${annotation.id})\n`,
                  )
                }
              >
                <Link2 size={14} />
                Insert link
              </button>
              <button onClick={() => setAI({ annotation, context: "" })}>
                <Sparkles size={14} />
                Explain
              </button>
            </div>
          )}
        </section>
        {ai && (
          <AIPanel
            key={ai.annotation.id}
            annotation={ai.annotation}
            context={ai.context}
            records={records}
            onClose={() => setAI(undefined)}
            onInsert={(text) => {
              if (!note) {
                setError("Open a paper before inserting an explanation.");
                return;
              }
              ref.current?.insert(text);
            }}
          />
        )}
      </div>
    </main>
  );
}
function SettingsPage({
  records,
  settings,
}: {
  records: Snapshot;
  settings: Settings;
}) {
  const save = useSave(),
    setting = ofKind(records, "settings")[0],
    [tz, setTz] = useState(settings.timezone),
    [mainColor, setMainColor] = useState(settings.mainColor || "#1c1d20"),
    [accentColor, setAccentColor] = useState(settings.accentColor || "#e8b68a"),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    file = useRef<HTMLInputElement>(null),
    query = useQueryClient();
  const budget = useQuery({ queryKey: ["usage"], queryFn: api.usage });
  async function timezone() {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz }).format();
      await save(
        "settings",
        setting?.id || uid(),
        { ...settings, timezone: tz },
        setting?.revision || 0,
      );
      setMessage("Timezone saved. Existing entry dates are unchanged.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function backup() {
    setBusy(true);
    setError("");
    try {
      if (
        Object.keys(localStorage).some((k) =>
          k.startsWith(api.recoveryPrefix),
        ) ||
        hasUnsyncedWorkTime(localStorage, api.demo ? "preview" : "owner")
      )
        throw new Error(
          "Some edits or hours still need saving or conflict review. Open Today to finish hours sync, then resolve remaining drafts before exporting.",
        );
      await (await import("./backup")).exportArchive(await api.list());
      setMessage("Export downloaded. Keep it somewhere private.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function restore(f: File) {
    setBusy(true);
    setError("");
    try {
      const count = await (await import("./backup")).restoreArchive(f);
      await query.invalidateQueries({ queryKey: ["records"] });
      setMessage(
        `Restored ${count} records as new copies. Existing notes were preserved.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page settings-page">
      <h1>Settings</h1>
      <ErrorNotice error={error} />
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
      <section className="settings-card">
        <h2>Appearance</h2>
        <div className="row">
          <ColorSelector
            label="Main color"
            value={
              darkBackgrounds.includes(mainColor)
                ? mainColor
                : darkBackgrounds[0]
            }
            onChange={setMainColor}
            background
          />
          <ColorSelector
            label="Accent color"
            value={accentColor}
            onChange={setAccentColor}
            accent
          />
          <button
            disabled={!validColor(accentColor)}
            onClick={() =>
              void save(
                "settings",
                setting?.id || uid(),
                { ...settings, mainColor, accentColor },
                setting?.revision || 0,
              )
                .then(() => setMessage("Colors saved."))
                .catch((e) => setError(e.message))
            }
          >
            Save colors
          </button>
          <button
            onClick={() => {
              setMainColor("#1c1d20");
              setAccentColor("#e8b68a");
              void save(
                "settings",
                setting?.id || uid(),
                { ...settings, mainColor: undefined, accentColor: undefined },
                setting?.revision || 0,
              )
                .then(() => setMessage("Default colors restored."))
                .catch((e) => setError(e.message));
            }}
          >
            Reset colors
          </button>
        </div>
      </section>
      <section className="settings-card">
        <h2>Your notebook day</h2>
        <p className="muted">
          Today follows your timezone. Entry dates are assigned automatically.
        </p>
        <div className="row">
          <input
            aria-label="Notebook timezone"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            list="timezones"
          />
          <datalist id="timezones">
            {Intl.supportedValuesOf("timeZone").map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <button onClick={() => void timezone()}>Save timezone</button>
        </div>
      </section>
      <section className="settings-card">
        <h2>AI usage</h2>
        <p className="muted">
          Explanations and diagrams share a $20 monthly API ceiling. No
          background generation.
        </p>
        <ErrorNotice error={budget.error} />
        {budget.data && (
          <>
            <div className="budget-number">
              ${(budget.data.spent / 1e6).toFixed(3)}{" "}
              <span>of $20 this month</span>
            </div>
            <progress
              value={budget.data.spent + budget.data.reserved}
              max={budget.data.limit}
            />
            <p className="small muted">
              ${(budget.data.reserved / 1e6).toFixed(3)} reserved for requests
              awaiting reconciliation · {budget.data.month} UTC
            </p>
          </>
        )}
      </section>
      <section className="settings-card">
        <h2>Export and restore</h2>
        <p className="muted">
          Export Markdown, images, PDFs, source links, and metadata in one ZIP.
          Restore adds new copies without overwriting existing notes.
        </p>
        <div className="row">
          <button disabled={busy} onClick={() => void backup()}>
            <Download size={16} />
            Export archive
          </button>
          <button disabled={busy} onClick={() => file.current?.click()}>
            <Upload size={16} />
            Restore archive
          </button>
          <input
            hidden
            ref={file}
            type="file"
            accept=".zip"
            onChange={(e) => {
              if (e.target.files?.[0]) void restore(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </div>
        {busy && <p className="muted">Working with your archive…</p>}
      </section>
      <section className="settings-card">
        <h2>Trash</h2>
        <p className="muted">Deleted entries can be restored for 30 days.</p>
        {records
          .filter((r) => r.deleted_at && r.kind === "entry")
          .map((r) => (
            <div className="row between trash-row" key={r.id}>
              <span>
                {(r.data as { title: string }).title || "Untitled entry"}
              </span>
              <button
                onClick={() =>
                  void save(r.kind, r.id, r.data, r.revision, null).catch((e) =>
                    setError(e.message),
                  )
                }
              >
                <RotateCcw size={15} />
                Restore
              </button>
            </div>
          ))}
      </section>
      <p className="small muted">{APP_NAME}</p>
    </main>
  );
}
