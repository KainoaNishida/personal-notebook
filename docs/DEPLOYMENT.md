# Private deployment

Use Node 24, a free Supabase project, Vercel Hobby, and a dedicated Gemini API project/key. Do not enable paid infrastructure upgrades automatically. Consumer ChatGPT/Gemini subscriptions do not configure this API. Never paste secrets into chat, commit them, or put them in variables beginning with `VITE_`.

## 1. Supabase project and owner

Create a project in your Supabase organization. Keep its database password in your password manager. The project URL/reference can be shared for setup assistance; passwords, service-role keys and Gemini credentials must remain private.

Run these SQL files in order using the Supabase SQL editor, or link the Supabase CLI and run `supabase db push`:

1. `supabase/migrations/202609220001_workspace.sql`
2. `supabase/migrations/202609220002_storage.sql`
3. `supabase/migrations/202609220003_retention.sql`

The third enables pg_cron and schedules daily removal of expired entry trash and revision history. Verify the job in the Cron dashboard. Files are retained because other entries may reference them. The local PGlite harness does not run pg_cron.

In Authentication, disable new signups and anonymous sign-ins. `config.toml` sets this for local Supabase but does not change an existing hosted project's dashboard settings. Administratively create one email/password owner using Add User. Use a fresh password. Copy its Auth UUID and run:

```sql
insert into public.app_owner (user_id) values ('YOUR_AUTH_USER_UUID');
```

No client may claim or change the owner. A second authenticated user still cannot access the owner's records or files. The `journal` bucket is private, with immutable object paths.

Ignored `.env.local` and `.env.supabase.local` placeholders have been prepared in this checkout. Run `npm run check:setup` to report missing configuration names without printing credential values.

## 2. Frontend connection

Copy `.env.example` to ignored `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
VITE_DEMO_MODE=false
```

Use the public anon key, never the service role key. Run `npm run dev`, sign in, save an entry, reload and verify it in a second authenticated browser. The policies are mandatory even though this is a personal app.

## 3. Gemini and Edge Function

Create a dedicated Google AI Studio/Google Cloud project and API key. Save this in ignored `.env.supabase.local`:

```dotenv
GEMINI_API_KEY=YOUR_SECRET_KEY
GEMINI_MODEL=gemini-2.5-flash
APP_ORIGIN=https://YOUR_APP.vercel.app
```

Do not reuse a project/key with unrelated applications: the app ledger covers only calls it dispatches. Review current [Google model availability and API pricing](https://ai.google.dev/gemini-api/docs/pricing) before deployment. The adapter permits Gemini 2.5 Flash at $0.30/million input tokens and $2.50/million output tokens including thinking. Changing to an unreviewed model fails closed. Concurrent calls reserve a conservative maximum before dispatch; uncertain charges remain reserved.

After `supabase login` and `supabase link --project-ref YOUR_PROJECT_REF`:

```sh
supabase secrets set --env-file .env.supabase.local
supabase functions deploy explain
```

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function. Gateway JWT verification is disabled in config because the function explicitly verifies the bearer token through Auth and checks the owner before accessing source content or reserving cost. Do not remove those checks.

`APP_ORIGIN` must match the frontend exactly, without a trailing slash. Local hosted-backend testing uses `http://127.0.0.1:5173`; update the secret when switching to production. No wildcard origin.

## 4. Vercel Hobby

Import the repository or deploy with Vercel CLI from this directory. Select Vite, Node 24, `npm run build`, output `dist`. `vercel.json` supplies routing and response headers. No paid resource is required.

Set the three public frontend variables above in Vercel. Redeploy after changing them; Vite bakes them into its bundle. Gemini and service-role secrets belong only in Supabase. Set Supabase Auth Site URL and the function's `APP_ORIGIN` to the production origin.

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

Previous saved revisions live in `record_versions`. Conflict review displays the saved version before choosing. Local unsaved drafts clear after a successful save or explicit sign-out. This is crash recovery, not offline support. Keep regular private ZIP exports.
