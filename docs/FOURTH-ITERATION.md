# Fourth iteration

Source: [fourth iteration](https://docs.google.com/document/d/1QPICQI0OkPK90svZTx2r-P3HHSfxu7RjKXKZp96Lee4/edit?tab=t.t1adz0ryx4nk). All five items and both screenshots were reviewed against `a224aed`. The Google Doc was not modified.

## Changes and findings

1. **Whole goal cards navigate.** The screenshot identifies Today’s goal cards. Previously, only the notebook heading was a link. Each complete card is now one semantic link, including its icon, status, and padding, with a visible keyboard focus outline. Ordinary cards open today’s writing; research opens its timeline. Sidebar links already covered their complete row.
2. **Compact code blocks.** The opening fence was not being rendered as an extra line. The block reserved 36px of top padding for an absolutely positioned Copy button. Code and Copy now share one grid row with 12px vertical padding. Long code scrolls inside its own column, avoiding overlap. Source text, indentation, highlighting, and copied trailing newlines are preserved.
3. **Inline label selection.** All existing labels for the current notebook appear as toggle chips on the writing page. Selection remains indicated by a checkmark and `aria-pressed`. Add label opens the creation form immediately; successful creation assigns the label and closes the dialog. The current note stays mounted, and existing labels/IDs, duplicate-name checks, color controls, and index management remain intact.
4. **Markdown guide.** A sidebar link directly below Notebooks opens `/help/markdown`. The read-only reference includes copyable examples for code, math, headings, emphasis, lists, tasks, links, footnotes, quotes, dividers, and tables; it also explains paragraphs, images, escaping, and unsupported HTML. Mermaid and JSON plots are under an expandable section. The guide uses the existing password gate and responsive application shell.
5. **Research cursor reliability.** The precise intermittent misalignment was not reproduced. Before changes, a synthetic long note with equations remained aligned after PDF text linking, pane resizing, and reload (drawn and native caret Y coordinates matched; X differed by less than 1px). The editor nevertheless used a separately positioned CodeMirror caret overlay while hiding the actual native caret. It now uses the browser’s native caret/selection, removing that separate coordinate layer. Preview blocks contain their child margins so measured widget heights include Markdown spacing. Source-link/AI insertion also requests scrolling to the insertion point and forms a separate undo transaction. Existing widget size observation and stable editor configuration remain in place.

The cursor change is a targeted mitigation with regression coverage, not a claim that the exact user-reported reproduction was established.

## Compatibility

No schema, API, authorization, or archive-format changes. Daily identities, five-word goal accounting, historical entries and time records, paper study days, PDF/annotation references, label isolation, autosave, and recovery remain unchanged. The separate Supabase production-origin/password-reset configuration issue is not addressed by this UI iteration.

## Verification

Browser regressions cover clicking card padding and keyboard navigation, guide copying and narrow layout, inline label toggling and notebook isolation, and single-line code geometry/copy fidelity. The research regression links actual synthetic PDF text into a long note with equations, expands/restores/resizes panes, replaces a selection and undoes it, clicks rendered prose, reloads, and returns from another study day while checking the native insertion position and saved content.

Local verification passed: 45 unit tests, 32 database behavior checks, production build, 15 browser workflows, and production authentication checks. One optional private-PDF workflow was skipped because its local fixture was not supplied. Formatting and `git diff --check` passed. Screenshots of the guide at desktop/narrow widths, compact code block, and research workspace were reviewed from `test-results/` and remain untracked. GitHub CI also checks the Edge Function types.

## Markdown guide scrolling follow-up

Reproduced wheel scrolling remaining at `scrollTop = 0` over the right margin in a 1920px window: the guide's 1100px maximum width limited the scroll container itself, leaving dead gutters inside the non-scrolling app shell. The outer guide pane now fills the available width; an inner wrapper constrains and centers its content. The pane is focusable and named for keyboard scrolling. Regression checks use real wheel events in the gutter and Home/End navigation at 640, 1440, and 1920px, including the expanded diagrams/plots section. Both focused browser workflows and the production build pass. Previous guide checks used automatic element scrolling and did not cover this failure.
