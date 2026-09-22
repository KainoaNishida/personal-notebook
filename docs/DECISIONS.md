# Questions and decisions

Updated September 22, 2026. Unanswered questions are not approval of their proposed defaults.

## Approved V1 plan (supersedes earlier open items)

The owner explicitly approved React/TypeScript/Vite, Supabase, Vercel Hobby, CodeMirror live Markdown, PDF.js and Gemini 2.5 Flash with conservative atomic cost reservations. Hosting starts on free allowances without automatic paid upgrades. Completion is manual; reflection is optional and separate. Include notebook management, history/search, source links, selected context approval, structured visuals, revision recovery, ZIP backups and 30-day trash. Use a dark shell with notebook accents plus a light toggle. Inline images ship first; art wrapping and portfolio publishing do not ship in V1. See the version 0.4 contract and implementation status.

The owner needs to create Supabase and Gemini credentials. No live API entitlement is assumed from consumer subscriptions. Fresh secrets/passwords stay outside chat and Git.

## Confirmed

| ID | Decision | Source |
| --- | --- | --- |
| D-01 | Kainoa is the sole customer; this is a personal tool. | Initial brief |
| D-02 | Daily journaling anchors flexible personal goals. | Initial brief |
| D-03 | UI is the first priority, scientific paper tools second. | Initial brief |
| D-04 | Private web application, desktop-first, with device sync. | Owner answer, September 22 |
| D-05 | Each notebook should have its own visual identity. | Owner answer, September 22 |
| D-06 | Generate editable blog drafts; publish only when the owner chooses. | Owner answer, September 22 |
| D-07 | Autonomous assistance and WHOOP are future experiments. | Initial brief |
| D-08 | Persistent subject notebooks with dated entries and a Today page. | Owner answer, September 22 |
| D-09 | Science AI is explicitly invoked for selected material; no automatic analysis. | Owner answer, September 22 |
| D-10 | Explain for a CS/math college student with calculus, linear algebra, and algorithms fundamentals; favor explaining unfamiliar steps. | Owner answer, September 22 |
| D-11 | Owner has ChatGPT and Gemini subscriptions and is open to using them if supported. This does not establish API access, a spending budget, or a complete data policy. | Owner answer, September 22 |
| D-12 | Obsidian-like Markdown feel. Exact live-preview implementation remains proposed. | Follow-up answer, September 22 |
| D-13 | Entirely computer-based; full offline work is unnecessary for now. Sync remains required. | Follow-up answer, September 22 |
| D-14 | Representative PDF supplied: Attention Is All You Need; inspection recorded in SCIENCE-SAMPLE.md. | Follow-up answer and local inspection |
| D-15 | Science and art support owner-supplied photos/diagrams and explicitly requested AI-created equation decompositions, diagrams, and visual representations, embedded in notes. UI inspiration is separate. | Clarified owner answer, September 22 |
| D-16 | API budget ceiling: $20/month, with a preference to spend less. Provider remains undecided; hosting/storage budget is separate and unresolved. | Clarified owner answer, September 22 |
| D-17 | First release: daily journaling and science. Immediately next: portfolio integration, first post about this project and its purpose. Complete art workflow follows. | Follow-up answer, September 22 |
| D-18 | Use GitHub pull requests for portfolio review before the owner merges and deploys; no automatic merge/publication. | Owner preference adopted, September 22 |

## Questions for refinement

### Resolve before choosing infrastructure and editor

1. **Organization: resolved** by D-08: persistent subject notebooks plus Today.
2. **Scientific background and sample: resolved** by D-10/D-14. The sample has extractable text; page 4 equation (1) is the initial validation case. Scanned-document support remains deferred unless requested.
3. **API budget: resolved** by D-16: at most $20/month; seek lower actual cost. Still choose provider/API access and selected/surrounding context policy. Hosting/storage allowance remains open.
4. **Device needs: resolved** by D-13: computers only; browser details can be established during testing.
5. **Connectivity: resolved** by D-13: online use; preserve unsaved writing during connection failures without building a full offline system.
6. **Editor: resolved** by D-12: Obsidian-like Markdown feel. Proposed: source plus live preview, LaTeX math, and documented metadata for images and PDF anchors. No Obsidian plugin compatibility commitment.

### Resolve during UI and workflow design

7. **Visual references: resolved** by D-15: owner embeds plus AI-created explanations/diagrams. Automatic image search is not part of the clarified requirement. Light/dark preference and exact notebook styling can be resolved with the prototype.
8. **Completion:** what counts as doing a goal: manually checking it, writing an entry, or recording an amount? Should history show simple checkmarks, minutes/counts, or weekly frequency? Proposed: manual checkmarks and basic date history.
9. **Daily reflection:** a separate overall reflection in addition to subject entries, or should the subject entries together constitute the journal? Any prompts you already use?
10. **Customization:** rename/add/reorder/archive goals and notebooks in the first release, or begin with the five named subjects?
11. **Art layout:** rectangular images with left/right text wrap and resizing, or overlapping scrapbook elements and free positioning? Are captions and source links important initially? Mobile upload is out of scope.
12. **Science behavior:** one paper per entry, multiple papers per entry, or a persistent paper notebook revisited across days? Should AI preview before insertion, and should explanations support follow-up questions?
13. **Gym and reading:** freeform notes initially, or structured sets/reps/weights and book/page tracking from day one?

### Resolve before publishing and release

14. **Blog voice:** informal learning diary, polished tutorial, or a choice per post? Desired length and amount of AI rewriting? Should AI-added context be included or only material explicitly in the notes?
15. **Blog delivery: resolved** by D-18: create/update a GitHub PR for owner review. Still decide the portfolio renderer changes needed for images, links, math, and generated diagrams.
16. **Public assets:** should art images appear by default when their entries are selected, or be opted in individually? How should reference-art attribution appear?
17. **Data lifecycle:** preferred export format, backup expectations, and deletion recovery period? Any existing notes to import?
18. **Release ordering: resolved** by D-17: journaling/science, immediately followed by portfolio integration and the project-purpose post, then complete art workflow.

## Working assumptions (not confirmed)

- Journals and assets are private by default; blog publication uses an explicit selected snapshot.
- Markdown preference is confirmed; source plus live preview, math syntax, and layout metadata are proposed implementation details.
- Activities are manually checked; no streaks or punitive overdue states.
- AI explanations are previewed before insertion and remain editable afterward.
- Persistent subject notebooks are confirmed; exact paper-to-entry relationships across days remain proposed.
- Hosting, database, authentication, editor framework, and model provider remain undecided.

Record subsequent answers here, update the contract, and flag any changed milestone scope in the roadmap.

## AI access investigation

Checked September 22, 2026: OpenAI documents API usage pricing separately in its [API pricing documentation](https://developers.openai.com/api/docs/pricing). Gemini documents project-based free and paid API tiers in its [API billing documentation](https://ai.google.dev/gemini-api/docs/billing). Existing consumer subscriptions are not sufficient evidence of available app API credits. No account-specific entitlement has been inspected. The owner subsequently set an API ceiling of $20/month; select a provider and validate current prices before paid setup.

Before implementing hosted generation, settle provider/API access and applicable data handling, and implement the shared spending controls in COST-01. Prefer app-rendered structured math/diagrams where suitable and evaluate model quality on the supplied equation before choosing the least expensive adequate option. A manual copy/paste workflow with an existing chat app remains a fallback, not fulfillment of the integrated feature.
