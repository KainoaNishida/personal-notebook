import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const env = Object.fromEntries(
  (await readFile(".env.local", "utf8"))
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim(),
    ]),
);
const base = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
assert.ok(base && key, "Configure the public Supabase connection first");
const headers = { apikey: key, "Content-Type": "application/json" };
let checks = 0;
async function denied(path, body, method = "POST") {
  const r = await fetch(`${base}${path}`, {
    method,
    headers,
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
  const result = await r.json();
  assert.ok(
    r.status >= 400 && r.status < 500,
    `${path}: expected access denial, got ${r.status}`,
  );
  assert.ok(
    !result.access_token && !result.signedURL,
    "Unexpected access credential",
  );
  console.log(`PASS ${path}: access denied (${r.status})`);
  checks++;
}
await denied("/rest/v1/records?select=id", undefined, "GET");
await denied("/rest/v1/rpc/get_usage", {});
await denied("/rest/v1/rpc/reserve_generation", {
  p_id: crypto.randomUUID(),
  p_owner: crypto.randomUUID(),
  p_hash: "anonymous-probe",
  p_model: "gemini-2.5-flash",
  p_max: 1,
});
await denied("/rest/v1/rpc/finish_generation", {
  p_id: crypto.randomUUID(),
  p_actual: 0,
  p_result: null,
});
await denied("/rest/v1/rpc/purge_expired_trash", {});
const listing = await fetch(`${base}/storage/v1/object/list/journal`, {
  method: "POST",
  headers,
  body: JSON.stringify({ prefix: "", limit: 1 }),
});
assert.equal(listing.status, 200);
assert.deepEqual(
  await listing.json(),
  [],
  "Anonymous storage listing must reveal no files",
);
console.log("PASS private storage listing reveals no files");
checks++;
await denied("/functions/v1/explain", {});
const settings = await fetch(`${base}/auth/v1/settings`, { headers }).then(
  (r) => r.json(),
);
assert.equal(settings.disable_signup, true, "Public signup must be disabled");
assert.equal(
  settings.external?.anonymous_users,
  false,
  "Anonymous sign-ins must be disabled",
);
console.log(
  `PASS sign-up and anonymous sign-in disabled\n${checks + 1} hosted access checks passed. No credentials printed or user records created.`,
);
