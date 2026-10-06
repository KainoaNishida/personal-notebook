import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Exercise the real production service path and PostgreSQL RPC with two isolated
// browser profiles. Only HTTP transport/Auth are synthetic; no shared localStorage.
test("reading sessions sync across devices, survive lost responses, and preserve conflicting notes", async ({
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
    "20261006042600_reading_log",
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
      name: "Reading",
      reading: true,
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
  let loseResponse = false;
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
          if (url.pathname === "/rest/v1/rpc/save_entry") {
            const p = route.request().postDataJSON();
            const { rows } = await db.query(
              "select save_entry($1,$2,$3,$4) as result",
              [
                p.p_id,
                JSON.stringify(p.p_data),
                p.p_revision,
                p.p_writing_date,
              ],
            );
            if (loseResponse && index === 0) {
              loseResponse = false;
              return route.abort();
            }
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
    const url =
      "http://127.0.0.1:5176/notebooks/20000000-0000-4000-8000-000000000001";
    await a.goto(url);
    await a.getByRole("button", { name: "Log reading", exact: true }).click();
    const form = a.getByRole("form", { name: "Log reading session" });
    await form
      .getByRole("combobox", { name: "Book title" })
      .fill("A synced book");
    await form
      .getByRole("spinbutton", { name: "Minutes", exact: true })
      .fill("35");
    loseResponse = true;
    await form.getByRole("button", { name: "Save log" }).click();
    await expect(form.getByRole("alert")).toBeVisible();
    await form.getByRole("button", { name: "Save log" }).click();
    await expect(form).toHaveCount(0);
    await expect(a.locator(".reading-row")).toHaveCount(1);
    await b.goto(url);
    await expect(b.locator(".reading-row")).toContainText("A synced book");
    await expect(b.locator(".reading-footer")).toContainText(
      "35 minutes in view",
    );
    expect(
      await b.evaluate(() => localStorage.getItem("commonplace:preview:v1")),
    ).toBeNull();
    for (const page of [a, b]) {
      await page
        .getByRole("button", { name: /Add notes for A synced book/ })
        .click();
      await page.getByRole("button", { name: "Edit Markdown source" }).click();
    }
    await a.locator(".cm-content").fill("Saved thoughts from device one.");
    await expect(
      a.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    await b.locator(".cm-content").fill("Other thoughts from device two.");
    await expect(
      b.getByRole("button", { name: "Review versions" }),
    ).toBeVisible();
    await b.getByRole("button", { name: "Review versions" }).click();
    await expect(b.locator(".conflict-review")).toContainText("35 minutes");
    await expect(b.locator(".conflict-review")).toContainText(
      "Saved thoughts from device one.",
    );
    await b.getByRole("button", { name: "Keep this window" }).click();
    await expect(
      b.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    await a.reload();
    await expect(a.locator(".cm-content")).toContainText(
      "Other thoughts from device two.",
    );
    offline = true;
    await a
      .locator(".cm-content")
      .fill("Recovered notes after an offline edit.");
    await expect(a.getByRole("button", { name: "Retry save" })).toBeVisible();
    offline = false;
    await a.reload();
    await a.getByRole("button", { name: "Review versions" }).click();
    await expect(a.locator(".conflict-review")).toContainText(
      "Recovered notes after an offline edit.",
    );
    await a.getByRole("button", { name: "Keep this window" }).click();
    await expect(
      a.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    await b.reload();
    await expect(b.locator(".cm-content")).toContainText(
      "Recovered notes after an offline edit.",
    );
    await b.getByRole("button", { name: "Edit log", exact: true }).click();
    await b
      .getByRole("form")
      .getByRole("spinbutton", { name: "Minutes", exact: true })
      .fill("60");
    await a.getByRole("button", { name: "Edit log", exact: true }).click();
    await a
      .getByRole("form")
      .getByRole("spinbutton", { name: "Minutes", exact: true })
      .fill("45");
    await a.getByRole("button", { name: "Save details" }).click();
    await expect(a.getByRole("form")).toHaveCount(0);
    await b.reload();
    await expect(
      b
        .getByRole("form")
        .getByRole("spinbutton", { name: "Minutes", exact: true }),
    ).toHaveValue("60");
    await b.getByRole("button", { name: "Save details" }).click();
    await expect(b.getByRole("alert")).toContainText(
      "details changed in another window",
    );
    await b.getByRole("form").getByRole("button", { name: "Cancel" }).click();
    await b.getByRole("button", { name: "Edit log", exact: true }).click();
    await expect(
      b
        .getByRole("form")
        .getByRole("spinbutton", { name: "Minutes", exact: true }),
    ).toHaveValue("45");
    await b
      .getByRole("form")
      .getByRole("spinbutton", { name: "Minutes", exact: true })
      .fill("60");
    await b.getByRole("button", { name: "Save details" }).click();
    await expect(b.getByRole("form")).toHaveCount(0);
    await a.reload();
    await expect(a.locator(".reading-minutes")).toHaveText("60");
    expect(
      (await db.query("select count(*)::int n from records where kind='entry'"))
        .rows[0].n,
    ).toBe(1);
    expect(
      (
        await db.query(
          "select count(*)::int n from records where kind='work_time'",
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    server.kill();
    await db.close();
  }
});
