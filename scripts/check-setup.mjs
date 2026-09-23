import { readFile } from "node:fs/promises";
async function config(path) {
  try {
    return Object.fromEntries(
      (await readFile(path, "utf8"))
        .split(/\r?\n/)
        .filter(
          (line) =>
            line.trim() && !line.trim().startsWith("#") && line.includes("="),
        )
        .map((line) => {
          const at = line.indexOf("=");
          return [
            line.slice(0, at).trim(),
            line
              .slice(at + 1)
              .trim()
              .replace(/^['"]|['"]$/g, ""),
          ];
        }),
    );
  } catch {
    return {};
  }
}
const publicConfig = await config(".env.local"),
  serverConfig = await config(".env.supabase.local");
let ready = true;
for (const [name, value] of Object.entries({
  ...Object.fromEntries(
    ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"].map((k) => [
      k,
      publicConfig[k] ||
        (k === "VITE_SUPABASE_PUBLISHABLE_KEY"
          ? publicConfig.VITE_SUPABASE_ANON_KEY
          : undefined),
    ]),
  ),
  ...Object.fromEntries(
    ["GEMINI_API_KEY", "APP_ORIGIN"].map((k) => [k, serverConfig[k]]),
  ),
})) {
  const present = Boolean(value && !/YOUR_|REPLACE/i.test(value));
  console.log(`${present ? "PRESENT" : "MISSING"} ${name}`);
  ready &&= present;
}
if (publicConfig.VITE_DEMO_MODE === "true") {
  console.log(
    "PREVIEW MODE: switch VITE_DEMO_MODE to false for hosted-backend verification.",
  );
  ready = false;
}
console.log(
  "No credential values were printed. Presence checks do not verify deployment or provider access.",
);
process.exitCode = ready ? 0 : 1;
