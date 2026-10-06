import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Exercise the real production service path and PostgreSQL RPC with two isolated
// browser profiles. Only HTTP transport/Auth are synthetic; no shared localStorage.
test("hours migrate and sync across independent devices through the account API", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const db = new PGlite();
  const owner = "10000000-0000-4000-8000-000000000001";
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select '${owner}'::uuid $$;
    grant usage on schema public,auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$select string_to_array(name,'/')$$;`);
  for (const migration of [
    "20260922233052_workspace",
    "20260922233110_storage",
    "20260922233216_restrict_api_function_privileges",
    "20260923201135_journal_workflow",
    "20260926222912_second_iteration",
    "20260929231303_formatting_word_markers",
    "20261006015111_sync_work_time",
  ])
    await db.exec(
      await readFile(`supabase/migrations/${migration}.sql`, "utf8"),
    );
  await db.exec(
    `insert into auth.users values('${owner}'); insert into app_owner(user_id) values('${owner}'); set role authenticated;`,
  );
  await db.query("select save_record($1,'notebook',$2,0)", [
    "20000000-0000-4000-8000-000000000001",
    JSON.stringify({
      name: "Test notebook",
      description: "",
      color: "#b7cba3",
      icon: "book",
      order: 0,
      archived: false,
    }),
  ]);
  const server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5176",
      "--strictPort",
    ],
    {
      env: {
        ...process.env,
        VITE_DEMO_MODE: "false",
        VITE_SUPABASE_URL: "https://hours-test.invalid",
        VITE_SUPABASE_PUBLISHABLE_KEY: "synthetic-key",
        VITE_OWNER_EMAIL: "owner@example.test",
      },
      stdio: "pipe",
    },
  );
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  let offline = false;
  try {
    await expect
      .poll(async () => {
        try {
          return (await fetch("http://127.0.0.1:5176")).status;
        } catch {
          return 0;
        }
      })
      .toBe(200);
    const exp = Math.floor(Date.now() / 1000) + 86400;
    const token = [
      Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
      Buffer.from(
        JSON.stringify({ sub: owner, exp, role: "authenticated" }),
      ).toString("base64url"),
      "synthetic",
    ].join(".");
    for (const [index, context] of contexts.entries()) {
      await context.addInitScript(
        ({ token, exp, owner }) => {
          localStorage.setItem(
            "sb-hours-test-auth-token",
            JSON.stringify({
              access_token: token,
              refresh_token: "synthetic",
              token_type: "bearer",
              expires_at: exp,
              expires_in: 86400,
              user: {
                id: owner,
                aud: "authenticated",
                email: "owner@example.test",
              },
            }),
          );
        },
        { token, exp, owner },
      );
      await context.route("https://hours-test.invalid/**", async (route) => {
        if (offline && index === 0) return route.abort();
        const url = new URL(route.request().url());
        const reply = (body: unknown, status = 200) =>
          route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify(body),
          });
        try {
          if (url.pathname === "/rest/v1/records") {
            const records = (
              await db.query(
                "select id,kind,data,revision,updated_at,deleted_at from records order by id",
              )
            ).rows;
            return reply(
              url.searchParams.get("kind") === "eq.work_time"
                ? records.filter((r) => r.kind === "work_time")
                : records,
            );
          }
          if (url.pathname === "/rest/v1/rpc/save_work_time") {
            const p = route.request().postDataJSON();
            const { rows } = await db.query(
              "select save_work_time($1,$2,$3,$4) as result",
              [
                p.p_date,
                p.p_field,
                JSON.stringify(p.p_value),
                JSON.stringify(p.p_expected),
              ],
            );
            return reply(rows[0].result);
          }
          return reply(
            { message: `Unexpected test request ${url.pathname}` },
            500,
          );
        } catch (error) {
          return reply({ message: String(error) }, 400);
        }
      });
    }
    const a = await contexts[0].newPage(),
      b = await contexts[1].newPage();
    await a.goto("http://127.0.0.1:5176");
    await a.evaluate(() => {
      localStorage.setItem(
        "kais-notebook:work-time:owner",
        JSON.stringify({ version: 1, days: { "2026-10-02": 11229 } }),
      );
      localStorage.setItem(
        "kais-notebook:time-calculator:owner",
        JSON.stringify({ date: "2026-10-02", input: "10:00, 10:00" }),
      );
    });
    await a.reload();
    await expect(a.getByLabel("Hours sync status")).toHaveText("Hours synced");
    await expect(a.getByLabel("All-time hours")).toHaveText("21:25:30");
    await b.goto("http://127.0.0.1:5176");
    await expect(b.getByLabel("All-time hours")).toHaveText("21:25:30");
    expect(
      await b.evaluate(() =>
        localStorage.getItem("kais-notebook:work-time:owner"),
      ),
    ).toBeNull();
    const actualA = a.getByRole("textbox", {
      name: "Actual time worked (HH:MM:SS)",
    });
    const actualB = b.getByRole("textbox", {
      name: "Actual time worked (HH:MM:SS)",
    });
    await actualA.fill("00:30:00");
    await actualA.blur();
    await expect(a.getByLabel("Hours sync status")).toHaveText("Hours synced");
    await b.reload();
    await expect(actualB).toHaveValue("00:30:00");
    await expect(b.getByLabel("All-time hours")).toHaveText("21:55:30");
    await actualA.fill("00:45:00");
    await actualA.blur();
    await expect(a.getByLabel("Hours sync status")).toHaveText("Hours synced");
    await actualB.fill("01:00:00");
    await actualB.blur();
    await expect(
      b.getByRole("button", { name: "Keep account value" }),
    ).toBeVisible();
    await b.screenshot({
      path: "test-results/hours-sync-conflict.png",
      fullPage: true,
    });
    await b.getByRole("button", { name: "Keep account value" }).click();
    await expect(actualB).toHaveValue("00:45:00");
    offline = true;
    await actualA.fill("01:00:00");
    await actualA.blur();
    await expect(
      a.getByRole("button", { name: "Retry hours sync" }),
    ).toBeVisible();
    offline = false;
    await a.reload();
    await expect(a.getByLabel("Hours sync status")).toHaveText("Hours synced");
    await b.reload();
    await expect(actualB).toHaveValue("01:00:00");
    await expect(b.getByLabel("All-time hours")).toHaveText("22:25:30");
    await expect(a.getByLabel("All-time hours")).toHaveText("22:25:30");
    expect(
      (
        await db.query(
          "select count(*)::int n from records where kind='work_time'",
        )
      ).rows[0].n,
    ).toBe(2);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    server.kill();
    await db.close();
  }
});
