# V1 implementation and release evidence

**Deployment in verification; not released.** The frontend and private Supabase backend are deployed. Real journal/AI workflow acceptance remains open. Updated September 22, 2026.

## Implemented

- React/TypeScript/Vite shell with notebook accents, themes and desktop pane controls.
- Today/history, manual goals, 14-day grid, reflection, search and notebook management.
- CodeMirror live/source Markdown, KaTeX, Mermaid, structured plots and image attachments.
- PDF.js text/region selection, normalized immutable source links and multiple dated paper entries.
- Supabase owner policies, private files, optimistic revisions, local recovery and conflict review.
- Owner password recovery with explicit email request, expired-link handling and a confirmed new-password form.
- Gemini Edge Function with approved context, validated responses, persistent results and atomic $20 UTC monthly reservations.
- ZIP export/restore with ID remapping, recoverable trash and scheduled retention migration.

## Local evidence

Latest completed run: **25 Vitest tests and 16 database behavior checks passed**. Four new authentication tests cover explicit reset requests, password mismatch, failed update, recovery-session reload and expired links. The earlier **7 Playwright workflows passed**, including the private attention PDF on page 4. TypeScript, Vite production build and Deno function checks passed. The production-browser gate check passed again after the hosted connection was configured; an earlier run also checked `VITE_DEMO_MODE=true` at build time. Local preview storage and deep links cannot bypass login/setup. Dependency audit reported zero known vulnerabilities. The PDF itself and test screenshots are ignored/private, not committed.

Inspected browser screenshots in dark/light themes, the PDF/context workspace and a 640-pixel CSS viewport approximating a 1280-pixel window at 200% zoom. Fixed a PDF.js global-style collision discovered during this review. Actual browser zoom and production browser coverage remain part of release acceptance.

Vitest checks dates, geometry, upload limits, Markdown/visual safety, editor blocks, AI schemas and backup references. PGlite executes core and storage migrations with role shims to check owner isolation, concurrency, rollback, trash and AI cost transactions. Playwright checks journal persistence, PDF regions, image/diagram insertion, notebook management and ZIP restore.

The browser adapter is explicitly development-only and has no fake AI. These tests do not establish hosted authentication, Storage service behavior, pg_cron operation or explanation quality. See commands in README.

## Hosted setup evidence

- Supabase project `ahounsstpphwamgbptiu`, free tier, US West; all four versioned migrations applied. Filenames match deployed migration history.
- Confirmed owner account is assigned in `app_owner`. Public registration and anonymous sign-ins are disabled.
- `journal` is private with a 25 MB bucket limit. The daily trash purge is scheduled and active; a completed scheduled run has not yet occurred.
- All public tables have RLS. Hosted default grants exposed privileged functions during the initial schema review; migration four revoked those grants before the owner account was connected. The database regression harness now reproduces Supabase's direct default grants.
- Verified the permission matrix directly: anonymous role has no function execution, and billing/retention functions are service-role only. Remaining advisor warnings are the six intentionally callable, explicitly owner-checked authenticated RPCs; two server-only tables intentionally have no client policies. Performance advice now contains only unused indexes in the new database.
- **8 public HTTP checks passed**: database/RPC/AI requests denied without sign-in, storage listing returns no files, and signup/anonymous Auth disabled. Owner identity and $20 budget RPC also verified under the authenticated database role.
- Vercel project `commonplace` is linked and deployed on the basic build machine. URL: https://commonplace-kainoa-nishidas-projects.vercel.app . The production login UI and served HTML are verified. Deployment uploads are restricted to application/build files; environment files, documents and private content are excluded.
- Dedicated Google project `gen-lang-client-0890454682` (number `675479549987`, Commonplace) is on the free API tier. Its owner-created key is stored only in Supabase Edge Function secrets. `GEMINI_MODEL=gemini-3.5-flash-lite` and the production `APP_ORIGIN` are configured. Actual provider access remains unverified until an authenticated request runs.
- Password-recovery deployment `dpl_J4r8KMteeqesCEUhR1j6Sdk2LhZS` is promoted. Hosted reset-request UI was inspected, and the exact `/?reset=1` redirect is allowlisted. Opening that URL without a recovery session correctly displays an expired/missing-link message without access to the workspace. Owner reports not knowing the initial password; the recovery screen is ready for the owner to request a link and choose a password privately.

## Open release gates

1. Owner must complete password recovery and sign in. Password entry/submission is a user-only step under the Browser credential policy; no password is stored in project files.
2. Google now restricts Gemini 2.5 to existing users. Gemini 3.5 Flash-Lite is configured at the same reviewed standard token rates; no automatic model fallback is allowed. Real provider access is still pending.
3. Real cross-session sync, expired sessions, access denial, hosted export/restore and a real AI call must pass.
4. Attention-paper AI evaluation, missing-context/incorrect-premise cases and billed-cost reconciliation require authenticated hosted tests.

## Review notes

Local repairs include conflict controls for recovered drafts; draining edits during navigation; malformed recovery JSON; bounded ZIP decompression; daily reflection Markdown export; duplicate-paper restore; light-theme navigation contrast; grouped Markdown blocks; and PDF page/rectangle validation.

Production review must additionally exercise interrupted saves/uploads, cross-session conflicts, long-paper performance and exact 200% browser zoom. Local failure/recovery and two-tab conflict tests pass. The preview is ready for visual feedback; it is not the hosted release.

Portfolio pull-request integration remains the next milestone. Its first-post draft is unpublished; no portfolio files were changed.
