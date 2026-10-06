# Graphite interface

Implemented October 5, 2026 (Pacific), starting from `3d6fec8`, which includes account-based work-hours synchronization. The approved direction combines the Warm paper layout in [Figma](https://www.figma.com/design/7jjOecu87t9DUTwi1NfBS5?node-id=3-116) with the selected Graphite palette. The [Today reference](https://www.figma.com/design/7jjOecu87t9DUTwi1NfBS5?node-id=3-115) was adapted to retain the existing 14-day tracker and the newer actual-hours and earnings functionality.

## Implementation

- `src/styles/graphite.css` owns the visual system and responsive shell. Superseded declarations were removed from `src/style.css`, which retains editor, PDF, dialog, and feature structure.
- Shared colors: background `#1c1d20`, sidebar `#151619`, panel `#25262a`, raised `#2d2f34`, border `#3c3e45`, text `#eceef1`, muted `#adb2bc`, accent `#c9ced9`, selected `#363a43`, and empty Activity cells `#2a2c31`. Custom backgrounds and contrast-normalized accents remain editable. Reset colors restores Graphite.
- IBM Plex Sans is the interface face; Lora is used for page headings, entry titles, and prose; IBM Plex Mono is used for source, code, and hour totals. Fonts are pinned Fontsource dependencies, served with the app. The corresponding SIL Open Font Licenses ship under `public/font-licenses/`. CodeMirror remeasures when fonts load without remounting or changing document history. Its syntax highlighter uses readable dark-theme colors, including theme-aware Markdown and annotation URLs.
- Navigation is 224 px on desktop, a 64 px rail below 850 px, and drawer-only below 540 px. Search sits below the brand. A Radix drawer makes search, Quick Links, Settings, and sign-out available on narrow screens, with focus containment, Escape dismissal, and focus return to the opener. Today and Notebooks remain the primary destinations.
- The 64 px context bar contains the notebook name and All pages / Back to pages. Ordinary writing content is at most 992 px, with responsive gutters and a 420 px desktop canvas. Date and save status share a row; labels, optional title, formatting tools, and prose follow. Save conflicts can expand to the full writing width. Research keeps its existing split-pane controls and source links.
- Full-width panes own scrolling, including the area outside their bounded content. Today retains its section order, automatic goals, all 14 Activity columns, aligned dates, sticky notebook names, and cell destinations. Goal cards are visually lighter.
- The hours card separates task times and their seven-times maximum from actual work and daily earnings. All-time hours and earnings share the footer. All sync, validation, pending-write recovery, conflict resolution, daily rollover, and opening-balance calculations are unchanged.
- Hover/focus feedback and dialog entry use 140–160 ms transitions. Reduced-motion preferences disable both transitions and animations. Editor layout, typing, and the caret are not animated.

No database schema, backup format, public route, note identity, progress accounting, or recovery key changed. The separately approved account appearance switch is a one-time settings save through the existing revision-checked API; it preserves timezone, Life notebook, and all other settings. The frontend does not force Graphite again after a later customization.

## Verification

Run with Node 24.21.0:

- 96 unit tests across 14 files passed; strengthened theme assertions cover exact defaults, retained customization, and contrast on panels and selected surfaces.
- 36 database behavior checks passed against PostgreSQL via PGlite, including owner isolation, atomic progress, revision conflicts, and work-time import/restore.
- TypeScript and the production build passed. Edge Function Deno type checking passed.
- The full browser suite passed 23 workflows. The optional private attention-PDF fixture was skipped because that local file is not supplied. Synthetic PDF selection, annotations, zoom, pane resizing, cursor position, undo, and reload were exercised.
- New Graphite workflows cover desktop sidebar collapse, narrow-screen drawer search, keyboard focus containment/return, retained editor identity during navigation overlays, draft persistence, custom appearance/reload/reset, reduced motion, and scrolling over the outer gutter at 1920 px.
- Rendered screenshots reviewed at 640, 1024, and 1440 px for writing and Today/hours, plus the 390 px drawer, notebooks, indexes, Settings, and research split panes. Markdown guide scrolling, focus return, and copying remain covered by browser regressions. Existing geometry assertions verify Activity headers match cells and day columns remain at least 32 px.
- Production-build authentication checks passed: password-only gate, centered desktop/narrow layout, and no bypass using preview storage or deep links. Hours still migrate and synchronize between independent browser contexts through the real application transport and PostgreSQL-backed RPC test harness.

Screenshot output is generated under ignored `test-results/`. CI runs the same unit/database/build/browser/authentication/type-check sequence on each push. Release verification must also confirm the canonical production deployment is serving the pushed SHA. The separate Supabase production-origin/recovery-redirect configuration issue is outside this UI change.
