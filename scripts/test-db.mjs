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
await db.close();
console.log(
  `\n${checks} database behavior checks passed (real PostgreSQL via PGlite).`,
);
