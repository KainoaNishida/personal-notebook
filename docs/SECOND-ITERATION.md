> Third-iteration feedback supersedes the time-entry UI, ordinary chronological Quick Links, date-range filters, and entry deletion controls. See [THIRD-ITERATION.md](THIRD-ITERATION.md). Historical data remains intact.

# Second iteration

Scope: the second-iteration feedback tab only, based on `ec51a86`. The Google Doc is unchanged. Portfolio integration and automatic topic classification remain outside this release.

## Behavior and implementation evidence

| Feedback | Implementation |
| --- | --- |
| 1, 11 | Viewport-bounded application shell, internally scrolling sidebar/content/PDF/notes, explicit sidebar spacing and contained overscroll. |
| 2, 18 | Current-day-only heading with full date. `useJournalDate` follows the journal timezone and updates at midnight, focus, and visibility changes. Historical pages live in notebook indexes. |
| 3 | Integer minutes per notebook/date, hours/minutes controls, today total, historical daily editing and date/notebook filters. Saving research time associates an optional paper without adding minutes to the study record. |
| 4 | Topic-tree proposal below; no taxonomy or automatic classification has been implemented. |
| 5–8 | Newest-first dated sections, today’s empty section, date/title outline, one active editor, inactive Markdown. Old entry links select the corresponding section. Secondary section menu holds recoverable deletion. |
| 9 | Date-grouped research timeline and date/paper outline. Visits, saved paper edits, and time associations create idempotent study records. Each paper retains one continuous note. Undated legacy papers remain explicit. |
| 10 | Production-domain access must be verified separately in Vercel settings; see deployment instructions. The application password gate and owner authorization remain enforced. |
| 12 | Accessible notebook icon picker including code; migration updates the existing Comp Programming notebook without changing its ID. Research identity is stored independently of its visual icon. |
| 13, 14 | Removed persistent Live preview label. Centered images with optional Markdown captions, empty upload caption, non-destructive suppression of filename-derived captions. |
| 15 | Notebook-scoped colored labels and revision-safe rename/edit; same-notebook references enforced in database and archive validation. Cards open searchable/date-filtered/match-all-label indexes. Filters persist in URLs. Research indexes show each paper once. |
| 15a, 16 | Quick Links open writing/timeline routes. Creation stays on Notebooks. Reordering controls removed; new notebooks append to existing order. |
| 17 | Dark background palette and accent customization. Legacy light appearances normalize to dark. |
| 19 | Five saved new body words across a notebook complete its daily goal automatically. Completion latches, including across deletion. Historical manual completion remains. |
| 20 | Activity rows show notebook names and accessible date/status labels. Narrow grids scroll internally. |
| 21 | Stable CodeMirror context and callbacks, per-image widget dependencies, unchanged widget reuse, async size measurement, minimal remote transactions outside local undo, synchronous recovery plus bounded server-save debounce, mapped upload insertion anchors. |

## Data and recovery

The additive migration adds `label`, `writing_progress`, and `study` records inside the existing owner-isolated envelope. New RPCs check owner identity, serialize changes with the existing owner advisory lock, and retain compare-and-swap revisions. Content and progress commit atomically. Failed/conflicting writes never update progress. Direct client mutation of progress/study records is rejected.

Each entry/day records a shared baseline of normalized body-word occurrences and its maximum observed number of additional occurrences. Reordering, formatting, image metadata, and link destinations do not add words. Repeated words count by occurrence. The notebook totals these high-water counts; reaching five sets completion once. Title and label edits do not count. Deleted text does not reduce earned progress. Local drafts retain their writing-day context across recovery and midnight; a new clean editing burst takes the current journal day. Tracking begins at migration rollout, with no inferred historical words or minutes.

Time updates preserve completion and use the activity revision to reject stale totals. Study records contain no minutes. Historical study dates are reconstructed only from consecutive revisions with changed body content; consolidation-generated sections are excluded. Original consolidated entries and versions remain retained.

Archive manifest version 2 includes labels, minutes, progress and study records, while version 1 remains accepted. Remapping includes label and entry references. Restore bypasses writing credit, extends an existing baseline for imported additions, and deduplicates existing paper/day study records.

## Deferred research-topic proposal

Start with two roots: **Mathematics** and **Computer Science**. Mathematics could contain linear algebra, probability/statistics, analysis, optimization, and discrete mathematics. Computer Science could contain algorithms/data structures, systems, programming languages, machine learning, and theory. Topics should have stable IDs, editable names, one primary parent, optional cross-links, and manual paper associations; a paper may belong to several topics.

Begin with a searchable outline, then add an optional graph when enough associations exist to make it useful. Keep notebook labels separate: they describe an entry's workflow or focus, while topics describe reusable subject matter. Future AI classification should produce suggestions with source excerpts and confidence, require explicit review before applying changes, and allow rejection/undo. No background classification or paid generation should run automatically.

## Verification

Baseline: 36 unit tests and 24 PostgreSQL behavior checks passed before implementation. The expanded suite covers saved-word thresholds, formatting/filename exclusion, imports, label isolation, activity time, owner access, recovery days, midnight updates, captions, navigation, long-note cursor/scroll/undo, and URL filters. Browser workflows use synthetic PDFs and images; the optional private-PDF test requires `SAMPLE_PDF_PATH` and is not part of the committed fixtures.

Run `npm test`, `npm run test:db`, `npm run build`, `npm run test:e2e`, `npm run test:production`, and `npx deno check supabase/functions/explain/index.ts` with Node 24. Apply the migration before publishing the dependent frontend. Hosted checks and final delivery outcomes are recorded below once verified.


### Verified release evidence — September 26, 2026

- Node 24.21.0 and the committed dependency lockfile; no dependency changes.
- 45 unit tests and 32 PostgreSQL behavior checks pass.
- Ten browser workflows pass across the full suite and the additional chronological-section check; the optional private-PDF fixture is skipped because it was not supplied.
- Production build, production password/deep-link gate checks, and Edge Function type checking pass.
- Hosted migration `20260926222912_second_iteration` is applied. The local file was aligned with the migration service's generated version after application.
- A hosted transaction exercised four/five-word completion and then rolled back. Zero synthetic notebooks remained. A fingerprint across all 27 existing entry/paper/asset/annotation/day records was identical before and after migration.
- All 11 hosted anonymous access checks pass, including the new tracking/time RPCs. A separate rolled-back transaction under the authenticated database role with a non-owner subject confirmed zero readable records and rejection of entry writes. Private file listing exposes no files, and signup/anonymous sign-in remain disabled.
- Security advisors retain the existing deliberate owner-checked RPC/deny-all-table notices and leaked-password-protection configuration advisory. No new exposed table was created.
- Signed-in Vercel settings confirm Standard Protection is already enabled and `https://commonplace-ashy.vercel.app` is the production domain. Anonymous requests return HTTP 200 and the journal password gate; generated deployment URLs remain protected. The project is now connected to GitHub. The previously deployed version was `63583e5`; release verification and canonical-origin recovery/AI configuration remain pending.
