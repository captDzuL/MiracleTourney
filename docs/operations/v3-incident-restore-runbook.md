# Incident restore runbook and post-V3 backup contract — 7 October 2026

Status: **procedure and specification only; nothing here has been executed.** Restoring
means changing what production serves. Every step that creates a branch, repoints
`DATABASE_URL`/`DIRECT_URL`, or deploys needs separate explicit approval from the owner
at the time. The production Neon branch `br-rough-mountain-azfdh3db` is never
overwritten, reset or deleted by this procedure. Companion documents:
`v3-cutover-runbook.md`, `local-encrypted-backup.md`, `2026-10-03-v3-migration-preflight.md`.

Facts this relies on (read-only checks, 2026-10-07): Neon project `steep-tree-47893196`,
PostgreSQL 18, Free plan, **6 hours** of point-in-time history, branches production,
test, `codex-rehearsal`, dev. The scheduled backup is PAUSED and the only retained
export is the pre-V3 archive of 2026-10-05.

## 1. Decide before touching anything

Answer these in the incident log first, with the owner:

1. **What broke?** Wrong data (a bad write, a bad migration), a damaged schema, or only
   the application (bad deploy, a flag). Only the first two need a restore. An
   application fault is fixed by turning flags off and redeploying; do not restore a
   database for it.
2. **When did it start?** The restore target time is the last moment known to be good.
3. **How much can be lost?** A restore discards every write after the target time
   (registrations, scores, certificates). The owner accepts that trade-off in writing
   before step 3.
4. **Is the history window still open?** Point-in-time restore only reaches 6 hours
   back. Past that, the only source is the last exported archive.

## 2. Freeze

- Stop writes: take the site to read-only or maintenance if the app has that switch;
  otherwise tell organizers to stop and turn off the V3 flags so no new V3 write path is
  open (flag change plus redeploy, owner approval).
- Do not delete, reset or "fix forward" anything in the production branch yet. Capture
  the current state: note the time, the deployed SHA and the migration status
  (`prisma migrate status` against production, read-only).

## 3. Restore into a new branch

1. In Neon (console, or the API with `parent_timestamp`), create a **new child branch**
   of production at the chosen time (point-in-time). Name it
   `restore-YYYYMMDD-HHMM-incident`. If the 6-hour window is gone, create an empty
   branch and load the last verified archive with `pg_restore` instead (see section 6 for
   what that archive does and does not contain).
2. Keep the production branch running and untouched. The restore branch has its own
   connection strings; copy them into a local, ignored env file, never into chat,
   Git or logs.

## 4. Verify the restore branch (read-only)

Do all of these against the restore branch, none against production:

1. `pnpm exec prisma migrate status` → expected ledger for the target time (38 applied,
   0 pending after V3; 17 before).
2. `pnpm exec prisma migrate diff --from-url "$RESTORE_DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script --exit-code`
   → exit 0 once the schema is at 38. (Before V3: expect exit 2; this is not a failure.)
3. Physical catalog against the reference produced by CI:
   `CATALOG_DATABASE_URL="$RESTORE_DIRECT_URL" pnpm ops:catalog-postcheck compare catalog-reference-pg18.json`
   The reference is the `catalog-reference-pg18` artifact of the CI run for the release
   SHA. Exit 0 expected. Known physical differences of production (verified locally
   against a copy of the production schema, 7 Oct): `Match_eventId_round_slot_key` is a
   unique **index** in production but a unique **constraint** when built from
   migrations, and production has an extra function `show_db_tree` in `public`. Both are
   harmless to the application (nothing references them by name) and are the only
   differences allowed; anything else is a stop.
4. Row sanity against what you recorded in step 2 of section 2 and the last backup
   manifest: counts of `User`, `Event`, `Team`, `Match`, `Certificate`; the newest
   `Event.updatedAt` and `Match.updatedAt` is not later than the restore target.
5. Point a **preview** deployment (never production) at the restore branch and smoke
   test: home, an event page, bracket, organizer sign-in.

If any check fails, the restore branch is discarded and the owner decides the next step;
do not "repair" it in place and switch to it anyway.

## 5. Switch over (owner decision)

Switching means the application stops using the damaged production branch. Two ways;
the owner picks:

- **Repoint the application** to the restore branch: change `DATABASE_URL` and
  `DIRECT_URL` for the production target to the restore branch's strings, redeploy with
  the V3 flags still off, smoke test, then enable flags in the order of
  `v3-feature-flag-matrix.md`. Keep the damaged branch for forensics for as long as the
  owner wants; it is not deleted by this procedure.
- **Promote the restore branch** to be Neon's primary/production branch if the Neon
  plan allows it. The same smoke and flag order apply. Connection strings may change;
  check them rather than assuming.

After the switch: write down what was lost (writes between the target time and the
freeze) and tell the affected organizers; run section 4 once more against the live
branch, read-only.

## 6. Post-V3 backup contract (specification)

The existing contract in `local-encrypted-backup.md` and
`scripts/operations/local-backup-snapshot.mjs` was written for the **pre-V3** schema and
must not be used as evidence for a V3 backup:

| Item | Pre-V3 contract (existing) | Post-V3 contract (to implement) |
| --- | --- | --- |
| Applied migrations | exactly the 17 through `20260903000000_certificate_status_tracking` | exactly 38, with the same checksum rule, ending at `20261007010000_reconcile_schema_drift` |
| Tables in `public` | 23 model tables plus `_prisma_migrations` | 49 model tables plus `_prisma_migrations` (50) |
| Physical check | selected columns and four unique indexes | full catalog comparison (`catalog-postcheck`) against the CI reference, with the two allowed production differences of section 4 |
| Row checks | `LEGACY_TABLES` counts and MD5 | counts and MD5 for every model table, taken in the same snapshot |
| Schedule | weekly, PAUSED | stays PAUSED until the owner approves activation |

Until the runner is updated and a post-V3 export has been taken and verified by a
restore rehearsal on a child branch, the cutover must treat Neon point-in-time history
(6 hours) plus a manual checkpoint as the only recovery path. A history window alone does
not preserve a release checkpoint indefinitely.

## 7. After the incident

Record: timeline, target time, data lost, which checks passed, who approved each
switch. Fix the cause before re-enabling flags. Re-run the cutover preconditions
(`v3-cutover-runbook.md`) from the start, not from the middle.
