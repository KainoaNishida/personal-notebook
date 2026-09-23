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
  Sun,
  Moon,
  PanelLeft,
  BookOpen,
  CalendarDays,
  Files,
  Settings as SettingsIcon,
  LogOut,
  Check,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Archive,
  RotateCcw,
  Download,
  Upload,
  Trash2,
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
import { useRecords, useSave, useDraft } from "./hooks";
import { DraftStatus } from "./components/DraftStatus";
import { DailyEntry } from "./components/DailyEntry";
import { Splitter } from "./components/Splitter";
import { PaperTitle } from "./components/PaperTitle";
import { NoteVersions } from "./components/NoteVersions";
import { themeTokens } from "./theme";
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
    save = useSave(),
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
    document.documentElement.dataset.theme = settings.theme;
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
  async function theme() {
    try {
      await save(
        "settings",
        setting?.id || uid(),
        { ...settings, theme: settings.theme === "dark" ? "light" : "dark" },
        setting?.revision || 0,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className={`app-shell ${collapsed ? "collapsed" : ""}`}>
      <aside className="app-sidebar">
        <Link to="/" className="brand" aria-label="Kai’s Journal home">
          <BookOpen size={23} />
          <span>Kai’s Journal</span>
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
          <span>NOTEBOOKS</span>
          <Link to="/notebooks" aria-label="Manage notebooks">
            <Plus size={15} />
          </Link>
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
              Kai’s Journal
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
            <button
              className="icon-button"
              aria-label="Toggle color theme"
              onClick={() => void theme()}
            >
              {settings.theme === "dark" ? (
                <Sun size={17} />
              ) : (
                <Moon size={17} />
              )}
            </button>
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
                  to={`/notebooks/${ns.find((n) => n.data.icon === "science")?.id || ""}`}
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
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
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
  const [date, setDate] = useState(today(settings.timezone)),
    save = useSave(),
    [error, setError] = useState("");
  const ns = ofKind(records, "notebook")
      .filter((n) => !n.data.archived)
      .sort((a, b) => a.data.order - b.data.order),
    entries = ofKind(records, "entry").filter((e) => e.data.date === date),
    life =
      ns.find((n) => n.id === settings.lifeNotebookId) ||
      ns.find((n) => n.data.name.toLowerCase() === "life"),
    activities = ofKind(records, "activity");
  const complete = activities.filter(
    (a) => a.data.date === date && a.data.completed,
  ).length;
  const days = Array.from({ length: 14 }, (_, i) => shiftDate(date, i - 13));
  async function toggle(n: RecordItem<"notebook">) {
    const old = activities.find(
      (a) => a.data.date === date && a.data.notebookId === n.id,
    );
    try {
      await save(
        "activity",
        old?.id || uid(),
        { date, notebookId: n.id, completed: !old?.data.completed },
        old?.revision || 0,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <main className="page today-page">
      <div className="row between page-top">
        <div className="eyebrow">
          {displayDate(date, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          }).toUpperCase()}
        </div>
        <div className="date-picker">
          <button
            aria-label="Previous day"
            className="icon-button"
            onClick={() => setDate(shiftDate(date, -1))}
          >
            <ChevronLeft size={15} />
          </button>
          <input
            type="date"
            aria-label="Journal date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          <button
            aria-label="Next day"
            className="icon-button"
            onClick={() => setDate(shiftDate(date, 1))}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
      <h1>Today</h1>
      <ErrorNotice error={error} />
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
            <div
              className={`goal-card ${checked ? "checked" : ""}`}
              key={n.id}
              style={{ "--subject": n.data.color } as CSSProperties}
            >
              <div className="row between">
                <SubjectIcon name={n.data.icon} size={23} />
                <button
                  className="goal-check"
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={`Mark ${n.data.name} complete`}
                  onClick={() => void toggle(n)}
                >
                  {checked && <Check size={14} />}
                </button>
              </div>
              <Link to={`/notebooks/${n.id}`}>
                <h3>{n.data.name}</h3>
              </Link>
              <span className="goal-status">
                {checked ? "Completed" : "Not marked complete"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="today-columns">
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
        <section className="rhythm">
          <div className="section-heading">
            <h2>Activity</h2>
            <span className="small muted">14 days</span>
          </div>
          <div className="rhythm-card">
            {ns.map((n) => (
              <div className="rhythm-row" key={n.id}>
                <span title={n.data.name} style={{ color: n.data.color }}>
                  <SubjectIcon name={n.data.icon} size={15} />
                </span>
                {days.map((d) => {
                  const yes = activities.some(
                    (a) =>
                      a.data.date === d &&
                      a.data.notebookId === n.id &&
                      a.data.completed,
                  );
                  return (
                    <button
                      key={d}
                      title={`${n.data.name}, ${displayDate(d)}: ${yes ? "completed" : "not marked"}`}
                      aria-label={`${n.data.name}, ${d}: ${yes ? "completed" : "not marked"}`}
                      className={yes ? "rhythm-cell filled" : "rhythm-cell"}
                      style={yes ? { background: "var(--accent)" } : undefined}
                      onClick={() => setDate(d)}
                    />
                  );
                })}
              </div>
            ))}
            <div className="rhythm-caption">
              <span>{displayDate(days[0])}</span>
              <span>{displayDate(date)}</span>
            </div>
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
    [error, setError] = useState("");
  const ns = ofKind(records, "notebook").sort(
    (a, b) => a.data.order - b.data.order,
  );
  function edit(n?: RecordItem<"notebook">) {
    setEditing(n || null);
    setName(n?.data.name || "");
    setDescription(n?.data.description || "");
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
            order: ns.length,
            archived: false,
          }),
          name: name.trim(),
          description,
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
  async function reorder(n: RecordItem<"notebook">, delta: number) {
    const i = ns.findIndex((x) => x.id === n.id),
      other = ns[i + delta];
    if (!other) return;
    await update(other, { ...other.data, order: n.data.order });
    await update(n, { ...n.data, order: other.data.order });
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
            <Link to={`/notebooks/${n.id}`}>
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
                  aria-label={`Move ${n.data.name} up`}
                  onClick={() => void reorder(n, -1)}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Move ${n.data.name} down`}
                  onClick={() => void reorder(n, 1)}
                >
                  <ArrowDown size={15} />
                </button>
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
  const notebook = ofKind(records, "notebook").find((n) => n.id === id);
  const [date, setDate] = useState(today(settings.timezone));
  if (!notebook)
    return (
      <Empty title="Notebook not found">
        <Link to="/notebooks">Notebooks</Link>
      </Empty>
    );
  if (notebook.data.icon === "science") return <Papers records={records} />;
  const entries = ofKind(records, "entry").filter(
    (e) => e.data.notebookId === id && !e.data.paperId,
  );
  return (
    <main className="page writing-page">
      <Link className="back-link" to="/notebooks">
        <ArrowLeft size={14} />
        Notebooks
      </Link>
      <div className="row between">
        <h1>{notebook.data.name}</h1>
        <label className="field">
          View day
          <input
            type="date"
            aria-label="View notebook day"
            max={today(settings.timezone)}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
      </div>
      <DailyEntry
        key={`${id}:${date}`}
        records={records}
        notebook={notebook}
        date={date}
      />
      <details className="previous-entries">
        <summary>
          Previous entries ({entries.filter((e) => e.data.date !== date).length}
          )
        </summary>
        <EntryList
          records={records}
          entries={entries.filter((e) => e.data.date !== date)}
        />
      </details>
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
    <main className="page writing-page">
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
    save = useSave(),
    nav = useNavigate(),
    [error, setError] = useState("");
  const n = ofKind(records, "notebook").find(
    (n) => n.id === record.data.notebookId,
  );
  function source(id: string) {
    const a = ofKind(records, "annotation").find((a) => a.id === id);
    if (a) nav(`/papers/${a.data.paperId}?entry=${record.id}&annotation=${id}`);
    else
      setError("The source annotation is missing. Restore it from a backup.");
  }
  async function trash() {
    try {
      await draft.flush();
      if (api.hasRecovery(record.id))
        throw new Error(
          "Save or resolve this draft before moving it to trash.",
        );
      const all = await api.list();
      const latest = ofKind(all, "entry").find((e) => e.id === record.id);
      if (latest)
        await save(
          "entry",
          latest.id,
          latest.data,
          latest.revision,
          new Date().toISOString(),
        );
      nav("/notebooks/" + record.data.notebookId);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="entry-writing">
      {!record.data.paperId && (
        <div className="row between entry-breadcrumb">
          <Link
            to={`/notebooks/${record.data.notebookId}`}
            className="subject-label"
            style={{ color: n?.data.color }}
          >
            <SubjectIcon name={n?.data.icon} size={15} />
            {n?.data.name || "Notebook"}
          </Link>
          <div className="row">
            <span className="small muted">
              {displayDate(draft.value.date, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <button
              className="icon-button"
              aria-label="Move entry to trash"
              onClick={() => void trash()}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      )}
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
function Papers({ records }: { records: Snapshot }) {
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
      nav("/papers/" + p.id);
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
      <div className="paper-grid">
        {ofKind(records, "paper").map((p) => (
          <Link className="paper-card" to={"/papers/" + p.id} key={p.id}>
            <div className="paper-illustration">
              <span>RESEARCH PAPER</span>
              <div />
              <div />
              <div className="short" />
              <div />
              <div />
              <Files size={35} strokeWidth={1} />
            </div>
            <div>
              <span className="eyebrow">{p.data.pages} PAGES</span>
              <h2>{p.data.title}</h2>
              <p className="muted small">
                {
                  ofKind(records, "entry").filter(
                    (e) => e.data.paperId === p.id,
                  ).length
                }{" "}
                notes
              </p>
            </div>
            <ArrowUpRight size={18} />
          </Link>
        ))}
      </div>
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
  const notebook = ofKind(records, "notebook").find(
    (n) => n.data.icon === "science",
  );
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
    [mainColor, setMainColor] = useState(settings.mainColor || "#18181b"),
    [accentColor, setAccentColor] = useState(settings.accentColor || "#f59a56"),
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
      setMessage("Timezone saved. Existing journal dates are unchanged.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function backup() {
    setBusy(true);
    setError("");
    try {
      if (
        Object.keys(localStorage).some((k) => k.startsWith(api.recoveryPrefix))
      )
        throw new Error(
          "Some edits still need saving or conflict review. Resolve them before exporting so the archive includes your latest writing.",
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
          <label className="field">
            Main color
            <input
              aria-label="Main color"
              type="color"
              value={mainColor}
              onChange={(e) => setMainColor(e.target.value)}
            />
          </label>
          <label className="field">
            Accent color
            <input
              aria-label="Accent color"
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
            />
          </label>
          <button
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
              setMainColor("#18181b");
              setAccentColor("#f59a56");
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
        <h2>Your journal day</h2>
        <p className="muted">
          Today follows your timezone. Entry dates are assigned automatically.
        </p>
        <div className="row">
          <input
            aria-label="Journal timezone"
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
      <p className="small muted">Kai’s Journal</p>
    </main>
  );
}
