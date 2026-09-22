import { useEffect, useRef, useState, lazy, Suspense } from "react";
import type { CSSProperties, FormEvent } from "react";
import {
  BrowserRouter,
  NavLink,
  Link,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
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
  History,
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
  Sprout,
  Sparkles,
  Link2,
} from "lucide-react";
import {
  ofKind,
  uid,
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
          <AuthGate />
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
function AuthGate() {
  const [ready, setReady] = useState(api.demo),
    [signed, setSigned] = useState(api.demo),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (api.demo) return;
    void api
      .getSession()
      .then((s) => {
        setSigned(!!s);
        setReady(true);
      })
      .catch((e) => {
        setError(e.message);
        setReady(true);
      });
    const sub = api.supabase?.auth.onAuthStateChange((_e, s) => {
      setSigned(!!s);
      if (!s) client.clear();
    });
    return () => sub?.data.subscription.unsubscribe();
  }, []);
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.signIn(email, password);
      setPassword("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!ready)
    return <div className="loading-screen">Opening your commonplace…</div>;
  if (signed) return <Workspace />;
  return (
    <div className="login">
      <div className="login-story">
        <div className="brand">
          <BookOpen size={26} />
          <span>
            commonplace<span className="brand-dot">.</span>
          </span>
        </div>
        <p className="eyebrow">A PRIVATE PLACE TO RETURN TO</p>
        <h1>
          A little more curious.
          <br />A little, every day.
        </h1>
        <p>
          Your ideas, your questions, your small discoveries.
          <br />A notebook for a life in progress.
        </p>
        <div className="login-art">
          <span />
          <span />
          <span />
        </div>
        <small>WRITE · EXPLORE · REFLECT</small>
      </div>
      <div className="login-form">
        <Sprout size={28} />
        <h2>Welcome back.</h2>
        <p className="muted">A quiet space for what you’re learning.</p>
        {api.configured ? (
          <form onSubmit={login}>
            <label className="field">
              Email
              <input
                required
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="field">
              Password
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <ErrorNotice error={error} />
            <button className="primary wide" disabled={busy}>
              {busy ? "Signing in…" : "Open my notebook"}
              <ArrowUpRight size={16} />
            </button>
            <p className="small muted">
              Single-owner workspace. Public registration is closed.
            </p>
          </form>
        ) : (
          <div className="context-card">
            <h3>Your workspace is ready to connect.</h3>
            <p className="muted">
              Configure the private backend to enable sign-in, sync, and your
              notebooks. See the deployment guide in this repository.
            </p>
            <p className="small muted">
              No private data or shared password is included in this
              application.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
function Workspace() {
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
  }, [settings.theme]);
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
        <Link to="/" className="brand" aria-label="Commonplace home">
          <BookOpen size={23} />
          <span>
            commonplace<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="space-label">YOUR PERSONAL SPACE</div>
        <nav>
          {[
            [CalendarDays, "Today", "/"],
            [BookOpen, "Notebooks", "/notebooks"],
            [Files, "Papers", "/papers"],
            [History, "History", "/history"],
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
          <div className="private-label">
            <span className="status-dot" />{" "}
            {api.demo ? "Local design preview" : "Private · just for you"}
          </div>
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
              Your commonplace
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
            <span className="topbar-label">A little, every day.</span>
          </div>
          <div className="row">
            <label className="search">
              <Search size={16} />
              <input
                aria-label="Search entries"
                placeholder="Find a thought…"
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
          <div className="loading-screen">Gathering your notes…</div>
        ) : search ? (
          <div className="page">
            <p className="eyebrow">SEARCH YOUR NOTEBOOKS</p>
            <h1>Finding a thought.</h1>
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
            <Route
              path="/history"
              element={
                <Today
                  key="history"
                  records={records}
                  settings={settings}
                  history
                />
              }
            />
            <Route
              path="/notebooks"
              element={<Notebooks records={records} />}
            />
            <Route
              path="/notebooks/:id"
              element={<NotebookPage records={records} settings={settings} />}
            />
            <Route
              path="/entries/:id"
              element={<EntryPage records={records} />}
            />
            <Route path="/papers" element={<Papers records={records} />} />
            <Route
              path="/papers/:id"
              element={<PaperPage records={records} settings={settings} />}
            />
            <Route
              path="/settings"
              element={<SettingsPage records={records} settings={settings} />}
            />
            <Route
              path="*"
              element={
                <Empty title="This page wandered off.">
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
                <h3>{e.data.title || "Untitled thought"}</h3>
                <p>
                  {e.data.markdown.replace(/[#*>`\[\]]/g, "").slice(0, 105) ||
                    "A fresh page, ready when you are."}
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
    <Empty title="Room for your next thought.">
      Create an entry in any notebook to begin.
    </Empty>
  );
}
function Today({
  records,
  settings,
  history = false,
}: {
  records: Snapshot;
  settings: Settings;
  history?: boolean;
}) {
  const [date, setDate] = useState(today(settings.timezone)),
    save = useSave(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const ns = ofKind(records, "notebook")
      .filter((n) => !n.data.archived)
      .sort((a, b) => a.data.order - b.data.order),
    entries = ofKind(records, "entry").filter((e) => e.data.date === date),
    day = ofKind(records, "day").find((d) => d.data.date === date),
    activities = ofKind(records, "activity");
  const complete = activities.filter(
    (a) => a.data.date === date && a.data.completed,
  ).length;
  const days = Array.from({ length: 14 }, (_, i) => shiftDate(date, i - 13));
  const nav = useNavigate();
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
  async function reflect() {
    setBusy(true);
    try {
      await save("day", uid(), { date, markdown: "" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function newEntry() {
    if (!ns.length) return;
    try {
      const e = await save("entry", uid(), {
        notebookId: ns[0].id,
        date,
        title: "",
        markdown: "",
      });
      nav(`/entries/${e.id}`);
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
      <div className="hero row between">
        <div>
          <h1>
            {history ? "A record of small things." : "Make room for curiosity."}
          </h1>
          <p className="lede">
            No perfect days. Just a place to notice what matters.
          </p>
        </div>
        <div className="hero-symbol" aria-hidden="true">
          <Sprout size={64} strokeWidth={0.65} />
          <span>GROW AT YOUR OWN PACE</span>
        </div>
      </div>
      <ErrorNotice error={error} />
      <div className="section-heading">
        <h2>A little of what you love</h2>
        <span className="small muted">
          {complete} of {ns.length} explored <span className="sep">/</span> no
          pressure
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
                <p>{n.data.description}</p>
              </Link>
              <span className="goal-status">
                {checked ? "A little progress today" : "Whenever you’re ready"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="today-columns">
        <section>
          <div className="section-heading">
            <h2>Pause & reflect</h2>
            <span className="eyebrow">JUST FOR YOU</span>
          </div>
          <div className="reflection-card">
            {day ? (
              <Reflection key={day.id} record={day} records={records} />
            ) : (
              <>
                <p className="reflection-prompt">What stayed with you today?</p>
                <p className="muted">
                  A small win. A question you’re sitting with.
                  <br />
                  Something worth remembering.
                </p>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => void reflect()}
                >
                  Start a reflection <ArrowUpRight size={15} />
                </button>
              </>
            )}
          </div>
        </section>
        <section className="rhythm">
          <div className="section-heading">
            <h2>Your recent rhythm</h2>
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
                      style={yes ? { background: n.data.color } : undefined}
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
            <p className="small muted">
              Every little square is time made for yourself.
            </p>
          </div>
        </section>
      </div>
      <div className="section-heading">
        <h2>
          Today’s pages <span className="count">{entries.length}</span>
        </h2>
        <button className="text-button" onClick={() => void newEntry()}>
          <Plus size={15} />
          New entry
        </button>
      </div>
      <EntryList records={records} entries={entries} />
      <footer className="page-footer">
        COLLECT MOMENTS. CONNECT IDEAS. COME BACK TOMORROW.
      </footer>
    </main>
  );
}
function Reflection({
  record,
  records,
}: {
  record: RecordItem<"day">;
  records: Snapshot;
}) {
  const d = useDraft(record);
  return (
    <>
      <Editor
        compact
        label="Daily reflection"
        records={records}
        value={d.value.markdown}
        onChange={(markdown) => d.change({ ...d.value, markdown })}
      />
      <DraftStatus draft={d} />
    </>
  );
}
function DraftStatus({
  draft,
}: {
  draft: {
    status: string;
    error: string;
    conflict: unknown;
    acceptRemote: () => void;
    keepMine: () => Promise<void>;
    flush: () => Promise<void>;
  };
}) {
  return (
    <div className="draft-status">
      <span className={draft.error ? "error-text" : "muted"}>
        {draft.status}
      </span>
      {draft.error && (
        <>
          <p>{draft.error}</p>
          {draft.conflict ? (
            <div>
              <details>
                <summary>Review the saved version</summary>
                <pre className="conflict-preview">
                  {JSON.stringify((draft.conflict as AnyRecord).data, null, 2)}
                </pre>
              </details>
              <div className="row">
                <button onClick={draft.acceptRemote}>Use saved version</button>
                <button onClick={() => void draft.keepMine()}>
                  Save my recovered version
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => void draft.flush()}>Retry save</button>
          )}
        </>
      )}
    </div>
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
            color: "#b7cba3",
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
      <div className="eyebrow">A PLACE FOR EVERY PART OF YOU</div>
      <div className="row between">
        <h1>Your notebooks.</h1>
        <button className="primary" onClick={() => edit()}>
          <Plus size={16} />
          New notebook
        </button>
      </div>
      <p className="lede">Different interests. One ongoing story.</p>
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
                  {n.data.archived ? "ARCHIVED" : "PERSONAL NOTEBOOK"}
                </span>
                <h2>{n.data.name}</h2>
              </div>
            </Link>
            <div className="notebook-info">
              <p>{n.data.description}</p>
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
        description="Make a little room for another interest."
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
  const { id } = useParams(),
    n = ofKind(records, "notebook").find((n) => n.id === id),
    save = useSave(),
    nav = useNavigate(),
    [error, setError] = useState("");
  if (!n)
    return (
      <Empty title="Notebook not found.">
        <Link to="/notebooks">All notebooks</Link>
      </Empty>
    );
  async function create() {
    try {
      const e = await save("entry", uid(), {
        title: "",
        markdown: "",
        notebookId: id!,
        date: today(settings.timezone),
      });
      nav(`/entries/${e.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <main className="page">
      <Link className="back-link" to="/notebooks">
        <ArrowLeft size={14} />
        Notebooks
      </Link>
      <div className="row between">
        <div>
          <span className="subject-label" style={{ color: n.data.color }}>
            <SubjectIcon name={n.data.icon} />
            YOUR {n.data.name.toUpperCase()} NOTEBOOK
          </span>
          <h1>{n.data.name}.</h1>
          <p className="lede">{n.data.description}</p>
        </div>
        <button className="primary" onClick={() => void create()}>
          <Plus size={16} />
          New entry
        </button>
      </div>
      <ErrorNotice error={error} />
      <EntryList
        records={records}
        entries={ofKind(records, "entry").filter(
          (e) => e.data.notebookId === id,
        )}
      />
    </main>
  );
}
function EntryPage({ records }: { records: Snapshot }) {
  const { id } = useParams(),
    record = ofKind(records, "entry").find((e) => e.id === id);
  return record ? (
    <main className="page writing-page">
      <EntryWriting key={record.id} record={record} records={records} />
    </main>
  ) : (
    <Empty title="Entry not found.">It may be in Trash in Settings.</Empty>
  );
}
function EntryWriting({
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
      if (localStorage.getItem(api.recoveryPrefix + record.id))
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
          <input
            className="date-inline"
            type="date"
            aria-label="Entry date"
            value={draft.value.date}
            onChange={(e) =>
              e.target.value &&
              draft.change({ ...draft.value, date: e.target.value })
            }
          />
          <button
            className="icon-button"
            aria-label="Move entry to trash"
            onClick={() => void trash()}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <input
        className="entry-title"
        aria-label="Entry title"
        placeholder="An untitled thought"
        value={draft.value.title}
        onChange={(e) =>
          draft.change({ ...draft.value, title: e.target.value })
        }
      />
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
      <div className="eyebrow">READ SLOWLY. FOLLOW THE THREAD.</div>
      <div className="row between">
        <h1>Your paper trail.</h1>
        <button
          className="primary"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Plus size={16} />
          {busy ? "Opening paper…" : "Add a paper"}
        </button>
      </div>
      <p className="lede">
        The source on one side. Your understanding on the other.
      </p>
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
                dated entries
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
          <h2>A paper worth thinking about.</h2>
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
  const { id } = useParams(),
    [params, setParams] = useSearchParams(),
    save = useSave(),
    ref = useRef<EditorHandle>(null),
    [ai, setAI] = useState<{
      annotation: RecordItem<"annotation">;
      context: string;
    }>(),
    [error, setError] = useState(""),
    [split, setSplit] = useState(50),
    [pane, setPane] = useState("both"),
    [busy, setBusy] = useState(false);
  const paper = ofKind(records, "paper").find((p) => p.id === id),
    entries = ofKind(records, "entry")
      .filter((e) => e.data.paperId === id)
      .sort((a, b) => b.data.date.localeCompare(a.data.date)),
    entry = entries.find((e) => e.id === params.get("entry")) || entries[0],
    annotation = ofKind(records, "annotation").find(
      (a) => a.id === params.get("annotation"),
    );
  async function newEntry() {
    const n =
      ofKind(records, "notebook").find((n) => n.data.icon === "science") ||
      ofKind(records, "notebook")[0];
    if (!n) return;
    setBusy(true);
    try {
      const e = await save("entry", uid(), {
        paperId: id,
        notebookId: n.id,
        date: today(settings.timezone),
        title: paper?.data.title || "",
        markdown: "",
      });
      setParams({ entry: e.id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function selection(s: Selection, explain: boolean) {
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
    else if (entry) {
      ref.current?.insert(
        `\n[${s.kind === "region" ? "Figure or equation" : s.text.slice(0, 70).replace(/[\[\]\\]/g, "")} · p. ${s.page + 1}](annotation:${a.id})\n${imageAssetId ? `\n![Selected PDF region](asset:${imageAssetId})\n` : ""}`,
      );
    } else setError("Reference saved. Create an entry to insert it.");
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
          <div>
            <span className="eyebrow">READING ROOM</span>
            <h2>{paper.data.title}</h2>
          </div>
        </div>
        <div className="row">
          <select
            aria-label="Workspace panes"
            value={pane}
            onChange={(e) => setPane(e.target.value)}
          >
            <option value="both">PDF + notes</option>
            <option value="pdf">PDF only</option>
            <option value="notes">Notes only</option>
          </select>
          <button disabled={busy} onClick={() => void newEntry()}>
            <Plus size={15} />
            New dated entry
          </button>
        </div>
      </div>
      <ErrorNotice error={error} />
      <div
        className={`science-workspace pane-${pane} ${ai ? "with-ai" : ""}`}
        style={{ "--split": `${split}%` } as CSSProperties}
      >
        <div className="science-pdf">
          <PdfViewer
            paper={paper}
            records={records}
            activeAnnotation={annotation}
            onSelect={selection}
          />
        </div>
        <div className="splitter">
          <input
            type="range"
            min="30"
            max="70"
            value={split}
            aria-label="PDF pane width"
            onChange={(e) => setSplit(Number(e.target.value))}
          />
        </div>
        <section className="science-notes">
          <div className="notes-header">
            <span className="eyebrow">YOUR UNDERSTANDING</span>
            <select
              aria-label="Paper entry"
              value={entry?.id || ""}
              onChange={(e) => setParams({ entry: e.target.value })}
            >
              <option disabled value="">
                Select an entry
              </option>
              {entries.map((e) => (
                <option key={e.id} value={e.id}>
                  {displayDate(e.data.date)} · {e.data.title || "Untitled"}
                </option>
              ))}
            </select>
          </div>
          {entry ? (
            <EntryWriting
              key={entry.id}
              record={entry}
              records={records}
              editorRef={ref}
            />
          ) : (
            <Empty title="A fresh perspective.">
              <p>Create a dated entry to start taking notes on this paper.</p>
              <button className="primary" onClick={() => void newEntry()}>
                Start today’s notes
              </button>
            </Empty>
          )}
          {annotation && (
            <div className="annotation-actions">
              <span className="small muted">
                Selected source · page {annotation.data.page + 1}
              </span>
              <button
                disabled={!entry}
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
              if (!entry) {
                setError(
                  "Create a dated entry before inserting an explanation.",
                );
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
      <p className="eyebrow">MAKE YOURSELF AT HOME</p>
      <h1>A space that’s yours.</h1>
      <ErrorNotice error={error} />
      {message && (
        <p role="status" className="success">
          {message}
        </p>
      )}
      <section className="settings-card">
        <h2>Your journal day</h2>
        <p className="muted">
          Today follows your timezone. Entries keep the dates you assign.
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
        <h2>Thoughtful AI, within limits</h2>
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
        <h2>Keep a copy of your commonplace</h2>
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
      <p className="small muted">
        Commonplace v0.1 · Built for a life in progress.
      </p>
    </main>
  );
}
