# V3 database cutover preflight — 3 October 2026

Status: **BLOCKED**. This is evidence and a future human-controlled procedure,
not authorization to deploy or mutate production. Candidate baseline
`71970cf`; PR target `feature/ui/release/1.0`; actual production Git branch
`master`. Admin-wide UI migration is deferred.

## Verified state

- Neon project `steep-tree-47893196`; production `br-rough-mountain-azfdh3db`.
  Shared test `br-young-thunder-az5w6nt3` was not changed.
- Production has 17 successfully applied migrations through
  `20260903000000_certificate_status_tracking`, versus 36 candidate files:
  **19 pending migrations**. Historical rolled-back entries have a subsequent
  success; no unfinished unrolled-back migration was returned.
- Aggregate preconditions: six legacy certificates and zero duplicate
  `PasswordResetToken.userId` groups. No user rows or secrets were inspected.
- PITR history: six hours. Snapshot list and production schedule were empty.
  A history window alone does not preserve a release checkpoint indefinitely.
- Vercel override runs production `prisma migrate deploy` before `pnpm build`.
  Old production serves traffic while this schema change occurs.
- Active artifact `dpl_DgUjgWS4WivtPbhDvPPwqbq95P7Q`, SHA `a742c300`, READY;
  bounded ID/EN GETs returned HTTP 200. This is basic availability, not a
  validated functional rollback artifact.

## Full pending chain

Apply and validate the entire chain on an isolated child, not only the reset
and limiter migrations. Do not edit previously applied SQL.

1. `20260905010000_v3_event_lifecycle`
2. `20260905011000_v3_event_draft_idempotency`
3. `20260905012000_v3_format_config`
4. `20260908020000_platform_profile_and_forced_password`
5. `20260909010000_published_event_revision_v3`
6. `20260910150000_add_captain_game_identity`
7. `20260912000000_competition_operations_v3_foundation`
8. `202609120001_competition_operation_versions`
9. `20260912010000_v3_completion_certificates`
10. `20260912030000_announcement_urgency`
11. `20260912040000_match_actual_timing`
12. `20260912180000_certificate_studio_claims`
13. `20260912191000_certificate_snapshot_mutations`
14. `20260912205500_certificate_mutation_leases`
15. `20260912233000_certificate_render_manifest`
16. `20260913010000_completion_transaction_adapter`
17. `20260914090000_add_event_payment_settings`
18. `20260921000000_add_user_session_version`
19. `20260924000000_add_rate_limit_buckets`

The files do not drop tables or columns or delete rows. Completion rewrites
existing certificate rows and removes their event-level unique index.
Ordinary indexes and table alterations still have lock/duration risks.
Partial DDL failure must not trigger a blind retry or database reset.

## Compatibility blockers

Completion backfills recipient/verification fields before `NOT NULL`, but
removes unique `Certificate.eventId` and permits multiple certificates per
event. Old SHA `a742c300` upsert/findUnique-by-event code and old inserts
without recipient fields are not compatible. App-only rollback to that SHA
after migration is not a supported recovery decision.

Old reset code cannot consume new digest tokens and ignores session-version
revocation. Fresh reset links and a security-aware rollback strategy are
required; do not weaken token/session checks. Recheck duplicate reset-user
groups immediately before the unique index, with concurrent writers controlled.

## Rehearsal actually performed

Created and retained production-derived child `br-shy-bird-azhvhia7`, source
timestamp `2026-10-03T11:01:37Z`, and endpoint `ep-shy-frog-az7dhld2`
(0.25–1 CU). Child aggregate/schema baseline matches the pre-V3 state.
Later metadata read reports the owned compute idle/suspended since
`2026-10-03T11:09:17Z`; no existing endpoint was changed.
All 17 applied migration SQL contents match the repository after accounting
for Windows CRLF versus database LF checksums; this is not a drift audit.

Child-only snapshot calls returned exactly `INVALID_ARGUMENT`, both with
seven-day expiry and without expiry. Snapshot list remained empty. The cause
is unresolved: current [Neon plan docs](https://neon.com/docs/introduction/plans)
allow one Free manual snapshot, so plan exclusion is not proven. Dashboard
fallback required an unavailable login session.

**Stopped before Prisma migration or restore.** No upgrade/no-op, backfill,
restore integrity, migration duration or RTO is claimed. Production and
shared test were untouched. Preserve the child for an approved next attempt;
cleanup is a separate explicit resource decision.

## Required before production cutover

1. Agree recovery PIC, RPO (acceptable data loss), RTO (recovery duration),
   retention, stop criteria, and the write/traffic handling window.
2. Resolve checkpoint creation and verify restore into a **new isolated
   branch**. Create a fresh authorized production recovery point close to the
   actual release; rehearsal copies do not constitute a current backup.
3. On a verified child-only direct connection, run all 19 pending Prisma
   migrations without seed/reset. Verify 36 successful entries, no unresolved
   failure, required columns/constraints, non-null and unique certificate
   backfill, unchanged unrelated aggregate counts, and clean no-op re-run.
4. Compare an independently restored branch's schema, migration checksums
   and aggregate counts with the pre-migration baseline. Record actual times.
5. Obtain separate authorization for the production build/cutover changes.
   Do not let the current automatic production migration precede a compatible
   app without an agreed write-control strategy. Never promote a test-DB
   preview onto production aliases.
6. Validate the exact compatible app recovery artifact and flag-off behavior.
   `vercel rollback <validated-deployment-id>` changes the app, not the
   database. Do not use down-migrations as a data backup.
7. If recovery requires restoring a checkpoint, quantify all writes after
   that point that would be lost, restore to a new branch first, verify data,
   and require a human switchover decision. No production restore or alias
   switch is authorized here.

References: [Neon snapshots](https://neon.com/blog/three-ways-to-use-your-snapshots),
[create-snapshot API](https://api-docs.neon.tech/reference/createsnapshot),
and the candidate's migration SQL. Full safe local evidence is retained in
`.superpowers/sdd/2026-10-03-v3-go-live/task-3-static-report.md` and
`task-3-runtime-report.md`.
