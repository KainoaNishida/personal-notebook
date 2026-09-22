# V1 implementation and release evidence

**Not released.** Local implementation exists; hosted provisioning and real AI evaluation remain open. Updated September 22, 2026.

## Implemented

- React/TypeScript/Vite shell with notebook accents, themes and desktop pane controls.
- Today/history, manual goals, 14-day grid, reflection, search and notebook management.
- CodeMirror live/source Markdown, KaTeX, Mermaid, structured plots and image attachments.
- PDF.js text/region selection, normalized immutable source links and multiple dated paper entries.
- Supabase owner policies, private files, optimistic revisions, local recovery and conflict review.
- Gemini Edge Function with approved context, validated responses, persistent results and atomic $20 UTC monthly reservations.
- ZIP export/restore with ID remapping, recoverable trash and scheduled retention migration.

## Local evidence

Latest completed run: **21 Vitest tests, 15 database behavior checks and 7 Playwright workflows passed**, including the private attention PDF on page 4. TypeScript, Vite production build and Deno function checks passed. The production-browser gate check also passed with `VITE_DEMO_MODE=true` at build time: local preview storage and deep links cannot bypass login/setup. Dependency audit reported zero known vulnerabilities. The PDF itself and test screenshots are ignored/private, not committed.

Inspected browser screenshots in dark/light themes, the PDF/context workspace and a 640-pixel CSS viewport approximating a 1280-pixel window at 200% zoom. Fixed a PDF.js global-style collision discovered during this review. Actual browser zoom and production browser coverage remain part of release acceptance.

Vitest checks dates, geometry, upload limits, Markdown/visual safety, editor blocks, AI schemas and backup references. PGlite executes core and storage migrations with role shims to check owner isolation, concurrency, rollback, trash and AI cost transactions. Playwright checks journal persistence, PDF regions, image/diagram insertion, notebook management and ZIP restore.

The browser adapter is explicitly development-only and has no fake AI. These tests do not establish hosted authentication, Storage service behavior, pg_cron operation or explanation quality. See commands in README.

## Open release gates

1. Supabase project, owner account and Gemini API key have not been created (owner confirmed).
2. Production deployment, migrations and secrets are pending. Vercel's connected deployment tool returned “Tool deploy_to_vercel not found”; CLI/dashboard deployment remains an option once configured.
3. Real cross-session sync, expired sessions, access denial, hosted export/restore and a real AI call must pass.
4. Attention-paper AI evaluation, missing-context/incorrect-premise cases and billed-cost reconciliation require a key.

## Review notes

Local repairs include conflict controls for recovered drafts; draining edits during navigation; malformed recovery JSON; bounded ZIP decompression; daily reflection Markdown export; duplicate-paper restore; light-theme navigation contrast; grouped Markdown blocks; and PDF page/rectangle validation.

Production review must additionally exercise interrupted saves/uploads, cross-session conflicts, long-paper performance and exact 200% browser zoom. Local failure/recovery and two-tab conflict tests pass. The preview is ready for visual feedback; it is not the hosted release.

Portfolio pull-request integration remains the next milestone. Its first-post draft is unpublished; no portfolio files were changed.
