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
await db.close();
console.log(
  `\n${checks} database behavior checks passed (real PostgreSQL via PGlite).`,
);
