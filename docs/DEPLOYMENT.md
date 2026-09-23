# Private deployment

Use Node 24, a free Supabase project, Vercel Hobby, and a dedicated Gemini API project/key. Do not enable paid infrastructure upgrades automatically. Consumer ChatGPT/Gemini subscriptions do not configure this API. Never paste secrets into chat, commit them, or put them in variables beginning with `VITE_`.

## 1. Supabase project and owner

The existing project is `commonplace` (`ahounsstpphwamgbptiu`), free tier, US West. It belongs to the selected Gmail organization. Do not create a second project. The owner account is configured and public signup/anonymous sign-ins are disabled. The project URL/reference can be shared for setup assistance; passwords, service-role keys and Gemini credentials must remain private.

These migrations are already applied to the hosted project. Their local filenames match the deployed migration history. For a separate clean environment, apply them in order:

1. `supabase/migrations/20260922233052_workspace.sql`
2. `supabase/migrations/20260922233110_storage.sql`
3. `supabase/migrations/20260922233117_retention.sql`
4. `supabase/migrations/20260922233216_restrict_api_function_privileges.sql`

The third enables pg_cron and schedules daily removal of expired entry trash and revision history. The fourth explicitly revokes Supabase's direct default function grants from API roles, restores only intended RPC permissions, and indexes the AI ledger. Revoking from PUBLIC alone is insufficient on hosted Supabase. The regression harness reproduces this default. Files are retained because other entries may reference them. The local PGlite harness does not run pg_cron.

In Authentication, disable new signups and anonymous sign-ins. `config.toml` sets this for local Supabase but does not change an existing hosted project's dashboard settings. Administratively create one email/password owner using Add User. Use a fresh password. Copy its Auth UUID and run:

```sql
insert into public.app_owner (user_id) values ('YOUR_AUTH_USER_UUID');
```

No client may claim or change the owner. A second authenticated user still cannot access the owner's records or files. The `journal` bucket is private, with immutable object paths.

The sign-in screen asks only for a password. `VITE_OWNER_EMAIL` supplies the existing owner's email internally to Supabase Auth; the journal password is unchanged. This is the Supabase Auth user's password, not a Supabase dashboard or database password. The email is a public client identifier, not a secret or an authorization rule; database and storage policies continue to enforce the owner UUID.

If the password is unknown, use “Forgot password?” on the sign-in screen. The reset request goes to the configured owner without an email field. The owner opens the newest email link and chooses a unique password of at least 12 characters. Recovery emails return to `https://commonplace-kainoa-nishidas-projects.vercel.app/?reset=1`, which is explicitly allowlisted in Auth URL Configuration. Keep this exact redirect when moving domains. Reset links expire; request a new link rather than reusing an old one. Passwords are entered by the owner and never sent through chat.

Ignored `.env.local` and `.env.supabase.local` placeholders have been prepared in this checkout. Run `npm run check:setup` to report missing configuration names without printing credential values.

## 2. Frontend connection

Copy `.env.example` to ignored `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
VITE_OWNER_EMAIL=YOUR_OWNER_EMAIL
VITE_DEMO_MODE=false
```

Use a modern public publishable key, never a secret/service-role key. The legacy `VITE_SUPABASE_ANON_KEY` variable remains a compatibility fallback. Run `npm run dev`, sign in, save an entry, reload and verify it in a second authenticated browser. The policies are mandatory even though this is a personal app. `node scripts/check-hosted-access.mjs` verifies public API denial and Auth settings without printing credentials or creating users.

## 3. Gemini and Edge Function

The current hosted project already has `GEMINI_API_KEY`, `GEMINI_MODEL` and `APP_ORIGIN` in Supabase Edge Function secrets. Its dedicated Google project is `gen-lang-client-0890454682` (`675479549987`, Commonplace), on the free API tier. The local secret template is not the source of truth for these hosted values; do not overwrite them with placeholders. The following file-based steps are an alternative for future administrative setup.

For a new environment, create a dedicated Google AI Studio/Google Cloud project and API key. Save this in ignored `.env.supabase.local`:

```dotenv
GEMINI_API_KEY=YOUR_SECRET_KEY
GEMINI_MODEL=gemini-3.5-flash-lite
APP_ORIGIN=https://YOUR_APP.vercel.app
```

Do not reuse a project/key with unrelated applications: the app ledger covers only calls it dispatches. Checked September 22, 2026: [Google restricts 2.5 access for new projects](https://ai.google.dev/gemini-api/docs/models). The adapter now defaults to stable Gemini 3.5 Flash-Lite with medium thinking; the explicit 2.5 Flash option remains for established API projects. Both have reviewed standard rates of $0.30/million input tokens and $2.50/million output tokens including thinking ([pricing](https://ai.google.dev/gemini-api/docs/pricing)). Output is bounded to 8,192 combined tokens with a conservative 16,384-token output reservation. Changing to an unreviewed model fails closed; there is no automatic fallback. Concurrent calls reserve cost before dispatch and uncertain charges remain reserved. Free-tier usage is conservatively counted at paid rates in the app ledger; the ledger is not a provider invoice.

After `supabase login` and `supabase link --project-ref YOUR_PROJECT_REF`:

```sh
supabase secrets set --env-file .env.supabase.local
supabase functions deploy explain
```

Supabase supplies `SUPABASE_URL` and `SUPABASE_SECRET_KEYS` (JSON map, `default` key) to the function, with `SUPABASE_SERVICE_ROLE_KEY` retained as a legacy fallback. Gateway JWT verification is disabled in config because the function explicitly verifies the bearer token through Auth and checks the owner before accessing source content or reserving cost. Do not remove those checks. Missing provider configuration is reported only after authentication and owner authorization.

`APP_ORIGIN` must match the frontend exactly, without a trailing slash. Local hosted-backend testing uses `http://127.0.0.1:5173`; update the secret when switching to production. No wildcard origin.

## 4. Vercel Hobby

The checkout is linked to `kainoa-nishidas-projects/commonplace`, deployed at https://commonplace-kainoa-nishidas-projects.vercel.app . It uses Vite, Node 24, `npm run build`, output `dist`. `vercel.json` supplies routing and response headers. `.vercelignore` permits only application/build inputs; use `vercel deploy --dry --json` to inspect the upload before deploying changes. No paid resource is required.

Set the four public frontend variables above in Vercel. Redeploy after changing them; Vite bakes them into its bundle. Gemini and service-role secrets belong only in Supabase. Set Supabase Auth Site URL and the function's `APP_ORIGIN` to the production origin.

Verify a preview, then promote it. A working setup/login screen alone is not a completed release.

## 5. Production acceptance

- Confirm disabled signup and denied unauthenticated database/file/AI access; confirm an authenticated non-owner cannot access data.
- Create an entry and mark a goal; reload and retrieve both in another authenticated browser.
- Upload the attention PDF, create notes on two dates, link an equation and reopen its reference after resize, zoom and reload.
- Approve exact AI context, run one real explanation, ask a follow-up and insert an editable visual. Evaluate notation, dimensions, scaling, softmax and fidelity using `SCIENCE-SAMPLE.md`.
- Export and restore ZIP; verify notes, files, annotations and visuals. Restore creates copies of notebooks/entries, reuses identical PDFs, preserves colliding daily reflections as entries in “Restored reflections,” and retains current settings.
- Verify billed usage and pending reservations, expired sessions, failed saves and the scheduled trash purge.

Record dated evidence and the production URL in `IMPLEMENTATION-STATUS.md`, without private content or secrets. Do not declare V1 complete before these checks pass.

## Recovery and costs

Budget units are millionths of a dollar; the UTC monthly ceiling is 20,000,000. `ai_requests` preserves idempotency keys, results, actual cost and reservations. Interrupted requests may still bill; review the saved result in the AI panel before issuing a new request. Reconcile unknown charges only after checking provider usage. No automatic billable retries occur.

Previous saved revisions live in `record_versions`. Conflict review displays the saved version before choosing. Each editor has its own local recovery slot, and reload prefers the current window's draft. A successful save clears only matching draft content; other unsaved versions remain available when reopening the note. Explicit sign-out clears all recovery data. Resolve pending drafts before export or trash. This is crash recovery, not offline support. Keep regular private ZIP exports.
