# Approved feedback implementation — September 23, 2026

This update implements the 21 approved items from the owner's feedback document. It supersedes the original dated-paper-entry and separate History/Papers navigation requirements.

| Item | Result |
| --- | --- |
| 1 | KaTeX runtime and CSS use the same version, fixing overlapping fractions. |
| 2 | Removed the PDF/notes dropdown. |
| 3 | Expand PDF hides notes; restore returns to the remembered split. Region selection has a distinct control. |
| 4 | Zoom centers the PDF horizontally and preserves the vertical reading position. |
| 5 | Tightened the page counter and arrows. |
| 6 | Selection actions appear only when there is a selection. |
| 7 | Each paper has one continuous note; migration combines dated notes chronologically and retains originals. |
| 8 | Divider supports dragging, arrow keys, reset, and remembered width. |
| 9 | Removed the reading-room label; paper titles are editable without changing PDF identity. |
| 10 | Paper notes start with the editor. Versions remain in a secondary disclosure below it. |
| 11 | Research notebook contains the paper library; older daily entries are inside their notebooks. Old routes still resolve. |
| 12 | Today reflection and the Life notebook use the same daily entry. Legacy nonempty reflections are migrated. |
| 13 | Removed slogans and hid the original seeded notebook taglines. Custom descriptions remain available. |
| 14 | Removed the private/just-for-you label. |
| 15 | Visible branding is Kai’s Journal. Existing URLs and recovery-storage keys are preserved. |
| 16 | Charcoal/orange default with synchronized main/accent color controls. |
| 17 | IBM Plex Sans for prose/UI, IBM Plex Mono for code/source, KaTeX fonts for equations. |
| 18 | Collapsible conflict review offers saved/window/merged versions. JSONB key order no longer causes false conflicts. |
| 19 | One daily entry per ordinary notebook, created on first edit. Database uniqueness protects concurrent creation. |
| 20 | Entry date and identity are immutable; text remains editable. |
| 21 | Inline/fenced code, language highlighting, indentation and copy; code is never executed. |

## Preservation and synchronization

Migration `20260923201135_journal_workflow.sql` preserves merged source records with `mergedInto` and saves prior versions. Previous versions also exposes recoverable local drafts belonging to consolidated originals or migrated reflections. Originals remain in the ZIP manifest. Restoring colliding entries appends distinct imported text and retains the imported original.

Hosted migration retained all 11 entry records and marked two as consolidated originals. No merge targets are missing. The one legacy reflection was empty, so no reflection text required migration. Two partial unique indexes enforce daily/paper identity. Older clients are asked to reload when trying to write to the retired reflection entity.

## Verification

- 36 Vitest tests passed, including Markdown safety, fraction rendering, code text, recovery, conflict resolution, and JSONB ordering.
- 24 PostgreSQL behavior checks passed using PGlite, including consolidation, preservation, immutable dates/PDF identity, restore collisions, authorization and AI budget concurrency.
- All seven Playwright workflows passed, including the owner's local attention PDF. Affected typography/layout and PDF workflows passed again after final CSS fixes.
- TypeScript and Vercel production builds passed.
- Hosted signed-in checks: Today and paper library load; continuous paper note opens; source link reaches page 4; PDF expansion/restoration and keyboard divider work; centered zoom verified from layout; prose font and fraction visually inspected. A temporary Today reflection saved to Supabase and appeared in Life; the temporary text was then cleared.

The security advisor reports expected deny-all tables and owner-checked SECURITY DEFINER RPCs. Leaked-password protection remains disabled on the existing free-tier setup; no paid upgrade was enabled. See [Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Independent-computer synchronization and actual browser zoom remain owner acceptance checks from the initial release.

The README remains the owner's requested single sentence. Portfolio publishing remains the next milestone.
