import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
-- Match hosted Supabase's direct default grants, in addition to PUBLIC.
alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;`);
await db.exec(
  await readFile("supabase/migrations/20260922233052_workspace.sql", "utf8"),
);
await db.exec(
  `create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;`,
);
await db.exec(
  await readFile("supabase/migrations/20260922233110_storage.sql", "utf8"),
);
await db.exec(
  await readFile(
    "supabase/migrations/20260922233216_restrict_api_function_privileges.sql",
    "utf8",
  ),
);
const owner = randomUUID(),
  outsider = randomUUID(),
  notebook = randomUUID(),
  entry = randomUUID();
await db.query("insert into auth.users values($1),($2)", [owner, outsider]);
await db.query("insert into app_owner(user_id) values($1)", [owner]);
const as = async (role, user) => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user || "",
  ]);
  await db.exec(`set role ${role}`);
};
const save = async (id, kind, data, revision = 0) =>
  (
    await db.query("select public.save_record($1,$2,$3,$4) as value", [
      id,
      kind,
      JSON.stringify(data),
      revision,
    ])
  ).rows[0].value;
let checks = 0;
const pass = (name) => {
  checks++;
  console.log(`PASS ${name}`);
};
const privileges = (
  await db.query(`select proname,
  has_function_privilege('anon',p.oid,'execute') as anon,
  has_function_privilege('authenticated',p.oid,'execute') as authenticated,
  has_function_privilege('service_role',p.oid,'execute') as service_role
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`)
).rows;
for (const fn of privileges) {
  assert.equal(fn.anon, false, `${fn.proname} must not be anonymous`);
  if (
    ["reserve_generation", "finish_generation", "purge_expired_trash"].includes(
      fn.proname,
    )
  ) {
    assert.equal(fn.authenticated, false, `${fn.proname} must be server-only`);
    assert.equal(fn.service_role, true);
  }
}
pass("hosted default function grants cannot expose privileged RPCs");
await as("anon");
await assert.rejects(
  () => db.query("select * from records"),
  /permission denied/,
);
await assert.rejects(
  () => save(entry, "day", { date: "2026-09-22", markdown: "" }),
  /permission denied/,
);
pass("anonymous reads and writes denied");
await as("authenticated", owner);
await save(notebook, "notebook", {
  name: "Science",
  description: "",
  color: "#b7cba3",
  icon: "science",
  order: 0,
  archived: false,
});
const entryData = {
  title: "Original",
  notebookId: notebook,
  date: "2026-09-22",
  markdown: "Private notes",
};
await save(entry, "entry", entryData);
assert.equal((await db.query("select * from records")).rows.length, 2);
pass("owner may create and read private data");
await as("authenticated", outsider);
assert.equal((await db.query("select * from records")).rows.length, 0);
await assert.rejects(
  () => save(randomUUID(), "day", { date: "2026-09-22", markdown: "no" }),
  /Owner access/,
);
pass("second authenticated user has no access");
await as("authenticated", owner);
const updated = await save(
  entry,
  "entry",
  { ...entryData, markdown: "New content" },
  1,
);
assert.equal(updated.record.revision, 2);
const conflict = await save(
  entry,
  "entry",
  { ...entryData, markdown: "Stale content" },
  1,
);
assert.equal(conflict.conflict, true);
assert.equal(conflict.record.data.markdown, "New content");
assert.equal(
  (await db.query("select count(*)::int as n from record_versions")).rows[0].n,
  1,
);
pass("stale writes preserve remote version and history");
await assert.rejects(
  () => db.query("update records set data='{}'"),
  /permission denied/,
);
await assert.rejects(
  () => save(randomUUID(), "entry", { ...entryData, notebookId: randomUUID() }),
  /Missing reference/,
);
pass("direct mutation and dangling references denied");
await assert.rejects(
  () =>
    db.query("select reserve_generation($1,$2,$3,$4,$5)", [
      randomUUID(),
      owner,
      "hash",
      "gemini-2.5-flash",
      100,
    ]),
  /permission denied/,
);
pass("client cannot alter AI budget");
await as("service_role");
const request = randomUUID();
const reserve = async (id, max, hash = "hash") =>
  (
    await db.query("select reserve_generation($1,$2,$3,$4,$5) as result", [
      id,
      owner,
      hash,
      "gemini-2.5-flash",
      max,
    ])
  ).rows[0].result;
assert.equal((await reserve(request, 19999990)).dispatch, true);
await assert.rejects(() => reserve(randomUUID(), 20), /budget reached/);
assert.equal((await reserve(request, 19999990)).dispatch, false);
await assert.rejects(
  () => reserve(request, 100, "different"),
  /different input/,
);
pass("atomic ceiling and duplicate request IDs");
await db.query("select finish_generation($1,null,null,$2)", [
  request,
  "uncertain",
]);
await as("authenticated", owner);
let usage = (await db.query("select get_usage() as value")).rows[0].value;
assert.equal(usage.reserved, 19999990);
pass("unknown billing retains reservation");
await as("service_role");
await db.query("select finish_generation($1,$2,$3,null)", [
  request,
  100,
  JSON.stringify({ markdown: "done" }),
]);
const concurrent = await Promise.allSettled([
  reserve(randomUUID(), 15000000),
  reserve(randomUUID(), 15000000),
]);
assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
pass("parallel requests cannot overspend");
await as("authenticated", owner);
const before = (await db.query("select count(*)::int as n from records"))
  .rows[0].n;
await assert.rejects(
  () =>
    db.query("select restore_records($1)", [
      JSON.stringify([
        { id: randomUUID(), kind: "notebook", data: { name: "First" } },
        {
          id: randomUUID(),
          kind: "entry",
          data: { ...entryData, notebookId: randomUUID() },
        },
      ]),
    ]),
  /Missing reference/,
);
assert.equal(
  (await db.query("select count(*)::int as n from records")).rows[0].n,
  before,
);
pass("failed restore rolls back all records");
await db.query("select save_record($1,$2,$3,$4,now())", [
  entry,
  "entry",
  JSON.stringify({ ...entryData, markdown: "New content" }),
  2,
]);
await save(entry, "entry", entryData, 3);
assert.equal(
  (await db.query("select deleted_at from records where id=$1", [entry]))
    .rows[0].deleted_at,
  null,
);
pass("recoverable trash restores entry");
await as("postgres");
await db.query(
  "update records set deleted_at=now()-interval '31 days' where id=$1",
  [entry],
);
await as("authenticated", owner);
await assert.rejects(() => save(entry, "entry", entryData, 4), /retention/);
pass("expired trash cannot be silently resurrected");
await as("postgres");
await as("authenticated", owner);
await db.query(
  "insert into storage.objects(bucket_id,name) values('journal',$1)",
  [`${owner}/test`],
);
await assert.rejects(
  () =>
    db.query(
      "insert into storage.objects(bucket_id,name) values('journal',$1)",
      [`${outsider}/test`],
    ),
  /row-level security/,
);
await as("authenticated", outsider);
assert.equal((await db.query("select * from storage.objects")).rows.length, 0);
pass("storage policies isolate owner files");
await as("authenticated", owner);
const assetId = randomUUID();
const assetData = {
  path: `${owner}/test`,
  mime: "application/pdf",
  size: 100,
  name: "test.pdf",
};
await save(assetId, "asset", assetData);
await assert.rejects(
  () =>
    save(assetId, "asset", { ...assetData, path: `${owner}/replacement` }, 1),
  /immutable/,
);
await db.query("delete from storage.objects where name=$1", [`${owner}/test`]);
assert.equal((await db.query("select * from storage.objects")).rows.length, 1);
pass("source assets cannot be replaced or deleted while referenced");
await as("postgres");
await db.exec(
  "insert into ai_months(owner_id,month) select distinct owner_id,to_char((now() at time zone 'UTC')-interval '1 month','YYYY-MM') from ai_requests on conflict do nothing",
);
await db.exec(
  "update ai_requests set month=to_char((now() at time zone 'UTC')-interval '1 month','YYYY-MM')",
);
await as("authenticated", owner);
usage = (await db.query("select get_usage() as value")).rows[0].value;
assert.equal(usage.spent, 0);
assert.equal(usage.reserved, 0);
await as("service_role");
assert.equal((await reserve(randomUUID(), 20000000)).dispatch, true);
pass("UTC month rollover preserves old ledger while opening a new allowance");

// Approved journal workflow migration, exercised against legacy data.
await as("authenticated", owner);
const paperId = randomUUID();
await save(paperId, "paper", {
  title: "Old title",
  assetId,
  fingerprint: "workflow-proof",
  pages: 2,
});
const paperFirst = randomUUID(),
  paperSecond = randomUUID();
await save(paperFirst, "entry", {
  notebookId: notebook,
  paperId,
  date: "2026-09-20",
  title: "First",
  markdown: "First study",
});
await save(paperSecond, "entry", {
  notebookId: notebook,
  paperId,
  date: "2026-09-21",
  title: "Second",
  markdown: "Second study",
});
const dailyA = randomUUID(),
  dailyB = randomUUID();
await save(dailyA, "entry", {
  notebookId: notebook,
  date: "2026-09-23",
  title: "A",
  markdown: "Daily A",
});
await save(dailyB, "entry", {
  notebookId: notebook,
  date: "2026-09-23",
  title: "B",
  markdown: "Daily B",
});
await save(randomUUID(), "day", {
  date: "2026-09-23",
  markdown: "Life reflection",
});
await as("postgres");
await db.exec(
  await readFile(
    "supabase/migrations/20260923201135_journal_workflow.sql",
    "utf8",
  ),
);
await as("authenticated", owner);
const paperNotes = (
  await db.query(
    "select * from records where kind='entry' and data->>'paperId'=$1 and not(data ? 'mergedInto')",
    [paperId],
  )
).rows;
assert.equal(paperNotes.length, 1);
assert.match(paperNotes[0].data.markdown, /First study[\s\S]*Second study/);
const original = (
  await db.query(
    "select data from record_versions where record_id=$1 and revision=1",
    [paperFirst],
  )
).rows[0];
assert.equal(original.data.markdown, "First study");
assert.equal(
  (
    await db.query(
      "select count(*)::int as n from records where kind='entry' and data->>'paperId'=$1",
      [paperId],
    )
  ).rows[0].n,
  2,
);
pass(
  "migration consolidates paper notes chronologically and preserves originals",
);
const life = (
  await db.query(
    "select id from records where kind='notebook' and data->>'name'='Life'",
  )
).rows[0].id;
assert.equal(
  (
    await db.query(
      "select data->>'markdown' as md from records where kind='entry' and data->>'notebookId'=$1",
      [life],
    )
  ).rows[0].md,
  "Life reflection",
);
pass("existing daily reflection becomes a Life entry");
const daily = (
  await db.query(
    "select * from records where kind='entry' and data->>'date'='2026-09-23' and data->>'notebookId'=$1 and not(data ? 'mergedInto')",
    [notebook],
  )
).rows;
assert.equal(daily.length, 1);
assert.match(daily[0].data.markdown, /Daily A/);
assert.match(daily[0].data.markdown, /Daily B/);
const duplicate = await save(randomUUID(), "entry", {
  notebookId: notebook,
  date: "2026-09-23",
  title: "",
  markdown: "Another window",
});
assert.equal(duplicate.conflict, true);
assert.equal(duplicate.record.id, daily[0].id);
pass("duplicate daily creation returns existing record without overwriting it");
const duplicatePaper = await save(randomUUID(), "entry", {
  notebookId: notebook,
  paperId,
  date: "2026-09-24",
  title: "",
  markdown: "New day",
});
assert.equal(duplicatePaper.conflict, true);
assert.equal(duplicatePaper.record.id, paperNotes[0].id);
pass("paper note identity is independent of date");
await assert.rejects(
  () =>
    save(
      daily[0].id,
      "entry",
      { ...daily[0].data, date: "2026-09-24" },
      daily[0].revision,
    ),
  /date cannot change/,
);
pass("entry dates cannot be reassigned");
const renamed = await save(
  paperId,
  "paper",
  { title: "New title", assetId, fingerprint: "workflow-proof", pages: 2 },
  1,
);
assert.equal(renamed.record.data.title, "New title");
await assert.rejects(
  () => save(paperId, "paper", { ...renamed.record.data, pages: 3 }, 2),
  /identity is immutable/,
);
pass("paper rename preserves immutable document identity");
const restoredId = randomUUID();
await db.query("select restore_records($1)", [
  JSON.stringify([
    {
      id: restoredId,
      kind: "entry",
      data: {
        notebookId: notebook,
        paperId,
        date: "2026-09-23",
        title: "Restored",
        markdown: "Restored text",
      },
      deleted_at: null,
    },
  ]),
]);
const restored = (
  await db.query("select data from records where id=$1", [restoredId])
).rows[0].data;
assert.equal(restored.mergedInto, paperNotes[0].id);
assert.match(
  (await db.query("select data from records where id=$1", [paperNotes[0].id]))
    .rows[0].data.markdown,
  /Restored text/,
);
pass("restore appends paper content while retaining the imported original");
await as("authenticated", outsider);
assert.equal((await db.query("select * from record_versions")).rows.length, 0);
await assert.rejects(
  () => save(randomUUID(), "day", { date: "2026-09-23", markdown: "" }),
  /Owner access required/,
);
await as("anon");
await assert.rejects(
  () => db.query("select restore_records($1)", [JSON.stringify([])]),
  /permission denied/,
);
pass("migration retains owner authorization on records, versions, and restore");
await as("postgres");
await db.exec(
  await readFile(
    "supabase/migrations/20260926222912_second_iteration.sql",
    "utf8",
  ),
);
await as("authenticated", owner);
const day = (
  await db.query(
    "select (now() at time zone 'America/Los_Angeles')::date::text d",
  )
).rows[0].d;
const writingId = randomUUID();
const writingData = {
  notebookId: notebook,
  date: day,
  title: "Progress",
  markdown: "one two three four",
};
let written = await save(writingId, "entry", writingData);
const activityFor = async () =>
  (
    await db.query(
      "select * from records where kind='activity' and data->>'notebookId'=$1 and data->>'date'=$2",
      [notebook, day],
    )
  ).rows[0];
assert.equal((await activityFor())?.data.completed || false, false);
written = await save(
  writingId,
  "entry",
  {
    ...writingData,
    markdown: "**one** two three four [five](https://example.com/extra-words)",
  },
  written.record.revision,
);
assert.equal((await activityFor()).data.completed, true);
const earned = (await activityFor()).data.completedAt;
written = await save(
  writingId,
  "entry",
  { ...writingData, markdown: "" },
  written.record.revision,
);
assert.equal((await activityFor()).data.completedAt, earned);
pass("four versus five saved body words and completion latch after deletion");
const countBefore = (
  await db.query(
    "select count(*)::int n from records where kind='writing_progress'",
  )
).rows[0].n;
assert.equal(
  (
    await save(
      writingId,
      "entry",
      { ...writingData, markdown: "many new words in a stale save" },
      1,
    )
  ).conflict,
  true,
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from records where kind='writing_progress'",
    )
  ).rows[0].n,
  countBefore,
);
pass("stale writes cannot award progress");
const lab = randomUUID(),
  otherNotebook = randomUUID();
await save(otherNotebook, "notebook", {
  name: "Other",
  description: "",
  color: "#f59a56",
  icon: "reading",
  order: 10,
  archived: false,
});
await save(lab, "label", {
  notebookId: notebook,
  name: " Theory ",
  color: "#f59a56",
});
await assert.rejects(
  () =>
    save(randomUUID(), "label", {
      notebookId: notebook,
      name: "theory",
      color: "#f59a56",
    }),
  /duplicate key/,
);
const cross = randomUUID();
await save(cross, "label", {
  notebookId: otherNotebook,
  name: "Theory",
  color: "#f59a56",
});
await assert.rejects(
  () =>
    save(
      writingId,
      "entry",
      { ...writingData, labelIds: [cross] },
      written.record.revision,
    ),
  /another notebook/,
);
written = await save(
  writingId,
  "entry",
  { ...writingData, markdown: "", labelIds: [lab] },
  written.record.revision,
);
pass("normalized label uniqueness and notebook isolation");
let activity = await activityFor();
await assert.rejects(
  () =>
    db.query("select save_time($1,$2,$3,$4,$5)", [
      activity.id,
      notebook,
      day,
      -1,
      activity.revision,
    ]),
  /Minutes/,
);
const time = (
  await db.query("select save_time($1,$2,$3,$4,$5,$6) value", [
    activity.id,
    notebook,
    day,
    75,
    activity.revision,
    paperId,
  ])
).rows[0].value;
assert.equal(time.record.data.minutes, 75);
assert.equal(time.record.data.completed, true);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from records where kind='study' and data->>'paperId'=$1 and data->>'date'=$2",
      [paperId, day],
    )
  ).rows[0].n,
  1,
);
await db.query("select record_study($1,$2,$3)", [notebook, paperId, day]);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from records where kind='study' and data->>'paperId'=$1 and data->>'date'=$2",
      [paperId, day],
    )
  ).rows[0].n,
  1,
);
pass(
  "time validation, independent completion and idempotent paper study dates",
);
// Existing long notes establish a shared baseline at their first tracked edit.
const priorPaper = (
  await db.query("select * from records where id=$1", [paperNotes[0].id])
).rows[0];
await save(
  priorPaper.id,
  "entry",
  {
    ...priorPaper.data,
    markdown: priorPaper.data.markdown + "\n![](asset:" + assetId + ")",
  },
  priorPaper.revision,
);
const paperProgress = (
  await db.query(
    "select data from records where kind='writing_progress' and data->>'entryId'=$1",
    [priorPaper.id],
  )
).rows[0].data;
assert.equal(paperProgress.maxAdded, 0);
pass("existing notes and image filenames earn no new body words");
const firstPart = await save(randomUUID(), "entry", {
  notebookId: otherNotebook,
  date: "2020-01-01",
  title: "",
  markdown: "alpha beta",
});
assert.equal(
  (
    await db.query(
      "select count(*)::int n from records where kind='activity' and data->>'notebookId'=$1 and (data->>'completed')::boolean",
      [otherNotebook],
    )
  ).rows[0].n,
  0,
);
await db.query("select restore_records($1)", [
  JSON.stringify([
    {
      id: randomUUID(),
      kind: "entry",
      data: {
        ...firstPart.record.data,
        markdown: "imported words must never earn activity",
      },
      deleted_at: null,
    },
  ]),
]);
const afterImport = (
  await db.query("select * from records where id=$1", [firstPart.record.id])
).rows[0];
await save(
  afterImport.id,
  "entry",
  { ...afterImport.data, markdown: afterImport.data.markdown + " gamma" },
  afterImport.revision,
);
assert.equal(
  (
    await db.query(
      "select (data->>'maxAdded')::int n from records where kind='writing_progress' and data->>'entryId'=$1",
      [afterImport.id],
    )
  ).rows[0].n,
  3,
);
await save(randomUUID(), "entry", {
  notebookId: otherNotebook,
  date: "2020-01-02",
  title: "",
  markdown: "delta epsilon",
});
assert.equal(
  (
    await db.query(
      "select (data->>'completed')::boolean done from records where kind='activity' and data->>'notebookId'=$1 and data->>'date'=$2",
      [otherNotebook, day],
    )
  ).rows[0].done,
  true,
);
pass(
  "imports earn no writing credit and progress aggregates across notebook pages",
);
await assert.rejects(
  () =>
    db.query("select save_entry($1,$2,$3,$4)", [
      randomUUID(),
      JSON.stringify({ ...writingData, date: "2099-01-01" }),
      0,
      "2099-01-01",
    ]),
  /outside the tracking period/,
);
pass("future writing days are rejected atomically");
await as("postgres");
assert.equal(
  (
    await db.query(
      "select journal_private.added_words('[\"one\",\"two\"]','**two** one ![filename.png](asset:id)') n",
    )
  ).rows[0].n,
  0,
);
const newPrivileges = (
  await db.query(
    "select proname, has_function_privilege('anon',p.oid,'execute') a from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('save_entry','save_record','save_time','record_study')",
  )
).rows;
assert.ok(newPrivileges.every((p) => !p.a));
await as("authenticated", outsider);
await assert.rejects(
  () =>
    db.query("select save_entry($1,$2,$3)", [
      writingId,
      JSON.stringify(writingData),
      1,
    ]),
  /Owner access required/,
);
await assert.rejects(
  () => db.query("select record_study($1,$2)", [notebook, paperId]),
  /Owner access required/,
);
await assert.rejects(
  () =>
    db.query("select journal_private.save_record($1,$2,$3,$4)", [
      writingId,
      "entry",
      JSON.stringify(writingData),
      1,
    ]),
  /permission denied/,
);
pass(
  "new operations retain owner isolation and private helpers are inaccessible",
);

await as("postgres");
await db.exec(
  await readFile(
    "supabase/migrations/20260929231303_formatting_word_markers.sql",
    "utf8",
  ),
);
const formatted = await db.query(
  "select journal_private.body_words($1) as words, journal_private.added_words($2::jsonb,$1) as added",
  [
    "1. existing\n2. words\n- [x] here",
    JSON.stringify(["existing", "words", "here"]),
  ],
);
assert.deepEqual(formatted.rows[0].words, ["existing", "words", "here"]);
assert.equal(formatted.rows[0].added, 0);
pass("ordered and task list formatting does not earn words");
await as("postgres");
await db.exec(
  await readFile(
    "supabase/migrations/20261006015111_sync_work_time.sql",
    "utf8",
  ),
);
const workSave = async (date, field, value, expected = null) =>
  (
    await db.query("select save_work_time($1,$2,$3,$4) as result", [
      date,
      field,
      JSON.stringify(value),
      JSON.stringify(expected),
    ])
  ).rows[0].result;
await as("anon");
await assert.rejects(
  () => workSave("2026-10-02", "actualSeconds", 11229),
  /permission denied/,
);
await as("authenticated", outsider);
await assert.rejects(
  () => workSave("2026-10-02", "actualSeconds", 11229),
  /Owner access/,
);
await as("authenticated", owner);
const work = await workSave("2026-10-02", "actualSeconds", 11229);
assert.equal(work.record.data.actualSeconds + 65901, 77130);
assert.equal(
  (await workSave("2026-10-02", "actualSeconds", 11229)).record.revision,
  1,
);
assert.equal(
  (await workSave("2026-10-02", "actualSeconds", 12000)).conflict,
  true,
);
assert.equal(
  (await workSave("2026-10-02", "taskInput", "10:00, 10:00")).conflict,
  false,
);
assert.equal(
  (await workSave("2026-10-02", "actualSeconds", 12000, 11229)).conflict,
  false,
);
const staleWork = await workSave("2026-10-02", "actualSeconds", 14000, 11229);
assert.equal(staleWork.conflict, true);
assert.equal(staleWork.record.data.actualSeconds, 12000);
assert.equal(staleWork.record.data.taskInput, "10:00, 10:00");
assert.equal(
  (await workSave("2026-10-02", "actualSeconds", 0, 12000)).record.data
    .actualSeconds,
  0,
);
assert.equal(
  (await workSave("2026-10-02", "actualSeconds", 11229)).conflict,
  true,
);
pass(
  "work hours require owner access, field comparisons, and idempotent daily imports",
);
for (const bad of [-1, 1.5, "3600", null, 112589990684263])
  await assert.rejects(() => workSave("2026-10-03", "actualSeconds", bad));
await assert.rejects(() => workSave("2026-02-30", "actualSeconds", 1));
await assert.rejects(() =>
  workSave("2026-10-03", "taskInput", "x".repeat(10001)),
);
await assert.rejects(
  () => workSave("2026-10-03", "actualSeconds", 112589990684262),
  /total is too large/,
);
await assert.rejects(
  () =>
    save(
      work.record.id,
      "work_time",
      { date: "2026-10-04", actualSeconds: 0 },
      4,
    ),
  /identity cannot change/,
);
await assert.rejects(
  () => db.query("update records set data='{}' where kind='work_time'"),
  /permission denied/,
);
pass(
  "work time rejects malformed values, overflow, date mutation, and direct writes",
);
const restoreWork = async (data) =>
  db.query("select restore_records($1)", [
    JSON.stringify([
      { id: randomUUID(), kind: "work_time", data, deleted_at: null },
    ]),
  ]);
await restoreWork({ date: "2026-10-04", actualSeconds: 3600 });
await restoreWork({ date: "2026-10-04", actualSeconds: 3600 });
await restoreWork({ date: "2026-10-04", taskInput: "15:00" });
await assert.rejects(
  () => restoreWork({ date: "2026-10-04", actualSeconds: 7200 }),
  /Archive contains different work time/,
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from records where kind='work_time' and data->>'date'='2026-10-04'",
    )
  ).rows[0].n,
  1,
);
assert.equal(
  (
    await db.query(
      "select data from records where kind='work_time' and data->>'date'='2026-10-04'",
    )
  ).rows[0].data.actualSeconds,
  3600,
);
await as("authenticated", outsider);
assert.equal(
  (await db.query("select * from records where kind='work_time'")).rows.length,
  0,
);
pass(
  "work time archives restore once, preserve conflicting hours, and retain read isolation",
);

{
  // Reading migration preserves original daily notes and adds independent sessions.
  await as("authenticated", owner);
  const readingBook = randomUUID(),
    legacyReading = randomUUID();
  const readingNotebookData = {
    name: "Reading",
    description: "",
    icon: "reading",
    color: "#b7cba3",
    order: 10,
    archived: false,
    research: false,
  };
  await save(readingBook, "notebook", readingNotebookData);
  await db.query("select restore_records($1)", [
    JSON.stringify([
      {
        id: legacyReading,
        kind: "entry",
        data: {
          notebookId: readingBook,
          date: "2026-09-01",
          title: "Earlier reading",
          markdown: "Original notes",
        },
        deleted_at: null,
      },
    ]),
  ]);
  await as("postgres");
  await db.exec(
    await readFile(
      "supabase/migrations/20261006042600_reading_log.sql",
      "utf8",
    ),
  );
  await as("authenticated", owner);
  assert.equal(
    (
      await db.query(
        "select data->>'reading' as reading from records where id=$1",
        [readingBook],
      )
    ).rows[0].reading,
    "true",
  );
  assert.equal(
    (
      await db.query(
        "select data->>'markdown' as body from records where id=$1",
        [legacyReading],
      )
    ).rows[0].body,
    "Original notes",
  );
  assert.equal(
    (
      await db.query(
        "select data->>'reading' as reading from records where id=$1",
        [notebook],
      )
    ).rows[0].reading,
    "false",
  );
  const renamed = await save(
    readingBook,
    "notebook",
    { ...readingNotebookData, name: "Books", reading: false },
    2,
  );
  assert.equal(renamed.record.data.reading, true);
  pass("reading rollout retains earlier notes and pins layout through renames");
  const sessionData = {
    notebookId: readingBook,
    date: day,
    title: "A Book",
    markdown: "",
    reading: {
      minutes: 30,
      author: "An Author",
      createdAt: new Date().toISOString(),
    },
  };
  const sessionA = randomUUID(),
    sessionB = randomUUID();
  let readingSaved = await save(sessionA, "entry", sessionData);
  await save(sessionB, "entry", sessionData);
  const readingActivity = async () =>
    (
      await db.query(
        "select data from records where kind='activity' and data->>'notebookId'=$1 and data->>'date'=$2",
        [readingBook, day],
      )
    ).rows[0]?.data;
  assert.equal((await readingActivity())?.completed || false, false);
  const duplicateReading = await save(sessionA, "entry", sessionData);
  assert.equal(duplicateReading.conflict, true);
  assert.equal(duplicateReading.record.id, sessionA);
  const ordinarySameDay = await save(randomUUID(), "entry", {
    ...writingData,
    notebookId: readingBook,
    markdown: "",
  });
  assert.equal(ordinarySameDay.conflict, false);
  assert.equal(
    (
      await save(randomUUID(), "entry", {
        ...writingData,
        notebookId: readingBook,
        markdown: "",
      })
    ).conflict,
    true,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from records where kind='entry' and data->>'notebookId'=$1 and data->>'date'=$2 and data ? 'reading'",
        [readingBook, day],
      )
    ).rows[0].n,
    2,
  );
  pass(
    "same-day reading sessions remain distinct while ordinary daily uniqueness is retained",
  );
  for (const minutes of [0, -1, 1.5, "30", null, 1441])
    await assert.rejects(() =>
      save(randomUUID(), "entry", {
        ...sessionData,
        reading: { ...sessionData.reading, minutes },
      }),
    );
  await assert.rejects(
    () => save(randomUUID(), "entry", { ...sessionData, title: " " }),
    /Book title/,
  );
  await assert.rejects(
    () => save(randomUUID(), "entry", { ...sessionData, notebookId: notebook }),
    /reading notebook/,
  );
  await assert.rejects(
    () =>
      save(randomUUID(), "entry", {
        ...sessionData,
        reading: { ...sessionData.reading, createdAt: "not-a-date" },
      }),
    /creation time/,
  );
  const { reading: _reading, ...withoutReading } = sessionData;
  await assert.rejects(
    () => save(sessionA, "entry", withoutReading, 1),
    /type cannot change/,
  );
  await assert.rejects(
    () =>
      save(
        sessionA,
        "entry",
        {
          ...sessionData,
          reading: {
            ...sessionData.reading,
            createdAt: "2026-10-01T12:00:00Z",
          },
        },
        1,
      ),
    /identity cannot change/,
  );
  pass(
    "reading validation rejects invalid minutes, books, layout, and identity changes",
  );
  const editedSession = {
    ...sessionData,
    date: "2026-09-30",
    title: "A corrected title",
    reading: { ...sessionData.reading, minutes: 45 },
  };
  readingSaved = await save(sessionA, "entry", editedSession, 1);
  assert.equal(readingSaved.conflict, false);
  assert.equal(readingSaved.record.data.date, "2026-09-30");
  const staleSession = await save(sessionA, "entry", sessionData, 1);
  assert.equal(staleSession.conflict, true);
  assert.equal(staleSession.record.data.reading.minutes, 45);
  assert.equal((await readingActivity())?.completed || false, false);
  assert.ok(
    (
      await db.query("select * from record_versions where record_id=$1", [
        sessionA,
      ])
    ).rows.length >= 1,
  );
  readingSaved = await save(
    sessionA,
    "entry",
    { ...editedSession, markdown: "one two three four" },
    readingSaved.record.revision,
  );
  assert.equal((await readingActivity())?.completed || false, false);
  await save(sessionB, "entry", { ...sessionData, markdown: "five" }, 1);
  assert.equal((await readingActivity()).completed, true);
  await save(sessionA, "entry", editedSession, readingSaved.record.revision);
  assert.equal((await readingActivity()).completed, true);
  pass(
    "metadata edits use revisions and only saved note words contribute to the latched daily goal",
  );
  const restoreReadingBook = randomUUID();
  const restoredSessions = [randomUUID(), randomUUID()].map((id) => ({
    id,
    kind: "entry",
    data: {
      ...sessionData,
      notebookId: restoreReadingBook,
      markdown: "Imported words never award today credit",
    },
    deleted_at: null,
  }));
  await db.query("select restore_records($1)", [
    JSON.stringify([
      {
        id: restoreReadingBook,
        kind: "notebook",
        data: { ...readingNotebookData, reading: true },
        deleted_at: null,
      },
      ...restoredSessions,
    ]),
  ]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from records where kind='entry' and data->>'notebookId'=$1 and not(data ? 'mergedInto')",
        [restoreReadingBook],
      )
    ).rows[0].n,
    2,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from records where kind='activity' and data->>'notebookId'=$1",
        [restoreReadingBook],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select data from records where kind='work_time' and data->>'date'='2026-10-04'",
      )
    ).rows[0].data.actualSeconds,
    3600,
  );
  pass(
    "archive restores preserve each reading session without awarding words or changing work hours",
  );
  await as("anon");
  await assert.rejects(
    () => save(randomUUID(), "entry", sessionData),
    /permission denied/,
  );
  await as("authenticated", outsider);
  await assert.rejects(
    () => save(randomUUID(), "entry", sessionData),
    /Owner access/,
  );
  assert.equal(
    (await db.query("select * from records where id=$1", [sessionA])).rows
      .length,
    0,
  );
  await assert.rejects(
    () => db.query("select journal_private.validate_reading()"),
    /permission denied/,
  );
  pass("reading sessions preserve anonymous and non-owner isolation");
}
await db.close();
console.log(
  `\n${checks} database behavior checks passed (real PostgreSQL via PGlite).`,
);
