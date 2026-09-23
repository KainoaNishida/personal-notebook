# V1 implementation and release evidence

**Deployed for owner use; final acceptance remains open.** The hosted journal → PDF selection → AI explanation/follow-up → inserted visual → reopen workflow passes. The owner reports no obvious usability issues so far. Independent-browser synchronization confirmation remains pending. Updated September 22, 2026 (Pacific time).

Live app: https://commonplace-kainoa-nishidas-projects.vercel.app

## Implemented

- React/TypeScript/Vite shell with notebook accents, light/dark themes and desktop pane controls.
- Today/history, manual goals, 14-day grid, reflection, search and notebook management.
- CodeMirror live/source Markdown, KaTeX, Mermaid, structured plots and image attachments.
- PDF.js text/region selection, normalized immutable source links and multiple dated paper entries.
- Supabase owner policies, private files, optimistic revisions, local recovery and conflict review.
- Owner password recovery with explicit email request, expired-link handling and a confirmed new-password form.
- Gemini Edge Function with approved context, validated responses, persistent results and atomic $20 UTC monthly reservations.
- ZIP export/restore with ID remapping, recoverable trash and scheduled retention migration.

## Automated verification

Latest full behavior run: **29 Vitest tests, 7 Playwright workflows and 16 database behavior checks passed**. TypeScript, Vite production build and Deno function checks pass. Public hosted access checks passed after private notes, files and AI results existed. An earlier production-build test verified that development preview storage cannot bypass authentication; dependency audit reported zero known vulnerabilities.

Vitest covers dates, geometry, upload limits, Markdown/visual safety, editor blocks, AI schemas, backup references, password recovery and overlapping saves. Recovery tests now include three editor instances: one successful save and two losing drafts, followed by separate recovery review without deleting the other draft.

PGlite executes migrations with role shims to check owner isolation, direct function grants, stale revisions, storage restrictions, restore rollback, trash, duplicate request IDs, concurrent budget reservations, ambiguous billing and UTC month rollover. It does not run hosted Auth, Storage or pg_cron.

Playwright covers manual goals, Markdown, images, diagrams, undo, search, notebook controls, trash, export/restore, conflict reload, PDF region links and the supplied attention paper. The private PDF and screenshots are excluded from Git. Dark/light layouts were inspected, including a 640-pixel CSS viewport approximating a 1280-pixel window at 200% zoom; actual browser zoom remains unverified.

## Hosted setup and security

- Supabase project `ahounsstpphwamgbptiu`, free tier, US West; all four versioned migrations applied. Migration filenames match deployed history.
- The owner completed password recovery and signed in inside Codex. Public signup and anonymous sign-in are disabled. The exact production `/?reset=1` redirect is allowlisted; a missing recovery session displays an expired/missing-link message.
- All public tables have RLS. Migration four revoked Supabase's direct default function grants before connecting the owner. Anonymous role cannot execute private RPCs; billing and retention functions are service-role only. Remaining advisor warnings correspond to six intentionally callable owner-checked RPCs and two server-only tables without client policies.
- **8 public HTTP checks passed** after real data existed: anonymous database/RPC/AI access denied, private storage listing empty, and signup/anonymous Auth disabled. Owner and non-owner database role checks also pass.
- The private `journal` bucket enforces a 25 MB limit. Daily trash purge is scheduled and active; its first completed scheduled run has not yet been observed.
- Vercel runs the basic build machine. Deployment uploads include only application/build files; environment files, documents and private content are excluded. Latest production deployment: `dpl_8HwbdsawPkBezZcS2QgdBDKiHFnV`, adding clean history/excerpt labels to the verified recovery build `dpl_FNEfsC4cVCyEBBAJR4qsoq6AqVoL`.
- Dedicated Google project `gen-lang-client-0890454682` (`675479549987`, Commonplace) is on the free API tier. Its key is stored only in Supabase Edge Function secrets. `GEMINI_MODEL=gemini-3.5-flash-lite` and production `APP_ORIGIN` are configured; `explain` version 6 is active. Google restricts new-project Gemini 2.5 access; the replacement uses the same reviewed standard token rates and no automatic fallback.

## Hosted workflow evidence

1. **Journal:** “Setup check — journal synchronization” saves and reopens. Manual Reading completion survived reload and was then returned to its original unchecked state. Creating an entry did not mark a goal. The owner's own notes and Life notebook are preserved.
2. **Paper:** the supplied 15-page attention PDF is in private storage. Notes on September 21 and 22 are associated with the same immutable paper; History shows the correct dated note. Equation (1) on PDF page 4 has a saved normalized region and cropped image. Its source link returns from another page to page 4 after reload/zoom.
3. **Real AI:** three explicitly approved requests completed. The initial explanation correctly covers Q/K/V dimensions, scaled dot products, variance assumptions, row-wise softmax and output dimensions. Follow-ups corrected an incorrect column-softmax premise and acknowledged an undefined gamma instead of inventing its meaning. The useful explanation, equation decomposition and corrected diagram were inserted and persisted. Merely opening/highlighting/reopening made no additional request.
4. **Cost reconciliation:** three complete requests total **16,727 micro-USD ($0.016727)** with zero outstanding reservations. This is a conservative estimate from actual provider token usage at configured paid rates, not a charge or invoice; the project currently uses the free API tier.
5. **Export/restore:** a real ZIP downloaded to the owner's Downloads directory. Its versioned manifest, 22 records, portable annotation references and original PDF bytes were checked. Restoring produced 20 copied records while reusing the identical PDF. Restored notes, diagram, equation decomposition and remapped source/region image links reopened correctly. Imported test notebooks were archived and imported test entries moved to recoverable trash; original content was preserved.
6. **Conflict recovery:** simultaneous edits in two production tabs produced a conflict. After reloading the losing tab, its unsaved text remained, the saved version was available for comparison, and “Save my recovered version” succeeded. The test note was returned to clearly labeled verification content.

## Repairs from running-interface review

- PDF page navigation no longer jumps back on server refresh; an explicit source-link click still returns to its region. CodeMirror lets interactive preview links receive clicks before hiding their widget.
- Mermaid accepts ordinary arrows inside quoted labels while rejecting HTML, click actions and directives; rendering stays in strict mode with HTML labels disabled. The provider prompt requires quoted labels and one statement per line. A malformed first diagram remains safely inspectable in history; the corrected diagram was inserted and visually verified.
- Unsaved recovery slots are unique to each editor instance. A tab remembers its own slot across reloads; successful saves remove only matching content, and other versions remain available for review. Legacy recovery drafts remain readable. Trash/export guard against pending drafts, and explicit sign-out clears recovery data.
- Historical entry lists use date-appropriate wording; entry excerpts hide Markdown link destinations so internal annotation IDs do not dominate the list.

## Remaining acceptance and limits

- The owner has been asked to confirm the synchronization-check entry in the independently authenticated regular browser. Two Codex tabs verify server synchronization and conflicts but share an Auth session; they do not replace this confirmation.
- The owner reports no obvious writing/navigation/science-workspace issues in the initial walkthrough. Actual 200% browser zoom, session expiry during editing, interrupted hosted uploads and long-paper performance remain unverified. Failed-save recovery is covered locally; unauthorized hosted requests are denied. These limits must remain visible rather than treating a successful build as full acceptance.
- Observe the first scheduled retention run after its scheduled time; the transaction behavior is already covered by database tests.
- AI output remains editable and reviewable. One uninserted follow-up used an unstated assumption in a numerical illustration, and another had literal newline escapes. The inserted explanation and diagram passed the stated attention-equation checks; this is not a general correctness guarantee.

Portfolio pull-request integration remains the immediate next milestone. The first-post draft is unpublished and no portfolio files were changed.
