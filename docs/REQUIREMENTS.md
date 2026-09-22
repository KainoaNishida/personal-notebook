# Product contract: Personal Note Taker

Version 0.4 | September 22, 2026 | Owner and sole customer: Kainoa

Status: the owner approved the V1 implementation plan. The accepted implementation decisions below supersede earlier “proposed” details where they differ. Completion still requires the hosted release gate in [implementation status](IMPLEMENTATION-STATUS.md).

Accepted V1: React/TypeScript/Vite/npm; React Router, TanStack Query and Radix; CodeMirror Markdown live preview/source with KaTeX/Mermaid/plots; PDF.js; Supabase Auth/Postgres/private storage/Edge Functions; Vercel Hobby. One email/password owner, public signup disabled. Today includes optional reflection, manual checkboxes and a 14-day grid. Navigation is Today, Notebooks, Papers, History, Settings. Default timezone America/Los_Angeles; light/dark themes; distinct subject accents. Notebook CRUD/archive, dates/search, 25 MB PDFs and 10 MB PNG/JPEG/WebP images. Explicit AI context preview, follow-ups and editable insertion use Gemini 2.5 Flash with a shared $20/month ledger. Revision saves, local recovery, conflicts, ZIP export/restore and 30-day trash are required. Portfolio PR publishing immediately follows V1; full art wrapping, OCR, offline/mobile-specific design and autonomous agents remain excluded.

## 1. Purpose and success

Build a private place to record what Kainoa did and learned, reflect on each area of life, and revisit those reflections. Journaling is the daily commitment. Other activities are personal aspirations with variable frequency and intensity.

Success means the owner wants to use the interface daily, can see which goals received attention, can study a paper without losing the relationship between its source and their notes, and can turn selected daily material into a public post without exposing the rest of the journal.

**Confirmed priorities:** UI first; science paper workflow next. Specialized art journaling and daily blog creation belong to the intended product. Autonomous assistance and wearable integration are future experiments.

**Confirmed platform:** private web application for computers, synchronized between computers. No mobile or full offline workflow in the current scope. One owner; no public signup or collaboration. **Confirmed design:** Obsidian-like Markdown feel with a distinct visual identity for each notebook. **Confirmed publishing:** editable generated draft; publication only when the owner chooses. Portfolio integration immediately follows the initial journaling/science release, with a first post about this project and its purpose.

## 2. Product shape

Initial subjects: gym, scientific papers, topic research (initially system design), art/portrait drawing or painting, and reading. Daily reflection is a first-class part of the experience.

**Confirmed organization:** persistent subject notebooks containing dated entries, plus a Today page assembling the day's activity and reflection. **Proposed details:** a paper can be studied over multiple days; a date can have several entries in the same subject. Notebook identity, activity tracking, and entries are related but separate: writing a note should not silently mark a goal complete.

**Proposed navigation:** Today, Notebooks, History, and Blog Drafts, with account/sync settings accessible separately. The science workspace retains space for the PDF and notes rather than requiring a permanent AI chat column.

## 3. Requirements and acceptance criteria

### J-01: Daily reflection and flexible activity tracking

**Confirmed:** daily journal, per-subject reflection, and an at-a-glance record of accomplishments. Simple checkboxes are acceptable initially; multi-day tracking is desirable.

**Proposed:** a date picker, freeform daily reflection, activity checkboxes, and access to that date's notebook entries. Unchecked means not marked complete, not failed. No compulsory quotas or streak penalties. Allow historical edits. Start with binary completion; capture duration/counts in prose until structured metrics are requested.

Acceptance:

- The owner can write a reflection, mark gym complete, leave art unchecked, reload, and see both states preserved.
- Multiple entries in one subject on one date are retained; an entry does not require a completed activity.
- Switching dates shows that date's reflection, activity states, and entries without changing another date.
- A chosen timezone determines Today; entries retain their assigned journal date across sync and midnight.

### UI-01: An inviting interface with subject-specific identities

**Confirmed:** interface quality is the leading priority; notebooks should reflect their purposes.

**Proposed direction:** a shared navigation and editing system with differences in typography, palette, spacing, and subject tools. Art emphasizes images and composition; science emphasizes legible equations and source relationships. Gym, reading, and topic research begin with simple tailored journal templates. Visual references and exact themes remain open.

Acceptance:

- The Today page, science workspace, and art notebook receive visual review with the owner before broad feature implementation.
- Notebook identity is apparent without relying on color alone; navigation and save behavior stay consistent.
- Core writing and navigation work by keyboard, focus is visible, and text remains readable at zoom.
- The desktop science view presents both panes together. Smaller computer windows remain usable through resizing or pane switching. Mobile-specific layouts are out of current scope.
- Empty, loading, saving, saved, offline, and error states have deliberate UI treatments.

### N-01: Editing and reliable storage

**Confirmed:** an Obsidian-like Markdown editing feel. **Proposed baseline:** Markdown source editing with live preview, headings, paragraphs, lists, links, image embeds, and rendered math. Entries autosave, remain editable, and expose save/sync status. Exact editor implementation and syntax extensions remain open; full Obsidian vault/plugin compatibility is not implied.

Image wrapping, sizing, and PDF annotation links need metadata beyond ordinary Markdown. Choose a documented extension or sidecar representation and preserve it through save, sync, and export. The prose should stay readable as Markdown; art layout controls should not require writing HTML by hand.

Acceptance:

- A saved entry and its attachments are available after closing and reopening the app and on a second signed-in device.
- A failed save does not display success or discard the current text; retry is available.
- Concurrent edits cannot silently overwrite each other; preserve both versions or present a recoverable conflict.
- An export/restore path preserves entries, dates, attachments, and PDF reference relationships. Format and backup retention are open implementation decisions.
- Basic journaling still works when the AI provider is unavailable.
- Markdown source and preview preserve headings, lists, links, and math through save/reopen; attachment layout and annotation metadata are not silently discarded when switching modes or exporting.

### REF-01: Visual reference material

**Confirmed:** both owner-supplied photos/diagrams and AI-created visual material belong in the notebooks. On request, AI should create and embed equation decompositions, diagrams, and other visual explanations. This is distinct from UI design inspiration. Science generation remains explicitly triggered from selected material; no background generation is implied.

**Proposed baseline:** embed manually added images and source links in both notebook types, and let the owner capture a selected PDF figure/equation region with a link back to its page. Add preview-and-insert for generated visual explanations in the science release. Prefer editable math, diagram descriptions, and plot specifications rendered by the app; reserve generated bitmap illustrations for requests that need them. This is a cost-conscious implementation proposal, not a finalized renderer or model choice. Automatic image search is not required by this clarification.

Acceptance:

- Add a reference image or PDF region, annotate it with Markdown, and reopen it with its caption/source relationship intact.
- Select an equation or passage and explicitly request a visual explanation. Preview and insert an equation decomposition or diagram; preserve it after reload, sync, and export.
- Generated visuals distinguish explanatory illustrations from figures in the paper, retain the originating selection, and have a text explanation. Labels and dimensions are checked for consistency with the source.
- Where a structured renderer is used, retain editable source alongside the rendered view. Invalid output produces an actionable error without corrupting notes; rendering must not execute arbitrary model-generated code.
- Generation and insertion can be canceled or undone. Cost controls apply to visual generation as well as text.

The complete art text-wrapping workflow remains a later milestone.

### ART-01: Image-rich art journaling

**Confirmed:** drag and drop the owner's art and reference art into notes, with prose wrapping around images like an art journal.

**Proposed:** file picker and paste as alternatives, image resize, left/right alignment with text wrapping, full-width placement, captions, and optional artist/source attribution. This is document composition; a freeform drawing canvas is not yet requested.

Acceptance:

- Drop two images into an entry, write between and beside them, resize/reposition them, and preserve the arrangement after reload and sync.
- Wrapped images stack gracefully on narrow screens without covering prose.
- Failed or unsupported uploads explain the issue without removing existing notes.
- Images can be removed from an entry; storage cleanup must account for other entries or drafts that still reference them.
- Reference images stay private unless selected and reviewed for a public draft.

### SCI-01: PDF and notebook side by side

**Confirmed:** PDF on the left, notebook on the right. Highlight a specific PDF passage and create a hyperlink to it in the notes.

**Proposed:** upload a PDF, attach it to a paper record, use resizable independently scrolling panes, select text to highlight, and insert a source reference at the note cursor. Store document identity, page, selected text, and normalized highlight geometry; a page number alone is insufficient.

Acceptance:

- In a selectable-text PDF, highlight a paragraph, insert its reference in an entry, close the app, reopen, and click the reference to return to that page and visible highlight.
- References survive zoom, pane resizing, sync, and multiple days of notes about the same paper.
- Missing or replaced PDFs produce an explicit unresolved reference rather than pointing silently to different text.
- Unsupported, corrupt, or scanned documents have a clear state. Scanned-page/OCR support is an open scope decision; it is not assumed complete through text selection.

### SCI-02: AI explanation of dense analytical material

**Confirmed:** AI should break down equations and difficult analytical details, provide intuition, and insert the explanation into the notebook. Science AI runs only on owner-selected material after an explicit request; opening a paper, writing notes, or highlighting alone must not trigger generation. No automatic background paper analysis.

**Confirmed explanation level:** a college student studying computer science and mathematics, familiar with calculus, linear algebra, data structures, and algorithms. Assume unfamiliarity with specialized concepts and unexplained derivation steps; favor explanation over assuming understanding. Familiar fundamentals establish the starting point, not permission to skip the steps the owner is asking about.

**Proposed interaction:** select a passage/equation, choose Explain, review a generated explanation, then insert it as editable content at the chosen location. Automatic insertion versus preview is open. The explanation should include the question, symbol definitions, relevant assumptions, intermediate reasoning steps, intuition, and a small example where useful. Depth depends on the owner's background.

Source handling must distinguish the paper's statements from explanatory background or inference. Preserve the PDF reference and label generated material as AI-assisted. Render math legibly. When extraction loses equation symbols or context, request clarification or a better selection instead of pretending the input is complete. Image-region selection is a candidate approach, subject to scope and provider decisions.

Acceptance:

- A representative equation from an owner-selected paper receives an editable, rendered explanation with symbol definitions, an intuitive explanation, and a working link back to the source.
- The owner can revise, reject, or undo insertion without affecting their original notes.
- Missing definitions and uncertainty are identified; invented citations are not presented as evidence.
- Cancellation, timeout, and retry preserve notes and do not create duplicate insertions.
- Hosted AI receives only the intended context under the owner's chosen data policy. Extra surrounding context must be explicit and controllable, not an automatic whole-paper submission. The confirmed API budget is at most $20/month across the app's AI features, with a preference for substantially lower actual spending. Provider and API access remain undecided. Existing ChatGPT/Gemini subscriptions are not assumed to cover API use.

Representative validation source: the owner's `attention.pdf`, identified as *Attention Is All You Need*, 15 pages with extractable text. Page 4, equation (1), and the figures on pages 3–4 exercise math extraction and visual source references. See [sample inspection](SCIENCE-SAMPLE.md). This sample does not establish support for all PDFs or scanned pages.

### BLOG-01: Selected daily material becomes an editable blog draft

**Confirmed:** select particular notebooks from a day, create a post about what was learned/done, and highlight important takeaways. The owner edits the draft and chooses when to publish.

**Confirmed first post:** introduce this project, why it exists, and its intended workflow. Distinguish implemented features from plans. A reviewable [initial draft](drafts/first-project-post.md) is prepared locally; it is not published. For this bootstrap post, project notes may be explicitly selected as source material before daily journal entries exist.

**Selected delivery:** submit a GitHub pull request to the portfolio for the owner to review and merge. The app does not auto-merge or directly publish to the live site.

**Proposed:** pick a date and included notebooks/entries, preview the exact text/assets to be used, generate title/summary/body/takeaways, edit, preview, then choose Submit for review. The portfolio adapter creates or updates a PR. Draft generation, PR submission, merge, and deployment are distinct states. Preserve the source selection and generation snapshot so later journal edits do not silently alter a draft, submitted PR, or published post.

Acceptance:

- Selecting science and art for a date excludes gym notes, unselected entries, and other dates from the generation input.
- The output is an editable draft, includes a visible takeaway section, and makes no unsupported claims about what the owner did.
- Generating, editing, or saving a draft cannot publish it.
- The owner reviews included images and public source links; private PDF links are not emitted as working public references.
- Submission returns the PR URL and a pending-review state; retrying reuses the same submission identity rather than creating duplicate PRs/posts. A closed, unmerged PR is not published. Merge and successful deployment are tracked separately; show a live URL only after deployment is verified, otherwise show deployment status as unknown/pending.
- The chosen portfolio format can represent the draft, or the preview clearly identifies unsupported content before publication.

See [portfolio integration](PORTFOLIO-INTEGRATION.md) for verified repository details and unresolved delivery choices.

### COST-01: Low-cost, bounded AI usage

**Confirmed:** $20/month is the API spending ceiling, not a target; seek cheaper ways to deliver the requested functionality. It covers explanation, visual, and blog-generation requests together. Hosting/storage costs are a separate unresolved budget rather than silently included or excluded from a quoted total.

**Proposed controls:** explicit generation only; selection-sized context; bounded output and retries; reuse previously saved results; render structured math/diagrams without a separate image-generation call when appropriate. Compare candidate models on the supplied paper before choosing based on price: equation interpretation can require more capability than ordinary note formatting.

Acceptance:

- Show aggregate monthly usage and remaining app budget across providers and features; identify estimated versus reconciled costs.
- Before dispatch, reserve a conservative upper bound for each request, including bounded output and any visual/tool charges. Concurrent requests must share the same budget ledger. If the cost cannot be bounded, do not dispatch that paid operation until a safe limit is available.
- Refuse new paid requests when spent plus reserved cost would exceed $20. No silent upgrade, unlimited retries, or automatic extra-credit purchase. Journaling and existing explanations remain available.
- Reconcile usage after completion; retain conservative reservations for requests whose billing outcome is unknown. Test parallel requests, failures, month rollover, and retry behavior. Define the monthly accounting boundary during implementation and disclose any difference from provider billing periods.
- Validate current provider prices and account limits when integrating; this document makes no claim about requests per dollar or a provider-enforced hard cap.

### DATA-01: Private, single-owner, synchronized data

**Confirmed:** private application with cross-device sync.

**Proposed requirements:** owner-only authentication and authorization for journal data and attachments; credentials kept out of client bundles; original PDFs and uploads stored durably rather than relying on browser storage as the only copy. Public posts contain only the approved snapshot.

Acceptance:

- An unauthenticated visitor cannot retrieve entries or private attachment URLs.
- A second owner session can load saved text, images, PDF highlights, and drafts.
- Deleting an entry has a recoverable path; retention and permanent deletion behavior are defined before implementation.
- Temporary connection loss is visible and does not discard current writing. Full offline editing, offline PDF access, and offline change merging are out of current scope.

## 4. Conceptual data boundaries

This is a planning model, not a finalized database schema.

| Concept | Responsibility |
| --- | --- |
| Notebook | Persistent subject, type, name, and visual identity |
| Journal day | Assigned local date, timezone context, and general reflection |
| Daily activity | Goal and date, completion state; optional later metrics |
| Entry | Notebook, journal date, Markdown content and extension metadata, timestamps, revision |
| Asset | Private stored image/PDF, metadata, ownership, and usage references |
| Paper | PDF identity plus title and optional authors/source URL |
| Annotation | Paper/page, selected text, geometry, stable reference ID |
| AI explanation | Generated content, source/context references, insertion state |
| Blog draft | Selected source snapshot, editable content/assets, publication state |

Dates and stable identifiers connect views. Public content must not require public access to the private notebook database.

## 5. Delivery boundaries

**Confirmed first usable release:** daily journaling plus the science workspace. Its proposed implementation includes private sign-in and computer-to-computer sync, Today/basic journals, Markdown editing, notebook identities, uploaded and AI-created visual embeds, paper PDF/notes/highlights, explicitly requested equation explanations, and shared API cost controls. Validate art text wrapping early because it affects editor choice, without completing that workflow before the next priority.

**Confirmed next feature:** portfolio integration and the first project-purpose post. Complete the specialized art composition workflow afterward. No publishing action is authorized merely by preparing the draft.

Explicitly deferred: autonomous background agents, automatic exercise research/video collection, WHOOP connection, correlations across health and journal data, advanced habit analytics, reminders, social features, and multi-user support. Simple date history is proposed early; more elaborate tracking is optional.

## 6. Future experiments to retain

- Gym assistant: use routine notes to find relevant videos or papers and propose referenced observations. Define what it may fetch, save, or change before background execution.
- WHOOP: explore owner-authorized data import and relationships with training and daily reflection. Data access, API capability, and useful metrics must be investigated when this becomes active scope.
- Proactive assistant: propose useful research or follow-ups from notebook context; allow review, undo, and control of triggers and spending. No automatic public posting is implied.

These ideas are documented requirements for future exploration, not promises about available integrations or initial-release behavior.
