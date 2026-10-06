# Reading log

The Reading Quick Link and notebook card open the approved four-column log: **Book title, Minutes, Date, Notes**. Sessions sort by date descending, then creation time descending, so editing notes does not reorder a day's sessions. The same book can have several sessions on one day.

Use **Log reading** to enter a title, optional author, whole minutes (1–1440), a date no later than today, and an optional note. Recent titles appear as suggestions. Expand a row for the existing Markdown editor, formatting toolbar, labels, guide, and previous note versions. **Edit log** corrects book details, minutes, or the session date. The log always shows all sessions, newest dates first, without a search field or sorting label. The footer totals all sessions. Old search parameters are removed from shared log URLs while retaining links to expanded notes.

Older daily Reading pages remain under **Earlier notes**, with unchanged IDs, dates, contents, labels, and revisions. **All pages** retains the existing index, label filters, and label management. Historical entry links open their intended original page or expand the corresponding reading session. New notebooks can choose Reading log at creation; renaming a notebook does not change its layout.

## Persistence and compatibility

Reading sessions use the existing account-backed `entry` envelope and revision-checked save RPC. The optional `reading` object contains `minutes`, `author`, and immutable `createdAt`. The entry's title is the book title; its date is the reading date. A persisted notebook `reading` flag selects the layout. Multiple reading sessions are excluded from the ordinary one-entry-per-notebook/day constraint. No new table or record kind is needed.

Reading minutes are independent of Today work hours. Only saved note body words contribute to existing five-word goals. Backdating reading or changing minutes does not move or invent writing credit. Drafts retain the writing day across midnight. Imports never earn writing credit.

Unsubmitted forms keep browser recovery slots, separate for each window. Saved sessions sync through Supabase. Lost responses retry the same session ID; revision conflicts preserve both versions. Metadata forms also retain their original values so a refreshed remote change cannot silently be overwritten. Recovery storage is temporary crash recovery, not cross-device sync: click **Save log** before leaving a new session.

Backups export manifest version 4, including reading metadata and useful Markdown exports. Versions 1–3 remain accepted. Restoring version 4 keeps same-day sessions separate; older clients reject the newer format instead of merging those sessions. Existing private storage identities and owner access checks are unchanged.

## Rollout and verification

Apply `supabase/migrations/20261006042600_reading_log.sql` before deploying the frontend. It pins Reading's layout while preserving all earlier notes and notebook identities, and retains the prior notebook revision. The migration updates validation, daily uniqueness, revision-checked entry saving, and archive restoration. No entries, papers, activity, or work hours are deleted or reset.

Verified using Node 24:

- 100 unit tests; 42 PostgreSQL behavior checks via PGlite.
- Browser workflows for multiple sessions per day, newest-day ordering, backdating, inline minutes/author edits, expandable Markdown notes, deep links, obsolete search URLs, legacy pages, recovery, midnight rollover, and notebook isolation.
- Two isolated browser profiles using the production service path and real PostgreSQL RPCs verify cross-device persistence, lost-response retries, stale-write conflicts, recovery after failed saves, and conflicting metadata changes. Authentication and HTTP transport are synthetic; these tests create no hosted user data.
- Full existing browser regression suite, production authentication-gate checks, production build, and Edge Function type check. The optional private attention-PDF fixture remains skipped when unavailable.
- Rendered screenshots reviewed at 640, 1024, and 1440 pixels, including table columns, quick-add, and expanded notes. Narrow tables scroll internally without widening the app shell.

Hosted migration/deployment verification is recorded with the release. The separate Supabase production-origin configuration task is outside this change.

The hosted migration was applied on October 5, 2026 (Pacific), recorded by Supabase as `20261006044134_reading_log`; it corresponds to the local file above. Do not replay it solely to reconcile the generated timestamp. Hosted inspection confirmed the Reading layout, updated daily index, and unchanged API privilege boundaries. All 11 hosted access-denial/Auth checks passed after migration. The security advisor findings were unchanged from the pre-migration baseline.
