# Implementation roadmap

Release order is confirmed: UI and daily journaling/science first, portfolio integration immediately next, complete art tools afterward. Technical details below are proposed, not a delivery-date commitment. Keep each milestone small enough to review against real personal use.

The subsequently approved V1 plan fixes the stack and release gate; [implementation status](IMPLEMENTATION-STATUS.md) tracks its execution. The historical proposals below are retained as planning context. In particular, complete art wrapping is deferred and is not a V1 exit condition. Hosted sync and real AI are mandatory release checks.

## 0. Requirements foundation — completed

- Capture the initial brief, confirmed answers, open questions, and future experiments.
- Inspect the portfolio's current content/rendering path.
- Establish documentation and ignore rules without committing to an application stack.

## 1. Interface and editor proof

- Use confirmed subject notebooks plus Today, computer-only online use, and Obsidian-like Markdown editing. Refine theme details through the prototype.
- Prototype Today, science split view, and art composition with synthetic content.
- Prove text wrapping around resizable images and persistent PDF highlight links before selecting an editor.
- Review distinct notebook identities with the owner; settle keyboard and small-computer-window behavior.

Exit: the owner accepts the main interaction direction and the editor supports both specialized layouts without losing content on save/reload.

## 2. Private journaling foundation

- Choose hosting, authentication, storage, and database based on sync/privacy/budget answers.
- Implement owner-only access, notebook/entry storage, daily reflection, manual goal checks, and simple date history.
- Add asset persistence, visible save/sync states, recoverable concurrent edits, and export/restore.

Exit: write on one device, reopen on another, and recover from a failed save without losing notes. Unauthenticated requests cannot access journal content or assets.

## 3. Scientific reading and explanations

- Implement PDF import, split view, selections/highlights, and durable source links.
- Use the supplied attention paper, including page 4 equation (1), to validate extraction and equation-region support; defer general scanned-PDF OCR.
- Include science reference-image embeds and source-linked PDF regions; preserve source context in notes.
- Add explanation generation, legible math, source attribution, editable insertion, cancellation, and failure recovery.
- Add explicitly requested AI-created equation decompositions and diagrams with preview, editable structured source where practical, and persistent embeds.
- Evaluate economical models on the sample's equation accuracy and visual explanations. Implement a shared $20/month API budget ledger and pre-request reservations; favor structured rendering and small selected contexts to reduce cost.

Exit: an owner-selected difficult equation has a useful reviewed explanation in the notebook and a working link back to its source after reload and sync. The owner can use the journal and science workflow daily.

## 4. Portfolio integration and first project post — immediate next feature

- Implement date/notebook selection and exact source preview.
- Generate editable drafts with takeaways and individually reviewable assets.
- Implement the selected GitHub PR delivery path; decide rich-content representation and implement the adapter and agreed renderer changes.
- Preserve draft edits, PR URLs and retry identity; distinguish review, merge, deployment, and verified live status. No auto-merge.
- Use the [first project-post draft](drafts/first-project-post.md) for the first publication; refresh implementation status before owner review. It describes the project's purpose and planned workflow without claiming unfinished features are live.

Exit: selected entries become an edited, explicitly published portfolio post; unselected private material never enters the generation request or public artifact.

## 5. Complete art workflow

- Finish image drag/drop/paste, wrap alignment, resizing, captions, and source attribution.
- Preserve layout metadata alongside Markdown and verify multi-image entries, smaller computer windows, and synced assets.

Exit: the owner can compose and reopen an art journal entry with prose wrapping around images in the intended arrangement.

## Later experiments

Advanced activity history, proactive gym research/video suggestions, WHOOP import, and bounded autonomous assistance. Define each experiment's value and data access separately when requested.

## Verification strategy

Use focused integration and browser tests for data persistence, cross-device sync, authorization, PDF anchors, draft source selection, and duplicate-safe publishing. Review notebook visuals with the owner. Evaluate AI explanations against representative papers for notation accuracy, useful steps, assumptions, and clear uncertainty; generation success alone is insufficient. Exercise export/restore with attachments and annotations before relying on the app for irreplaceable notes.
