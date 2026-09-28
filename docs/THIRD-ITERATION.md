# Third iteration — September 28, 2026

The [fourth iteration](FOURTH-ITERATION.md) supersedes the writing-view label picker with inline label toggles and direct creation.

Source: the “third iteration” tab of the existing feedback document, reviewed against main `b9b5818`.

## Implemented feedback

1. Removed productive-time forms, totals, history navigation, and paper time logging. `/history` redirects to Today. Historical minutes, backup compatibility, automatic goals, and paper-study records are preserved; no migration is needed.
2. Today now presents compact goals, full-width Activity, Reflection, and today's pages. Activity uses one semantic table for notebook names, date headers, and cells. Each date column is at least 32 px wide; the table scrolls inside its card on narrow screens and notebook names remain sticky. Saved entries and research study dates have exact destinations; empty days do not pretend to be links.
3. Notebook indexes retain search and match-all label filtering and replace date-range controls with ascending/descending date sorting. Query, labels, and sort survive reload. Obsolete date parameters are removed. Page rows include title, date, excerpt, and consistent labels; untitled rows receive a display-only date fallback. Undated legacy papers remain separate.
4. Removed entry deletion controls everywhere, following the explicit choice not to relocate them. Existing trash restoration and revision recovery remain available. No content was deleted.
5. Ordinary Quick Links show only today's entry, without historical outlines or older sections. Historical entries open individually through the index/search. Legacy notebook entry parameters redirect only after checking notebook ownership. Research Quick Links retain their study timeline. Daily IDs, autosaves, conflict handling, and recovery are unchanged.
6. Shared label chips use readable text, colored dots, and a checkmark for selected states. Add labels opens a searchable selection dialog with inline creation; notes remain mounted. Management is a separate dialog with revision-safe create/rename/color edits. Labels remain notebook-specific.
7. Shared color controls provide visible presets, custom hex validation, and previews for label/accent colors. Backgrounds remain restricted to named dark presets. Accent previews show the existing contrast-adjusted effective color. No native color-input sizing depends on global text-input padding.

## Verification

- Production build and password-only/deep-link gate checks pass.
- 45 unit tests and 32 PostgreSQL behavior checks pass, including midnight/return-from-sleep, recovery, authorization, label isolation, legacy backup support, and preserved time data semantics.
- 12 browser workflows pass; one optional private-PDF workflow is skipped without its local fixture. Browser coverage includes automatic goals, PDF annotations, stable long notes, image insertion/captions, concurrent drafts, backup round trips, focused history navigation, sorting, labels, keyboard color selection, narrow layout, and daily rollover.
- Activity geometry is checked at 640, 1024, and 1440 px: headers and cells align within one pixel and day columns meet the 32 px minimum.
- Visual evidence is generated in ignored `test-results/third-*.png`; Today, the notebook index, label management, and color settings are reviewed before release.
- The optional private PDF test requires a locally supplied `SAMPLE_PDF_PATH` and is not part of automated sample-data verification.

## Separate deployment limitation

The canonical production address is `https://commonplace-ashy.vercel.app`. The earlier Supabase AI `APP_ORIGIN` and password-reset allowlist configuration remains a separate outstanding task. This UI release does not change or claim to resolve it. The Google Doc remains unchanged.
