# V1 engineering notes

## Data and services

`src/service.ts` is the application service boundary. Production uses Supabase; a development-only adapter makes synthetic browser verification and UI review possible without impersonating hosted sync or real AI. `src/domain.ts` defines the typed record envelope. SQL migrations enforce owner authorization, core references, immutable document identity, revision checks and cost transactions. JSONB entity data keeps Markdown and its metadata in separate fields while sharing save/concurrency behavior.

`save_record` serializes owner writes and rejects stale revisions. Previous saved data is retained in `record_versions`. The editor retains unsaved text locally, drains edits made during an in-flight save and surfaces conflicts instead of silently overwriting. Programmatic CodeMirror updates are annotated so refreshed server text is not treated as a new user edit. A 20-second query refresh and window-focus refresh synchronize open sessions.

`asset:<uuid>` and `annotation:<uuid>` URLs resolve through authorized records. PDFs have SHA-256 identity; replacement creates a new source. Selections store page and normalized rectangles. Backups validate references and PDF fingerprints, then upload assets and atomically restore remapped records. Failed record restoration rolls back records and attempts orphan-upload cleanup. Backup content is bounded during decompression.

## Editor and future art wrapping

Canonical prose is ordinary Markdown. CodeMirror replaces inactive blocks with rendered widgets and reveals the active block's syntax. Lists, tables and fenced visuals are grouped. Source mode is an escape hatch for precise editing. Image captions remain editable alt text; source links use ordinary Markdown.

The image renderer receives both the unchanged Markdown `asset:<uuid>` reference and separately resolved metadata. A tested `imagePresentation` extension point renders the same Markdown inline or floated at a chosen width while preserving its caption and following prose. Future controls can persist that map separately without rewriting existing entries. Existing references default to inline. Full CodeMirror float hit-testing, drag handles and wrapping controls remain part of the art milestone; they are not exposed as completed V1 features.

## AI

Selections alone never call a model. The contextual panel shows selected text, optional neighboring context and optional crop. Supabase verifies the session/owner, validates source identity, estimates tokens and atomically reserves cost before one Gemini call. The adapter validates structured output and attaches references from the real annotation. User notes remain unchanged until insertion. Explanations, visual artifacts and request outcomes are persisted separately; result history recovers completed calls after a client interruption.

There are no automatic billable retries. Duplicate request IDs cannot dispatch twice. Unknown billing retains the reservation. Rates/model changes require code review, not silent substitution. The ledger is app-scoped; a dedicated provider project is required.

## Verification boundaries

Local tests cover domain behavior, failure recovery, rendered workflows and PostgreSQL policies/transactions. PGlite uses role shims and queues local queries; production concurrency and platform behavior still need hosted verification. Playwright's synthetic/local adapter tests are not proof of live Supabase or AI correctness. Supabase credentials and a real Gemini call are mandatory before release.

On Windows, if the Playwright-managed Vite server does not exit cleanly, start a separate demo Vite server on port 5174 and set `E2E_EXTERNAL_SERVER=true` for the test process. The default managed server works in the Linux CI job. Set `SAMPLE_PDF_PATH` locally to include the private attention-paper test; it is skipped when no sample path is supplied.
