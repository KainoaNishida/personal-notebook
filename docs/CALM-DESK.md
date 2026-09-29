# Calm desk writing experience

Implemented against `0490856`, with remote main unchanged at the start.

- Ordinary and historical entries use a responsive 1,100 px page and a 420 px desktop writing canvas. Research and reflection panes retain their existing sizing.
- Shared CodeMirror toolbar supports bold/italic, headings 1–3, inline/fenced code, inline/display math, links, uploads, lists/tasks/quotes, and source/live preview. Commands retain the selection, insert editable placeholders, and undo as one operation. Cmd/Ctrl+B and Cmd/Ctrl+I are supported.
- The Markdown guide opens in a bounded, keyboard-scrollable Radix dialog, returning focus to its trigger. Existing `/help/markdown` links still work. The sidebar now contains Today and Notebooks; no Research tab was added.
- Calm desk is the default dark palette. Explicit saved colors remain valid, and Reset colors restores the new default. Selection and Activity use shared tokens.
- Today’s goals, 14-day Activity table, reflection, pages, and destination links retain their structure.

## Verification

Unit tests cover formatting ranges, placeholders, embedded code fences, body-word invariance, legacy/custom appearance, and contrast. Browser coverage exercises toolbar selection, shortcuts, undo/redo, save/reload, helper scrolling and focus return, plus the existing Activity, midnight, image, annotation, and long-note regressions. Screenshots reviewed at 640, 1024, and 1440 px.

Local verification: 58 unit tests and 33 database checks passed; 17 browser workflows passed. Production build, production-mode authentication smoke tests, and Edge Function type checking passed.

The optional private attention-PDF test remains skipped without its external fixture. Synthetic PDF tests remain included.

## Narrow implementation deviation

Testing found existing numbered-list markers earned body-word credit. An additive function-only migration, `formatting_word_markers`, and the matching browser normalization exclude ordered-list and task-checkbox markers. This is necessary for toolbar formatting to remain neutral. No table schema, saved content, prior completion, backup format, or authorization changes were made. The migration was applied before the frontend release and a hosted synthetic query confirmed zero added words.

Database security review retained existing owner-checked RPCs and deny-all internal tables. Existing Supabase leaked-password protection and production-origin configuration concerns remain separate deployment items. Supabase function documentation: https://supabase.com/docs/guides/database/functions

CI initially exposed a platform-specific redo test shortcut: CodeMirror uses Cmd+Shift+Z on macOS and Ctrl+Y on Linux/Windows. The browser test now selects the platform shortcut.
