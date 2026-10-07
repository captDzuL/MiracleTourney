# V3 database cutover preflight — updated 5 October 2026

Status: **BLOCKED**. This is evidence and a future human-controlled procedure,
not authorization to deploy or mutate production. Candidate branch
`codex/public-event-overview-v3`; PR target `feature/ui/release/1.0`; actual
production Git branch `master`. Admin-wide UI migration is deferred. The
final candidate SHA and remote CI/preview results are pending.

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
- Read-only Vercel inspection refreshed 2026-10-05 confirmed project
  `miracle-tourney` (`prj_QHv1i060yrRIq6miqOmGodoULhCY`, scope
  `miracle25`), production branch `master`, and the active override
  `if [ "$VERCEL_ENV" = "production" ]; then pnpm prisma migrate deploy; fi && pnpm build`.
  Removing migration from the repository build script does not change this
  platform override. Its correction requires a separate Dzul cutover decision.
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

Two later migrations extend this chain, so the current candidate has **21 pending
migrations** (38 files in total):

20. `20261004000000_event_bracket_appearance`
21. `20261007010000_reconcile_schema_drift` — idempotent. Production already has the five
    tables and five indexes that earlier models declared outside the migration history
    (`OrganizerPlan`, `EventPromotion`, `EventAnalyticsSnapshot`, `Notification`,
    `CheckIn`; `Event_status_idx`, `Match_eventId_status_idx`, `Player_teamId_idx`,
    `Player_eventId_idx`, `PlayerStat_matchId_idx`), so on production it skips them and only
    renames 14 composite foreign keys and drops two `updatedAt` defaults
    (`EventVisualAsset`, `RateLimitBucket`). On a database rebuilt from migrations it creates the
    missing objects. It was rehearsed on a schema-only copy of the production `public` schema read
    through the Neon schema API on 7 October (17 applied, 21 applied afterwards, `prisma migrate diff`
    empty) and on an empty database; a CI job now fails on any drift.

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

## Earlier Neon child exploration — 3 October

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

That child exploration stopped before Prisma migration or restore. It did not
measure upgrade/no-op, backfill, restore integrity, migration duration, or
service recovery time. The child is retained; cleanup remains a separate
resource decision. The later local rehearsal below supplies different,
bounded evidence and does not rewrite the child result.

## Actual encrypted-backup and local recovery evidence — 5 October

The existing production-derived, encrypted archive
`E:/MiracleBackups/miracle-neondb-2026-10-05T01-23-48-741Z.age` is 175,055
bytes with SHA-256
`dc30ddf3ae4bb98dacd9d68e293b26cef5a3818664364c405c01d578cf1d7f5b`.
The reviewed one-time local rehearsal completed at
`2026-10-05T04:38:49.8211130Z` with exit 0 in 75,046 ms. It performed one
guarded source reference check and two independent restores into a stopped,
isolated local PostgreSQL 18 cluster. Both restores matched all 23 tables,
2,036 rows, named-column values, logical column types/nullability, migration
ledger, and integrity checks. Baseline and candidate restore segments were
359 ms and 444 ms. Original physical ordinal and record-text hash differences
on four tables were retained as representation differences after the logical
comparisons passed; these are not silently called source data loss.

The candidate started with 17 applied/19 pending/zero unfinished migrations.
The first checked-in Prisma migration deployment exited 0 in 14,074 ms and
ended with 36 applied/zero pending/zero unfinished. Certificate backfill and
constraints, session version, reset-token uniqueness, and rate-limit bucket
checks passed. Synthetic certificate/session/reset/limiter SQL flows passed
inside rolled-back transactions. The second deployment exited 0 in 1,123 ms
with an unchanged ledger. No email, Blob, external app, production migration,
shared-test write, seed, or reset was performed. The private local cluster is
stopped, with no listener on its rehearsal port; its data remains sensitive
and retained for the owner. The full source locale/extension equivalence and
the exact record-text platform mechanism remain unproved.

These are local segments, not production recovery-time measurements. Dzul's
RPO at most one hour and RTO at most 30 minutes are targets, not achieved
service metrics. Weekly backup remains **PAUSED**. The current backup CLI is
bound to the pre-V3 17-applied migration and physical-schema contract; it
fails closed after source migration until a reviewed post-V3 contract is
supplied. Activation also requires durable reviewed runtime/script paths
independent of this removable worktree. Do not mistake a saved archive for a
fresh cutover checkpoint.

The local rehearsal runner is a one-time, source-anchored release proof for
this exact archive. Its full mode requires the **current** production source
to still match the old immutable checkpoint so it can build an ephemeral
reference. It is not a generic emergency restore entrypoint if production is
down, changed, or migrated. An incident recovery procedure must identify a
prevalidated immutable archive by hash, authenticate/decrypt it with reviewed
tools, restore into an isolated target, compare retained integrity evidence,
and obtain the owner's loss/switchover decision. It must not prescribe
rerunning this source-anchored validator as an incident prerequisite.

The production dependency audit initially failed on 2026-10-05 (exit 1,
six advisories: three high, two moderate, one low) in locked
`brace-expansion@5.0.9` and `undici@6.28.0`. Scoped patch releases
`brace-expansion@5.0.12` and `undici@6.28.1` were committed at `e0b55bd`;
frozen install and 11 focused tests passed, and the subsequent
`pnpm audit --prod` exited 0 with no known vulnerabilities. This records
the resolved audit evidence, not an exploitability assessment or a waiver.

## Required before production cutover

1. Dzul and the recovery PIC agree the write/traffic pause, stop criteria,
   backup retention, RPO/RTO targets, and acceptable loss before a cutover
   window. Check current source schema, 17-applied baseline, zero unfinished
   migrations, duplicate reset-user groups, and certificate compatibility.
2. Separately approve and correct the live Vercel production build override
   so a build cannot start `prisma migrate deploy`. Verify the effective
   override before any production deployment. A repository script change
   alone does not satisfy this gate.
3. At cutover, pause incompatible old certificate/reset writers and other
   writes under the agreed procedure. Take a **fresh** authorized production
   backup/checkpoint after the pause and verify its authentication, retained
   identity, recoverability and measured timing. The 5 October archive and
   local rehearsal cannot substitute for a fresh recovery point.
4. With a separate explicit production migration decision, apply the 21
   pending migrations once while writes remain paused. Stop on any unknown
   status; do not blindly retry, seed, reset, or run a down migration. Verify
   38 applied/zero pending/zero unfinished, the certificate/session/reset/
   limiter constraints, and critical row counts before the app switch. Also
   run `prisma migrate diff --from-url <production> --to-schema-datamodel
   prisma/schema.prisma --script --exit-code` against the migrated database: it
   must exit 0. (Earlier rehearsal figures of 36 and 37 applied predate the
   bracket-appearance and reconcile migrations.)
5. Switch only to a validated schema-compatible application artifact, then
   test ID/EN public flows, authentication/session/reset, certificates,
   writes, flags-off paths and logs. Resume writers only after the release
   and recovery PICs approve the observed state. Never promote a preview
   connected to a test database onto production aliases.
6. On failure, preserve the current state and decide with the recovery PIC.
   The old `a742c300` certificate/reset writers are incompatible with the
   migrated schema and digest-token behavior, so an app-only rollback to that
   SHA is not a safe promise. A Vercel rollback changes only application
   code. If data restore is needed, quantify post-checkpoint writes that
   would be lost, restore to a new isolated branch, verify it, and require a
   separate human switchover decision. No production restore, alias switch,
   or down migration is authorized by this runbook.
7. Before activating weekly backups after migration, review a post-V3
   backup contract, test its restore, and pin durable runner/tool paths outside
   a removable worktree. Keep the weekly job paused until those checks pass.

References: [Neon snapshots](https://neon.com/blog/three-ways-to-use-your-snapshots),
[create-snapshot API](https://api-docs.neon.tech/reference/createsnapshot),
and the candidate's migration SQL. Full safe local evidence is retained in
`.superpowers/sdd/2026-10-03-v3-go-live/task-3-static-report.md` and
`task-3-runtime-report.md`.
