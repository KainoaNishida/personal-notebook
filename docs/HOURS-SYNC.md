# Work hours synchronization

The October 5 report (21:25:30 on the original device, 18:18:21 elsewhere) was caused by browser-only storage. The latter was the fixed opening balance; 3:07:09 of daily work had never reached Supabase.

## Behavior

- `work_time` records store one account-owned day with independent `actualSeconds` and `taskInput` fields. The 18:18:21 opening balance, October 2 cutoff, $80/hour earnings calculation, and ×7 maximum-time calculation are unchanged.
- `save_work_time` serializes owner writes, compares the previous field value, and updates through the existing revision/history service. Different-field edits merge; conflicting same-field edits require an explicit choice. Repeated requests and imports never add a day twice. Clearing actual time records zero so an old device cannot silently repopulate it.
- Today imports old browser logs automatically. It leaves the original keys intact and marks each imported value only after acknowledgment. Different legacy/account values show both versions with a choice. Never solve this by changing the opening balance or adding two device totals together.
- Pending writes have independent recovery slots, survive reload and midnight with their original dates, and drain edits made during a save. Account data refreshes on focus, reconnect, return from sleep, and every 20 seconds. The UI distinguishes loading, pending, synced, failed, and conflicting values. This is recovery for interrupted saves, not a full offline application.
- ZIP manifests now use version 3; versions 1 and 2 remain readable. Work-day restoration fills missing days/fields, deduplicates equal values, and rejects differing values atomically. Export is blocked until pending writing and hours are resolved, including legacy hours on a browser that opens Settings before Today.

## Rollout

Local migration `20261006015111_sync_work_time.sql` was applied before the frontend release. Supabase recorded it as `20261006020406_sync_work_time`; do not replay it merely to reconcile timestamps. This adds a kind, index, validation trigger, and owner-checked RPC, and extends archive restoration. Existing notes, activity, research, identities, and appearance are unchanged.

After release, open Today on the **original device/browser containing the higher total**, wait for **Hours synced**, then reload the other device. A server migration cannot recover browser-only data until that browser connects. Do not clear its browser data before importing. If a conflict appears, compare the daily values shown rather than the all-time opening balance.

## Verification

Node 24.21.0: 96 unit tests, 36 PostgreSQL behavior checks, TypeScript and production build passed. All 20 applicable browser workflows passed (19 existing workflows plus the new isolated-device workflow); one optional private-PDF fixture is skipped. Final affected hours and archive workflows passed again after review. Production-build authentication checks and the Edge Function type check passed.

The new browser workflow runs two isolated browser profiles through the application's non-demo Supabase service and real PostgreSQL migrations/RPC using a local PGlite database. Only HTTP transport and authentication are synthetic. It verifies the exact 21:25:30 import, task-list migration, two-way edits, conflicting totals, and interrupted-save recovery. Unit tests also cover in-flight edits, lost responses, durable recovery, import deduplication, deliberate zero, invalid input, and incomplete exports. Narrow and desktop screenshots were reviewed.

Hosted migration verification used an owner transaction and rolled it back; no test hours were retained. Anonymous function execution remains denied and records retain owner RLS. The security advisor flags the new authenticated `SECURITY DEFINER` RPC, as it does the existing owner APIs; this is intentional, and owner checks, fixed search path, restricted grants, and private validation are verified. See the [advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Existing service-only tables without client policies and the disabled [leaked-password check](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) are unchanged.

Actual recovery of the owner's browser-only total still depends on opening that original browser after deployment. Local two-device verification is not a claim that the owner's original data has already been imported. The Graphite UI redesign and separate production-origin configuration issue are outside this fix.
